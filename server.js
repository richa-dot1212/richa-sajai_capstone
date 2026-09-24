require('./agent/env').loadEnv();
const express = require('express');
const path = require('path');
const { randomUUID } = require('crypto');
const { runWorkflow, STAGES, buildSummary } = require('./agent/workflow');
const { InstamartClient } = require('./agent/instamartClient');
const swiggyOAuth = require('./agent/swiggyOAuth');
const { sessionMiddleware } = require('./agent/session');

const app = express();
// Railway (and most PaaS hosts) terminate TLS at a proxy in front of the
// container -- without this, req.protocol reports "http" even on the
// public https:// URL, which would build a redirect_uri Swiggy rejects.
app.set('trust proxy', true);
app.use(express.json());
// Every visitor gets their own session cookie -- this is what makes the
// Swiggy login per-user instead of one shared global login (a real bug
// found after deploying: a second visitor saw "already connected" to
// whoever had connected first).
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/output', express.static(path.join(__dirname, 'output')));

function callbackUrl(req) {
  return `${req.protocol}://${req.get('host')}/auth/swiggy/callback`;
}

app.get('/auth/swiggy/status', (req, res) => {
  res.json({ loggedIn: swiggyOAuth.isLoggedIn(req.sessionId) });
});

app.get('/auth/swiggy/login', async (req, res) => {
  try {
    const url = await swiggyOAuth.buildAuthorizeUrl(req.sessionId, callbackUrl(req));
    res.redirect(url);
  } catch (err) {
    res.status(500).send(`Could not start Swiggy login: ${err.message}`);
  }
});

app.get('/auth/swiggy/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  if (error) {
    return res.status(400).send(`Swiggy login failed: ${error} -- ${error_description || ''}`);
  }
  try {
    // Note: handleCallback resolves the session from the `state` value
    // recorded when the login started, not from req.sessionId here --
    // that's what makes it robust even if the callback request somehow
    // arrives without the original cookie.
    await swiggyOAuth.handleCallback(code, state, callbackUrl(req));
    res.redirect('/?swiggy=connected');
  } catch (err) {
    res.status(500).send(`Swiggy login failed: ${err.message}`);
  }
});

// In-memory job store -- this is a local single-user demo tool, not a
// production multi-tenant service.
const jobs = new Map();

app.get('/api/stages', (req, res) => res.json(STAGES));

app.post('/api/adapt', (req, res) => {
  const { recipeUrl, recipeText, missingIngredients, servingSize, requestedChanges, budget } = req.body || {};
  if ((!recipeUrl && !recipeText) || !servingSize || !budget) {
    return res.status(400).json({ error: 'A recipe URL or pasted recipe text, plus servingSize and budget, are required' });
  }

  const jobId = randomUUID();
  const input = {
    recipeUrl: recipeUrl || null,
    recipeText: recipeText || null,
    missingIngredients: Array.isArray(missingIngredients)
      ? missingIngredients
      : String(missingIngredients || '').split(',').map((s) => s.trim()).filter(Boolean),
    servingSize: Number(servingSize),
    requestedChanges: requestedChanges || '',
    budget: Number(budget),
  };

  const { emitter, promise } = runWorkflow(input, { userSessionId: req.sessionId });
  // sessionId and (once resolved) addressId + state are kept here so a
  // later override action can add a different real product to the same
  // cart without re-running the workflow or re-resolving the address.
  const job = {
    stagesReached: [],
    done: false,
    error: null,
    summary: null,
    savedPath: null,
    sessionId: req.sessionId,
    addressId: null,
    state: null,
  };
  jobs.set(jobId, job);

  emitter.on('stage', (key) => {
    if (!job.stagesReached.includes(key)) job.stagesReached.push(key);
  });
  // Granular perceive/reason/act/observe events are intentionally not
  // forwarded to the browser (the UI shows only the 4 major stages) --
  // they're still visible in the server's own console for debugging.
  emitter.on('progress', (e) => console.log(`[${e.phase}] ${e.message}`));

  promise
    .then((result) => {
      job.done = true;
      job.summary = result.summary;
      job.savedPath = path.basename(result.savedPath);
      job.addressId = result.addressId;
      job.state = result.state;
    })
    .catch((err) => {
      job.done = true;
      job.error = err.message;
    });

  res.json({ jobId });
});

