# Capstone Plan: Recipe Adaptation Agent

## Context
A user gives a recipe URL plus what's different for them — missing ingredients, a different serving size, and/or different cooking utensils. The agent adapts the recipe: it figures out what each missing ingredient does in *that specific recipe*, finds and validates substitutions (including checking how similar recipes use them and how well those are received), rescales quantities, rewrites instructions for the available equipment, checks the final recipe for internal consistency, and saves the personalized version to disk.

This plan covers the idea lock-in and repo setup (Assessment 1) and scopes what gets built for the working end-to-end agent (Assessment 2, due in 4 days).

## AI-Involvement Level

**Target: Supervised full-autonomy within a bounded task.** Within one run, the agent makes every judgment call itself — end-to-end, no human-in-the-loop confirmation between steps: classifying what a missing ingredient does, proposing substitutes, deciding whether web evidence is strong enough to accept one, rescaling, rewriting instructions, and self-checking the final recipe. It does not pause to ask the user to approve each intermediate decision.

**Why:** the whole point of this capstone is the multi-step judgment/retry loop (propose → validate → retry → self-check). If a human approved every substitution choice, the "agent" would just be a search assistant, and the graded criterion — does the agentic workflow actually run end-to-end — would be trivial to satisfy without demonstrating real autonomy.

**Where autonomy is deliberately bounded:** the agent's authority is scoped to *this one task*. It only reads the URL/inputs it's given, only searches for validation evidence, and only writes one output file to a fixed local `output/` folder — it doesn't take actions outside that (no auto-sending, no modifying other files, no browsing beyond what's needed to validate a substitution). And when it can't validate a substitution or the requested adaptation isn't feasible (e.g. no oven for a baked dish), it must say so rather than force an answer — the human reviews the final saved file before actually cooking from it. That's the human-in-the-loop point: after the run, not during it.

## MVP scope (Assessment 2, due in 4 days)

Deliberately narrow, so the loop is real and demoable rather than broad and flaky:

- Single recipe URL input, from a small set of well-structured recipe sites/blogs (not arbitrary URLs — many sites block scraping or use inconsistent markup).
- English-language, text-based recipes only (no video/image-only recipes).
- Handles at most a few missing ingredients per run, one serving-size change, and one utensil constraint — combined or individually.
- Substitution validation loop: propose a candidate, search for evidence via WebSearch, accept/reject/retry, capped at 2-3 attempts per ingredient before flagging as unresolved.
- Deterministic serving-size math handled as plain computation, not LLM guessing.
- Self-consistency check on the final recipe before saving.
- Output: one adapted recipe file + changes/rationale log, written locally via a Filesystem MCP server.
- Two MCP servers: Fetch (recipe + evidence retrieval) and Filesystem (saving output).
- One custom Skill (`recipe-adapter`) encoding the procedure, substitution reference table, validation bar, and output format.

**Explicitly out of scope for the MVP:** multi-URL/batch runs, non-English recipes, video/image recipe parsing, a UI (CLI/direct agent invocation is fine), nutrition recalculation, and asking a human for input mid-run.

## Final/stretch goals (beyond the 4-day MVP, time permitting)

- Broader site support / more robust scraping fallback.
- Nutrition-impact estimate when a substitution changes macros meaningfully.
- A small local eval set (sample URL + expected-substitution-judgment pairs) to regression-test the validation loop.
- Batch mode: adapt the same recipe for multiple constraint sets at once.

## 1. End-to-end workflow

1. **Retrieve** — fetch the recipe page (Fetch MCP); extract ingredients (quantities/units), instructions, original serving size, equipment mentioned.
2. **Understand missing ingredients** — for each, reason about its functional role *in this recipe* (e.g. "butter here = fat + moisture + flavor in a cookie dough").
3. **Propose substitutes** — 1-3 candidates per missing ingredient with conversion ratios, using the Skill's reference table plus the agent's own knowledge.
4. **Validate substitutes (the core loop)** — search for evidence the top candidate works in this type of recipe; if evidence is weak/contradictory, fall back to the next candidate and re-check, capped attempts; unresolved → flag to the user instead of guessing.
5. **Rescale for servings** — deterministic math scaling every quantity to the target serving size.
6. **Adjust for utensils** — rewrite instructions for different equipment; flag when the requested equipment swap likely breaks the dish (e.g. no oven for a baked good) rather than fabricating a method.
7. **Self-consistency check** — verify every instruction step still references ingredients that exist and quantities scale consistently; loop back to fix if not.
8. **Save** — write the final personalized recipe plus a changes/rationale log to disk via the Filesystem MCP.

