// The event log's command box: everything the dashboard's buttons can do, as text.
// Character commands go to the selected character (or every character); party
// and global commands ignore the selection. Logging in stays in its dialog so
// passwords are never typed into the log.

import { ITEMS, WEAPON_TYPES, WORLD_AREAS } from '#shared/game-rules'
import type { ActionRequest, PartyMode } from '#shared/types'

export interface ApiCall { method: string, path: string, body?: unknown }
export type CommandPlan =
  | { scope: 'character', build: (accountId: string) => ApiCall, confirm?: string }
  | { scope: 'global', calls: ApiCall[], confirm?: string }

interface CommandAccount { id: string, name: string, account: string }
interface CommandParty { id: string, name: string, memberIds: string[] }
export interface CommandContext {
  accounts: CommandAccount[]
  parties: CommandParty[]
  areaLabel?: (areaId: string) => string // hints in the UI language
}

export interface Suggestion { text: string, hint: string }

export const COMMANDS: Suggestion[] = [
  { text: 'farm ', hint: '練功: level up and progress floors (farm 10 = until Lv10)' },
  { text: 'stop', hint: 'stop 練功 / 王戰 / 任務' },
  { text: 'boss', hint: '王戰: farm the highest boss you can beat (again to stop)' },
  { text: 'quests', hint: '任務: missions only — quests and story, then report (again to stop)' },
  { text: 'refit', hint: '修整: pause everything, refit in town and stay there' },
  { text: 'restock', hint: 'buy potions and crystals now' },
  { text: 'goto ', hint: 'walk to an area' },
  { text: 'town', hint: 'teleport crystal back to town' },
  { text: 'hunt', hint: 'hunt once here (or the best safe field)' },
  { text: 'resume', hint: 'resume a bot that stopped itself' },
  { text: 'reconnect', hint: 'log back in / take the session back' },
  { text: 'remove', hint: 'remove the character from the dashboard' },
  { text: 'potion ', hint: 'recovery potion the game auto-drinks' },
  { text: 'instant ', hint: 'instant potion (瞬補) to keep stocked' },
  { text: 'stock ', hint: 'stock levels: stock potion 50 100 (below → up to)' },
  { text: 'weapon ', hint: 'unique-weapon goal (or none)' },
  { text: 'awake', hint: 'answer the idle warning' },
  { text: 'rise', hint: 'get up after falling in battle' },
  { text: 'join ', hint: 'accept a party invite: join <name>' },
  { text: 'party ', hint: 'party create <name> · party <name> add/remove/leader/tank/go/rest/standby/fight/delete' },
  { text: 'pause', hint: 'pause all: stop every party and hunt' },
]

const PARTY_ACTIONS: Suggestion[] = [
  { text: 'add ', hint: 'add a member' }, { text: 'remove ', hint: 'remove a member' },
  { text: 'leader ', hint: 'make a member the leader' }, { text: 'tank ', hint: 'make a member the tank (or none)' },
  { text: 'go ', hint: 'move the party to an area' },
  { text: 'rest', hint: '修整 in town' }, { text: 'standby', hint: '待命 where it is' }, { text: 'fight', hint: '戰鬥 there' },
  { text: 'retreat ', hint: 'tank retreat HP %' }, { text: 'delete', hint: 'delete the party' },
]
const PARTY_MODES: Record<string, PartyMode> = { rest: 'rest', refit: 'rest', 修整: 'rest', standby: 'standby', 待命: 'standby', fight: 'fight', 戰鬥: 'fight' }
const STOCK_KEYS: Record<string, [min: string, target: string]> = {
  potion: ['autoDrinkMin', 'autoDrinkTarget'], instant: ['instantMin', 'instantTarget'],
  heal: ['crystalHealMin', 'crystalHealTarget'], teleport: ['teleportMin', 'teleportTarget'],
}

const lower = (text: string) => text.toLowerCase()
const findAccount = (context: CommandContext, nameOrAccount = '') =>
  context.accounts.find((account) => [account.name, account.account].some((value) => lower(value) === lower(nameOrAccount)))
const findParty = (context: CommandContext, name = '') => context.parties.find((party) => lower(party.name) === lower(name))
// An item by id or name, of the given kind.
const findItem = (kind: 'potion' | 'instant', query = '') =>
  Object.entries(ITEMS).find(([itemId, item]) => item.kind === kind && (itemId === lower(query) || item.name === query))?.[0]

const act = (request: ActionRequest) => (accountId: string): ApiCall => ({ method: 'POST', path: `/api/accounts/${accountId}/action`, body: request })
const character = (build: (accountId: string) => ApiCall, confirm?: string): CommandPlan => ({ scope: 'character', build, ...(confirm ? { confirm } : {}) })

