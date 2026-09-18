// Client for the Swiggy Instamart MCP, talking to the local fix-up proxy
// from PR 1 (scripts/swiggy-mcp-proxy.js) over its Streamable HTTP
// endpoint. The proxy is a long-lived local server (it holds the OAuth
// session), so unlike the Fetch MCP we don't spawn a fresh process per
// call -- we ensure exactly one proxy is running and talk HTTP to it,
// reusing the cached token from the user's one-time interactive login.
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROXY_PORT = 8791;
const PROXY_URL = `http://127.0.0.1:${PROXY_PORT}/im`;
const TOKEN_DIR = path.join(os.homedir(), '.mcp-auth', 'mcp-remote-v1');

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function findCachedAccessToken() {
  if (!fs.existsSync(TOKEN_DIR)) return null;
  const file = fs.readdirSync(TOKEN_DIR).find((f) => f.endsWith('_tokens.json'));
  if (!file) return null;
  const data = JSON.parse(fs.readFileSync(path.join(TOKEN_DIR, file), 'utf8'));
  return data.access_token || null;
}

async function ensureProxyRunning() {
  if (await isPortOpen(PROXY_PORT)) return;

  const child = spawn('node', ['scripts/swiggy-mcp-proxy.js'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'ignore',
    detached: true,
  });
  child.unref();

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isPortOpen(PROXY_PORT)) return;
  }
  throw new Error('Timed out waiting for the Swiggy MCP proxy to start listening on port ' + PROXY_PORT);
}

class InstamartClient {
  constructor() {
    this.sessionId = null;
    this.nextId = 1;
  }

  async _rpc(body) {
    const token = findCachedAccessToken();
    if (!token) {
      throw new Error(
        'No cached Swiggy OAuth token found. Run `node scripts/swiggy-mcp-proxy.js` in an ' +
          'interactive terminal once and complete the browser login before running the agent.'
      );
    }
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token}`,
    };
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;

    const res = await fetch(PROXY_URL, { method: 'POST', headers, body: JSON.stringify(body) });
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;

    if (res.status === 401) {
      throw new Error(
        'Swiggy Instamart returned 401 Unauthorized -- the cached token may have expired. ' +
          'Re-run `node scripts/swiggy-mcp-proxy.js` interactively to log in again.'
      );
    }

    const ct = res.headers.get('content-type') || '';
    const text = await res.text();
    if (ct.includes('text/event-stream')) {
      const line = text.split('\n').find((l) => l.startsWith('data:'));
      return line ? JSON.parse(line.slice(5).trim()) : null;
    }
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  async init() {
    await ensureProxyRunning();
    await this._rpc({
      jsonrpc: '2.0',
      id: this.nextId++,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'recipe-budget-agent', version: '0.1.0' },
      },
    });
  }

  async callTool(name, args) {
    const result = await this._rpc({
      jsonrpc: '2.0',
      id: this.nextId++,
      method: 'tools/call',
      params: { name, arguments: args },
    });
    if (!result || !result.result) {
      throw new Error(`Instamart tool "${name}" returned no result: ${JSON.stringify(result)}`);
    }
    return result.result;
  }
}

module.exports = { InstamartClient };
