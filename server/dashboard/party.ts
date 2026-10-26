// Parties: a group of accounts moving and fighting together.
//
// - The LEADER walks to the party's goal area first; everyone else follows
//   the leader's actual position (so nobody arrives somewhere alone).
// - The TANK starts fighting first. Everyone else only fights while the tank
//   is in the area, fighting, and above `tankRetreatPct` HP.
// - The goal area must be safe for the LOWEST-level member.
// - `shouldSyncInGame` also mirrors the party into the game's own party
//   system (invite / accept / promote / leave). The game has no tank role.

import { randomUUID } from 'node:crypto'
import { areaLevel, isAreaSafeFor, parseArea, townOf } from '#shared/game-rules'
import type { Party, PartyGoal, PartySummary } from '#shared/types'
import type { PartyOpKey, CommandKey } from '../sao/protocol'
import type { Session } from './session'

const NUDGE_COOLDOWN_MS = 3000
const EDITABLE_FIELDS = ['name', 'memberIds', 'leaderId', 'tankId', 'tankRetreatPct', 'shouldSyncInGame'] as const

export type PartyChanges = Partial<Pick<Party, typeof EDITABLE_FIELDS[number]>>
type PartyResult = { party: Party, error?: undefined } | { error: string }

export function newParty(name: string): Party {
  return {
    id: randomUUID(),
    name: name || 'Party',
    memberIds: [],
    leaderId: null,
    tankId: null,
    isActive: false,
    goal: null,
    tankRetreatPct: 40,
    shouldSyncInGame: false,
  }
}

// Pure check for edits from the UI. Returns an error string or null.
export function validateParty(party: Party, parties: Pick<Party, 'id' | 'name' | 'memberIds'>[]): string | null {
  const memberSet = new Set(party.memberIds)
  if (memberSet.size !== party.memberIds.length) return 'A member is listed twice'
  for (const otherParty of parties) {
    if (otherParty.id === party.id) continue
    if (party.memberIds.some((memberId) => otherParty.memberIds.includes(memberId))) return `That account is already in party "${otherParty.name}"`
  }
  if (party.leaderId && !memberSet.has(party.leaderId)) return 'The leader must be a party member'
  if (party.tankId && !memberSet.has(party.tankId)) return 'The tank must be a party member'
  const retreatPct = Number(party.tankRetreatPct)
  if (!Number.isFinite(retreatPct) || retreatPct < 10 || retreatPct > 90) return 'Tank retreat HP must be 10–90%'
  return null
}

// The level check every goal must pass. Returns an error string or null.
export function goalSafetyError(goalAreaId: string | undefined, sessions: Session[]): string | null {
  const goalArea = parseArea(goalAreaId)
  if (!goalArea || !goalAreaId) return `Unknown area "${goalAreaId}"`
  for (const session of sessions) {
    const playerLevel = session.player?.level
    if (playerLevel == null) return `${session.name} is offline — can't check it's safe`
    if (goalArea.kind !== 'town' && !isAreaSafeFor(goalAreaId, playerLevel)) {
      return `${goalAreaId} is monster level ${areaLevel(goalAreaId)}; ${session.name} is only Lv${playerLevel}`
    }
  }
  return null
}

export class PartyManager {
  parties: Party[] = []
  private statusByPartyId = new Map<string, string>()
  private timer: ReturnType<typeof setInterval>
  private getSession: (accountId: string | null) => Session | undefined
  private save: () => void

  constructor({ getSession, save, tickMs = 2000 }: { getSession: (accountId: string) => Session | undefined, save: () => void, tickMs?: number }) {
    this.getSession = (accountId) => (accountId ? getSession(accountId) : undefined)
    this.save = save
    this.timer = setInterval(() => this.tickAll(), tickMs)
  }

  stop() { clearInterval(this.timer) }

  load(parties: Party[]) { this.parties = parties || []; this.refreshRoles() }

  byId(partyId: string) { return this.parties.find((party) => party.id === partyId) || null }
  sessionsOf(party: Party) { return party.memberIds.map((memberId) => this.getSession(memberId)).filter((session): session is Session => !!session) }
  private nameOf(accountId: string | null) { return this.getSession(accountId)?.name }

  create(name: unknown): Party {
    const trimmedName = String(name || '').trim().slice(0, 32)
    const party = newParty(trimmedName || `Party ${this.parties.length + 1}`)
    this.parties.push(party)
    this.persist()
    return party
  }

