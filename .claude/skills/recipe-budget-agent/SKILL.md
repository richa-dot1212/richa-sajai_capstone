---
name: recipe-budget-agent
description: Evaluate a single missing ingredient for a specific recipe under a budget, and decide whether to substitute it or buy the original via Instamart.
---

# Recipe Budget Skill

Scope: this Skill covers exactly **one repeatable task** — given one missing
ingredient, in the context of one specific recipe, and a remaining budget,
decide whether to substitute it or buy the original. It does not cover the
outer agent loop, cart-adding mechanics, serving-size math, or document
generation — those are the calling agent's job (built in PR 2).

## 1. Understand the ingredient's role in *this* recipe

Before evaluating anything, classify what the missing ingredient is actually
doing in this specific recipe. The same ingredient plays different roles in
different dishes:

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

## 2. Evaluate substitution compatibility

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

## 3. Consider the recipe-level impact of the substitution

Ask what actually changes if this substitute is used: texture, flavor,
structure, cook time, or appearance. A substitution that "works" but
meaningfully changes the dish (e.g. a much denser texture, a noticeably
different flavor) should be surfaced as a trade-off, not presented as
equivalent.

## 4. Compare substituting vs. buying the original

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

## 5. Factor in the remaining budget, not just this ingredient

The remaining budget is shared across every missing ingredient in the
recipe, not a per-ingredient allowance. Before deciding to buy:
- Check what buying this ingredient would leave for the remaining missing
  ingredients.
- If buying this one item would starve the budget for ingredients that have
  *no* reasonable substitute, prefer substituting here even if buying would
  "work" in isolation.

## 6. Avoid unnecessary purchases

Do not buy the pricier of the two real options (original vs. substitute)
just because the budget technically allows it, if the cheaper, compatible
option covers the role adequately. The budget being available is not
itself a reason to spend more than necessary.

## 7. When no reasonable substitution exists

Some ingredients are structurally or chemically central enough (e.g. the
core protein in a dish, a leavening agent with no equivalent on hand) that no
substitute is reasonable. In that case:
- If the budget allows buying it, buy it.
- If the budget does not allow it, say so explicitly — do not force a
  substitute that will not work, and do not silently exceed the budget to
  make the recipe "complete."

## 8. Hard rules

- **Never** force an unsuitable substitution just to stay within budget.
- **Never** knowingly overspend just to complete the recipe as originally
  written.
- **Never** guess a price when a live Instamart lookup is available.
- When a decision can't be made cleanly (budget too tight, no substitute,
  and buying isn't affordable either), report the conflict rather than
  picking an answer that hides it.

## 9. Instamart search-term guidance

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
