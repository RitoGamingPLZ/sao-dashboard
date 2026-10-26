import type { PartyGoal } from '#shared/types'

export default defineEventHandler(async (event) => {
  return reply(event, await useAccounts().partyManager.setGoal(getRouterParam(event, 'id')!, await readBody<Partial<PartyGoal>>(event)))
})
