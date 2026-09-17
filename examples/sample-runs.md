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

## Test 2: Swiggy Instamart MCP (`mcp-remote` → `https://mcp.swiggy.com/im`) — WORKING (initially blocked, fixed with a local proxy)

Command: `npx -y mcp-remote https://mcp.swiggy.com/im`

Swiggy's Instamart MCP is real (Swiggy Builders Club, OAuth 2.1 + PKCE, no
static API key) and `mcp-remote` is the standard bridge for stdio clients
to reach OAuth-protected remote MCP servers. On the first connection
attempt (direct, no proxy):

```
[pid] Discovering OAuth server configuration...
[pid] Connecting to remote server: https://mcp.swiggy.com/im
[pid] Using transport strategy: http-first
[pid] Connection error: IssuerMismatchError: Issuer mismatch in authorization
      server metadata (RFC 8414 §3.3): expected "https://mcp.swiggy.com/",
      received "https://mcp.swiggy.com/auth"
[pid] Fatal error: IssuerMismatchError ...
```

**What this is:** confirmed as a real, currently-open bug on Swiggy's own
side —
[Swiggy/swiggy-mcp-server-manifest#88](https://github.com/Swiggy/swiggy-mcp-server-manifest/issues/88)
(filed 2026-08-20, still reproducing per another developer's comment as of
2026-09-14). Verified directly against the live server with `curl`:

- `POST https://mcp.swiggy.com/im` → 401, `WWW-Authenticate` points
  `resource_metadata` at `https://mcp.swiggy.com/.well-known/oauth-protected-resource`,
  which itself returns **404**.
- `GET https://mcp.swiggy.com/.well-known/oauth-authorization-server` → 200,
  but `issuer` is `"https://mcp.swiggy.com/auth"` instead of
  `"https://mcp.swiggy.com"` — violates RFC 8414 §3.3, which is why
  spec-compliant clients like `mcp-remote` reject it before ever reaching
  browser login. `mcp-remote --help` exposes no flag to relax this check,
  and path-aware discovery variants (`/.well-known/.../im`) don't help
  either — they just hit the same 401 auth gate.

**Fix applied:** `scripts/swiggy-mcp-proxy.js` — a small local Node reverse
proxy that sits between `mcp-remote` and the real Swiggy server. It serves
a corrected `oauth-authorization-server` document (fixed `issuer`), a
synthesized `oauth-protected-resource` document (the real one 404s),
rewrites the `WWW-Authenticate` header on proxied 401s to point back at
itself instead of the broken real URL, and transparently forwards
everything else (including the actual MCP traffic) to the real
`https://mcp.swiggy.com`. `.mcp.json`'s `swiggy-instamart` entry now runs
this proxy (which itself spawns `mcp-remote` pointed at the proxy) instead
of calling `mcp-remote` directly.

Verified end to end, run from the command line:

```
[swiggy-mcp-proxy] listening on http://127.0.0.1:8791, forwarding to https://mcp.swiggy.com
[pid] Discovering OAuth server configuration...
[pid] Discovered authorization server: http://127.0.0.1:8791
[pid] Connecting to remote server: http://127.0.0.1:8791/im
[pid] Using transport strategy: http-first

Please authorize this client by visiting:
https://mcp.swiggy.com/auth/authorize?response_type=code&client_id=swiggy-mcp&code_challenge=...&redirect_uri=http%3A%2F%2F127.0.0.1%3A29006%2Foauth%2Fcallback&...&resource=http%3A%2F%2F127.0.0.1%3A8791%2Fim

[pid] Browser opened automatically.
[pid] Authentication required. Initializing auth...
[pid] OAuth callback server running at http://127.0.0.1:29006
[pid] This instance is running the sign-in for this server (callback port 29006)
[pid] Authentication required. Waiting for authorization...
```

`IssuerMismatchError` is gone — `mcp-remote` now gets a real, valid
authorization URL from Swiggy's actual `/auth/authorize` endpoint and is
correctly waiting for login.

**Login completed and real tool calls verified.** The user ran the proxy in
an interactive terminal, the browser opened automatically, and they logged
into their real Swiggy account. The connection then completed:

```
[pid] Auth code received, resolving promise
[pid] Completing authorization...
[pid] Connected to remote server using StreamableHTTPClientTransport
[pid] Local STDIO server running
[pid] Proxy established successfully between local STDIO and remote StreamableHTTPClientTransport
```

(Two non-fatal SEP-2352 warnings appeared about `mcp-remote` not
implementing a newer discovery-state binding — informational, did not
block the connection.)

With the resulting cached token (`~/.mcp-auth/mcp-remote-v1/..._tokens.json`,
5-day expiry per Swiggy's docs), real authenticated tool calls were made
directly against the proxy's HTTP endpoint (raw MCP JSON-RPC over
Streamable HTTP, not mocked):

- `tools/list` returned the server's real identity
  (`swiggy-instamart-mcp-server`) and its full real tool set:
  `get_addresses, create_address, delete_address, search_products,
  your_go_to_items, get_cart, update_cart, clear_cart, checkout,
  get_orders, track_order, get_delivery_status, report_error,
  get_payment_options, check_payment_status, confirm_order`.
- `get_addresses` returned the account's real saved addresses (not
  reproduced here — real PII, deliberately excluded from this repo).
- `search_products` for `"toor dal"` **initially failed** with `addressId
  is required` — a genuine API validation error, revealing that
  `search_products` needs a resolved `addressId` first (Instamart
  inventory/pricing is address-local). Retried after resolving an
  `addressId` from `get_addresses`, and it succeeded: 12 real matching
  products plus 12 similar items, e.g. *"Tata Sampann Unpolished Toor Dal
  (Arhar Dal), 500 g — MRP ₹118, offer price ₹101, rating 4.6 (21.8k),
  8 min delivery"*, with full real pricing/stock/rating data for each.

**Confirmed scope for PR 2:** `search_products` and `get_cart`/`update_cart`
are real and callable now that a token exists; `checkout`/`confirm_order`/
payment tools are present in the schema but must **not** be used, per the
assignment's cart-only scope. Any future automated test run must resolve
`addressId` via `get_addresses` before calling `search_products`, and must
never print or commit real address/contact data returned by that tool.
