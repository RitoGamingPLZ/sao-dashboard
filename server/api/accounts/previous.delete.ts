// Forget a previously removed account and its saved password.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ account?: string }>(event)
  return reply(event, useAccounts().forgetPrevious(body.account))
})
