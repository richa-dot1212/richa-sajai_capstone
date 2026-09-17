const { EventEmitter } = require('events');
const { McpClient } = require('./mcpClient');
const { InstamartClient } = require('./instamartClient');
const { callGemini } = require('./gemini');
const { loadSkill } = require('./skill');
const { scaleIngredients } = require('./servingSize');
const { runSelfCheck } = require('./selfCheck');
const { buildDocument, saveDocument } = require('./documentBuilder');

const RECIPE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    servings: { type: 'number' },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'string' },
        },
        required: ['name', 'quantity'],
      },
    },
    instructions: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'servings', 'ingredients', 'instructions'],
};

const ROLE_SCHEMA = {
  type: 'object',
  properties: {
    functionalRole: { type: 'string' },
    substituteCandidate: { type: 'string' },
    substituteLikelyAlreadyOwned: { type: 'boolean' },
    substituteRationale: { type: 'string' },
    recipeImpactIfSubstituted: { type: 'string' },
  },
  required: ['functionalRole', 'substituteCandidate', 'substituteLikelyAlreadyOwned', 'substituteRationale', 'recipeImpactIfSubstituted'],
};

const DECISION_SCHEMA = {
  type: 'object',
  properties: {
    decision: { type: 'string', enum: ['substitute', 'buy', 'cannot_complete'] },
    reasoning: { type: 'string' },
  },
  required: ['decision', 'reasoning'],
};

/**
 * Fetch a recipe page's content, paging past leading boilerplate/ad
 * scripts (a real, documented issue from PR 1's testing) until a chunk
 * containing recognizable recipe markers is found or the page is
 * exhausted.
 */
async function fetchRecipeMarkdown(fetchClient, url, emit) {
  const CHUNK = 30000;
  const MAX_ATTEMPTS = 12;
  let startIndex = 0;
  let combined = '';
  let previousChunk = '';
  let relevantChunk = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = await fetchClient.callTool('fetch_url', {
      url,
      max_length: CHUNK,
      start_index: startIndex,
    });
    const text = result.content && result.content[0] && result.content[0].text;
    if (!text) break;
    const contentStart = text.indexOf('Content:');
    const chunkText = contentStart !== -1 ? text.slice(contentStart + 8) : text;
    combined += chunkText;
    emit('observe', `Fetched ${chunkText.length} chars starting at index ${startIndex}`);
    // Ad-tech boilerplate on some sites contains the word "ingredient" and
    // stray unit-like substrings inside CSS selectors/JS (a real issue
    // found in PR 1's testing), so require several markdown-list lines
    // that actually look like "<amount> <unit> <ingredient>" -- a much
    // stronger signal that this chunk holds the real ingredient list.
    const ingredientLineMatches = chunkText.match(
      /^\s*[-*\d][.)]?\s+.{0,10}\b(cup|cups|tsp|teaspoon|tbsp|tablespoon|gram|grams|oz|ounce|ounces|ml|lb|pound|pounds)\b/gim
    );
    if (ingredientLineMatches && ingredientLineMatches.length >= 3) {
      // Ingredients may start near the tail of the previous chunk and
      // continue into this one -- keep both, not the whole accumulated
      // (mostly-boilerplate) `combined` string.
      relevantChunk = previousChunk + chunkText;
      break;
    }
    const remainingMatch = text.match(/Remaining content length: (\d+)/);
    const remaining = remainingMatch ? Number(remainingMatch[1]) : 0;
    previousChunk = chunkText;
    if (remaining <= 0) break;
    startIndex += CHUNK;
  }
  return relevantChunk || combined.slice(-CHUNK * 2);
}

