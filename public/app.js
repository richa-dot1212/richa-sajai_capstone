// Real Phosphor Icons (regular style, MIT-licensed) inlined as path data --
// see public/fonts and the redesign notes in BUILD_LOG for why these were
// chosen over emoji/hand-drawn glyphs.
const ICONS = {
  checkCircle: 'M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z',
  circle: 'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Z',
  link: 'M165.66,90.34a8,8,0,0,1,0,11.32l-64,64a8,8,0,0,1-11.32-11.32l64-64A8,8,0,0,1,165.66,90.34ZM215.6,40.4a56,56,0,0,0-79.2,0L106.34,70.45a8,8,0,0,0,11.32,11.32l30.06-30a40,40,0,0,1,56.57,56.56l-30.07,30.06a8,8,0,0,0,11.31,11.32L215.6,119.6a56,56,0,0,0,0-79.2ZM138.34,174.22l-30.06,30.06a40,40,0,1,1-56.56-56.57l30.05-30.05a8,8,0,0,0-11.32-11.32L40.4,136.4a56,56,0,0,0,79.2,79.2l30.06-30.07a8,8,0,0,0-11.32-11.31Z',
  cart: 'M104,216a16,16,0,1,1-16-16A16,16,0,0,1,104,216Zm88-16a16,16,0,1,0,16,16A16,16,0,0,0,192,200ZM239.71,74.14l-25.64,92.28A24.06,24.06,0,0,1,191,184H92.16A24.06,24.06,0,0,1,69,166.42L33.92,40H16a8,8,0,0,1,0-16H40a8,8,0,0,1,7.71,5.86L57.19,64H232a8,8,0,0,1,7.71,10.14ZM221.47,80H61.64l22.81,82.14A8,8,0,0,0,92.16,168H191a8,8,0,0,0,7.71-5.86Z',
  warning: 'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm-8-80V80a8,8,0,0,1,16,0v56a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,172Z',
  arrowRight: 'M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z',
};

function icon(name, extraClass) {
  return `<svg class="icon${extraClass ? ' ' + extraClass : ''}" aria-hidden="true" viewBox="0 0 256 256"><path d="${ICONS[name]}"/></svg>`;
}

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
      ? `${icon('checkCircle')}<span>Connected to Swiggy Instamart</span>`
      : `${icon('warning')}<span>Not connected yet -- <a href="/auth/swiggy/login">connect your Instamart account</a> before adapting a recipe</span>`;
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
    const iconName = isDone ? 'checkCircle' : 'circle';
    li.innerHTML = `${icon(iconName)}<span>${stage.label}</span>`;
    stageList.appendChild(li);
  });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  btn.disabled = true;
  notice.hidden = false;
  notice.innerHTML = `${icon('checkCircle')}<span>Working on it -- the agent will search Instamart for anything worth buying and add it to your real cart (no checkout), then your personalized recipe will be ready to download below.</span>`;
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
    summary.missingIngredients.map((m) => `<li>${icon('circle')}<span>${escapeHtml(m)}</span></li>`),
    'Nothing missing -- you had everything on hand.'
  );
  const subs = list(
    summary.substitutions.map(
      (s) =>
        `<li>${icon('arrowRight')}<span><strong>${escapeHtml(s.ingredient)}</strong> → ${escapeHtml(s.substitute)}<small>${escapeHtml(s.reasoning)}</small></span></li>`
    ),
    'No substitutions were needed.'
  );
  const cart = list(
    summary.cartItems.map(
      (c) =>
        `<li>${icon('cart')}<span><strong>${escapeHtml(c.ingredient)}</strong> -- ${escapeHtml(c.product)}</span><span class="cost">₹${c.cost}</span></li>`
    ),
    'Nothing needed to be bought.'
  );
  const unresolved = summary.unresolved.length
    ? `<h3>Could not resolve</h3>${list(
        summary.unresolved.map((u) => `<li>${icon('warning')}<span><strong>${escapeHtml(u.ingredient)}</strong>: ${escapeHtml(u.reasoning)}</span></li>`),
        ''
      )}`
    : '';

  return `
    <h3>Missing ingredients</h3>${missing}
    <h3>Substitutions made</h3>${subs}
    <h3>Added to Instamart cart</h3>${cart}
    ${unresolved}
    <div class="total-cost">
      <span class="total-cost__label">Total spent<span class="amount">₹${summary.totalCost}</span></span>
      <span class="of-budget">of ₹${summary.budget} budget</span>
    </div>
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
