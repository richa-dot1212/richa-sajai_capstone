# Build Log

One entry per commit: date, time spent, rough tokens used, what shipped. Filled before each commit/push.

**Running total across the whole project (through the latest entry below): ~19 hours, ~330-345K tokens.**

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

## 2026-09-17 — Assessment 2 PR 2: the actual Recipe Budget Agent (Gemini + Skill + both MCPs + website)

- **Time spent:** ~4.5 hours (agent modules, real MCP/Gemini wiring, debugging three separate real bugs, website, browser-automation troubleshooting, docs)
- **Rough tokens used:** ~70-80K
- **What shipped:**
  - `agent/` module: `env.js` (loads `.env`, never logs it), `mcpClient.js` (generic stdio MCP client driven by `.mcp.json`, used for the Fetch MCP), `instamartClient.js` (talks to the already-running Swiggy proxy from PR 1 over HTTP, reusing the cached OAuth token), `gemini.js` (Gemini REST client with retry/backoff), `skill.js` (loads the real `SKILL.md`), `servingSize.js` (deterministic quantity scaling, unit-tested), `selfCheck.js` (deterministic consistency checks with real corrections), `documentBuilder.js` (assembles + saves the final recipe), and `workflow.js` (the actual perceive → reason → act → observe orchestrator).
  - `server.js` + `public/` (Express + vanilla HTML/JS): a simple form (recipe URL, missing ingredients, serving size, budget, requested changes), an "Adapt My Recipe" button, and a live SSE progress log streaming the agent's real phase-by-phase events.
  - `scripts/run-agent-cli.js`: a CLI entry point for running the same workflow without the website, used heavily during debugging.
  - Ran the real workflow multiple times against a real recipe URL, hitting three genuine bugs (below) and fixing each with real evidence, before hitting an external quota wall -- full transcript in `examples/pr2-end-to-end-run.md`.
- **What didn't work on the first try, and what was changed:**
  1. `runWorkflow` was accidentally declared `async`, which wrapped its return value `{emitter, promise}` in an extra Promise, so callers destructured `undefined`. Fixed by making it a plain synchronous function that kicks off an internal async IIFE.
  2. The Fetch MCP's leading-boilerplate pagination check (from PR 1's finding) falsely triggered on the very first, mostly-ad-script chunk: the word "ingredient" and a stray `g\b` match both occur inside CSS-selector strings and minified JS on this real page. Fixed by requiring several markdown list lines that actually look like `<amount> <unit> <ingredient>`, not just a loose keyword match -- confirmed by testing against the real page that it now correctly pages to the real content around index 240,000, matching PR 1's original finding.
  3. Killing the Fetch MCP child process and then calling `process.exit(1)` immediately in the CLI's error handler crashed Node with a libuv assertion (`UV_HANDLE_CLOSING`) on Windows. Fixed by using `process.exitCode = 1` instead of forcing an immediate exit, letting pending handles close cleanly.
  4. Real, external, and still-unresolved today: Google's Gemini free-tier quota is 20 requests/day for the current model. A full run costs ~9 calls for a 4-missing-ingredient recipe; combined with earlier testing this exhausted the quota mid-run on the "cornstarch" ingredient. Confirmed this is a genuine hard cap, not a transient spike or a too-short backoff, by waiting past Google's own suggested retry window and retrying directly -- still 429. Documented honestly in `examples/pr2-end-to-end-run.md` rather than faking a completed run; the code downstream of this point (budget-reconsideration loop, cart-adding, self-check, document generation) was built and tested in isolation, and PR 1 already separately proved the real Instamart cart-add path works.
  5. Also real: `gemini-2.5-flash` (a natural pin choice) returned 404 with "no longer available to new users, use gemini-3.6-flash" -- avoided entirely by defaulting to the `gemini-flash-latest` alias instead of a pinned version.
  6. Could not capture a real browser screenshot of the website from this sandboxed session: Playwright's headless Chromium fails to launch (`spawn UNKNOWN`), and pointing it at the full Chrome binary instead launches then crashes immediately with a DLL-load-style exit code -- an environment-level restriction on spawning new GUI-capable processes here, not a bug in the app (the server was independently confirmed serving the real page via `curl`). Substituted the real HTTP API transcript as evidence instead; a real screenshot from a normal machine is a reasonable follow-up.

## 2026-09-18 — Assessment 3 + Assessment 2 polish, combined into this PR (professor-approved)

