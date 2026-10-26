import { runAccountAction, type ActionRequest } from '../../../dashboard/actions'

export default defineEventHandler(async (event) => {
  const session = sessionFrom(event)
  return reply(event, await runAccountAction(session, await readBody<ActionRequest>(event)))
})
