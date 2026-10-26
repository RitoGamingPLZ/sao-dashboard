export default defineEventHandler(async () => {
  const accounts = useAccounts()
  const { partyManager } = accounts
  for (const party of partyManager.parties) if (party.isActive) await partyManager.deactivate(party.id)
  for (const session of accounts.sessions) if (session.isHunting) session.command('stopHunt', {}, 'dashboard')
  return { ok: true }
})