- **Time spent:** ~2.5 hours (Gemini call reduction design, code, failure-case hardening, website UI rework, docs, quota troubleshooting)
- **Rough tokens used:** ~50-55K
- **What shipped:**
  - Cut Gemini calls from `1 + 2×(missing ingredients)` to a flat **2 calls total per run**: one to parse the recipe (kept -- genuinely ambiguous), and one *batched* call covering every missing ingredient's role/substitute/compatibility judgment (previously one call per ingredient). The second per-ingredient call (buy-vs-substitute) is now `agent/decision.js`, a pure deterministic function using the Skill's own rubric -- arithmetic and comparisons no longer touch the LLM at all.
  - Fixed a real bug from yesterday's transcript (`examples/pr2-end-to-end-run.md`): the fuzzy "owned ingredients" diff missed that "eggs" (stated as owned) should have matched "large egg + 1 egg yolk" in the recipe, wrongly flagging it as missing. Fixed by asking the user directly for missing ingredients instead of owned ones (`public/index.html`'s field is now "Ingredients you're missing") -- removes the fuzzy-diff failure mode by construction, and is simpler for the user as requested.
  - Website progress UI collapsed to the 4 requested stages (Understanding recipe → Checking ingredients and budget → Finding/substituting ingredients → Recipe ready) via a new `stage` event stream in `agent/workflow.js`/`server.js`; the granular perceive/reason/act/observe events still fire and are logged server-side, just not rendered as a growing list anymore. The final result now shows a structured summary (missing ingredients, substitutions, cart items, total cost) instead of a raw markdown dump, with a link to the full downloaded document.
  - Added graceful handling for one realistic failure case (assessment 3 requirement): garbage/empty AI output. A real bug from earlier testing (a non-recipe page silently produced a saved "Unknown Recipe" document with 0 ingredients) is now caught by validating Gemini's parsed recipe and throwing a specific `RecipeParseError` with a clear, friendly message instead. **Tested for real** against `https://www.bbc.com/news` -- fails cleanly with "Couldn't find a real recipe at that URL," not a crash or a garbage file.
  - Rewrote `README.md` for a stranger cloning the repo: prerequisites, setup, the one-time Swiggy login step, how to run both the website and the CLI, known limitations, and why the Skill/agent/MCP mechanism from Assessment 2 is kept as-is (the substitute-vs-buy judgment is genuinely ambiguous; everything mechanical was already moved to code in this same change).
  - Added this running time/token total to `BUILD_LOG.md`, summed across every prior entry.
- **What didn't work on the first try, and what was changed:**
  1. Verified the happy path got through recipe parsing, diffing, and into the new batched evaluation call for real (confirmed via a live run against `sallysbakingaddiction.com`) before hitting a real Gemini `503` (model overloaded) that exhausted all retries. Retried once more -- same `503` on the batched call again.
  2. Investigating that, discovered the *new* API key added today also hit the same 20-requests/day free-tier quota (confirmed both a plain call and a structured-output call both 429 on it). So both available keys are exhausted for today -- a full clean live run of the new code is pending a higher-tier key or tomorrow's quota reset, documented honestly rather than faked. The parts that did run today are real evidence the refactor works up through that point; `agent/decision.js` and `agent/servingSize.js` are separately unit-tested.
  3. Found (via code review, before it could cause a real crash) a leftover reference to the just-removed `ownedIngredients` input field in `agent/documentBuilder.js` (dead code that was never actually used in that function) -- removed it.
  4. Found (also via review) that matching Gemini's echoed ingredient names back from the new batched call used exact string equality, which is fragile if the model rephrases a name slightly. Widened it to the same substring-based matching already used elsewhere in the codebase.

## 2026-09-18 — Paste-recipe-text input + a real event-ordering bug fix

- **Time spent:** ~40 min
- **Rough tokens used:** ~10-12K
- **What shipped:**
  - Added a second website input: paste recipe text directly instead of a URL. `server.js` accepts either `recipeUrl` or `recipeText`; `agent/workflow.js` skips the Fetch MCP entirely when text is pasted, going straight to the same Gemini parsing step.
- **What didn't work on the first try:** testing the new path surfaced a real bug that actually predates today -- `runWorkflow`'s first `emit()`/`emitStage()` calls fire synchronously before the function returns `{emitter, promise}`, so a caller's `.on()` listener (attached right after calling it) misses them. Every previous transcript's first logged line being "Fetched 30001 chars..." instead of "Retrieving recipe..." was this same bug, just cosmetic before. It stopped being cosmetic once the website's stage checklist started depending entirely on 'stage' events -- a dropped first stage would look broken. Fixed with one `await Promise.resolve()` at the top of the workflow's async IIFE, forcing a yield before any listener-dependent work; verified directly that the 'understand' stage and both initial progress events are now captured.

## 2026-09-18 — Switched to Groq; fixed the "assumes you already have the substitute" bug

