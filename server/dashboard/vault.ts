// The only place secrets (tokens, passwords) live. Encrypted at rest with
// AES-256-GCM. The key comes from SAO_VAULT_KEY (any passphrase) or, if unset,
// a random key file next to the vault (chmod 600).

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs'
import { dirname, join } from 'node:path'

const IV_BYTES = 12
const AUTH_TAG_BYTES = 16
const OWNER_ONLY = 0o600

export interface Secret { token?: string, password?: string }

export class Vault {
  private encryptionKey: Buffer
  private secretsById: Record<string, Secret>

  constructor(private vaultFile: string, passphrase = process.env.SAO_VAULT_KEY) {
    mkdirSync(dirname(vaultFile), { recursive: true })
    this.encryptionKey = this.loadKey(passphrase)
    this.secretsById = this.readSecrets()
  }

  private loadKey(passphrase?: string) {
    if (passphrase) return scryptSync(passphrase, 'sao-dashboard-vault', 32)
    const keyFile = join(dirname(this.vaultFile), 'vault.key')
    if (!existsSync(keyFile)) {
      writeFileSync(keyFile, randomBytes(32).toString('hex'), { mode: OWNER_ONLY })
      chmodSync(keyFile, OWNER_ONLY)
    }
    return Buffer.from(readFileSync(keyFile, 'utf8').trim(), 'hex')
  }

  private readSecrets(): Record<string, Secret> {
    if (!existsSync(this.vaultFile)) return {}
    const encrypted = readFileSync(this.vaultFile)
    const iv = encrypted.subarray(0, IV_BYTES)
    const authTag = encrypted.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES)
    const cipherText = encrypted.subarray(IV_BYTES + AUTH_TAG_BYTES)
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv)
    decipher.setAuthTag(authTag)
    return JSON.parse(Buffer.concat([decipher.update(cipherText), decipher.final()]).toString('utf8'))
  }

  private writeSecrets() {
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv)
    const cipherText = Buffer.concat([cipher.update(JSON.stringify(this.secretsById), 'utf8'), cipher.final()])
    writeFileSync(this.vaultFile, Buffer.concat([iv, cipher.getAuthTag(), cipherText]), { mode: OWNER_ONLY })
  }

  get(accountId: string): Secret | null { return this.secretsById[accountId] ?? null }
  set(accountId: string, secret: Secret) { this.secretsById[accountId] = { ...this.secretsById[accountId], ...secret }; this.writeSecrets() }
  delete(accountId: string) { delete this.secretsById[accountId]; this.writeSecrets() }
}

// Readable but strong: 16 characters from a 56-letter alphabet (no 0/O/1/l/I)
// with at least one lowercase, uppercase and digit. About 93 bits of entropy.
export function generatePassword(length = 16): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz' + 'ABCDEFGHJKLMNPQRSTUVWXYZ' + '23456789'
  const unbiasedLimit = 256 - (256 % alphabet.length)
  for (;;) {
    let password = ''
    for (const randomByte of randomBytes(length * 2)) {
      if (randomByte >= unbiasedLimit) continue // avoid modulo bias
      password += alphabet[randomByte % alphabet.length]
      if (password.length === length) break
    }
    const hasEveryClass = /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password)
    if (password.length === length && hasEveryClass) return password
  }
}
