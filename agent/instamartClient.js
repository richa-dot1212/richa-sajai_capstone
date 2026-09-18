// Client for the Swiggy Instamart MCP -- calls the real server directly
// (https://mcp.swiggy.com/im) using our own OAuth tokens from
// agent/swiggyOAuth.js. Deliberately does not go through mcp-remote or
// the local scripts/swiggy-mcp-proxy.js: that path only works when the
// browser doing the login and the process making tool calls are the same
// machine, which breaks for a real deployment (the browser is the user's
// laptop; the server is Railway). scripts/swiggy-mcp-proxy.js is kept for
// local use via Claude Code's own MCP client (.mcp.json), which does need
// the metadata-fixing workaround since it does generic OAuth discovery;
// our own app now sidesteps that entirely by using known-correct
// endpoints and its own token, obtained via a real login through the
// website.
const { getAccessToken, RESOURCE } = require('./swiggyOAuth');

class InstamartClient {
  // userSessionId identifies which visitor's Swiggy login to use (see
  // agent/session.js) -- required so each visitor to the deployed site
  // gets their own Instamart account, not one shared global login.
  constructor(userSessionId) {
    if (!userSessionId) throw new Error('InstamartClient requires a userSessionId');
    this.userSessionId = userSessionId;
    this.mcpSessionId = null; // the MCP protocol's own session id, unrelated to userSessionId
    this.nextId = 1;
  }

  async _rpc(body) {
    const token = await getAccessToken(this.userSessionId);
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token}`,
    };
    if (this.mcpSessionId) headers['Mcp-Session-Id'] = this.mcpSessionId;

    const res = await fetch(RESOURCE, { method: 'POST', headers, body: JSON.stringify(body) });
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.mcpSessionId = sid;

    if (res.status === 401) {
      throw new Error('Swiggy Instamart returned 401 Unauthorized -- your login may have expired. Visit /auth/swiggy/login to reconnect.');
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
