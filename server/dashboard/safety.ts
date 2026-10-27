// Health and potion rules (spec §6.2, §6.4). Pure decision functions — each
// Session runs them every 500 ms and sends whatever they return.

import { ITEMS, recommendedKit, shopFloorFor, totalPotions, isHealingItem, currentFloorOf, stockLevelsFor } from '#shared/game-rules'
import type { FightContext, Safety, Thresholds } from '#shared/types'
import type { GameCommand, GamePlayer } from '../sao/connector'

// Hard floors. Potion/emergency may go lower only with an explicit
// confirmation; the crystal line (<=10%) can never be lowered.
export const HARD_MIN_THRESHOLDS: Record<FightContext, Thresholds> = {
  normal: { potionPct: 25, emergencyPct: 20, crystalPct: 10 },
  boss: { potionPct: 35, emergencyPct: 20, crystalPct: 10 },
}

export const DEFAULT_SAFETY: Safety = {
  isEnabled: true,
  // 'bot': the bot drinks potions at potionPct. 'crystal': the game's own
  // auto-drink handles potions; the bot only steps in at emergency/crystal.
  healMode: 'bot',
  normal: { ...HARD_MIN_THRESHOLDS.normal },
  boss: { ...HARD_MIN_THRESHOLDS.boss },
  isAutoRestockOn: true,
  instantItem: null,
  isPotionLocked: false,
  isInstantLocked: false,
  restock: {
    autoDrinkMin: 50, autoDrinkTarget: 100, // restock when below the first number, up to the second
    instantMin: 30, instantTarget: 100,
    crystalHealMin: 10, crystalHealTarget: 30,
    teleportMin: 3, teleportTarget: 10,
    maxSpendPct: 50, // never spend more than this share of current gold on one restock
  },
}

const FIGHT_CONTEXTS: FightContext[] = ['normal', 'boss']
const THRESHOLD_KEYS: Array<keyof Thresholds> = ['potionPct', 'emergencyPct', 'crystalPct']

export type SafetyUpdate = Partial<Omit<Safety, 'normal' | 'boss' | 'restock'>> & {
  normal?: Partial<Thresholds>
  boss?: Partial<Thresholds>
  restock?: Partial<Safety['restock']>
}

// Validate a settings update. Returns { safety } or { error, needsConfirm? }.
export function validateSafety(currentSafety: Safety, update: SafetyUpdate, { isUnsafeConfirmed = false } = {}):
  { safety: Safety, error?: undefined } | { error: string, needsConfirm?: boolean } {
  const nextSafety = structuredClone(currentSafety)
  if (update.healMode != null) {
    if (!['bot', 'crystal'].includes(update.healMode)) return { error: 'healMode must be "bot" or "crystal"' }
    nextSafety.healMode = update.healMode
  }
  if (update.isEnabled != null) nextSafety.isEnabled = !!update.isEnabled
  if (update.isAutoRestockOn != null) nextSafety.isAutoRestockOn = !!update.isAutoRestockOn
  if (update.isPotionLocked != null) nextSafety.isPotionLocked = !!update.isPotionLocked
  if (update.isInstantLocked != null) nextSafety.isInstantLocked = !!update.isInstantLocked
  if (update.instantItem !== undefined) {
    if (update.instantItem !== null && ITEMS[update.instantItem]?.kind !== 'instant') return { error: 'instantItem must be an instant potion' }
    nextSafety.instantItem = update.instantItem
  }
  for (const fightContext of FIGHT_CONTEXTS) {
    for (const thresholdKey of THRESHOLD_KEYS) {
      const requested = update[fightContext]?.[thresholdKey]
      if (requested == null) continue
      const thresholdPct = Number(requested)
      const hardMin = HARD_MIN_THRESHOLDS[fightContext][thresholdKey]
      const label = `${fightContext}.${thresholdKey}`
      if (!Number.isFinite(thresholdPct) || thresholdPct < 0 || thresholdPct > 95) return { error: `${label} must be 0–95` }
      if (thresholdKey === 'crystalPct' && thresholdPct < hardMin) {
        return { error: `The crystal line can't go below ${hardMin}% — it's the last thing between the character and death.` }
      }
      if (thresholdPct < hardMin && !isUnsafeConfirmed) return { error: `${label} below ${hardMin}% needs confirmation`, needsConfirm: true }
      nextSafety[fightContext][thresholdKey] = thresholdPct
    }
  }
  for (const [restockKey, requested] of Object.entries(update.restock || {})) {
    if (!(restockKey in nextSafety.restock)) continue
    const amount = Number(requested)
    if (!Number.isFinite(amount) || amount < 0) return { error: `restock.${restockKey} must be a positive number` }
    nextSafety.restock[restockKey as keyof Safety['restock']] = amount
  }
  nextSafety.restock.maxSpendPct = Math.min(nextSafety.restock.maxSpendPct, 100)
  return { safety: nextSafety }
}

