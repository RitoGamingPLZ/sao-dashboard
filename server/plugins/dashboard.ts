// Start the bots when the server starts, push a snapshot to every open
// dashboard once a second, and stop everything on shutdown.

const SNAPSHOT_INTERVAL_MS = 1000

export default defineNitroPlugin((nitroApp) => {
  const accounts = useAccounts()
  accounts.eventListeners.add((event) => broadcast('log', event))
  const snapshotTimer = setInterval(() => {
    if (streamSubscribers.size) broadcast('snapshot', accounts.snapshot())
  }, SNAPSHOT_INTERVAL_MS)
  nitroApp.hooks.hook('close', () => {
    clearInterval(snapshotTimer)
    closeAccounts()
  })
})
