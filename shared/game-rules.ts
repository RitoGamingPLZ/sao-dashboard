// Game rules from the handoff spec §6 (read from the game bundle; the server
// may differ). Pure functions only — shared by the server bots and the UI.

import type { Kit, RestockLimits } from './types'

export const TOP_FLOOR = 40
// A boss never met (no learned stats yet) is fought at its level + this.
// Bosses met before go by learned HP checks instead (see bossRequirement).
export const BOSS_LEVEL_MARGIN = 1
// How many characters one dashboard runs.
export const MAX_ACCOUNTS = 10

// EXP needed to go from `level` to the next one — the game client's own formula
// (the server never sends it). Lv1 → 51, Lv7 → 3117.
// Shop gear ids are <family>-t<N>: N is the floor whose town sells it, e.g.
// weapon-t5 (sword), rapier-t5, light-t5. Families: weapon (sword), rapier,
// katana, axe, mace, shield, armor, mid, light, head, feet, acc.
export function parseGear(itemId: string | null | undefined) {
  const match = /^([a-z]+)-t(\d+)$/.exec(itemId || '')
  return match ? { family: match[1]!, tier: Number(match[2]) } : null
}
export const gearRequiredLevel = (tier: number) => Math.round(1 + (tier - 1) * 1.25)

// Better pieces of the same family as the equipped one (so a sword stays a sword),
// usable at this level, best first. Rare or enhanced pieces aren't "<family>-t<N>",
// so they're never replaced.
export function gearUpgrades(equippedId: string, level: number, availableIds: string[]): string[] {
  const equipped = parseGear(equippedId)
  return equipped ? bestGearOf(equipped.family, equipped.tier, level, availableIds) : []
}

// What an empty slot gets filled with (armour: light armour).
export const EMPTY_SLOT_FAMILIES: Record<string, string> = { offhand: 'shield', armor: 'light', head: 'head', feet: 'feet', accessory: 'acc', ring2: 'acc' }
// Two-handed in the game client: no shield alongside.
const NO_SHIELD_WEAPONS = new Set(['axe', 'katana'])

// Pieces of a family above `aboveTier`, usable at this level, best first.
export function bestGearOf(family: string, aboveTier: number, level: number, availableIds: string[]): string[] {
  return [...new Set(availableIds)]
    .map((itemId) => ({ itemId, gear: parseGear(itemId) }))
    .filter(({ gear }) => gear && gear.family === family && gear.tier > aboveTier && gearRequiredLevel(gear.tier) <= level)
    .sort((first, second) => second.gear!.tier - first.gear!.tier)
    .map(({ itemId }) => itemId)
}

export const expToNextLevel = (level: number) => Math.floor(25 * level * level * Math.pow(1.035, level) * 2)

// Unique-weapon questlines a character can be pointed at. Dashboard-only
// bookkeeping, not a game protocol field.
export const WEAPON_TYPES = ['one-handed-sword', 'rapier', 'dual-blades', 'spear', 'two-handed-sword', 'short-sword'] as const

import world from './world.json'
import gearData from './gear.json'

export interface WorldArea { floor: number, kind: string, name: string, nameZh?: string, spawns?: string[], links: string[], minLevel?: number, maxLevel?: number, aggressive?: boolean, secret?: boolean, shop?: string[] }
// Real map, copied from the game client (areas, links, monster levels).
export const WORLD_AREAS: Record<string, WorldArea> = world.areas

export interface Area { floor: number, kind: string }

export function parseArea(areaId: string | null | undefined): Area | null {
  const known = WORLD_AREAS[areaId || '']
  if (known) return { floor: known.floor, kind: known.kind }
  const match = /^f(\d+)-(.+)$/.exec(areaId || '')
  return match ? { floor: Number(match[1]), kind: match[2]! } : null
}

export const townOf = (floor: number) => `f${floor}-town`
export const areasOnFloor = (floor: number) => Object.entries(WORLD_AREAS).filter(([, area]) => area.floor === floor).map(([areaId]) => areaId)

// Strongest monster level in an area; 0 for towns, null if the map doesn't know it.
export function areaLevel(areaId: string | null | undefined): number | null {
  const area = WORLD_AREAS[areaId || '']
  if (!area) return null
  return area.kind === 'town' ? 0 : area.maxLevel ?? null
}

