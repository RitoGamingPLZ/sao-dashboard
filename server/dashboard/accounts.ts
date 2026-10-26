// Account manager: adds accounts by logging in, creates new ones with a
// generated password, and owns one Session per account. Non-secret settings
// go to data/settings.json; tokens and passwords only to the encrypted vault.

import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { MAX_ACCOUNTS, WEAPON_TYPES } from '#shared/game-rules'
import type { AutoFarm, Party, Safety, Snapshot } from '#shared/types'
import type { SaoProtocol } from '../sao/protocol'
import { SaoConnector, SaoApiError } from '../sao/connector'
import { Session, type SessionTiming } from './session'
import { Vault, generatePassword } from './vault'
import { PartyManager } from './party'
import { validateSafety, type SafetyUpdate } from './safety'

interface SavedAccount { id: string, account?: string, name: string, safety?: Safety, preferredWeapon?: string | null, autoFarm?: AutoFarm | null, isOnHold?: boolean }
// Accounts removed from the dashboard, kept so they can be added back in one click.
export interface PreviousAccount { id: string, account: string, name: string }
interface Settings { accounts: SavedAccount[], parties: Party[], previousAccounts?: PreviousAccount[] }

// Game error codes → something a person can act on.
const GAME_ERRORS: Record<string, string> = {
  wrongLogin: 'Wrong account or password',
  network: "Can't reach the game server",
  serverError: 'The game server had an error',
}
const describeGameError = (error: unknown) =>
  error instanceof SaoApiError ? GAME_ERRORS[error.code] ?? `Game said: ${error.code}` : 'Unexpected error talking to the game'

export class AccountManager {
  readonly protocol: SaoProtocol
  readonly connector: SaoConnector
  readonly vault: Vault
  readonly partyManager: PartyManager
  readonly sessionsById = new Map<string, Session>()
  readonly eventListeners = new Set<(event: Session['events'][number]) => void>()
  readonly answerListeners = new Set<(event: Session['events'][number]) => void>()
  private settingsFile: string
  private sessionTiming?: Partial<SessionTiming>

  constructor({ protocol, dataDir, sessionTiming, partyTickMs }: {
    protocol: SaoProtocol
    dataDir: string
    sessionTiming?: Partial<SessionTiming>
    partyTickMs?: number
  }) {
    this.protocol = protocol
    this.connector = new SaoConnector(protocol)
    mkdirSync(dataDir, { recursive: true })
    this.vault = new Vault(join(dataDir, 'vault.enc'))
    this.settingsFile = join(dataDir, 'settings.json')
    this.sessionTiming = sessionTiming
    this.partyManager = new PartyManager({
      getSession: (accountId) => this.sessionsById.get(accountId),
      save: () => this.saveSettings(),
      tickMs: partyTickMs,
    })
    this.loadSettings()
  }

  previousAccounts: PreviousAccount[] = []

  get sessions() { return [...this.sessionsById.values()] }

  private loadSettings() {
    const settings: Settings = existsSync(this.settingsFile)
      ? JSON.parse(readFileSync(this.settingsFile, 'utf8'))
      : { accounts: [], parties: [] }
    for (const saved of settings.accounts || []) {
      const secret = this.vault.get(saved.id)
      // Older settings only had `name`, which was also the login.
      if (secret?.token) this.startSession(saved.id, saved.account ?? saved.name, saved.name, secret.token, saved)
    }
    this.partyManager.load(settings.parties || [])
    this.previousAccounts = settings.previousAccounts || []
  }

  saveSettings() {
    const settings: Settings = {
      accounts: this.sessions.map((session) => ({
        id: session.id, account: session.account, name: session.name, safety: session.safety, preferredWeapon: session.preferredWeapon, autoFarm: session.autoFarm, isOnHold: session.isOnHold,
      })),
      parties: this.partyManager?.parties ?? [],
      previousAccounts: this.previousAccounts,
    }
    const temporaryFile = `${this.settingsFile}.tmp`
    writeFileSync(temporaryFile, JSON.stringify(settings, null, 2))
    renameSync(temporaryFile, this.settingsFile)
  }

  private startSession(accountId: string, account: string, name: string, token: string, settings: Partial<SavedAccount> = {}) {
    const session = new Session({
      id: accountId, account, name, token,
      protocol: this.protocol,
      connector: this.connector,
      settings,
      timing: this.sessionTiming,
      relink: () => this.relink(accountId, account),
    })
    session.on('event', (event) => { for (const listener of this.eventListeners) listener(event) })
    session.on('answered', (event) => { for (const listener of this.answerListeners) listener(event) })
    session.on('settingsChanged', () => this.saveSettings())
    session.acceptsInviteFrom = (inviterName) => this.partyManager.acceptsInviteFrom(accountId, inviterName)
    this.sessionsById.set(accountId, session)
    session.start()
    return session
  }

  // The game rejected a saved token: log in again if we kept the password.
  private async relink(accountId: string, account: string): Promise<string | null> {
    const password = this.vault.get(accountId)?.password
    if (!password) return null
    const { token } = await this.connector.link({ account, password })
    this.vault.set(accountId, { token })
    return token
  }

  findByAccount(account: string) {
    const wanted = account.toLowerCase()
    return this.sessions.find((session) => session.account.toLowerCase() === wanted)
  }

