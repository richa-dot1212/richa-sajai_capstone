const { EventEmitter } = require('events');
const { McpClient } = require('./mcpClient');
const { InstamartClient } = require('./instamartClient');
const { callLLM } = require('./llm');
const { loadSkill } = require('./skill');
const { scaleIngredients } = require('./servingSize');
const { runSelfCheck } = require('./selfCheck');
const { buildDocument, saveDocument } = require('./documentBuilder');
const { decideSubstituteOrBuy } = require('./decision');

// The 4 stages shown on the website -- everything underneath (the real
// perceive/reason/act/observe steps) still happens and is still logged via
// `emit`, just not rendered as a growing list in the UI.
const STAGES = [
  { key: 'understand', label: 'Understanding recipe' },
  { key: 'check', label: 'Checking ingredients and budget' },
  { key: 'resolve', label: 'Finding/substituting ingredients' },
  { key: 'ready', label: 'Recipe ready' },
];

class RecipeParseError extends Error {}

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

// One LLM call per missing ingredient -- a genuine perceive/reason/act/
// observe loop, not one upfront prompt that decides everything before any
// real Instamart data exists. This used to be a single batched call
// covering every missing ingredient at once (to survive Gemini's
// 20-requests/day free-tier quota); now on Groq, call-count minimization
// is no longer the design goal -- correct, per-ingredient agentic
// reasoning is. The decision itself (substitute vs. buy vs. unresolved)
// still never uses the LLM -- that stays deterministic in
// agent/decision.js, grounded in real prices once they're known.
const INGREDIENT_REASONING_SCHEMA = {
  type: 'object',
  properties: {
    functionalRole: { type: 'string' },
    // A plain-language sentence for the end user, e.g. "Butter is used
    // here to provide fat and richness and help create the intended
    // texture." -- not just an internal category label.
    roleExplanation: { type: 'string' },
    // True for a recipe's defining/central ingredient (e.g. the named
    // protein). An essential ingredient should not have an unrelated
    // substitute invented for it -- see the prompt below for the
    // requestedChanges carve-out.
    isEssential: { type: 'boolean' },
    // '' when isEssential is true and no dietary transformation was
    // requested -- there is deliberately no substitute to search for.
    substituteCandidate: { type: 'string' },
    substituteIsCompatible: { type: 'boolean' },
    substituteRationale: { type: 'string' },
  },
  required: [
    'functionalRole',
    'roleExplanation',
    'isEssential',
    'substituteCandidate',
    'substituteIsCompatible',
    'substituteRationale',
  ],
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
    const ingredientLineMatches = chunkText.match(
      /^\s*[-*\d][.)]?\s+.{0,10}\b(cup|cups|tsp|teaspoon|tbsp|tablespoon|gram|grams|oz|ounce|ounces|ml|lb|pound|pounds)\b/gim
    );
    if (ingredientLineMatches && ingredientLineMatches.length >= 3) {
      // Use just the chunk the ingredient lines actually matched in (not
      // padded with the whole previous chunk) -- keeps the LLM prompt
      // small enough for Groq's per-minute token limit while still
      // reliably including the real ingredient list.
      relevantChunk = chunkText;
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

const INGREDIENT_LINE_PATTERN =
  /^\s*[-*\d][.)]?\s+.{0,10}\b(cup|cups|tsp|teaspoon|tbsp|tablespoon|gram|grams|oz|ounce|ounces|ml|lb|pound|pounds)\b/im;

/**
 * Cap content sent to the LLM to a token-budget-friendly size, but window
 * it around wherever the ingredient list actually starts rather than
 * blindly taking the first N characters -- a real bug found in testing:
 * shrinking the flat prefix to fit Groq's per-minute token limit clipped
 * straight past the ingredient section on some pages, since a match found
 * earlier (in fetchRecipeMarkdown) can still be many thousands of
 * characters into the returned chunk.
 */
function windowAroundIngredients(content, maxLen) {
  if (content.length <= maxLen) return content;
  const matchIndex = content.search(INGREDIENT_LINE_PATTERN);
  if (matchIndex === -1) return content.slice(0, maxLen);
  const start = Math.max(0, matchIndex - 1500);
  return content.slice(start, start + maxLen);
}