// Safety rule: monsters at most 1 level above you, and strictly below you
// where they attack on sight. Hidden (secret) areas are never chosen.
export function isAreaSafeFor(areaId: string, playerLevel: number): boolean {
  const area = WORLD_AREAS[areaId]
  if (!area) return false
  if (area.kind === 'town') return true
  if (area.secret || area.maxLevel == null) return false
  if (area.kind === 'bossroom') return playerLevel >= area.maxLevel + BOSS_LEVEL_MARGIN // bosses hit far harder than their level
  return area.maxLevel <= playerLevel + (area.aggressive ? -1 : 1)
}

export interface ItemInfo { name: string, kind: 'potion' | 'instant' | 'crystal', fromFloor?: number, price: number | null, heal?: number }

export const ITEMS: Record<string, ItemInfo> = {
  'potion-1': { name: '回復要水', kind: 'potion', fromFloor: 1, price: 42, heal: 150 },
  'potion-1b': { name: '中級回復要水', kind: 'potion', fromFloor: 5, price: 112, heal: 350 },
  'potion-2': { name: '高級回復要水', kind: 'potion', fromFloor: 10, price: 385, heal: 800 },
  'potion-2c': { name: '濃縮回復要水', kind: 'potion', fromFloor: 15, price: null },
  'potion-2b': { name: '上級回復要水', kind: 'potion', fromFloor: 20, price: 610, heal: 1500 },
  'potion-2d': { name: '超級回復要水', kind: 'potion', fromFloor: 25, price: null },
  'potion-3': { name: '特級回復要水', kind: 'potion', fromFloor: 30, price: 1050, heal: 3000 },
  'instant-1': { name: '急救要水', kind: 'instant', fromFloor: 1, price: 60, heal: 100 },
  'instant-2': { name: '高級急救要水', kind: 'instant', fromFloor: 10, price: 330, heal: 500 },
  'instant-3': { name: '特級急救要水', kind: 'instant', fromFloor: 30, price: 1500, heal: 2000 },
  'crystal-heal': { name: '回復水晶', kind: 'crystal', price: 2500 },
  'crystal-teleport': { name: '轉移水晶', kind: 'crystal', price: 400 },
}

// What a floor's town shop sells (consumables only), from the real map.
export function shopStock(floor: number): string[] {
  return (WORLD_AREAS[townOf(floor)]?.shop ?? []).filter((itemId) => itemId in ITEMS)
}

// The best floor to buy an item, at or below highestFloor: the current floor
// if it sells it, otherwise the highest reachable floor that does.
export function shopFloorFor(itemId: string, highestFloor: number, currentFloor: number | null): number | null {
  if (currentFloor && currentFloor <= highestFloor && shopStock(currentFloor).includes(itemId)) return currentFloor
  for (let floor = highestFloor; floor >= 1; floor--) if (shopStock(floor).includes(itemId)) return floor
  return null
}

// The strongest healing item of a kind sold in a town on floors up to `frontier`.
export function strongestSold(kind: 'potion' | 'instant', frontier: number): string | null {
  const sold = Object.entries(ITEMS).filter(([itemId, item]) => item.kind === kind && item.heal && shopFloorFor(itemId, frontier, null) != null)
  return sold.sort(([, first], [, second]) => second.heal! - first.heal!)[0]?.[0] ?? null
}

// Recommended consumables. With the highest unlocked floor: the strongest potions
// actually sold there (the level table can name ones not on sale yet).
export function recommendedKit(playerLevel: number, frontier?: number): Kit {
  const kit = levelKit(playerLevel)
  if (frontier == null) return kit
  return { ...kit, autoDrink: strongestSold('potion', frontier) ?? kit.autoDrink, backup: strongestSold('instant', frontier) ?? kit.backup }
}

// The §6.4 table, by character level.
function levelKit(playerLevel: number): Kit {
  if (playerLevel <= 12) return { autoDrink: 'potion-1', backup: 'instant-1', crystals: ['crystal-teleport'] }
  if (playerLevel <= 25) return { autoDrink: 'potion-2', backup: 'instant-2', crystals: ['crystal-teleport'] }
  if (playerLevel <= 38) return { autoDrink: 'potion-2b', backup: 'instant-2', crystals: ['crystal-heal', 'crystal-teleport'] }
  if (playerLevel <= 50) return { autoDrink: 'potion-3', backup: 'instant-3', crystals: ['crystal-heal', 'crystal-teleport'] }
  return { autoDrink: 'instant-3', backup: 'instant-3', crystals: ['crystal-heal', 'crystal-teleport'] }
}

