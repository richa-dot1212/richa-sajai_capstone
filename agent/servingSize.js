// Deterministic quantity scaling -- plain arithmetic, never delegated to the
// LLM. Parses a leading numeric quantity (including simple fractions and
// mixed numbers) off an ingredient's quantity string and scales it.

function parseLeadingNumber(str) {
  const s = String(str).trim();
  // mixed number e.g. "1 1/2"
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)\b(.*)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    return { value: whole + num / den, rest: mixed[4].trim() };
  }
  // simple fraction e.g. "3/4"
  const frac = s.match(/^(\d+)\/(\d+)\b(.*)$/);
  if (frac) {
    const num = Number(frac[1]);
    const den = Number(frac[2]);
    return { value: num / den, rest: frac[3].trim() };
  }
  // decimal/integer e.g. "1.5", "2"
  const dec = s.match(/^(\d+(?:\.\d+)?)\b(.*)$/);
  if (dec) {
    return { value: Number(dec[1]), rest: dec[2].trim() };
  }
  return null;
}

function formatNumber(n) {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Scale a quantity string (e.g. "1 1/2 cups", "2 tsp", "3") by a ratio.
 * Returns the scaled string unchanged in unit, only the leading number
 * changes. If no leading number is found, returns the original string
 * untouched (nothing to scale).
 */
function scaleQuantityString(quantityStr, ratio) {
  if (!quantityStr) return quantityStr;
  const parsed = parseLeadingNumber(quantityStr);
  if (!parsed) return quantityStr;
  const scaled = parsed.value * ratio;
  return `${formatNumber(scaled)}${parsed.rest ? ' ' + parsed.rest : ''}`.trim();
}

function scaleIngredients(ingredients, originalServings, targetServings) {
  const ratio = Number(targetServings) / Number(originalServings || targetServings || 1);
  return ingredients.map((ing) => ({
    ...ing,
    originalQuantity: ing.quantity,
    quantity: scaleQuantityString(ing.quantity, ratio),
  }));
}

module.exports = { scaleQuantityString, scaleIngredients, parseLeadingNumber, formatNumber };
