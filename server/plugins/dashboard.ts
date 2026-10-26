// Start the bots when the server starts, push a snapshot to every open
// dashboard once a second, and stop everything on shutdown.

const SNAPSHOT_INTERVAL_MS = 1000

export default defineNitroPlugin((nitroApp) => {
  const accounts = useAccounts()
  accounts.eventListeners.add((event) => broadcast('log', event))
  accounts.answerListeners.add((event) => broadcast('answered', { accountId: event.accountId, ts: event.ts, answer: event.answer }))
  const snapshotTimer = setInterval(() => {
    if (streamSubscribers.size) broadcast('snapshot', accounts.snapshot())
  }, SNAPSHOT_INTERVAL_MS)
  const shutDown = () => {
    clearInterval(snapshotTimer)
    closeAccounts()
  }
  nitroApp.hooks.hook('close', shutDown)
  // Log out of the game the moment we're asked to stop. Nitro's 'close' hook
  // only runs after open browser tabs drop their live stream, and until then
  // this process would fight the next server for the same characters.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, shutDown) // Nitro's own handler then exits
})