export function frontierFloor(clearedFloors: number[] | null | undefined): number {
  const highestCleared = Math.max(0, ...(clearedFloors || []))
  return Math.min(highestCleared + 1, TOP_FLOOR)
}

// Stock levels in the settings are for Lv30+. Lower levels carry less (they can't
// afford it): 10% at Lv1, rising evenly to 100% at Lv30, rounded up, at least 1.
// maxSpendPct isn't a count, so it isn't scaled.
export function stockLevelsFor(restock: RestockLimits, level: number): RestockLimits {
  const share = 0.1 + 0.9 * Math.min(1, Math.max(0, level - 1) / 29)
  return Object.fromEntries(Object.entries(restock).map(([key, value]) =>
    [key, key === 'maxSpendPct' ? value : Math.max(1, Math.ceil(value * share))])) as unknown as RestockLimits
}

export const isHealingItem = (itemId: string) => /^(potion|instant)-/.test(itemId)

export function totalPotions(inventory: Record<string, number> | null | undefined): number {
  return Object.entries(inventory || {})
    .filter(([itemId]) => /^potion-/.test(itemId))
    .reduce((sum, [, quantity]) => sum + quantity, 0)
}

export const currentFloorOf = (areaId: string | null | undefined) => parseArea(areaId)?.floor ?? null

// Best farm for playerLevel: the safe area of that kind with the strongest
// monsters (most EXP), on floors the character has unlocked.
export function safeAreaFor(playerLevel: number, kind = 'field', maxFloor = TOP_FLOOR): string | null {
  const candidates = Object.entries(WORLD_AREAS)
    .filter(([areaId, area]) => area.kind === kind && area.floor <= maxFloor && isAreaSafeFor(areaId, playerLevel))
    .sort(([, a], [, b]) => (b.maxLevel! - a.maxLevel!) || (b.floor - a.floor))
  return candidates[0]?.[0] ?? null
}

// ---- character stats --------------------------------------------------------
// The server never sends attack, defence, speed or crit: the game client works
// them out from level + gear. This is the client's own formula (main-1nL5gxyG.js).
// ponytail: skips unique-weapon style bonuses (all 0 in the current params),
// buffs/debuffs and random affixes; pieces not in gear.json → isEstimated.

interface GearInfo { name?: string, nameZh?: string | null, slot: string, weaponType?: string, speed?: number, shield?: boolean, slow?: number, reqLevel: number, price: number | null, bonus: Partial<Record<'maxHp' | 'atk' | 'def' | 'agi' | 'crit' | 'critDmg' | 'evade' | 'block', number>> }
export const GEAR: Record<string, GearInfo> = gearData.gear as Record<string, GearInfo>
export interface SkillInfo { name: string, nameZh: string | null, style: string | null, reqLevel: number, multiplier: number | null, hits: number, targets: number, cooldownMs: number | null }
export const SKILLS: Record<string, SkillInfo> = gearData.skills as Record<string, SkillInfo>

const HP_CURVE: Array<[level: number, hp: number]> = [[1, 200], [40, 6500], [48, 7700], [70, 9900], [78, 11255], [96, 14300], [120, 17800]]
const GEAR_SLOTS = ['weapon', 'offhand', 'armor', 'head', 'feet', 'accessory', 'ring2', 'neck']

function baseMaxHp(level: number) {
  const index = HP_CURVE.findIndex(([curveLevel]) => curveLevel >= level)
  if (index <= 0) return HP_CURVE[index < 0 ? HP_CURVE.length - 1 : 0]![1]
  const [lowLevel, lowHp] = HP_CURVE[index - 1]!, [highLevel, highHp] = HP_CURVE[index]!
  return lowHp + ((highHp - lowHp) * (level - lowLevel)) / (highLevel - lowLevel)
}
const growth = (level: number) => 1 + 0.007857 * Math.pow(Math.max(0, level - 1), 1.5)

// A worn piece is an item id ("weapon-t1") or a gear instance ("g:1" → player.gear["1"]):
// a base item plus enhancements, e.g. { base: 'weapon-t1', plus: 1, enh: { sharp: 1 } }.
export interface GearInstance { base: string, plus?: number, enh?: Record<string, number> }

