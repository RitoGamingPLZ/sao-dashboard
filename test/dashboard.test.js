// Runs against the LOCAL PRACTICE SERVER (mock/), never the real game.
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startMockServer } from '../mock/mock-server.js';
import { createDashboard } from '../src/server.js';
import { withProtocol } from '../src/protocol.js';
import { applyPatch } from '../src/game-client.js';
import { decideSafety, validateSafety, planRestock, DEFAULT_SAFETY } from '../src/safety.js';
import { areaLevel, shopStock, isAreaSafeFor } from '../src/game-rules.js';
import { validateParty } from '../src/party.js';
import { generatePassword } from '../src/vault.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(isDone, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { if (await isDone()) return true; await sleep(100); }
  return false;
}

let mock, dashboard, dashboardUrl, dataDir;

before(async () => {
  mock = await startMockServer({ port: 0, damagePerTick: 0 });
  mock.createAccount('tank_one', 'practice-pass-1', 34);
  mock.createAccount('dps_two', 'practice-pass-2', 31);
  dataDir = mkdtempSync(join(tmpdir(), 'sao-dash-'));
  const protocol = withProtocol({
    baseUrl: `http://127.0.0.1:${mock.port}`,
    wsUrl: `ws://127.0.0.1:${mock.port}/api/ws`,
    travelStepMs: 50,
  });
  dashboard = createDashboard({ protocol, dataDir, sessionTiming: { safetyMs: 100, mainMs: 60000 }, partyTickMs: 200 });
  await new Promise((resolve) => dashboard.server.listen(0, '127.0.0.1', resolve));
  dashboardUrl = `http://127.0.0.1:${dashboard.server.address().port}`;
});

after(() => { dashboard.close(); mock.close(); rmSync(dataDir, { recursive: true, force: true }); });

