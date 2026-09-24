function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Shared by agent/pdfBuilder.js -- derives the same groupings from
// state.decisions that agent/workflow.js's buildSummary() also needs.
function categorizeDecisions(state) {
  const { decisions, scaledIngredients } = state;
  const onHand = scaledIngredients.filter(
    (ing) => !decisions.some((d) => d.ingredient.toLowerCase() === ing.name.toLowerCase())
  );
  const substitutions = decisions.filter((d) => d.decision === 'substitute');
  // Both a literal "buy the original" and a "substitute" that was actually
  // sourced via Instamart appear here -- substituting never means "assume
  // it's already in the kitchen."
  const purchases = decisions.filter((d) => (d.decision === 'buy' || d.decision === 'substitute') && d.product);
  const unresolved = decisions.filter((d) => d.decision === 'cannot_complete');
  return { onHand, substitutions, purchases, unresolved };
}

module.exports = { slugify, categorizeDecisions };
