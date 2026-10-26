// Everything about how to talk to the SAO game server that isn't code.
//
// VERIFIED against dev-sao.potato-proxy.com (2026-10-26, from the game's own
// web client): POST /api/link {account,password,name?} -> {token}; socket
// auth by first frame {t:"auth",token}; commands as {t:"cmd",id,cmd}; party
// actions as {t:"party",op,name}; the command names below unless marked.
//
// Override any of it in protocol.local.json (or the file named by
// SAO_PROTOCOL), e.g. to point at the mock server. Never put a token or
// password in that file.

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

export type CommandKey =
  | 'travel' | 'gate' | 'startHunt' | 'stopHunt' | 'emergency' | 'drink' | 'use' | 'buy'
  | 'startBoss' | 'stopBoss' | 'completeMission'
export type PartyOpKey = 'invite' | 'accept' | 'leave' | 'promote'

export interface SaoProtocol {
  baseUrl: string
  wsUrl: string
  origin: string | null // sent as Origin on HTTP and socket calls
  // Field names tried in order on state.player for derived values. The real
  // player has none of these (the game computes them client-side), so the
  // dashboard falls back to estimates.
  fields: { maxHp: string[], expNeeded: string[], attack: string[] }
  // `null` = the game has no such command; the dashboard reports it as unsupported.
  commands: Record<CommandKey, string | null>
  partyOps: Record<PartyOpKey, string | null>
  rateLimitPerSec: number
  commandTimeoutMs: number
  travelStepMs: number
  pingMs: number
}

export const DEFAULT_PROTOCOL: SaoProtocol = {
  baseUrl: 'https://dev-sao.potato-proxy.com',
  wsUrl: 'wss://dev-sao.potato-proxy.com/api/ws',
  origin: 'https://dev-sao.potato-proxy.com',
  fields: {
    maxHp: ['maxHp', 'hpMax', 'stats.maxHp'],
    expNeeded: ['expNeeded', 'expNext', 'nextExp'],
    attack: ['attack', 'atk', 'stats.atk'],
  },
  commands: {
    travel: 'travel', gate: 'gate', startHunt: 'startHunt', stopHunt: 'stopHunt',
    emergency: 'emergency', drink: 'drink', use: 'use', buy: 'buy',
    startBoss: 'challengeBoss',
    stopBoss: null, // the game has no "leave boss fight" command
    completeMission: 'completeAllQuests',
  },
  partyOps: { invite: 'invite', accept: 'accept', leave: 'leave', promote: 'promote' },
  rateLimitPerSec: 8, // game allows ~10
  commandTimeoutMs: 8000,
  travelStepMs: 1600, // game param travelStepMs is 1500
  pingMs: 20000,
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value)

function mergeDeep<T>(base: T, overrides: unknown): T {
  if (!isPlainObject(overrides)) return (overrides as T) ?? base
  const merged: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const key of Object.keys(overrides)) {
    const baseValue = (base as Record<string, unknown>)?.[key]
    merged[key] = isPlainObject(baseValue) ? mergeDeep(baseValue, overrides[key]) : overrides[key]
  }
  return merged as T
}

export function loadProtocol(directory = process.cwd()): SaoProtocol {
  const overridesFile = resolve(directory, process.env.SAO_PROTOCOL || 'protocol.local.json')
  if (!existsSync(overridesFile)) return DEFAULT_PROTOCOL
  return mergeDeep(DEFAULT_PROTOCOL, JSON.parse(readFileSync(overridesFile, 'utf8')))
}

export const withProtocol = (overrides: Partial<SaoProtocol> | Record<string, unknown>) => mergeDeep(DEFAULT_PROTOCOL, overrides)

// Read a dotted path like "stats.maxHp" from an object.
export function getPath(source: unknown, dottedPath: string): unknown {
  return dottedPath.split('.').reduce<unknown>((current, key) => (current == null ? undefined : (current as Record<string, unknown>)[key]), source)
}