  // Add an existing game account by logging in. The password is kept
  // (encrypted) only if shouldRememberPassword is set.
  async addByLogin(account: unknown, password: unknown, { shouldRememberPassword = false } = {}) {
    const accountId = String(account || '').trim()
    if (!accountId || !password) return { error: 'Account and password are required' }
    if (this.findByAccount(accountId)) return { error: `${accountId} is already on the dashboard` }
    if (this.sessions.length >= MAX_ACCOUNTS) return { error: `The dashboard runs at most ${MAX_ACCOUNTS} characters` }
    try {
      const { token } = await this.connector.link({ account: accountId, password: String(password) })
      const id = randomUUID()
      this.vault.set(id, shouldRememberPassword ? { token, password: String(password) } : { token })
      const session = this.startSession(id, accountId, accountId, token)
      this.forgetPrevious(accountId)
      this.saveSettings()
      session.log('state', 'Added by login')
      return { id, account: accountId }
    } catch (error) {
      return { error: describeGameError(error) }
    }
  }

  // Create a brand-new game account + first character with a generated
  // password. The password is returned once and kept encrypted in the vault.
  // (The game's /api/link creates the account when it doesn't exist yet.)
  async createAccount(account: unknown, name: unknown) {
    const accountId = String(account || '').trim()
    const characterName = String(name || '').trim()
    if (!accountId || !characterName) return { error: 'Account and character name are required' }
    if (this.findByAccount(accountId)) return { error: `${accountId} is already on the dashboard` }
    if (this.sessions.length >= MAX_ACCOUNTS) return { error: `The dashboard runs at most ${MAX_ACCOUNTS} characters` }
    const password = generatePassword()
    try {
      const { token } = await this.connector.link({ account: accountId, password, name: characterName })
      const id = randomUUID()
      this.vault.set(id, { token, password })
      const session = this.startSession(id, accountId, characterName, token)
      this.saveSettings()
      session.log('state', 'New account created')
      return { id, account: accountId, name: characterName, password }
    } catch (error) {
      // An existing account with a different password answers wrongLogin.
      if (error instanceof SaoApiError && error.code === 'wrongLogin') return { error: `Account "${accountId}" already exists — use Log in instead` }
      return { error: describeGameError(error) }
    }
  }

  // Show a saved password again (from the vault only; never logged).
  revealPassword(accountId: string) {
    const secret = this.vault.get(accountId)
    return secret?.password ? { password: secret.password } : { error: 'No saved password for this account' }
  }

  removeAccount(accountId: string) {
    const session = this.sessionsById.get(accountId)
    if (!session) return { error: 'No such account' }
    session.stop()
    this.sessionsById.delete(accountId)
    // Remember it (and its saved password, if any) for the "previous accounts" list.
    this.previousAccounts = [{ id: accountId, account: session.account, name: session.name }, ...this.previousAccounts.filter((previous) => previous.account !== session.account)]
    this.partyManager.dropAccount(accountId)
    this.saveSettings()
    return { ok: true }
  }

  listPrevious() {
    return this.previousAccounts
      .filter((previous) => !this.findByAccount(previous.account))
      .map((previous) => ({ account: previous.account, name: previous.name, hasPassword: Boolean(this.vault.get(previous.id)?.password) }))
  }

  // Add a removed account back using its saved password.
  async restorePrevious(account: unknown) {
    const previous = this.previousAccounts.find((candidate) => candidate.account === String(account))
    if (!previous) return { error: 'Not in the previous accounts list' }
    const password = this.vault.get(previous.id)?.password
    if (!password) return { error: 'No saved password — type it in to log in' }
    if (this.sessions.length >= MAX_ACCOUNTS) return { error: `The dashboard runs at most ${MAX_ACCOUNTS} characters` }
    try {
      const { token } = await this.connector.link({ account: previous.account, password })
      this.vault.set(previous.id, { token })
      const session = this.startSession(previous.id, previous.account, previous.name, token)
      this.previousAccounts = this.previousAccounts.filter((candidate) => candidate !== previous)
      this.saveSettings()
      session.log('state', 'Added back from previous accounts')
      return { id: previous.id, account: previous.account }
    } catch (error) {
      return { error: describeGameError(error) }
    }
  }

  // Drop an account from the previous list, and its saved secrets with it.
  forgetPrevious(account: unknown) {
    for (const previous of this.previousAccounts.filter((candidate) => candidate.account === String(account))) this.vault.delete(previous.id)
    this.previousAccounts = this.previousAccounts.filter((candidate) => candidate.account !== String(account))
    this.saveSettings()
    return { ok: true }
  }

  updateSafety(accountId: string, update: SafetyUpdate, options: { isUnsafeConfirmed: boolean }) {
    const session = this.sessionsById.get(accountId)
    if (!session) return { error: 'No such account' }
    const validation = validateSafety(session.safety, update, options)
    if (validation.error !== undefined) return validation
    session.safety = validation.safety
    this.saveSettings()
    session.log('mode', 'Safety settings changed')
    return { safety: session.safety }
  }

  setPreferredWeapon(accountId: string, weapon: string | null) {
    const session = this.sessionsById.get(accountId)
    if (!session) return { error: 'No such account' }
    if (weapon && !(WEAPON_TYPES as readonly string[]).includes(weapon)) return { error: 'Unknown weapon type' }
    session.setPreferredWeapon(weapon)
    this.saveSettings()
    return { preferredWeapon: session.preferredWeapon }
  }

  snapshot(): Snapshot {
    return { accounts: this.sessions.map((session) => session.summary()), parties: this.partyManager.summary() }
  }

  recentEvents(limit = 300) {
    return this.sessions.flatMap((session) => session.events).sort((first, second) => first.ts - second.ts).slice(-limit)
  }

  shutdown() {
    this.partyManager.stop()
    for (const session of this.sessions) session.stop()
  }
}
