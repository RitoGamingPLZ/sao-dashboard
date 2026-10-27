// The event log's command box: every UI operation as text.
import { describe, expect, test } from 'vitest'
import { parseCommand, suggestCommands, type CommandContext } from '../app/utils/commands'

const context: CommandContext = {
  accounts: [{ id: 'a2', name: 'alanchiu2', account: 'alan2' }, { id: 'a4', name: 'alanchiu4', account: 'alan4' }],
  parties: [{ id: 'p1', name: 'hello', memberIds: ['a2'] }],
}
const build = (text: string, accountId = 'a2') => {
  const plan = parseCommand(text, context)
  if (typeof plan === 'string' || plan.scope !== 'character') throw new Error(`not a character command: ${JSON.stringify(plan)}`)
  return plan.build(accountId)
}
const global = (text: string) => {
  const plan = parseCommand(text, context)
  if (typeof plan === 'string' || plan.scope !== 'global') throw new Error(`not a global command: ${JSON.stringify(plan)}`)
  return plan.calls
}

describe('command box', () => {
  test('character buttons', () => {
    expect(build('farm 10').body).toEqual({ action: 'farm', untilLevel: 10 })
    expect(build('練功').body).toEqual({ action: 'farm', untilLevel: null })
    expect(build('王戰').body).toEqual({ action: 'startBoss' })
    expect(build('任務').body).toEqual({ action: 'completeMission' })
    expect(build('修整').body).toEqual({ action: 'refit' })
    expect(build('goto f1-west').body).toEqual({ action: 'goto', areaId: 'f1-west' })
    expect(build('remove', 'a4')).toEqual({ method: 'DELETE', path: '/api/accounts/a4' })
    expect(parseCommand('remove', context)).toMatchObject({ confirm: expect.any(String) })
  })

  test('profile and settings', () => {
    expect(build('potion 回復要水').body).toMatchObject({ command: { type: 'updateSettings', settings: { potionItem: 'potion-1' } } })
    expect(build('instant instant-2')).toEqual({ method: 'PUT', path: '/api/accounts/a2/safety', body: { safety: { instantItem: 'instant-2' } } })
    expect(build('weapon none').body).toEqual({ weapon: null })
    expect(build('stock teleport 3 10').body).toEqual({ safety: { restock: { teleportMin: 3, teleportTarget: 10 } } })
    expect(parseCommand('stock potion 100 50', context)).toMatch(/stock/) // up-to below the restock line
  })

  test('parties and global', () => {
    expect(global('party create raid team')).toEqual([{ method: 'POST', path: '/api/parties', body: { name: 'raid team' } }])
    expect(global('party hello add alanchiu4')[0]!.body).toEqual({ memberIds: ['a2', 'a4'] })
    expect(global('party hello leader alan4')[0]!.body).toEqual({ leaderId: 'a4' })
    expect(global('party hello 修整')[0]).toEqual({ method: 'POST', path: '/api/parties/p1/goal', body: { mode: 'rest' } })
    expect(global('party hello go f2-depths')[0]!.body).toEqual({ areaId: 'f2-depths' })
    expect(global('pause')[0]!.path).toBe('/api/pause-all')
    expect(parseCommand('party nope fight', context)).toMatch(/No party/)
    expect(parseCommand('dance', context)).toMatch(/Unknown command/)
  })

  test('suggestions follow what is typed', () => {
    expect(suggestCommands('re', context).map((s) => s.text)).toEqual(expect.arrayContaining(['refit', 'restock', 'resume', 'reconnect', 'remove']))
    expect(suggestCommands('goto 稀飯', context).map((s) => s.text)).toEqual(['goto f1-west', 'goto f1-outskirts'])
    expect(suggestCommands('party ', context).map((s) => s.text)).toEqual(['party create ', 'party hello '])
    expect(suggestCommands('party hello le', context)[0]!.text).toBe('party hello leader ') // name matches rank first
    expect(suggestCommands('party hello add ', context).map((s) => s.text)).toEqual(['party hello add alanchiu2', 'party hello add alanchiu4'])
  })
})
