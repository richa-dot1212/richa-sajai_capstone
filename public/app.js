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

// A long recipe title at full size would dominate the whole header
// instead of sitting inside it. Breaks it onto a new line every 4 words
// and, once it actually needs more than one line, switches to a smaller
// font scale so the header stays proportioned to its content.
function setRecipeTitle(title) {
  const el = document.getElementById('recipe-title');
  const words = title.trim().split(/\s+/);
  const lines = [];
  for (let i = 0; i < words.length; i += 4) lines.push(words.slice(i, i + 4).join(' '));
  el.innerHTML = lines.map((line) => escapeHtml(line)).join('<br>');
  el.classList.toggle('recipe-title--long', words.length > 4);
}

// ---------------------------------------------------------------
// Motion helpers
// ---------------------------------------------------------------
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// Fades content up as it comes into view. IntersectionObserver rather than
// a scroll listener (no work on scroll frames), and each element is
// unobserved once shown so scrolling back up never replays anything.
const revealObserver =
  'IntersectionObserver' in window
    ? new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
          });
        },
        { rootMargin: '0px 0px -8% 0px' }
      )
    : null;

function revealIn(root) {
  const items = root.querySelectorAll('[data-reveal]:not(.is-visible)');
  // No observer support, or the visitor asked for stillness: show it all now.
  if (!revealObserver || reduceMotion.matches) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  items.forEach((el, i) => {
    el.style.setProperty('--reveal-i', String(i));
    revealObserver.observe(el);
  });
}

// ---------------------------------------------------------------
// View switching (3 full-screen views: input, progress, result;
// error can interrupt any of them).
// ---------------------------------------------------------------
let viewSwapTimer = null;

function showView(id) {
  const target = document.getElementById(id);
  const current = Array.from(document.querySelectorAll('.view')).find((v) => !v.hidden);

  const swap = () => {
    document.querySelectorAll('.view').forEach((el) => {
      el.classList.remove('is-leaving');
      el.hidden = el.id !== id;
    });
    // Without this, switching views leaves the page at whatever scroll
    // position the previous (now-hidden) view was at -- the new view then
    // renders starting below the fold, looking like it "appeared lower on
    // the same screen" instead of a fresh screen.
    window.scrollTo(0, 0);
    if (target) revealIn(target);
  };

  // Latest call always wins, so a fast error-during-transition can't land
  // the page on the wrong screen.
  clearTimeout(viewSwapTimer);

  if (!current || current === target || reduceMotion.matches) {
    swap();
    return;
  }

  current.classList.add('is-leaving');
  viewSwapTimer = setTimeout(swap, 170);
}

const form = document.getElementById('adapt-form');
const btn = document.getElementById('adapt-btn');
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

// The input screen is visible straight from the markup and never goes
// through showView() on first load, so its reveal targets need starting
// here -- otherwise the form card would sit at opacity 0 forever.
revealIn(document);

function renderStages(reachedKeys, allDone) {
  const lastReached = reachedKeys[reachedKeys.length - 1];

  // Build the rows once, then only flip their state classes. Rebuilding the
  // list on every update would replay the "completed" pop on every finished
  // row each time a new one lands, which reads as flicker.
  if (stageList.children.length !== STAGES.length) {
    stageList.innerHTML = STAGES.map(
      (stage, i) =>
        `<li class="stage-pending" style="--stage-i:${i}">${icon('circle')}<span>${escapeHtml(stage.label)}</span></li>`
    ).join('');
  }

  let doneCount = 0;
  STAGES.forEach((stage, i) => {
    const li = stageList.children[i];
    if (!li) return;
    const isActive = !allDone && stage.key === lastReached;
    const isDone = reachedKeys.indexOf(stage.key) !== -1 && !isActive;
    if (isDone || allDone) doneCount++;
    const cls = isDone ? 'stage-done' : isActive ? 'stage-active' : 'stage-pending';
    if (li.className === cls) return;
    li.className = cls;
    const path = li.querySelector('path');
    if (path) path.setAttribute('d', ICONS[isDone ? 'checkCircle' : 'circle']);
  });

  updatePotFill(allDone ? STAGES.length : doneCount + (reachedKeys.length > doneCount ? 0.5 : 0), STAGES.length);
}

// Fills the pot illustration on the progress screen a fraction at a time as
// stages complete, purely a delight touch -- has no effect on the real run.
// Driven by transform (scale + translate) rather than SVG geometry so the
// browser can composite it instead of re-rasterising the shape each frame.
const POT_BOTTOM = 178;
const POT_TOP = 74;

function updatePotFill(completedUnits, totalUnits) {
  const liquid = document.getElementById('pot-liquid');
  const wave = document.getElementById('pot-liquid-wave');
  if (!liquid || !wave) return;
  const fraction = totalUnits ? Math.min(1, completedUnits / totalUnits) : 0;
  liquid.style.transform = `scaleY(${fraction})`;
  wave.style.transform = `translateY(${-fraction * (POT_BOTTOM - POT_TOP)}px)`;
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
    setRecipeTitle(summary.title || 'Your recipe');
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
  // Swaps which pair of drawings frames the title. CSS does the crossfade
  // off this one attribute.
  const band = document.getElementById('result-band');
  if (band) band.dataset.art = name;

  document.querySelectorAll('.tab-btn').forEach((b) => {
    const active = b.dataset.tab === name;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.hidden = p.dataset.panel !== name;
    // A hidden panel has no size, so its reveal targets never intersect.
    // Kick them off once the panel is actually on screen.
    if (!p.hidden) revealIn(p);
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
      <div class="ingredients-columns__left" data-reveal>
        <p class="section-subheading">Adapted ingredient measurements</p>
        <ul class="ingredient-list">${ingredientRows}</ul>
        ${unresolved}
      </div>
      <div class="ingredients-columns__right" data-reveal>
        <div class="cart-note">
          <h3><img class="cart-note__logo" src="images/swiggy-logo.webp" alt="" onerror="this.remove()" />From the Instamart cart</h3>
          <p class="cart-note__sub">Already added, ready for checkout in the app</p>
          ${cartItems.length ? `<ul>${cartRows}</ul>` : cartRows}
          <p class="cart-note__total">Total spent <span class="amount">₹${summary.totalCost}</span> <span class="of-budget">of ₹${summary.budget} budget</span></p>
        </div>
      </div>
    </div>
  `;
}

function renderDirectionsTab(summary) {
  const steps = summary.instructions || [];
  // A small drawing closes out the steps -- signals "that's the last one"
  // without another line of text.
  const stepsHtml = steps.length
    ? `<p class="section-subheading">Step-by-step guide</p>
       <ol class="directions-list">${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
       <img class="flourish flourish--cheese" src="images/illustrations/cheese.png" alt="" loading="lazy" />`
    : '<p class="empty">No instructions were found for this recipe.</p>';

  if (!summary.imageUrl) {
    return `<div class="directions-columns directions-columns--full" data-reveal>${stepsHtml}</div>`;
  }

  // onerror removes the whole photo mat gracefully -- some sites block
  // hotlinking their images, and a missing/failed photo is a fine outcome,
  // never a broken-image icon.
  return `
    <div class="directions-columns">
      <div class="directions-columns__left" data-reveal>${stepsHtml}</div>
      <div class="directions-columns__right" data-reveal>
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
