export default defineEventHandler(async (event) => {
  const body = await readBody<{ account?: string, name?: string }>(event)
  return reply(event, await useAccounts().createAccount(body.account, body.name))
})