export function resolveGear(itemId: string, gearInstances?: Record<string, GearInstance> | null): GearInfo | null {
  if (!itemId.startsWith('g:')) return GEAR[itemId] ?? null
  const instance = gearInstances?.[itemId.slice(2)]
  const base = instance && GEAR[instance.base]
  if (!instance || !base) return null
  const enh = instance.enh ?? {}
  const bonus = { ...base.bonus }
  const level = base.reqLevel ?? 1
  const percentOf = (stat: number | undefined, count: number) => Math.max(Math.round(count), Math.round((stat ?? 0) * 0.12 * count))
  const hpStep = Math.max(10, Math.round(baseMaxHp(Math.max(1, level)) * 0.03))
  const agiStep = Math.max(2, Math.round(2 + level * 0.08))
  if (enh.sharp) bonus.atk = (bonus.atk ?? 0) + percentOf(bonus.atk, enh.sharp)
  if (enh.acc) bonus.crit = (bonus.crit ?? 0) + 0.03 * enh.acc
  if (enh.hard) bonus.def = (bonus.def ?? 0) + percentOf(bonus.def, enh.hard)
  if (enh.thick) bonus.maxHp = (bonus.maxHp ?? 0) + Math.round(Math.max(Math.round((base.bonus.maxHp ?? 0) * 0.12), hpStep) * enh.thick)
  if (enh.light) bonus.agi = (bonus.agi ?? 0) + Math.round(agiStep * enh.light)
  if (enh.vital) bonus.maxHp = (bonus.maxHp ?? 0) + Math.round(hpStep * enh.vital)
  if (enh.swift) bonus.agi = (bonus.agi ?? 0) + Math.round(agiStep * enh.swift)
  if (enh.fatal) bonus.critDmg = (bonus.critDmg ?? 0) + 0.08 * enh.fatal
  return { ...base, bonus, ...(enh.quick ? { speed: Math.round((base.speed ?? 100) + 4 * enh.quick) } : {}) }
}

// Skill slots: one at Lv1, another at Lv10 and Lv25, plus one with a unique skill (game client rule).
// Skills ranked best first by damage per second of cooldown. measured: our median
// damage per use. Skills not used yet are estimated from their multiplier ×
// hits × targets, scaled by how hard the measured ones actually hit.
export function rankSkills(skillIds: string[], measured: Record<string, number> = {}): string[] {
  const power = (skillId: string) => { const skill = SKILLS[skillId]!; return (skill.multiplier ?? 0) * (skill.hits ?? 1) * (skill.targets ?? 1) }
  const known = skillIds.filter((skillId) => SKILLS[skillId] && measured[skillId])
  const damagePerPower = known.length ? known.reduce((sum, skillId) => sum + measured[skillId]! / power(skillId), 0) / known.length : 1
  const damage = (skillId: string) => measured[skillId] ?? power(skillId) * damagePerPower
  const cooldown = (skillId: string) => SKILLS[skillId]!.cooldownMs ?? Infinity
  return skillIds.filter((skillId) => SKILLS[skillId]?.multiplier)
    .sort((first, second) => damage(second) / cooldown(second) - damage(first) / cooldown(first))
}

export const skillSlotCount = (level: number, hasUniqueSkill: boolean) => [1, 10, 25].filter((needed) => level >= needed).length + (hasUniqueSkill ? 1 : 0)

export interface CharacterStats { maxHp: number, atk: number, def: number, speed: number, crit: number, critDmg: number, evade: number, block: number, isEstimated: boolean }

