// Our own Swiggy OAuth 2.1 + PKCE client -- built so the login can happen
// through the deployed website itself (a "Connect Swiggy" link a real
// user clicks), rather than depending on mcp-remote's CLI-oriented flow,
// which opens a browser and runs a callback server on the SAME machine as
// the process -- fundamentally incompatible with a cloud deployment where
// the browser (the user's laptop) and the server (Railway) are different
// machines.
//
// This deliberately skips generic RFC 8414 metadata discovery (the source
// of the real IssuerMismatchError bug documented in examples/sample-runs.md
// and scripts/swiggy-mcp-proxy.js) and just uses Swiggy's known-correct
// endpoints directly, confirmed live:
//   authorize: https://mcp.swiggy.com/auth/authorize
//   token:     https://mcp.swiggy.com/auth/token
//   register:  https://mcp.swiggy.com/auth/register
// scripts/swiggy-mcp-proxy.js is still kept for local use via Claude
// Code's own MCP client (.mcp.json), which does do generic discovery.
//
// Tokens are keyed by the visitor's sessionId (agent/session.js) -- a
// real bug caught after deploying to Railway: with a single global token
// variable, every visitor to the deployed URL shared one login (whoever
// connected first), so a second person opening the site saw "already
// connected" to the FIRST person's Swiggy account. Each session now gets
// its own isolated tokens.
const crypto = require('crypto');

const AUTH_BASE = 'https://mcp.swiggy.com/auth';
const RESOURCE = 'https://mcp.swiggy.com/im';
const PENDING_TTL_MS = 10 * 60 * 1000; // 10 minutes to complete a login

// In-memory only -- resets on restart/redeploy, which just means logging
// in again via the website. Fine for a single-instance deployment; a
// multi-instance or long-lived production deployment would want this
// persisted instead. The client registration is app-level (shared across
// everyone); only the issued tokens are per-session.
let registeredClient = null; // { clientId, redirectUri }
const pendingLogins = new Map(); // state -> { sessionId, codeVerifier, createdAt }
const tokensBySession = new Map(); // sessionId -> { accessToken, refreshToken, expiresAt }

function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function purgeExpiredPending() {
  const cutoff = Date.now() - PENDING_TTL_MS;
  for (const [state, entry] of pendingLogins) {
    if (entry.createdAt < cutoff) pendingLogins.delete(state);
  }
}

async function ensureClient(redirectUri) {
  if (registeredClient && registeredClient.redirectUri === redirectUri) {
    return registeredClient.clientId;
  }
  const res = await fetch(`${AUTH_BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: 'Recipe Budget Agent',
    }),
  });
  if (!res.ok) throw new Error(`Swiggy client registration failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  registeredClient = { clientId: data.client_id, redirectUri };
  return data.client_id;
}

async function buildAuthorizeUrl(sessionId, redirectUri) {
  purgeExpiredPending();
  const clientId = await ensureClient(redirectUri);

  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
  const state = base64url(crypto.randomBytes(16));
  pendingLogins.set(state, { sessionId, codeVerifier, createdAt: Date.now() });

  const url = new URL(`${AUTH_BASE}/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', 'mcp:tools mcp:resources mcp:prompts');
  url.searchParams.set('resource', RESOURCE);
  return url.toString();
}

async function handleCallback(code, state, redirectUri) {
  const pending = pendingLogins.get(state);
  if (!pending) throw new Error('Unknown or expired login attempt (state not found) -- try logging in again.');
  pendingLogins.delete(state);

  const res = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: registeredClient.clientId,
      code_verifier: pending.codeVerifier,
    }),
  });
  if (!res.ok) throw new Error(`Swiggy token exchange failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  tokensBySession.set(pending.sessionId, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
}

async function refreshIfNeeded(sessionId) {
  const tokens = tokensBySession.get(sessionId);
  if (!tokens) return;
  if (Date.now() < tokens.expiresAt - 60000) return; // still valid for >60s
  if (!tokens.refreshToken) return; // will fail downstream, prompting re-login

  const res = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: registeredClient.clientId,
    }),
  });
  if (!res.ok) {
    tokensBySession.delete(sessionId); // refresh failed -- user needs to log in again
    return;
  }
  const data = await res.json();
  tokensBySession.set(sessionId, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || tokens.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
}

async function getAccessToken(sessionId) {
  await refreshIfNeeded(sessionId);
  const tokens = tokensBySession.get(sessionId);
  if (!tokens) {
    throw new Error('Not logged into Swiggy yet -- visit /auth/swiggy/login to connect your account.');
  }
  return tokens.accessToken;
}

function isLoggedIn(sessionId) {
  return tokensBySession.has(sessionId);
}

module.exports = { buildAuthorizeUrl, handleCallback, getAccessToken, isLoggedIn, RESOURCE };
