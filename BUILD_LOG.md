# Build Log

One entry per commit: date, time spent, rough tokens used, what shipped. Filled before each commit/push.

---

## 2026-09-11 — Repo setup + capstone plan

- **Time spent:** ~1 hour (idea lock-in discussion, plan mode drafting, repo/branch/PR setup)
- **Rough tokens used:** ~20-25K
- **What shipped:**
  - Locked capstone idea: Recipe Adaptation Agent.
  - Worked through the full plan in Claude's plan mode: end-to-end workflow, agent vs. non-agent boundary, custom Skill scope, where the multi-step loop lives, MCP server choices (Fetch + Filesystem), save format, repo structure.
  - Set up git repo (`richasajai_capstone`) with work on a separate `capstone-planning` branch (not on `main`).
  - Wrote `plan.md` with MVP scope vs. final/stretch goals separated, and a stated AI-Involvement Level with rationale.
  - Wrote this `BUILD_LOG.md`.
  - Opened PR from `capstone-planning` into `main` for Assessment 1 review.

## 2026-09-16 — Pivot plan to Recipe Budget Agent

- **Time spent:** ~30 min (plan mode discussion + rewrite)
- **Rough tokens used:** ~10-15K
- **What shipped:**
  - Pivoted the capstone direction from Recipe Adaptation Agent to Recipe Budget Agent: adds budget-based buy-vs-substitute decisions and Swiggy Instamart cart building on top of the existing substitution/adaptation core.
  - Rewrote `plan.md` end-to-end for the new direction, keeping the same structure (Context, AI-Involvement Level, MVP vs. final scope, numbered sections 1-8).
  - Updated the two planned MCP servers to Recipe retrieval + Swiggy Instamart (availability not yet verified).
  - Fixed local repo housekeeping: fast-forwarded stale local `main`, updated `origin` to the renamed repo URL (`richa-sajai_capstone`).
  - Opened PR from `recipe-budget-agent-plan` into `main` for review (not merged).

## 2026-09-17 — Assessment 2 PR 1: Recipe Budget Skill + MCP foundation

- **Time spent:** ~2 hours (MCP research, Skill writing, real handshake-level MCP testing, docs)
- **Rough tokens used:** ~35-40K
- **What shipped:**
  - Wrote `.claude/skills/recipe-budget-agent/SKILL.md`, scoped to one repeatable task: evaluate one missing ingredient for a specific recipe under a budget, decide substitute vs. buy.
  - Created `.mcp.json` with two MCP servers: `fetch` (`fetch-mcp` via npx) and `swiggy-instamart` (`mcp-remote` bridging to `https://mcp.swiggy.com/im`).
  - Actually tested both MCPs with real inputs via raw MCP JSON-RPC handshakes (not mocked) — full results in `examples/sample-runs.md`.
  - Added `reference/substitutions.md` (ingredient-role substitution table) and updated `README.md` to reflect the current Recipe Budget Agent direction and PR 1/PR 2 status.
- **What didn't work on the first try:**
  1. The originally-planned official Fetch MCP (`mcp-server-fetch`) is Python/`uv`-only; neither is installed in this environment (only Node/npx). Switched to the real, currently-published Node package `fetch-mcp`, which was then actually tested successfully against a live recipe URL.
  2. Testing `fetch-mcp` against `sallysbakingaddiction.com` initially returned only ad-tech JavaScript/CSS (the tool's default read window starts at index 0, and this page has ~250,000 characters of tracking scripts before real content). Fixed by probing with a larger `start_index`, which confirmed the tool does return real converted markdown further into the page — documented as a pagination requirement for PR 2's retrieval step, not a tool failure.
  3. The Swiggy Instamart MCP connection genuinely failed: `mcp-remote` rejects Swiggy's OAuth metadata with `IssuerMismatchError` (RFC 8414 §3.3 issuer mismatch between `https://mcp.swiggy.com/` and `https://mcp.swiggy.com/auth`), before ever reaching the browser login step. Confirmed this isn't a "no browser in this environment" limitation — the failure happens at metadata discovery, is reproducible from the plain command line, and `mcp-remote --help` has no flag to bypass it. Documented in full in `examples/sample-runs.md` as the biggest open risk for PR 2, with next steps (retry a different `mcp-remote` version, or a lower-level OAuth client) rather than a fabricated success.

## 2026-09-17 — Fix Swiggy Instamart MCP OAuth metadata bug

- **Time spent:** ~1 hour (bug confirmation via GitHub issue search + `curl`, proxy build, iteration, verification)
- **Rough tokens used:** ~15-20K
- **What shipped:**
  - Confirmed the `IssuerMismatchError` from the previous entry is a real, currently-open bug on Swiggy's own side — [Swiggy/swiggy-mcp-server-manifest#88](https://github.com/Swiggy/swiggy-mcp-server-manifest/issues/88), independently reproduced by another developer 3 days prior. Verified the two exact defects directly with `curl`: a 404 on the protected-resource metadata URL, and a mismatched `issuer` field in the authorization-server metadata (RFC 8414 §3.3 violation).
  - Wrote `scripts/swiggy-mcp-proxy.js`: a local Node reverse proxy that serves corrected versions of both broken metadata documents, rewrites the `WWW-Authenticate` header on proxied 401s so the client isn't bounced back to the broken real URL, and transparently forwards all other traffic (including live MCP calls) to the real Swiggy server.
  - Updated `.mcp.json`'s `swiggy-instamart` entry to run this proxy instead of calling `mcp-remote` directly.
  - Updated `examples/sample-runs.md` with the fix and verified end-to-end proof.
- **What didn't work on the first try:** my first version of the proxy set the corrected `issuer` field to `${PROXY_BASE}/` (trailing slash) while the synthesized protected-resource document's `authorization_servers` entry had no trailing slash — `mcp-remote` compared the two and threw the same `IssuerMismatchError`, just against my own proxy instead of the real server. Fixed by making both use the exact same string (no trailing slash).

## 2026-09-17 — Completed Swiggy Instamart login and verified real tool calls

- **Time spent:** ~30 min (interactive login by the user, then live tool-call verification)
- **Rough tokens used:** ~8-10K
- **What shipped:**
  - User ran `node scripts/swiggy-mcp-proxy.js` in an interactive terminal, completed real OAuth login against their own Swiggy account. Connection succeeded (`Connected to remote server using StreamableHTTPClientTransport`); two non-fatal SEP-2352 warnings appeared but didn't block anything.
  - Using the resulting cached token, made real authenticated MCP calls directly against the proxy: `tools/list` (real 16-tool schema), `get_addresses` (real saved addresses — not committed anywhere, real PII), and `search_products` for "toor dal" (real 12 matching products with live pricing/stock/ratings).
  - Updated `examples/sample-runs.md` and `README.md` to reflect the Instamart MCP as fully working, not just connection-fixed.
- **What didn't work on the first try:** the first `search_products` call failed with a real API error, `addressId is required` — the tool needs a resolved address first (Instamart pricing/availability is address-local). Fixed by calling `get_addresses` first and passing its resolved address ID into `search_products`, which then succeeded. Documented this as a required call order for PR 2's agent logic.