const api = async (method, path, body) => {
  const response = await fetch(dashboardUrl + path, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
};
const accountNamed = async (name) => (await api('GET', '/api/state')).body.accounts.find((account) => account.name === name);

test('rules: area levels, shops, safety gate', () => {
  assert.equal(areaLevel('f40-secret'), 59);
  assert.equal(areaLevel('f40-town'), 0);
  assert.deepEqual(shopStock(16), ['potion-2', 'potion-2c', 'instant-2', 'crystal-teleport', 'crystal-heal']);
  assert.deepEqual(shopStock(37), ['potion-2d', 'potion-3', 'instant-3', 'crystal-teleport', 'crystal-heal']);
  assert.equal(isAreaSafeFor('f40-secret', 59), false);
  assert.equal(isAreaSafeFor('f40-secret', 60), true);
});

test('patch apply handles set and delete', () => {
  const state = { player: { hp: 10, buffs: { a: 1 } } };
  applyPatch(state, [[['player', 'hp'], 7], [['player', 'buffs', 'a']], [['player', 'areaId'], 'f1-town']]);
  assert.deepEqual(state, { player: { hp: 7, buffs: {}, areaId: 'f1-town' } });
});

test('safety: heal ladder and hard minimums', () => {
  const player = { activity: { type: 'hunting' }, inventory: { 'potion-2': 5, 'crystal-heal': 1, 'crystal-teleport': 1 }, instantCdMs: 0 };
  assert.equal(decideSafety(player, 24, DEFAULT_SAFETY).command.type, 'drink');
  assert.equal(decideSafety(player, 19, DEFAULT_SAFETY).command.type, 'emergency');
  assert.equal(decideSafety(player, 8, DEFAULT_SAFETY).command.itemId, 'crystal-heal');
  assert.equal(decideSafety({ ...player, inventory: { 'crystal-teleport': 1 } }, 8, DEFAULT_SAFETY).command.itemId, 'crystal-teleport');
  assert.equal(decideSafety({ ...player, activity: { type: 'idle' } }, 5, DEFAULT_SAFETY), null);
  assert.ok(validateSafety(DEFAULT_SAFETY, { normal: { crystalPct: 5 } }, { isUnsafeConfirmed: true }).error);
  assert.ok(validateSafety(DEFAULT_SAFETY, { normal: { potionPct: 15 } }).needsConfirm);
  assert.equal(validateSafety(DEFAULT_SAFETY, { normal: { potionPct: 15 } }, { isUnsafeConfirmed: true }).safety.normal.potionPct, 15);
});

test('restock plan respects gold budget', () => {
  const player = { level: 40, areaId: 'f37-town', col: 1000, inventory: {}, settings: { potionItem: 'potion-3' } };
  assert.ok(planRestock(player, DEFAULT_SAFETY, 38).blockedReason);
  const richPlayer = { ...player, col: 10_000_000 };
  const plan = planRestock(richPlayer, DEFAULT_SAFETY, 38);
  assert.deepEqual(plan.map((purchase) => purchase.itemId), ['potion-3', 'crystal-teleport', 'crystal-heal']);
});

test('party validation', () => {
  const party = { id: 'a', name: 'A', memberIds: ['x', 'y'], leaderId: 'x', tankId: 'z', tankRetreatPct: 40 };
  assert.match(validateParty(party, []), /tank must be a party member/);
  assert.match(validateParty({ ...party, tankId: 'y' }, [{ id: 'b', name: 'B', memberIds: ['y'] }]), /already in party/);
});

test('generated passwords are strong', () => {
  const password = generatePassword();
  assert.equal(password.length, 16);
  assert.match(password, /[a-z]/); assert.match(password, /[A-Z]/); assert.match(password, /\d/);
});

test('add accounts by login; wrong password is refused', async () => {
  assert.equal((await api('POST', '/api/accounts/login', { name: 'tank_one', password: 'nope' })).status, 400);
  assert.equal((await api('POST', '/api/accounts/login', { name: 'tank_one', password: 'practice-pass-1' })).status, 200);
  assert.equal((await api('POST', '/api/accounts/login', { name: 'dps_two', password: 'practice-pass-2' })).status, 200);
  assert.ok(await waitUntil(async () => (await accountNamed('tank_one'))?.player?.level === 34));
  const settingsText = readFileSync(join(dataDir, 'settings.json'), 'utf8');
  assert.ok(!settingsText.includes('practice-pass-1'), 'no password in settings');
  assert.ok(!readFileSync(join(dataDir, 'vault.enc')).toString('latin1').includes('practice-pass-1'), 'vault is encrypted');
});

test('create a new account with a generated password', async () => {
  const { status, body } = await api('POST', '/api/accounts/create', { name: 'fresh_alt' });
  assert.equal(status, 200);
  assert.equal(body.password.length, 16);
  assert.equal(mock.accountsByName.get('fresh_alt').password, body.password);
  const reveal = await api('POST', `/api/accounts/${body.id}/password`, {});
  assert.equal(reveal.body.password, body.password);
  const snapshotText = JSON.stringify((await api('GET', '/api/state')).body);
  assert.ok(!snapshotText.includes(body.password), 'snapshot never carries secrets');
});

test('bot heals itself when HP drops', async () => {
  const tank = mock.accountsByName.get('tank_one').player;
  tank.areaId = 'f20-field';
  tank.activity = { type: 'hunting' };
  tank.hp = 1000; // 20% of 5000 → emergency heal
  assert.ok(await waitUntil(() => tank.hp > 1000 && tank.instantCdMs > 0));
  tank.activity = { type: 'idle' };
});

test('cross-site writes are refused', async () => {
  const response = await fetch(`${dashboardUrl}/api/pause-all`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}' });
  assert.equal(response.status, 403);
});

test('party: leader leads, tank fights first, others follow', async () => {
  const tankId = (await accountNamed('tank_one')).id;
  const dpsId = (await accountNamed('dps_two')).id;
  const { body: party } = await api('POST', '/api/parties', { name: 'Raid' });
  assert.equal((await api('PUT', `/api/parties/${party.id}`, { memberIds: [dpsId, tankId], leaderId: dpsId, tankId })).status, 200);
  assert.match((await api('POST', `/api/parties/${party.id}/start`, { goal: { areaId: 'f40-secret' } })).body.error, /too dangerous|monster level/);
  assert.equal((await api('POST', `/api/parties/${party.id}/start`, { goal: { areaId: 'f22-field' } })).status, 200);
  const tank = mock.accountsByName.get('tank_one').player;
  const dps = mock.accountsByName.get('dps_two').player;
  assert.ok(await waitUntil(() => tank.areaId === 'f22-field' && dps.areaId === 'f22-field', 15000), `moved: ${tank.areaId} ${dps.areaId}`);
  assert.ok(await waitUntil(() => tank.activity.type === 'hunting' && dps.activity.type === 'hunting', 8000));
  // Tank drops below retreat HP → others stop and wait.
  tank.hp = 1500; // 30% < 40% retreat
  assert.ok(await waitUntil(() => dps.activity.type === 'idle', 8000), 'dps waits while tank is low');
  await api('POST', `/api/parties/${party.id}/stop`, {});
});
