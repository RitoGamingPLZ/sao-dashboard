export default defineEventHandler(async (event) => {
  const session = sessionFrom(event)
  const body = await readBody<{ weapon?: string | null }>(event)
  return reply(event, useAccounts().setPreferredWeapon(session.id, body.weapon || null))
})
