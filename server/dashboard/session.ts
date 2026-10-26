// One Session per account: its game socket, its lock, its health/potion
// safety loop, auto-restock, metrics and event log. A failure in one Session
// never touches another.

import { EventEmitter } from 'node:events'
import { townOf, frontierFloor, recommendedKit, areaLevel, totalPotions, parseArea, ITEMS, safeAreaFor, isAreaSafeFor, WORLD_AREAS, expToNextLevel, gearUpgrades, bestGearOf, EMPTY_SLOT_FAMILIES } from '#shared/game-rules'
import type { AccountSummary, Alert, AutoFarm, LogChoice, LogEvent, PartyRole, Safety } from '#shared/types'
import type { SaoProtocol, CommandKey } from '../sao/protocol'
import type { CommandResult, GameCommand, GameLogEntry, GameSocket, SaoConnector } from '../sao/connector'
import { decideSafety, planRestock, DEFAULT_SAFETY } from './safety'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const EVENT_LIMIT = 150 // per character
const CRITICAL_WINDOW_MS = 5 * 60 * 1000
const SAFETY_COOLDOWN_MS = 1200 // let the last heal land before deciding again
const STALE_AFTER_MS = 10000
const MIASMA_STAGE_MS = 20 * 60 * 1000
const METRICS_WINDOW_MS = 15 * 60 * 1000
const MAX_BUY_PER_CALL = 500
const QUEST_VISIT_MS = 10 * 60 * 1000
const ENHANCE_TRIES_PER_REFIT = 3

// Game log params look like {a:{a:'f1-west'}} (area), {m:{m:'f1-boar'}} (monster), {st:'prologue'}.
function describeGameValue(value: unknown): string {
  if (value && typeof value === 'object') {
    const inner = Object.values(value as Record<string, unknown>)[0]
    if (typeof inner === 'string') return WORLD_AREAS[inner]?.name ?? inner
    return JSON.stringify(value)
  }
  return String(value)
}

const isFightingActivity = (activityType: string) => activityType === 'hunting' || activityType === 'boss'

export interface SessionTiming { safetyMs: number, mainMs: number, sampleMs: number }
export interface SessionSettings { safety?: Partial<Safety>, preferredWeapon?: string | null, autoFarm?: AutoFarm | null, isOnHold?: boolean }

interface SessionEvents { event: [event: LogEvent], answered: [event: LogEvent], halted: [reason: string], settingsChanged: [] }

export class Session extends EventEmitter<SessionEvents> {
  readonly id: string
  readonly account: string
  name: string
  safety: Safety
  busyLabel: string | null = null // the multi-step sequence holding the lock
  haltReason: string | null = null // why the safety engine stopped this bot
  partyRole: PartyRole | null = null
  preferredWeapon: string | null
  autoFarm: AutoFarm | null
  // Set by the account manager: is an invite from this character one the dashboard asked for?
  acceptsInviteFrom: (inviterName: string) => boolean = () => false
  // Logged in somewhere else (e.g. the player's browser): stay offline, even across restarts, until Reconnect.
  isOnHold: boolean
  lastNudge: { commandKey: CommandKey, sentAt: number } | null = null
  events: LogEvent[] = []
  readonly client: GameSocket
  readonly protocol: SaoProtocol
  private timing: SessionTiming
  private alertsByKey = new Map<string, Alert>()
  private criticalTimes: number[] = []
  private lastSafetyActionAt = 0
  private isRunningSafety = false
  private lastQuestVisitAt = 0
  private isStopped = false
  lastRefitAt = 0
  private samples: Array<{ takenAt: number, gold: number, exp: number, level: number }> = []
  private timers: Array<ReturnType<typeof setInterval>> = []