export function parseCommand(text: string, context: CommandContext): CommandPlan | string {
  const input = text.trim()
  if (input.startsWith('{')) {
    try { return character(act({ action: 'raw', command: JSON.parse(input) })) } catch { return 'Not valid JSON' }
  }
  const [word = '', ...rest] = input.split(/\s+/)
  const argument = rest[0]
  switch (lower(word)) {
    case 'farm': case '練功':
      if (argument && !Number.isFinite(Number(argument))) return 'farm takes a level, like farm 10'
      return character(act({ action: 'farm', untilLevel: argument ? Number(argument) : null }))
    case 'hunt': return character(act({ action: 'startHunt' }))
    case 'stop': return character(act({ action: 'stopHunt' }))
    case 'boss': case '王戰': return character(act({ action: 'startBoss' }))
    case 'quests': case 'missions': case '任務': return character(act({ action: 'completeMission' }))
    case 'refit': case '修整': return character(act({ action: 'refit' }))
    case 'restock': return character(act({ action: 'restock' }))
    case 'town': return character(act({ action: 'town' }))
    case 'resume': return character(act({ action: 'resume' }))
    case 'reconnect': return character(act({ action: 'reconnect' }))
    case 'awake': return character(act({ action: 'awake' }))
    case 'rise': return character(act({ action: 'raw', command: { type: 'rise' } }))
    case 'goto':
      if (!argument || !WORLD_AREAS[argument]) return 'goto needs an area id — type goto and pick one from the list'
      return character(act({ action: 'goto', areaId: argument }))
    case 'join': return argument ? character(act({ action: 'partyAccept', name: argument })) : 'join needs a name'
    case 'remove':
      return character((accountId) => ({ method: 'DELETE', path: `/api/accounts/${accountId}` }), 'Remove from the dashboard? The game account itself is not deleted.')
    case 'potion': {
      const itemId = findItem('potion', rest.join(' '))
      return itemId ? character(act({ action: 'raw', command: { type: 'updateSettings', settings: { potionItem: itemId } } })) : 'Unknown recovery potion — pick one from the list'
    }
    case 'instant': {
      const itemId = findItem('instant', rest.join(' '))
      return itemId ? character((accountId) => ({ method: 'PUT', path: `/api/accounts/${accountId}/safety`, body: { safety: { instantItem: itemId } } })) : 'Unknown instant potion — pick one from the list'
    }
    case 'weapon': {
      const weapon = lower(argument ?? '')
      if (weapon !== 'none' && !(WEAPON_TYPES as readonly string[]).includes(weapon)) return `weapon takes one of: ${WEAPON_TYPES.join(', ')}, none`
      return character((accountId) => ({ method: 'PUT', path: `/api/accounts/${accountId}/weapon`, body: { weapon: weapon === 'none' ? null : weapon } }))
    }
    case 'stock': {
      const keys = STOCK_KEYS[lower(argument ?? '')]
      const [below, upTo] = [Number(rest[1]), Number(rest[2])]
      if (!keys || !Number.isInteger(below) || !Number.isInteger(upTo) || below < 0 || upTo < below) return 'stock <potion|instant|heal|teleport> <below> <up to>, e.g. stock potion 50 100'
      return character((accountId) => ({ method: 'PUT', path: `/api/accounts/${accountId}/safety`, body: { safety: { restock: { [keys[0]]: below, [keys[1]]: upTo } } } }))
    }
    case 'pause': return { scope: 'global', calls: [{ method: 'POST', path: '/api/pause-all', body: {} }], confirm: 'Pause all parties and hunts?' }
    case 'party': return parsePartyCommand(rest, context)
    default: return `Unknown command "${word}"`
  }
}

