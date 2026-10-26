export default defineEventHandler((event) => reply(event, useAccounts().removeAccount(sessionFrom(event).id)))
