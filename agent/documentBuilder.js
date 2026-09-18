const fs = require('fs');
const path = require('path');

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function buildDocument(state, input) {
  const { recipe, decisions, scaledIngredients, finalInstructions, spentSoFar, budgetExceeded } = state;

  const onHand = scaledIngredients.filter(
    (ing) => !decisions.some((d) => d.ingredient.toLowerCase() === ing.name.toLowerCase())
  );

  const substitutions = decisions.filter((d) => d.decision === 'substitute');
  const purchases = decisions.filter((d) => d.decision === 'buy' && d.product);
  const unresolved = decisions.filter((d) => d.decision === 'cannot_complete');

  const lines = [];
  lines.push(`# ${recipe.title} (Personalized)`);
  lines.push('');
  lines.push(`Adjusted for **${input.servingSize} servings** (original recipe served ${recipe.servings}). Budget: ₹${input.budget}.`);
  if (input.requestedChanges) lines.push(`Requested changes: ${input.requestedChanges}`);
  lines.push('');

  lines.push('## Ingredients you already have');
  if (onHand.length === 0) lines.push('_None -- every ingredient needed attention._');
  for (const ing of onHand) lines.push(`- ${ing.quantity} ${ing.name}`);
  lines.push('');

  lines.push('## Substitutions made');
  if (substitutions.length === 0) lines.push('_None._');
  for (const s of substitutions) {
    lines.push(`- **${s.ingredient}** → ${s.substituteCandidate}`);
    lines.push(`  - Reasoning: ${s.reasoning}`);
  }
  lines.push('');

  lines.push('## Ingredients purchased via Instamart');
  if (purchases.length === 0) lines.push('_None._');
  for (const p of purchases) {
    lines.push(`- **${p.ingredient}** — ${p.product.displayName} (${p.product.quantityDescription || ''}), ₹${p.cost}`);
    lines.push(`  - Reasoning: ${p.reasoning}`);
  }
  lines.push('');

  if (unresolved.length > 0) {
    lines.push('## Ingredients that could not reasonably be substituted or purchased within budget');
    for (const u of unresolved) {
      lines.push(`- **${u.ingredient}**: ${u.reasoning}`);
    }
    lines.push('');
  }

  lines.push('## Adjusted ingredient quantities');
  for (const ing of scaledIngredients) {
    lines.push(`- ${ing.quantity} ${ing.name}`);
  }
  lines.push('');

  lines.push('## Step-by-step instructions');
  finalInstructions.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  lines.push('');

  lines.push('## Budget summary');
  lines.push(`- Spent: ₹${spentSoFar}`);
  lines.push(`- Budget: ₹${input.budget}`);
  lines.push(`- Remaining: ₹${Math.max(0, Number(input.budget) - spentSoFar)}`);
  if (budgetExceeded) {
    lines.push(`- ⚠️ Total purchases exceeded the stated budget -- review before ordering.`);
  }
  lines.push('');

  return lines.join('\n');
}

function saveDocument(markdown, title) {
  const outDir = path.join(__dirname, '..', 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const filename = `${slugify(title)}-${Date.now()}.md`;
  const fullPath = path.join(outDir, filename);
  fs.writeFileSync(fullPath, markdown, 'utf8');
  return fullPath;
}

module.exports = { buildDocument, saveDocument, slugify };