type Inventory = Record<string, number>
const isFighting = (player: GamePlayer) => ['hunting', 'boss'].includes(player.activity?.type ?? '')
const hasItem = (inventory: Inventory, itemId: string) => (inventory[itemId] ?? 0) > 0
const hasAnyHealingItem = (inventory: Inventory) => Object.entries(inventory).some(([itemId, quantity]) => isHealingItem(itemId) && quantity > 0)

export interface SafetyAction { command: GameCommand, reason: string, isCritical: boolean }

// What the fight has been throwing at us, from the game's own combat log.
export interface Threat {
  burst: number // most damage taken within one second, lately
  chargeDamage: number | null // a charged attack is coming: how hard it's expected to hit
  emergencyHeal: number // what one emergency heal (瞬補) restored last time; 0 = not seen yet
}

// Percentages can't keep up with bosses: one hit can take 40% of max HP. So when
// the next charge or two seconds of damage could kill, use the strongest heal
// that's enough — not a potion. Runs before decideSafety and ignores its cooldown.
export function decideDanger(player: GamePlayer | null, threat: Threat): SafetyAction | null {
  if (!player || player.dead || !isFighting(player)) return null
  const lethal = Math.max(threat.chargeDamage ? threat.chargeDamage * 1.15 : 0, threat.burst * 2)
  if (lethal <= 0 || player.hp > lethal) return null
  const inventory = player.inventory || {}
  const hasInstant = Object.entries(inventory).some(([itemId, quantity]) => itemId.startsWith('instant-') && quantity > 0)
  const isEmergencyReady = (player.instantCdMs ?? 0) <= 0 && hasInstant
  const why = threat.chargeDamage ? `charged attack (~${Math.round(threat.chargeDamage)}) coming` : `taking ~${Math.round(threat.burst)}/s`
  if (isEmergencyReady && player.hp + threat.emergencyHeal > lethal) {
    return { command: { type: 'emergency' }, reason: `HP ${Math.round(player.hp)} — ${why}: emergency heal`, isCritical: false }
  }
  if (hasItem(inventory, 'crystal-heal')) return { command: { type: 'use', itemId: 'crystal-heal' }, reason: `HP ${Math.round(player.hp)} — ${why}: heal crystal`, isCritical: true }
  if (isEmergencyReady) return { command: { type: 'emergency' }, reason: `HP ${Math.round(player.hp)} — ${why}: emergency heal (no heal crystal)`, isCritical: true }
  if (hasItem(inventory, 'crystal-teleport')) return { command: { type: 'use', itemId: 'crystal-teleport' }, reason: `HP ${Math.round(player.hp)} — ${why}: teleport out`, isCritical: true }
  return null
}

