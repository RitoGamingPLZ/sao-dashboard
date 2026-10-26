// Parties: a group of accounts moving and fighting together.
//
// - The LEADER walks to the party's goal area first; everyone else follows
//   the leader's actual position (so nobody arrives somewhere alone).
// - The TANK starts fighting first. Everyone else only fights while the tank
//   is in the area, fighting, and above `tankRetreatPct` HP; otherwise they
//   stop and wait, so the tank soaks the danger. Each bot still runs its own
//   potion/health safety loop the whole time.
// - The goal area must be safe for the LOWEST-level member (spec §6.2 rule 2).
// - Optional `shouldSyncInGame` also mirrors the party into the game's own
//   party system using the (UNVERIFIED) party commands in protocol.js.

import { randomUUID } from 'node:crypto';
import { areaLevel, isAreaSafeFor, parseArea, townOf } from './game-rules.js';

const NUDGE_COOLDOWN_MS = 3000;
const EDITABLE_FIELDS = ['name', 'memberIds', 'leaderId', 'tankId', 'tankRetreatPct', 'shouldSyncInGame'];

export function newParty(name) {
  return {
    id: randomUUID(),
    name: name || 'Party',
    memberIds: [],
    leaderId: null,
    tankId: null,
    isActive: false,
    goal: null, // { areaId, shouldHunt }
    tankRetreatPct: 40,
    shouldSyncInGame: false,
  };
}

// Pure check for edits from the UI. Returns an error string or null.
export function validateParty(party, parties) {
  const memberSet = new Set(party.memberIds);
  if (memberSet.size !== party.memberIds.length) return 'A member is listed twice';
  for (const otherParty of parties) {
    if (otherParty.id === party.id) continue;
    const sharedMemberId = party.memberIds.find((memberId) => otherParty.memberIds.includes(memberId));
    if (sharedMemberId) return `That account is already in party "${otherParty.name}"`;
  }
  if (party.leaderId && !memberSet.has(party.leaderId)) return 'The leader must be a party member';
  if (party.tankId && !memberSet.has(party.tankId)) return 'The tank must be a party member';
  const retreatPct = Number(party.tankRetreatPct);
  if (!Number.isFinite(retreatPct) || retreatPct < 10 || retreatPct > 90) return 'Tank retreat HP must be 10–90%';
  return null;
}

// The level check every goal must pass. Returns an error string or null.
export function goalSafetyError(goalAreaId, sessions) {
  const goalArea = parseArea(goalAreaId);
  if (!goalArea) return `Unknown area "${goalAreaId}"`;
  for (const session of sessions) {
    const playerLevel = session.player?.level;
    if (playerLevel == null) return `${session.name} is offline — can't check it's safe`;
    if (goalArea.kind !== 'town' && !isAreaSafeFor(goalAreaId, playerLevel)) {
      return `${goalAreaId} is monster level ${areaLevel(goalAreaId)}; ${session.name} is only Lv${playerLevel}`;
    }
  }
  return null;
}

export class PartyManager {
  constructor({ getSession, save, tickMs = 2000 }) {
    this.getSession = getSession;
    this.save = save;
    this.parties = [];
    this.statusByPartyId = new Map();
    this.timer = setInterval(() => this.tickAll(), tickMs);
  }

  stop() { clearInterval(this.timer); }

  load(parties) { this.parties = parties || []; this.refreshRoles(); }

  byId(partyId) { return this.parties.find((party) => party.id === partyId) || null; }
  partyOf(accountId) { return this.parties.find((party) => party.memberIds.includes(accountId)) || null; }
  sessionsOf(party) { return party.memberIds.map((memberId) => this.getSession(memberId)).filter(Boolean); }
  nameOf(accountId) { const session = this.getSession(accountId); return session?.player?.name || session?.name; }

  create(name) {
    const trimmedName = String(name || '').trim().slice(0, 32);
    const party = newParty(trimmedName || `Party ${this.parties.length + 1}`);
    this.parties.push(party);
    this.persist();
    return party;
  }