function parsePartyCommand([partyName = '', verb = '', ...rest]: string[], context: CommandContext): CommandPlan | string {
  const global = (calls: ApiCall[], confirm?: string): CommandPlan => ({ scope: 'global', calls, ...(confirm ? { confirm } : {}) })
  if (lower(partyName) === 'create') return verb ? global([{ method: 'POST', path: '/api/parties', body: { name: [verb, ...rest].join(' ') } }]) : 'party create <name>'
  const party = findParty(context, partyName)
  if (!party) return `No party called "${partyName}"`
  const partyPath = `/api/parties/${party.id}`
  const update = (body: object) => global([{ method: 'PUT', path: partyPath, body }])
  const member = findAccount(context, rest[0])
  const mode = PARTY_MODES[lower(verb)] ?? PARTY_MODES[verb]
  if (mode) return global([{ method: 'POST', path: `${partyPath}/goal`, body: { mode } }])
  switch (lower(verb)) {
    case 'add': return member ? update({ memberIds: [...party.memberIds, member.id] }) : `No character called "${rest[0] ?? ''}"`
    case 'remove': return member ? update({ memberIds: party.memberIds.filter((memberId) => memberId !== member.id) }) : `No character called "${rest[0] ?? ''}"`
    case 'leader': return member ? update({ leaderId: member.id }) : `No character called "${rest[0] ?? ''}"`
    case 'tank': return lower(rest[0] ?? '') === 'none' ? update({ tankId: null }) : member ? update({ tankId: member.id }) : `No character called "${rest[0] ?? ''}"`
    case 'go': return rest[0] && WORLD_AREAS[rest[0]] ? global([{ method: 'POST', path: `${partyPath}/goal`, body: { areaId: rest[0] } }]) : 'party <name> go <area id>'
    case 'retreat': {
      const pct = Number(rest[0])
      return Number.isFinite(pct) ? update({ tankRetreatPct: pct }) : 'party <name> retreat <10-90>'
    }
    case 'delete': return global([{ method: 'DELETE', path: partyPath }], `Delete party "${party.name}"?`)
    default: return `party ${party.name} … add / remove / leader / tank / go / rest / standby / fight / retreat / delete`
  }
}

// Suggestions for what's typed so far: commands, then their arguments.
export function suggestCommands(text: string, context: CommandContext): Suggestion[] {
  const input = text.trimStart()
  if (!input || input.startsWith('{')) return []
  const isTypingWord = !/\s$/.test(input)
  const words = input.trimEnd().split(/\s+/)
  const head = words.slice(0, isTypingWord ? -1 : undefined).join(' ')
  const partial = lower(isTypingWord ? words.at(-1)! : '')
  const prefix = head ? `${head} ` : ''
  // Names starting with what's typed come first, then matches in the description.
  const startsWith = (option: Suggestion) => lower(option.text).trim().startsWith(partial)
  const pick = (options: Suggestion[], isFiltered = false) => options
    .filter((option) => isFiltered || startsWith(option) || lower(option.hint).includes(partial))
    .filter((option) => `${prefix}${option.text}`.trim() !== input.trim())
    .sort((first, second) => (isFiltered ? 0 : Number(startsWith(second)) - Number(startsWith(first))))
    .slice(0, 8)
    .map((option) => ({ text: `${prefix}${option.text}`, hint: option.hint }))
  const areaOptions = (): Suggestion[] => Object.entries(WORLD_AREAS)
    .filter(([areaId, area]) => !area.secret && [areaId, lower(area.name), area.nameZh ?? ''].some((value) => value.includes(partial)))
    .map(([areaId]) => ({ text: areaId, hint: context.areaLabel?.(areaId) ?? areaId }))
  const characterOptions = (): Suggestion[] => context.accounts.map((account) => ({ text: account.name, hint: account.account }))
  const itemOptions = (kind: 'potion' | 'instant'): Suggestion[] => Object.entries(ITEMS)
    .filter(([, item]) => item.kind === kind).map(([itemId, item]) => ({ text: itemId, hint: item.name }))

  if (!head) return pick(COMMANDS)
  if (!isTypingWord) words.push('') // a trailing space starts the next word
  const [command = '', second = '', third = ''] = words.map(lower)
  if (command === 'goto' && words.length <= 2) return pick(areaOptions(), true)
  if (command === 'potion' && words.length <= 2) return pick(itemOptions('potion'))
  if (command === 'instant' && words.length <= 2) return pick(itemOptions('instant'))
  if (command === 'weapon' && words.length <= 2) return pick([...WEAPON_TYPES, 'none'].map((weapon) => ({ text: weapon, hint: 'weapon goal' })))
  if (command === 'stock' && words.length <= 2) return pick(Object.keys(STOCK_KEYS).map((key) => ({ text: `${key} `, hint: 'below → up to, e.g. 50 100' })))
  if (command === 'party') {
    if (words.length <= 2) return pick([{ text: 'create ', hint: 'new party: party create <name>' }, ...context.parties.map((party) => ({ text: `${party.name} `, hint: `${party.memberIds.length} members` }))])
    if (second === 'create') return []
    if (words.length <= 3) return pick(PARTY_ACTIONS)
    if (['add', 'remove', 'leader', 'tank'].includes(third) && words.length <= 4) return pick([...characterOptions(), ...(third === 'tank' ? [{ text: 'none', hint: 'no tank' }] : [])])
    if (third === 'go' && words.length <= 4) return pick(areaOptions(), true)
  }
  return []
}
