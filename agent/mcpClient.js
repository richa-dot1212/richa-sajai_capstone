// Minimal MCP client over stdio (newline-delimited JSON-RPC), driven by the
// server commands already defined in .mcp.json from PR 1 -- this file does
// not hardcode server commands, it reads the same config Claude Code uses.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const MCP_CONFIG = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '.mcp.json'), 'utf8')
).mcpServers;

class McpClient {
  constructor(serverName) {
    const cfg = MCP_CONFIG[serverName];
    if (!cfg) throw new Error(`No MCP server named "${serverName}" in .mcp.json`);
    this.serverName = serverName;
    this.command = cfg.command;
    this.args = cfg.args || [];
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = '';
    this.child = null;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.child = spawn(this.command, this.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
        cwd: path.join(__dirname, '..'),
      });

      this.child.stderr.on('data', () => {
        // Swallow noisy dependency/deprecation warnings from child MCP
        // servers; real errors surface through JSON-RPC error responses.
      });

      this.child.on('error', reject);

      this.child.stdout.on('data', (chunk) => {
        this.buffer += chunk.toString();
        let idx;
        while ((idx = this.buffer.indexOf('\n')) !== -1) {
          const line = this.buffer.slice(0, idx);
          this.buffer = this.buffer.slice(idx + 1);
          if (!line.trim()) continue;
          let msg;
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }
          if (msg.id != null && this.pending.has(msg.id)) {
            const { resolve: res, reject: rej } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) rej(new Error(msg.error.message || JSON.stringify(msg.error)));
            else res(msg.result);
          }
        }
      });

      this._send({
        jsonrpc: '2.0',
        id: this.nextId++,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'recipe-budget-agent', version: '0.1.0' },
        },
      }).then(() => {
        this._notify({ jsonrpc: '2.0', method: 'notifications/initialized' });
        resolve();
      }, reject);
    });
  }

  _send(msg) {
    return new Promise((resolve, reject) => {
      this.pending.set(msg.id, { resolve, reject });
      this.child.stdin.write(JSON.stringify(msg) + '\n');
      setTimeout(() => {
        if (this.pending.has(msg.id)) {
          this.pending.delete(msg.id);
          reject(new Error(`MCP call timed out: ${msg.method}`));
        }
      }, 60000);
    });
  }

  _notify(msg) {
    this.child.stdin.write(JSON.stringify(msg) + '\n');
  }

  async listTools() {
    const result = await this._send({ jsonrpc: '2.0', id: this.nextId++, method: 'tools/list' });
    return result.tools;
  }

  async callTool(name, args) {
    const result = await this._send({
      jsonrpc: '2.0',
      id: this.nextId++,
      method: 'tools/call',
      params: { name, arguments: args },
    });
    return result;
  }

  close() {
    if (this.child) this.child.kill();
  }
}

module.exports = { McpClient };