function runWorkflow(input) {
  const emitter = new EventEmitter();
  const log = [];
  const emit = (phase, message, data) => {
    const entry = { phase, message, data, at: new Date().toISOString() };
    log.push(entry);
    emitter.emit('progress', entry);
  };

  const promise = (async () => {
    const skillText = loadSkill();
    const fetchClient = new McpClient('fetch');
    const instamart = new InstamartClient();

    let addressId = null;
    const state = {
      input,
      recipe: null,
      missingIngredients: [],
      decisions: [],
      cart: [],
      spentSoFar: 0,
      warnings: [],
    };

    try {
      // ---- PERCEIVE: retrieve the recipe ----
      emit('perceive', `Retrieving recipe from ${input.recipeUrl} via Fetch MCP`);
      await fetchClient.start();
      const markdown = await fetchRecipeMarkdown(fetchClient, input.recipeUrl, emit);
      emit('observe', `Retrieved ${markdown.length} characters of recipe content`);

      // ---- REASON: understand the recipe ----
      emit('reason', 'Asking Gemini to parse the recipe into structured ingredients/instructions');
      const recipe = await callGemini({
        systemInstruction:
          'You extract structured recipe data from raw fetched web page text (which may include ' +
          'leftover boilerplate). Return only the real recipe title, its stated serving size ' +
          '(a number; guess a reasonable default like 4 if not stated), its ingredient list ' +
          '(name + quantity as written), and its numbered cooking instructions.',
        prompt: `Recipe page content:\n\n${markdown.slice(0, 45000)}`,
        responseSchema: RECIPE_SCHEMA,
      });
      state.recipe = recipe;
      emit('observe', `Parsed recipe "${recipe.title}" (${recipe.ingredients.length} ingredients, serves ${recipe.servings})`);

      // ---- ACT/OBSERVE: diff against owned ingredients ----
      emit('act', 'Comparing recipe ingredients against ingredients already on hand');
      const owned = input.ownedIngredients.map((s) => s.toLowerCase().trim());
      const missing = recipe.ingredients.filter((ing) => {
        const name = ing.name.toLowerCase();
        return !owned.some((o) => o && (name.includes(o) || o.includes(name)));
      });
      state.missingIngredients = missing;
      emit('observe', `Missing ingredients: ${missing.map((m) => m.name).join(', ') || '(none)'}`);

      if (missing.length > 0) {
        emit('act', 'Resolving Instamart delivery address for product search/cart');
        await instamart.init();
        const addrResult = await instamart.callTool('get_addresses', {});
        const addresses = addrResult.structuredContent && addrResult.structuredContent.addresses;
        addressId = addresses && addresses[0] && addresses[0].id;
        emit('observe', addressId ? 'Resolved a delivery address' : 'No saved address found');
      }

      let remainingBudget = Number(input.budget);
      const boughtItems = []; // { ingredient, product, cost, cartArgs }

      // ---- Per-ingredient PERCEIVE -> REASON -> ACT -> OBSERVE loop ----
      for (const ingredient of missing) {
        emit('reason', `Evaluating missing ingredient "${ingredient.name}" using the Recipe Budget Skill`);
        const role = await callGemini({
          systemInstruction: skillText,
          prompt:
            `Recipe: "${recipe.title}"\nInstructions:\n${recipe.instructions.join('\n')}\n\n` +
            `Missing ingredient: "${ingredient.name}" (recipe calls for ${ingredient.quantity}).\n` +
            'Apply the Skill above: identify its functional role in this specific recipe, propose ' +
            'one concrete substitute candidate, say whether that substitute is something typically ' +
            'already on hand versus something that would need buying, and describe the recipe-level ' +
            'impact if substituted.',
          responseSchema: ROLE_SCHEMA,
        });
        emit('observe', `Role: ${role.functionalRole}. Candidate substitute: ${role.substituteCandidate}`);

        // ACT: real Instamart lookups for the original ingredient (and the
        // substitute too, if it isn't something typically already owned).
        let originalProduct = null;
        let substituteProduct = null;
        if (addressId) {
          emit('act', `Searching Instamart for "${ingredient.name}"`);
          const searchRes = await instamart.callTool('search_products', { query: ingredient.name, addressId });
          originalProduct = extractTopProduct(searchRes);
          emit('observe', originalProduct
            ? `Found "${originalProduct.displayName}" for ₹${originalProduct.offerPrice}`
            : 'No matching product found on Instamart');

          if (!role.substituteLikelyAlreadyOwned) {
            emit('act', `Searching Instamart for substitute "${role.substituteCandidate}"`);
            const subSearchRes = await instamart.callTool('search_products', { query: role.substituteCandidate, addressId });
            substituteProduct = extractTopProduct(subSearchRes);
            emit('observe', substituteProduct
              ? `Found substitute "${substituteProduct.displayName}" for ₹${substituteProduct.offerPrice}`
              : 'No matching substitute product found on Instamart');
          }
        }

        // REASON: real decision, grounded in real prices and real remaining budget.
        emit('reason', `Deciding substitute-vs-buy for "${ingredient.name}" (remaining budget ₹${remainingBudget})`);
        const decision = await callGemini({
          systemInstruction: skillText,
          prompt:
            `Missing ingredient: "${ingredient.name}".\n` +
            `Functional role: ${role.functionalRole}.\n` +
            `Substitute candidate: ${role.substituteCandidate} (${role.substituteLikelyAlreadyOwned ? 'likely already owned' : 'would need buying'}).\n` +
            `Recipe impact if substituted: ${role.recipeImpactIfSubstituted}.\n` +
            `Original ingredient on Instamart: ${originalProduct ? `${originalProduct.displayName}, ₹${originalProduct.offerPrice}` : 'not found'}.\n` +
            `Substitute on Instamart: ${substituteProduct ? `${substituteProduct.displayName}, ₹${substituteProduct.offerPrice}` : role.substituteLikelyAlreadyOwned ? 'not needed, already owned' : 'not found'}.\n` +
            `Remaining budget: ₹${remainingBudget} (this is the total left across ALL remaining missing ingredients, not just this one).\n` +
            'Apply the Skill above. Decide: "substitute", "buy" (the original ingredient), or ' +
            '"cannot_complete" if neither is reasonable within budget or compatibility.',
          responseSchema: DECISION_SCHEMA,
        });
        emit('observe', `Decision: ${decision.decision} -- ${decision.reasoning}`);

        const record = {
          ingredient: ingredient.name,
          quantity: ingredient.quantity,
          role: role.functionalRole,
          decision: decision.decision,
          reasoning: decision.reasoning,
          substituteCandidate: role.substituteCandidate,
          product: null,
          cost: 0,
        };

        if (decision.decision === 'buy' && originalProduct) {
          const cost = originalProduct.offerPrice;
          if (cost > remainingBudget) {
            // ---- BUDGET LOOP: this purchase would exceed the remaining
            // budget -- reconsider this ingredient as a substitute instead
            // of forcing an overspend.
            emit('reason', `"${ingredient.name}" (₹${cost}) would exceed remaining budget ₹${remainingBudget} -- reconsidering as substitute`);
            record.decision = role.substituteLikelyAlreadyOwned || substituteProduct ? 'substitute' : 'cannot_complete';
            record.reasoning += ` Reconsidered: buying would have exceeded the remaining budget (₹${cost} > ₹${remainingBudget}).`;
          } else {
            emit('act', `Adding "${originalProduct.displayName}" to Instamart cart`);
            await instamart.callTool('update_cart', {
              selectedAddressId: addressId,
              items: [{ spinId: originalProduct.spinId, skuId: originalProduct.skuId, quantity: 1 }],
            });
            emit('observe', `Added to cart: ${originalProduct.displayName} (₹${cost})`);
            record.product = originalProduct;
            record.cost = cost;
            remainingBudget -= cost;
            boughtItems.push(record);
          }
        }

        state.decisions.push(record);
      }

      state.spentSoFar = boughtItems.reduce((sum, b) => sum + b.cost, 0);

      // ---- Deterministic serving-size scaling (plain code, not the LLM) ----
      emit('act', `Scaling ingredient quantities from ${recipe.servings} to ${input.servingSize} servings`);
      const scaled = scaleIngredients(recipe.ingredients, recipe.servings, input.servingSize);
      state.scaledIngredients = scaled;

      // ---- Self-consistency check, with automatic correction ----
      emit('reason', 'Running self-consistency check on the assembled result');
      const checkResult = runSelfCheck(state, input);
      if (checkResult.corrections.length) {
        emit('observe', `Self-check found and corrected: ${checkResult.corrections.join('; ')}`);
      } else {
        emit('observe', 'Self-check passed with no corrections needed');
      }

      // ---- Generate + save the final document ----
      emit('act', 'Generating personalized recipe document');
      const documentMarkdown = buildDocument(state, input);
      const savedPath = saveDocument(documentMarkdown, recipe.title);
      emit('observe', `Saved personalized recipe to ${savedPath}`);

      fetchClient.close();

      return { state, documentMarkdown, savedPath, log };
    } catch (err) {
      emit('error', err.message);
      try { fetchClient.close(); } catch {}
      throw err;
    }
  })();

  return { emitter, promise, log };
}

function extractTopProduct(searchResult) {
  const jsonPart = searchResult.content && searchResult.content[1] && searchResult.content[1].text;
  if (!jsonPart) return null;
  try {
    const parsed = JSON.parse(jsonPart);
    const p = parsed.products && parsed.products[0];
    if (!p) return null;
    const v = p.variations && p.variations[0];
    if (!v) return null;
    return {
      displayName: v.displayName || p.displayName,
      offerPrice: v.price ? v.price.offerPrice : null,
      mrp: v.price ? v.price.mrp : null,
      spinId: v.spinId,
      skuId: v.skuId,
      quantityDescription: v.quantityDescription,
    };
  } catch {
    return null;
  }
}

module.exports = { runWorkflow };
