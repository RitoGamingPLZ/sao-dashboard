export default defineEventHandler((event) => reply(event, useAccounts().revealPassword(sessionFrom(event).id), 404))
