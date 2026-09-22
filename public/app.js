// Real Phosphor Icons (regular style, MIT-licensed) inlined as path data.
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------
// View switching (3 full-screen views: input, progress, result;
// error can interrupt any of them).
// ---------------------------------------------------------------
function showView(id) {
  document.querySelectorAll('.view').forEach((el) => { el.hidden = el.id !== id; });
  // Without this, switching views leaves the page at whatever scroll
  // position the previous (now-hidden) view was at -- the new view then
  // renders starting below the fold, looking like it "appeared lower on
  // the same screen" instead of a fresh screen.
  window.scrollTo(0, 0);
}

const form = document.getElementById('adapt-form');
const btn = document.getElementById('adapt-btn');
const notice = document.getElementById('notice');
const stageList = document.getElementById('stage-list');

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
    if (loggedIn) {
      el.className = 'swiggy-step is-connected';
      el.innerHTML = `${icon('checkCircle')}<span>Connected to Swiggy Instamart</span>`;
    } else {
      el.className = 'swiggy-step';
      el.innerHTML = `
        <p>Required before adapting a recipe, so the agent can check prices and add anything it buys to your real cart.</p>
        <a href="/auth/swiggy/login" class="btn-primary"><span>Connect to Swiggy</span>${icon('arrowRight')}</a>
      `;
    }
  } catch {
    el.textContent = '';
  }
}
loadSwiggyStatus();

function renderStages(reachedKeys, allDone) {
  stageList.innerHTML = '';
  const lastReached = reachedKeys[reachedKeys.length - 1];
  let doneCount = 0;
  STAGES.forEach((stage) => {
    const li = document.createElement('li');
    const reachedIndex = reachedKeys.indexOf(stage.key);
    const isActive = !allDone && stage.key === lastReached;
    const isDone = reachedIndex !== -1 && !isActive;
    if (isDone || allDone) doneCount++;
    li.className = isDone ? 'stage-done' : isActive ? 'stage-active' : 'stage-pending';
    const iconName = isDone ? 'checkCircle' : 'circle';
    li.innerHTML = `${icon(iconName)}<span>${stage.label}</span>`;
    stageList.appendChild(li);
  });
  updatePotFill(allDone ? STAGES.length : doneCount + (reachedKeys.length > doneCount ? 0.5 : 0), STAGES.length);
}

// Fills the pot illustration on the progress screen a fraction at a time as
// stages complete, purely a delight touch -- has no effect on the real run.
function updatePotFill(completedUnits, totalUnits) {
  const liquid = document.getElementById('pot-liquid');
  const wave = document.getElementById('pot-liquid-wave');
  if (!liquid || !wave) return;
  const POT_BOTTOM = 178;
  const POT_TOP = 74;
  const fraction = totalUnits ? Math.min(1, completedUnits / totalUnits) : 0;
  const y = POT_BOTTOM - fraction * (POT_BOTTOM - POT_TOP);
  const height = POT_BOTTOM - y;
  liquid.setAttribute('y', y);
  liquid.setAttribute('height', height);
  wave.setAttribute('transform', `translate(0, ${y - POT_BOTTOM})`);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  btn.disabled = true;

  const recipeUrl = document.getElementById('recipeUrl').value.trim();
  const recipeText = document.getElementById('recipeText').value.trim();
  if (!recipeUrl && !recipeText) {
    btn.disabled = false;
    showError('Fill in either a recipe URL or paste the recipe text.');
    return;
  }

  showView('view-progress');
  notice.hidden = false;
  notice.innerHTML = `${icon('checkCircle')}<span>The agent will search Instamart for anything worth buying and add it to your real cart (no checkout), then your personalized recipe will be ready to download.</span>`;
  renderStages([]);

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
    document.getElementById('recipe-title').textContent = summary.title || 'Your recipe';
    document.getElementById('download-link').href = `/output/${savedPath}`;
    document.getElementById('summary').innerHTML = renderTabs(summary);
    setActiveTab('ingredients');
    showView('view-result');
  });
  source.onerror = () => {
    source.close();
    btn.disabled = false;
    showError('Lost connection while adapting your recipe. Please try again.');
  };
});

// ---------------------------------------------------------------
// Tabs -- Ingredients / Directions
// ---------------------------------------------------------------
document.querySelectorAll('.tab-btn').forEach((tabBtn) => {
  tabBtn.addEventListener('click', () => setActiveTab(tabBtn.dataset.tab));
});

