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
  maxSpendPct: number
}
export interface Safety {
  isEnabled: boolean
  healMode: HealMode
  normal: Thresholds
  boss: Thresholds
  isAutoRestockOn: boolean
  restock: RestockLimits
  haltAfterCriticalCount: number
}
export type FightContext = 'normal' | 'boss'

export interface PartyGoal { areaId: string, shouldHunt: boolean }
export interface Party {
  id: string
  name: string
  memberIds: string[]
  leaderId: string | null
  tankId: string | null
  isActive: boolean
  goal: PartyGoal | null
  tankRetreatPct: number
  shouldSyncInGame: boolean
}
export interface PartySummary extends Party { status: string }
export interface PartyRole { partyId: string, partyName: string, roles: Array<'leader' | 'tank' | 'member'>, isActive: boolean }

export interface Consumables {
  autoDrink: { itemId: string, name?: string, quantity: number } | null
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
  equipment: Record<string, string> | null
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
  alerts: string[]
  safety: Safety
  player: PlayerSummary | null
  rates: { goldPerHour: number | null, expPerMin: number | null }
}

export interface Snapshot { accounts: AccountSummary[], parties: PartySummary[] }

export interface LogEvent {
  ts: number
  account: string
  accountId: string
  kind: string
  detail: string
  source?: string
}

export type AccountAction =
  | 'startHunt' | 'stopHunt' | 'startBoss' | 'stopBoss' | 'completeMission'
  | 'town' | 'goto' | 'restock' | 'resume' | 'reconnect' | 'raw'

// Every dashboard API call answers with either a payload or { error }.
export type Result<T = object> = (T & { error?: undefined }) | { error: string, needsConfirm?: boolean }
