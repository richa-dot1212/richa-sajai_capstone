// Thin wrapper around the Gemini API REST endpoint. The API key is read
// from process.env.GEMINI_API_KEY (loaded from .env, never hardcoded here
// and never logged).
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

async function callGemini({ systemInstruction, prompt, responseSchema }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set (expected in .env)');
  }

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
    },
  };
  if (systemInstruction) {
    body.systemInstruction = { role: 'system', parts: [{ text: systemInstruction }] };
  }
  if (responseSchema) {
    body.generationConfig.responseMimeType = 'application/json';
    body.generationConfig.responseSchema = responseSchema;
  }

  const MAX_ATTEMPTS = 6;
  let lastErr;
  let data;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      data = await res.json();
      lastErr = null;
      break;
    }

    const text = await res.text();
    lastErr = new Error(`Gemini API error ${res.status}: ${text.slice(0, 500)}`);
    const retryable = res.status === 503 || res.status === 429;
    if (!retryable || attempt === MAX_ATTEMPTS) throw lastErr;

    let delayMs = 1500 * attempt;
    if (res.status === 429) {
      const m = text.match(/retry in (\d+(?:\.\d+)?)s/i);
      if (m) delayMs = Math.ceil(Number(m[1]) * 1000) + 1000;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  if (lastErr) throw lastErr;
  const candidate = data.candidates && data.candidates[0];
  const text = candidate && candidate.content && candidate.content.parts
    ? candidate.content.parts.map((p) => p.text || '').join('')
    : '';

  if (responseSchema) {
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error(`Gemini did not return valid JSON for the requested schema: ${text.slice(0, 300)}`);
    }
  }
  return text;
}

module.exports = { callGemini };
