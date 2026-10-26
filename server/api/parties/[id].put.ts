import type { PartyChanges } from '../../dashboard/party'

export default defineEventHandler(async (event) => {
  const result = await useAccounts().partyManager.update(getRouterParam(event, 'id')!, await readBody<PartyChanges>(event))
  return reply(event, result)
})
