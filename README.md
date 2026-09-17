# Recipe Budget Agent

An agent capstone project. A user gives a recipe URL, the ingredients they already have, a desired serving size, any changes they want, and a budget. The agent identifies missing ingredients, evaluates substitutions, compares the cost/practicality of substituting versus buying the original ingredient (using live Swiggy Instamart pricing), adds ingredients it decides to buy to the user's cart, rescales quantities for the target serving size, and generates a personalized recipe document — showing what's on hand, substitutions made, cart additions, and step-by-step instructions.

See [plan.md](plan.md) for the full project plan and [BUILD_LOG.md](BUILD_LOG.md) for the build history.

## Status

**Assessment 2, PR 1 (foundation):** custom Skill + MCP connections, both verified working end-to-end with real inputs — see `.claude/skills/recipe-budget-agent/SKILL.md`, `.mcp.json`, and `examples/sample-runs.md` for actual test results, including a real authenticated Swiggy Instamart product search. No agent yet.

**Assessment 2, PR 2:** the actual Gemini-powered agent (`agent/`), a simple local website (`server.js` + `public/`), and a real perceive → reason → act → observe loop using the Skill and both MCPs. Verified end-to-end for one full missing ingredient (real recipe retrieval, parsing, diffing, Skill-guided reasoning, a real Instamart price lookup, and a real budget-grounded substitute decision) before hitting Google's Gemini free-tier daily quota mid-run — see `examples/pr2-end-to-end-run.md` for the full transcript and `BUILD_LOG.md` for details.

## Running it locally

```
npm install
npm start
```

Then open `http://localhost:3000`. Requires `GEMINI_API_KEY` in `.env`, and the Swiggy Instamart MCP needs a one-time interactive login (see `examples/sample-runs.md`).