export function characterStats(level: number, equipment: Record<string, string> | null | undefined, perks?: { atk?: number, hp?: number } | null, gearInstances?: Record<string, GearInstance> | null): CharacterStats {
  const hp = baseMaxHp(level)
  const stats = {
    maxHp: Math.round(hp),
    atk: Math.round((10 + 2.6 * (level - 1)) * growth(level)),
    def: Math.round((4 + 1.3 * (level - 1)) * growth(level) * (hp / ((90 + 22 * (level - 1)) * growth(level)))),
    agi: Math.round(10 + (level - 1)),
    crit: 0.05, critDmg: 0, evade: 0, block: 0,
  }
  let isEstimated = false
  for (const slot of GEAR_SLOTS) {
    const itemId = equipment?.[slot]
    if (!itemId) continue
    const item = resolveGear(itemId, gearInstances)
    if (!item) { isEstimated = true; continue } // a piece we don't have numbers for
    const share = slot === 'offhand' && !item.shield ? 0.6 : 1 // an off-hand weapon counts 60%
    const bonus = item.bonus
    stats.maxHp += Math.round((bonus.maxHp ?? 0) * share)
    stats.atk += Math.round((bonus.atk ?? 0) * share)
    stats.def += Math.round((bonus.def ?? 0) * share)
    stats.agi += Math.round((bonus.agi ?? 0) * share)
    stats.crit += (bonus.crit ?? 0) * share
    stats.critDmg += (bonus.critDmg ?? 0) * share
    stats.evade += (bonus.evade ?? 0) * share
    stats.block += (bonus.block ?? 0) * share
  }
  const weapon = equipment?.weapon ? resolveGear(equipment.weapon, gearInstances) : null
  const offhand = equipment?.offhand ? resolveGear(equipment.offhand, gearInstances) : null
  let weaponSpeed = (weapon?.speed ?? 100) / 100
  if (offhand?.slow && weapon?.weaponType !== 'mace') weaponSpeed *= 1 - offhand.slow
  if (perks?.atk) stats.atk = Math.round(stats.atk * (1 + perks.atk))
  if (perks?.hp) stats.maxHp = Math.round(stats.maxHp * (1 + perks.hp))
  const agility = stats.agi <= 0 ? stats.agi : 250 * Math.tanh(stats.agi / 250)
  const attackIntervalMs = Math.max(400, Math.round((2200 * (100 / (100 + agility * 1.5))) / weaponSpeed))
  return {
    maxHp: stats.maxHp, atk: stats.atk, def: stats.def,
    speed: Math.round(200000 / attackIntervalMs), // the game's own "speed" number
    crit: Math.min(0.9, stats.crit), critDmg: 1.6 + stats.critDmg, // crits hit for 160% + gear bonus
    evade: Math.min(0.28, Math.max(0, stats.evade)), block: stats.block,
    isEstimated,
  }
}

// ---- enhancement for survival -----------------------------------------------
// "Effective life", as the game client scores gear: HP stretched by defence,
// evade and block. Defence is weighed against an attack of `attackScale`: the
// enemy's attack when we've measured it (see enemyAttackFromHit), else our own,
// as the client does.
export function effectiveLife(stats: CharacterStats, attackScale = Math.max(1, stats.atk)): number {
  return stats.maxHp * ((attackScale + Math.max(0, stats.def)) / attackScale) / (1 - Math.min(0.9, stats.evade)) / (1 - stats.block * 0.6)
}

// Enhancement directions each kind of piece allows (game client).
export function enhanceDirections(slot: string): string[] {
  if (slot === 'weapon') return ['sharp', 'quick', 'acc']
  if (['accessory', 'ring2', 'neck'].includes(slot)) return ['vital', 'swift', 'fatal']
  return ['hard', 'thick', 'light']
}

// 強化 direction for a worn piece: weapons on attack, everything else on max HP
// (armour 'thick', accessories 'vital').
// The enemy attack behind a typical hit, if damage = attack² / (attack + defence)
// (the model the client's effective-life formula implies).
export function enemyAttackFromHit(typicalHit: number, defence: number): number {
  return (typicalHit + Math.sqrt(typicalHit * typicalHit + 4 * typicalHit * Math.max(0, defence))) / 2
}

// ---- boss requirement ------------------------------------------------------
// A monster's stats as learned from fights (server/dashboard/bestiary.ts).
export interface MonsterStats { level?: number, maxHp?: number, atk?: number, def?: number, attackMs?: number, charges?: Record<string, number>, worstWindow?: number[], damageRate?: number, samples?: number }

