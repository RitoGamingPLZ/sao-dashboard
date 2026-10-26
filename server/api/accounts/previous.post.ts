// Add a previously removed account back (needs its saved password).
export default defineEventHandler(async (event) => {
  const body = await readBody<{ account?: string }>(event)
  return reply(event, await useAccounts().restorePrevious(body.account))
})
