// LOCAL PRACTICE SERVER — for testing the dashboard without touching a real
// character (spec §9.3). It imitates the game's protocol as configured in
// protocol.js (the unverified auth/login/sign-up guesses included), with a
// toy combat loop. It is NOT the game; numbers here mean nothing.
//
//   node mock/mock-server.js            # listens on 127.0.0.1:8787
//   MOCK_DAMAGE=900 node mock/...       # make monsters hit harder
//   MOCK_EXP_MULTIPLIER=20 node mock/.. # level up faster (doesn't change damage, so the safety loop still keeps pace)

import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const TICK_MS = 500;
const EXP_MULTIPLIER = Number(process.env.MOCK_EXP_MULTIPLIER || 1);
// Toy level curve — numbers mean nothing (see header comment).
const expToLevelUp = (level) => level * 200;

// ---- minimal WebSocket server framing (text frames only) -----------------

function encodeTextFrame(text) {
  const payload = Buffer.from(text);
  const length = payload.length;
  let header;
  if (length < 126) header = Buffer.from([0x81, length]);
  else if (length < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(length, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(length), 2); }
  return Buffer.concat([header, payload]);
}

function createFrameReader(onText, onClose) {
  let buffered = Buffer.alloc(0);
  return (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);
    while (buffered.length >= 2) {
      const opcode = buffered[0] & 0x0f;
      const isMasked = (buffered[1] & 0x80) !== 0;
      let length = buffered[1] & 0x7f;
      let offset = 2;
      if (length === 126) { if (buffered.length < 4) return; length = buffered.readUInt16BE(2); offset = 4; }
      else if (length === 127) { if (buffered.length < 10) return; length = Number(buffered.readBigUInt64BE(2)); offset = 10; }
      const maskBytes = isMasked ? 4 : 0;
      if (buffered.length < offset + maskBytes + length) return;
      const mask = isMasked ? buffered.subarray(offset, offset + 4) : null;
      const payload = Buffer.from(buffered.subarray(offset + maskBytes, offset + maskBytes + length));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      buffered = buffered.subarray(offset + maskBytes + length);
      if (opcode === 0x8) return onClose();
      if (opcode === 0x1) onText(payload.toString('utf8'));
    }
  };
}

// ---- toy game world -------------------------------------------------------

function newPlayer(name, level = 30) {
  return {
    name, level, exp: 0, hp: 5000, maxHp: 5000, col: 400000, attack: 80 + level * 6,
    areaId: `f20-town`, activity: { type: 'idle' }, enemies: [],
    inventory: { 'potion-2b': 150, 'instant-2': 40, 'crystal-heal': 12, 'crystal-teleport': 25 },
    gear: {}, equipment: { weapon: 'Practice Rapier', armor: 'Leather Coat (demo)' },
    skills: ['Battle Healing', 'Parry', 'Sprint'],
    clearedFloors: [...Array(24).keys()].map((i) => i + 1),
    instantCdMs: 0, settings: { autoPotion: false, potionItem: 'potion-2b', potionPct: 20, restPct: 80, stopOnNoPotion: true },
    miasmaSince: null, miasmaMs: null, dead: null,
  };
}

