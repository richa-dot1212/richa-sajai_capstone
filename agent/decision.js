// Deterministic substitute-vs-buy decision -- this used to be a second
// Gemini call per ingredient, but the actual judgment call (is the
// substitute compatible?) already comes out of the single batched role
// call in workflow.js. Everything left here is arithmetic/comparison,
// which belongs in code per the Recipe Budget Skill's own rule: never
// delegate arithmetic to the LLM.

/**
 * @param {object} args
 * @param {boolean} args.substituteIsCompatible - Gemini's compatibility judgment for this ingredient.
 * @param {string} args.substituteCandidate
 * @param {boolean} args.substituteLikelyAlreadyOwned
 * @param {object|null} args.originalProduct - { displayName, offerPrice } or null if not found.
 * @param {object|null} args.substituteProduct - { displayName, offerPrice } or null if not needed/found.
 * @param {number} args.remainingBudget
 */
function decideSubstituteOrBuy({
  substituteIsCompatible,
  substituteCandidate,
  substituteLikelyAlreadyOwned,
  originalProduct,
  substituteProduct,
  remainingBudget,
}) {
  const substituteCost = substituteLikelyAlreadyOwned ? 0 : (substituteProduct ? substituteProduct.offerPrice : null);
  const substituteAffordable = substituteCost === null ? false : substituteCost <= remainingBudget;
  const originalAffordable = originalProduct ? originalProduct.offerPrice <= remainingBudget : false;

  if (substituteIsCompatible && substituteAffordable && (!originalProduct || substituteCost <= originalProduct.offerPrice)) {
    return {
      decision: 'substitute',
      reasoning: substituteLikelyAlreadyOwned
        ? `${substituteCandidate} is a compatible substitute already likely on hand, avoiding an unnecessary ₹${originalProduct ? originalProduct.offerPrice : '?'} purchase.`
        : `${substituteCandidate} (₹${substituteCost}) is a compatible, cheaper option than buying the original${originalProduct ? ` (₹${originalProduct.offerPrice})` : ''}.`,
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
      reasoning: `Buying the original would exceed the remaining budget of ₹${remainingBudget}${originalProduct ? ` (₹${originalProduct.offerPrice})` : ''}; ${substituteCandidate} is a compatible, affordable alternative.`,
    };
  }

  if (originalProduct && !originalAffordable && !substituteIsCompatible) {
    return {
      decision: 'cannot_complete',
      reasoning: `No compatible substitute, and buying the original (₹${originalProduct.offerPrice}) would exceed the remaining budget of ₹${remainingBudget}.`,
    };
  }

  return {
    decision: 'cannot_complete',
    reasoning: 'No compatible substitute and no affordable way to buy the original within the remaining budget.',
  };
}

module.exports = { decideSubstituteOrBuy };
