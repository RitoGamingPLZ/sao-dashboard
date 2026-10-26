// One Session per account: its game socket, its lock, its health/potion
// safety loop, auto-restock, metrics and event log. A failure in one Session
// never touches another.

import { EventEmitter } from 'node:events'
import { townOf, frontierFloor, recommendedKit, areaLevel, totalPotions, parseArea, ITEMS } from '#shared/game-rules'
import type { AccountSummary, LogEvent, PartyRole, Safety } from '#shared/types'
import type { SaoProtocol, CommandKey } from '../sao/protocol'
import type { CommandResult, GameCommand, GameSocket, SaoConnector } from '../sao/connector'
import { decideSafety, planRestock, DEFAULT_SAFETY } from './safety'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const EVENT_LIMIT = 500
const CRITICAL_WINDOW_MS = 5 * 60 * 1000
const SAFETY_COOLDOWN_MS = 1200 // let the last heal land before deciding again
const STALE_AFTER_MS = 10000
const MIASMA_STAGE_MS = 20 * 60 * 1000
const METRICS_WINDOW_MS = 15 * 60 * 1000
const MAX_BUY_PER_CALL = 500

const isFightingActivity = (activityType: string) => activityType === 'hunting' || activityType === 'boss'

export interface SessionTiming { safetyMs: number, mainMs: number, sampleMs: number }
export interface SessionSettings { safety?: Partial<Safety>, preferredWeapon?: string | null }

interface SessionEvents { event: [event: LogEvent], halted: [reason: string] }

export class Session extends EventEmitter<SessionEvents> {
  readonly id: string
  readonly account: string
  name: string
  safety: Safety
  busyLabel: string | null = null // the multi-step sequence holding the lock
  haltReason: string | null = null // why the safety engine stopped this bot
  partyRole: PartyRole | null = null
  preferredWeapon: string | null
  lastNudge: { commandKey: CommandKey, sentAt: number } | null = null
  events: LogEvent[] = []
  readonly client: GameSocket
  readonly protocol: SaoProtocol
  private timing: SessionTiming
  private alertsByKey = new Map<string, { ts: number, text: string }>()
  private criticalTimes: number[] = []
  private lastSafetyActionAt = 0
  private isRunningSafety = false
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
    this.safety = structuredClone({ ...DEFAULT_SAFETY, ...options.settings?.safety })
    this.preferredWeapon = options.settings?.preferredWeapon || null
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
      this.raiseAlert('socket', 'Disconnected — reconnecting')
    })
    client.on('connectError', (error) => this.log('error', `Can't open the socket: ${error.message}`))
    client.on('queued', ({ pos }) => this.raiseAlert('queue', `Server full — queued${pos ? ` (#${pos})` : ''}`))
    client.on('ended', async (reason) => {
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
      }[reason] ?? `Server ended the session (${reason})`
      this.log('error', text)
      this.raiseAlert('ended', text)
    })
    let previousLevel: number | null = null
    client.on('patch', () => {
      const currentLevel = client.player?.level ?? null
      if (previousLevel != null && currentLevel != null && currentLevel > previousLevel) this.log('levelUp', `Level ${currentLevel}`)
      previousLevel = currentLevel
    })
  }

  start() {
    this.client.connect()
    const logErrors = (error: Error) => this.log('error', error.message)
    this.timers = [
      setInterval(() => this.runSafetyTick().catch(logErrors), this.timing.safetyMs),
      setInterval(() => this.runMainTick().catch(logErrors), this.timing.mainMs),
      setInterval(() => this.recordSample(), this.timing.sampleMs),
    ]
  }

  stop() {
    for (const timer of this.timers) clearInterval(timer)
    this.client.close()
  }

  // Take the session back after "logged in somewhere else".
  reconnect() {
    this.client.close()
    this.client.connect()
    this.log('mode', 'Reconnecting')
  }

  // ---- events & alerts ---------------------------------------------------

  log(kind: string, detail: string, extra?: { source?: string }) {
    const event: LogEvent = { ts: Date.now(), account: this.name, accountId: this.id, kind, detail, ...extra }
    this.events.push(event)
    if (this.events.length > EVENT_LIMIT) this.events.shift()
    this.emit('event', event)
  }

  raiseAlert(key: string, text: string) { this.alertsByKey.set(key, { ts: Date.now(), text }) }
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
    const result = await this.client.sendCommand(command)
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
    if (player?.dead) { this.raiseAlert('dead', 'Character is dead!'); return }
    this.clearAlert('dead')
    const hpPct = this.hpPct()
    if (hpPct != null && hpPct < 15 && isFightingActivity(this.activityType)) this.raiseAlert('nearDeath', `HP ${hpPct}%`)
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
    this.raiseAlert('halted', `Bot stopped itself: ${this.haltReason}`)
    this.log('alert', `Halted: ${this.haltReason}`)
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
    const plan = this.restockPlan()
    if ('blockedReason' in plan) { this.raiseAlert('stock', plan.blockedReason); return }
    if (!plan.length) { this.clearAlert('stock'); return }
    this.raiseAlert('stock', `Low: ${plan.map((purchase) => purchase.itemId).join(', ')}`)
    const canRestockNow = this.safety.isAutoRestockOn && !this.haltReason && !this.busyLabel && !this.isInBossFight
    if (canRestockNow) await this.restock()
  }

  async restock() {
    return this.withLock('restock', async (): Promise<CommandResult> => {
      const plan = this.restockPlan()
      if ('blockedReason' in plan) return { error: 'noGold', detail: plan.blockedReason }
      if (!plan.length) return { ok: true, purchases: [] }
      const homeAreaId = this.player!.areaId
      const wasHunting = this.isHunting
      const purchases: Array<{ itemId: string, quantity: number }> = []
      for (const shopFloor of new Set(plan.map((purchase) => purchase.floor))) {
        const travelResult = await this.goTo(townOf(shopFloor))
        if (!travelResult.ok) { this.log('error', `Restock: couldn't reach floor ${shopFloor} town (${travelResult.error})`); break }
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
      if (homeAreaId && this.player?.areaId !== homeAreaId) await this.goTo(homeAreaId)
      if (wasHunting && this.player?.areaId === homeAreaId) await this.command('startHunt')
      return { ok: true, purchases }
    })
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
    const expNeeded = this.client.expNeeded()
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
      alerts: [...this.alertsByKey.values()].map((alert) => alert.text),
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
