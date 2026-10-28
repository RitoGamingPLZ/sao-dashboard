// Runs against the LOCAL PRACTICE SERVER (mock/), never the real game.
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startMockServer, type MockServer } from '../mock/mock-server'
import { withProtocol } from '../server/sao/protocol'
import { applyPatch, SaoConnector, SaoApiError } from '../server/sao/connector'
import { AccountManager } from '../server/dashboard/accounts'
import { runAccountAction } from '../server/dashboard/actions'
import { decideDanger, decideSafety, validateSafety, planRestock, DEFAULT_SAFETY } from '../server/dashboard/safety'
import { validateParty, resolveGoal } from '../server/dashboard/party'
import { planMission } from '../server/dashboard/missions'
import { generatePassword } from '../server/dashboard/vault'
import { areaLevel, shopStock, isAreaSafeFor, safeAreaFor, expToNextLevel, gearUpgrades, bestGearOf, characterStats, stockLevelsFor, effectiveLife, enhanceDirections, survivalDirection, enemyAttackFromHit, bossRequirement, slotUpgrades, rankSkills, recommendedKit } from '#shared/game-rules'
import { Bestiary } from '../server/dashboard/bestiary'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitUntil(isDone: () => boolean | undefined, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) { if (isDone()) return true; await sleep(100) }
  return false
}