  async update(partyId, changes) {
    const party = this.byId(partyId);
    if (!party) return { error: 'No such party' };
    const draft = { ...party };
    for (const field of EDITABLE_FIELDS) if (field in changes) draft[field] = changes[field];
    draft.memberIds = (draft.memberIds || []).filter((memberId) => this.getSession(memberId));
    if (draft.leaderId && !draft.memberIds.includes(draft.leaderId)) draft.leaderId = null;
    if (draft.tankId && !draft.memberIds.includes(draft.tankId)) draft.tankId = null;
    if (!draft.leaderId && draft.memberIds.length) draft.leaderId = draft.memberIds[0];
    const validationError = validateParty(draft, this.parties);
    if (validationError) return { error: validationError };
    const hasLeaderChanged = draft.leaderId !== party.leaderId;
    const hasTankChanged = draft.tankId !== party.tankId;
    Object.assign(party, draft);
    this.persist();
    if (party.isActive && party.shouldSyncInGame) {
      if (hasLeaderChanged) await this.sendFrom(party, party.leaderId, 'partySetLeader', { name: this.nameOf(party.leaderId) });
      if (hasTankChanged && party.tankId) await this.sendFrom(party, party.leaderId, 'partySetTank', { name: this.nameOf(party.tankId) });
    }
    return { party };
  }

  async remove(partyId) {
    const party = this.byId(partyId);
    if (!party) return { error: 'No such party' };
    if (party.isActive) await this.deactivate(partyId);
    this.parties = this.parties.filter((candidate) => candidate.id !== partyId);
    this.persist();
    return { ok: true };
  }

  dropAccount(accountId) {
    for (const party of this.parties) {
      if (!party.memberIds.includes(accountId)) continue;
      party.memberIds = party.memberIds.filter((memberId) => memberId !== accountId);
      if (party.leaderId === accountId) party.leaderId = party.memberIds[0] ?? null;
      if (party.tankId === accountId) party.tankId = null;
      if (party.memberIds.length < 2) party.isActive = false;
    }
    this.persist();
  }

  // Start the party. The goal defaults to "hunt where the leader is now".
  async activate(partyId, requestedGoal) {
    const party = this.byId(partyId);
    if (!party) return { error: 'No such party' };
    if (party.memberIds.length < 2) return { error: 'A party needs at least 2 members' };
    const leader = this.getSession(party.leaderId);
    const goalAreaId = requestedGoal?.areaId || leader?.player?.areaId;
    const safetyError = goalSafetyError(goalAreaId, this.sessionsOf(party));
    if (safetyError) return { error: safetyError };
    party.goal = { areaId: goalAreaId, shouldHunt: requestedGoal?.shouldHunt ?? true };
    party.isActive = true;
    this.persist();
    if (party.shouldSyncInGame) await this.syncCreate(party);
    return { party };
  }

  async setGoal(partyId, requestedGoal) {
    const party = this.byId(partyId);
    if (!party) return { error: 'No such party' };
    if (!party.isActive) return this.activate(partyId, requestedGoal);
    const goalAreaId = requestedGoal.areaId ?? party.goal.areaId;
    const safetyError = goalSafetyError(goalAreaId, this.sessionsOf(party));
    if (safetyError) return { error: safetyError };
    party.goal = { areaId: goalAreaId, shouldHunt: requestedGoal.shouldHunt ?? party.goal.shouldHunt };
    this.persist();
    return { party };
  }

  async deactivate(partyId) {
    const party = this.byId(partyId);
    if (!party) return { error: 'No such party' };
    party.isActive = false;
    this.persist();
    if (party.shouldSyncInGame) for (const memberId of party.memberIds) await this.sendFrom(party, memberId, 'partyLeave', {});
    return { party };
  }

  // ---- in-game sync (UNVERIFIED commands; off by default) ----------------

  async sendFrom(party, accountId, commandKey, args) {
    const session = this.getSession(accountId);
    const commandType = session?.protocol.commands[commandKey];
    if (!session || !commandType) return null; // not configured → skip
    const result = await session.sendCommand({ type: commandType, ...args }, `party:${party.name}`);
    if (!result.ok) session.log('error', `Party sync ${commandKey} failed: ${result.error || 'timeout'}`);
    return result;
  }

  async syncCreate(party) {
    await this.sendFrom(party, party.leaderId, 'partyCreate', {});
    for (const memberId of party.memberIds) {
      if (memberId === party.leaderId) continue;
      await this.sendFrom(party, party.leaderId, 'partyInvite', { name: this.nameOf(memberId) });
      await this.sendFrom(party, memberId, 'partyAccept', { leader: this.nameOf(party.leaderId) });
    }
    if (party.tankId) await this.sendFrom(party, party.leaderId, 'partySetTank', { name: this.nameOf(party.tankId) });
  }

  // ---- the follow/tank loop ----------------------------------------------