// The most damage a boss can do to us within 2 seconds, against our defence:
// the hardest 2 seconds anyone took in its room (boss, adds, crits, charges),
// or, if bigger, its biggest charged attack plus the plain hits it lands in that time.
// Surviving that is what counts: after it, there's time to drink a potion.
// ponytail: ignores evade/block.
export const WORST_WINDOW_MS = 2000
// Max HP needed for a boss: 2× its worst 2 s, so the danger heals (which bail out
// below ~2× the burst) don't abandon the fight.
export const BOSS_HP_MARGIN = 2
// A boss fight may cost at most this many full HP bars of damage (damage taken
// per second × kill time ÷ max HP). From 52 recorded solo fights: every fight up
// to 4.6 bars was won; deaths started at 4.9.
export const MAX_BOSS_HP_BARS = 4
const hitAgainst = (attack: number, def: number) => (attack * attack) / (attack + Math.max(0, def))
// ourDps: our measured damage per second (field and boss fights match within ~10%).
export function bossRequirement(boss: MonsterStats | null | undefined, us: CharacterStats, ourDps?: number | null) {
  if (!boss?.atk || !boss.attackMs) return null
  const normalHit = hitAgainst(boss.atk, us.def)
  const chargeAttack = Math.max(0, ...Object.values(boss.charges ?? {}))
  const chargeHit = chargeAttack ? hitAgainst(chargeAttack, us.def) : 0
  const plainHits = Math.floor(WORST_WINDOW_MS / boss.attackMs) + (chargeHit ? 0 : 1) // a charge takes one hit's place
  const seen = (boss.worstWindow ?? []).reduce((total, attack) => total + hitAgainst(attack, us.def), 0)
  const worstDamage = Math.max(chargeHit + plainHits * normalHit, seen)
  // The fight's cost: its damage per second (learned at def 0, see Bestiary) × kill time.
  const damageRate = boss.damageRate ? boss.damageRate * boss.atk / (boss.atk + Math.max(0, us.def)) : null
  const fightSeconds = boss.maxHp && ourDps ? boss.maxHp / ourDps : null
  const hpBars = damageRate && fightSeconds ? Math.round((damageRate * fightSeconds / us.maxHp) * 10) / 10 : null
  return { fightSeconds: fightSeconds && Math.round(fightSeconds), hpBars, worstDamage: Math.round(worstDamage), hpNeeded: Math.round(worstDamage * BOSS_HP_MARGIN), seenDamage: Math.round(seen), normalHit: Math.round(normalHit), chargeHit: Math.round(chargeHit), hp: us.maxHp }
}

// The game client's own "is this better" score for a piece.
export function clientGearScore(itemId: string | undefined, gearInstances?: Record<string, GearInstance> | null): number {
  const bonus = itemId ? resolveGear(itemId, gearInstances)?.bonus : null
  if (!bonus) return -Infinity
  return (bonus.atk ?? 0) * 2 + (bonus.def ?? 0) * 2 + (bonus.maxHp ?? 0) * 0.2 + (bonus.agi ?? 0) * 2 + (bonus.crit ?? 0) * 300 + (bonus.evade ?? 0) * 300
}

// Pieces (from availableIds) that beat what's worn in a slot, best first,
// by the stat that matters: attack for weapons, max HP for the rest. When that
// doesn't move (accessories: agility and crit), the client's score decides.
// Weapons and other pieces keep their family (a sword stays a sword); body armour
// may switch between heavy, medium and light for more HP.
// Enhanced pieces count with their enhancements, so a +3 is swapped only for
// something truly better. Same family as the worn piece (a sword stays a sword).
export function slotUpgrades(slot: string, level: number, equipment: Record<string, string>, gearInstances: Record<string, GearInstance> = {}, availableIds: string[] = []): string[] {
  const wornId = equipment[slot]
  const wornBase = wornId?.startsWith('g:') ? gearInstances[wornId.slice(2)]?.base : wornId
  const family = wornId ? parseGear(wornBase)?.family : EMPTY_SLOT_FAMILIES[slot]
  if (!family) return []
  if (family === 'shield' && NO_SHIELD_WEAPONS.has(resolveGear(equipment.weapon ?? '', gearInstances)?.weaponType ?? '')) return []
  const score = (itemId?: string) => {
    const stats = characterStats(level, { ...equipment, [slot]: itemId ?? '' }, null, gearInstances)
    return slot === 'weapon' ? stats.atk : stats.maxHp
  }
  const current = score(wornId)
  const currentClient = clientGearScore(wornId, gearInstances)
  const families = slot === 'armor' ? ['armor', 'mid', 'light'] : [family]
  return families.flatMap((candidateFamily) => bestGearOf(candidateFamily, 0, level, availableIds))
    .filter((itemId) => itemId !== wornId)
    .map((itemId) => ({ itemId, gain: score(itemId) - current, clientGain: clientGearScore(itemId, gearInstances) - currentClient }))
    .filter(({ gain, clientGain }) => gain > 0.5 || (Math.abs(gain) <= 0.5 && clientGain > 0))
    .sort((first, second) => (second.gain - first.gain) || (second.clientGain - first.clientGain))
    .map(({ itemId }) => itemId)
}

export function survivalDirection(slot: string): string {
  if (slot === 'weapon') return 'sharp'
  return ['accessory', 'ring2', 'neck'].includes(slot) ? 'vital' : 'thick'
}
