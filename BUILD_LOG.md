# Build Log

One entry per commit: date, time spent, rough tokens used, what shipped. Filled before each commit/push.

**Running total across the whole project (through the latest entry below): ~25 hours, ~430-450K tokens.**

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

## 2026-09-22 -- Frontend redesign v2: multi-screen flow + light illustrated-cookbook style (same branch)

- **Time spent:** ~2.5 hours (rebuilt HTML/CSS/JS into 3 screens, a small additive backend data change, a new self-hosted font, and live end-to-end verification)
- **Rough tokens used:** ~35-40K
- **What shipped:** the user reviewed the first redesign against a real illustrated-cookbook reference image and asked for a different direction -- light mode only (no dark-mode branch), and three distinct full-screen views instead of one scrolling page: (1) an input screen using the full viewport width with a much more prominent "connect Swiggy" step (a real call-to-action banner, not a small pill, since it's a required prerequisite), (2) a dedicated full-screen progress checklist, (3) a result screen with two switchable tabs -- Ingredients (full ingredient list, a torn-notebook-paper-styled "added to Instamart cart" note with price and a clear badge per item, and a total-cost summary) and Directions (numbered steps) -- with the recipe title in a large handwritten script font and the download link available regardless of which tab is active.
  - Asked 3 clarifying questions before rebuilding (no image-generation tool available, so no illustrated food art was possible): confirmed typography+color+paper-texture only (no attempted illustrations), one consistent pastel palette across all three screens rather than a different tone per screen, and a playful script font (Caveat, self-hosted) specifically for the recipe title while keeping Karla for everything else.
  - Small additive backend change: `agent/workflow.js`'s `buildSummary()` now also returns `title`, `ingredients` (the full scaled list, each annotated with a substituted/bought/unresolved note), and `instructions` -- data the workflow already computed for the saved document but never exposed to the website. No change to any decision logic, MCP call, or workflow step.
  - Verified live end-to-end through the real API (a no-missing-ingredients case, since the Swiggy session had reset on server restart): confirmed the new summary shape renders correctly -- real scaled quantities, real instructions, correct empty states for substitutions/cart/unresolved.
- **What didn't work on the first try:** nothing broke this round -- the ID/functionality audit habit from the previous redesign (cross-checking every `getElementById` call against the actual markup before running anything) caught the tab/view wiring issues during writing rather than after.

## 2026-09-22 -- Fix screen-switching scroll bug, back button, pill-style tabs (same branch)

- **Time spent:** ~30 min
- **Rough tokens used:** ~8-10K
- **What shipped:** user-reported bug: the result screen appeared to render "lower on the same screen" as the progress checklist instead of as a clean separate screen. Real cause: `showView()` correctly toggled the `hidden` attribute, but never reset scroll position -- so the page stayed scrolled to wherever the previous (now-hidden) view had been, making the new view start below the fold. Fixed with `window.scrollTo(0, 0)` inside `showView()`. Also added a back button on the result screen (real Phosphor arrow-left icon) to return to the input screen, since there was previously no way back without a full page reload, and restyled the Ingredients/Directions tabs from an underline nav to two rounded-rectangle toggle buttons per feedback that switchability wasn't visually obvious enough.
- **What didn't work on the first try:** nothing broke -- this was a targeted bug-fix round; the fix was verified by re-reading the exact `showView()` call sites rather than guessing.
- *(Note: this entry was added retroactively -- it was missed at commit time and is being recorded now for an accurate log.)*

## 2026-09-22 -- Real recipe photos, gingham "scrapbook" texture (same branch)

- **Time spent:** ~2 hours (real-site testing to find a working image-extraction approach, a second real token-limit bug and its proper fix, and the gingham texture/photo layout)
- **Rough tokens used:** ~30-35K
- **What shipped:**
  - Real recipe photo extraction: `agent/workflow.js` gains `fetchOgImage()`, one extra bounded raw-HTML `fetch_url` call (only when a URL is used, never for pasted text) that regex-extracts `og:image`/`twitter:image`. Wrapped so a missing/failed extraction never affects the rest of the run -- `imageUrl` is just `null`. Exposed via `buildSummary()`. Verified live against real sites: found a genuine dish photo on allrecipes.com, correctly found nothing within the bound on sallysbakingaddiction.com (matches that site's previously-documented extreme ad-script bloat) and on loveandlemons.com (likely client-side-rendered meta tags) -- both are honest, expected outcomes, not failures.
  - Frontend: the Directions tab now shows a compact, scrapbook-style photo (mounted on a small gingham-backed mat) beside the steps when an image was found; falls back cleanly to steps-only otherwise, including at runtime if the image fails to load (hotlink protection -- `onerror` removes the mat, never a broken-image icon).
  - Gingham texture: copied the user's own real photo (`Red picnic.jpg`) into `public/images/gingham.jpg` and applied it as a bold, tiled background behind the input screen and behind the Instamart cart note's column, per explicit direction and a provided reference image -- always behind solid opaque cards/notes, never behind text directly.
- **What didn't work on the first try, and what was changed:**
  1. First image-extraction test picked a since-dead SimplyRecipes URL that actually 404s -- the "recipe" was a 404 page's own boilerplate. This correctly triggered the existing `RecipeParseError` safety net (working as designed) but was initially mistaken for a bug; re-verified against real, live URLs instead.
  2. That same dense 404-page content also produced a real `413` (Groq's 8000 token/minute cap) even after trimming the prompt to 10,000 characters -- a page-specific density issue, again really just a symptom of testing against a dead URL.
  3. Genuine, separate bug found while fixing that: shrinking the flat `slice(0, N)` prefix to fit under Groq's token limit risked cutting off the real ingredient section entirely on some pages, since the relevant chunk (found earlier by `fetchRecipeMarkdown`) can have its ingredient list appear many thousands of characters into that chunk, not at the very start. Fixed properly with `windowAroundIngredients()`, which locates the ingredient list first and slices a window around it instead of blindly taking the prefix. Re-verified against the original known-good recipe (still parses all 10 ingredients correctly) and against a second real, live recipe with a genuine photo (all fields -- title, ingredients, instructions, and a real `imageUrl` -- came back correctly).

## 2026-09-22 -- Fix silent stuck-on-progress-screen bug (same branch)

- **Time spent:** ~20 min
- **Rough tokens used:** ~6-8K
- **What shipped:** user reported the "Checking ingredients and budget" step appearing stuck/spinning forever with no error shown. Traced the actual server log for that run: the job had genuinely failed fast, server-side, with a clear "Not logged into Swiggy yet" message -- `server.js`'s SSE `done`-event dispatch was correct. Real bug was in `public/app.js`: the `EventSource`'s native `onerror` handler (distinct from the `done` event's own `error` field) only closed the connection and re-enabled the submit button -- it never called `showError()`. Any SSE connection drop (server restart, network hiccup, a stale/unknown `jobId`) left the user stranded on the progress screen with no indication anything went wrong. Fixed by having `onerror` call `showError('Lost connection while adapting your recipe. Please try again.')`.
- **What didn't work on the first try:** nothing broke this round -- found by tracing the exact dispatch chain (server log -> `server.js` SSE loop -> `app.js` event handlers) rather than guessing at the cause.

## 2026-09-22 -- Fix progress screen not disappearing, confine gingham to the input card, deep-orange accent (same branch)

- **Time spent:** ~35 min
- **Rough tokens used:** ~8-10K
- **What shipped:**
  - **Real bug found and fixed:** the progress screen was staying visible underneath the result screen after the run finished, forcing users to scroll down to see their recipe. Root cause was a genuine CSS specificity bug, not a JS bug: `.view-progress` and `.view-error` both declared `display: flex` unconditionally in `style.css`, and an author stylesheet rule always overrides the browser's built-in `[hidden] { display: none }` default -- so toggling the `hidden` attribute in `showView()` never actually hid those two screens once they'd been shown. Fixed by scoping both rules to `:not([hidden])`.
  - Per feedback that the full-page gingham background on the input screen made the text hard to read: removed it from `.view-input` entirely and replaced it with a confined "scrapbook" effect -- a rotated, gingham-backed card peeking out from behind the opaque recipe-input card only (`.recipe-card::before`), matching the layered-card reference images the user provided. The Instamart cart-note gingham backdrop on the result screen was untouched (already confined, not part of the complaint).
  - Changed the accent color from a rose/red (`#c96b6b`) to a deep orange (`#cc6a24`) per request, updating the derived `--accent-strong`/`--accent-tint` tokens so every button, badge, and highlight across all 3 screens stays consistent (per the earlier "one accent color, used everywhere" rule).
- **What didn't work on the first try:** nothing broke this round -- the progress-screen bug was found by reading the actual CSS cascade (comparing UA-stylesheet vs. author-stylesheet precedence) rather than re-guessing at the JS view-switching logic, which had already been correctly fixed in an earlier round.

## 2026-09-22 -- Frontend v4: centered layout, navy-blue accent, CSS gingham band (same branch)

- **Time spent:** ~1 hour (plan-mode design pass with 4 clarifying questions, license research on 2 named fonts, CSS/HTML restructuring)
- **Rough tokens used:** ~20-25K
- **What shipped:** user built an actual Canva reference design and asked for the live site to match it closely.
  - Replaced the rose/orange accent with navy blue (`#1f3a68`/`#142544`/`#dbe4f2`) -- a pure 3-variable swap in `style.css`, since every accent usage already routed through those custom properties.
  - Built a real, image-free "yellow gingham" band using two overlapping `repeating-linear-gradient` stripe sets over a cream base (`--gingham-band`), confined to a header band behind the hero title/CTA on the input screen and behind the title/tabs on the result screen -- deliberately different execution from the reverted v3 red-photo gingham (that one covered/backed cards and the user disliked it; this one is a header accent only, matching the new references).
  - Restructured the input screen from a 2-column sticky sidebar+form into a single centered hero (kicker, title, subtitle, a promoted big pill "Connect to Swiggy" CTA) with the form as its own centered block below, and restructured the result screen's header into a stacked, centered back/download row -> title -> tabs, replacing the old left-aligned flex row.
  - Removed the gingham background from behind the Instamart cart note per explicit feedback -- it's now a plain torn-paper note on the page background.
  - Researched licensing for the two fonts the user named from their Canva file: Anaktoria is public domain/free for any use (safe to self-host); SwungNote is free for personal use only, commercial use requires contacting the author -- flagged this to the user as a real open decision (self-host anyway as a non-commercial student project, or swap to a similarly-styled Google Fonts alternative) rather than deciding it myself, since the site is deployed publicly on Railway.
- **What didn't work on the first try / open items:** the actual font files, the Swiggy logo image, and the 4 hand-drawn illustration images are all pending from the user (illustrations need a one-off Node+`sharp` script to strip their white backgrounds, since this environment has no real Python/ImageMagick -- confirmed `python3` is just the Microsoft Store stub and the `convert` on PATH is Windows' unrelated NTFS-conversion tool, not ImageMagick). Shipped everything else now with safe fallback fonts (`Caveat`/`Georgia`) so the layout/color/gingham work is fully visible and testable without blocking on those assets.

## 2026-09-23 -- Wire in the 4 hero illustrations (same branch)

- **Time spent:** ~15 min
- **Rough tokens used:** ~4-5K
- **What shipped:** user supplied the 4 hand-drawn doodle PNGs (cookie, pancake stack, cake slice, macaron) referenced in the v4 plan. Verified each file's PNG header directly (`colorType` byte in the IHDR chunk) before use -- all 4 already have a real alpha channel (RGBA), so the planned white-background-stripping script wasn't needed, matching what the user said. Copied into `public/images/illustrations/` and wired into the input screen's hero via the `.hero-illustration` classes already added in the v4 CSS pass.
- **What didn't work on the first try:** the images arrived as inline message content with no file path the first time, so I couldn't act on them directly (no tool saves pasted image content to disk) -- asked the user to save them and point me to the folder, which they did (their 4 most recent Downloads).

## 2026-09-23 -- Full-bleed gingham header, 2-column form (same branch)

- **Time spent:** ~25 min
- **Rough tokens used:** ~7-8K
- **What shipped:** per feedback against a new reference screenshot: the gingham band was an inset rounded box with cream margins showing on the sides -- moved it outside the page's padded wrapper (`.view-input { padding: 0 }`, hero is now a direct full-width child of the view) so it spans edge-to-edge like a real page header, matching the reference. Restructured the input form from a single stacked column into two columns matching the reference's composition exactly: "The recipe" (URL/paste-text) on the left, everything else (What's missing, Servings & budget, Anything else, submit button) stacked in a column on the right.
- **What didn't work on the first try:** nothing broke -- straightforward CSS restructuring, verified the brace count and a live `curl` after.

## 2026-09-23 -- Real fonts (Slackey + Anaktoria), lighter gingham, bigger illustrations (same branch)

- **Time spent:** ~30 min
- **Rough tokens used:** ~9-10K
- **What shipped:**
  - Vendored the two real fonts the user actually wanted: **Slackey** (Google Fonts, OFL, fetched directly from `fonts.gstatic.com`) for titles, and **Anaktoria** (the exact font Canva uses -- public domain per its designer George Douros, downloaded from Font Library's official package) for the accent/subtitle text. Anaktoria only ships as `.ttf`; converted to `.woff2` with `ttf2woff2` via `npx` to match the project's self-hosting convention (no CDN links, same as Karla/Caveat).
  - Lightened the CSS gingham band: dropped the stripe alpha from 0.55 to 0.25 so the darkest (double-overlap) squares land close to the requested `#f9ecab`, worked out by solving the alpha-blend equation for the overlap color rather than guessing.
  - Enlarged the 4 hero illustrations (`clamp(70px,9vw,110px)` -> `clamp(110px,13vw,170px)`) and nudged their positions outward to fill the wider header.
  - Removed the "Home cooking, on budget" kicker line per feedback, and reduced the hero's vertical padding now that there's one less line of content.
- **What didn't work on the first try:** nothing broke -- confirmed each new font file serves with a real 200 and CSS brace count stays balanced before committing.

## 2026-09-23 -- Full-bleed result/progress headers, bigger hero, Anaktoria everywhere, pot-fill animation (same branch)

- **Time spent:** ~1 hour
- **Rough tokens used:** ~15-18K
- **What shipped:**
  - Added the real Swiggy logo (`swiggy-transparent-icon-free-png.webp`, user-provided, real transparent app icon) into the Instamart cart note heading.
  - Extended the same full-bleed gingham-header treatment from the input screen to both the result screen (title/tabs/back/download row) and a new progress-screen header -- all three screens now share the same edge-to-edge header language instead of just screen 1.
  - Restored the input hero to a bigger, more generous size per feedback (padding and title size both increased) after shrinking it in the previous round.
  - Made Anaktoria the site's main body font (`--font-body`), not just an accent -- it now cascades into every ingredient/direction list, label, input, and button, with Karla kept as a fallback in the font stack so any glyph Anaktoria's ancient-scripts-oriented character set doesn't cover (e.g. the ₹ sign) still renders from Karla automatically.
  - Built a pot-fill progress animation entirely in code (inline SVG matching the illustrations' navy line-art style, no new assets needed): a liquid rect clipped to the pot's interior shape animates its height as stages complete, reaching full at the last stage; small animated steam wisps for a bit of life. Wired into the existing `renderStages()` call in `app.js` via `updatePotFill()`, driven by the same stage data already being tracked -- no change to the real workflow logic.
- **What didn't work on the first try:** nothing broke -- verified CSS brace balance and a handful of live asset requests (site, swiggy logo, fonts) after each pass before committing.

## 2026-09-23 -- Revert Anaktoria-everywhere, bigger logo, remove notice box, note contrast fix (same branch)

- **Time spent:** ~20 min
- **Rough tokens used:** ~6-7K
- **What shipped:** user tried Anaktoria as the site-wide body font and didn't like it for dense/functional text -- reverted `--font-body` back to Karla (the readable default) and kept Anaktoria only as `--font-accent`, applied narrowly to genuinely decorative small text (the home subtitle, the "Working on it" kicker on the progress screen) per their explicit split. All form inputs, the ingredient/directions lists, and the "Connect to Swiggy"/"Adapt My Recipe" buttons are back on Karla for readability.
  - Enlarged the Swiggy logo in the cart note (28px -> 44px) -- it was too small to read clearly.
  - Removed the blue "notice" callout box from the progress screen entirely (unnecessary per feedback) -- deleted its markup, CSS, and the two `app.js` lines that populated it.
  - Fixed the Instamart cart note blending into the page background -- `--paper-note` was too close to `--paper` (both pale cream); changed it to a more distinct manila-paper tone (`#f7ecc4`, darker line color to match) so the note visibly stands out as its own object on the page.
- **What didn't work on the first try:** nothing broke -- straightforward reverts/tweaks, verified CSS integrity and a live request before committing.

## 2026-09-23 -- Whiter Instamart cart note (same branch)

- **Time spent:** ~10 min
- **Rough tokens used:** ~3-4K
- **What shipped:** the cart note's manila-yellow paper tone from the last contrast fix still read as too yellow -- changed `--paper-note` to a much whiter off-white (`#fefdf8`) with a lighter line color, so the note now clearly reads as a distinct white paper object against the warmer cream page background.
- **What didn't work on the first try / open item:** attempted to source the real SwungNote font file (now that the user confirmed this is a private, non-commercial project, satisfying its "personal use" license) from several free-font mirror sites -- blogfonts.com and dafontfree.net are Cloudflare-gated against scripted fetches, and onlinewebfonts.com hides its real download link behind obfuscated JS rather than a direct URL (also a signal its redistribution rights are murkier than a real foundry/library source). Asked the user to download the file themselves and hand it over, the same pattern already working for the illustrations and Swiggy logo, rather than fight an untrustworthy source.

## 2026-09-23 -- Switch title font to Swung Note (same branch)

- **Time spent:** ~10 min
- **Rough tokens used:** ~3-4K
- **What shipped:** user downloaded and provided the actual Swung Note `.ttf` file themselves (after I couldn't source it cleanly from any scriptable mirror) and confirmed this is a private, non-commercial project -- which satisfies the font's real "free for personal use" license from its original designer. Converted to `.woff2` with `ttf2woff2` (same as Anaktoria) and set it as the primary `--font-title`, ahead of Slackey in the fallback chain (kept as a safety net, not removed).
- **What didn't work on the first try:** nothing broke -- confirmed the new font file serves with a real 200 before committing.

## 2026-09-23 -- Uniform accent blue, bigger cart note, "Your adapted recipe" subtitle (same branch)

- **Time spent:** ~20 min
- **Rough tokens used:** ~5-6K
- **What shipped:**
  - Set `--accent` and `--accent-strong` to the same exact `#1b4b84` (previously two slightly different navy shades) so every blue accent and blue text on the site is now literally the same color, per request. The one place that relied on `--accent-strong` purely as a hover-darken shade (`.btn-primary:hover`) now derives its darker tone from `color-mix()` on the fly instead of a separate stored color, so hover feedback is preserved without reintroducing a second blue.
  - Enlarged the Instamart cart note overall: more internal padding, bigger heading/list/logo/total-cost text, and gave its column a touch more width in the ingredients grid.
  - Added "Your adapted recipe" under the recipe title on the result screen (in the same italic accent style as the home subtitle) since that area read as too empty.
  - Noted for later: the 4 hand-drawn hero illustrations have their own blue baked into the PNG pixels (from the user's own drawing) and can't be recolored via CSS the way the SVG pot can -- left as-is; the user is planning to draw more illustrations later.
- **What didn't work on the first try:** nothing broke -- verified CSS integrity and a live request before committing.

## 2026-09-23 -- Torn-paper cart note + gingham backdrop (scrapbook look, same branch)

- **Time spent:** ~20 min
- **Rough tokens used:** ~5-6K
- **What shipped:** per feedback that the plain rectangular note was "throwing off" the ingredients page -- replaced the old perforated-left-edge-only treatment with an all-around jagged `clip-path` silhouette (torn on all 4 sides, not just a punched-hole left margin) plus a slight rotation, so it reads as a real torn scrap of paper rather than a rounded card. Reintroduced the yellow CSS gingham band as a backdrop behind the note's column (`.ingredients-columns__right`) -- this is the same gingham-behind-the-note idea from an earlier round that was reverted for looking wrong on the *full input screen background*; here it's confined to just the note's column on the result screen, which is a different, more deliberate scrapbook composition the user asked for directly this time.
- **What didn't work on the first try:** nothing broke -- verified CSS integrity and a live request before committing; the exact torn-edge polygon may want a second pass once seen live (jag depth/frequency is easy to retune in one place).

## 2026-09-23 -- Swap gingham backdrop for a real torn-paper PNG, revert note edge (same branch)

- **Time spent:** ~15 min
- **Rough tokens used:** ~4-5K
- **What shipped:** per feedback, reverted the previous round's two changes: (1) the note itself goes back to the original perforated-left-edge ("punch hole") treatment instead of the new all-around jagged clip-path, and (2) the yellow gingham backdrop behind the note's column is replaced with a real kraft-paper-texture PNG the user supplied (`pngtree-brown-torn-paper-note-png-image_10116129.png`, from Downloads), sized to peek out around the note for the scrapbook effect instead of a repeating pattern.
- **What didn't work on the first try:** nothing broke -- confirmed the new image serves with a real 200 before committing. Noted for later: the punch-hole cutouts still render as flat `--paper`-colored circles (matching the plain page background from the original design) rather than showing the new textured backdrop through them -- a minor visual mismatch now that there's a textured image behind instead of flat color, not fixed since the user asked to restore the original hole treatment exactly.

## 2026-09-23 -- Site-wide motion system via the Taste skill (same branch)

- **Time spent:** ~1 hour
- **Rough tokens used:** ~25-30K
- **What shipped:** a single cohesive motion layer across all three screens, built to the Taste skill's motion rules at `MOTION_INTENSITY: 5` (fluid-CSS tier -- no GSAP, no scroll-hijack, no animation library, which suits a vanilla-JS app with no build step). Every animation had to answer "what does this communicate?" per the skill's "motion must be motivated" rule; anything that only looked cool was dropped.
  - **Shared tokens:** one easing (`--ease-out: cubic-bezier(0.16,1,0.3,1)`) and three durations used by everything, so unrelated transitions feel like the same object.
  - **Entrance:** each screen's contents rise in sequence via a CSS `--enter-i` cascade (title -> subtitle -> CTA), communicating hierarchy. The 4 hand-drawn illustrations settle in like stickers being placed, reinforcing the scrapbook concept.
  - **Hover/interaction:** buttons lift and cast a shadow, press pushes them back down; each icon nudges in the direction its action goes (forward arrow right, back arrow left, download arrow down) so the motion previews the result. Illustrations nudge on hover like physical stickers.
  - **Scroll:** IntersectionObserver-driven reveals (the skill hard-bans `window.addEventListener('scroll')`), one-shot -- elements unobserve once shown, so scrolling back up never replays anything.
  - **State transitions:** switching screens now crossfades (short fade-up out, fade-in in) instead of hard-cutting; tab switches fade the new panel in.
  - **Progress:** the checklist builds top-to-bottom, and the pot fill moved from animating SVG `y`/`height` attributes to `transform: scaleY()` from the pot's base, per the skill's "animate only transform and opacity" rule.
  - **Reduced motion:** a blanket `prefers-reduced-motion: reduce` block collapses every animation and transition to ~0ms. The scroll-reveal rules live inside a `no-preference` block, so under reduce the content is simply visible from the start rather than hidden.
- **What didn't work on the first try, and what was fixed before shipping:**
  1. The illustrations' entrance animation used `fill-mode: both`, which freezes the final transform and would have silently killed the hover nudge (an animation's forwards-fill beats a plain CSS rule). Caught while writing it; switched to `backwards` so the element returns to its own CSS once the entrance finishes.
  2. The input screen is visible straight from the markup and never passes through `showView()` on first load, so its reveal target would have sat at `opacity: 0` permanently -- a blank form card. Added an explicit `revealIn(document)` on init.
  3. Rebuilding the whole stage list on every update would have replayed the "completed" pop on every finished row each time a new one landed (visible flicker). Rewrote `renderStages()` to build rows once and only flip state classes, so the pop fires only on the row that actually just finished -- verified with a stubbed-DOM test over a full 4-stage run (pending -> active -> done ordering correct, pot fraction 0 -> .125 -> .375 -> .625 -> .875 -> 1.0).
  4. Deliberately cut a bobbing-liquid animation: the progress screen already has steam and an active-stage pulse, and a third perpetual loop crossed from "alive" into "distracting" -- the skill's "not every card needs an infinite loop" rule.

## 2026-09-23 -- Illustrations on the result screen (same branch)

- **Time spent:** ~30 min
- **Rough tokens used:** ~12-15K
- **What shipped:** the user drew 10 more illustrations; used 6 of them (their call -- "you don't have to use all of them"), picked and placed for composition rather than dropped in wholesale.
  - **Result header band (4):** cutlery, herb sprig, lemon slice and tomato slices frame the recipe title the same way the sweets frame the home hero. Deliberately savoury against the home screen's dessert set, so the two screens read as related without repeating themselves, and sized smaller (~78-124px vs the hero's 120-190px) because the band is much shorter than the hero. Positioned low in the band (22-58% vertical) so they clear the back/download buttons sitting in the top corners, with `overflow: hidden` on the band so the rotated art can't spill out and cause horizontal scroll.
  - **Closing flourishes (2):** a bowl under the Instamart total, and a cheese plate after the last direction -- these signal "end of list" without another line of text. Placed in **normal document flow, not absolutely positioned**, specifically so they can never land on top of text however long a given recipe turns out to be.
  - All six verified RGBA before use (no background stripping needed), given `alt=""` since they're decorative, and `loading="lazy"` so the result-screen art doesn't compete with the first paint of the input screen.
- **What didn't work on the first try:** each band illustration needed its own resting tilt, which a shared entrance keyframe would have flattened (the animation's transform replaces the element's). Solved by storing each tilt in a `--rot` custom property that the keyframe reads, so the scale-in composes with the rotation instead of overwriting it -- same class of bug as the hero illustrations' fill-mode issue last round, caught before shipping this time.
- **Known trade-off, not fixed:** all 10 illustrations are 2048x2048 PNGs (~170-320KB each) being displayed at ~120px. `loading="lazy"` limits the damage, but they're far larger than they need to be. Left as-is rather than adding an image-processing dependency the user didn't ask for -- worth revisiting before any wider deployment.

## 2026-09-23 -- Per-tab illustrations, bigger art, progress-screen drawings (same branch)

- **Time spent:** ~40 min
- **Rough tokens used:** ~15-18K
- **What shipped:** all 10 of the user's new drawings are now in use (plus the original 4 on the home hero), each screen and tab getting its own set so nothing repeats where two drawings would be seen together.
  - **Bigger across the board:** home hero 190 -> 225px, result band 124 -> 175px, closing flourishes 160/175 -> 215/230px, new progress art at 200px. Worth noting these are square 2048px canvases with the drawing centred in transparent padding, so the visible art is meaningfully smaller than its box -- the boxes had to grow more than the numbers suggest to actually read as bigger.
  - **Per-tab sets that swap:** Ingredients gets raw produce (tomato, lemon) framing the title with a vanilla flower closing the column; Directions gets cooking kit (cutlery, bottle) with a cheese plate closing the steps. Both pairs live in the markup in the same two slots; the band carries a `data-art` attribute and CSS decides which pair shows, so `setActiveTab` flips one attribute and the crossfade is entirely declarative -- no show/hide juggling in JS.
  - **Swap animation:** the incoming pair scales up and fades in on a keyframe (staggered 90ms left-to-right); the outgoing pair stops matching the "showing" selector, falls back to the base rule and transitions out. Both directions animate from one attribute change.
  - **Progress screen:** herb, bowl, leaf and fish flank the pot, anchored to the full-height screen rather than the short header band so there's room for them at size, and pinned to the outer edges clear of the centred 480px pot-and-checklist column. They stagger in after the pot.
- **What didn't work on the first try, caught before shipping:**
  1. First pass tried to fit two drawings per side inside the result header band. At the requested larger size two 175px drawings need ~350px of stacked height in a band that's only ~300px tall -- they'd have collided. Cut to one per side and moved the extra variety into the per-tab flourishes instead, which is what made the tab-swap idea work cleanly anyway.
  2. Scoping the entrance animation to `.band-illustration` generally would have animated opacity 0 -> 0.85 on the *hidden* pair too, flashing both sets into view on arrival. Scoped the animation to the currently-showing set instead.
  3. Put `overflow: hidden` on the progress screen to stop sideways scroll, then removed it -- that screen is `min-height: 100dvh`, so clipping it would make content unreachable on a short window. The art is inset from both edges instead, which solves the same problem without the risk.
