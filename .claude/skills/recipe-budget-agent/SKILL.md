---
name: recipe-budget-agent
description: Evaluate a single missing ingredient for a specific recipe under a budget, and decide whether to substitute it or buy the original via Instamart.
---

# Recipe Budget Skill

Scope: this Skill covers exactly **one repeatable task** — given one missing
ingredient, in the context of one specific recipe, a remaining budget, and
whatever changes the user asked for, decide whether it's essential, whether
it should be substituted or bought, and explain that decision in plain
language. It does not cover the outer agent loop, cart-adding mechanics,
serving-size math, or document generation — those are the calling agent's
job.

## 1. Understand the ingredient's role in *this* recipe

Before evaluating anything, classify what the missing ingredient is actually
doing in this specific recipe. The same ingredient plays different roles in
different dishes:

- **Central/defining** — the ingredient the dish is built around (e.g. the
  named protein in a chicken curry, the flour in a bread). See §2 below —
  this role gets handled differently from the rest.
- **Fat** — moisture, richness, tenderness (e.g. butter in cookies, oil in a
  stir-fry).
- **Binder** — holds the structure together (e.g. eggs in a batter, breadcrumbs
  in a patty).
- **Leavening** — creates rise/lift (e.g. baking soda, baking powder, yeast).
- **Acid** — balances flavor, reacts with leavening, tenderizes (e.g. lemon
  juice, buttermilk, vinegar).
- **Thickener** — controls texture/viscosity (e.g. cornstarch, flour in a
  roux).
- **Sweetener** — sweetness, and often also moisture/browning (e.g. sugar,
  honey).
- **Flavor/aromatic** — primarily contributes taste, not structure (e.g. a
  specific spice, herb, or aromatic vegetable).

Read the recipe's instructions, not just the ingredient list, to see how the
ingredient is used (creamed with sugar? whisked in at the end? part of a
base?) — that tells you which role(s) actually matter here.

Put the role in plain language too, in one or two sentences meant for the
end user, not just the category label above — e.g. "Butter is used here to
provide fat and richness and help create the intended texture," not just
"fat." The category is for your own reasoning; the plain-language sentence
is what the user actually reads.

## 2. Decide whether this ingredient is essential, before considering any substitute

Some ingredients define the dish; others are flexible. Get this decision
right *before* proposing a substitute, because it changes what "reasonable"
even means:

- **Essential/defining** — the dish's core identity depends on it (the named
  protein, a structural component with no real equivalent). For an essential
  ingredient, **do not invent an unrelated substitute** just because the
  user is missing it. A chicken recipe missing chicken is not an invitation
  to propose tofu or paneer — that changes the dish into a different dish,
  which is not what "substitute" means here.
- **The one exception**: the user's requested changes. If they explicitly
  asked for a transformation that requires it — "make it vegetarian," "make
  it dairy-free," "make it vegan" — then substituting the defining
  ingredient is exactly the ask, and a real substitute should be proposed
  and evaluated normally (§3-§4). Absent that kind of explicit request,
  treat the ingredient as essential and don't reach for a substitute at all.
- **Reasonably substitutable** — everything that isn't the dish's defining
  ingredient (most fats, binders, leavening, acid, thickener, sweetener,
  flavor/aromatic roles) gets a real substitute candidate proposed and
  evaluated per §3-§4 below.

When an ingredient is judged essential with no substitute to propose, the
only real question left is whether the original fits the remaining budget
(§5, §7) — there is no "which is cheaper" comparison to make, because there
is only one option.

## 3. Evaluate substitution compatibility

For each candidate substitute, judge whether it preserves the ingredient's
role *well enough for this recipe*, not in the abstract:

- A fat substitute that changes moisture content matters more in a delicate
  cake than in a rustic stew.
- A binder substitute needs to match the mechanism (a soaking starch vs. a
  protein) or the structure fails.
- An acid substitute needs comparable acidity if it reacts with a leavening
  agent — swapping it out can silently break the rise.
- Flavor/aromatic substitutes have the most latitude — compatibility here
  is about taste similarity, not chemistry.

Reject a substitute (don't just default to it) when it would only preserve
the ingredient's *name*, not its *function* in this dish.

## 4. Consider the recipe-level impact of the substitution

Ask what actually changes if this substitute is used: texture, flavor,
structure, cook time, or appearance. A substitution that "works" but
meaningfully changes the dish (e.g. a much denser texture, a noticeably
different flavor) should be surfaced as a trade-off, not presented as
equivalent.

## 5. Compare substituting vs. buying the original

The user states exactly which ingredients they're missing — never assume a
proposed substitute is already sitting in their kitchen just because it's a
common item. Both real options below mean sourcing something via Instamart:

1. **Substitute** — search Instamart for a compatible, cheap/common
   alternative and get its live price.
2. **Buy the original** — search Instamart for the exact ingredient and get
   its live price.

Compare them on:
- **Cost**: always use each option's real Instamart price. The substitute
  is not automatically cheaper than the original — compare the actual
  numbers, not an assumption.
- **Live pricing**: always use the Instamart MCP's actual returned price for
  both options, never estimate or guess a plausible price when a real
  lookup is available.
- **Practicality**: buying a whole pack of a specialty item for one recipe
  use is often worse than a common, cheaper substitute, even if the
  specialty item is technically "more correct."

## 6. Factor in the remaining budget, not just this ingredient

The remaining budget is shared across every missing ingredient in the
recipe, not a per-ingredient allowance. Before deciding to buy:
- Check what buying this ingredient would leave for the remaining missing
  ingredients.
- If buying this one item would starve the budget for ingredients that have
  *no* reasonable substitute, prefer substituting here even if buying would
  "work" in isolation.

## 7. Avoid unnecessary purchases

Do not buy the pricier of the two real options (original vs. substitute)
just because the budget technically allows it, if the cheaper, compatible
option covers the role adequately. The budget being available is not
itself a reason to spend more than necessary.

## 8. When no reasonable substitution exists

This covers both an ingredient judged essential per §2 (deliberately no
substitute was ever proposed) and a non-essential ingredient where a
substitute was proposed but turned out incompatible or unaffordable. Either
way:
- If the budget allows buying it, buy it.
- If the budget does not allow it, say so explicitly — do not force a
  substitute that will not work, and do not silently exceed the budget to
  make the recipe "complete."

## 9. Hard rules

- **Never** force an unsuitable substitution just to stay within budget.
- **Never** knowingly overspend just to complete the recipe as originally
  written.
- **Never** guess a price when a live Instamart lookup is available.
- When a decision can't be made cleanly (budget too tight, no substitute,
  and buying isn't affordable either), report the conflict rather than
  picking an answer that hides it.

## 10. Instamart search-term guidance

Product name matching between a recipe's ingredient list and Instamart's
catalog is not exact-string matching — use judgment:

- Search using the generic/common product name, not recipe-specific phrasing
  (e.g. search "toor dal", not "yellow lentils for sambar").
- Account for regional/brand naming variance (the same ingredient may be
  listed under a different common name).
- Prefer the smallest reasonable pack size for a single recipe's use, rather
  than defaulting to the first or cheapest result regardless of quantity.
- If a search returns multiple plausible matches, pick the one whose name
  most directly matches the plain-language ingredient, not the one with the
  lowest price if that price implies a mismatched product or quantity.
