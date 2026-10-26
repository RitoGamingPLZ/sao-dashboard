// One WebSocket per account (spec §3). Mirrors init + patch into `state`,
// reconnects with backoff, correlates command replies, rate-limits sends.
// Uses Node 22's built-in WebSocket (undici), so no dependencies.

import { EventEmitter } from 'node:events';
import { getPath } from './protocol.js';

const MAX_BACKOFF_MS = 30000;
const INITIAL_BACKOFF_MS = 1000;

export function applyPatch(state, operations) {
  for (const operation of operations) {
    const [path, value] = operation;
    if (!Array.isArray(path) || path.length === 0) continue;
    let parent = state;
    for (let i = 0; i < path.length - 1; i++) {
      if (parent[path[i]] == null || typeof parent[path[i]] !== 'object') parent[path[i]] = {};
      parent = parent[path[i]];
    }
    const lastKey = path[path.length - 1];
    const isDelete = operation.length < 2;
    if (isDelete) delete parent[lastKey];
    else parent[lastKey] = value;
  }
}

export class GameClient extends EventEmitter {
  constructor({ protocol, token, name, now = Date.now }) {
    super();
    this.protocol = protocol;
    this.token = token;
    this.name = name;
    this.now = now;
    this.state = null;
    this.serverParams = null;
    this.isConnected = false;
    this.lastPatchAt = 0;
    this.pendingReplies = new Map(); // command id -> resolve callback
    this.nextCommandId = 960000 + Math.floor(Math.random() * 1000) * 1000;
    this.backoffMs = INITIAL_BACKOFF_MS;
    this.isClosedByUser = false;
    this.recentSendTimes = [];
    this.observedMaxHp = 0;
  }

  connect() {
    this.isClosedByUser = false;
    const { auth } = this.protocol;
    let socketUrl = this.protocol.wsUrl;
    const headers = {};
    if (this.protocol.origin) headers.Origin = this.protocol.origin;
    if (auth.mode === 'query') socketUrl += `${socketUrl.includes('?') ? '&' : '?'}${auth.queryParam}=${encodeURIComponent(this.token)}`;
    if (auth.mode === 'header') headers.Authorization = `Bearer ${this.token}`;
    if (auth.mode === 'cookie') headers.Cookie = `${auth.cookieName}=${this.token}`;

    let socket;
    try {
      socket = new WebSocket(socketUrl, { headers });
    } catch (error) {
      this.emit('connectError', error);
      return this.scheduleReconnect();
    }
    this.socket = socket;
    socket.addEventListener('open', () => {
      this.backoffMs = INITIAL_BACKOFF_MS;
      if (auth.mode === 'firstFrame') socket.send(JSON.stringify({ t: auth.frameType, token: this.token }));
      this.emit('open');
    });
    socket.addEventListener('message', (event) => this.handleMessage(typeof event.data === 'string' ? event.data : String(event.data)));
    socket.addEventListener('close', (event) => this.handleClose(event));
    socket.addEventListener('error', () => {}); // a close event follows; the error has no detail
  }

  handleMessage(rawFrame) {
    let message;
    try { message = JSON.parse(rawFrame); } catch { return this.emit('unknown', { type: 'non-JSON' }); }
    if (message.t === 'init') {
      // Spec §3.4: replace the whole state, never merge into the old copy.
      this.state = message.state || {};
      this.isConnected = true;
      this.lastPatchAt = this.now();
      this.observedMaxHp = 0;
      this.trackHp();
      this.emit('init', this.state);
    } else if (message.t === 'patch') {
      if (!this.state) return;
      applyPatch(this.state, message.ops || []);
      this.lastPatchAt = this.now();
      this.trackHp();
      this.emit('patch', message.ops || []);
    } else if (message.t === 'result') {
      const resolveReply = this.pendingReplies.get(message.id);
      if (resolveReply) { this.pendingReplies.delete(message.id); resolveReply(message.result ?? {}); }
    } else if (message.t === 'params') {
      this.serverParams = message.params; // ignore `reload`: there is no page to reload
      this.emit('params', message.params);
    } else if (message.t === 'error' || message.t === 'authError') {
      this.emit('authError', message);
    } else {
      this.emit('unknown', { type: message.t });
    }
  }

  handleClose(event) {
    this.isConnected = false;
    this.socket = null;
    // Spec §3.4: never assume an in-flight command happened.
    for (const resolveReply of this.pendingReplies.values()) resolveReply({ error: 'disconnected' });
    this.pendingReplies.clear();
    this.emit('close', { code: event?.code, reason: event?.reason });
    if (!this.isClosedByUser) this.scheduleReconnect();
  }

  scheduleReconnect() {
    const delayMs = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), delayMs);
  }

  close() {
    this.isClosedByUser = true;
    clearTimeout(this.reconnectTimer);
    try { this.socket?.close(); } catch { /* already closed */ }
  }

  get player() { return this.state?.player ?? null; }

  // Max HP isn't a known field yet: try configured names, else the highest
  // HP seen since the last init (accurate once the character has rested).
  trackHp() {
    const currentHp = this.state?.player?.hp;
    if (typeof currentHp === 'number' && currentHp > this.observedMaxHp) this.observedMaxHp = currentHp;
  }

  maxHp() {
    const player = this.player;
    if (!player) return { value: null, isEstimated: true };
    for (const fieldPath of this.protocol.fields.maxHp) {
      const value = getPath(player, fieldPath);
      if (typeof value === 'number' && value > 0) return { value, isEstimated: false };
    }
    return { value: this.observedMaxHp || null, isEstimated: true };
  }

  expNeeded() {
    const player = this.player;
    if (!player) return null;
    for (const fieldPath of this.protocol.fields.expNeeded) {
      const value = getPath(player, fieldPath);
      if (typeof value === 'number' && value > 0) return value;
    }
    return null;
  }

  async waitForRateLimit() {
    for (;;) {
      const currentTime = this.now();
      this.recentSendTimes = this.recentSendTimes.filter((sentAt) => currentTime - sentAt < 1000);
      if (this.recentSendTimes.length < this.protocol.rateLimitPerSec) { this.recentSendTimes.push(currentTime); return; }
      const waitMs = 1000 - (currentTime - this.recentSendTimes[0]) + 5;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  // Resolves with the game's result: {ok:true} | {error:'code'} | {timeout:true}.
  async sendCommand(command, timeoutMs = this.protocol.commandTimeoutMs) {
    if (!this.isConnected || !this.socket) return { error: 'disconnected' };
    await this.waitForRateLimit();
    if (!this.socket) return { error: 'disconnected' };
    const commandId = ++this.nextCommandId;
    return new Promise((resolve) => {
      const timeoutTimer = setTimeout(() => { this.pendingReplies.delete(commandId); resolve({ timeout: true }); }, timeoutMs);
      this.pendingReplies.set(commandId, (result) => { clearTimeout(timeoutTimer); resolve(result); });
      try {
        this.socket.send(JSON.stringify({ t: 'cmd', id: commandId, cmd: command }));
      } catch {
        clearTimeout(timeoutTimer);
        this.pendingReplies.delete(commandId);
        resolve({ error: 'disconnected' });
      }
    });
  }
}