// Adds the option the user *didn't* get automatically (or that couldn't be
// resolved within budget) to the real Instamart cart, for one already-
// completed ingredient decision. Does not re-run the workflow -- one
// targeted update_cart call plus deterministic bookkeeping, same shape as
// the cart-add code inside agent/workflow.js's per-ingredient loop.
app.post('/api/adapt/:jobId/override', async (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.done || job.error) return res.status(400).json({ error: 'This run is not in a completed state' });
  if (!job.addressId) return res.status(400).json({ error: 'No delivery address was resolved for this run' });

  const { ingredient, choice } = req.body || {};
  if (!ingredient || (choice !== 'original' && choice !== 'substitute')) {
    return res.status(400).json({ error: 'ingredient and choice ("original" or "substitute") are required' });
  }

  const record = job.state.decisions.find((d) => d.ingredient.toLowerCase() === String(ingredient).toLowerCase());
  if (!record) return res.status(404).json({ error: `No decision found for "${ingredient}"` });

  const product = choice === 'original' ? record.originalProduct : record.substituteProduct;
  if (!product) return res.status(400).json({ error: `No ${choice} product was found on Instamart for "${ingredient}"` });

  try {
    const instamart = new InstamartClient(job.sessionId);
    await instamart.init();

    // If a different product for this same ingredient was already added
    // (the automatic decision, or an earlier override), try to remove it
    // first so the real cart doesn't end up holding both. Best-effort:
    // this assumes Swiggy's update_cart treats quantity: 0 as "remove",
    // which is the common convention but is NOT verified against the live
    // API in this codebase -- if it doesn't behave that way, the add below
    // still succeeds and is what actually matters for the override to work
    // at all, so a failure here is logged and swallowed rather than
    // blocking the real action the user asked for.
    const previousProduct = record.product;
    if (previousProduct && previousProduct.spinId !== product.spinId) {
      try {
        await instamart.callTool('update_cart', {
          selectedAddressId: job.addressId,
          items: [{ spinId: previousProduct.spinId, skuId: previousProduct.skuId, quantity: 0 }],
        });
      } catch (removeErr) {
        console.log(`[override] Could not remove previous cart item for "${ingredient}": ${removeErr.message}`);
      }
    }

    await instamart.callTool('update_cart', {
      selectedAddressId: job.addressId,
      items: [{ spinId: product.spinId, skuId: product.skuId, quantity: 1 }],
    });

    record.decision = choice === 'original' ? 'buy' : 'substitute';
    record.product = product;
    record.cost = product.offerPrice;
    // Refresh the human-readable reasoning too -- otherwise it would keep
    // describing whichever option the automatic decision picked, which
    // would now contradict `decision` after this override (a real bug
    // caught in testing: the UI would say "buy" but the reasoning text
    // would still explain why the substitute was added).
    record.reasoning = `You chose to add ${product.displayName} (₹${product.offerPrice}) instead of the automatic pick.`;
    // Deterministic bookkeeping -- the same reduce used in
    // agent/workflow.js, recomputed rather than duplicated by hand here.
    job.state.spentSoFar = job.state.decisions.reduce((sum, d) => sum + (d.product ? d.cost : 0), 0);

    job.summary = buildSummary(job.state);
    res.json({ summary: job.summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Server-Sent Events stream of the 4 major stages (+ the final summary) for one job.
app.get('/api/adapt/:jobId/stream', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).end();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  let sentStages = 0;
  const send = () => {
    while (sentStages < job.stagesReached.length) {
      res.write(`data: ${JSON.stringify({ stage: job.stagesReached[sentStages] })}\n\n`);
      sentStages++;
    }
    if (job.done) {
      res.write(`event: done\ndata: ${JSON.stringify({ error: job.error, summary: job.summary, savedPath: job.savedPath })}\n\n`);
      clearInterval(interval);
      res.end();
    }
  };
  const interval = setInterval(send, 300);
  send();

  req.on('close', () => clearInterval(interval));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Recipe Budget Agent listening on http://localhost:${PORT}`);
});
