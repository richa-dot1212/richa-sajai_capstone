# Sample runs — PR 1 (MCP smoke tests)

**This is not a full agent run.** The agent doesn't exist yet — that's PR 2.
This file documents the real MCP connectivity tests performed for PR 1's
foundation: raw MCP JSON-RPC handshakes over stdio, run from the command
line against the two configured servers in `.mcp.json`.

## Test 1: Fetch MCP (`fetch-mcp`) — PASSED

Command: spawned `npx -y fetch-mcp`, sent a real `initialize` →
`notifications/initialized` → `tools/list` → `tools/call` sequence over
stdio.

- `initialize` succeeded: server identified itself as `fetch-mcp@0.0.5`.
- `tools/list` returned two real tools: `fetch_url`, `fetch_youtube_transcript`.
- `tools/call fetch_url` against a real recipe URL —
  `https://sallysbakingaddiction.com/chewy-chocolate-chip-cookies/#tasty-recipes-70437`
  — returned real page content (confirmed: total page length 353,556
  characters).

**Genuine issue found:** the first ~250,000 characters of this specific
page are ad-tech/tracking JavaScript and CSS, not article content — a
default `tools/call` (default `max_length: 2000`, `start_index: 0`) returns
only script/CSS noise, not the recipe. Paging further in
(`start_index: 250000`) does reach real converted markdown content. This
site is unusually bloated with ad infrastructure; not every recipe site
will need this much pagination, but the future agent's retrieval step
(PR 2) needs to page past leading boilerplate rather than assume the
recipe content starts near the top of the fetched page, and/or should try
`raw: false` with a large `max_length` and search the result for recipe
markers (e.g. "Ingredients", quantity units) rather than reading from
index 0 only.

## Test 2: Swiggy Instamart MCP (`mcp-remote` → `https://mcp.swiggy.com/im`) — BLOCKED

Command: `npx -y mcp-remote https://mcp.swiggy.com/im`

Swiggy's Instamart MCP is real (Swiggy Builders Club, OAuth 2.1 + PKCE, no
static API key) and `mcp-remote` is the standard bridge for stdio clients
to reach OAuth-protected remote MCP servers. On connection attempt:

```
[pid] Discovering OAuth server configuration...
[pid] Connecting to remote server: https://mcp.swiggy.com/im
[pid] Using transport strategy: http-first
[pid] Connection error: IssuerMismatchError: Issuer mismatch in authorization
      server metadata (RFC 8414 §3.3): expected "https://mcp.swiggy.com/",
      received "https://mcp.swiggy.com/auth"
[pid] Fatal error: IssuerMismatchError ...
```

**What this is:** `mcp-remote` fetches Swiggy's OAuth authorization server
metadata and strictly validates (per RFC 8414 §3.3) that the metadata's
`issuer` field matches the server URL it was discovered from. Swiggy's
metadata reports issuer `https://mcp.swiggy.com/auth`, but `mcp-remote`
expected `https://mcp.swiggy.com/` (the MCP endpoint's own origin) — a real
mismatch between Swiggy's OAuth metadata and `mcp-remote`'s strict RFC 8414
check, not a headless-environment/browser limitation. `mcp-remote --help`
exposes no flag to relax this check.

**What was attempted:**
- Configuring `swiggy-instamart` in `.mcp.json` via `npx -y mcp-remote
  https://mcp.swiggy.com/im` (current, correct URL and package per Swiggy's
  own docs).
- Running the connection directly from the command line to isolate the
  failure from any client-specific behavior — same error.
- Checked `mcp-remote --help` for a metadata-validation bypass flag — none
  exists in the installed version (`mcp-remote@0.14.2`).

**What remains blocked / next steps for PR 2:** either (a) wait for
Swiggy or `mcp-remote` to fix the metadata mismatch, (b) pin/try a
different `mcp-remote` version in case this is version-specific, or (c) if
still blocked, connect using a lower-level MCP HTTP client that performs
the OAuth flow without the strict issuer check, or fall back to a
documented alternative Instamart integration path. This is the single
biggest open risk carried into PR 2, as previously flagged in `plan.md`.