// What to do right now to keep the character alive, or null.
export function decideSafety(player: GamePlayer | null, hpPct: number | null, safety: Safety): SafetyAction | null {
  if (!safety.isEnabled || !player || hpPct == null || player.dead) return null
  if (!isFighting(player)) return null
  const isBossFight = player.activity!.type === 'boss'
  const thresholds = isBossFight ? safety.boss : safety.normal
  const inventory = player.inventory || {}
  const isEmergencyReady = (player.instantCdMs ?? 0) <= 0
  const hasHealing = hasAnyHealingItem(inventory)

  if (hpPct <= thresholds.crystalPct) {
    if (hasItem(inventory, 'crystal-heal')) return { command: { type: 'use', itemId: 'crystal-heal' }, reason: `HP ${hpPct}% — heal crystal`, isCritical: true }
    if (hasItem(inventory, 'crystal-teleport')) return { command: { type: 'use', itemId: 'crystal-teleport' }, reason: `HP ${hpPct}% — teleport to town`, isCritical: true }
    if (isEmergencyReady) return { command: { type: 'emergency' }, reason: `HP ${hpPct}% — no crystals, emergency heal`, isCritical: true }
    if (!isBossFight) return { command: { type: 'stopHunt' }, reason: `HP ${hpPct}% — nothing left to heal with, stopping`, isCritical: true }
  }
  if (hpPct <= thresholds.emergencyPct && isEmergencyReady) {
    return { command: { type: 'emergency' }, reason: `HP ${hpPct}% — emergency heal`, isCritical: false }
  }
  if (hpPct <= thresholds.potionPct) {
    if (safety.healMode === 'bot' && hasHealing) return { command: { type: 'drink', kind: 'potion' }, reason: `HP ${hpPct}% — potion`, isCritical: false }
    const hasAnyCrystal = hasItem(inventory, 'crystal-heal') || hasItem(inventory, 'crystal-teleport')
    if (!hasHealing && !hasAnyCrystal && !isBossFight) {
      return { command: { type: 'stopHunt' }, reason: 'Out of potions and crystals — stopping the hunt', isCritical: true }
    }
  }
  return null
}

export interface Purchase { itemId: string, quantity: number, floor: number, cost: number }
export type RestockPlan = Purchase[] | { blockedReason: string, unaffordable: string[], budget: number }

// What to buy, or { blockedReason } when gold is too short for what's needed.
export function planRestock(player: GamePlayer | null, safety: Safety, frontier: number): RestockPlan {
  if (!player) return []
  const inventory = player.inventory || {}
  const limits = stockLevelsFor(safety.restock, player.level || 1) // scaled down below Lv30
  const kit = recommendedKit(player.level || 1, frontier)
  const autoDrinkItem = player.settings?.potionItem || kit.autoDrink
  const currentFloor = currentFloorOf(player.areaId)
  const shortages: Array<{ itemId: string, quantity: number }> = []
  const addShortage = (itemId: string, owned: number, minimum: number, target: number) => {
    if (owned < minimum) shortages.push({ itemId, quantity: target - owned })
  }

  addShortage(autoDrinkItem, inventory[autoDrinkItem] ?? 0, limits.autoDrinkMin, limits.autoDrinkTarget)
  const instantItem = safety.instantItem || kit.backup
  addShortage(instantItem, inventory[instantItem] ?? 0, limits.instantMin, limits.instantTarget)
  const isAutoDrinkAPotion = /^potion-/.test(autoDrinkItem)
  if (safety.healMode === 'bot' && !isAutoDrinkAPotion) addShortage(kit.autoDrink, totalPotions(inventory), 100, 300) // spec §6.2 rule 4
  addShortage('crystal-teleport', inventory['crystal-teleport'] ?? 0, limits.teleportMin, limits.teleportTarget)
  if (frontier > 15) addShortage('crystal-heal', inventory['crystal-heal'] ?? 0, limits.crystalHealMin, limits.crystalHealTarget)

  const budget = Math.floor(((player.col ?? 0) * Math.min(limits.maxSpendPct, 100)) / 100)
  const purchases: Purchase[] = []
  const unaffordable: string[] = []
  let totalCost = 0
  // Most important first (potions); an item we can't afford doesn't block the rest.
  for (const shortage of shortages) {
    const price = ITEMS[shortage.itemId]?.price
    const shopFloor = shopFloorFor(shortage.itemId, frontier, currentFloor)
    if (!shopFloor || price == null) continue // unknown price, or not sold on a reachable floor
    const quantity = Math.min(shortage.quantity, Math.floor((budget - totalCost) / price))
    if (quantity <= 0) { unaffordable.push(shortage.itemId); continue }
    purchases.push({ itemId: shortage.itemId, quantity, floor: shopFloor, cost: quantity * price })
    totalCost += quantity * price
  }
  if (!purchases.length && unaffordable.length) return { blockedReason: `Not enough gold for ${unaffordable.join(', ')} (budget ${budget})`, unaffordable, budget }
  return purchases
}
