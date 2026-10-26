export default defineEventHandler(async (event) => reply(event, await useAccounts().partyManager.deactivate(getRouterParam(event, 'id')!)))
