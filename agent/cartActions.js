// Real cart mutations, factored out so both the automatic per-ingredient
// loop (agent/workflow.js) and a later user override (server.js) add items
// to Instamart the exact same way.
//
// Deliberately creates and initializes a FRESH InstamartClient for every
// single cart mutation, rather than reusing one long-lived client across a
// whole run. This isn't a style choice -- it's a real bug fix: automatic
// cart-adds (which reused one client/session across the whole per-
// ingredient loop, after it had already made several prior search_products
// calls) were silently not landing in the real Swiggy cart, while the
// override route (which always created a fresh client right before its one
// update_cart call) worked reliably. The exact server-side cause on
// Swiggy's end isn't visible from here, but a fresh client per mutation
// matches the one code path that's confirmed to actually work.
const { InstamartClient } = require('./instamartClient');

async function addToCart({ sessionId, addressId, product }) {
  const client = new InstamartClient(sessionId);
  await client.init();
  await client.callTool('update_cart', {
    selectedAddressId: addressId,
    items: [{ spinId: product.spinId, skuId: product.skuId, quantity: 1 }],
  });
}

// Best-effort: assumes Swiggy's update_cart treats quantity: 0 as "remove",
// which is the common convention but isn't verified against the live API
// in this codebase. A failure here is the caller's problem to swallow --
// removal failing should never block the add that actually matters.
async function removeFromCart({ sessionId, addressId, product }) {
  const client = new InstamartClient(sessionId);
  await client.init();
  await client.callTool('update_cart', {
    selectedAddressId: addressId,
    items: [{ spinId: product.spinId, skuId: product.skuId, quantity: 0 }],
  });
}

module.exports = { addToCart, removeFromCart };
