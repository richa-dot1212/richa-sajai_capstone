# Capstone Plan: Recipe Budget Agent

## Context
Recipe Budget Agent takes a recipe URL, the ingredients the user already has, a desired serving size, any changes wanted, and a budget. It identifies missing ingredients, evaluates substitutions, compares the cost/practicality of substituting vs. buying the original ingredient, and for ingredients that can't be reasonably substituted, searches Swiggy Instamart and adds them to the user's cart. It then generates and downloads a personalized recipe document showing what the user already has, substitutions made, items added to cart, adjusted quantities, and step-by-step instructions.

This supersedes the Assessment 1 "Recipe Adaptation Agent" plan (still visible in git history and in merged PR #1) — the substitution/adaptation core carries over; budget-based decisions and Instamart cart-building are new. This plan-update covers Assessment 1's planning requirement for the revised direction and scopes what gets built for Assessment 2 (starts next class).

## AI-Involvement Level

**Target: Supervised full-autonomy within a bounded task** (carried forward from Assessment 1). Within one run, the agent makes every conditional decision itself — missing-ingredient detection, substitution evaluation, buy-vs-substitute comparison, cart updates, document assembly — without pausing for approval mid-run.

**Why:** the buy-vs-substitute decision per ingredient is a live, budget-dependent judgment call, and budget tracking across ingredients may require revisiting earlier decisions. If a human approved every decision, the agent would be a search assistant, not an agent — and the actual graded skill (coordinating multi-step, budget-constrained decisions with live external tools) wouldn't be demonstrated.

**Where autonomy is deliberately bounded:** the agent's only external side effect is adding items to an Instamart cart — it never checks out or pays — plus writing one local file. The human reviews the cart and the document afterward, not during the run. Arithmetic (quantity scaling, running budget totals) stays as plain code, never delegated to the LLM. And if an ingredient can't be reasonably substituted or a purchase would break the budget, the agent must say so rather than silently forcing a bad substitution or silently overspending.

## MVP scope (Assessment 2)

- Accept a recipe URL + user inputs: ingredients on hand, desired serving size, requested changes, budget.
- Identify missing ingredients by diffing recipe ingredients against what the user has.
- Evaluate substitution candidates for missing ingredients (reasoning about each ingredient's functional role in the recipe).
- For each missing ingredient, compare cost/practicality of substituting vs. buying the original via Instamart, and decide within the stated budget.
- For ingredients being bought rather than substituted, search Swiggy Instamart and add them to the cart.
- Recompute quantities for the desired serving size (deterministic math, not LLM).
- Generate and download a personalized recipe document: ingredients on hand, substitutions made (with reasoning), items added to cart (with cost), adjusted quantities, step-by-step instructions, and a running budget summary.
- Self-consistency check on the final document before saving.

**Explicitly out of scope for MVP:** checkout/payment (cart only, never completes a purchase), multi-store price comparison, non-Instamart grocery sources, multi-currency/multi-region support, batch/multi-recipe runs, nutrition recalculation.

## Final goal

One end-to-end workflow combining recipe adaptation, budget-based buy-vs-substitute decisions, Instamart cart building, and personalized recipe document generation, in a single run.

## 1. End-to-end workflow

1. **Retrieve** — fetch the recipe (Recipe retrieval MCP): ingredients, quantities, instructions, servings.
2. **Diff** — compare against the user's on-hand ingredients → list of missing ingredients.
3. **Understand missing ingredients** — for each, determine its functional role in this recipe.
4. **Propose substitutes** — candidate(s) where plausible, using the Skill's reference table plus the agent's own reasoning.
5. **Compare cost/practicality** — substitute vs. buying the original at its live Instamart price; decide per-ingredient while tracking running spend against the stated budget (may revisit an earlier buy decision if a later one would exceed budget).
6. **Buy what's being bought** — search Swiggy Instamart and add those items to the cart.
7. **Rescale for servings** — deterministic math scaling every quantity to the target serving size.
8. **Assemble the document** — on-hand ingredients, substitutions + reasoning, cart items + cost, adjusted quantities, instructions, budget summary.
9. **Self-consistency check** — verify the document is internally coherent (no orphaned references, quantities and budget totals add up); loop back to fix if not.
10. **Save** — download the final document locally.

## 2. What the Agent does, and why an Agent (not a script) is needed

- **Live, budget-dependent judgment:** whether to substitute or buy an ingredient depends on its current Instamart price and the running budget — not a static lookup.
- **Multi-step tool coordination:** recipe retrieval, live product search/pricing, and cart mutation are separate external calls whose outcomes aren't known until queried.
- **Real branching, not a fixed pipeline:** budget tracking across ingredients may require revisiting and changing an earlier decision to stay within budget.
- **Honesty over forcing an answer:** the agent must flag an ingredient it can't reasonably substitute or afford, rather than pretending a bad substitution works or silently overspending.

## 3. Non-agent workflow vs. where the Agent earns its place

A plain script could handle: serving-size math, a static substitution lookup table, and even calling a known Instamart search API with an exact item name. That stays as **plain code, not an LLM call**.

Where a script breaks down and the Agent is genuinely better:
- Matching ambiguous or regionally-named ingredients to real Instamart catalog listings.
- Deciding whether substituting is actually worth it under a specific budget vs. buying the original.
- Deciding when to stop substituting and just buy.
- Producing a coherent final document synthesizing all of the above.

## 4. What the custom Skill ("Recipe Adaptation and Budget Skill") teaches the agent

- Evaluating ingredient compatibility and finding/checking plausible substitutions.
- The decision rule for substitute-vs-buy: compare substitute cost/practicality against the original's live purchase cost, weighed against the remaining budget.
- When to flag an over-budget or infeasible ingredient to the user instead of silently exceeding budget or forcing a bad substitution.
- Minimizing unnecessary purchases — don't buy something a reasonable substitute already covers.
- Instamart search-term guidance for ambiguous/regional ingredient names.
- The output document template and save/download convention.

## 5. Where the multi-step Agent loop happens

- **Per-ingredient loop:** determine role → propose substitution candidate(s) → compare cost/practicality vs. buying → decide → update cart if buying.
- **Budget-tracking loop across all ingredients:** running spend vs. stated budget, which may require revisiting an earlier per-ingredient decision to stay within budget.
- **Final self-check / document-assembly pass** before saving.

## 6. MCP servers (2)

1. **Recipe retrieval/source MCP** — fetches and parses the recipe from the URL.
2. **Swiggy Instamart MCP** — product search and cart updates (add items; never checkout). Availability is **not assumed** — this plan states it as the intended MCP; actual availability gets verified when Assessment 2 implementation starts.

## 7. What gets saved in the final version

One personalized recipe document, downloaded locally, containing: ingredients already on hand, substitutions made with reasoning, ingredients added to cart with cost, adjusted quantities for the target serving size, step-by-step instructions, and a budget summary (spent vs. stated budget).

## 8. GitHub repository structure

```
richa-sajai_capstone/
├── README.md
├── plan.md
├── BUILD_LOG.md
├── .mcp.json                      # recipe-retrieval + Swiggy Instamart MCP config
├── .claude/
│   └── skills/
│       └── recipe-budget-agent/
│           └── SKILL.md
├── reference/
│   └── substitutions.md           # ingredient-role substitution table
├── examples/
│   └── sample-runs.md             # input/output examples for grading
├── output/                        # generated recipe documents (gitignored)
└── .gitignore
```

## Known risks / scoping calls

- Swiggy Instamart MCP availability is unverified — the single biggest execution risk for Assessment 2.
- Ingredient-name-to-catalog matching will need judgment, not exact string match (regional/brand naming differences).
- Live pricing means budget comparisons aren't deterministic across runs.
- MVP assumes a single grocery platform, region, and currency.
