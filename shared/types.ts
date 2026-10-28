// Types shared by the Nuxt server and the dashboard UI.

export type HealMode = 'bot' | 'crystal'
export interface Thresholds { potionPct: number, emergencyPct: number, crystalPct: number }
export interface RestockLimits {
  autoDrinkMin: number
  autoDrinkTarget: number
  crystalHealMin: number
  crystalHealTarget: number
  teleportMin: number
  teleportTarget: number
  instantMin: number
  instantTarget: number
  maxSpendPct: number
}
export interface Safety {
  isEnabled: boolean
  healMode: HealMode
  normal: Thresholds
  boss: Thresholds
  isAutoRestockOn: boolean
  // The instant potion (瞬補) to keep stocked; null = the one recommended for the level.
  instantItem: string | null
  // Locked: refit keeps this potion instead of upgrading to the strongest on sale.
  isPotionLocked: boolean
  isInstantLocked: boolean
  restock: RestockLimits
}
export type FightContext = 'normal' | 'boss'

// rest = idle in town, standby = at the area without fighting, fight = fighting monsters (or the boss) there.
export type PartyMode = 'rest' | 'standby' | 'fight'
export interface PartyGoal { areaId: string, mode: PartyMode }
export interface Party {
  id: string
  name: string
  memberIds: string[]
  leaderId: string | null
  tankId: string | null
  isActive: boolean
  goal: PartyGoal | null
  tankRetreatPct: number
}
// What the party is doing, worded by the UI: `partyStatus_<code>`; `area` is shown like a character's location.
export interface PartyStatus { code: string, params?: Record<string, string | number>, text: string }
export interface PartySummary extends Party { status: PartyStatus }
export interface PartyRole { partyId: string, partyName: string, roles: Array<'leader' | 'tank' | 'member'>, isActive: boolean }

export interface Consumables {
  autoDrink: { itemId: string, name?: string, quantity: number } | null
  instant: { itemId: string, name?: string, quantity: number }
  potionsTotal: number
  crystalHeal: number
  crystalTeleport: number
}
export interface Kit { autoDrink: string, backup: string, crystals: string[] }

export interface PlayerSummary {
  name: string
  level: number
  exp: number
  expNeeded: number | null
  expPct: number | null
  hp: number
  maxHp: number | null
  isMaxHpEstimated: boolean
  hpPct: number | null
  attack: number | null
  // Next uncleared floor's boss, from stats learned in fights (worstDamage: its most damage within 3 s, once its attack is known).
  nextBoss: { needLevel: number | null, fightSeconds?: number | null, hpBars?: number | null, floor: number, level: number | null, maxHp: number | null, atk: number | null, def: number | null, worstDamage?: number, hpNeeded?: number, normalHit?: number, chargeHit?: number, hp?: number } | null
  // From the game client's stat formula (level + gear); isEstimated when a worn piece isn't in our table.
  stats: { def: number, speed: number, crit: number, critDmg: number, isEstimated: boolean } | null
  equipment: Record<string, string> | null
  // Worn pieces with gear references resolved: g:1 → { itemId: 'weapon-t1', plus: 1 }.
  gear: Array<{ slot: string, itemId: string, plus: number }>
  // Gear in the bag that could be worn: ref is what `equip` takes (an item id, or g:N for an enhanced piece).
  ownedGear: Array<{ ref: string, itemId: string, plus: number, slot: string }>
  // Active skills, how many may be active, and the learned skills usable with the current weapon.
  skillSlots: string[]
  skillSlotCount: number
  skillChoices: string[]
  skills: string[] | null
  gold: number
  areaId: string
  areaLevel: number | null
  activity: string
  phase: string | null
  enemyCount: number
  frontierFloor: number
  miasmaStage: number
  emergencyCooldownMs: number
  isGameAutoPotionOn: boolean | null
  consumables: Consumables
  recommendedKit: Kit
  isDead: boolean
}

export interface AccountSummary {
  id: string
  account: string
  name: string
  isConnected: boolean
  isStale: boolean
  busyLabel: string | null
  haltReason: string | null
  partyRole: PartyRole | null
  preferredWeapon: string | null
  autoFarm: AutoFarm | null
  isOnMission: boolean
  isBossFarming: boolean
  alerts: Alert[]
  safety: Safety
  player: PlayerSummary | null
  rates: { goldPerHour: number | null, expPerMin: number | null }
}

// An alert the UI words in its own language: `alert_<code>` with {params}; `text` is the English fallback.
export interface Alert { code: string, params?: Record<string, string | number>, text: string }

// Keep farming the best safe area until untilLevel (null = no limit).
export interface AutoFarm { untilLevel: number | null }

export interface Snapshot { accounts: AccountSummary[], parties: PartySummary[] }

export interface LogEvent {
  ts: number
  account: string
  accountId: string
  kind: string
  detail: string
  source?: string
  // A question from the game or the bot; each choice is an action to send back.
  choices?: LogChoice[]
  // The question stops taking answers at this time (default: 10 minutes after ts).
  expiresAt?: number
  // The label of the choice already sent: a question is answered once.
  answer?: string
}

// `until`: the choice is moot once this is true of the character (e.g. it's back online).
export interface LogChoice { label: string, request: ActionRequest, until?: 'online' | 'resumed' | 'farming' }

// Body of POST /api/accounts/:id/action.
// answering/answerLabel: this request answers the log question sent at that ts.
export interface ActionRequest { answering?: number, answerLabel?: string, action: AccountAction, areaId?: string, command?: { type: string, [key: string]: unknown }, untilLevel?: number | null, name?: string }

export type AccountAction =
  | 'startHunt' | 'stopHunt' | 'startBoss' | 'stopBoss' | 'completeMission'
  | 'town' | 'goto' | 'restock' | 'resume' | 'reconnect' | 'raw' | 'farm' | 'awake' | 'partyAccept' | 'refit'

// Every dashboard API call answers with either a payload or { error }.
export type Result<T = object> = (T & { error?: undefined }) | { error: string, needsConfirm?: boolean }