function setActiveTab(name) {
  document.querySelectorAll('.tab-btn').forEach((b) => {
    const active = b.dataset.tab === name;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.hidden = p.dataset.panel !== name;
  });
}

document.getElementById('back-btn').addEventListener('click', () => {
  showView('view-input');
});

// ---------------------------------------------------------------
// Result rendering
// ---------------------------------------------------------------
function renderTabs(summary) {
  return `
    <div class="tab-panel" data-panel="ingredients">${renderIngredientsTab(summary)}</div>
    <div class="tab-panel" data-panel="directions" hidden>${renderDirectionsTab(summary)}</div>
  `;
}

function renderIngredientsTab(summary) {
  const ingredients = summary.ingredients || [];
  const ingredientRows = ingredients.length
    ? ingredients
        .map((ing) => {
          let noteHtml = '';
          if (ing.note) {
            const cls = /substitut/i.test(ing.note) ? 'sub' : /bought/i.test(ing.note) ? 'bought' : 'unresolved';
            noteHtml = `<span class="note ${cls}">${escapeHtml(ing.note)}</span>`;
          }
          return `<li><span class="qty">${escapeHtml(ing.quantity)}</span><span class="name">${escapeHtml(ing.name)}</span>${noteHtml}</li>`;
        })
        .join('')
    : '<li><span class="name">No ingredients found.</span></li>';

  const cartItems = summary.cartItems || [];
  const cartRows = cartItems.length
    ? cartItems
        .map(
          (c) =>
            `<li>${icon('cart')}<span>${escapeHtml(c.product)}</span><span class="added-badge">${icon('checkCircle')}Added to cart</span><span class="price">₹${c.cost}</span></li>`
        )
        .join('')
    : '<p class="empty">Nothing needed to be bought -- everything was already on hand or substituted.</p>';

  const unresolved = summary.unresolved && summary.unresolved.length
    ? `<div class="cart-note cart-note--warning">
         <h3>Heads up</h3>
         <p class="cart-note__sub">Could not be resolved within your budget</p>
         <ul>${summary.unresolved.map((u) => `<li>${icon('warning')}<span><strong>${escapeHtml(u.ingredient)}</strong>: ${escapeHtml(u.reasoning)}</span></li>`).join('')}</ul>
       </div>`
    : '';

  return `
    <div class="ingredients-columns">
      <div class="ingredients-columns__left">
        <ul class="ingredient-list">${ingredientRows}</ul>
        ${unresolved}
      </div>
      <div class="ingredients-columns__right">
        <div class="cart-note">
          <h3><img class="cart-note__logo" src="images/swiggy-logo.webp" alt="" onerror="this.remove()" />From the Instamart cart</h3>
          <p class="cart-note__sub">Already added, ready for checkout in the app</p>
          ${cartItems.length ? `<ul>${cartRows}</ul>` : cartRows}
        </div>

        <div class="total-cost">
          <span class="total-cost__label">Total spent<span class="amount">₹${summary.totalCost}</span></span>
          <span class="of-budget">of ₹${summary.budget} budget</span>
        </div>
      </div>
    </div>
  `;
}

function renderDirectionsTab(summary) {
  const steps = summary.instructions || [];
  const stepsHtml = steps.length
    ? `<ol class="directions-list">${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`
    : '<p class="empty">No instructions were found for this recipe.</p>';

  if (!summary.imageUrl) {
    return `<div class="directions-columns directions-columns--full">${stepsHtml}</div>`;
  }

  // onerror removes the whole photo mat gracefully -- some sites block
  // hotlinking their images, and a missing/failed photo is a fine outcome,
  // never a broken-image icon.
  return `
    <div class="directions-columns">
      <div class="directions-columns__left">${stepsHtml}</div>
      <div class="directions-columns__right">
        <div class="recipe-photo-mat">
          <img
            class="recipe-photo"
            src="${escapeHtml(summary.imageUrl)}"
            alt="${escapeHtml(summary.title || 'The finished recipe')}"
            onerror="this.closest('.recipe-photo-mat').remove()"
          />
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------
// Error view
// ---------------------------------------------------------------
function showError(message) {
  document.getElementById('error-message').textContent = message;
  showView('error');
  btn.disabled = false;
}

document.getElementById('error-retry-btn').addEventListener('click', () => {
  showView('view-input');
});