/**
 * Best-effort extraction of the recipe's own photo (og:image, falling back
 * to twitter:image) from a bounded raw-HTML fetch. Real-world sites vary a
 * lot here: some serve it immediately, some (heavily ad-bloated pages, or
 * client-side-rendered sites) don't within a reasonable fetch bound. This
 * must never affect the rest of the run either way -- a missing image is a
 * perfectly fine outcome, so every failure path just returns null.
 */
async function fetchOgImage(fetchClient, url, emit) {
  try {
    const result = await fetchClient.callTool('fetch_url', { url, raw: true, max_length: 50000, start_index: 0 });
    const text = result.content && result.content[0] && result.content[0].text;
    if (!text) return null;
    const match =
      text.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
      text.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i) ||
      text.match(/<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
      text.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
    if (match) {
      emit('observe', `Found a recipe photo: ${match[1]}`);
      return match[1];
    }
    emit('observe', 'No recipe photo found on the page (not unusual -- varies a lot by site)');
    return null;
  } catch (err) {
    emit('observe', `Could not check for a recipe photo (${err.message}) -- continuing without one`);
    return null;
  }
}

function runWorkflow(input, context = {}) {
  const emitter = new EventEmitter();
  const log = [];
  const emit = (phase, message, data) => {
    const entry = { phase, message, data, at: new Date().toISOString() };
    log.push(entry);
    emitter.emit('progress', entry);
  };
  const emitStage = (key) => {
    emitter.emit('stage', key);
  };

  const promise = (async () => {
    // Yield one microtask before doing anything else. Without this, the
    // very first emit()/emitStage() calls below fire synchronously as
    // part of this runWorkflow() call itself, before the caller (server.js,
    // the CLI) gets a chance to attach its `.on()` listeners -- so the
    // first event is silently dropped. This one-line deferral guarantees
    // listeners are attached first.
    await Promise.resolve();

    const skillText = loadSkill();
    const fetchClient = new McpClient('fetch');
    // Each visitor to the deployed site has their own Swiggy login, keyed
    // by their own session id (agent/session.js) -- a real bug found
    // after deploying to Railway, where one shared global login meant
    // every visitor saw whoever connected first as "already connected".
    const instamart = new InstamartClient(context.userSessionId || require('crypto').randomUUID());

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
      // ==== STAGE 1: Understanding recipe ====
      emitStage('understand');
      let recipeContent;
      if (input.recipeText) {
        emit('perceive', 'Using the recipe text you pasted directly (skipping the Fetch MCP)');
        recipeContent = input.recipeText;
        state.imageUrl = null; // nothing to pull a photo from -- pasted text, not a page
      } else {
        emit('perceive', `Retrieving recipe from ${input.recipeUrl} via Fetch MCP`);
        await fetchClient.start();
        recipeContent = await fetchRecipeMarkdown(fetchClient, input.recipeUrl, emit);
        emit('observe', `Retrieved ${recipeContent.length} characters of recipe content`);
        state.imageUrl = await fetchOgImage(fetchClient, input.recipeUrl, emit);
      }

      emit('reason', 'Asking the LLM to parse the recipe into structured ingredients/instructions');
      const recipe = await callLLM({
        systemInstruction:
          'You extract structured recipe data from raw recipe content (which, if fetched from a ' +
          'web page, may include leftover boilerplate). Return only the real recipe title, its ' +
          'stated serving size (a number; guess a reasonable default like 4 if not stated), its ' +
          'ingredient list (name + quantity as written), and its numbered cooking instructions. ' +
          'If the content does not actually contain a real recipe, return an empty ingredients ' +
          'array and an empty instructions array rather than guessing.',
        prompt: `Recipe content:\n\n${windowAroundIngredients(recipeContent, 10000)}`,
        responseSchema: RECIPE_SCHEMA,
      });

      // ---- Graceful handling of garbage/empty AI output (a real failure
      // mode seen in testing: a non-recipe page produced "Unknown Recipe"
      // with 0 ingredients, which was then silently saved as a document).
      if (!recipe.ingredients || recipe.ingredients.length === 0 || !recipe.title || /unknown recipe/i.test(recipe.title)) {
        throw new RecipeParseError(
          input.recipeText
            ? "Couldn't find a real recipe in the text you pasted. Double-check it includes ingredients and instructions."
            : "Couldn't find a real recipe at that URL. Double-check the link points directly to a recipe page."
        );
      }
      state.recipe = recipe;
      emit('observe', `Parsed recipe "${recipe.title}" (${recipe.ingredients.length} ingredients, serves ${recipe.servings})`);

      // ==== STAGE 2: Checking ingredients and budget ====
      emitStage('check');
      emit('act', "Matching the ingredients you said you're missing against the recipe");
      const missing = matchMissingIngredients(input.missingIngredients, recipe.ingredients);
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
      const boughtItems = [];

      // ==== STAGE 3: Finding/substituting ingredients ====
      emitStage('resolve');

      for (const ingredient of missing) {
        // REASON: one LLM call for this specific ingredient, in the
        // context of this specific recipe -- not a batch judgment made
        // before any Instamart data exists. requestedChanges is passed in
        // here so the model knows whether a dietary transformation was
        // actually asked for; that's the one thing that should ever make
        // an essential/defining ingredient substitutable.
        emit('reason', `Reasoning about "${ingredient.name}" using the Recipe Budget Skill`);
        let role;
        try {
          role = await callLLM({
            systemInstruction: skillText,
            prompt:
              `Recipe: "${recipe.title}"\nInstructions:\n${recipe.instructions.join('\n').slice(0, 3000)}\n\n` +
              `Missing ingredient: "${ingredient.name}" (recipe calls for ${ingredient.quantity})\n` +
              `User's requested changes (may be empty): "${input.requestedChanges || ''}"\n\n` +
              'Apply the Skill above to this one ingredient: identify its functional role in this specific ' +
              'recipe and explain that role in one or two plain sentences for the end user. Then decide ' +
              'whether it is essential/defining for this dish (isEssential) -- if so, do not invent an ' +
              'unrelated substitute unless the requested changes above actually call for a transformation ' +
              '(vegetarian, vegan, dairy-free, etc.) that requires substituting it; in that case leave ' +
              'substituteCandidate empty. Otherwise propose one concrete substitute candidate and judge ' +
              'whether it is actually compatible (preserves the role well enough) in this recipe. Every ' +
              'substitute will be sourced fresh via Instamart -- never assume the user already has it on hand.',
            responseSchema: INGREDIENT_REASONING_SCHEMA,
          });
        } catch (err) {
          emit('observe', `Reasoning failed for "${ingredient.name}" (${err.message}) -- treating as essential with no substitute`);
          role = {
            functionalRole: 'unclear',
            roleExplanation: `Could not determine ${ingredient.name}'s role in this recipe.`,
            isEssential: true,
            substituteCandidate: '',
            substituteIsCompatible: false,
            substituteRationale: 'Reasoning step failed, so no substitute was proposed.',
          };
        }
        emit('observe', `"${ingredient.name}" role: ${role.functionalRole}${role.isEssential ? ' (essential -- no substitute will be searched for)' : `. Candidate substitute: ${role.substituteCandidate}`}`);

        // ACT: real Instamart lookups (plain code, no LLM involved).
        let originalProduct = null;
        let substituteProduct = null;
        if (addressId) {
          const originalQuery = cleanForSearch(ingredient.name);
          emit('act', `Searching Instamart for "${originalQuery}"`);
          const searchRes = await instamart.callTool('search_products', { query: originalQuery, addressId });
          originalProduct = extractTopProduct(searchRes);
          emit('observe', originalProduct
            ? `Found "${originalProduct.displayName}" for ₹${originalProduct.offerPrice}`
            : 'No matching product found on Instamart');

          // Only search for a substitute when one was actually proposed --
          // an essential ingredient with no substitute candidate has
          // nothing worth searching for, and searching anyway risks
          // returning an irrelevant product for a nonsense query.
          if (role.substituteCandidate) {
            const substituteQuery = cleanForSearch(role.substituteCandidate);
            emit('act', `Searching Instamart for substitute "${substituteQuery}"`);
            const subSearchRes = await instamart.callTool('search_products', { query: substituteQuery, addressId });
            substituteProduct = extractTopProduct(subSearchRes);
            emit('observe', substituteProduct
              ? `Found substitute "${substituteProduct.displayName}" for ₹${substituteProduct.offerPrice}`
              : 'No matching substitute product found on Instamart');
          }
        }

        // REASON AGAIN: deterministic decision (agent/decision.js)
        // grounded in the LLM's compatibility judgment plus real
        // prices/budget -- arithmetic and comparisons never go through
        // the LLM.
        const decision = decideSubstituteOrBuy({
          substituteIsCompatible: role.substituteIsCompatible,
          substituteCandidate: role.substituteCandidate,
          originalProduct,
          substituteProduct,
          remainingBudget,
        });
        emit('observe', `Decision for "${ingredient.name}": ${decision.decision} -- ${decision.reasoning}`);

        const record = {
          ingredient: ingredient.name,
          quantity: ingredient.quantity,
          role: role.functionalRole,
          roleExplanation: role.roleExplanation,
          isEssential: role.isEssential,
          decision: decision.decision,
          reasoning: decision.reasoning,
          substituteCandidate: role.substituteCandidate,
          substituteRationale: role.substituteRationale,
          // Both real product lookups are kept in full (not just the one
          // chosen), so a later user override can add "the other" option
          // without re-searching Instamart.
          originalProduct,
          substituteProduct,
          product: null,
          cost: 0,
        };

        // ACT: whichever product the decision settled on -- the original
        // if buying, or the substitute if substituting -- actually gets
        // added to the real Instamart cart. Substituting is never treated
        // as "you already have it"; it's a real product to source too.
        const productToBuy = decision.decision === 'buy' ? originalProduct
          : decision.decision === 'substitute' ? substituteProduct
          : null;

        if (productToBuy) {
          emit('act', `Adding "${productToBuy.displayName}" to Instamart cart`);
          await instamart.callTool('update_cart', {
            selectedAddressId: addressId,
            items: [{ spinId: productToBuy.spinId, skuId: productToBuy.skuId, quantity: 1 }],
          });
          // OBSERVE: confirm the cart action, then update the remaining
          // budget deterministically before moving to the next ingredient.
          emit('observe', `Added to cart: ${productToBuy.displayName} (₹${productToBuy.offerPrice})`);
          record.product = productToBuy;
          record.cost = productToBuy.offerPrice;
          remainingBudget -= productToBuy.offerPrice;
          boughtItems.push(record);
        }

        state.decisions.push(record);
      }

      state.spentSoFar = boughtItems.reduce((sum, b) => sum + b.cost, 0);

      emit('act', `Scaling ingredient quantities from ${recipe.servings} to ${input.servingSize} servings`);
      const scaled = scaleIngredients(recipe.ingredients, recipe.servings, input.servingSize);
      state.scaledIngredients = scaled;

      emit('reason', 'Running self-consistency check on the assembled result');
      const checkResult = runSelfCheck(state, input);
      if (checkResult.corrections.length) {
        emit('observe', `Self-check found and corrected: ${checkResult.corrections.join('; ')}`);
      } else {
        emit('observe', 'Self-check passed with no corrections needed');
      }

      // ==== STAGE 4: Recipe ready ====
      emitStage('ready');
      emit('act', 'Generating personalized recipe document');
      const documentMarkdown = buildDocument(state, input);
      const savedPath = saveDocument(documentMarkdown, recipe.title);
      emit('observe', `Saved personalized recipe to ${savedPath}`);

      fetchClient.close();

      const summary = buildSummary(state);
      // addressId is returned alongside state so a later user override
      // (server.js's /override route) can add a different real product to
      // the same cart without re-resolving the delivery address.
      return { state, documentMarkdown, savedPath, summary, log, addressId };
    } catch (err) {
      emit('error', err.message);
      try { fetchClient.close(); } catch {}
      throw err;
    }
  })();

  return { emitter, promise, log };
}

