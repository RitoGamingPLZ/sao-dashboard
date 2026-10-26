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
import { decideSafety, validateSafety, planRestock, DEFAULT_SAFETY } from '../server/dashboard/safety'
import { validateParty } from '../server/dashboard/party'
import { generatePassword } from '../server/dashboard/vault'
import { areaLevel, shopStock, isAreaSafeFor, safeAreaFor } from '#shared/game-rules'

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
    expect(shopStock(16)).toEqual(['potion-2', 'potion-2c', 'instant-2', 'crystal-teleport', 'crystal-heal'])
    expect(shopStock(37)).toEqual(['potion-2d', 'potion-3', 'instant-3', 'crystal-teleport', 'crystal-heal'])
    expect(isAreaSafeFor('f40-secret', 99)).toBe(false) // hidden areas never
    expect(isAreaSafeFor('f1-west', 1)).toBe(true) // monsters Lv1-2, passive
    expect(isAreaSafeFor('f1-labyrinth', 6)).toBe(false) // Lv5-6 and aggressive
    expect(isAreaSafeFor('f1-labyrinth', 7)).toBe(true)
    expect(safeAreaFor(1, 'field', 1)).toMatch(/^f1-(west|outskirts)$/)
    expect(safeAreaFor(10, 'field', 1)).toMatch(/^f1-(horunka|depths)$/) // floor 2 still locked
    expect(safeAreaFor(7, 'bossroom', 1)).toBeNull() // boss is Lv7
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

  test('restock plan respects gold budget', () => {
    const player = { name: 'p', level: 40, exp: 0, hp: 1, areaId: 'f37-town', col: 1000, inventory: {}, settings: { potionItem: 'potion-3' } }
    const cheapPlan = planRestock(player, DEFAULT_SAFETY, 38) // 500 budget: potion-3 (1050) no, a 400 crystal yes
    expect(Array.isArray(cheapPlan) && cheapPlan.map((purchase) => purchase.itemId)).toEqual(['crystal-teleport'])
    expect(planRestock({ ...player, col: 100 }, DEFAULT_SAFETY, 38)).toHaveProperty('blockedReason')
    const plan = planRestock({ ...player, col: 10_000_000 }, DEFAULT_SAFETY, 38)
    expect(Array.isArray(plan) && plan.map((purchase) => purchase.itemId)).toEqual(['potion-3', 'crystal-teleport', 'crystal-heal'])
    // Can afford potions but not the 400-gold crystal: still buy the potions.
    const poorPlan = planRestock({ ...player, level: 3, areaId: 'f1-town', col: 320, settings: { potionItem: 'potion-1' } }, DEFAULT_SAFETY, 1)
    expect(Array.isArray(poorPlan) && poorPlan.map((purchase) => [purchase.itemId, purchase.quantity])).toEqual([['potion-1', 3]])
  })

  test('party validation', () => {
    const party = { id: 'a', name: 'A', memberIds: ['x', 'y'], leaderId: 'x', tankId: 'z', tankRetreatPct: 40, isActive: false, goal: null, shouldSyncInGame: false }
    expect(validateParty(party, [])).toMatch(/tank must be a party member/)
    expect(validateParty({ ...party, tankId: 'y' }, [{ id: 'b', name: 'B', memberIds: ['y'] }])).toMatch(/already in party/)
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
    expect(await waitUntil(() => dps.summary().alerts.some((text) => /Login rejected/.test(text)), 10000)).toBe(true)
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

  test('boss uses the real command; stopping a boss fight is unsupported', async () => {
    const session = sessionNamed('tank_one')
    expect(await runAccountAction(session, { action: 'startBoss' })).toMatchObject({ ok: true })
    expect(await waitUntil(() => session.player?.activity?.type === 'boss' || session.busyLabel != null)).toBe(true)
    expect(await runAccountAction(session, { action: 'stopBoss' })).toMatchObject({ error: expect.stringMatching(/unsupported|busy/) })
    mock.accountsByName.get('tank_one').player.activity = { type: 'idle' }
    await waitUntil(() => session.busyLabel == null)
  })

  test('party: leader leads, tank fights first, others follow, in-game sync sends invites', async () => {
    const tank = sessionNamed('tank_one')
    const dps = sessionNamed('fresh_alt')
    mock.accountsByName.get('fresh_alt').player.level = 31
    await waitUntil(() => dps.player?.level === 31)
    const { partyManager } = accounts
    const party = partyManager.create('Raid')
    expect((await partyManager.update(party.id, { memberIds: [dps.id, tank.id], leaderId: dps.id, tankId: tank.id, shouldSyncInGame: true })).error).toBeUndefined()
    expect((await partyManager.activate(party.id, { areaId: 'f40-secret' })).error).toMatch(/monster level/)
    expect((await partyManager.activate(party.id, { areaId: 'f22-lake' })).error).toBeUndefined()
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
