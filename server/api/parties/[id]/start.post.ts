import type { PartyGoal } from '#shared/types'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ goal?: Partial<PartyGoal> }>(event)
  return reply(event, await useAccounts().partyManager.activate(getRouterParam(event, 'id')!, body.goal))
})