- **Time spent:** ~1.5 hours (provider switch, two real Groq-specific bugs, a user-reported behavior fix, a search-query bug found while verifying it)
- **Rough tokens used:** ~25-30K
- **What shipped:**
  - Replaced `agent/gemini.js` with `agent/llm.js` calling Groq's OpenAI-compatible API (`openai/gpt-oss-120b` by default) -- Gemini's free-tier daily quota had become a hard blocker for even routine testing. Verified live: real structured JSON-schema output via Groq's `response_format: json_schema` (strict mode), and dramatically faster responses.
  - Fixed a real, user-reported behavior gap: deciding to "substitute" an ingredient never actually sourced the substitute -- it was only priced for comparison, then silently assumed already owned and skipped the cart entirely. `agent/decision.js` no longer treats "likely already owned" as free; `agent/workflow.js` now always searches Instamart for the substitute and adds whichever product (original or substitute) the decision actually settled on to the real cart. Updated `SKILL.md` to match. Verified live: a missing "butter" now genuinely substitutes with a cheaper product and adds it to the cart.
  - Running total across the whole project updated below.
- **What didn't work on the first try, and what was changed:**
  1. First real live run on Groq failed with a `413`: the on-demand tier caps at 8000 tokens/minute, and the prompt (45,000 characters of recipe content, sized for Gemini's much higher limit) blew past it. Trimmed prompt sizes, and fixed `fetchRecipeMarkdown` to return just the chunk the ingredient lines were actually found in, not that chunk padded with the entire previous chunk.
  2. That first trim (a blind `slice(0, 12000)` of the old, padded chunk) then failed to find a real recipe at all -- the trimmed window landed in boilerplate before the actual ingredient list. Fixed properly by returning the matched chunk itself.
  3. While verifying the substitute-purchasing fix, found the actual cart-search was returning the *same* (wrong) product for both the original ingredient and its substitute -- e.g. searching "unsalted margarine (e.g., Earth Balance), melted and cooled" on Instamart. Ingredient names and substitute candidates carry recipe-specific phrasing that makes a poor search query. Added `cleanForSearch()` to strip parenthetical asides and trailing prep clauses before querying; confirmed live that the substitute search then found a genuinely different, cheaper product.

## 2026-09-22 -- Deployment fixes + frontend redesign (on a separate branch)

- **Time spent:** ~4 hours (Railway deployment, a real per-visitor session bug found post-deploy, investigating a genuine Swiggy client-whitelist restriction, and a full visual redesign)
- **Rough tokens used:** ~65-75K
- **What shipped:**
  - Deployed to Railway (`main`): added `engines.node` to `package.json`, walked through account/env-var/domain setup. Confirmed the app runs on a real public URL.
  - Real bug found immediately after deploy: the professor opened the live link and saw Instamart as "already connected" -- `agent/swiggyOAuth.js` stored the OAuth token in one global variable, so every visitor shared whoever logged in first. Fixed with `agent/session.js` (a minimal cookie-based per-visitor id) and keyed token storage by session id throughout `swiggyOAuth.js`, `instamartClient.js`, and `workflow.js`. Verified locally with two separate cookie jars getting independent, isolated login states.
  - Investigated a second real issue surfaced by testing in incognito: Swiggy only allows OAuth sign-in from a small set of pre-approved redirect URLs (confirmed via their public `swiggy-mcp-server-manifest` GitHub repo -- Claude, ChatGPT, VS Code, Postman, and plain `localhost` are whitelisted; our Railway URL is not). Regular-tab logins had been succeeding only because the browser already had an active Swiggy session, which bypasses the strict new-client check. This is a genuine external policy restriction, not a bug in our code -- documented here rather than silently worked around.
  - Redesigned the frontend on a **new branch** (`frontend-redesign-recipe-book`, `main` untouched) using the installed design-taste-frontend skill: audited the existing plain form UI first (dial reading: variance ~1-2, motion ~1, density ~4), then rebuilt the visual layer only -- every element id/class the JS depends on preserved exactly, zero changes to `agent/`, API routes, or the workflow. New design: self-hosted Cormorant Garamond + Karla (no runtime Google Fonts dependency), a paper/ink/single-forest-green-accent palette (deliberately not the cliche cream+brass+espresso "artisan" palette), real inlined Phosphor icons replacing emoji glyphs, a proper card/step-list/result presentation, full dark-mode token set, and mobile-responsive breakpoints.
- **What didn't work on the first try:** while writing the redesign's result markup, initially left the download link's `<a>` element with no static text and no JS fallback to fill it in (the JS only ever set `.href`, never `.textContent` or innerHTML) -- caught during a pre-commit ID/functionality audit before it shipped, not from a live failure. Fixed by restoring visible link text directly in the markup alongside an icon.
