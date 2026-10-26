// Everything we know (or guess) about how to talk to the game lives here.
//
// VERIFIED (from the handoff spec): the WebSocket URL, the init/patch/result/
// params envelope, and the in-game command names in `commands` below that are
// not marked otherwise.
//
// UNVERIFIED (guessed — the game server was not reachable while this was
// built): how the socket authenticates, the login and sign-up HTTP calls, the
// max-HP / EXP-needed fields, and every party command. Override any of it in
// `protocol.local.json` (or the file named by SAO_PROTOCOL) once you have
// captured the real calls in the browser's network panel. Never put a token
// or password in that file.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const DEFAULT_PROTOCOL = {
  baseUrl: 'https://dev-sao.potato-proxy.com',
  wsUrl: 'wss://dev-sao.potato-proxy.com/api/ws',
  // Sent as the Origin header on the socket. The game may reject other origins.
  origin: 'https://dev-sao.potato-proxy.com',

  // UNVERIFIED. How the socket proves who it is. One of:
  //   'query'      -> wsUrl?token=<token>
  //   'firstFrame' -> first frame {"t":"auth","token":"<token>"}
  //   'header'     -> Authorization: Bearer <token>
  //   'cookie'     -> Cookie: <cookieName>=<token>
  auth: { mode: 'firstFrame', queryParam: 'token', frameType: 'auth', cookieName: 'sao_token' },

  // UNVERIFIED. Log in with name + password, expect a token back.
  login: { method: 'POST', path: '/api/link', body: { name: '{name}', password: '{password}' }, tokenField: 'token' },

  // UNVERIFIED. Create a character, then set its password with the new token.
  register: {
    create: { method: 'POST', path: '/api/characters', body: { name: '{name}' }, tokenField: 'token' },
    setPassword: { method: 'POST', path: '/api/password', body: { password: '{password}' } },
  },

  // Field names tried in order on state.player for derived values (UNVERIFIED).
  fields: {
    maxHp: ['maxHp', 'hpMax', 'mhp', 'stats.maxHp', 'stats.hp'],
    expNeeded: ['expNeeded', 'expNext', 'nextExp', 'expMax'],
    attack: ['attack', 'atk', 'stats.attack', 'stats.atk'],
  },

  commands: {
    travel: 'travel', gate: 'gate', startHunt: 'startHunt', stopHunt: 'stopHunt',
    emergency: 'emergency', drink: 'drink', use: 'use', buy: 'buy',
    // UNVERIFIED: no known boss-fight or mission commands either; same guess pattern as startHunt.
    startBoss: 'startBoss', stopBoss: 'stopBoss', completeMission: 'completeMission',
    // UNVERIFIED party commands. `null` disables syncing that step to the game.
    partyCreate: 'partyCreate',
    partyInvite: 'partyInvite', // { name }
    partyAccept: 'partyAccept', // { leader }
    partyLeave: 'partyLeave',
    partySetLeader: 'partySetLeader', // { name }
    partySetTank: null, // no known in-game tank/aggro command
  },

  rateLimitPerSec: 8, // game allows ~10
  commandTimeoutMs: 8000,
  travelStepMs: 1600,
};

const isPlainObject = (value) => value != null && typeof value === 'object' && !Array.isArray(value);

function mergeDeep(baseConfig, overrides) {
  if (!isPlainObject(overrides)) return overrides ?? baseConfig;
  const merged = { ...baseConfig };
  for (const key of Object.keys(overrides)) {
    merged[key] = isPlainObject(baseConfig?.[key]) ? mergeDeep(baseConfig[key], overrides[key]) : overrides[key];
  }
  return merged;
}

export function loadProtocol(directory = process.cwd()) {
  const overridesFile = process.env.SAO_PROTOCOL
    ? resolve(directory, process.env.SAO_PROTOCOL)
    : resolve(directory, 'protocol.local.json');
  if (!existsSync(overridesFile)) return DEFAULT_PROTOCOL;
  return mergeDeep(DEFAULT_PROTOCOL, JSON.parse(readFileSync(overridesFile, 'utf8')));
}

export function withProtocol(overrides) { return mergeDeep(DEFAULT_PROTOCOL, overrides); }

// Replace "{name}" placeholders in a request body template.
export function fillTemplate(template, values) {
  if (typeof template === 'string') return template.replace(/^\{(\w+)\}$/, (_, key) => values[key] ?? '');
  if (Array.isArray(template)) return template.map((item) => fillTemplate(item, values));
  if (isPlainObject(template)) {
    return Object.fromEntries(Object.entries(template).map(([key, value]) => [key, fillTemplate(value, values)]));
  }
  return template;
}

// Read a dotted path like "stats.maxHp" from an object.
export function getPath(source, dottedPath) {
  return dottedPath.split('.').reduce((current, key) => (current == null ? undefined : current[key]), source);
}
