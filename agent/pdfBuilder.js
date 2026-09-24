// Renders the personalized recipe as an actual styled document (PDF via a
// headless browser) instead of the plain-Markdown output the site used to
// download. Reuses the site's own visual language (public/style.css's
// accent/paper tokens and vendored fonts) so the downloaded document
// doesn't introduce a third, unrelated look.
const fs = require('fs');
const path = require('path');
const { slugify, categorizeDecisions } = require('./documentBuilder');

// puppeteer@25 ships as an ESM-only package (no CommonJS build), while this
// whole project is deliberately plain CommonJS (no "type": "module" in
// package.json, every other file uses require()/module.exports) -- a
// top-level `require('puppeteer')` throws ERR_REQUIRE_ESM. A dynamic
// import() works from CommonJS regardless of the target module's format,
// so it's used here instead of converting this file (or the project) to
// ESM. Cached after the first call so every renderPdf() call after the
// first doesn't re-import.
let puppeteerPromise;
function loadPuppeteer() {
  if (!puppeteerPromise) puppeteerPromise = import('puppeteer').then((mod) => mod.default);
  return puppeteerPromise;
}

const FONTS_DIR = path.join(__dirname, '..', 'public', 'fonts');
// Embedded as base64 data URIs, not file:// URLs -- a page loaded via
// page.setContent() doesn't have a file:// origin, and Chrome silently
// refuses to load local files from CSS in that case ("Not allowed to load
// local resource"), which was the actual cause of the fonts failing and
// falling back to the CSS generic `cursive` family -- which Windows Chrome
// renders as Comic Sans MS. Inlining the font bytes sidesteps the whole
// local-resource restriction.
const fontDataUrl = (file) => {
  const data = fs.readFileSync(path.join(FONTS_DIR, file)).toString('base64');
  return `data:font/woff2;base64,${data}`;
};

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildDocumentHtml(state, input) {
  const { recipe, finalInstructions, scaledIngredients, spentSoFar, budgetExceeded, imageUrl } = state;
  const { onHand, substitutions, purchases, unresolved } = categorizeDecisions(state);

  const listOrNone = (items, render) =>
    items.length ? `<ul class="doc-list">${items.map(render).join('')}</ul>` : '<p class="doc-muted">None.</p>';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @font-face { font-family: 'Swung Note'; src: url('${fontDataUrl('swungnote-regular.woff2')}') format('woff2'); }
  @font-face { font-family: 'Anaktoria'; src: url('${fontDataUrl('anaktoria-regular.woff2')}') format('woff2'); }
  @font-face { font-family: 'Karla'; src: url('${fontDataUrl('karla-variable.woff2')}') format('woff2'); }

  :root {
    --paper: #fbf3e2;
    --accent: #1b4b84;
    --accent-strong: #1b4b84;
    --accent-tint: #dce7f4;
    --ink: #2b2620;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 40px 48px;
    background: var(--paper);
    color: var(--ink);
    font-family: 'Karla', system-ui, sans-serif;
    font-size: 13px;
    line-height: 1.5;
  }
  h1 {
    /* No generic cursive fallback -- if the embedded font ever failed to
       load, Chrome/Windows resolves that generic family to Comic Sans MS,
       which is exactly the bug this file fixes. Georgia is a safe last
       resort instead. */
    font-family: 'Swung Note', Georgia, serif;
    color: var(--accent-strong);
    font-size: 40px;
    margin: 0 0 4px;
  }
  h2 {
    font-family: 'Anaktoria', Georgia, serif;
    color: var(--accent-strong);
    font-size: 18px;
    border-bottom: 2px solid var(--accent-tint);
    padding-bottom: 4px;
    margin: 22px 0 8px;
  }
  .doc-meta { font-size: 13px; color: #55503f; margin-bottom: 4px; }
  .doc-header { display: flex; gap: 24px; align-items: flex-start; margin-bottom: 8px; }
  .doc-header img { width: 160px; height: 120px; object-fit: cover; border-radius: 10px; border: 1px solid var(--accent-tint); }
  .doc-list { margin: 0; padding-left: 20px; }
  .doc-list li { margin-bottom: 6px; }
  .doc-reasoning { color: #55503f; font-size: 12px; margin: 2px 0 0; }
  .doc-muted { color: #8a8471; font-style: italic; margin: 4px 0; }
  .doc-instructions { padding-left: 20px; }
  .doc-instructions li { margin-bottom: 8px; }
  .doc-budget { background: var(--accent-tint); border-radius: 10px; padding: 12px 16px; margin-top: 10px; }
  .doc-budget div { margin-bottom: 2px; }
  .doc-warning { color: #8a3b1f; font-weight: 700; }
</style>
</head>
<body>
  <div class="doc-header">
    <div>
      <h1>${escapeHtml(recipe.title)}</h1>
      <p class="doc-meta">Adjusted for <strong>${escapeHtml(String(input.servingSize))} servings</strong> (original recipe served ${escapeHtml(String(recipe.servings))}). Budget: ₹${escapeHtml(String(input.budget))}.</p>
      ${input.requestedChanges ? `<p class="doc-meta">Requested changes: ${escapeHtml(input.requestedChanges)}</p>` : ''}
    </div>
    ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" onerror="this.remove()" />` : ''}
  </div>

  <h2>Ingredients you already have</h2>
  ${listOrNone(onHand, (ing) => `<li>${escapeHtml(ing.quantity)} ${escapeHtml(ing.name)}</li>`)}

  <h2>Substitutions made</h2>
  ${listOrNone(substitutions, (s) => `<li><strong>${escapeHtml(s.ingredient)}</strong> → ${escapeHtml(s.substituteCandidate)}<p class="doc-reasoning">${escapeHtml(s.reasoning)}</p></li>`)}

  <h2>Ingredients purchased via Instamart</h2>
  ${listOrNone(purchases, (p) => `<li><strong>${escapeHtml(p.ingredient)}</strong> — ${escapeHtml(p.product.displayName)}${p.product.quantityDescription ? ` (${escapeHtml(p.product.quantityDescription)})` : ''}, ₹${escapeHtml(String(p.cost))}<p class="doc-reasoning">${escapeHtml(p.reasoning)}</p></li>`)}

  ${unresolved.length ? `<h2>Ingredients that could not reasonably be substituted or purchased within budget</h2>${listOrNone(unresolved, (u) => `<li><strong>${escapeHtml(u.ingredient)}</strong>: ${escapeHtml(u.reasoning)}</li>`)}` : ''}

  <h2>Adjusted ingredient quantities</h2>
  <ul class="doc-list">${scaledIngredients.map((ing) => `<li>${escapeHtml(ing.quantity)} ${escapeHtml(ing.name)}</li>`).join('')}</ul>

  <h2>Step-by-step instructions</h2>
  <ol class="doc-instructions">${finalInstructions.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>

  <h2>Budget summary</h2>
  <div class="doc-budget">
    <div>Spent: ₹${escapeHtml(String(spentSoFar))}</div>
    <div>Budget: ₹${escapeHtml(String(input.budget))}</div>
    <div>Remaining: ₹${escapeHtml(String(Math.max(0, Number(input.budget) - spentSoFar)))}</div>
    ${budgetExceeded ? '<div class="doc-warning">Total purchases exceeded the stated budget -- review before ordering.</div>' : ''}
  </div>
</body>
</html>`;
}

async function renderPdf(html) {
  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    // waitUntil: 'load' rather than 'networkidle0' -- a slow/broken remote
    // recipe photo (imageUrl points at the original site, not our own
    // server) must never hang the whole run; onerror="this.remove()" above
    // already handles the image failing to load at all.
    await page.setContent(html, { waitUntil: 'load', timeout: 15000 });
    // Embedded fonts decode asynchronously -- without this, page.pdf() can
    // fire before they're ready and fall back to a system font for that
    // first render.
    await page.evaluateHandle('document.fonts.ready');
    return await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20px', bottom: '20px', left: '0px', right: '0px' } });
  } finally {
    await browser.close();
  }
}

function saveDocumentPdf(buffer, title) {
  const outDir = path.join(__dirname, '..', 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const filename = `${slugify(title)}-${Date.now()}.pdf`;
  const fullPath = path.join(outDir, filename);
  fs.writeFileSync(fullPath, buffer);
  return fullPath;
}

module.exports = { buildDocumentHtml, renderPdf, saveDocumentPdf };
