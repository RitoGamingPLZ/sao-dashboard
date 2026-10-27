// Connector for the SAO game service. The rest of the server talks to the
// game only through this module: typed HTTP calls (SaoConnector) and one
// live socket per character (GameSocket). Shapes are taken from the game's
// own web client; see protocol.ts.

import { EventEmitter } from 'node:events'
import { appendFileSync } from 'node:fs'
import { getPath, type SaoProtocol, type CommandKey, type PartyOpKey } from './protocol'

// ---- HTTP -----------------------------------------------------------------

export class SaoApiError extends Error {
  constructor(public code: string, public status?: number) {
    super(code)
  }
}

export interface LinkRequest {
  account: string
  password: string
  name?: string // character name; only used when the account is new
}
export interface SaoCharacter { name: string, dead: boolean, floor: number, createdAt: number, death: unknown }
export interface MeResponse { account: string, characters: SaoCharacter[] }

const HTTP_TIMEOUT_MS = 15000

export class SaoConnector {
  constructor(private protocol: SaoProtocol) {}

  private async request<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (this.protocol.origin) headers.Origin = this.protocol.origin
    if (token) headers.Authorization = `Bearer ${token}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    let response: Response
    try {
      response = await fetch(new URL(path, this.protocol.baseUrl), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      })
    } catch {
      throw new SaoApiError('network')
    }
    const responseBody = await response.json().catch(() => ({ error: 'serverError' })) as T & { error?: string }
    if (!response.ok || responseBody.error) throw new SaoApiError(responseBody.error ?? 'serverError', response.status)
    return responseBody
  }

  // Log in, or create the account (with `name` as its first character) if it doesn't exist yet.
  link(request: LinkRequest) {
    const body = { account: request.account, password: request.password, ...(request.name ? { name: request.name } : {}) }
    return this.request<{ token: string }>('POST', '/api/link', body)
  }

  me(token: string) { return this.request<MeResponse>('GET', '/api/me', undefined, token) }
  newCharacter(token: string, name: string) { return this.request<{ token?: string }>('POST', '/api/characters', { name }, token) }
  changePassword(token: string, old: string, next: string) { return this.request<{ ok?: boolean }>('POST', '/api/password', { old, next }, token) }
  world() { return this.request<unknown>('GET', '/api/world') }
  ranking() { return this.request<unknown>('GET', '/api/ranking') }

  async findCharacter(name: string) {
    try {
      return await this.request<unknown>('GET', `/api/characters/${encodeURIComponent(name)}`)
    } catch (error) {
      if (error instanceof SaoApiError && error.code === 'notFound') return null
      throw error
    }
  }

  openSocket(token: string) { return new GameSocket(this.protocol, token) }
}

// ---- WebSocket ------------------------------------------------------------

export interface GameCommand { type: string, [key: string]: unknown }
export interface CommandResult { ok?: boolean, error?: string, timeout?: boolean, [key: string]: unknown }

export interface GamePlayer {
  name: string
  level: number
  exp: number
  hp: number
  col: number
  areaId: string
  activity?: { type: string, phase?: string }
  inventory?: Record<string, number>
  equipment?: Record<string, string>
  learnedSkills?: string[]
  enemies?: unknown[]
  clearedFloors?: number[]
  instantCdMs?: number
  settings?: { autoPotion?: boolean, potionItem?: string, potionPct?: number }
  miasmaSince?: number | null
  miasmaMs?: number | null
  dead?: unknown
  story?: { ch?: string, step?: number, n?: number } | null
  quests?: Record<string, number>
  questsDone?: string[]
  [key: string]: unknown
}
export interface GameState { time?: number, player?: GamePlayer, [key: string]: unknown }
export type PatchOp = [path: Array<string | number>, value?: unknown]

// Why the server ended the connection for good (no automatic reconnect).
export type EndReason = 'unauthorized' | 'replaced' | 'kicked' | 'banned' | string

interface GameSocketEvents {
  init: [state: GameState]
  patch: [ops: PatchOp[]]
  params: [params: Record<string, unknown>]
  close: [info: { code?: number, reason?: string }]
  connectError: [error: Error]
  ended: [reason: EndReason]
  queued: [info: { pos?: number, n?: number }]
  gameLog: [entries: GameLogEntry[]]
  serverEvent: [message: Record<string, any>]
}

// One line of the game's own log (sent inside each patch).
export interface GameLogEntry { t: number, key: string, p?: Record<string, unknown>, kind: string }

// Frames the bots don't act on but the dashboard should show (or ask about).
const SHOWN_FRAMES = new Set(['idleWarn', 'partyInvite', 'followInvite', 'friendRequest', 'retreat', 'rally', 'frozen', 'maintenance'])

const MAX_BACKOFF_MS = 30000
const INITIAL_BACKOFF_MS = 1000
const FULL_RETRY_MS = 15000

// Patches come from the game server: never let a key reach Object.prototype.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function applyPatch(state: Record<string, unknown>, operations: PatchOp[]) {
  for (const operation of operations) {
    const [path, value] = operation
    if (!Array.isArray(path) || path.length === 0 || path.some((key) => UNSAFE_KEYS.has(String(key)))) continue
    let parent = state as Record<string | number, unknown>
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i]!
      if (parent[key] == null || typeof parent[key] !== 'object') parent[key] = {}
      parent = parent[key] as Record<string | number, unknown>
    }
    const lastKey = path[path.length - 1]!
    if (operation.length < 2) delete parent[lastKey]
    else parent[lastKey] = value
  }
}

// One socket per character: mirrors init + patch into `state`, reconnects
// with backoff, correlates command replies, rate-limits sends.
// Uses Node 22's built-in WebSocket, so no dependencies.
export class GameSocket extends EventEmitter<GameSocketEvents> {
  state: GameState | null = null
  serverParams: Record<string, unknown> | null = null
  // The in-game party this character is in (from the game's `party` frames), or null.
  gameParty: { leader: string, members: Array<{ name: string }> } | null = null
  isConnected = false
  lastPatchAt = 0
  endReason: EndReason | null = null
  private socket: WebSocket | null = null
  private pendingReplies = new Map<number, (result: CommandResult) => void>()
  private nextCommandId = 960000 + Math.floor(Math.random() * 1000) * 1000
  private backoffMs = INITIAL_BACKOFF_MS
  private isClosedByUser = false
  private recentSendTimes: number[] = []
  private observedMaxHp = 0
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private pingTimer?: ReturnType<typeof setInterval>

  constructor(private protocol: SaoProtocol, private token: string, private now: () => number = Date.now) {
    super()
  }

  setToken(token: string) { this.token = token }

  // Answer the game's "are you still there?" (idleWarn).
  awake() { this.sendFrame({ t: 'awake' }) }

  connect() {
    this.isClosedByUser = false
    this.endReason = null
    const headers: Record<string, string> = {}
    if (this.protocol.origin) headers.Origin = this.protocol.origin
    let socket: WebSocket
    try {
      // Node's WebSocket accepts { headers }; the DOM typings don't know it.
      socket = new WebSocket(this.protocol.wsUrl, { headers } as unknown as string[])
    } catch (error) {
      this.emit('connectError', error as Error)
      return this.scheduleReconnect()
    }
    this.socket = socket
    socket.addEventListener('open', () => {
      this.backoffMs = INITIAL_BACKOFF_MS
      this.sendFrame({ t: 'auth', token: this.token })
    })
    socket.addEventListener('message', (event) => this.handleMessage(String(event.data)))
    socket.addEventListener('close', (event) => this.handleClose(event))
    socket.addEventListener('error', () => {}) // a close event follows; the error has no detail
    clearInterval(this.pingTimer)
    this.pingTimer = setInterval(() => this.sendFrame({ t: 'ping' }), this.protocol.pingMs)
  }

  private sendFrame(frame: object) {
    if (this.socket?.readyState === WebSocket.OPEN) this.sendRaw(JSON.stringify(frame))
  }

  private sendRaw(rawFrame: string) {
    this.socket!.send(rawFrame)
    this.capture('out', rawFrame)
  }

  // SAO_WS_LOG=file appends every frame as a JSON line, to study the protocol. Tokens are masked.
  private capture(direction: 'in' | 'out', rawFrame: string) {
    const logFile = process.env.SAO_WS_LOG
    if (!logFile) return
    const frame = rawFrame.replace(/"token":"[^"]*"/g, '"token":"***"')
    appendFileSync(logFile, `{"at":${this.now()},"who":${JSON.stringify(this.state?.player?.name ?? null)},"dir":"${direction}","frame":${frame}}\n`)
  }

  private handleMessage(rawFrame: string) {
    this.capture('in', rawFrame)
    let message: Record<string, any>
    try { message = JSON.parse(rawFrame) } catch { return }
    switch (message.t) {
      case 'init':
        // Replace the whole state, never merge into the old copy.
        this.state = message.state || {}
        this.isConnected = true
        this.lastPatchAt = this.now()
        this.observedMaxHp = 0
        this.trackHp()
        this.emit('init', this.state!)
        break
      case 'patch':
        if (!this.state) return
        applyPatch(this.state, message.ops || [])
        this.lastPatchAt = this.now()
        this.trackHp()
        this.emit('patch', message.ops || [])
        if (message.log?.length) this.emit('gameLog', message.log)
        break
      case 'result': {
        const resolveReply = this.pendingReplies.get(message.id)
        if (resolveReply) { this.pendingReplies.delete(message.id); resolveReply(message.result ?? {}) }
        break
      }
      case 'params':
        this.serverParams = message.params
        this.emit('params', message.params)
        break
      case 'error':
        if (message.code === 'full') { this.backoffMs = FULL_RETRY_MS; this.emit('queued', { pos: message.pos, n: message.n }) }
        else this.end(message.code || 'error')
        break
      case 'replaced': this.end('replaced'); break
      case 'kicked': this.end(message.reason === 'banned' ? 'banned' : 'kicked'); break
      case 'party': this.gameParty = message.party ?? null; break
      case 'idleKick': this.end('idleKick'); break
      case 'dead': this.end('dead'); break
      case 'reborn': // the game made a new character for this login: carry on with its token
        this.token = message.token
        this.emit('serverEvent', { t: 'reborn', name: message.name })
        this.socket?.close()
        break
      default:
        if (SHOWN_FRAMES.has(message.t)) this.emit('serverEvent', message)
      // The rest (chat, mail, notices, nearby players…) isn't needed by the bots.
    }
  }

  // The server ended the session for good: stop, and don't reconnect.
  private end(reason: EndReason) {
    this.endReason = reason
    this.close()
    this.emit('ended', reason)
  }

  private handleClose(event: CloseEvent) {
    this.isConnected = false
    this.socket = null
    clearInterval(this.pingTimer)
    // Never assume an in-flight command happened.
    for (const resolveReply of this.pendingReplies.values()) resolveReply({ error: 'disconnected' })
    this.pendingReplies.clear()
    this.emit('close', { code: event?.code, reason: event?.reason })
    if (!this.isClosedByUser) this.scheduleReconnect()
  }

  private scheduleReconnect() {
    const delayMs = this.backoffMs
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS)
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => this.connect(), delayMs)
  }

  close() {
    this.isClosedByUser = true
    clearTimeout(this.reconnectTimer)
    clearInterval(this.pingTimer)
    try { this.socket?.close() } catch { /* already closed */ }
  }

  get player(): GamePlayer | null { return this.state?.player ?? null }

  // The real game computes max HP client-side from level + gear, so it's
  // usually not on the player: fall back to the highest HP seen since init.
  private trackHp() {
    const currentHp = this.state?.player?.hp
    if (typeof currentHp === 'number' && currentHp > this.observedMaxHp) this.observedMaxHp = currentHp
  }

  private firstNumberField(fieldPaths: string[]): number | null {
    for (const fieldPath of fieldPaths) {
      const value = getPath(this.player, fieldPath)
      if (typeof value === 'number' && value > 0) return value
    }
    return null
  }

  maxHp(): { value: number | null, isEstimated: boolean } {
    if (!this.player) return { value: null, isEstimated: true }
    const value = this.firstNumberField(this.protocol.fields.maxHp)
    return value ? { value, isEstimated: false } : { value: this.observedMaxHp || null, isEstimated: true }
  }

  expNeeded() { return this.player ? this.firstNumberField(this.protocol.fields.expNeeded) : null }
  attack() { return this.player ? this.firstNumberField(this.protocol.fields.attack) : null }

  // The game's own limit (params.maxCmdsPerSec) minus one for safety, never above our setting.
  private commandsPerSecond() {
    const serverLimit = Number(this.serverParams?.maxCmdsPerSec)
    return Number.isFinite(serverLimit) && serverLimit > 1 ? Math.min(this.protocol.rateLimitPerSec, serverLimit - 1) : this.protocol.rateLimitPerSec
  }

  private async waitForRateLimit() {
    for (;;) {
      const currentTime = this.now()
      this.recentSendTimes = this.recentSendTimes.filter((sentAt) => currentTime - sentAt < 1000)
      if (this.recentSendTimes.length < this.commandsPerSecond()) { this.recentSendTimes.push(currentTime); return }
      await new Promise((resolve) => setTimeout(resolve, 1000 - (currentTime - this.recentSendTimes[0]!) + 5))
    }
  }

  // Build a game command from a dashboard command key; null if the game has none.
  commandOf(commandKey: CommandKey, extra: Record<string, unknown> = {}): GameCommand | null {
    const type = this.protocol.commands[commandKey]
    return type ? { type, ...extra } : null
  }

  // Resolves with the game's result: {ok:true} | {error:'code'} | {timeout:true}.
  async sendCommand(command: GameCommand, timeoutMs = this.protocol.commandTimeoutMs): Promise<CommandResult> {
    if (!this.isConnected || !this.socket) return { error: 'disconnected' }
    await this.waitForRateLimit()
    if (!this.socket) return { error: 'disconnected' }
    const commandId = ++this.nextCommandId
    return new Promise((resolve) => {
      const timeoutTimer = setTimeout(() => { this.pendingReplies.delete(commandId); resolve({ timeout: true }) }, timeoutMs)
      this.pendingReplies.set(commandId, (result) => { clearTimeout(timeoutTimer); resolve(result) })
      try {
        this.sendRaw(JSON.stringify({ t: 'cmd', id: commandId, cmd: command }))
      } catch {
        clearTimeout(timeoutTimer)
        this.pendingReplies.delete(commandId)
        resolve({ error: 'disconnected' })
      }
    })
  }

  // Party actions are fire-and-forget frames; the game answers with a `party` broadcast, not a result.
  async sendPartyOp(opKey: PartyOpKey, name?: string): Promise<CommandResult> {
    const op = this.protocol.partyOps[opKey]
    if (!op) return { error: 'unsupported' }
    if (!this.isConnected) return { error: 'disconnected' }
    await this.waitForRateLimit()
    this.sendFrame({ t: 'party', op, ...(name ? { name } : {}) })
    return { ok: true }
  }
}
