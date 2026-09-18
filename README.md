# Recipe Budget Agent

Give it a recipe URL, the ingredients you're missing, a target serving size, and a budget. It:

1. Retrieves the real recipe page and parses it.
2. Figures out what each missing ingredient does in that specific recipe.
3. Decides, per ingredient, whether to substitute it or buy the original — checking real live prices on Swiggy Instamart and weighing that against your remaining budget.
4. Adds anything it decides to buy to your real Instamart cart (never checks out or pays).
5. Rescales every quantity to your requested serving size.
6. Saves a personalized recipe document locally, showing what's substituted, what's bought, and the full adjusted instructions.

This is the actual capstone project, not a toy exercise — the pieces below (a custom Skill, a Gemini-powered agent, two real MCP servers, and a small website) are the real system.

## Why an agent, not a script

The substitute-vs-buy judgment for each ingredient is genuinely ambiguous and budget-dependent — it needs live pricing, a compatibility judgment specific to *this* recipe, and it can require reconsidering an earlier decision if a later purchase would blow the budget. That's real branching, not a fixed pipeline. Everything mechanical (serving-size arithmetic, price comparisons, budget bookkeeping, the final substitute/buy decision itself) is deliberately kept as plain code — see `agent/decision.js` and `agent/servingSize.js` — and Gemini is only used for the two genuinely ambiguous steps: parsing an arbitrary recipe page, and judging each missing ingredient's role/substitute compatibility.

## Quick start (for someone cloning this repo)

**Prerequisites:** Node.js 18+ (tested on v24), a Gemini API key ([aistudio.google.com](https://aistudio.google.com)), and a Swiggy account (for the Instamart integration).

```bash
git clone <this-repo>
cd <repo>
npm install
```

Create a `.env` file in the project root:

```
GEMINI_API_KEY=your-key-here
```

**One-time Swiggy login** (the Instamart MCP needs this before the agent can search products or use your cart):

```bash
node scripts/swiggy-mcp-proxy.js
```

This opens a browser — log into your real Swiggy account. Leave that terminal running (or just re-run it later; it reuses the cached login for ~5 days). See `examples/sample-runs.md` for why this proxy exists — it works around a real bug in Swiggy's own OAuth metadata.

**Run the app:**

```bash
npm start
```

Open `http://localhost:3000`, fill in a recipe URL, what you're missing, your serving size and budget, and click **Adapt My Recipe**. Progress shows as 4 stages (Understanding recipe → Checking ingredients and budget → Finding/substituting ingredients → Recipe ready), then a summary with a link to the full downloaded document.

You can also run it from the command line without the website:

```bash
node scripts/run-agent-cli.js "<recipe-url>" "<missing ingredients, comma-separated>" <servings> "<requested changes>" <budget>
```

## Known limitations

- **Gemini free-tier quota is 20 requests/day.** A run costs 2 calls total regardless of how many ingredients are missing (see "Why an agent, not a script" above) — but iterating on a free key during development still adds up fast. A billing-enabled key removes this ceiling.
- **The Swiggy Instamart MCP has a real, currently-open upstream bug** (broken OAuth metadata) that this repo works around locally with a proxy — see `examples/sample-runs.md` for details.
- Recipe parsing assumes the URL points at an actual recipe page; a non-recipe page is detected and reported cleanly rather than producing a garbage result (see `agent/workflow.js`'s `RecipeParseError`).

## Project structure

```
.claude/skills/recipe-budget-agent/SKILL.md   custom Skill: how to evaluate one missing ingredient
.mcp.json                                     Fetch MCP + Swiggy Instamart MCP config
scripts/swiggy-mcp-proxy.js                   local fix-up proxy for the Swiggy MCP OAuth bug
agent/                                        the actual agent: workflow, Gemini client, MCP clients,
                                               deterministic decision/scaling/self-check logic
server.js + public/                           the website (interface only -- no decision logic here)
scripts/run-agent-cli.js                      run the same agent without the website
reference/substitutions.md                    ingredient-role substitution fallback table
examples/                                     real test transcripts (not mocked)
output/                                       generated personalized recipes (gitignored)
```

See [plan.md](plan.md) for the full project plan and [BUILD_LOG.md](BUILD_LOG.md) for the build history, including a running time/token total across the whole project.
