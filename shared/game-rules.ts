// Game rules from the handoff spec §6 (read from the game bundle; the server
// may differ). Pure functions only — shared by the server bots and the UI.

import type { Kit } from './types'

export const TOP_FLOOR = 40

// Unique-weapon questlines a character can be pointed at. Dashboard-only
// bookkeeping, not a game protocol field.
export const WEAPON_TYPES = ['one-handed-sword', 'rapier', 'dual-blades', 'spear', 'two-handed-sword', 'short-sword'] as const

import world from './world.json'

export interface WorldArea { floor: number, kind: string, name: string, links: string[], minLevel?: number, maxLevel?: number, aggressive?: boolean, secret?: boolean, shop?: string[] }
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
  if (area.kind === 'bossroom') return area.maxLevel < playerLevel // bosses hit far harder than their level
  return area.maxLevel <= playerLevel + (area.aggressive ? -1 : 1)
}

export interface ItemInfo { name: string, kind: 'potion' | 'instant' | 'crystal', fromFloor?: number, price: number | null }

export const ITEMS: Record<string, ItemInfo> = {
  'potion-1': { name: '回復要水', kind: 'potion', fromFloor: 1, price: 42 },
  'potion-1b': { name: '中級回復要水', kind: 'potion', fromFloor: 5, price: 112 },
  'potion-2': { name: '高級回復要水', kind: 'potion', fromFloor: 10, price: 385 },
  'potion-2c': { name: '濃縮回復要水', kind: 'potion', fromFloor: 15, price: null },
  'potion-2b': { name: '上級回復要水', kind: 'potion', fromFloor: 20, price: 610 },
  'potion-2d': { name: '超級回復要水', kind: 'potion', fromFloor: 25, price: null },
  'potion-3': { name: '特級回復要水', kind: 'potion', fromFloor: 30, price: 1050 },
  'instant-1': { name: '急救要水', kind: 'instant', fromFloor: 1, price: 60 },
  'instant-2': { name: '高級急救要水', kind: 'instant', fromFloor: 10, price: 330 },
  'instant-3': { name: '特級急救要水', kind: 'instant', fromFloor: 30, price: 1500 },
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

// Recommended consumables by character level (§6.4 table).
export function recommendedKit(playerLevel: number): Kit {
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
