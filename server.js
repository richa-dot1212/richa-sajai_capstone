require('./agent/env').loadEnv();
const express = require('express');
const path = require('path');
const { randomUUID } = require('crypto');
const { runWorkflow, STAGES } = require('./agent/workflow');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/output', express.static(path.join(__dirname, 'output')));

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

  const { emitter, promise } = runWorkflow(input);
  const job = { stagesReached: [], done: false, error: null, summary: null, savedPath: null };
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
    })
    .catch((err) => {
      job.done = true;
      job.error = err.message;
    });

  res.json({ jobId });
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
