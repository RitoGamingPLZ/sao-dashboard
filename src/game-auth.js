// Login and sign-up against the game's HTTP API. The endpoints and shapes are
// UNVERIFIED guesses configured in protocol.js; errors carry the HTTP status
// and the game's error code (never the password).

import { fillTemplate } from './protocol.js';

export const ACCOUNT_NAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;

export class AuthError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

async function callEndpoint(protocol, endpoint, templateValues, token) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (protocol.origin) headers.Origin = protocol.origin;
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(new URL(endpoint.path, protocol.baseUrl), {
      method: endpoint.method || 'POST',
      headers,
      body: endpoint.body ? JSON.stringify(fillTemplate(endpoint.body, templateValues)) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw new AuthError('unreachable', `Can't reach the game server (${error.cause?.code || error.name})`);
  }
  let responseBody = {};
  try { responseBody = await response.json(); } catch { /* empty or non-JSON body */ }
  if (!response.ok || responseBody.error) {
    const errorCode = responseBody.error || `http${response.status}`;
    throw new AuthError(errorCode, `Game said: ${responseBody.error || response.status}`);
  }
  return responseBody;
}

export async function login(protocol, name, password) {
  const responseBody = await callEndpoint(protocol, protocol.login, { name, password });
  const token = responseBody[protocol.login.tokenField];
  if (!token) throw new AuthError('noToken', 'Login answered without a token — check protocol.login.tokenField');
  return { token };
}

export async function register(protocol, name, password) {
  const { create: createEndpoint, setPassword: setPasswordEndpoint } = protocol.register;
  const responseBody = await callEndpoint(protocol, createEndpoint, { name, password });
  const token = responseBody[createEndpoint.tokenField];
  if (!token) throw new AuthError('noToken', 'Sign-up answered without a token — check protocol.register.create.tokenField');
  if (setPasswordEndpoint) await callEndpoint(protocol, setPasswordEndpoint, { name, password }, token);
  return { token };
}
