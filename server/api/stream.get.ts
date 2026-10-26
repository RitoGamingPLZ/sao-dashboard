// Server-Sent Events: a snapshot right away, then `snapshot` every second and `log` per event.
export default defineEventHandler(async (event) => {
  const stream = createEventStream(event)
  const send = (eventName: string, payload: unknown) => { stream.push({ event: eventName, data: JSON.stringify(payload) }) }
  streamSubscribers.add(send)
  stream.onClosed(() => { streamSubscribers.delete(send) })
  send('snapshot', useAccounts().snapshot())
  return stream.send()
})
