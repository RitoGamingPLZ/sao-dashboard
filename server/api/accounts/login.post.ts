export default defineEventHandler(async (event) => {
  const body = await readBody<{ account?: string, password?: string, shouldRememberPassword?: boolean }>(event)
  return reply(event, await useAccounts().addByLogin(body.account, body.password, { shouldRememberPassword: !!body.shouldRememberPassword }))
})