describe('pure rules', () => {
  test('area levels, shops, safety gate', () => {
    expect(areaLevel('f40-secret')).toBe(61)
    expect(areaLevel('f40-town')).toBe(0)
    expect(areaLevel('f1-field')).toBeNull() // not a real area
    expect([expToNextLevel(1), expToNextLevel(7)]).toEqual([51, 3117]) // the game client's formula
    expect(shopStock(16)).toEqual(['potion-2', 'potion-2c', 'instant-2', 'crystal-teleport', 'crystal-heal'])
    expect(shopStock(37)).toEqual(['potion-2d', 'potion-3', 'instant-3', 'crystal-teleport', 'crystal-heal'])
    expect(isAreaSafeFor('f40-secret', 99)).toBe(false) // hidden areas never
    expect(isAreaSafeFor('f1-west', 1)).toBe(true) // monsters Lv1-2, passive
    expect(isAreaSafeFor('f1-labyrinth', 6)).toBe(false) // Lv5-6 and aggressive
    expect(isAreaSafeFor('f1-labyrinth', 7)).toBe(true)
    expect(safeAreaFor(1, 'field', 1)).toMatch(/^f1-(west|outskirts)$/)
    expect(safeAreaFor(10, 'field', 1)).toMatch(/^f1-(horunka|depths)$/) // floor 2 still locked
    expect(safeAreaFor(7, 'bossroom', 1)).toBeNull() // boss is Lv7: needs Lv8 (1-level margin)
    expect(safeAreaFor(8, 'bossroom', 1)).toBe('f1-bossroom')
  })

  test('patch apply handles set and delete', () => {
    const state = { player: { hp: 10, buffs: { a: 1 } } }
    applyPatch(state, [[['player', 'hp'], 7], [['player', 'buffs', 'a']], [['player', 'areaId'], 'f1-town']])
    expect(state).toEqual({ player: { hp: 7, buffs: {}, areaId: 'f1-town' } })
    applyPatch(state, [[['__proto__', 'polluted'], 1], [['player', 'constructor', 'prototype', 'polluted'], 1]])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  test('safety: heal ladder and hard minimums', () => {
    const player = { name: 'p', level: 30, exp: 0, hp: 1, col: 0, areaId: 'f20-field', activity: { type: 'hunting' }, inventory: { 'potion-2': 5, 'crystal-heal': 1, 'crystal-teleport': 1 }, instantCdMs: 0 }
    expect(decideSafety(player, 24, DEFAULT_SAFETY)?.command.type).toBe('drink')
    expect(decideSafety(player, 19, DEFAULT_SAFETY)?.command.type).toBe('emergency')
    expect(decideSafety(player, 8, DEFAULT_SAFETY)?.command.itemId).toBe('crystal-heal')
    expect(decideSafety({ ...player, inventory: { 'crystal-teleport': 1 } }, 8, DEFAULT_SAFETY)?.command.itemId).toBe('crystal-teleport')
    expect(decideSafety({ ...player, activity: { type: 'idle' } }, 5, DEFAULT_SAFETY)).toBeNull()
    expect(validateSafety(DEFAULT_SAFETY, { normal: { crystalPct: 5 } }, { isUnsafeConfirmed: true }).error).toBeTruthy()
    expect(validateSafety(DEFAULT_SAFETY, { normal: { potionPct: 15 } })).toMatchObject({ needsConfirm: true })
    expect(validateSafety(DEFAULT_SAFETY, { normal: { potionPct: 15 } }, { isUnsafeConfirmed: true })).toMatchObject({ safety: { normal: { potionPct: 15 } } })
  })

  test('danger heals: replays of the four boss-room deaths (2026-10-27)', () => {
    const fighter = (hp: number, extra: object = {}) => ({ name: 'p', level: 17, exp: 0, col: 0, areaId: 'f8-bossroom', hp, activity: { type: 'boss' },
      inventory: { 'potion-1': 9, 'instant-1': 20, 'crystal-heal': 8, 'crystal-teleport': 40 }, instantCdMs: 0, ...extra })
    // alanchiu4: 1,141 HP (39%) as the floor 8 boss charged b-smash, which then hit for 1,282.
    // The percentage rules did nothing; now: emergency heal if 600 covers it, else the heal crystal.
    const smash = { burst: 400, chargeDamage: 1282, emergencyHeal: 600 }
    expect(decideSafety(fighter(1141), 39, DEFAULT_SAFETY)).toBeNull()
    expect(decideDanger(fighter(1141), smash)?.command).toEqual({ type: 'emergency' })
    expect(decideDanger(fighter(1141, { instantCdMs: 2000 }), smash)?.command).toEqual({ type: 'use', itemId: 'crystal-heal' })
    // tank1: 986 HP as the floor 14 boss charged b-charge (hit 1,513, never seen before: guessed at 3.5× a 547 hit)
    expect(decideDanger(fighter(986), { burst: 640, chargeDamage: 547 * 3.5, emergencyHeal: 600 })?.command).toEqual({ type: 'use', itemId: 'crystal-heal' })
    // tank2: 1,040 HP taking boss 576 + adds 77 + 71 in one second: two seconds of that kills
    expect(decideDanger(fighter(1040), { burst: 724, chargeDamage: null, emergencyHeal: 600 })?.command).toEqual({ type: 'emergency' })
    // No heal crystal and emergency on cooldown: get out
    expect(decideDanger(fighter(500, { instantCdMs: 1500, inventory: { 'crystal-teleport': 3 } }), { burst: 700, chargeDamage: null, emergencyHeal: 600 })?.command).toEqual({ type: 'use', itemId: 'crystal-teleport' })
    // Plenty of HP: leave it to the normal rules
    expect(decideDanger(fighter(2600), smash)).toBeNull()
  })

  test('restock plan respects gold budget', () => {
    const player = { name: 'p', level: 40, exp: 0, hp: 1, areaId: 'f37-town', col: 1000, inventory: {}, settings: { potionItem: 'potion-3' } }
    const cheapPlan = planRestock(player, DEFAULT_SAFETY, 38) // 500 budget: potion-3 (1050) no, a 400 crystal yes
    expect(Array.isArray(cheapPlan) && cheapPlan.map((purchase) => purchase.itemId)).toEqual(['crystal-teleport'])
    expect(planRestock({ ...player, col: 100 }, DEFAULT_SAFETY, 38)).toHaveProperty('blockedReason')
    const plan = planRestock({ ...player, col: 10_000_000 }, DEFAULT_SAFETY, 38)
    expect(Array.isArray(plan) && plan.map((purchase) => purchase.itemId)).toEqual(['potion-3', 'instant-3', 'crystal-teleport', 'crystal-heal'])
    // Can afford potions but not the 400-gold crystal: still buy the potions.
    const poorPlan = planRestock({ ...player, level: 3, areaId: 'f1-town', col: 320, settings: { potionItem: 'potion-1' } }, DEFAULT_SAFETY, 1)
    expect(Array.isArray(poorPlan) && poorPlan.map((purchase) => [purchase.itemId, purchase.quantity])).toEqual([['potion-1', 3]])
  })

  test('party validation', () => {
    const party = { id: 'a', name: 'A', memberIds: ['x', 'y'], leaderId: 'x', tankId: 'z', tankRetreatPct: 40, isActive: false, goal: null }
    expect(validateParty(party, [])).toMatch(/tank must be a party member/)
    expect(validateParty({ ...party, tankId: 'y' }, [{ id: 'b', name: 'B', memberIds: ['y'] }])).toMatch(/already in party/)
  })

  test('party states: rest is in town, no fighting in town, Go from rest arrives in standby', () => {
    expect(resolveGoal({ areaId: 'f1-town' }, { areaId: 'f1-west', mode: 'fight' })).toEqual({ areaId: 'f1-town', mode: 'rest' })
    expect(resolveGoal({ mode: 'rest' }, { areaId: 'f1-horunka', mode: 'fight' })).toEqual({ areaId: 'f1-town', mode: 'rest' })
    expect(resolveGoal({ areaId: 'f1-west' }, { areaId: 'f1-town', mode: 'rest' })).toEqual({ areaId: 'f1-west', mode: 'standby' })
    expect(resolveGoal({ areaId: 'f1-horunka' }, { areaId: 'f1-west', mode: 'fight' })).toEqual({ areaId: 'f1-horunka', mode: 'fight' })
    expect(resolveGoal({ mode: 'fight' }, { areaId: 'f1-town', mode: 'rest' })).toMatch(/field/)
    expect(resolveGoal({ mode: 'standby' }, null, 'f1-west')).toEqual({ areaId: 'f1-west', mode: 'standby' })
  })

  test('任務 planner: story first, then quests, then turn in; scenes go back to the player', () => {
    const at = (fields: object) => ({ level: 5, areaId: 'f1-town', quests: {}, ...fields })
    expect(planMission(at({ level: 1, story: { ch: 'prologue', step: 0 } }), 1).objective).toEqual({ kind: 'visit', areaId: 'f1-west', why: expect.stringMatching(/story/) })
    expect(planMission(at({ level: 1, story: { ch: 'prologue', step: 1 } }), 1).objective).toMatchObject({ kind: 'hunt', areaId: 'f1-west' }) // 5 boars
    expect(planMission(at({ level: 8, story: { ch: 'ch2', step: 2 } }), 1).objective).toMatchObject({ kind: 'boss', floor: 1 })
    const questsOnly = planMission(at({ story: { ch: 'ch2', step: 2 }, quests: { 'f1-nepenthes-bounty': 1 } }), 1, { skipStory: true })
    expect(questsOnly.objective).toMatchObject({ kind: 'hunt', areaId: 'f1-horunka', why: expect.stringMatching(/1\/4/) })
    expect(planMission(at({ quests: { 'f1-nepenthes-bounty': 4 } }), 1).objective).toMatchObject({ kind: 'turnIn' })
    expect(planMission(at({}), 1).objective).toBeNull()
    expect(planMission(at({ story: { ch: 'yui', step: 4 } }), 1).skipped.join()).toMatch(/needs you \(clear in f1-ug\)/)
  })

  test('stats follow the game client formula (checked against the live game)', () => {
    // alanchiu2 at Lv7 after its refit: the game reported max HP 1,209
    const stats = characterStats(7, { weapon: 'weapon-t1', armor: 'light-t1', head: 'head-t1', feet: 'feet-t1' })
    expect(stats.maxHp).toBe(1209)
    expect(stats.isEstimated).toBe(false)
    expect(characterStats(1, {}).maxHp).toBe(200)
    expect(characterStats(7, { weapon: 'some-enhanced-ref' }).isEstimated).toBe(true)
    expect(stats.critDmg).toBeCloseTo(1.6 + 0.205) // sword t1 adds crit damage
    // Enhanced pieces live in player.gear; live check: both characters at Lv13 showed max HP 2,188
    const gear = { 1: { base: 'weapon-t1', plus: 1, enh: { sharp: 1 } }, 2: { base: 'light-t1', plus: 2, enh: { hard: 2 } }, 3: { base: 'acc-t1', plus: 1, enh: { vital: 1 } } }
    const enhanced = characterStats(13, { weapon: 'g:1', armor: 'g:2', head: 'head-t1', feet: 'feet-t1', accessory: 'g:3' }, null, gear)
    expect(enhanced.isEstimated).toBe(false)
    expect(enhanced.maxHp).toBe(2188)
  })

  test('gear upgrades compare real stats, so enhanced pieces are swapped only for something better', () => {
    const shop = ['weapon-t1', 'weapon-t5', 'rapier-t5', 'light-t5']
    const lightly = { 1: { base: 'weapon-t1', enh: { sharp: 1 } } }
    expect(slotUpgrades('weapon', 10, { weapon: 'g:1' }, lightly, shop)).toEqual(['weapon-t5']) // a sword stays a sword
    const heavily = { 1: { base: 'weapon-t1', enh: { sharp: 40 } } }
    expect(slotUpgrades('weapon', 10, { weapon: 'g:1' }, heavily, shop)).toEqual([])
    expect(slotUpgrades('weapon', 3, { weapon: 'weapon-t1' }, {}, shop)).toEqual([]) // t5 needs Lv6
    expect(slotUpgrades('armor', 10, { weapon: 'weapon-t1' }, {}, shop)).toEqual(['light-t5']) // empty slot gets filled
    // Accessories add agility and crit, not life: the client's own score picks them
    expect(slotUpgrades('accessory', 10, { weapon: 'weapon-t1' }, {}, ['acc-t1', 'acc-t5'])).toEqual(['acc-t5', 'acc-t1'])
    expect(slotUpgrades('ring2', 10, { weapon: 'weapon-t1', accessory: 'acc-t5' }, {}, ['acc-t1'])).toEqual(['acc-t1'])
    expect(slotUpgrades('accessory', 10, { accessory: 'acc-t5' }, {}, ['acc-t1'])).toEqual([])
    // Off-hand: a shield, but not next to a two-handed axe or katana
    expect(slotUpgrades('offhand', 10, { weapon: 'weapon-t5' }, {}, ['shield-t1', 'shield-t5'])).toEqual(['shield-t5', 'shield-t1'])
    expect(slotUpgrades('offhand', 10, { weapon: 'axe-t5' }, {}, ['shield-t5'])).toEqual([])
  })

  test('skills: best damage per second of cooldown first, measured where we can', () => {
    // From the table alone: slant 1.6/6 s beats vertical 2/8 s and sonic-leap 2.6/11 s
    expect(rankSkills(['sonic-leap', 'vertical', 'slant'])).toEqual(['slant', 'vertical', 'sonic-leap'])
    // Measured (Archer, Lv20): vertical hits 385 vs slant 259 → vertical first; sonic-leap estimated at ~2.6 × 177
    expect(rankSkills(['slant', 'vertical', 'sonic-leap'], { slant: 259, vertical: 385 })).toEqual(['vertical', 'slant', 'sonic-leap'])
  })

  test('potions: the strongest actually on sale on unlocked floors', () => {
    expect(recommendedKit(15).autoDrink).toBe('potion-2') // the level table alone…
    expect(recommendedKit(15, 5)).toMatchObject({ autoDrink: 'potion-1b', backup: 'instant-1' }) // …but floor 10's potions aren't reachable yet
    expect(recommendedKit(15, 10)).toMatchObject({ autoDrink: 'potion-2', backup: 'instant-2' })
  })

  test('stock levels scale with level: 10% at Lv1, the full amounts at Lv30', () => {
    const lv30 = { autoDrinkMin: 50, autoDrinkTarget: 100, instantMin: 30, instantTarget: 100, crystalHealMin: 10, crystalHealTarget: 30, teleportMin: 3, teleportTarget: 10, maxSpendPct: 50 }
    expect(stockLevelsFor(lv30, 1)).toEqual({ ...lv30, autoDrinkMin: 5, autoDrinkTarget: 10, instantMin: 3, instantTarget: 10, crystalHealMin: 1, crystalHealTarget: 3, teleportMin: 1, teleportTarget: 1 })
    expect(stockLevelsFor(lv30, 30)).toEqual(lv30)
    expect(stockLevelsFor(lv30, 80)).toEqual(lv30)
  })

  test('refit enhances weapons for attack and everything else for max HP', () => {
    expect(survivalDirection('weapon')).toBe('sharp')
    for (const slot of ['armor', 'head', 'feet', 'offhand']) expect(survivalDirection(slot)).toBe('thick')
    for (const slot of ['accessory', 'ring2', 'neck']) expect(survivalDirection(slot)).toBe('vital')
    // and each adds HP: one 'thick' on light-t5 raises max HP
    const plain = characterStats(16, { armor: 'light-t5' }).maxHp
    expect(characterStats(16, { armor: 'g:1' }, null, { 1: { base: 'light-t5', enh: { thick: 1 } } }).maxHp).toBeGreaterThan(plain)
  })

  test('generated passwords are strong', () => {
    const password = generatePassword()
    expect(password).toHaveLength(16)
    expect(password).toMatch(/[a-z]/)
    expect(password).toMatch(/[A-Z]/)
    expect(password).toMatch(/\d/)
  })
})

describe('against the practice server', () => {
  let mock: MockServer
  let accounts: AccountManager
  let connector: SaoConnector
  let dataDir: string
  const sessionNamed = (account: string) => accounts.findByAccount(account)!

  beforeAll(async () => {
    mock = await startMockServer({ port: 0, damagePerTick: 0 })
    mock.createAccount('tank_one', 'practice-pass-1', 34, 'TankChar')
    mock.createAccount('dps_two', 'practice-pass-2', 31)
    dataDir = mkdtempSync(join(tmpdir(), 'sao-dash-'))
    const protocol = withProtocol({ baseUrl: `http://127.0.0.1:${mock.port}`, wsUrl: `ws://127.0.0.1:${mock.port}/api/ws`, origin: null, travelStepMs: 50 })
    connector = new SaoConnector(protocol)
    accounts = new AccountManager({ protocol, dataDir, sessionTiming: { safetyMs: 100, mainMs: 60000 }, partyTickMs: 200 })
  })

  afterAll(() => { accounts.shutdown(); mock.close(); rmSync(dataDir, { recursive: true, force: true }) })

  test('connector: link logs in, wrong password is a typed error', async () => {
    expect((await connector.link({ account: 'tank_one', password: 'practice-pass-1' })).token).toBeTruthy()
    await expect(connector.link({ account: 'tank_one', password: 'nope' })).rejects.toMatchObject({ code: 'wrongLogin', status: 401 })
    await expect(connector.link({ account: 'tank_one', password: 'nope' })).rejects.toBeInstanceOf(SaoApiError)
  })

  test('add accounts by login; secrets stay out of settings', async () => {
    expect((await accounts.addByLogin('tank_one', 'nope')).error).toMatch(/Wrong account or password/)
    expect((await accounts.addByLogin('tank_one', 'practice-pass-1', { shouldRememberPassword: true })).error).toBeUndefined()
    expect((await accounts.addByLogin('dps_two', 'practice-pass-2')).error).toBeUndefined()
    expect(await waitUntil(() => sessionNamed('tank_one').player?.level === 34)).toBe(true)
    expect(sessionNamed('tank_one').name).toBe('TankChar') // shows the character, logs in with the account
    expect(readFileSync(join(dataDir, 'settings.json'), 'utf8')).not.toContain('practice-pass-1')
    expect(readFileSync(join(dataDir, 'vault.enc')).toString('latin1')).not.toContain('practice-pass-1')
  })

  test('create a new account with a generated password', async () => {
    const result = await accounts.createAccount('fresh_alt', 'FreshHero')
    if (result.error !== undefined) throw new Error(result.error)
    expect(result.password).toHaveLength(16)
    expect(mock.accountsByName.get('fresh_alt').password).toBe(result.password)
    expect(mock.accountsByName.get('fresh_alt').player.name).toBe('FreshHero')
    expect(accounts.revealPassword(result.id)).toEqual({ password: result.password })
    expect(JSON.stringify(accounts.snapshot())).not.toContain(result.password)
    expect((await accounts.createAccount('tank_one', 'Whatever')).error).toMatch(/already/)
    const generated = await accounts.createAccount('', 'NameOnly') // character name only: username generated
    expect(generated).toMatchObject({ name: 'NameOnly', account: expect.stringMatching(/^sao[0-9a-f]{9}$/) })
    expect(mock.accountsByName.get(generated.account!).player.name).toBe('NameOnly')
  })

  test('an expired token logs in again with the saved password', async () => {
    const tank = sessionNamed('tank_one')
    mock.expireToken('tank_one')
    expect(await waitUntil(() => !tank.isConnected, 3000)).toBe(true)
    expect(await waitUntil(() => tank.isConnected, 10000)).toBe(true)
  })

  test('an expired token without a saved password stops and alerts', async () => {
    const dps = sessionNamed('dps_two')
    mock.expireToken('dps_two')
    expect(await waitUntil(() => dps.summary().alerts.some((alert) => alert.code === 'ended_unauthorized' && /Login rejected/.test(alert.text)), 10000)).toBe(true)
    expect(dps.client.endReason).toBe('unauthorized')
  })

  test('bot heals itself when HP drops', async () => {
    const tank = mock.accountsByName.get('tank_one').player
    tank.areaId = 'f20-wilds'
    tank.activity = { type: 'hunting' }
    tank.hp = 1000 // 20% of 5000 → emergency heal
    expect(await waitUntil(() => tank.hp > 1000 && tank.instantCdMs > 0)).toBe(true)
    tank.activity = { type: 'idle' }
  })

  test('王戰 farms the highest boss it can beat, fights it again after each kill, and stops on a second press', async () => {
    const session = sessionNamed('tank_one')
    const player = mock.accountsByName.get('tank_one').player // Lv34, floors 1–24 cleared
    expect(session.bestBossFloor()).toBe(22) // floor 22 boss is Lv33 (needs 34); 23+ are Lv35+
    expect(await runAccountAction(session, { action: 'startBoss' })).toMatchObject({ ok: true })
    expect(await waitUntil(() => player.activity.type === 'boss', 15000)).toBe(true)
    expect(player.areaId).toBe('f22-bossroom')
    player.activity = { type: 'idle' } // the boss dies…
    await waitUntil(() => session.player?.activity?.type === 'idle')
    await session.keepBossFarming() // …and the next round starts as soon as it's back
    expect(player.activity.type).toBe('boss')
    expect(await runAccountAction(session, { action: 'startBoss' })).toMatchObject({ ok: true })
    expect(session.isBossFarming).toBe(false)
    player.activity = { type: 'idle' }
    await waitUntil(() => session.busyLabel == null)
  })

  test('練功 simulation: from Lv1, floors are cleared in order as soon as the level allows', async () => {
    mock.createAccount('climber', 'practice-pass-c', 1, 'Climber')
    expect((await accounts.addByLogin('climber', 'practice-pass-c')).error).toBeUndefined()
    const session = sessionNamed('climber')
    const player = mock.accountsByName.get('climber').player
    Object.assign(player, { level: 1, areaId: 'f1-town', clearedFloors: [], equipment: {}, activity: { type: 'idle' } })
    await waitUntil(() => session.player?.level === 1 && session.player.areaId === 'f1-town')
    session.setAutoFarm({ untilLevel: null })
    const bossFights: Array<{ floor: number, level: number }> = []
    // The test plays the game: hunting gives a level per round, a boss fight is a win.
    for (let round = 0; round < 60; round++) {
      await waitUntil(() => session.busyLabel == null) // a level-up recheck may be on its way somewhere
      await session.keepFarming()
      if (player.activity.type === 'boss') {
        const floor = Number(/^f(\d+)-bossroom$/.exec(player.areaId)?.[1])
        bossFights.push({ floor, level: player.level })
        if (!player.clearedFloors.includes(floor)) player.clearedFloors.push(floor)
        player.activity = { type: 'idle' }
      } else if (player.activity.type === 'hunting' && player.level < 16) {
        player.level += 1 // levels stop at 16 so the end state is known
      }
      await waitUntil(() => session.player?.level === player.level && session.player.clearedFloors?.length === player.clearedFloors.length
        && session.player.activity?.type === player.activity.type)
    }
    session.setAutoFarm(null)
    const bossLevel = (floor: number) => areaLevel(`f${floor}-bossroom`)!
    expect(player.level).toBe(16)
    // Never fought a boss below its level + 1
    for (const fight of bossFights) expect(fight.level).toBeGreaterThanOrEqual(bossLevel(fight.floor) + 1)
    // Floors cleared in order, none skipped, none fought twice
    expect(bossFights.map((fight) => fight.floor)).toEqual(bossFights.map((_, index) => index + 1))
    // Kept pace: at Lv16 every boss up to Lv15 is beaten (floor 7's), and floor 8's (Lv16, needs 17) isn't
    expect(player.clearedFloors).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(bossLevel(8) + 1).toBeGreaterThan(16)
  }, 180_000)

  test('party: leader leads, tank fights first, others follow, in-game sync sends invites', async () => {
    const tank = sessionNamed('tank_one')
    const dps = sessionNamed('fresh_alt')
    mock.accountsByName.get('fresh_alt').player.level = 31
    await waitUntil(() => dps.player?.level === 31)
    const { partyManager } = accounts
    const party = partyManager.create('Raid')
    expect((await partyManager.update(party.id, { memberIds: [dps.id, tank.id], leaderId: dps.id, tankId: tank.id })).error).toBeUndefined()
    expect((await partyManager.activate(party.id, { areaId: 'f40-secret' })).error).toMatch(/monster level/)
    expect((await partyManager.activate(party.id, { areaId: 'f22-lake', mode: 'fight' })).error).toBeUndefined()
    await waitUntil(() => mock.partyLog.length >= 2)
    expect(mock.partyLog).toEqual(expect.arrayContaining([
      { from: 'fresh_alt', op: 'invite', name: 'TankChar' },
      { from: 'tank_one', op: 'accept', name: 'FreshHero' },
    ]))
    const tankPlayer = mock.accountsByName.get('tank_one').player
    const dpsPlayer = mock.accountsByName.get('fresh_alt').player
    expect(await waitUntil(() => tankPlayer.areaId === 'f22-lake' && dpsPlayer.areaId === 'f22-lake', 15000)).toBe(true)
    expect(await waitUntil(() => tankPlayer.activity.type === 'hunting' && dpsPlayer.activity.type === 'hunting')).toBe(true)
    tankPlayer.hp = 1500 // 30% < 40% retreat → others stop and wait
    expect(await waitUntil(() => dpsPlayer.activity.type === 'idle')).toBe(true)
    await partyManager.deactivate(party.id)
    await partyManager.remove(party.id)
    expect(tank.partyRole).toBeNull() // deleting the party frees its members
    expect(dps.partyRole).toBeNull()
  })

  test('removed accounts are remembered: one-click back with a saved password, forget deletes it', async () => {
    accounts.removeAccount(sessionNamed('dps_two').id) // logged in without saving the password
    const tankId = sessionNamed('tank_one').id // saved its password
    accounts.removeAccount(tankId)
    expect(accounts.listPrevious()).toEqual(expect.arrayContaining([
      { account: 'tank_one', name: 'TankChar', hasPassword: true },
      { account: 'dps_two', name: expect.any(String), hasPassword: false },
    ]))
    expect(await accounts.restorePrevious('tank_one')).toMatchObject({ id: tankId })
    expect(accounts.findByAccount('tank_one')).toBeTruthy()
    expect((await accounts.restorePrevious('dps_two')).error).toMatch(/password/)
    accounts.forgetPrevious('dps_two')
    expect(accounts.listPrevious()).toEqual([])
    expect(await waitUntil(() => sessionNamed('tank_one').isConnected)).toBe(true)
  })

  test('a log question takes one answer only', () => {
    const session = sessionNamed('tank_one')
    session.log('prompt', 'Test question', { choices: [{ label: 'Yes', request: { action: 'resume' } }] })
    const question = session.events.at(-1)!
    expect(session.markAnswered(question.ts, 'Yes')).toBe(true)
    expect(session.markAnswered(question.ts, 'Yes')).toBe(false)
    expect(question.answer).toBe('Yes')
  })

  test('修整 refit: swaps in the highest-tier same-family gear any unlocked town sells', async () => {
    const session = sessionNamed('fresh_alt')
    const player = mock.accountsByName.get('fresh_alt').player
    await waitUntil(() => session.busyLabel == null)
    player.areaId = 'f5-town' // sells weapon-t5, light-t5, rapier-t5, …
    player.activity = { type: 'idle' }
    player.equipment = { weapon: 'weapon-t1', armor: 'light-t1' } // head, feet, accessory empty
    await waitUntil(() => session.player?.equipment?.weapon === 'weapon-t1')
    expect(await session.refit()).toMatchObject({ ok: true })
    // Lv31 with floors to 26 open: tier 25 (needs Lv31) from the floor 25 town beats floor 5's
    expect(player.equipment).toEqual({ weapon: 'weapon-t25', offhand: 'shield-t25', armor: 'armor-t25', head: 'head-t25', feet: 'feet-t25' }) // heavy armour: the most HP
    expect(player.inventory['weapon-t1']).toBe(1) // the old piece is back in the bag
  })

  test('練功 challenges the next floor boss once strong enough', async () => {
    const session = sessionNamed('fresh_alt')
    const player = mock.accountsByName.get('fresh_alt').player // floors 1–24 cleared: next boss is floor 25, Lv37 → needs Lv38
    await waitUntil(() => session.busyLabel == null)
    player.level = 41 // also enough for floor 26 (Lv38) after the win
    player.inventory['potion-1'] = 200
    await waitUntil(() => session.player?.level === 41)
    session.setAutoFarm({ untilLevel: null })
    await session.keepFarming()
    expect(player.areaId).toBe('f25-bossroom')
    expect(player.activity.type).toBe('boss')
    expect(session.autoFarm).not.toBeNull() // farming carries on after the fight
    // Win: floor 25 cleared → the floor 26 boss (Lv38) is next, with no 30-minute wait
    player.clearedFloors.push(25)
    player.activity = { type: 'idle' }
    await waitUntil(() => session.player?.clearedFloors?.includes(25) && session.player.activity?.type === 'idle')
    await session.keepFarming()
    expect(player.areaId).toBe('f26-bossroom')
    expect(player.activity.type).toBe('boss')
    session.setAutoFarm(null)
    player.activity = { type: 'idle' }
    player.level = 31
    await waitUntil(() => session.player?.level === 31)
  })

  test('a boss met before is fought once max HP is 2× its worst 3 seconds, whatever the level', () => {
    const session = sessionNamed('fresh_alt') // Lv31: the level rule says the floor 25 boss (Lv37) needs Lv38
    expect(session.bossBlocker(25)?.code).toBe('needLevel')
    const maxHp = session.stats()!.maxHp
    const teach = (bossId: string, dmg: number) => {
      for (let i = 0; i < 3; i++) accounts.bestiary.recordLog({ key: 'enemyAttack', p: { m: { m: bossId }, dmg, crit: 0, miss: 0 } }, { atk: 100, def: 0 })
      accounts.bestiary.recordEnemies([{ monsterId: bossId, hp: 5000, attackTimerMs: 2000 }])
    }
    const report = (bossId: string, takenPerSec: number) => accounts.bestiary.recordLog({ key: 'bossReport', p: { m: { m: bossId }, sec: 100, r: { rows: [['fresh_alt', 1, takenPerSec * 100]] } } }, { atk: 100, def: 0 }, { fighter: 'x', name: 'fresh_alt', areaId: `${bossId.split('-')[0]}-bossroom` })
    for (let t = 0; t < 300; t++) (session as any).rememberCombat({ key: 'attack', t: t * 1000, p: { dmg: 100 } }) // we deal 100 per s
    expect(session.measuredDps()).toBeCloseTo(100)
    teach('f25-boss', Math.round(maxHp / 6)) // two plain hits in 3 s = a third of the HP: fine
    expect(session.bossBlocker(25)?.code).toBe('needLevel') // no boss report yet: the level rule still applies
    report('f25-boss', Math.round(maxHp / 100)) // 5000 HP in 50 s, taking 1% HP per s: half a bar
    expect(session.bossBlocker(25)).toBeNull()
    teach('f24-boss', Math.round(maxHp / 3)) // two hits = two thirds of the HP: under 2×, not fought
    expect(session.bossBlocker(24)).toMatchObject({ code: 'needHp' })
    teach('f23-boss', Math.round(maxHp / 6))
    report('f23-boss', Math.round(maxHp / 5)) // 20% HP per s (before our defence) over a 50 s fight: far over 4 bars
    expect(session.bossBlocker(23)).toMatchObject({ code: 'longFight' })
  })

  test('a boss fight short of potions buys the difference first, then fights', async () => {
    const session = sessionNamed('fresh_alt') // still has the 100 dps measured in the last test
    const player = mock.accountsByName.get('fresh_alt').player
    await waitUntil(() => session.busyLabel == null)
    const stats = session.stats()!
    for (let i = 0; i < 3; i++) accounts.bestiary.recordLog({ key: 'enemyAttack', p: { m: { m: 'f22-boss' }, dmg: Math.round(stats.maxHp / 6), crit: 0, miss: 0 } }, { atk: 100, def: 0 })
    accounts.bestiary.recordEnemies([{ monsterId: 'f22-boss', hp: 5000, attackTimerMs: 2000 }]) // a 50 s fight
    const atk = accounts.bestiary.get('f22-boss')!.atk!
    const ratePerBar = (stats.maxHp / 50) * (atk + stats.def) / atk // taken/s (at def 0) that costs one bar
    accounts.bestiary.recordLog({ key: 'bossReport', p: { m: { m: 'f22-boss' }, sec: 100, r: { rows: [['fresh_alt', 1, Math.round(ratePerBar * 3.8 * 100)]] } } }, { atk: 100, def: 0 }, { fighter: 'x', name: 'fresh_alt', areaId: 'f22-bossroom' })
    expect(session.bossBlocker(22)).toBeNull()
    // 50 small potions (the restock minimum) heal 7,500: less than the ~2.8 bars this fight needs healed
    expect(2.8 * stats.maxHp).toBeGreaterThan(7500)
    player.settings = { ...player.settings, potionItem: 'potion-1' }
    player.inventory = { 'potion-1': 50 }
    player.col = 1_000_000
    await waitUntil(() => session.player?.inventory?.['potion-1'] === 50 && !session.player.inventory['instant-2'])
    const result = await session.challengeBoss(22, { shouldRefit: false })
    expect(result.error).toBeUndefined()
    expect(session.healingSupply()).toBeGreaterThanOrEqual(2.7 * stats.maxHp)
    expect(player.areaId).toBe('f22-bossroom')
    player.activity = { type: 'idle' }
    await waitUntil(() => session.player?.activity?.type === 'idle')
  })

  test('a coming charged attack: learned value at our defence, else 3.5× a normal hit (never 3.5× a charge)', async () => {
    const session = sessionNamed('fresh_alt')
    const player = mock.accountsByName.get('fresh_alt').player
    const hit = (dmg: number, k?: string) => (session as any).rememberCombat({ key: 'enemyAttack', t: 0, p: { m: { m: 'f9-boss' }, dmg, ...(k ? { k: { k } } : {}) } })
    for (let i = 0; i < 3; i++) hit(100)
    hit(600, 'smash') // a charge already landed: not the yardstick for the next unknown one
    player.enemies = [{ monsterId: 'f9-boss', hp: 5000, attackTimerMs: 1000, charge: { k: 'never-seen' } }]
    await waitUntil(() => (session.player?.enemies as any[])?.[0]?.charge?.k === 'never-seen')
    expect(session.threat().chargeDamage).toBe(350)
    // Learned by another character as an attack of 800: converted to our defence
    accounts.bestiary.recordLog({ key: 'enemyAttack', p: { m: { m: 'f9-boss' }, k: { k: 'quake' }, dmg: 800 } }, { atk: 100, def: 0 })
    player.enemies = [{ monsterId: 'f9-boss', hp: 5000, attackTimerMs: 1000, charge: { k: 'quake' } }]
    await waitUntil(() => (session.player?.enemies as any[])?.[0]?.charge?.k === 'quake')
    const def = session.stats()!.def
    expect(session.threat().chargeDamage).toBeCloseTo(800 * 800 / (800 + def))
    player.enemies = []
  })

  test('refit upgrades potions to the strongest on sale, unless locked', async () => {
    const session = sessionNamed('fresh_alt') // Lv31, floors to 26 open: 上級回復要水 (potion-2b) is on sale
    const player = mock.accountsByName.get('fresh_alt').player
    player.settings = { ...player.settings, potionItem: 'potion-1' }
    await waitUntil(() => session.player?.settings?.potionItem === 'potion-1')
    session.safety.isPotionLocked = true
    await session.useStrongestPotion()
    expect(player.settings.potionItem).toBe('potion-1')
    session.safety.isPotionLocked = false
    await session.useStrongestPotion()
    expect(player.settings.potionItem).toBe('potion-2b')
    session.safety.instantItem = 'instant-1'
    session.safety.isInstantLocked = true
    await session.useStrongestPotion()
    expect(session.safety.instantItem).toBe('instant-1')
    session.safety.isInstantLocked = false
    await session.useStrongestPotion()
    expect(session.safety.instantItem).toBeNull() // automatic again: the strongest on sale
  })

  test('練功 rechecks right after each fight (a pack of kills queues one recheck)', async () => {
    const session = sessionNamed('fresh_alt')
    const original = session.keepFarming.bind(session)
    let rechecks = 0
    session.keepFarming = async () => { rechecks++ }
    session.autoFarm = { untilLevel: null }
    for (let i = 0; i < 3; i++) (session as any).logGameEntry({ t: 0, key: 'kill', kind: 'combat', p: { m: { m: 'f1-boar' } } })
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(rechecks).toBe(1)
    session.autoFarm = null
    ;(session as any).logGameEntry({ t: 0, key: 'kill', kind: 'combat', p: { m: { m: 'f1-boar' } } })
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(rechecks).toBe(1) // 練功 off: nothing
    session.keepFarming = original
  })

  test('keep farming: goes out to hunt, then stops at the target level and asks what next', async () => {
    const session = sessionNamed('fresh_alt')
    const player = mock.accountsByName.get('fresh_alt').player
    await waitUntil(() => session.busyLabel == null)
    expect(await runAccountAction(session, { action: 'farm', untilLevel: player.level + 1 })).toMatchObject({ ok: true })
    expect(await waitUntil(() => session.isHunting && session.player?.areaId?.endsWith('-town') === false, 15000)).toBe(true)
    player.level += 1
    await waitUntil(() => session.player?.level === player.level)
    await session.keepFarming() // the main loop runs this every 10 s
    expect(session.autoFarm).toBeNull()
    const question = session.events.findLast((event) => event.choices?.length)
    expect(question?.detail).toMatch(/farming done/)
    expect(question?.choices?.map((choice) => choice.label)).toContain('Keep farming')
  })
})

describe('bestiary', () => {
  test('learns a boss from fights and says how much effective life it takes', () => {
    const book = new Bestiary()
    const us = { atk: 100, def: 50 }
    const hit = (atk: number, def: number) => Math.round(atk * atk / (atk + def))
    book.recordLog({ key: 'bossOpen', p: { m: { m: 'f3-boss' }, lv: 12 } }, us)
    for (let i = 0; i < 5; i++) {
      book.recordLog({ key: 'enemyAttack', p: { m: { m: 'f3-boss' }, dmg: hit(300, 50), crit: 0, miss: 0 } }, us) // boss atk 300
      book.recordLog({ key: 'attack', p: { m: { m: 'f3-boss' }, dmg: hit(100, 60), crit: 0, miss: 0 } }, us) // boss def 60
    }
    book.recordLog({ key: 'enemyAttack', p: { m: { m: 'f3-boss' }, dmg: 9999, crit: 1, miss: 0 } }, us) // crits are left out
    book.recordLog({ key: 'enemyAttack', p: { m: { m: 'f3-boss' }, k: { k: 'smash' }, dmg: 800 } }, us)
    book.recordEnemies([{ monsterId: 'f3-boss', hp: 4000, attackTimerMs: 2000 }, { monsterId: 'f3-boss', hp: 2500, attackTimerMs: 300 }])
    const boss = book.get('f3-boss')!
    expect(boss).toMatchObject({ level: 12, maxHp: 4000, attackMs: 2000 })
    expect(Math.abs(boss.atk! - 300)).toBeLessThanOrEqual(2)
    expect(Math.abs(boss.def! - 60)).toBeLessThanOrEqual(2)

    const stats = characterStats(20, { weapon: 'weapon-t1' })
    const need = bossRequirement(boss, stats)!
    // charge stored as the attack behind 800 dmg at def 50; worst 3 s = that charge + one plain hit (2 s interval)
    expect(boss.charges!.smash).toBe(Math.round(enemyAttackFromHit(800, 50)))
    const against = (atk: number) => atk * atk / (atk + stats.def)
    expect(need.worstDamage).toBe(Math.round(against(boss.charges!.smash!) + against(boss.atk!)))
    expect(need.hp).toBe(stats.maxHp)
    expect(Math.abs(need.hpNeeded - need.worstDamage * 2)).toBeLessThanOrEqual(1)
    book.recordEnemies([{ monsterId: 'f3-boss', hp: 9000 }], false) // a party boss has more HP: not recorded
    // In the boss room: boss + add hits within 3 s count together, converted to our defence
    const room = { fighter: 'a', areaId: 'f3-bossroom' }
    book.recordLog({ key: 'enemyAttack', t: 1000, p: { m: { m: 'f3-boss' }, dmg: 1200 } }, { atk: 100, def: 0 }, room)
    book.recordLog({ key: 'enemyAttack', t: 2500, p: { m: { m: 'f3-c' }, dmg: 900, crit: 1 } }, { atk: 100, def: 0 }, room)
    book.recordLog({ key: 'enemyAttack', t: 9000, p: { m: { m: 'f3-c' }, dmg: 100 } }, { atk: 100, def: 0 }, room) // later window, smaller
    expect(book.get('f3-boss')!.worstWindow).toEqual([1200, 900])
    const seen = bossRequirement(book.get('f3-boss'), stats)!
    expect(seen.worstDamage).toBe(Math.round(against(1200) + against(900)))
    // A solo boss report teaches its damage rate (taken/s at def 0); with our dps that gives the fight's cost
    book.recordLog({ key: 'bossReport', p: { m: { m: 'f3-boss' }, sec: 100, r: { rows: [['Hero', 4000, 10000]] } } }, { atk: 100, def: 50 }, { fighter: 'a', name: 'Hero', areaId: 'f3-bossroom' })
    const rate = Math.round(100 * (boss.atk! + 50) / boss.atk!) // 100/s taken at def 50
    expect(book.get('f3-boss')!.damageRate).toBe(rate)
    const cost = bossRequirement(book.get('f3-boss'), stats, 40)! // 4000 HP / 40 per s = 100 s
    expect(cost.fightSeconds).toBe(100)
    expect(cost.hpBars).toBeCloseTo((rate * boss.atk! / (boss.atk! + stats.def)) * 100 / stats.maxHp, 1)
    book.recordLog({ key: 'bossReport', p: { m: { m: 'f3-boss' }, sec: 100, r: { rows: [['Hero', 1, 99999], ['Pal', 1, 1]] } } }, { atk: 100, def: 50 }, { fighter: 'a', name: 'Hero', areaId: 'f3-bossroom' })
    expect(book.get('f3-boss')!.damageRate).toBe(rate) // party reports aren't used
    expect(book.get('f3-boss')!.maxHp).toBe(4000)
    expect(bossRequirement(book.get('f9-boss'), stats)).toBeNull() // never met
  })
})
