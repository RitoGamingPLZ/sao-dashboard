// The one AccountManager for this server process, plus the live-stream
// subscribers. Auto-imported into every server route.

import { resolve } from 'node:path'
import type { H3Event } from 'h3'
import { AccountManager } from '../dashboard/accounts'
import { loadProtocol } from '../sao/protocol'

let accountManager: AccountManager | undefined

export function useAccounts(): AccountManager {
  accountManager ??= new AccountManager({ protocol: loadProtocol(), dataDir: resolve(process.env.SAO_DATA_DIR || 'data') })
  return accountManager
}

export function closeAccounts() {
  accountManager?.shutdown()
  accountManager = undefined
}

// Live-stream subscribers: each gets (eventName, payload).
export const streamSubscribers = new Set<(eventName: string, payload: unknown) => void>()

export function broadcast(eventName: string, payload: unknown) {
  for (const send of streamSubscribers) send(eventName, payload)
}

// Every dashboard call answers with a payload or { error }; errors get a 4xx.
export function reply<T extends object>(event: H3Event, result: T, failureCode = 400): T {
  if ('error' in result && result.error) setResponseStatus(event, failureCode)
  return result
}

export function sessionFrom(event: H3Event) {
  const session = useAccounts().sessionsById.get(getRouterParam(event, 'id') ?? '')
  if (!session) throw createError({ statusCode: 404, data: { error: 'No such account' }, message: 'No such account' })
  return session
}
