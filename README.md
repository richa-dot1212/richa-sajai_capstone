# Recipe Budget Agent

Give it a recipe URL, the ingredients you're missing, a target serving size, and a budget. It:

1. Retrieves the real recipe page and parses it.
2. Figures out what each missing ingredient does in that specific recipe.
3. Decides, per ingredient, whether to substitute it or buy the original — checking real live prices on Swiggy Instamart and weighing that against your remaining budget.
4. Adds anything it decides to buy to your real Instamart cart (never checks out or pays).
5. Rescales every quantity to your requested serving size.
6. Saves a personalized recipe document locally, showing what's substituted, what's bought, and the full adjusted instructions.

This is the actual capstone project, not a toy exercise — the pieces below (a custom Skill, an LLM-powered agent, two real MCP servers, and a small website) are the real system.

## Why an agent, not a script

The substitute-vs-buy judgment for each ingredient is genuinely ambiguous and budget-dependent — it needs live pricing, a compatibility judgment specific to *this* recipe, and it can require reconsidering an earlier decision if a later purchase would blow the budget. That's real branching, not a fixed pipeline. Everything mechanical (serving-size arithmetic, price comparisons, budget bookkeeping, the final substitute/buy decision itself) is deliberately kept as plain code — see `agent/decision.js` and `agent/servingSize.js` — and the LLM is only ever used for genuinely ambiguous judgment calls:

1. **Parse the recipe** (`agent/workflow.js`, first `callLLM`) — title, ingredients, instructions from an arbitrary page's content. One call per run.
2. **One reasoning call per missing ingredient** (`agent/workflow.js`, inside the per-ingredient loop) — a real perceive→reason→act→observe loop, not one upfront prompt that decides everything before any live Instamart data exists. For *this specific ingredient in this specific recipe*, the LLM judges its functional role, whether it's essential/defining (e.g. the named protein in a chicken recipe should never get an unrelated invented substitute, unless the user actually asked for a dietary transformation like "make it vegetarian"), and — only when substitution is actually appropriate — proposes one concrete substitute candidate and judges its compatibility.

Call count is **1 + N** (N = number of missing ingredients), not a fixed number — a deliberate trade-off. Earlier in development (while still on Gemini's 20-requests/day free-tier quota) this was collapsed into a flat 2 calls per run regardless of ingredient count, batching every ingredient's role judgment into one upfront call. After switching to Groq (no comparable quota constraint), that optimization was reverted in favor of a genuinely per-ingredient reasoning loop, since correct agentic reasoning — not call-count minimization — is the actual design priority now.

The buy-vs-substitute-vs-cannot-complete decision itself is **never** an LLM call — `agent/decision.js`'s `decideSubstituteOrBuy()` takes the LLM's compatibility judgment plus the real Instamart prices and remaining budget and applies a plain deterministic rule. If the per-ingredient reasoning call ever fails (e.g. a transient API error), the workflow falls back to the safest default — essential, no substitute proposed — rather than crashing the run.

## Quick start (for someone cloning this repo)

**Prerequisites:** Node.js 18+ (tested on v24), a Groq API key ([console.groq.com](https://console.groq.com)), and a Swiggy account (for the Instamart integration).

```bash
git clone <this-repo>
cd <repo>
npm install
```

Create a `.env` file in the project root:

```
GROQ_API_KEY=your-key-here
```

**Run the app:**

```bash
npm start
```

Open `http://localhost:3000`. The home screen's **Connect to Swiggy** button is the one-time login step — it takes you through a real OAuth login against your own Swiggy account (`agent/swiggyOAuth.js`, a custom OAuth 2.1+PKCE client the app talks to directly; not the `mcp-remote`/proxy setup used earlier in development, which only works when the browser and the server are the same machine — see `agent/instamartClient.js`'s header comment for why that path was replaced). The login is per-browser-session via a cookie (`agent/session.js`), so on a shared/public deployment each visitor connects their own account rather than sharing whoever logged in first.

Then fill in a recipe URL, what you're missing, your serving size and budget, and click **Adapt My Recipe**. Progress shows as 4 stages (Understanding recipe → Checking ingredients and budget → Finding/substituting ingredients → Recipe ready), then a summary with a link to the full downloaded document.

You can also run it from the command line without the website:

```bash
node scripts/run-agent-cli.js "<recipe-url>" "<missing ingredients, comma-separated>" <servings> "<requested changes>" <budget>
```

## Known limitations

- **The Swiggy Instamart MCP has a real, currently-open upstream bug** (broken OAuth metadata) — this only affects `.mcp.json`'s MCP server (used for local development via Claude Code itself), which is why `scripts/swiggy-mcp-proxy.js` still exists as a metadata-fixing workaround for that path. The live app doesn't use `mcp-remote` or that proxy at all; it talks to Swiggy directly with its own OAuth client (see the Quick start section above and `agent/instamartClient.js`'s header comment).
- Swiggy only whitelists a fixed list of OAuth redirect URIs for a *fresh* login (localhost and a few known dev tools) — an existing logged-in browser session bypasses this, but a brand-new incognito session on a public deployment (e.g. Railway) may hit this restriction. This is a real restriction on Swiggy's side, not a bug in this app.
- Earlier development used Gemini, whose free-tier quota (20 requests/day) proved too tight for even routine testing — see `BUILD_LOG.md` for that history. The project now uses Groq (`agent/llm.js`), which is both faster and not similarly constrained.
- Recipe parsing assumes the URL points at an actual recipe page; a non-recipe page is detected and reported cleanly rather than producing a garbage result (see `agent/workflow.js`'s `RecipeParseError`).

## Project structure

```
.claude/skills/recipe-budget-agent/SKILL.md   custom Skill: how to evaluate one missing ingredient
.mcp.json                                     Fetch MCP + Swiggy Instamart MCP config (local dev only, via Claude Code)
scripts/swiggy-mcp-proxy.js                   legacy: metadata-fixing proxy, only used by .mcp.json's dev-time MCP
agent/swiggyOAuth.js                          the real auth the live app uses -- direct OAuth 2.1+PKCE, not mcp-remote
agent/session.js                              per-visitor login cookie, so each visitor connects their own account
agent/                                        the actual agent: workflow, LLM client (Groq), MCP clients,
                                               deterministic decision/scaling/self-check logic
server.js + public/                           the website (interface only -- no decision logic here)
scripts/run-agent-cli.js                      run the same agent without the website
reference/substitutions.md                    ingredient-role substitution fallback table
examples/                                     real test transcripts (not mocked)
output/                                       generated personalized recipes (gitignored)
```

See [plan.md](plan.md) for the full project plan and [BUILD_LOG.md](BUILD_LOG.md) for the build history, including a running time/token total across the whole project.
