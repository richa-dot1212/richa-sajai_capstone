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