## 2. What the Agent does, and why an Agent (not a script) is needed

- **Judgment, not lookup:** what role an ingredient plays *in this recipe*, and whether a substitute will plausibly work, requires reasoning over unstructured text.
- **Unbounded, conditional control flow:** how many ingredients are missing, how many substitution attempts are needed, and whether utensil constraints even make the recipe adaptable are unknown in advance — a real branching/retry loop, not a fixed pipeline.
- **Tool use driven by need:** the agent decides when it has enough validation evidence vs. when to check one more source.
- **Honesty over forcing an answer:** sometimes the right output is "this can't be adapted as asked" — that judgment is the hard/interesting part of the project.

## 3. Non-agent workflow vs. where the Agent earns its place

A plain script could handle: scraping with a fixed parser, scaling quantities by ratio math, and swapping ingredients from a static substitution table (e.g. "butter → applesauce, 1:1"). That part stays as **plain code, not an LLM call** — never delegate arithmetic to the LLM.

Where a script breaks down and the Agent is genuinely better:
- Judging whether a substitute works *in this specific recipe's context* (butter-as-fat-in-frosting vs. butter-as-fat-in-cookies behave differently).
- Synthesizing scattered, sometimes-conflicting web evidence into an accept/reject decision.
- Rewriting instructions in natural language for different equipment.
- Catching internal inconsistency in the final modified recipe.

## 4. What the custom Skill (SKILL.md) teaches the agent

- The procedure, in order — retrieve → classify missing-ingredient roles → propose substitutes → validate → scale → rewrite for utensils → self-check → save — so the agent doesn't skip validation or save prematurely.
- A substitution reference table for common ingredient roles (fat, binder, leavening, acid, thickener, sweetener) with typical ratios, as a fallback the agent can override with its own reasoning + search evidence.
- The validation bar — what counts as "enough evidence" (e.g. found in ≥2 independent recipes/reviews of the same dish type, no strong negative signal) vs. when to flag as unresolved.
- When to refuse/flag instead of forcing an answer.
- The output file template and save location/naming convention.

## 5. Where the multi-step Agent loop happens

Two nested loops:
- **Per-ingredient substitution loop:** propose candidate → search for evidence → judge → accept, or try next candidate → repeat (capped) → accept or flag.
- **Outer self-review loop:** after assembling the full adapted recipe, the agent checks its own output for consistency and can loop back to correct an ingredient/step before writing the file.

## 6. MCP servers (2)

1. **Fetch MCP server** — retrieves the recipe URL and supporting recipe/review pages as clean markdown/text. Used in retrieval and evidence-gathering.
2. **Filesystem MCP server** — writes the final personalized recipe (and changes log) to a local folder; can also read a local substitution reference file.

Web search for validation evidence uses the built-in WebSearch tool rather than a third MCP server, keeping the requirement at 2 MCPs (Fetch + Filesystem) while still getting real search capability.

## 7. What gets saved in the final version

- `<recipe-name>-adapted.md` — full personalized recipe: ingredients (substitutions marked inline), scaled quantities, rewritten instructions.
- A **Changes & Rationale** section: what was substituted and why, evidence (links), scaling math, utensil-driven rewrites or flags.
- Optional JSON sidecar with structured before/after data for demo/testing.
- Default save location: `./output/` (gitignored), filename includes a timestamp or recipe slug.

## 8. GitHub repository structure

```
richasajai_capstone/
├── README.md
├── plan.md
├── BUILD_LOG.md
├── .mcp.json                      # fetch + filesystem MCP server config
├── .claude/
│   └── skills/
│       └── recipe-adapter/
│           └── SKILL.md
├── reference/
│   └── substitutions.md           # ingredient-role substitution table
├── examples/
│   └── sample-runs.md             # input/output examples for grading
├── output/                        # generated adapted recipes (gitignored)
└── .gitignore
```

## Known risks / scoping calls

- Recipe sites vary in structure and some block scraping — MVP scopes to a handful of well-structured sites/blogs.
- "Validated by web evidence" is inherently fuzzy — the Skill's validation bar needs to be concrete enough to be explainable in a demo, not vibes-based.
- Substitution-search attempts are capped per ingredient to keep runtime/cost reasonable during grading.
