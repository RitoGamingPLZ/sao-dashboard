// Live dashboard state: the latest snapshot from the server's SSE stream and
// the event log. One shared instance for the whole page.

import type { AccountSummary, LogEvent, Party, PartySummary, Snapshot } from '#shared/types'

const MAX_LOG_ROWS = 300

const snapshot = ref<Snapshot>({ accounts: [], parties: [] })
const logEvents = ref<LogEvent[]>([])
const linkState = ref<'connecting' | 'live' | 'down'>('connecting')
let stream: EventSource | null = null

async function connect() {
  if (stream) return
  try { logEvents.value.push(...await callApi<LogEvent[]>('GET', '/api/events')) } catch { /* the stream fills it in */ }
  stream = new EventSource('/api/stream')
  stream.addEventListener('open', () => { linkState.value = 'live' })
  stream.addEventListener('error', () => { linkState.value = 'down' })
  stream.addEventListener('snapshot', (message) => { snapshot.value = JSON.parse(message.data) })
  stream.addEventListener('log', (message) => {
    logEvents.value.push(JSON.parse(message.data))
    if (logEvents.value.length > MAX_LOG_ROWS) logEvents.value.shift()
  })
}

// Party edits answer with the full party; patch it in right away instead of
// waiting ~1 s for the next snapshot, so a quick second edit doesn't read a
// stale party and clobber the first.
function patchParty(party: Party) {
  const parties = snapshot.value.parties
  const index = parties.findIndex((candidate) => candidate.id === party.id)
  const status = parties[index]?.status ?? 'Off'
  if (index === -1) parties.push({ ...party, status })
  else parties.splice(index, 1, { ...party, status })
}

export function useDashboard() {
  const accounts = computed<AccountSummary[]>(() => snapshot.value.accounts)
  const parties = computed<PartySummary[]>(() => snapshot.value.parties)
  const takenAccountIds = computed(() => new Set(parties.value.flatMap((party) => party.memberIds)))
  const accountById = (id: string | null) => accounts.value.find((account) => account.id === id) ?? null
  return { snapshot, accounts, parties, takenAccountIds, accountById, logEvents, linkState, connect, patchParty }
}

// Fire a per-account action (Farm, Boss, …) and toast any error.
export const accountAction = (accountId: string, action: string, extra: Record<string, unknown> = {}) =>
  runAndReport(() => callApi('POST', `/api/accounts/${accountId}/action`, { action, ...extra }))