  async update(partyId: string, changes: PartyChanges): Promise<PartyResult> {
    const party = this.byId(partyId)
    if (!party) return { error: 'No such party' }
    const editedFields = EDITABLE_FIELDS.filter((field) => field in changes).map((field) => [field, changes[field]])
    const draft: Party = { ...party, ...Object.fromEntries(editedFields) }
    draft.memberIds = (draft.memberIds || []).filter((memberId) => this.getSession(memberId))
    if (draft.leaderId && !draft.memberIds.includes(draft.leaderId)) draft.leaderId = null
    if (draft.tankId && !draft.memberIds.includes(draft.tankId)) draft.tankId = null
    if (!draft.leaderId && draft.memberIds.length) draft.leaderId = draft.memberIds[0]!
    const validationError = validateParty(draft, this.parties)
    if (validationError) return { error: validationError }
    const hasLeaderChanged = draft.leaderId !== party.leaderId
    const previousLeaderId = party.leaderId
    Object.assign(party, draft)
    this.persist()
    if (party.isActive && party.shouldSyncInGame && hasLeaderChanged) {
      await this.sendFrom(party, previousLeaderId, 'promote', this.nameOf(party.leaderId))
    }
    return { party }
  }

  async remove(partyId: string): Promise<{ ok: true } | { error: string }> {
    const party = this.byId(partyId)
    if (!party) return { error: 'No such party' }
    if (party.isActive) await this.deactivate(partyId)
    this.parties = this.parties.filter((candidate) => candidate.id !== partyId)
    this.persist()
    return { ok: true }
  }

  dropAccount(accountId: string) {
    for (const party of this.parties) {
      if (!party.memberIds.includes(accountId)) continue
      party.memberIds = party.memberIds.filter((memberId) => memberId !== accountId)
      if (party.leaderId === accountId) party.leaderId = party.memberIds[0] ?? null
      if (party.tankId === accountId) party.tankId = null
      if (party.memberIds.length < 2) party.isActive = false
    }
    this.persist()
  }

  // Start the party. The goal defaults to "hunt where the leader is now".
  async activate(partyId: string, requestedGoal?: Partial<PartyGoal>): Promise<PartyResult> {
    const party = this.byId(partyId)
    if (!party) return { error: 'No such party' }
    if (party.memberIds.length < 2) return { error: 'A party needs at least 2 members' }
    const goalAreaId = requestedGoal?.areaId || this.getSession(party.leaderId)?.player?.areaId
    const safetyError = goalSafetyError(goalAreaId, this.sessionsOf(party))
    if (safetyError) return { error: safetyError }
    party.goal = { areaId: goalAreaId!, shouldHunt: requestedGoal?.shouldHunt ?? true }
    party.isActive = true
    this.persist()
    if (party.shouldSyncInGame) await this.syncCreate(party)
    return { party }
  }

  async setGoal(partyId: string, requestedGoal: Partial<PartyGoal>): Promise<PartyResult> {
    const party = this.byId(partyId)
    if (!party) return { error: 'No such party' }
    if (!party.isActive || !party.goal) return this.activate(partyId, requestedGoal)
    const goalAreaId = requestedGoal.areaId ?? party.goal.areaId
    const safetyError = goalSafetyError(goalAreaId, this.sessionsOf(party))
    if (safetyError) return { error: safetyError }
    party.goal = { areaId: goalAreaId, shouldHunt: requestedGoal.shouldHunt ?? party.goal.shouldHunt }
    this.persist()
    return { party }
  }

  async deactivate(partyId: string): Promise<PartyResult> {
    const party = this.byId(partyId)
    if (!party) return { error: 'No such party' }
    party.isActive = false
    this.persist()
    if (party.shouldSyncInGame) for (const memberId of party.memberIds) await this.sendFrom(party, memberId, 'leave')
    return { party }
  }

  // ---- in-game sync -------------------------------------------------------

  private async sendFrom(party: Party, accountId: string | null, opKey: PartyOpKey, name?: string) {
    const session = this.getSession(accountId)
    if (!session) return null
    const result = await session.client.sendPartyOp(opKey, name)
    session.log(result.ok ? 'cmd' : 'error', `party ${opKey}${name ? ` ${name}` : ''} → ${result.ok ? 'sent' : result.error}`, { source: `party:${party.name}` })
    return result
  }

  // Inviting is what creates a party in the game; there's no separate "create".
  private async syncCreate(party: Party) {
    const leaderName = this.nameOf(party.leaderId)
    for (const memberId of party.memberIds) {
      if (memberId === party.leaderId) continue
      await this.sendFrom(party, party.leaderId, 'invite', this.nameOf(memberId))
      await this.sendFrom(party, memberId, 'accept', leaderName)
    }
  }

