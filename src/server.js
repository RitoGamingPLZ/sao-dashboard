// Dashboard server: serves the UI and a small JSON API, and streams live
// account snapshots + events over Server-Sent Events. Binds to localhost by
// default. Set DASHBOARD_PASSWORD to require a password (HTTP Basic auth).

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { AccountManager } from './accounts.js';
import { loadProtocol } from './protocol.js';
import { areaLevel, parseArea, safeAreaFor } from './game-rules.js';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const MAX_BODY_BYTES = 64 * 1024;
const SNAPSHOT_INTERVAL_MS = 1000;

export function createDashboard({
  protocol = loadProtocol(PROJECT_ROOT),
  dataDir = join(PROJECT_ROOT, 'data'),
  dashboardPassword = process.env.DASHBOARD_PASSWORD,
  sessionTiming,
  partyTickMs,
} = {}) {
  const accountManager = new AccountManager({ protocol, dataDir, sessionTiming, partyTickMs });
  const partyManager = accountManager.partyManager;
  const streamClients = new Set();

  const sendJson = (response, statusCode, body) => {
    response.writeHead(statusCode, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(body));
  };
  const sendResult = (response, result, failureCode = 400) => sendJson(response, result?.error ? failureCode : 200, result);

  const isAuthorized = (request) => {
    if (!dashboardPassword) return true;
    const match = /^Basic (.+)$/.exec(request.headers.authorization || '');
    if (!match) return false;
    const givenPassword = Buffer.from(Buffer.from(match[1], 'base64').toString().split(':').slice(1).join(':'));
    const expectedPassword = Buffer.from(dashboardPassword);
    return givenPassword.length === expectedPassword.length && timingSafeEqual(givenPassword, expectedPassword);
  };

  // Block cross-site requests: writes must be JSON from this same origin.
  const isSameOrigin = (request) => {
    const origin = request.headers.origin;
    return !origin || origin === `http://${request.headers.host}` || origin === `https://${request.headers.host}`;
  };

  const readJsonBody = (request) => new Promise((resolve, reject) => {
    let rawBody = '';
    request.on('data', (chunk) => {
      rawBody += chunk;
      if (rawBody.length > MAX_BODY_BYTES) { reject(new Error('Request too big')); request.destroy(); }
    });
    request.on('end', () => {
      try { resolve(rawBody ? JSON.parse(rawBody) : {}); } catch { reject(new Error('Invalid JSON')); }
    });
  });

  async function runAccountAction(session, body) {
    const player = session.player;
    const busyError = { error: `Account busy: ${session.busyLabel}` };
    switch (body.action) {
      case 'startHunt':
      case 'startBoss': {
        if (session.busyLabel) return busyError;
        if (!player) return { error: 'disconnected' };
        // Dashboard only exposes Farm/Boss/Mission, not a manual "go to" —
        // auto-travel to a safe area first if the character is in town.
        if (parseArea(player.areaId)?.kind === 'town') {
          const targetAreaId = safeAreaFor(player.level, body.action === 'startBoss' ? 'bossroom' : 'field');
          if (!targetAreaId) return { error: 'noSafeArea' };
          session.withLock(`go to ${targetAreaId}`, () => session.goTo(targetAreaId))
            .then(async (result) => {
              if (result?.error) return session.log('error', `Travel: ${result.error}`);
              await session.sendCommand(session.commandOf(body.action), 'dashboard');
            });
          return { ok: true, isStarted: true };
        }
        return session.sendCommand(session.commandOf(body.action), 'dashboard');
      }
      case 'stopHunt':
      case 'stopBoss':
        if (session.busyLabel) return busyError;
        return session.sendCommand(session.commandOf(body.action), 'dashboard');
      case 'completeMission': {
        if (session.busyLabel) return busyError;
        const weapon = session.preferredWeapon;
        const extra = weapon ? { questType: 'uniqueWeapon', weapon } : {};
        return session.sendCommand(session.commandOf('completeMission', extra), 'dashboard');
      }
      case 'town': // emergency teleport crystal; skips the lock on purpose
        if (!(player?.inventory?.['crystal-teleport'] > 0)) return { error: 'No teleport crystals' };
        return session.sendCommand(session.commandOf('use', { itemId: 'crystal-teleport' }), 'dashboard');
      case 'goto': {
        const area = parseArea(body.areaId);
        if (!area) return { error: 'Unknown area id (expected like f40-field)' };
        const monsterLevel = areaLevel(body.areaId);
        if (area.kind !== 'town' && player && monsterLevel >= player.level) {
          return { error: `${body.areaId} is monster level ${monsterLevel} — too dangerous for Lv${player.level}` };
        }
        if (session.busyLabel) return busyError;
        session.withLock(`go to ${body.areaId}`, () => session.goTo(body.areaId))
          .then((result) => result?.error && session.log('error', `Travel: ${result.error}`));
        return { ok: true, isStarted: true };
      }
      case 'restock':
        if (session.busyLabel) return busyError;
        session.restock().then((result) => result?.error && session.log('error', `Restock: ${result.detail || result.error}`));
        return { ok: true, isStarted: true };
      case 'resume':
        session.resume();
        return { ok: true };
      case 'raw':
        if (session.busyLabel) return busyError;
        if (!body.command || typeof body.command.type !== 'string') return { error: 'command.type is required' };
        return session.sendCommand(body.command, 'console');
      default:
        return { error: 'Unknown action' };
    }
  }

  async function routeApi(request, response, url) {
    const pathParts = url.pathname.split('/').filter(Boolean); // ['api', resource, id, subResource]
    const [, resource, resourceId, subResource] = pathParts;
    const method = request.method;

    if (method === 'GET' && url.pathname === '/api/state') return sendJson(response, 200, accountManager.snapshot());
    if (method === 'GET' && url.pathname === '/api/events') return sendJson(response, 200, accountManager.recentEvents());
    if (method === 'GET' && url.pathname === '/api/stream') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      response.write(`event: snapshot\ndata: ${JSON.stringify(accountManager.snapshot())}\n\n`);
      streamClients.add(response);
      request.on('close', () => streamClients.delete(response));
      return;
    }

    const isJsonRequest = (request.headers['content-type'] || '').startsWith('application/json');
    if (method !== 'GET' && (!isSameOrigin(request) || !isJsonRequest)) {
      return sendJson(response, 403, { error: 'Cross-site or non-JSON request refused' });
    }
    let body = {};
    if (method === 'POST' || method === 'PUT') {
      try { body = await readJsonBody(request); } catch (error) { return sendJson(response, 400, { error: error.message }); }
    }

    if (method === 'POST' && url.pathname === '/api/accounts/login') {
      return sendResult(response, await accountManager.addByLogin(body.name, body.password, { shouldRememberPassword: !!body.shouldRememberPassword }));
    }
    if (method === 'POST' && url.pathname === '/api/accounts/create') {
      return sendResult(response, await accountManager.createAccount(body.name));
    }
    if (method === 'POST' && url.pathname === '/api/pause-all') {
      for (const party of partyManager.parties) if (party.isActive) await partyManager.deactivate(party.id);
      for (const session of accountManager.sessions) if (session.isHunting) session.sendCommand(session.commandOf('stopHunt'), 'dashboard');
      return sendJson(response, 200, { ok: true });
    }

    if (resource === 'accounts' && resourceId) {
      const session = accountManager.sessionsById.get(resourceId);
      if (!session) return sendJson(response, 404, { error: 'No such account' });
      if (method === 'DELETE' && !subResource) return sendResult(response, accountManager.removeAccount(session.id));
      if (method === 'POST' && subResource === 'action') return sendResult(response, await runAccountAction(session, body));
      if (method === 'PUT' && subResource === 'safety') {
        return sendResult(response, accountManager.updateSafety(session.id, body.safety || {}, { isUnsafeConfirmed: !!body.isUnsafeConfirmed }));
      }
      if (method === 'PUT' && subResource === 'weapon') return sendResult(response, accountManager.setPreferredWeapon(session.id, body.weapon));
      if (method === 'POST' && subResource === 'password') return sendResult(response, accountManager.revealPassword(session.id), 404);
    }

    if (resource === 'parties') {
      if (method === 'POST' && !resourceId) return sendJson(response, 200, partyManager.create(body.name));
      let result;
      if (method === 'PUT' && !subResource) result = await partyManager.update(resourceId, body);
      else if (method === 'DELETE' && !subResource) result = await partyManager.remove(resourceId);
      else if (method === 'POST' && subResource === 'start') result = await partyManager.activate(resourceId, body.goal);
      else if (method === 'POST' && subResource === 'goal') result = await partyManager.setGoal(resourceId, body);
      else if (method === 'POST' && subResource === 'stop') result = await partyManager.deactivate(resourceId);
      if (result) return sendResult(response, result);
    }

    sendJson(response, 404, { error: 'Not found' });
  }

  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    if (!isAuthorized(request)) {
      response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="SAO dashboard"' });
      return response.end('Password required');
    }
    const url = new URL(request.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) return await routeApi(request, response, url);
      const fileName = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!/^[\w.-]+$/.test(fileName)) return sendJson(response, 404, { error: 'Not found' });
      const fileContents = await readFile(join(PROJECT_ROOT, 'public', fileName));
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES[extname(fileName)] || 'application/octet-stream',
        'Content-Security-Policy': "default-src 'self'",
      });
      response.end(fileContents);
    } catch (error) {
      if (error.code === 'ENOENT') return sendJson(response, 404, { error: 'Not found' });
      sendJson(response, 500, { error: 'Server error' });
    }
  });

  const broadcast = (eventName, payload) => {
    const frame = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of streamClients) client.write(frame);
  };
  const snapshotTimer = setInterval(() => broadcast('snapshot', accountManager.snapshot()), SNAPSHOT_INTERVAL_MS);
  accountManager.eventListeners.add((event) => broadcast('log', event));

  const close = () => {
    clearInterval(snapshotTimer);
    for (const client of streamClients) client.end();
    accountManager.shutdown();
    server.close();
  };
  return { server, accountManager, close };
}

const isRunDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isRunDirectly) {
  const port = Number(process.env.PORT || 4400);
  const host = process.env.HOST || '127.0.0.1';
  const { server, close } = createDashboard();
  server.listen(port, host, () => console.log(`SAO dashboard on http://${host}:${port}`));
  process.on('SIGINT', () => { close(); process.exit(0); });
}
