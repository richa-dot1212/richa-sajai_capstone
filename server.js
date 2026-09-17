require('./agent/env').loadEnv();
const express = require('express');
const path = require('path');
const { randomUUID } = require('crypto');
const { runWorkflow } = require('./agent/workflow');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/output', express.static(path.join(__dirname, 'output')));

// In-memory job store -- this is a local single-user demo tool, not a
// production multi-tenant service.
const jobs = new Map();

app.post('/api/adapt', (req, res) => {
  const { recipeUrl, ownedIngredients, servingSize, requestedChanges, budget } = req.body || {};
  if (!recipeUrl || !servingSize || !budget) {
    return res.status(400).json({ error: 'recipeUrl, servingSize, and budget are required' });
  }

  const jobId = randomUUID();
  const input = {
    recipeUrl,
    ownedIngredients: Array.isArray(ownedIngredients)
      ? ownedIngredients
      : String(ownedIngredients || '').split(',').map((s) => s.trim()).filter(Boolean),
    servingSize: Number(servingSize),
    requestedChanges: requestedChanges || '',
    budget: Number(budget),
  };

  const { emitter, promise } = runWorkflow(input);
  const job = { events: [], done: false, error: null, result: null };
  jobs.set(jobId, job);

  emitter.on('progress', (e) => job.events.push(e));

  promise
    .then((result) => {
      job.done = true;
      job.result = { savedPath: path.basename(result.savedPath), documentMarkdown: result.documentMarkdown };
    })
    .catch((err) => {
      job.done = true;
      job.error = err.message;
    });

  res.json({ jobId });
});

// Server-Sent Events progress stream for one job.
app.get('/api/adapt/:jobId/stream', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).end();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  let sent = 0;
  const send = () => {
    while (sent < job.events.length) {
      res.write(`data: ${JSON.stringify(job.events[sent])}\n\n`);
      sent++;
    }
    if (job.done) {
      res.write(`event: done\ndata: ${JSON.stringify({ error: job.error, result: job.result })}\n\n`);
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
