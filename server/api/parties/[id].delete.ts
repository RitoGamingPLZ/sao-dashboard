export default defineEventHandler(async (event) => reply(event, await useAccounts().partyManager.remove(getRouterParam(event, 'id')!)))