export function startMockServer({ port = 8787, host = '127.0.0.1', damagePerTick = Number(process.env.MOCK_DAMAGE || 250) } = {}) {
  const accountsByName = new Map(); // name -> { password, token, player }
  const accountsByToken = new Map();
  const liveSockets = new Set();
  const requestLog = [];

  const createAccount = (name, password, level) => {
    const token = randomBytes(32).toString('base64url');
    const account = { name, password, token, player: newPlayer(name, level) };
    accountsByName.set(name.toLowerCase(), account);
    accountsByToken.set(token, account);
    return account;
  };

  const sendJson = (response, statusCode, body) => {
    response.writeHead(statusCode, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  };

  const readBody = (request) => new Promise((resolve) => {
    let raw = '';
    request.on('data', (chunk) => { raw += chunk; });
    request.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
  });

  const server = createServer(async (request, response) => {
    const body = await readBody(request);
    requestLog.push({ method: request.method, path: request.url });
    if (request.method === 'POST' && request.url === '/api/link') {
      const account = accountsByName.get(String(body.name || '').toLowerCase());
      if (!account || account.password !== body.password) return sendJson(response, 401, { error: 'badLogin' });
      return sendJson(response, 200, { token: account.token });
    }
    if (request.method === 'POST' && request.url === '/api/characters') {
      if (!/^[A-Za-z0-9_]{3,16}$/.test(body.name || '')) return sendJson(response, 400, { error: 'badName' });
      if (accountsByName.has(body.name.toLowerCase())) return sendJson(response, 409, { error: 'nameTaken' });
      return sendJson(response, 200, { token: createAccount(body.name, null, 5).token });
    }
    if (request.method === 'POST' && request.url === '/api/password') {
      const account = accountsByToken.get((request.headers.authorization || '').replace(/^Bearer /, ''));
      if (!account) return sendJson(response, 401, { error: 'noAuth' });
      if (String(body.password || '').length < 8) return sendJson(response, 400, { error: 'weakPassword' });
      account.password = body.password;
      return sendJson(response, 200, { ok: true });
    }
    sendJson(response, 404, { error: 'notFound' });
  });

  server.on('upgrade', (request, socket) => {
    if (!request.url.startsWith('/api/ws')) return socket.destroy();
    const acceptKey = createHash('sha1').update(request.headers['sec-websocket-key'] + WEBSOCKET_GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey}\r\n\r\n`);
    const connection = { socket, account: null };
    liveSockets.add(connection);
    const send = (message) => { if (!socket.destroyed) socket.write(encodeTextFrame(JSON.stringify(message))); };
    connection.send = send;
    const close = () => { liveSockets.delete(connection); socket.destroy(); };
    socket.on('data', createFrameReader((text) => {
      let message;
      try { message = JSON.parse(text); } catch { return; }
      if (message.t === 'auth') {
        const account = accountsByToken.get(message.token);
        if (!account) { send({ t: 'authError', error: 'badToken' }); return close(); }
        connection.account = account;
        send({ t: 'init', state: { time: Date.now(), player: account.player } });
        return;
      }
      if (message.t === 'cmd' && connection.account) {
        const result = handleCommand(connection.account, message.cmd);
        send({ t: 'result', id: message.id, result });
        sendPlayer(connection.account);
      }
    }, close));
    socket.on('close', () => liveSockets.delete(connection));
    socket.on('error', () => liveSockets.delete(connection));
  });

  function sendPlayer(account) {
    for (const connection of liveSockets) {
      if (connection.account === account) connection.send({ t: 'patch', ops: [[['player'], account.player], [['time'], Date.now()]] });
    }
  }

  function handleCommand(account, command) {
    const player = account.player;
    const inventory = player.inventory;
    const floorOf = (areaId) => Number(/^f(\d+)-/.exec(areaId)?.[1]);
    switch (command?.type) {
      case 'travel': {
        if (player.activity.type === 'boss') return { error: 'bossNoMove' };
        const isSameFloor = floorOf(command.areaId) === floorOf(player.areaId);
        if (!isSameFloor) return { error: 'notAdjacent' };
        player.areaId = command.areaId;
        player.activity = { type: 'idle' };
        return { ok: true };
      }
      case 'gate':
        if (!player.areaId.endsWith('-town')) return { error: 'gateTownOnly' };
        if (command.floor > Math.max(...player.clearedFloors) + 1) return { error: 'floorNotOpen' };
        player.areaId = `f${command.floor}-town`;
        return { ok: true };
      case 'startHunt':
        if (player.areaId.endsWith('-town')) return { error: 'noHuntInTown' };
        player.activity = { type: 'hunting' };
        return { ok: true };
      case 'stopHunt':
        if (player.activity.type === 'hunting') player.activity = { type: 'idle' };
        return { ok: true };
      case 'startBoss':
        if (player.areaId.endsWith('-town')) return { error: 'noBossInTown' };
        player.activity = { type: 'boss' };
        return { ok: true };
      case 'stopBoss':
        if (player.activity.type === 'boss') player.activity = { type: 'idle' };
        return { ok: true };
      case 'completeMission': {
        const floor = floorOf(player.areaId);
        if (command.questType === 'uniqueWeapon') {
          if (!command.weapon) return { error: 'noWeaponGoal' };
          const itemId = `weapon-${command.weapon}`;
          inventory[itemId] = (inventory[itemId] || 0) + 1;
          player.exp += 500;
          return { ok: true, reward: itemId };
        }
        if (player.clearedFloors.includes(floor)) return { error: 'alreadyCleared' };
        player.clearedFloors.push(floor);
        player.exp += 300;
        player.col += 1000;
        return { ok: true, reward: `floor-${floor}-cleared` };
      }
      case 'drink': {
        const potionId = Object.keys(inventory).find((itemId) => /^(potion|instant)-/.test(itemId) && inventory[itemId] > 0);
        if (!potionId) return { error: 'noPotion' };
        inventory[potionId]--;
        player.hp = Math.min(player.maxHp, player.hp + 1500);
        return { ok: true };
      }
      case 'emergency':
        if (player.instantCdMs > 0) return { error: 'cooldown' };
        player.hp = Math.min(player.maxHp, player.hp + 2000);
        player.instantCdMs = 30000;
        return { ok: true };
      case 'use':
        if (!(inventory[command.itemId] > 0)) return { error: 'noItem' };
        inventory[command.itemId]--;
        if (command.itemId === 'crystal-heal') player.hp = player.maxHp;
        if (command.itemId === 'crystal-teleport') { player.areaId = `f${floorOf(player.areaId)}-town`; player.activity = { type: 'idle' }; }
        return { ok: true };
      case 'buy':
        if (!player.areaId.endsWith('-town')) return { error: 'notInTown' };
        inventory[command.itemId] = (inventory[command.itemId] || 0) + command.qty;
        player.col -= command.qty * 10;
        return { ok: true };
      case 'partyCreate': case 'partyInvite': case 'partyAccept': case 'partyLeave': case 'partySetLeader':
        return { ok: true };
      default:
        return { error: 'badCommand' };
    }
  }

  // Combat: hunting players lose HP and earn EXP/gold; idle ones regenerate.
  const combatTimer = setInterval(() => {
    for (const account of accountsByName.values()) {
      const player = account.player;
      player.instantCdMs = Math.max(0, player.instantCdMs - TICK_MS);
      if (player.dead) continue;
      if (player.activity.type === 'hunting' || player.activity.type === 'boss') {
        const isBoss = player.activity.type === 'boss';
        player.hp -= Math.round(damagePerTick * (isBoss ? 2 : 1) * (0.6 + Math.random() * 0.8));
        player.exp += (isBoss ? 150 : 40) * EXP_MULTIPLIER;
        player.col += isBoss ? 200 : 60;
        if (player.hp <= 0) { player.hp = 0; player.dead = true; player.activity = { type: 'idle' }; }
        while (!player.dead && player.exp >= expToLevelUp(player.level)) {
          player.exp -= expToLevelUp(player.level);
          player.level += 1;
          player.attack += 6;
          player.maxHp += 200;
          player.hp = player.maxHp;
        }
      } else {
        player.hp = Math.min(player.maxHp, player.hp + 120);
      }
      sendPlayer(account);
    }
  }, TICK_MS);

  return new Promise((resolve) => server.listen(port, host, () => {
    const address = server.address();
    resolve({
      port: address.port,
      createAccount,
      accountsByName,
      requestLog,
      close: () => { clearInterval(combatTimer); for (const connection of liveSockets) connection.socket.destroy(); server.close(); },
    });
  }));
}

const isRunDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isRunDirectly) {
  const mock = await startMockServer();
  mock.createAccount('demo_tank', 'practice-only-1', 34);
  mock.createAccount('demo_healer', 'practice-only-2', 28);
  mock.createAccount('demo_dps', 'practice-only-3', 31);
  console.log(`Practice server on http://127.0.0.1:${mock.port} (accounts: demo_tank / demo_healer / demo_dps; passwords practice-only-1..3)`);
}