  constructor(options: {
    id: string
    account: string
    name: string
    token: string
    protocol: SaoProtocol
    connector: SaoConnector
    settings?: SessionSettings
    timing?: Partial<SessionTiming>
    // Get a fresh token when the game rejects the saved one; null if we can't.
    relink?: () => Promise<string | null>
  }) {
    super()
    this.id = options.id
    this.account = options.account
    this.name = options.name
    this.protocol = options.protocol
    // Saved settings may predate newer fields (e.g. the instant-potion restock), so merge the nested parts too.
    const savedSafety = options.settings?.safety
    this.safety = structuredClone({ ...DEFAULT_SAFETY, ...savedSafety, restock: { ...DEFAULT_SAFETY.restock, ...savedSafety?.restock } } as Safety)
    this.preferredWeapon = options.settings?.preferredWeapon || null
    this.autoFarm = options.settings?.autoFarm ?? null
    this.isOnHold = options.settings?.isOnHold ?? false
    this.timing = { safetyMs: 500, mainMs: 10000, sampleMs: 10000, ...options.timing }
    this.client = options.connector.openSocket(options.token)
    this.wireClientEvents(options.relink)
  }

  private wireClientEvents(relink?: () => Promise<string | null>) {
    const client = this.client
    client.on('init', (state) => {
      if (state.player?.name) this.name = state.player.name
      this.log('state', 'Connected — fresh state received')
      for (const key of ['socket', 'auth', 'queue', 'ended']) this.clearAlert(key)
    })
    client.on('close', (closeInfo) => {
      if (client.endReason) return
      this.log('alert', `Socket closed (${closeInfo.code ?? '?'})`)
      this.raiseAlert('socket', 'disconnected', 'Disconnected — reconnecting')
    })
    client.on('connectError', (error) => this.log('error', `Can't open the socket: ${error.message}`))
    client.on('queued', ({ pos }) => this.raiseAlert('queue', 'queued', `Server full — queued${pos ? ` (#${pos})` : ''}`, { pos: pos ?? '?' }))
    client.on('ended', async (reason) => {
      if (this.isStopped) return // shutting down: whatever the server says now isn't about the player
      this.clearAlert('socket')
      if (reason === 'unauthorized' && relink) {
        this.log('alert', 'Saved login expired — logging in again')
        const token = await relink().catch(() => null)
        if (token) { client.setToken(token); client.connect(); return }
      }
      const text = {
        unauthorized: 'Login rejected — re-add this account (or save its password)',
        replaced: 'Logged in somewhere else — press Reconnect to take over',
        kicked: 'Kicked by the server',
        banned: 'Banned by the server',
        idleKick: 'Disconnected for idling in town',
        dead: 'Character died',
      }[reason] ?? `Server ended the session (${reason})`
      const canReconnect = reason === 'replaced' || reason === 'idleKick' || reason === 'kicked'
      if (reason === 'replaced') { this.isOnHold = true; this.emit('settingsChanged') }
      this.log('error', text, canReconnect ? { choices: [{ label: 'Reconnect', request: { action: 'reconnect' }, until: 'online' }] } : undefined)
      const knownReasons = ['unauthorized', 'replaced', 'kicked', 'banned', 'idleKick', 'dead']
      this.raiseAlert('ended', knownReasons.includes(reason) ? `ended_${reason}` : 'ended_other', text, { reason })
    })
    let previousLevel: number | null = null
    let wasFallen = false
    let wasInScene = false
    client.on('patch', () => {
      const player = client.player
      const currentLevel = player?.level ?? null
      if (previousLevel != null && currentLevel != null && currentLevel > previousLevel) this.log('levelUp', `Level ${currentLevel}`)
      previousLevel = currentLevel
      // Knocked down in battle / a story scene waiting: the game waits for the player.
      const isFallen = Boolean(player?.fallen)
      if (isFallen && !wasFallen) this.log('prompt', 'Fell in battle — the game is waiting', { choices: [{ label: 'Get up', request: { action: 'raw', command: { type: 'rise' } } }] })
      wasFallen = isFallen
      const scene = player?.scene as { ok?: boolean } | null | undefined
      const isInScene = Boolean(scene && !scene.ok)
      if (isInScene && !wasInScene) this.log('prompt', 'A story scene is waiting', { choices: [{ label: 'Continue', request: { action: 'raw', command: { type: 'sceneOk' } } }] })
      wasInScene = isInScene
    })
    client.on('gameLog', (entries) => { for (const entry of entries) this.logGameEntry(entry) })
    client.on('serverEvent', (message) => this.logServerEvent(message))
  }

  // The game's own log, minus the per-hit combat/loot chatter (and level-ups, logged above).
  private logGameEntry(entry: GameLogEntry) {
    if (['combat', 'loot', 'info', 'level'].includes(entry.kind)) return
    const params = Object.entries(entry.p || {}).map(([key, value]) => `${key}=${describeGameValue(value)}`).join(' ')
    this.log(entry.kind === 'danger' ? 'alert' : 'game', params ? `${entry.key} ${params}` : entry.key)
  }

  private logServerEvent(message: Record<string, any>) {
    const farmChoice: LogChoice = { label: 'Keep farming', request: { action: 'farm', untilLevel: null }, until: 'farming' }
    switch (message.t) {
      case 'idleWarn':
        return this.log('prompt', `Idle in town — the game disconnects you in ${Math.round((message.ms ?? 0) / 1000)} s`,
          { choices: [{ label: 'Stay online', request: { action: 'awake' } }, farmChoice], expiresAt: Date.now() + (message.ms ?? 60000) })
      case 'partyInvite':
        if (this.acceptsInviteFrom(String(message.from))) {
          this.client.sendPartyOp('accept', String(message.from))
          return this.log('cmd', `Joined ${message.from}'s party in-game`, { source: 'party' })
        }
        return this.log('prompt', `${message.from}${message.level ? ` (Lv${message.level})` : ''} invites you to a party`,
          { choices: [{ label: 'Join', request: { action: 'partyAccept', name: String(message.from) } }], expiresAt: Date.now() + 60000 }) // the game's invites last a minute
      case 'reborn': return this.log('alert', `The game gave this login a new character: ${message.name}`)
      case 'followInvite': return this.log('game', `${message.from} asks you to follow them`)
      case 'friendRequest': return this.log('game', `${message.from} sent a friend request`)
      case 'retreat': return this.log('alert', `${message.from} calls a retreat`)
      case 'rally': return this.log('game', `Rally on floor ${message.floor} (${message.areaId})`)
      case 'frozen': return this.log('alert', message.on ? 'The game froze this character' : 'Character unfrozen')
      case 'maintenance': return this.log('alert', `Server maintenance at ${new Date(message.at).toLocaleTimeString()}`)
    }
  }

  start() {
    if (this.isOnHold) this.raiseAlert('ended', 'ended_replaced', 'Logged in somewhere else — press Reconnect to take over')
    else this.client.connect()
    const logErrors = (error: Error) => this.log('error', error.message)
    this.timers = [
      setInterval(() => this.runSafetyTick().catch(logErrors), this.timing.safetyMs),
      setInterval(() => this.runMainTick().catch(logErrors), this.timing.mainMs),
      setInterval(() => this.recordSample(), this.timing.sampleMs),
    ]
  }

  stop() {
    this.isStopped = true
    for (const timer of this.timers) clearInterval(timer)
    this.client.close()
  }

  // Take the session back after "logged in somewhere else".
  reconnect() {
    if (this.isOnHold) { this.isOnHold = false; this.emit('settingsChanged') }
    this.clearAlert('ended')
    this.client.close()
    this.client.connect()
    this.log('mode', 'Reconnecting')
  }

  // ---- events & alerts ---------------------------------------------------

  log(kind: string, detail: string, extra?: { source?: string, choices?: LogChoice[], expiresAt?: number }) {
    const event: LogEvent = { ts: Date.now(), account: this.name, accountId: this.id, kind, detail, ...extra }
    this.events.push(event)
    if (this.events.length > EVENT_LIMIT) this.events.shift()
    this.emit('event', event)
  }

  // A question was answered (from any open dashboard): record it once, tell every tab.
  markAnswered(ts: number, label: string) {
    const event = this.events.find((candidate) => candidate.ts === ts && candidate.choices?.length)
    if (!event || event.answer) return false
    event.answer = label
    this.emit('answered', event)
    return true
  }

  raiseAlert(key: string, code: string, text: string, params?: Alert['params']) { this.alertsByKey.set(key, { code, text, ...(params ? { params } : {}) }) }
  clearAlert(key: string) { this.alertsByKey.delete(key) }

  // ---- derived state -----------------------------------------------------

  get player() { return this.client.player }
  get isConnected() { return this.client.isConnected }
  get activityType() { return this.player?.activity?.type ?? 'idle' }
  get isHunting() { return this.activityType === 'hunting' }
  get isInBossFight() { return this.activityType === 'boss' }

  hpPct(): number | null {
    const player = this.player
    const maxHp = this.client.maxHp().value
    if (!player || !maxHp) return null
    return Math.max(0, Math.min(100, Math.round((player.hp / maxHp) * 100)))
  }

  isStale() { return this.isHunting && Date.now() - this.client.lastPatchAt > STALE_AFTER_MS }

  // ---- commands ----------------------------------------------------------

  async sendCommand(command: GameCommand | null, source = 'bot'): Promise<CommandResult> {
    if (!command) return { error: 'unsupported' }
    let result = await this.client.sendCommand(command)
    // "tooFast": the game refused it outright, so it's safe to send again shortly.
    for (let retry = 0; result.error === 'tooFast' && retry < 3; retry++) {
      await sleep(1100)
      result = await this.client.sendCommand(command)
    }
    const outcome = result.ok ? 'ok' : result.timeout ? 'timeout' : result.error || 'ok'
    this.log(result.error || result.timeout ? 'result' : 'cmd', `${command.type} → ${outcome}`, { source })
    return result
  }

  // Send a command by dashboard key, e.g. command('startHunt').
  command(commandKey: CommandKey, extra?: Record<string, unknown>, source?: string) {
    return this.sendCommand(this.client.commandOf(commandKey, extra), source)
  }

  // Multi-step sequences take the lock; a second one is refused, not queued.
  async withLock<T>(label: string, sequence: () => Promise<T>): Promise<T | { error: 'busy', busyLabel: string }> {
    if (this.busyLabel) return { error: 'busy', busyLabel: this.busyLabel }
    this.busyLabel = label
    this.log('mode', `Busy: ${label}`)
    try { return await sequence() } finally { this.busyLabel = null }
  }

  async waitFor(isDone: () => boolean, timeoutMs = 4000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) { if (isDone()) return true; await sleep(150) }
    return isDone()
  }

  // Walk/gate to targetAreaId. Caller holds the lock.
  async goTo(targetAreaId: string, { maxSteps = 16 } = {}): Promise<CommandResult> {
    const targetArea = parseArea(targetAreaId)
    if (!targetArea) return { error: 'badArea' }
    const stepDelayMs = this.protocol.travelStepMs
    for (let step = 0; step < maxSteps; step++) {
      const player = this.player
      if (!player) return { error: 'disconnected' }
      if (player.areaId === targetAreaId) return { ok: true }
      if (this.isInBossFight) return { error: 'bossNoMove' }
      if (this.isHunting) await this.command('stopHunt')
      const currentArea = parseArea(player.areaId)
      const isOtherFloor = currentArea && currentArea.floor !== targetArea.floor
      let travelCommand: GameCommand | null
      if (isOtherFloor && currentArea.kind === 'town') travelCommand = this.client.commandOf('gate', { floor: targetArea.floor })
      else if (isOtherFloor) travelCommand = this.client.commandOf('travel', { areaId: townOf(currentArea.floor) })
      else travelCommand = this.client.commandOf('travel', { areaId: targetAreaId })

      const areaBefore = player.areaId
      const result = await this.sendCommand(travelCommand)
      if (result.error === 'tooFast') { await sleep(stepDelayMs); continue }
      if (result.error === 'notAdjacent' && currentArea) {
        await this.command('travel', { areaId: townOf(currentArea.floor) })
        await sleep(stepDelayMs)
        continue
      }
      if (result.error === 'floorNotOpen' || result.error === 'disconnected' || result.error === 'unsupported') return result
      if (result.error || result.timeout) { await sleep(2000); continue }
      // ok returns before areaId changes: wait for the patch.
      await this.waitFor(() => this.player?.areaId !== areaBefore)
      await sleep(stepDelayMs)
    }
    return this.player?.areaId === targetAreaId ? { ok: true } : { error: 'travelFailed' }
  }

  // ---- safety loop (every 500 ms, ignores the lock) ----------------------

  async runSafetyTick() {
    if (!this.isConnected || this.isRunningSafety) return
    const player = this.player
    if (player?.dead) { this.raiseAlert('dead', 'dead', 'Character is dead!'); return }
    this.clearAlert('dead')
    const hpPct = this.hpPct()
    if (hpPct != null && hpPct < 15 && isFightingActivity(this.activityType)) this.raiseAlert('nearDeath', 'nearDeath', `HP ${hpPct}%`, { hp: hpPct })
    else this.clearAlert('nearDeath')
    if (Date.now() - this.lastSafetyActionAt < SAFETY_COOLDOWN_MS) return
    const safetyAction = decideSafety(player, hpPct, this.safety)
    if (!safetyAction) return
    this.isRunningSafety = true
    try {
      this.lastSafetyActionAt = Date.now()
      this.log('safety', safetyAction.reason)
      await this.sendCommand(safetyAction.command, 'safety')
      if (safetyAction.isCritical) this.recordCloseCall(safetyAction.reason)
    } finally { this.isRunningSafety = false }
  }

  private recordCloseCall(reason: string) {
    const currentTime = Date.now()
    this.criticalTimes = this.criticalTimes.filter((happenedAt) => currentTime - happenedAt < CRITICAL_WINDOW_MS)
    this.criticalTimes.push(currentTime)
    if (this.criticalTimes.length < this.safety.haltAfterCriticalCount || this.haltReason) return
    this.haltReason = `${this.criticalTimes.length} close calls in 5 min (last: ${reason})`
    this.raiseAlert('halted', 'halted', `Bot stopped itself: ${this.haltReason}`, { count: this.criticalTimes.length })
    this.log('alert', `Halted: ${this.haltReason}`, { choices: [{ label: 'Resume', request: { action: 'resume' }, until: 'resumed' }] })
    this.emit('halted', this.haltReason)
    if (this.isHunting) this.command('stopHunt', {}, 'safety')
  }

  resume() {
    this.haltReason = null
    this.criticalTimes = []
    this.clearAlert('halted')
    this.log('mode', 'Resumed by user')
  }

  setPreferredWeapon(weapon: string | null) {
    this.preferredWeapon = weapon || null
    this.log('mode', weapon ? `Weapon goal set: ${weapon}` : 'Weapon goal cleared')
  }

  // ---- main loop: low-stock alerts + auto-restock ------------------------

  restockPlan() {
    const player = this.player
    return player ? planRestock(player, this.safety, frontierFloor(player.clearedFloors)) : []
  }

  async runMainTick() {
    if (!this.isConnected || !this.player) return
    await this.checkRestock()
    await this.keepFarming()
  }

  private async checkRestock() {
    const plan = this.restockPlan()
    if ('blockedReason' in plan) { this.raiseAlert('stock', 'stockBlocked', plan.blockedReason, { items: plan.unaffordable.join(','), budget: plan.budget }); return }
    if (!plan.length) { this.clearAlert('stock'); return }
    this.raiseAlert('stock', 'stockLow', `Low: ${plan.map((purchase) => purchase.itemId).join(', ')}`, { items: plan.map((purchase) => purchase.itemId).join(',') })
    // Don't walk to town for one potion at a time: wait for a batch, unless we're out.
    const plannedCount = plan.reduce((sum, purchase) => sum + purchase.quantity, 0)
    const isWorthTheTrip = plannedCount >= 5 || totalPotions(this.player?.inventory) === 0
    const canRestockNow = this.safety.isAutoRestockOn && !this.haltReason && !this.busyLabel && !this.isInBossFight
    if (canRestockNow && isWorthTheTrip) await this.restock()
  }

  setAutoFarm(autoFarm: AutoFarm | null) {
    this.autoFarm = autoFarm
    this.log('mode', autoFarm ? `Keep farming${autoFarm.untilLevel ? ` until Lv${autoFarm.untilLevel}` : ''}` : 'Keep farming off')
    this.emit('settingsChanged')
  }

  // Quests are taken and turned in only in town. Big EXP: a bounty pays the monster's EXP × count × 6.
  async handleQuests() {
    this.lastQuestVisitAt = Date.now()
    await this.command('completeMission') // turn in whatever is finished first, then take new ones
    await this.sendCommand({ type: 'acceptAllQuests' })
  }

  // Keep-farming mode: hunt in the best safe area, move up as levels come in,
  // and start again when the game stops the hunt (story warps, restocks…).
  async keepFarming() {
    const player = this.player
    if (!this.autoFarm || !player || this.haltReason || this.busyLabel || this.partyRole?.isActive || this.isInBossFight) return
    if (this.autoFarm.untilLevel && player.level >= this.autoFarm.untilLevel) {
      this.setAutoFarm(null)
      this.log('prompt', `Reached Lv${player.level} — farming done, going back to town`, { choices: [
        { label: 'Keep farming', request: { action: 'farm', untilLevel: null }, until: 'farming' },
        { label: `Farm to Lv${player.level + 5}`, request: { action: 'farm', untilLevel: player.level + 5 }, until: 'farming' },
      ] })
      await this.withLock('farm: back to town', async () => {
        if (this.isHunting) await this.command('stopHunt')
        return this.goTo(townOf(parseArea(player.areaId)?.floor ?? 1))
      })
      return
    }
    const bestAreaId = safeAreaFor(player.level, 'field', frontierFloor(player.clearedFloors))
    if (!bestAreaId) { this.raiseAlert('farm', 'noFarmArea', 'No safe area to farm at this level'); return }
    this.clearAlert('farm')
    const isInGoodArea = parseArea(player.areaId)?.kind === 'field' && isAreaSafeFor(player.areaId, player.level)
      && (areaLevel(player.areaId) ?? 0) >= (areaLevel(bestAreaId) ?? 0)
    // Pop into town every 10 min to turn in and pick up quests (a few seconds' walk).
    const isQuestVisitDue = Date.now() - this.lastQuestVisitAt > QUEST_VISIT_MS
    if (this.isHunting && isInGoodArea && !isQuestVisitDue) return
    const targetAreaId = isInGoodArea ? player.areaId : bestAreaId
    await this.withLock(`farm: ${targetAreaId}`, async (): Promise<CommandResult> => {
      if (isQuestVisitDue) await this.goTo(townOf(parseArea(player.areaId)?.floor ?? 1))
      if (parseArea(this.player?.areaId)?.kind === 'town') await this.handleQuests()
      if (this.player?.areaId !== targetAreaId) {
        const travelResult = await this.goTo(targetAreaId)
        if (travelResult.error) { this.log('error', `Farm: couldn't reach ${targetAreaId} (${travelResult.error})`); return travelResult }
      }
      return this.isHunting ? { ok: true } : this.command('startHunt')
    })
  }

  async restock() {
    return this.withLock('restock', async (): Promise<CommandResult> => {
      const homeAreaId = this.player!.areaId
      const wasHunting = this.isHunting
      const result = await this.buySupplies()
      if (homeAreaId && this.player?.areaId !== homeAreaId) await this.goTo(homeAreaId)
      if (wasHunting && this.player?.areaId === homeAreaId) await this.command('startHunt')
      return result
    })
  }

  // Buy what the restock plan says, in whichever towns sell it. Caller holds the lock.
  private async buySupplies(): Promise<CommandResult> {
    const plan = this.restockPlan()
    if ('blockedReason' in plan) return { error: 'noGold', detail: plan.blockedReason }
    if (!plan.length) return { ok: true, purchases: [] }
    const purchases: Array<{ itemId: string, quantity: number }> = []
    for (const shopFloor of new Set(plan.map((purchase) => purchase.floor))) {
      const travelResult = await this.goTo(townOf(shopFloor))
      if (!travelResult.ok) { this.log('error', `Restock: couldn't reach floor ${shopFloor} town (${travelResult.error})`); break }
      if (this.autoFarm) await this.handleQuests()
      for (const purchase of plan.filter((candidate) => candidate.floor === shopFloor)) {
        let remaining = purchase.quantity
        while (remaining > 0) {
          const batchSize = Math.min(MAX_BUY_PER_CALL, remaining)
          const buyResult = await this.command('buy', { itemId: purchase.itemId, qty: batchSize })
          if (!buyResult.ok) { this.log('error', `Buy ${purchase.itemId} failed: ${buyResult.error || 'timeout'}`); break }
          remaining -= batchSize
        }
        purchases.push({ itemId: purchase.itemId, quantity: purchase.quantity - remaining })
      }
    }
    const boughtText = purchases.map((purchase) => `${purchase.quantity}× ${purchase.itemId}`).join(', ')
    this.log('mode', `Restocked ${boughtText || 'nothing'}`)
    return { ok: true, purchases }
  }

  // 修整 (refit): in this floor's town, turn in quests, restock, swap in the best
  // gear of the same kind, and enhance what's worn. Runs under the 'refit' lock,
  // which the UI shows as a "refitting" mask.
  async refit() {
    return this.withLock('refit', async (): Promise<CommandResult> => {
      const player = this.player
      if (!player) return { error: 'disconnected' }
      const townId = townOf(parseArea(player.areaId)?.floor ?? 1)
      if (this.isHunting) await this.command('stopHunt')
      const travelResult = await this.goTo(townId)
      if (travelResult.error) return travelResult
      await this.handleQuests()
      await this.buySupplies()
      if (this.player?.areaId !== townId) await this.goTo(townId)
      const swaps = await this.upgradeGear()
      const enhanced = await this.enhanceGear()
      this.lastRefitAt = Date.now()
      this.log('mode', `Refit done${swaps.length ? ` — new gear: ${swaps.join(', ')}` : ''}${enhanced ? ` — ${enhanced} enhanced` : ''}`)
      return { ok: true, swaps }
    })
  }

  // Slot by slot: equip the best same-family piece this town sells (or the bag
  // holds); empty armour/head/feet/accessory slots get the best one too.
  private async upgradeGear(): Promise<string[]> {
    const swaps: string[] = []
    const equipment = this.player?.equipment ?? {}
    const slots = [...new Set([...Object.keys(equipment), ...Object.keys(EMPTY_SLOT_FAMILIES)])]
    for (const slot of slots) {
      const player = this.player
      if (!player) break
      const equippedId = player.equipment?.[slot]
      const ownedIds = Object.entries(player.inventory ?? {}).filter(([, quantity]) => quantity > 0).map(([itemId]) => itemId)
      const availableIds = [...(WORLD_AREAS[player.areaId]?.shop ?? []), ...ownedIds]
      const candidates = equippedId ? gearUpgrades(equippedId, player.level, availableIds) : bestGearOf(EMPTY_SLOT_FAMILIES[slot]!, 0, player.level, availableIds)
      for (const itemId of candidates) {
        if (!((this.player?.inventory?.[itemId] ?? 0) > 0)) {
          const buyResult = await this.sendCommand({ type: 'buy', itemId, qty: 1 }, 'refit')
          if (!buyResult.ok) continue // too expensive: try the next best
        }
        const equipResult = await this.sendCommand({ type: 'equip', itemId, slot }, 'refit')
        if (equipResult.ok) { swaps.push(`${equippedId ?? `(${slot})`} → ${itemId}`); break }
      }
    }
    return swaps
  }

  // 強化: a few tries per worn piece while the game allows (materials, tries left).
  // The forge opens after floor 1's boss. ponytail: fixed directions (attack /
  // defence / HP); make them a setting if players want speed or crit builds.
  private async enhanceGear(): Promise<number> {
    if (!(this.player?.clearedFloors ?? []).includes(1)) return 0
    let successes = 0
    for (const slot of Object.keys(this.player?.equipment ?? {})) {
      const dir = slot === 'weapon' ? 'sharp' : ['accessory', 'ring2', 'neck'].includes(slot) ? 'vital' : 'hard'
      for (let attempt = 0; attempt < ENHANCE_TRIES_PER_REFIT; attempt++) {
        const result = await this.sendCommand({ type: 'enhance', slot, dir, mats: 1 }, 'refit')
        if (result.error || result.timeout) break // out of materials or tries: next slot
        if (result.ok) successes++
      }
    }
    return successes
  }

  // ---- metrics -----------------------------------------------------------

  private recordSample() {
    const player = this.player
    if (!player) return
    this.samples.push({ takenAt: Date.now(), gold: player.col ?? 0, exp: player.exp ?? 0, level: player.level })
    const cutoff = Date.now() - METRICS_WINDOW_MS
    while (this.samples.length && this.samples[0]!.takenAt < cutoff) this.samples.shift()
  }

  rates() {
    const noRates = { goldPerHour: null, expPerMin: null }
    if (this.samples.length < 2) return noRates
    const oldest = this.samples[0]!
    const newest = this.samples[this.samples.length - 1]!
    const elapsedMs = newest.takenAt - oldest.takenAt
    if (elapsedMs < 60000) return noRates
    return {
      goldPerHour: Math.round(((newest.gold - oldest.gold) / elapsedMs) * 3600000),
      expPerMin: oldest.level === newest.level ? Math.round(((newest.exp - oldest.exp) / elapsedMs) * 60000) : null,
    }
  }

  private miasmaTotalMs() {
    const player = this.player
    if (!player) return 0
    const gameTime = this.client.state?.time
    const runningMs = player.miasmaSince != null && gameTime ? Math.max(0, gameTime - player.miasmaSince) : 0
    return (player.miasmaMs || 0) + runningMs
  }

  // ---- what the UI sees (never contains secrets) -------------------------

  summary(): AccountSummary {
    const player = this.player
    const maxHp = this.client.maxHp()
    const expNeeded = this.client.expNeeded() ?? (player ? expToNextLevel(player.level) : null)
    const inventory = player?.inventory || {}
    const kit = recommendedKit(player?.level ?? 1)
    const autoDrinkItem = player?.settings?.potionItem || kit.autoDrink
    return {
      id: this.id,
      account: this.account,
      name: this.name,
      isConnected: this.isConnected,
      isStale: this.isStale(),
      busyLabel: this.busyLabel,
      haltReason: this.haltReason,
      partyRole: this.partyRole,
      preferredWeapon: this.preferredWeapon,
      autoFarm: this.autoFarm,
      alerts: [...this.alertsByKey.values()],
      safety: this.safety,
      player: player && {
        name: player.name,
        level: player.level,
        exp: player.exp,
        expNeeded,
        expPct: expNeeded ? Math.floor((player.exp / expNeeded) * 1000) / 10 : null,
        hp: player.hp,
        maxHp: maxHp.value,
        isMaxHpEstimated: maxHp.isEstimated,
        hpPct: this.hpPct(),
        attack: this.client.attack(),
        equipment: player.equipment || null,
        skills: player.learnedSkills || (player.skills as string[] | undefined) || null,
        gold: player.col,
        areaId: player.areaId,
        areaLevel: areaLevel(player.areaId),
        activity: this.activityType,
        phase: player.activity?.phase || null,
        enemyCount: (player.enemies || []).length,
        frontierFloor: frontierFloor(player.clearedFloors),
        miasmaStage: Math.floor(this.miasmaTotalMs() / MIASMA_STAGE_MS),
        emergencyCooldownMs: player.instantCdMs ?? 0,
        isGameAutoPotionOn: player.settings?.autoPotion ?? null,
        consumables: {
          autoDrink: { itemId: autoDrinkItem, name: ITEMS[autoDrinkItem]?.name, quantity: inventory[autoDrinkItem] ?? 0 },
          instant: { itemId: this.safety.instantItem || kit.backup, name: ITEMS[this.safety.instantItem || kit.backup]?.name, quantity: inventory[this.safety.instantItem || kit.backup] ?? 0 },
          potionsTotal: totalPotions(inventory),
          crystalHeal: inventory['crystal-heal'] ?? 0,
          crystalTeleport: inventory['crystal-teleport'] ?? 0,
        },
        recommendedKit: kit,
        isDead: !!player.dead,
      },
      rates: this.rates(),
    }
  }
}
