// Deterministic self-consistency check, run before the document is
// generated. Mutates `state` in place with corrections where it safely can,
// and always returns a list of what it found/fixed for the progress log
// and BUILD_LOG.
const { scaleIngredients } = require('./servingSize');

function runSelfCheck(state, input) {
  const corrections = [];

  // 1. No ingredient should be both substituted and purchased -- by
  // construction each ingredient has exactly one decision record, but
  // guard against duplicate entries for the same ingredient disagreeing.
  const seen = new Map();
  for (const d of state.decisions) {
    const key = d.ingredient.toLowerCase();
    if (seen.has(key) && seen.get(key) !== d.decision) {
      corrections.push(`"${d.ingredient}" had conflicting decisions (${seen.get(key)} vs ${d.decision}) -- kept the later one`);
    }
    seen.set(key, d.decision);
  }

  // 2. Recompute scaled quantities independently and compare -- catches
  // any drift between what was scaled and what the input actually asked for.
  const recomputed = scaleIngredients(state.recipe.ingredients, state.recipe.servings, input.servingSize);
  const mismatch = recomputed.some((r, i) => r.quantity !== state.scaledIngredients[i].quantity);
  if (mismatch) {
    corrections.push('Scaled quantities did not match the requested serving size -- recomputed');
    state.scaledIngredients = recomputed;
  }

  // 3. Every purchased ingredient (bought as-is, or substituted and
  // actually sourced via Instamart) must appear in the final ingredient list.
  const scaledNames = state.scaledIngredients.map((i) => i.name.toLowerCase());
  for (const d of state.decisions) {
    if ((d.decision === 'buy' || d.decision === 'substitute') && d.product && !scaledNames.includes(d.ingredient.toLowerCase())) {
      corrections.push(`Purchased ingredient "${d.ingredient}" was missing from the final ingredient list -- re-added`);
      state.scaledIngredients.push({ name: d.ingredient, quantity: d.quantity, originalQuantity: d.quantity });
    }
  }

  // 4. Total purchases must not exceed the stated budget.
  if (state.spentSoFar > Number(input.budget)) {
    corrections.push(
      `Total purchases (₹${state.spentSoFar}) exceeded the stated budget (₹${input.budget}) -- flagging rather than hiding it`
    );
    state.budgetExceeded = true;
  }

  // 5. Instructions should not silently still reference an ingredient that
  // was substituted out -- annotate rather than rewriting instructions
  // wholesale (safer than an unreviewed LLM rewrite of cooking steps).
  const substituted = state.decisions.filter((d) => d.decision === 'substitute');
  let instructions = state.recipe.instructions.slice();
  for (const d of substituted) {
    const pattern = new RegExp(`\\b${escapeRegExp(d.ingredient)}\\b`, 'gi');
    let touched = false;
    instructions = instructions.map((step) => {
      if (pattern.test(step)) {
        touched = true;
        return step.replace(pattern, `${d.ingredient} (substituted with ${d.substituteCandidate})`);
      }
      return step;
    });
    if (touched) {
      corrections.push(`Instructions referenced substituted ingredient "${d.ingredient}" -- annotated with its substitute`);
    }
  }
  state.finalInstructions = instructions;

  return { corrections };
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { runSelfCheck };
