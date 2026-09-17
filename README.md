# Recipe Budget Agent

An agent capstone project. A user gives a recipe URL, the ingredients they already have, a desired serving size, any changes they want, and a budget. The agent identifies missing ingredients, evaluates substitutions, compares the cost/practicality of substituting versus buying the original ingredient (using live Swiggy Instamart pricing), adds ingredients it decides to buy to the user's cart, rescales quantities for the target serving size, and generates a personalized recipe document — showing what's on hand, substitutions made, cart additions, and step-by-step instructions.

See [plan.md](plan.md) for the full project plan and [BUILD_LOG.md](BUILD_LOG.md) for the build history.

## Status

**Assessment 2, PR 1 (foundation):** custom Skill + MCP connections, both verified working end-to-end with real inputs — see `.claude/skills/recipe-budget-agent/SKILL.md`, `.mcp.json`, and `examples/sample-runs.md` for actual test results, including a real authenticated Swiggy Instamart product search. No agent yet.

**Assessment 2, PR 2 (next):** the Gemini-powered agent, its perceive → reason → act → observe loop, and a full end-to-end run.
