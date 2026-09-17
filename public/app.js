const form = document.getElementById('adapt-form');
const btn = document.getElementById('adapt-btn');
const notice = document.getElementById('notice');
const progressSection = document.getElementById('progress');
const progressLog = document.getElementById('progress-log');
const resultSection = document.getElementById('result');
const errorSection = document.getElementById('error');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  btn.disabled = true;
  notice.hidden = false;
  progressSection.hidden = false;
  resultSection.hidden = true;
  errorSection.hidden = true;
  progressLog.innerHTML = '';

  const body = {
    recipeUrl: document.getElementById('recipeUrl').value,
    ownedIngredients: document.getElementById('ownedIngredients').value,
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
    const entry = JSON.parse(ev.data);
    const li = document.createElement('li');
    li.className = `phase-${entry.phase}`;
    li.textContent = `[${entry.phase}] ${entry.message}`;
    progressLog.appendChild(li);
    progressLog.scrollTop = progressLog.scrollHeight;
  };
  source.addEventListener('done', (ev) => {
    const { error, result } = JSON.parse(ev.data);
    source.close();
    btn.disabled = false;
    if (error) {
      showError(error);
      return;
    }
    resultSection.hidden = false;
    document.getElementById('download-link').href = `/output/${result.savedPath}`;
    document.getElementById('result-preview').textContent = result.documentMarkdown;
  });
  source.onerror = () => {
    source.close();
    btn.disabled = false;
  };
});

function showError(message) {
  errorSection.hidden = false;
  document.getElementById('error-message').textContent = message;
  btn.disabled = false;
}