  // ---- the follow/tank loop ----------------------------------------------

  private refreshRoles() {
    for (const party of this.parties) {
      for (const memberId of party.memberIds) {
        const session = this.getSession(memberId)
        if (!session) continue
        const roles = ([memberId === party.leaderId && 'leader', memberId === party.tankId && 'tank'] as const)
          .filter((role): role is 'leader' | 'tank' => !!role)
        session.partyRole = { partyId: party.id, partyName: party.name, roles: roles.length ? roles : ['member'], isActive: party.isActive }
      }
    }
  }

  private persist() { this.refreshRoles(); this.save() }

  private tickAll() {
    this.refreshRoles()
    for (const party of this.parties) {
      if (!party.isActive) { this.statusByPartyId.set(party.id, 'Off'); continue }
      try { this.statusByPartyId.set(party.id, this.tick(party)) } catch (error) { this.statusByPartyId.set(party.id, `Error: ${(error as Error).message}`) }
    }
  }

  // One coordination step; returns a status line. It never awaits: moves run
  // in the background under each account's own lock, so one slow bot can't
  // stall the others.
  private tick(party: Party): string {
    const members = this.sessionsOf(party)
    const leader = this.getSession(party.leaderId)
    if (!leader?.player || !leader.isConnected) return 'Waiting for the leader to connect'
    const offlineMembers = members.filter((member) => !member.isConnected || !member.player)
    if (offlineMembers.length) return `Waiting for ${offlineMembers.map((member) => member.name).join(', ')}`

    const goal = party.goal!
    const safetyError = goalSafetyError(goal.areaId, members)
    if (safetyError) {
      this.stopAllHunting(members)
      party.goal = { areaId: townOf(parseArea(goal.areaId)?.floor || 1), shouldHunt: false }
      return `Pulled back to town: ${safetyError}`
    }
    const haltedMember = members.find((member) => member.haltReason)
    if (haltedMember) { this.stopAllHunting(members); return `Holding — ${haltedMember.name} stopped itself (${haltedMember.haltReason})` }

    // 1. The leader goes to the goal; everyone else follows the leader.
    for (const member of members) {
      const isLeader = member === leader
      const targetAreaId = isLeader ? goal.areaId : leader.player.areaId
      if (member.player!.areaId === targetAreaId || member.busyLabel || member.isInBossFight) continue
      member.withLock(isLeader ? `party: lead to ${targetAreaId}` : `party: follow ${leader.name}`, () => member.goTo(targetAreaId))
    }
    if (!members.every((member) => member.player!.areaId === goal.areaId)) return `Moving to ${goal.areaId}`
    if (!goal.shouldHunt) { this.stopAllHunting(members); return `Holding at ${goal.areaId}` }

    // 2. The tank fights first; the rest fight only while the tank is up.
    const tank = this.getSession(party.tankId)
    const tankHpPct = tank?.hpPct()
    const isTankHealthy = tankHpPct == null || tankHpPct >= party.tankRetreatPct
    const isTankHolding = !tank || (tank.isHunting && isTankHealthy)
    if (tank && !tank.busyLabel && !tank.isHunting && isTankHealthy) this.nudge(tank, 'startHunt', party)
    for (const member of members) {
      if (member === tank || member.busyLabel) continue
      if (isTankHolding && !member.isHunting) this.nudge(member, 'startHunt', party)
      if (!isTankHolding && member.isHunting) this.nudge(member, 'stopHunt', party)
    }
    if (!isTankHolding) return `Tank ${tank!.name} is ${isTankHealthy ? 'not fighting' : `low (${tankHpPct}%)`} — others wait`
    return `Hunting at ${goal.areaId}`
  }

  private stopAllHunting(members: Session[]) {
    for (const member of members) if (member.isHunting && !member.busyLabel) this.nudge(member, 'stopHunt')
  }

  // Send a start/stop at most every 3 s per account: the game's state lags
  // the command, so without this every tick would re-send it.
  private nudge(session: Session, commandKey: CommandKey, party?: Party) {
    const currentTime = Date.now()
    const lastNudge = session.lastNudge
    if (lastNudge && lastNudge.commandKey === commandKey && currentTime - lastNudge.sentAt < NUDGE_COOLDOWN_MS) return
    session.lastNudge = { commandKey, sentAt: currentTime }
    session.command(commandKey, {}, party ? `party:${party.name}` : 'party')
  }

  summary(): PartySummary[] {
    return this.parties.map((party) => ({ ...party, status: this.statusByPartyId.get(party.id) || (party.isActive ? 'Starting…' : 'Off') }))
  }
}
