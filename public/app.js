const form = document.getElementById('adapt-form');
const btn = document.getElementById('adapt-btn');
const notice = document.getElementById('notice');
const progressSection = document.getElementById('progress');
const stageList = document.getElementById('stage-list');
const resultSection = document.getElementById('result');
const errorSection = document.getElementById('error');

let STAGES = [];

async function loadStages() {
  const res = await fetch('/api/stages');
  STAGES = await res.json();
}
loadStages();

async function loadSwiggyStatus() {
  const el = document.getElementById('swiggy-status');
  try {
    const res = await fetch('/auth/swiggy/status');
    const { loggedIn } = await res.json();
    el.innerHTML = loggedIn
      ? '✅ Connected to Swiggy Instamart'
      : '⚠️ Not connected to Swiggy yet -- <a href="/auth/swiggy/login">connect your Instamart account</a> before adapting a recipe.';
    el.className = `swiggy-status ${loggedIn ? 'connected' : 'disconnected'}`;
  } catch {
    el.textContent = '';
  }
}
loadSwiggyStatus();

function renderStages(reachedKeys, allDone) {
  stageList.innerHTML = '';
  const lastReached = reachedKeys[reachedKeys.length - 1];
  STAGES.forEach((stage) => {
    const li = document.createElement('li');
    const reachedIndex = reachedKeys.indexOf(stage.key);
    const isActive = !allDone && stage.key === lastReached;
    const isDone = reachedIndex !== -1 && !isActive;
    li.className = isDone ? 'stage-done' : isActive ? 'stage-active' : 'stage-pending';
    li.textContent = `${isDone ? '✓' : isActive ? '…' : '○'} ${stage.label}`;
    stageList.appendChild(li);
  });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  btn.disabled = true;
  notice.hidden = false;
  progressSection.hidden = false;
  resultSection.hidden = true;
  errorSection.hidden = true;
  renderStages([]);

  const recipeUrl = document.getElementById('recipeUrl').value.trim();
  const recipeText = document.getElementById('recipeText').value.trim();
  if (!recipeUrl && !recipeText) {
    btn.disabled = false;
    notice.hidden = true;
    progressSection.hidden = true;
    showError('Fill in either a recipe URL or paste the recipe text.');
    return;
  }

  const body = {
    recipeUrl,
    recipeText,
    missingIngredients: document.getElementById('missingIngredients').value,
    servingSize: document.getElementById('servingSize').value,
    requestedChanges: document.getElementById('requestedChanges').value,
    budget: document.getElementById('budget').value,
  };

  const res = await fetch('/api/adapt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const { jobId, error } = await res.json();
  if (error) {
    showError(error);
    return;
  }

  const source = new EventSource(`/api/adapt/${jobId}/stream`);
  source.onmessage = (ev) => {
    const data = JSON.parse(ev.data);
    if (data.stage) {
      const idx = STAGES.findIndex((s) => s.key === data.stage);
      const reached = STAGES.slice(0, idx + 1).map((s) => s.key);
      renderStages(reached);
    }
  };
  source.addEventListener('done', (ev) => {
    const { error, summary, savedPath } = JSON.parse(ev.data);
    source.close();
    btn.disabled = false;
    if (error) {
      showError(error);
      return;
    }
    renderStages(STAGES.map((s) => s.key), true);
    resultSection.hidden = false;
    document.getElementById('download-link').href = `/output/${savedPath}`;
    document.getElementById('summary').innerHTML = renderSummary(summary);
  });
  source.onerror = () => {
    source.close();
    btn.disabled = false;
  };
});

function renderSummary(summary) {
  const list = (items, empty) => (items.length ? `<ul>${items.join('')}</ul>` : `<p class="empty">${empty}</p>`);

  const missing = list(
    summary.missingIngredients.map((m) => `<li>${escapeHtml(m)}</li>`),
    'None'
  );
  const subs = list(
    summary.substitutions.map((s) => `<li><strong>${escapeHtml(s.ingredient)}</strong> → ${escapeHtml(s.substitute)}<br><small>${escapeHtml(s.reasoning)}</small></li>`),
    'None'
  );
  const cart = list(
    summary.cartItems.map((c) => `<li><strong>${escapeHtml(c.ingredient)}</strong> — ${escapeHtml(c.product)} (₹${c.cost})</li>`),
    'None'
  );
  const unresolved = summary.unresolved.length
    ? `<h3>Could not resolve</h3>${list(summary.unresolved.map((u) => `<li><strong>${escapeHtml(u.ingredient)}</strong>: ${escapeHtml(u.reasoning)}</li>`), '')}`
    : '';

  return `
    <h3>Missing ingredients</h3>${missing}
    <h3>Substitutions made</h3>${subs}
    <h3>Added to Instamart cart</h3>${cart}
    ${unresolved}
    <h3>Total estimated cost</h3>
    <p>₹${summary.totalCost} of your ₹${summary.budget} budget</p>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showError(message) {
  errorSection.hidden = false;
  document.getElementById('error-message').textContent = message;
  btn.disabled = false;
}
