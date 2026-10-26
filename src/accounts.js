// Account manager: adds accounts by logging in, creates new ones with a
// generated password, and owns one Session per account. Non-secret settings
// go to data/settings.json; tokens and passwords only to the encrypted vault.

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { Session } from './session.js';
import { Vault, generatePassword } from './vault.js';
import { login, register, ACCOUNT_NAME_PATTERN, AuthError } from './game-auth.js';
import { PartyManager } from './party.js';
import { validateSafety } from './safety.js';
import { WEAPON_TYPES } from './game-rules.js';

export class AccountManager {
  constructor({ protocol, dataDir, sessionTiming, partyTickMs }) {
    this.protocol = protocol;
    mkdirSync(dataDir, { recursive: true });
    this.vault = new Vault(join(dataDir, 'vault.enc'));
    this.settingsFile = join(dataDir, 'settings.json');
    this.sessionsById = new Map();
    this.sessionTiming = sessionTiming;
    this.eventListeners = new Set();
    this.partyManager = new PartyManager({
      getSession: (accountId) => this.sessionsById.get(accountId),
      save: () => this.saveSettings(),
      tickMs: partyTickMs,
    });
    this.loadSettings();
  }

  get sessions() { return [...this.sessionsById.values()]; }

  loadSettings() {
    const settings = existsSync(this.settingsFile)
      ? JSON.parse(readFileSync(this.settingsFile, 'utf8'))
      : { accounts: [], parties: [] };
    for (const account of settings.accounts || []) {
      const secret = this.vault.get(account.id);
      if (secret?.token) this.startSession(account.id, account.name, secret.token, account);
    }
    this.partyManager.load(settings.parties || []);
  }

  saveSettings() {
    const settings = {
      accounts: this.sessions.map((session) => ({ id: session.id, name: session.name, safety: session.safety, preferredWeapon: session.preferredWeapon })),
      parties: this.partyManager?.parties ?? [],
    };
    const temporaryFile = `${this.settingsFile}.tmp`;
    writeFileSync(temporaryFile, JSON.stringify(settings, null, 2));
    renameSync(temporaryFile, this.settingsFile);
  }

  startSession(accountId, name, token, settings = {}) {
    const session = new Session({ id: accountId, name, token, protocol: this.protocol, settings, timing: this.sessionTiming });
    session.on('event', (event) => { for (const listener of this.eventListeners) listener(event); });
    this.sessionsById.set(accountId, session);
    session.start();
    return session;
  }

  findByName(name) {
    const wanted = name.toLowerCase();
    return this.sessions.find((session) => session.name.toLowerCase() === wanted);
  }

  // Add an existing game account by logging in. The password is used once to
  // get a token and is kept (encrypted) only if shouldRememberPassword is set.
  async addByLogin(name, password, { shouldRememberPassword = false } = {}) {
    const accountName = String(name || '').trim();
    if (!accountName || !password) return { error: 'Name and password are required' };
    if (this.findByName(accountName)) return { error: `${accountName} is already on the dashboard` };
    try {
      const { token } = await login(this.protocol, accountName, password);
      const accountId = randomUUID();
      this.vault.set(accountId, shouldRememberPassword ? { token, password } : { token });
      const session = this.startSession(accountId, accountName, token);
      this.saveSettings();
      session.log('state', 'Added by login');
      return { id: accountId, name: accountName };
    } catch (error) {
      return { error: error instanceof AuthError ? error.message : 'Login failed' };
    }
  }

  // Create a brand-new game account with a generated password. The password
  // is returned to the caller once and kept encrypted in the vault.
  async createAccount(name) {
    const accountName = String(name || '').trim();
    if (!ACCOUNT_NAME_PATTERN.test(accountName)) return { error: 'Name must be 3–16 letters, digits or _' };
    if (this.findByName(accountName)) return { error: `${accountName} is already on the dashboard` };
    const password = generatePassword();
    try {
      const { token } = await register(this.protocol, accountName, password);
      const accountId = randomUUID();
      this.vault.set(accountId, { token, password });
      const session = this.startSession(accountId, accountName, token);
      this.saveSettings();
      session.log('state', 'New account created');
      return { id: accountId, name: accountName, password };
    } catch (error) {
      return { error: error instanceof AuthError ? error.message : 'Sign-up failed' };
    }
  }

  // Show a saved password again (from the vault only; never logged).
  revealPassword(accountId) {
    const secret = this.vault.get(accountId);
    return secret?.password ? { password: secret.password } : { error: 'No saved password for this account' };
  }

  removeAccount(accountId) {
    const session = this.sessionsById.get(accountId);
    if (!session) return { error: 'No such account' };
    session.stop();
    this.sessionsById.delete(accountId);
    this.vault.delete(accountId);
    this.partyManager.dropAccount(accountId);
    this.saveSettings();
    return { ok: true };
  }

  updateSafety(accountId, update, options) {
    const session = this.sessionsById.get(accountId);
    if (!session) return { error: 'No such account' };
    const validation = validateSafety(session.safety, update, options);
    if (validation.error) return validation;
    session.safety = validation.safety;
    this.saveSettings();
    session.log('mode', 'Safety settings changed');
    return { safety: session.safety };
  }

  setPreferredWeapon(accountId, weapon) {
    const session = this.sessionsById.get(accountId);
    if (!session) return { error: 'No such account' };
    if (weapon && !WEAPON_TYPES.includes(weapon)) return { error: 'Unknown weapon type' };
    session.setPreferredWeapon(weapon);
    this.saveSettings();
    return { preferredWeapon: session.preferredWeapon };
  }

  snapshot() {
    return {
      accounts: this.sessions.map((session) => session.summary()),
      parties: this.partyManager.summary(),
    };
  }

  recentEvents(limit = 200) {
    return this.sessions.flatMap((session) => session.events).sort((first, second) => first.ts - second.ts).slice(-limit);
  }

  shutdown() {
    this.partyManager.stop();
    for (const session of this.sessions) session.stop();
  }
}
