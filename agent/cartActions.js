// Real cart mutations, factored out so both the automatic per-ingredient
// loop (agent/workflow.js) and a later user override (server.js) add items
// to Instamart the exact same way.
//
// Creates and initializes a FRESH InstamartClient for every single cart
// mutation, rather than reusing one long-lived client across a whole run --
// a real bug fix from earlier testing (see git history). That fix alone
// turned out to be necessary but not sufficient: live testing after it
// shipped still showed only 1 of 3 automatically-"added" ingredients
// actually landing in the real cart. The remaining, much more likely
// explanation: "update_cart" is very plausibly a SET-cart-contents call,
// not an ADD-one-item call -- each automatic add in the per-ingredient loop
// was sending only `items: [{ that one product }]`, so each later call in
// the same run could silently overwrite (not append to) whatever the
// previous call had just put in the cart, leaving only the last one
// standing. That matches "only 1 of 3 survived" far better than a
// session-staleness theory. Fix: always read the current cart first and
// send the FULL merged item list on every update_cart call. This is safe
// even if update_cart actually is a true incremental upsert -- re-sending
// an unchanged existing item at the same quantity is a no-op either way.
const { InstamartClient } = require('./instamartClient');

// Best-effort parse of get_cart's response into a flat [{spinId, skuId,
// quantity}] list. Swiggy's Instamart MCP tools aren't consistent about
// response shape (get_addresses uses `structuredContent`, search_products
// buries JSON in `content[1].text`) and get_cart's exact shape has never
// actually been observed against a live account in this codebase -- so
// this tries every shape that's been seen elsewhere and fails open (empty
// array) rather than throwing, since a parse miss must never block a real
// add from being attempted.
function parseCartItems(cartResult) {
  try {
    const structured = cartResult.structuredContent;
    const rawItems =
      (structured && (structured.items || (structured.cart && structured.cart.items))) ||
      (() => {
        const jsonPart = cartResult.content && cartResult.content[1] && cartResult.content[1].text;
        if (!jsonPart) return null;
        const parsed = JSON.parse(jsonPart);
        return parsed.items || (parsed.cart && parsed.cart.items) || null;
      })();
    if (!Array.isArray(rawItems)) return [];
    return rawItems
      .map((it) => ({
        spinId: it.spinId || (it.product && it.product.spinId),
        skuId: it.skuId || (it.product && it.product.skuId),
        quantity: it.quantity || 1,
      }))
      .filter((it) => it.spinId || it.skuId);
  } catch {
    return [];
  }
}

async function readCartItems(client, addressId) {
  try {
    const result = await client.callTool('get_cart', { addressId, selectedAddressId: addressId });
    return parseCartItems(result);
  } catch (err) {
    // If get_cart itself isn't callable (wrong param name, tool doesn't
    // exist, etc.), fail open with an empty cart rather than blocking the
    // add -- worst case we're back to the old single-item behavior, not
    // worse than before this fix.
    console.log(`[cartActions] Could not read current cart before mutating it: ${err.message}`);
    return [];
  }
}

function mergeItem(items, product, quantity) {
  const withoutThis = items.filter((it) => it.spinId !== product.spinId);
  if (quantity > 0) withoutThis.push({ spinId: product.spinId, skuId: product.skuId, quantity });
  return withoutThis;
}

async function addToCart({ sessionId, addressId, product }) {
  const client = new InstamartClient(sessionId);
  await client.init();
  const currentItems = await readCartItems(client, addressId);
  const items = mergeItem(currentItems, product, 1);
  await client.callTool('update_cart', { selectedAddressId: addressId, items });
}

// Best-effort: assumes Swiggy's update_cart treats quantity: 0 as "remove",
// which is the common convention but isn't verified against the live API
// in this codebase. A failure here is the caller's problem to swallow --
// removal failing should never block the add that actually matters.
async function removeFromCart({ sessionId, addressId, product }) {
  const client = new InstamartClient(sessionId);
  await client.init();
  const currentItems = await readCartItems(client, addressId);
  const items = mergeItem(currentItems, product, 0);
  await client.callTool('update_cart', { selectedAddressId: addressId, items });
}

module.exports = { addToCart, removeFromCart };
