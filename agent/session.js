// Minimal cookie-based session identifier -- no dependency needed for
// just one random ID per visitor. This is what makes the Swiggy login
// per-user instead of one shared global login: each browser gets its own
// sessionId, and agent/swiggyOAuth.js keys its token storage by that ID.
const crypto = require('crypto');

const COOKIE_NAME = 'sessionId';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function sessionMiddleware(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  let sessionId = cookies[COOKIE_NAME];
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    res.setHeader(
      'Set-Cookie',
      `${COOKIE_NAME}=${sessionId}; HttpOnly; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax`
    );
  }
  req.sessionId = sessionId;
  next();
}

module.exports = { sessionMiddleware };
