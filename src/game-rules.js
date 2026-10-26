// Game rules from the handoff spec §6 (read from the game bundle; the server
// may differ). Pure functions only, so they are easy to test.

export const TOP_FLOOR = 40;

export const AREA_LEVEL_OFFSETS = { town: 0, field: 1, outskirts: 1, depths: 3, labyrinth: 4, wilds: 4, secret: 9, bossroom: 6 };

// Unknown story areas are assumed as hard as the hardest normal area.
const UNKNOWN_AREA_OFFSET = 4;

export function parseArea(areaId) {
  const match = /^f(\d+)-(.+)$/.exec(areaId || '');
  return match ? { floor: Number(match[1]), kind: match[2] } : null;
}

export const townOf = (floor) => `f${floor}-town`;
export const monsterBaseLevel = (floor) => Math.round(1 + (floor - 1) * 1.25);

// Monster level of an area; 0 for towns (safe).
export function areaLevel(areaId) {
  const area = parseArea(areaId);
  if (!area) return null;
  if (area.kind === 'town') return 0;
  return monsterBaseLevel(area.floor) + (AREA_LEVEL_OFFSETS[area.kind] ?? UNKNOWN_AREA_OFFSET);
}

// Safety invariant 2: never fight at or above the player's level.
export function isAreaSafeFor(areaId, playerLevel) {
  const monsterLevel = areaLevel(areaId);
  return monsterLevel != null && monsterLevel < playerLevel;
}

export const ITEMS = {
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
};

// Shop rule (§6.4): floor N sells the last two potions with fromFloor < N,
// the last instant heal with fromFloor < N, the teleport crystal, and the
// heal crystal when N > 15. (Checked live: floors 16 and 37.)
export function shopStock(floor) {
  const itemIdsBelowFloor = (kind) => Object.entries(ITEMS)
    .filter(([, item]) => item.kind === kind && item.fromFloor < floor)
    .map(([itemId]) => itemId);
  const stock = [...itemIdsBelowFloor('potion').slice(-2), ...itemIdsBelowFloor('instant').slice(-1), 'crystal-teleport'];
  if (floor > 15) stock.push('crystal-heal');
  return stock;
}

// The best floor to buy an item, at or below highestFloor: the current floor
// if it sells it, otherwise the highest reachable floor that does.
export function shopFloorFor(itemId, highestFloor, currentFloor) {
  if (currentFloor && currentFloor <= highestFloor && shopStock(currentFloor).includes(itemId)) return currentFloor;
  for (let floor = highestFloor; floor >= 1; floor--) if (shopStock(floor).includes(itemId)) return floor;
  return null;
}

// Recommended consumables by character level (§6.4 table).
export function recommendedKit(playerLevel) {
  if (playerLevel <= 12) return { autoDrink: 'potion-1', backup: 'instant-1', crystals: ['crystal-teleport'] };
  if (playerLevel <= 25) return { autoDrink: 'potion-2', backup: 'instant-2', crystals: ['crystal-teleport'] };
  if (playerLevel <= 38) return { autoDrink: 'potion-2b', backup: 'instant-2', crystals: ['crystal-heal', 'crystal-teleport'] };
  if (playerLevel <= 50) return { autoDrink: 'potion-3', backup: 'instant-3', crystals: ['crystal-heal', 'crystal-teleport'] };
  return { autoDrink: 'instant-3', backup: 'instant-3', crystals: ['crystal-heal', 'crystal-teleport'] };
}

export function frontierFloor(clearedFloors) {
  const highestCleared = Math.max(0, ...(clearedFloors || []));
  return Math.min(highestCleared + 1, TOP_FLOOR);
}

export const isHealingItem = (itemId) => /^(potion|instant)-/.test(itemId);

export function totalPotions(inventory) {
  return Object.entries(inventory || {})
    .filter(([itemId]) => /^potion-/.test(itemId))
    .reduce((sum, [, quantity]) => sum + quantity, 0);
}

export const currentFloorOf = (areaId) => parseArea(areaId)?.floor ?? null;