/**
 * The user now states missing ingredients directly (fixes a real bug: a
 * fuzzy "owned ingredients" diff previously mismatched "eggs" against
 * "large egg + 1 egg yolk"). This just needs to find each stated missing
 * ingredient's corresponding recipe entry for its real quantity.
 */
function matchMissingIngredients(missingNames, recipeIngredients) {
  const result = [];
  for (const rawName of missingNames) {
    const name = rawName.toLowerCase().trim();
    if (!name) continue;
    const match = recipeIngredients.find((ing) => {
      const ingName = ing.name.toLowerCase();
      return ingName.includes(name) || name.includes(ingName);
    });
    result.push(match || { name: rawName.trim(), quantity: '' });
  }
  return result;
}

function buildSummary(state) {
  const substitutions = state.decisions.filter((d) => d.decision === 'substitute');
  // Both a literal "buy the original" and a "substitute" that was actually
  // sourced via Instamart show up in the cart summary -- substituting
  // never means "assume it's already in the kitchen."
  const purchases = state.decisions.filter((d) => (d.decision === 'buy' || d.decision === 'substitute') && d.product);
  const unresolved = state.decisions.filter((d) => d.decision === 'cannot_complete');

  // The full ingredient list (already computed for the saved document) is
  // exposed here too, with a per-ingredient note when it was substituted,
  // bought, or couldn't be resolved -- purely additive data for the
  // website's ingredients tab, no change to how any decision is made.
  const decisionByIngredient = new Map(state.decisions.map((d) => [d.ingredient.toLowerCase(), d]));
  const ingredients = state.scaledIngredients.map((ing) => {
    const decision = decisionByIngredient.get(ing.name.toLowerCase());
    let note = null;
    if (decision) {
      if (decision.decision === 'substitute') note = `Substituted with ${decision.substituteCandidate}`;
      else if (decision.decision === 'buy') note = 'Bought via Instamart';
      else if (decision.decision === 'cannot_complete') note = 'Could not be resolved within budget';
    }
    return { name: ing.name, quantity: ing.quantity, note };
  });

  // One entry per missing ingredient with everything the result screen
  // needs to show the actual reasoning (role, substitution explanation,
  // real price comparison, the automatic decision) and to let the user
  // override it afterward -- additive alongside `ingredients`/
  // `substitutions`/`cartItems`/`unresolved` above, which are unchanged.
  const ingredientDecisions = state.decisions.map((d) => ({
    ingredient: d.ingredient,
    functionalRole: d.role,
    roleExplanation: d.roleExplanation || '',
    isEssential: !!d.isEssential,
    substituteCandidate: d.substituteCandidate || '',
    substituteRationale: d.substituteRationale || '',
    originalPrice: d.originalProduct ? d.originalProduct.offerPrice : null,
    substitutePrice: d.substituteProduct ? d.substituteProduct.offerPrice : null,
    decision: d.decision,
    reasoning: d.reasoning,
    chosenProduct: d.product ? d.product.displayName : null,
    // What the "other" override button would add, if that option was ever
    // actually found on Instamart -- null means there's nothing to offer.
    canAddOriginal: !!d.originalProduct,
    canAddSubstitute: !!d.substituteProduct,
  }));

  return {
    title: state.recipe.title,
    servings: Number(state.input.servingSize),
    imageUrl: state.imageUrl || null,
    ingredients,
    instructions: state.finalInstructions,
    missingIngredients: state.missingIngredients.map((m) => m.name),
    substitutions: substitutions.map((s) => ({ ingredient: s.ingredient, substitute: s.substituteCandidate, reasoning: s.reasoning })),
    cartItems: purchases.map((p) => ({ ingredient: p.ingredient, product: p.product.displayName, cost: p.cost })),
    unresolved: unresolved.map((u) => ({ ingredient: u.ingredient, reasoning: u.reasoning })),
    ingredientDecisions,
    totalCost: state.spentSoFar,
    budget: Number(state.input.budget),
  };
}

// Ingredient names and substitute candidates often carry recipe-specific
// phrasing (prep notes, brand suggestions) that makes a poor e-commerce
// search query -- e.g. "unsalted butter, melted & cooled for 5 minutes"
// or "unsalted margarine (e.g., Earth Balance), melted and cooled". A real
// bug: searching that verbatim for a substitute can return the exact same
// (wrong) product as the original ingredient's own noisy query. Strip
// prep-instruction clauses and parenthetical asides before searching, per
// the Skill's own search-term guidance.
function cleanForSearch(name) {
  return name
    .replace(/\([^)]*\)/g, '') // parenthetical brand suggestions, e.g. "(e.g., Earth Balance)"
    .split(',')[0] // drop trailing prep clauses after the first comma
    .trim();
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

module.exports = { runWorkflow, RecipeParseError, STAGES, buildSummary };
