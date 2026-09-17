#!/usr/bin/env node
// Works around a real, currently-open bug in Swiggy's Instamart MCP OAuth
// metadata (https://github.com/Swiggy/swiggy-mcp-server-manifest/issues/88):
//
//   1. GET /.well-known/oauth-protected-resource -> 404 (should exist per RFC 9728)
//   2. GET /.well-known/oauth-authorization-server -> issuer field is
//      "https://mcp.swiggy.com/auth" instead of "https://mcp.swiggy.com",
//      which violates RFC 8414 SS3.3 and makes spec-compliant clients
//      (mcp-remote included) reject it with IssuerMismatchError before ever
//      reaching the browser login step.
//
// This proxy sits between mcp-remote and the real mcp.swiggy.com: it serves
// corrected versions of the two broken metadata documents and transparently
// forwards everything else (including the actual MCP traffic) to the real
// server untouched. Once mcp-remote is pointed at this proxy instead of
// directly at mcp.swiggy.com, OAuth discovery succeeds and it can proceed to
// a real Swiggy login -- completing that login still requires the user's own
// Swiggy account, interactively, in a browser.

const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

const UPSTREAM = 'https://mcp.swiggy.com';
const PORT = process.env.SWIGGY_PROXY_PORT ? Number(process.env.SWIGGY_PROXY_PORT) : 8791;
const PROXY_BASE = `http://127.0.0.1:${PORT}`;

function fetchUpstreamMetadata() {
  return new Promise((resolve, reject) => {
    https.get(`${UPSTREAM}/.well-known/oauth-authorization-server`, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

async function handleAuthServerMetadata(res) {
  const real = await fetchUpstreamMetadata();
  const corrected = { ...real, issuer: PROXY_BASE };
  const json = JSON.stringify(corrected);
  res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}

function handleProtectedResourceMetadata(res) {
  const doc = {
    resource: `${PROXY_BASE}/im`,
    authorization_servers: [PROXY_BASE],
  };
  const json = JSON.stringify(doc);
  res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}

function proxyPassthrough(req, res) {
  const upstreamUrl = new URL(req.url, UPSTREAM);
  const upstreamReq = https.request(
    upstreamUrl,
    { method: req.method, headers: { ...req.headers, host: upstreamUrl.host } },
    (upstreamRes) => {
      const headers = { ...upstreamRes.headers };
      // The real server's 401 challenge points at its own (404ing) protected
      // resource metadata URL -- rewrite it to point back at this proxy so
      // the client doesn't get bounced to the broken real one.
      if (upstreamRes.statusCode === 401 && headers['www-authenticate']) {
        headers['www-authenticate'] = headers['www-authenticate'].replace(
          /resource_metadata="[^"]*"/,
          `resource_metadata="${PROXY_BASE}/.well-known/oauth-protected-resource"`
        );
      }
      res.writeHead(upstreamRes.statusCode, headers);
      upstreamRes.pipe(res);
    }
  );
  upstreamReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'bad_gateway', error_description: String(err) }));
  });
  req.pipe(upstreamReq);
}

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (req.method === 'GET' && path === '/.well-known/oauth-authorization-server') {
    handleAuthServerMetadata(res).catch((err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad_gateway', error_description: String(err) }));
    });
    return;
  }
  if (req.method === 'GET' && path === '/.well-known/oauth-protected-resource') {
    handleProtectedResourceMetadata(res);
    return;
  }
  proxyPassthrough(req, res);
});

server.listen(PORT, '127.0.0.1', () => {
  process.stderr.write(`[swiggy-mcp-proxy] listening on ${PROXY_BASE}, forwarding to ${UPSTREAM}\n`);

  const child = spawn('npx', ['-y', 'mcp-remote', `${PROXY_BASE}/im`], {
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
  });

  process.stdin.pipe(child.stdin);
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);

  child.on('exit', (code) => {
    server.close();
    process.exit(code == null ? 1 : code);
  });
});
