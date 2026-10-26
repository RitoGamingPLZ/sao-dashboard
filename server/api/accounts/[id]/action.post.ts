import { runAccountAction, type ActionRequest } from '../../../dashboard/actions'

export default defineEventHandler(async (event) => {
  const session = sessionFrom(event)
  const body = await readBody<ActionRequest>(event)
  // Answering a question in the log: only the first answer counts.
  if (body.answering != null && session.events.find((candidate) => candidate.ts === body.answering)?.answer) {
    return reply(event, { error: 'Already answered' })
  }
  const result = await runAccountAction(session, body)
  if (body.answering != null && !result.error) session.markAnswered(body.answering, body.answerLabel ?? body.action)
  return reply(event, result)
})
