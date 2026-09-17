# Ingredient Substitution Reference

A fallback reference table by functional role, used by the Recipe Budget
Skill (`.claude/skills/recipe-budget-agent/SKILL.md`) when evaluating a
missing ingredient. This is a starting point the agent can override with its
own reasoning about the specific recipe — it is not an exact-match lookup.

| Role | Missing ingredient (example) | Common substitute | Typical ratio | Notes |
|---|---|---|---|---|
| Fat | Butter | Neutral oil | 3:4 (¾ cup oil per 1 cup butter) | Loses creaming ability — affects texture in creamed baked goods. |
| Fat | Butter | Unsweetened applesauce | 1:1 (up to half the butter) | Reduces richness/browning; adds moisture. |
| Binder | Egg | Flax egg (1 tbsp ground flax + 3 tbsp water) | 1 egg | Works for moisture/binding, not for leavening/structure in cakes. |
| Binder | Egg | Plain yogurt | ¼ cup per egg | Adds moisture and slight tang. |
| Leavening | Baking powder | Baking soda + acid (cream of tartar/lemon juice) | ¼ tsp soda + ½ tsp acid per 1 tsp powder | Must pair with an acid already in or added to the recipe. |
| Leavening | Baking soda | Baking powder | 3x the amount | Only works if recipe doesn't rely on soda's acid-neutralizing role. |
| Acid | Buttermilk | Milk + lemon juice/vinegar | 1 cup milk + 1 tbsp acid, rest 5 min | Common, reliable substitute. |
| Acid | Lemon juice | Vinegar | 1:1 | Different flavor profile — fine for acidity, not for citrus flavor. |
| Thickener | Cornstarch | All-purpose flour | 1:2 (2 tbsp flour per 1 tbsp cornstarch) | Flour thickens less strongly and can taste "raw" if undercooked. |
| Sweetener | Granulated sugar | Honey | ¾ cup honey per 1 cup sugar, reduce liquid slightly | Adds moisture and browning; changes flavor. |
| Sweetener | Brown sugar | White sugar + molasses | 1 cup sugar + 1 tbsp molasses per 1 cup brown sugar | Close approximation. |
| Flavor/aromatic | A specific spice/herb | A related spice/herb | Start at half quantity, adjust to taste | Highest substitution latitude — least likely to break the dish. |

## How the Skill should use this table

- Treat rows as **starting points**, not verdicts — the Skill still requires
  reasoning about the ingredient's specific role in the recipe at hand
  (see SKILL.md §1-3) before accepting a row's substitute.
- If the missing ingredient isn't in this table, reason from its functional
  role category instead of refusing to evaluate it.
- This table has no cost or availability information — that always comes
  from a live Instamart lookup, never from this file.
