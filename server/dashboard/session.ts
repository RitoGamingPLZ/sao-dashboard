// One Session per account: its game socket, its lock, its health/potion
// safety loop, auto-restock, metrics and event log. A failure in one Session
// never touches another.

import { EventEmitter } from 'node:events'
import { townOf, frontierFloor, shopFloorFor, recommendedKit, areaLevel, totalPotions, parseArea, ITEMS, safeAreaFor, isAreaSafeFor, WORLD_AREAS, expToNextLevel, BOSS_LEVEL_MARGIN, EMPTY_SLOT_FAMILIES, characterStats, survivalDirection, enemyAttackFromHit, stockLevelsFor, GEAR, SKILLS, resolveGear, skillSlotCount, rankSkills, bossRequirement, slotUpgrades, MAX_BOSS_HP_BARS, type GearInstance } from '#shared/game-rules'
import type { AccountSummary, Alert, AutoFarm, LogChoice, LogEvent, PartyRole, Safety } from '#shared/types'
import type { SaoProtocol, CommandKey } from '../sao/protocol'
import type { CommandResult, GameCommand, GameLogEntry, GameSocket, SaoConnector } from '../sao/connector'
import { decideDanger, decideSafety, planRestock, DEFAULT_SAFETY, type Threat } from './safety'
import { planMission, QUESTS, STORY, type Objective } from './missions'
import { Bestiary } from './bestiary'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const EVENT_LIMIT = 150 // per character
const SAFETY_COOLDOWN_MS = 1200 // let the last heal land before deciding again
const DANGER_REPEAT_MS = 700 // a danger heal can follow another this soon (the state must catch up first)
const STALE_AFTER_MS = 10000
const MIASMA_STAGE_MS = 20 * 60 * 1000
const METRICS_WINDOW_MS = 15 * 60 * 1000
const MAX_BUY_PER_CALL = 500
const QUEST_VISIT_MS = 10 * 60 * 1000
const ENHANCE_TRIES_PER_REFIT = 3
const BOSS_FARM_WAIT_MS = 5 * 60 * 1000 // 王戰 mode's pause after a boss it couldn't fight
const BOSS_RETRY_MS = 30 * 60 * 1000 // keep-farming's wait before trying the same floor's boss again
const FIGHT_DONE_KEYS = new Set(['kill', 'bossReport', 'floorCleared']) // game log: a fight just ended
const FARM_RECHECK_DELAY_MS = 500 // let the state settle first
const DPS_HITS = 300 // our last hits kept for measuredDps
const EQUIP_CHECK_MS = 60 * 1000 // 練功: wear owned upgrades at most once a minute
const UPGRADE_REFIT_MS = 10 * 60 * 1000 // 練功: at most one gear-upgrade trip per 10 min

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
export interface SessionSettings { safety?: Partial<Safety>, preferredWeapon?: string | null, autoFarm?: AutoFarm | null, isOnHold?: boolean, isBossFarming?: boolean }

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
  // 王戰 mode: keep fighting the highest boss this character can beat.
  isBossFarming: boolean
  private bossFarmWaitUntil = 0
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
  private lastSafetyActionAt = 0
  private isRunningSafety = false
  // Combat memory for decideDanger: recent hits, each charged attack's damage, the emergency heal size.
  private recentHits: Array<{ at: number, dmg: number, isCharge?: boolean }> = []
  private chargeDamageByKey = new Map<string, number>()
  private emergencyHealAmount = 0
  // Normal (non-charged) hits taken lately, for weighing defence when enhancing.
  private ownHits: Array<{ t: number, dmg: number }> = [] // our hits, for measuredDps
  private skillDamage = new Map<string, number[]>() // damage per use, for bestSkills
  private bestiary: Bestiary
  private lastDangerActionAt = 0
  private lastQuestVisitAt = 0
  private isStopped = false
  lastRefitAt = 0
  private lastUpgradeTripAt = 0
  private lastEquipCheckAt = 0
  private isFarmRecheckQueued = false
  // The last boss keep-farming tried. Only a retry of the same floor waits; a win moves the frontier on.
  private lastBossAttempt: { floor: number, at: number } | null = null
  // 任務 run in progress: what we started from (for the report), and which story step failed.
  mission: { startedAt: number, startQuestsDone: number, failedStoryKey: string | null, notes: Set<string> } | null = null
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
    bestiary?: Bestiary
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
    this.isBossFarming = options.settings?.isBossFarming ?? false
    this.isOnHold = options.settings?.isOnHold ?? false
    this.timing = { safetyMs: 500, mainMs: 10000, sampleMs: 10000, ...options.timing }
    this.bestiary = options.bestiary ?? new Bestiary()
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
      this.bestiary.recordEnemies(player?.enemies as Array<{ monsterId?: string, hp?: number, attackTimerMs?: number }> | undefined, (client.gameParty?.members?.length ?? 1) <= 1)
      const currentLevel = player?.level ?? null
      if (previousLevel != null && currentLevel != null && currentLevel > previousLevel) { this.log('levelUp', `Level ${currentLevel}`); this.onLevelUp() }
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
    this.rememberCombat(entry)
    if (FIGHT_DONE_KEYS.has(entry.key)) this.recheckFarmSoon()
    const stats = this.stats()
    this.bestiary.recordLog(entry, stats && { atk: this.client.attack() ?? stats.atk, def: stats.def }, { fighter: this.id, name: this.name, areaId: this.player?.areaId })
    if (['combat', 'loot', 'info', 'level'].includes(entry.kind)) return
    const params = Object.entries(entry.p || {}).map(([key, value]) => `${key}=${describeGameValue(value)}`).join(' ')
    this.log(entry.kind === 'danger' ? 'alert' : 'game', params ? `${entry.key} ${params}` : entry.key)
  }

  // Learn from hits taken: recent damage, and how hard each boss's charged attacks land.
  private rememberCombat(entry: GameLogEntry) {
    const params = (entry.p ?? {}) as { dmg?: number, m?: { m?: string }, k?: { k?: string }, i?: { i?: string }, heal?: number }
    if (entry.key === 'enemyAttack' && typeof params.dmg === 'number') {
      const now = Date.now()
      this.recentHits.push({ at: now, dmg: params.dmg, isCharge: Boolean(params.k?.k) })
      this.recentHits = this.recentHits.filter((hit) => now - hit.at < 20000)
      if (params.k?.k) {
        const key = `${params.m?.m}:${params.k.k}`
        this.chargeDamageByKey.set(key, Math.max(this.chargeDamageByKey.get(key) ?? 0, params.dmg))
      }
    }
    const skillId = (params as { s?: { s?: string } }).s?.s
    if (entry.key === 'skillHit' && skillId && typeof params.dmg === 'number') this.skillDamage.set(skillId, [...(this.skillDamage.get(skillId) ?? []).slice(-29), params.dmg])
    if ((entry.key === 'attack' || entry.key === 'skillHit') && typeof params.dmg === 'number' && typeof entry.t === 'number') {
      this.ownHits.push({ t: entry.t, dmg: params.dmg })
      if (this.ownHits.length > DPS_HITS) this.ownHits.shift()
    }
    if (entry.key === 'crystalUsed' && params.i?.i?.startsWith('instant-') && typeof params.heal === 'number') this.emergencyHealAmount = params.heal
  }

  // Our damage per second while fighting, from the last few hundred hits
  // (gaps over 5 s are between fights and don't count). Null until 30 s of fighting.
  measuredDps(): number | null {
    let seconds = 0
    let damage = 0
    for (let index = 1; index < this.ownHits.length; index++) {
      const gap = this.ownHits[index]!.t - this.ownHits[index - 1]!.t
      if (gap > 0 && gap < 5000) { seconds += gap / 1000; damage += this.ownHits[index]!.dmg }
    }
    return seconds >= 30 ? damage / seconds : null
  }

  // Buy enough recovery potions to heal `missing` more HP, in the nearest town
  // that sells them. Caller holds the lock.
  private async buyHealing(missing: number, nearFloor: number) {
    const player = this.player
    if (!player) return
    const itemId = player.settings?.potionItem || recommendedKit(player.level, frontierFloor(player.clearedFloors)).autoDrink
    const heal = ITEMS[itemId]?.heal
    const shopFloor = shopFloorFor(itemId, frontierFloor(player.clearedFloors), nearFloor)
    if (!heal || !shopFloor) return
    const quantity = Math.ceil(missing / heal)
    if ((await this.goTo(townOf(shopFloor))).error) return
    const result = await this.command('buy', { itemId, qty: Math.min(quantity, MAX_BUY_PER_CALL) })
    this.log('mode', result.ok ? `Bought ${quantity}× ${itemId} for the boss fight` : `Couldn't buy ${quantity}× ${itemId} for the boss fight (${result.error ?? 'timeout'})`)
  }

  // Refit: move to the strongest potions on sale on unlocked floors, only ever
  // stronger, and not where you've locked your choice (settings).
  async useStrongestPotion() {
    const player = this.player
    if (!player) return
    const kit = recommendedKit(player.level, frontierFloor(player.clearedFloors))
    const heal = (itemId?: string | null) => (itemId ? ITEMS[itemId]?.heal ?? 0 : 0)
    if (!this.safety.isInstantLocked && this.safety.instantItem && heal(this.safety.instantItem) < heal(kit.backup)) {
      this.safety.instantItem = null // back to automatic: the strongest on sale
      this.emit('settingsChanged')
      this.log('mode', `Emergency potion: ${ITEMS[kit.backup]?.name ?? kit.backup}`)
    }
    const best = kit.autoDrink
    const current = player.settings?.potionItem
    if (!this.safety.isPotionLocked && (!current || heal(best) > heal(current))) {
      const result = await this.sendCommand({ type: 'updateSettings', settings: { potionItem: best } }, 'refit')
      if (result.ok) this.log('mode', `Auto-drink potion: ${ITEMS[best]?.name ?? best}`)
    }
  }

  // Healing the potions we carry add up to (crystals not counted).
  healingSupply(): number {
    return Object.entries(this.player?.inventory ?? {}).reduce((total, [itemId, count]) => total + (ITEMS[itemId]?.heal ?? 0) * count, 0)
  }

  // How dangerous the fight is right now (see decideDanger).
  threat(): Threat {
    const now = Date.now()
    const hits = this.recentHits.filter((hit) => now - hit.at < 15000)
    let burst = 0
    for (const hit of hits) burst = Math.max(burst, hits.filter((other) => other.at >= hit.at && other.at - hit.at < 1000).reduce((sum, other) => sum + other.dmg, 0))
    let chargeDamage: number | null = null
    for (const enemy of (this.player?.enemies ?? []) as Array<{ monsterId?: string, charge?: { k?: string } | null }>) {
      if (!enemy.charge?.k) continue
      // Seen by this character, else learned by any (as an attack, so it converts to our
      // defence), else 3.5× the biggest normal hit (seen: 3.3–3.4×). Never 3.5× a charge: that snowballs.
      const learnedAttack = enemy.monsterId ? this.bestiary.get(enemy.monsterId)?.charges?.[enemy.charge.k] : undefined
      const def = Math.max(0, this.stats()?.def ?? 0)
      const expected = this.chargeDamageByKey.get(`${enemy.monsterId}:${enemy.charge.k}`)
        ?? (learnedAttack ? (learnedAttack * learnedAttack) / (learnedAttack + def) : Math.max(...hits.filter((hit) => !hit.isCharge).map((hit) => hit.dmg), 0) * 3.5)
      chargeDamage = Math.max(chargeDamage ?? 0, expected)
    }
    return { burst, chargeDamage, emergencyHeal: this.emergencyHealAmount }
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

  // Wearable gear in the bag: plain items by id, enhanced pieces (player.gear) by g:N.
  ownedGear() {
    const player = this.player
    if (!player) return []
    const worn = new Set(Object.values(player.equipment ?? {}))
    const instances = (player.gear ?? {}) as Record<string, GearInstance>
    const plain = Object.entries(player.inventory ?? {})
      .filter(([itemId, quantity]) => quantity > 0 && GEAR[itemId])
      .map(([itemId]) => ({ ref: itemId, itemId, plus: 0, slot: GEAR[itemId]!.slot }))
    const enhanced = Object.entries(instances)
      .filter(([number, instance]) => !worn.has(`g:${number}`) && GEAR[instance.base])
      .map(([number, instance]) => ({ ref: `g:${number}`, itemId: instance.base, plus: instance.plus ?? 0, slot: GEAR[instance.base]!.slot }))
    return [...enhanced, ...plain]
  }

  // Active skills and the ones that fit the weapon in hand.
  skillSummary() {
    const player = this.player
    const weaponType = player?.equipment?.weapon ? resolveGear(player.equipment.weapon, player.gear as Record<string, GearInstance> | undefined)?.weaponType : undefined
    const learned = (player?.learnedSkills ?? []) as string[]
    const hasUnique = Boolean((player?.unlocks as { unique?: unknown[] } | undefined)?.unique?.length)
    return {
      skillSlots: (player?.skillSlots ?? []) as string[],
      skillSlotCount: player ? skillSlotCount(player.level, hasUnique) : 0,
      skillChoices: learned.filter((skillId) => SKILLS[skillId]?.style === weaponType),
    }
  }

  // The skills that do the most damage for the weapon in hand, best first, one per slot.
  bestSkills(): string[] {
    const { skillSlotCount: count, skillChoices } = this.skillSummary()
    const measured = Object.fromEntries([...this.skillDamage].map(([skillId, damages]) => [skillId, [...damages].sort((a, b) => a - b)[Math.floor(damages.length / 2)]!]))
    return rankSkills(skillChoices, measured).slice(0, count)
  }

  async useBestSkills() {
    const best = this.bestSkills()
    const current = (this.player?.skillSlots ?? []) as string[]
    if (!best.length || best.join() === current.join()) return
    const result = await this.sendCommand({ type: 'setSkillSlots', skillIds: best }, 'refit')
    if (result.ok) this.log('mode', `Skills: ${best.join(', ')}`)
  }

  // Level + gear stats, as the game client computes them.
  stats() {
    const player = this.player
    return player ? characterStats(player.level, player.equipment, player.perks as { atk?: number, hp?: number } | undefined, player.gear as Record<string, GearInstance> | undefined) : null
  }

  // Max HP from the stat formula; the highest HP seen is only a fallback for unknown gear.
  maxHp(): { value: number | null, isEstimated: boolean } {
    const stats = this.stats()
    return stats && !stats.isEstimated ? { value: stats.maxHp, isEstimated: false } : this.client.maxHp()
  }

  hpPct(): number | null {
    const player = this.player
    const maxHp = this.maxHp().value
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
    // One hit or charge from death: act now, even inside the normal cooldown.
    const dangerAction = this.safety.isEnabled ? decideDanger(player, this.threat()) : null
    const isDangerReady = dangerAction && Date.now() - this.lastDangerActionAt > DANGER_REPEAT_MS
    if (!isDangerReady && Date.now() - this.lastSafetyActionAt < SAFETY_COOLDOWN_MS) return
    const safetyAction = isDangerReady ? dangerAction : decideSafety(player, hpPct, this.safety)
    if (!safetyAction) return
    this.isRunningSafety = true
    try {
      this.lastSafetyActionAt = Date.now()
      if (safetyAction === dangerAction) this.lastDangerActionAt = Date.now()
      this.log('safety', safetyAction.reason)
      await this.sendCommand(safetyAction.command, 'safety')
    } finally { this.isRunningSafety = false }
  }

  resume() {
    this.haltReason = null
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
    if (this.mission) await this.keepMissions()
    else if (this.isBossFarming) await this.keepBossFarming()
    else await this.keepFarming()
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

  // Stronger now: 練功 rechecks the boss, gear and farm area right away,
  // without the waits a failed boss try or a gear trip set.
  private onLevelUp() {
    this.lastBossAttempt = null
    this.lastUpgradeTripAt = 0
    setTimeout(() => this.useBestSkills().catch((error: Error) => this.log('error', error.message)), 0) // a new level may bring a new skill
    this.recheckFarmSoon()
  }

  // 練功: recheck boss, gear, potions and farm area now (after a fight or a level-up)
  // instead of waiting for the next tick. One queued at a time.
  private recheckFarmSoon() {
    if (!this.autoFarm || this.isFarmRecheckQueued) return
    this.isFarmRecheckQueued = true
    setTimeout(() => {
      this.isFarmRecheckQueued = false
      this.keepFarming().catch((error: Error) => this.log('error', error.message))
    }, FARM_RECHECK_DELAY_MS)
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
    // Strong enough for the next floor's boss? Beat it to unlock the floor (王戰 flow:
    // refit, potion check, then fight). After a failed try, wait before the next one.
    const frontier = frontierFloor(player.clearedFloors)
    const bossRoomId = `f${frontier}-bossroom`
    const isRetryTooSoon = this.lastBossAttempt?.floor === frontier && Date.now() - this.lastBossAttempt.at < BOSS_RETRY_MS
    if (WORLD_AREAS[bossRoomId] && !this.bossBlocker(frontier) && !isRetryTooSoon) {
      this.lastBossAttempt = { floor: frontier, at: Date.now() }
      this.log('mode', `Farm: strong enough for the floor ${frontier} boss — challenging it to unlock floor ${frontier + 1}`)
      const result = await this.challengeBoss(frontier)
      if (result.error) this.log('alert', `Farm: boss not fought — ${result.error}`)
      return
    }
    // Picked up something better (drops: accessories only come from monsters)? Wear it now.
    if (Date.now() - this.lastEquipCheckAt > EQUIP_CHECK_MS && this.ownedUpgradeSlots().length) {
      this.lastEquipCheckAt = Date.now()
      await this.withLock('equip', async () => {
        const swaps = await this.upgradeGear()
        if (swaps.length) this.log('mode', `Farm: wearing better gear — ${swaps.join(', ')}`)
        return { ok: true }
      })
      return
    }
    // A better piece sold in an unlocked town that we can afford? Go refit there.
    const upgradeTown = Date.now() - this.lastUpgradeTripAt > UPGRADE_REFIT_MS ? this.affordableUpgradeTown() : null
    if (upgradeTown) {
      this.lastUpgradeTripAt = Date.now() // also if it fails: don't walk back and forth
      this.log('mode', `Farm: better gear for sale in ${upgradeTown} — refitting`)
      await this.withLock('refit', () => this.refitIn(upgradeTown))
      return
    }
    const bestAreaId = safeAreaFor(player.level, 'field', frontier)
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
      // Go back only to a field it was hunting in — never into a boss room after a fight.
      if (wasHunting && homeAreaId && this.player?.areaId !== homeAreaId) await this.goTo(homeAreaId)
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
    return this.withLock('refit', () => this.refitIn(townOf(parseArea(this.player?.areaId)?.floor ?? 1)))
  }

  // The refit itself, in a given town. Caller holds the lock.
  private async refitIn(townId: string): Promise<CommandResult> {
      const player = this.player
      if (!player) return { error: 'disconnected' }
      if (this.isHunting) await this.command('stopHunt')
      const travelResult = await this.goTo(townId)
      if (travelResult.error) return travelResult
      await this.handleQuests()
      await this.useStrongestPotion()
      await this.buySupplies()
      if (this.player?.areaId !== townId) await this.goTo(townId)
      const swaps = await this.upgradeGear()
      // Higher tiers are sold on higher floors: also shop in the highest unlocked town with something better we can afford.
      const betterTown = this.affordableUpgradeTown()
      if (betterTown && betterTown !== this.player?.areaId && !(await this.goTo(betterTown)).error) swaps.push(...await this.upgradeGear())
      const enhanced = await this.enhanceGear()
      await this.useBestSkills()
      this.lastRefitAt = Date.now()
      this.log('mode', `Refit done${swaps.length ? ` — new gear: ${swaps.join(', ')}` : ''}${enhanced ? ` — ${enhanced} enhanced` : ''}`)
      return { ok: true, swaps }
  }

  // Slots where something already in the bag beats what's worn.
  ownedUpgradeSlots(): string[] {
    const player = this.player
    if (!player) return []
    const ownedIds = Object.entries(player.inventory ?? {}).filter(([, quantity]) => quantity > 0).map(([itemId]) => itemId)
    const slots = [...new Set([...Object.keys(player.equipment ?? {}), ...Object.keys(EMPTY_SLOT_FAMILIES)])]
    return slots.filter((slot) => slotUpgrades(slot, player.level, player.equipment ?? {}, player.gear as Record<string, GearInstance> | undefined, ownedIds).length)
  }

  // The highest unlocked town selling a gear upgrade this character can afford now, or null.
  affordableUpgradeTown(): string | null {
    const player = this.player
    if (!player) return null
    const slots = [...new Set([...Object.keys(player.equipment ?? {}), ...Object.keys(EMPTY_SLOT_FAMILIES)])]
    for (let floor = frontierFloor(player.clearedFloors); floor >= 1; floor--) {
      const affordable = (WORLD_AREAS[townOf(floor)]?.shop ?? []).filter((itemId) => (GEAR[itemId]?.price ?? Infinity) <= (player.col ?? 0))
      if (slots.some((slot) => slotUpgrades(slot, player.level, player.equipment ?? {}, player.gear as Record<string, GearInstance> | undefined, affordable).length)) return townOf(floor)
    }
    return null
  }

  // Recovery potions short of this character's "restock when below" level, or null.
  potionShortfall(): { count: number, needed: number } | null {
    const player = this.player
    if (!player) return null
    const potionItem = player.settings?.potionItem
    const count = potionItem ? player.inventory?.[potionItem] ?? 0 : totalPotions(player.inventory)
    const needed = stockLevelsFor(this.safety.restock, player.level).autoDrinkMin
    return count < needed ? { count, needed } : null
  }

  // 王戰: the highest boss this character can reach (the first uncleared floor, or
  // a given one). Refit in that floor's town first, check level and potions,
  // then walk to the boss room and challenge.
  // Only one of 練功 / 王戰 / 任務 runs at a time; 修整 and Stop end them all.
  stopModes() {
    if (this.autoFarm) this.setAutoFarm(null)
    if (this.mission) this.stopMissions()
    if (this.isBossFarming) this.setBossFarming(false)
  }

  setBossFarming(isOn: boolean) {
    this.isBossFarming = isOn
    this.bossFarmWaitUntil = 0
    this.log('mode', isOn ? 'Boss farming on' : 'Boss farming off')
    this.emit('settingsChanged')
  }

  // The next uncleared floor's boss: what we know of it, and what beating it takes.
  nextBoss() {
    const player = this.player
    const stats = this.stats()
    if (!player || !stats) return null
    const floor = frontierFloor(player.clearedFloors)
    const boss = this.bestiary.get(`f${floor}-boss`)
    const bossLevel = areaLevel(`f${floor}-bossroom`)
    return { floor, needLevel: bossLevel == null ? null : bossLevel + BOSS_LEVEL_MARGIN, level: boss?.level ?? null, maxHp: boss?.maxHp ?? null, atk: boss?.atk ?? null, def: boss?.def ?? null, ...bossRequirement(boss, stats, this.measuredDps()) }
  }

  // Why this character can't fight a floor's boss yet, or null if it can.
  // Boss met before: max HP must be 2× its worst 2 seconds, and once we know its
  // damage rate and our own, the fight may cost at most MAX_BOSS_HP_BARS of HP.
  // Otherwise: the level rule (boss level + BOSS_LEVEL_MARGIN).
  bossBlocker(floor: number): CommandResult | null {
    const player = this.player
    const stats = this.stats()
    if (!player || !stats) return { error: 'disconnected' }
    const need = bossRequirement(this.bestiary.get(`f${floor}-boss`), stats, this.measuredDps())
    if (need && stats.maxHp < need.hpNeeded) return { error: `The floor ${floor} boss can deal ${need.worstDamage} in 2 s — needs max HP ${need.hpNeeded}, has ${stats.maxHp}`, code: 'needHp' }
    if (need?.hpBars != null) {
      return need.hpBars <= MAX_BOSS_HP_BARS ? null : { error: `The floor ${floor} boss would take ~${need.fightSeconds} s to kill and cost ${need.hpBars} HP bars (max ${MAX_BOSS_HP_BARS})`, code: 'longFight' }
    }
    const bossRoomId = `f${floor}-bossroom`
    if (isAreaSafeFor(bossRoomId, player.level)) return null
    const bossLevel = areaLevel(bossRoomId)
    const needLevel = (bossLevel ?? 0) + BOSS_LEVEL_MARGIN
    return { error: `The floor ${floor} boss is Lv${bossLevel} — needs Lv${needLevel}`, code: 'needLevel', needLevel }
  }

  // The highest boss this character can fight, on an unlocked floor.
  bestBossFloor(): number | null {
    const player = this.player
    if (!player) return null
    for (let floor = frontierFloor(player.clearedFloors); floor >= 1; floor--) {
      if (!this.bossBlocker(floor)) return floor
    }
    return null
  }

  // 王戰 mode, every main tick: fight the best boss again as soon as it respawns;
  // refit only when potions run short.
  async keepBossFarming() {
    const player = this.player
    if (!this.isBossFarming || !player || this.haltReason || this.busyLabel || this.partyRole?.isActive || this.isInBossFight) return
    if (Date.now() < this.bossFarmWaitUntil) return
    const floor = this.bestBossFloor()
    if (!floor) { this.raiseAlert('bossFarm', 'noBossToFarm', 'No boss this character can beat yet'); return }
    this.clearAlert('bossFarm')
    const respawnMs = (player.bossCd as Record<string, number> | undefined)?.[String(floor)] ?? 0
    if (respawnMs > 0) return // still respawning: wait where we are
    const result = await this.challengeBoss(floor, { shouldRefit: this.potionShortfall() != null })
    if (result.error) {
      this.bossFarmWaitUntil = Date.now() + BOSS_FARM_WAIT_MS
      this.log('alert', `Boss farming: ${result.error} — trying again in 5 min`)
    }
  }

  async challengeBoss(floor?: number, { shouldRefit = true } = {}): Promise<CommandResult> {
    const player = this.player
    if (!player) return { error: 'disconnected' }
    const frontier = frontierFloor(player.clearedFloors)
    const bossFloor = floor ?? frontier
    const bossRoomId = `f${bossFloor}-bossroom`
    if (bossFloor > frontier) return { error: `Floor ${bossFloor} is locked` }
    const blocker = this.bossBlocker(bossFloor)
    if (blocker) return blocker
    return this.withLock(`boss: floor ${bossFloor}`, async (): Promise<CommandResult> => {
      if (shouldRefit) {
        const refitResult = await this.refitIn(townOf(bossFloor))
        if (refitResult.error) return refitResult
      }
      const shortfall = this.potionShortfall()
      if (shortfall) return { error: `Only ${shortfall.count} potions (needs ${shortfall.needed}) — not fighting the boss` }
      // Enough potions to heal back every HP bar the fight costs beyond the first.
      const stats = this.stats()
      const need = stats && bossRequirement(this.bestiary.get(`f${bossFloor}-boss`), stats, this.measuredDps())
      const healingNeeded = need?.hpBars && stats ? Math.round((need.hpBars - 1) * stats.maxHp) : 0
      if (healingNeeded > this.healingSupply()) await this.buyHealing(healingNeeded - this.healingSupply(), bossFloor)
      if (healingNeeded > this.healingSupply()) return { error: `Potions heal ${this.healingSupply()} — a ${need!.hpBars}-bar fight needs ${healingNeeded}`, code: 'needPotions' }
      const travelResult = await this.goTo(bossRoomId, { maxSteps: 30 })
      if (travelResult.error) return travelResult
      const result = await this.command('startBoss', {}, 'boss')
      if (result.ok) this.log('mode', `Challenging the floor ${bossFloor} boss`)
      return result
    })
  }

  // ---- 任務 -----------------------------------------------------------------

  startMissions() {
    this.stopModes()
    this.mission = { startedAt: Date.now(), startQuestsDone: this.player?.questsDone?.length ?? 0, failedStoryKey: null, notes: new Set() }
    this.log('mode', 'Missions: taking quests and working through them')
    this.keepMissions().catch((error: Error) => this.log('error', error.message))
  }

  stopMissions(reason = 'Missions stopped') {
    if (!this.mission) return
    this.mission = null
    this.log('mode', reason)
  }

  // One step of the 任務 run (every main tick): take quests in town, then hunt
  // / visit / fight the boss for whatever is next, turn in, and report at the end.
  async keepMissions() {
    const mission = this.mission
    const player = this.player
    if (!mission || !player || this.haltReason || this.busyLabel || this.partyRole?.isActive || this.isInBossFight) return
    const maxFloor = frontierFloor(player.clearedFloors)
    const storyKey = `${player.story?.ch}/${player.story?.step}`
    if (!Object.keys(player.quests ?? {}).length && !mission.notes.has('accepted')) { // first: pick up quests in town
      mission.notes.add('accepted')
      await this.withLock('missions: take quests', async () => { await this.goTo(townOf(parseArea(player.areaId)?.floor ?? 1)); await this.handleQuests() })
      return
    }
    const plan = planMission(player, maxFloor, { skipStory: mission.failedStoryKey === storyKey })
    for (const note of plan.skipped) if (!mission.notes.has(note)) { mission.notes.add(note); this.log('alert', `Missions: skipped ${note}`) }
    const objective = plan.objective
    if (!objective) return this.finishMissions()
    await this.actOn(objective, storyKey)
  }

  private async actOn(objective: Objective, storyKey: string) {
    const player = this.player!
    if (objective.kind === 'boss') {
      const result = await this.challengeBoss(objective.floor)
      if (result.error) { this.mission!.failedStoryKey = storyKey; this.log('alert', `Missions: ${objective.why} — ${result.error}`) }
      return
    }
    if (objective.kind === 'turnIn') {
      await this.withLock('missions: turn in', async () => { await this.goTo(townOf(parseArea(player.areaId)?.floor ?? 1)); await this.handleQuests() })
      return
    }
    const isThere = player.areaId === objective.areaId
    if (objective.kind === 'visit' && isThere) return // the game moves the story on by itself
    if (objective.kind === 'hunt' && isThere && this.isHunting) return
    await this.withLock(`missions: ${objective.why}`, async (): Promise<CommandResult> => {
      if (!isThere) {
        const travelResult = await this.goTo(objective.areaId, { maxSteps: 30 })
        if (travelResult.error) { this.log('error', `Missions: couldn't reach ${objective.areaId} (${travelResult.error})`); return travelResult }
      }
      return objective.kind === 'hunt' && !this.isHunting ? this.command('startHunt', {}, 'missions') : { ok: true }
    })
  }

  // Nothing left to do: turn in, then report what this run achieved.
  private async finishMissions() {
    const mission = this.mission!
    const player = this.player!
    await this.withLock('missions: turn in', async () => {
      if (this.isHunting) await this.command('stopHunt')
      await this.goTo(townOf(parseArea(player.areaId)?.floor ?? 1))
      await this.handleQuests()
    })
    const questsDone = (this.player?.questsDone ?? []).slice(mission.startQuestsDone)
    const exp = questsDone.reduce((sum, questId) => sum + (QUESTS[questId]?.reward.exp ?? 0), 0)
    const col = questsDone.reduce((sum, questId) => sum + (QUESTS[questId]?.reward.col ?? 0), 0)
    const minutes = Math.round((Date.now() - mission.startedAt) / 60000)
    const stillOpen = Object.keys(this.player?.quests ?? {}).length
    const story = this.player?.story
    const storyText = story?.ch ? `story: ${STORY[story.ch]?.title ?? story.ch} step ${(story.step ?? 0) + 1}` : 'no story chapter active'
    // Nothing more here: say where the next quests are (often behind the next floor boss).
    const frontier = frontierFloor(this.player?.clearedFloors)
    const doneIds = new Set(this.player?.questsDone ?? [])
    const nextQuestFloor = Math.min(...Object.entries(QUESTS).filter(([questId, quest]) => !doneIds.has(questId) && quest.floor > frontier).map(([, quest]) => quest.floor))
    const nextHint = !questsDone.length && !stillOpen && Number.isFinite(nextQuestFloor)
      ? `; next quests are on floor ${nextQuestFloor} — beat the floor ${frontier} boss (王戰) to get there` : ''
    this.log('report', `Missions report (${minutes} min): turned in ${questsDone.length} quest${questsDone.length === 1 ? '' : 's'}${questsDone.length ? ` (+${exp} EXP, +${col} gold)` : ''}`
      + `${stillOpen ? `; ${stillOpen} still open (skipped)` : ''}; ${storyText}${nextHint}`)
    this.mission = null
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
      const candidates = slotUpgrades(slot, player.level, player.equipment ?? {}, player.gear as Record<string, GearInstance> | undefined, availableIds)
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
  // The forge opens after floor 1's boss. Weapon first, on attack; everything else on max HP.
  private async enhanceGear(): Promise<number> {
    if (!(this.player?.clearedFloors ?? []).includes(1)) return 0
    let successes = 0
    // Weapon first: materials and gold run out, and it matters most.
    const slots = Object.keys(this.player?.equipment ?? {}).sort((first, second) => Number(second === 'weapon') - Number(first === 'weapon'))
    for (const slot of slots) {
      const player = this.player!
      const dir = survivalDirection(slot)
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
    const maxHp = this.maxHp()
    const stats = this.stats()
    const expNeeded = this.client.expNeeded() ?? (player ? expToNextLevel(player.level) : null)
    const inventory = player?.inventory || {}
    const kit = recommendedKit(player?.level ?? 1, frontierFloor(player?.clearedFloors))
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
      isOnMission: this.mission != null,
      isBossFarming: this.isBossFarming,
      alerts: [...this.alertsByKey.values()],
      safety: this.safety,
      player: player && {
        name: player.name,
        level: player.level,
        exp: player.exp,
        expNeeded,
        expPct: expNeeded ? Math.floor((player.exp / expNeeded) * 1000) / 10 : null,
        hp: Math.round(player.hp),
        maxHp: maxHp.value,
        isMaxHpEstimated: maxHp.isEstimated,
        hpPct: this.hpPct(),
        attack: this.client.attack() ?? stats?.atk ?? null,
        nextBoss: this.nextBoss(),
        stats: stats && { def: stats.def, speed: stats.speed, crit: stats.crit, critDmg: stats.critDmg, isEstimated: stats.isEstimated },
        equipment: player.equipment || null,
        ownedGear: this.ownedGear(),
        ...this.skillSummary(),
        gear: Object.entries(player.equipment ?? {}).map(([slot, itemId]) => {
          const instance = itemId.startsWith('g:') ? (player.gear as Record<string, GearInstance> | undefined)?.[itemId.slice(2)] : undefined
          return { slot, itemId: instance?.base ?? itemId, plus: instance?.plus ?? 0 }
        }),
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
