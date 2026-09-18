// Deterministic substitute-vs-buy decision -- this used to be a second
// LLM call per ingredient, but the actual judgment call (is the
// substitute compatible?) already comes out of the single batched role
// call in workflow.js. Everything left here is arithmetic/comparison,
// which belongs in code per the Recipe Budget Skill's own rule: never
// delegate arithmetic to the LLM.
//
// Deliberately does NOT assume a substitute is "already on hand" -- the
// user states exactly what they're missing, so any substitute for a
// missing ingredient is itself something to actually source via
// Instamart, not assume is already in the kitchen.

/**
 * @param {object} args
 * @param {boolean} args.substituteIsCompatible - the LLM's compatibility judgment for this ingredient.
 * @param {string} args.substituteCandidate
 * @param {object|null} args.originalProduct - { displayName, offerPrice } or null if not found.
 * @param {object|null} args.substituteProduct - { displayName, offerPrice } or null if not found.
 * @param {number} args.remainingBudget
 */
function decideSubstituteOrBuy({
  substituteIsCompatible,
  substituteCandidate,
  originalProduct,
  substituteProduct,
  remainingBudget,
}) {
  const substituteCost = substituteProduct ? substituteProduct.offerPrice : null;
  const substituteAffordable = substituteCost !== null && substituteCost <= remainingBudget;
  const originalAffordable = originalProduct ? originalProduct.offerPrice <= remainingBudget : false;

  if (substituteIsCompatible && substituteAffordable && (!originalProduct || substituteCost <= originalProduct.offerPrice)) {
    return {
      decision: 'substitute',
      reasoning: `${substituteCandidate} (${substituteProduct.displayName}, ₹${substituteCost}) is a compatible, ${originalProduct ? `cheaper option than buying the original (₹${originalProduct.offerPrice})` : 'affordable option'} -- adding it to the cart.`,
    };
  }

  if (originalProduct && originalAffordable) {
    return {
      decision: 'buy',
      reasoning: `Buying the original (${originalProduct.displayName}, ₹${originalProduct.offerPrice}) fits the remaining budget of ₹${remainingBudget}.`,
    };
  }

  if (substituteIsCompatible && substituteAffordable) {
    return {
      decision: 'substitute',
      reasoning: `Buying the original would exceed the remaining budget of ₹${remainingBudget}${originalProduct ? ` (₹${originalProduct.offerPrice})` : ''}; ${substituteCandidate} (₹${substituteCost}) is a compatible, affordable alternative -- adding it to the cart.`,
    };
  }

  if (originalProduct && !originalAffordable) {
    const substituteNote = !substituteIsCompatible
      ? 'no compatible substitute'
      : substituteProduct
        ? `the compatible substitute (${substituteCandidate}, ₹${substituteCost}) also exceeds the remaining budget`
        : `a compatible substitute (${substituteCandidate}) was proposed but not found on Instamart`;
    return {
      decision: 'cannot_complete',
      reasoning: `Buying the original (₹${originalProduct.offerPrice}) would exceed the remaining budget of ₹${remainingBudget}, and ${substituteNote}.`,
    };
  }

  return {
    decision: 'cannot_complete',
    reasoning: substituteIsCompatible
      ? `A compatible substitute (${substituteCandidate}) was proposed but not found on Instamart at an affordable price, and the original wasn't found either.`
      : 'No compatible substitute, and the original was not found on Instamart.',
  };
}

module.exports = { decideSubstituteOrBuy };
