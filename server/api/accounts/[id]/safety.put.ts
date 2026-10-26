import type { SafetyUpdate } from '../../../dashboard/safety'

export default defineEventHandler(async (event) => {
  const session = sessionFrom(event)
  const body = await readBody<{ safety?: SafetyUpdate, isUnsafeConfirmed?: boolean }>(event)
  return reply(event, useAccounts().updateSafety(session.id, body.safety || {}, { isUnsafeConfirmed: !!body.isUnsafeConfirmed }))
})