  refreshRoles() {
    for (const party of this.parties) {
      for (const memberId of party.memberIds) {
        const session = this.getSession(memberId);
        if (!session) continue;
        const roles = [memberId === party.leaderId && 'leader', memberId === party.tankId && 'tank'].filter(Boolean);
        session.partyRole = { partyId: party.id, partyName: party.name, roles: roles.length ? roles : ['member'], isActive: party.isActive };
      }
    }
  }

  persist() { this.refreshRoles(); this.save?.(this.parties); }

  tickAll() {
    this.refreshRoles();
    for (const party of this.parties) {
      if (!party.isActive) { this.statusByPartyId.set(party.id, 'Off'); continue; }
      try { this.statusByPartyId.set(party.id, this.tick(party)); } catch (error) { this.statusByPartyId.set(party.id, `Error: ${error.message}`); }
    }
  }

  // One coordination step; returns a status line. It never awaits: moves run
  // in the background under each account's own lock, so one slow bot can't
  // stall the others.
  tick(party) {
    const members = this.sessionsOf(party);
    const leader = this.getSession(party.leaderId);
    if (!leader?.player || !leader.isConnected) return 'Waiting for the leader to connect';
    const offlineMembers = members.filter((member) => !member.isConnected || !member.player);
    if (offlineMembers.length) return `Waiting for ${offlineMembers.map((member) => member.name).join(', ')}`;

    const goal = party.goal;
    const safetyError = goalSafetyError(goal.areaId, members);
    if (safetyError) {
      this.stopAllHunting(members);
      party.goal = { areaId: townOf(parseArea(goal.areaId)?.floor || 1), shouldHunt: false };
      return `Pulled back to town: ${safetyError}`;
    }
    const haltedMember = members.find((member) => member.haltReason);
    if (haltedMember) { this.stopAllHunting(members); return `Holding — ${haltedMember.name} stopped itself (${haltedMember.haltReason})`; }

    // 1. The leader goes to the goal; everyone else follows the leader.
    for (const member of members) {
      const isLeader = member === leader;
      const targetAreaId = isLeader ? goal.areaId : leader.player.areaId;
      if (member.player.areaId === targetAreaId || member.busyLabel || member.isInBossFight) continue;
      const label = isLeader ? `party: lead to ${targetAreaId}` : `party: follow ${leader.name}`;
      member.withLock(label, () => member.goTo(targetAreaId));
    }
    const isGathered = members.every((member) => member.player.areaId === goal.areaId);
    if (!isGathered) return `Moving to ${goal.areaId}`;
    if (!goal.shouldHunt) { this.stopAllHunting(members); return `Holding at ${goal.areaId}`; }

    // 2. The tank fights first; the rest fight only while the tank is up.
    const tank = party.tankId ? this.getSession(party.tankId) : null;
    const tankHpPct = tank?.hpPct();
    const isTankHealthy = tankHpPct == null || tankHpPct >= party.tankRetreatPct;
    const isTankHolding = !tank || (tank.isHunting && isTankHealthy);
    if (tank && !tank.busyLabel && !tank.isHunting && isTankHealthy) this.nudge(tank, 'startHunt', party);
    for (const member of members) {
      if (member === tank || member.busyLabel) continue;
      if (isTankHolding && !member.isHunting) this.nudge(member, 'startHunt', party);
      if (!isTankHolding && member.isHunting) this.nudge(member, 'stopHunt', party);
    }
    if (!isTankHolding) {
      const tankProblem = isTankHealthy ? 'not fighting' : `low (${tankHpPct}%)`;
      return `Tank ${tank.name} is ${tankProblem} — others wait`;
    }
    return `Hunting at ${goal.areaId}`;
  }

  stopAllHunting(members) {
    for (const member of members) if (member.isHunting && !member.busyLabel) this.nudge(member, 'stopHunt');
  }

  // Send a start/stop at most every 3 s per account: the game's state lags
  // the command, so without this every tick would re-send it.
  nudge(session, commandKey, party) {
    const currentTime = Date.now();
    const lastNudge = session.lastNudge;
    if (lastNudge && lastNudge.commandKey === commandKey && currentTime - lastNudge.sentAt < NUDGE_COOLDOWN_MS) return;
    session.lastNudge = { commandKey, sentAt: currentTime };
    session.sendCommand(session.commandOf(commandKey), party ? `party:${party.name}` : 'party');
  }

  summary() {
    return this.parties.map((party) => ({
      ...party,
      status: this.statusByPartyId.get(party.id) || (party.isActive ? 'Starting…' : 'Off'),
    }));
  }
}
