// LLM client -- switched from Gemini to Groq (OpenAI-compatible API) after
// Gemini's free-tier quota (20 requests/day) proved too tight to even
// finish development, let alone a demo. Groq's inference is also
// dramatically faster in practice (sub-second for our calls vs. several
// seconds, sometimes 503s, on Gemini).
//
// The API key is read from process.env.GROQ_API_KEY (loaded from .env,
// never hardcoded here and never logged).
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

// Groq's structured-output "strict" mode requires every object in the
// schema to explicitly set additionalProperties: false. Our schemas are
// already written with every property required (which strict mode also
// needs); this just adds the one extra flag recursively so callers don't
// have to hand-edit every schema definition.
function strictify(schema) {
  if (schema && schema.type === 'object') {
    schema.additionalProperties = false;
    if (schema.properties) {
      for (const key of Object.keys(schema.properties)) {
        strictify(schema.properties[key]);
      }
    }
  } else if (schema && schema.type === 'array' && schema.items) {
    strictify(schema.items);
  }
  return schema;
}

async function callLLM({ systemInstruction, prompt, responseSchema }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set (expected in .env)');
  }

  const messages = [];
  if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
  messages.push({ role: 'user', content: prompt });

  const body = { model: MODEL, messages };
  if (responseSchema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: 'response', strict: true, schema: strictify(responseSchema) },
    };
  }

  const MAX_ATTEMPTS = 4;
  let lastErr;
  let data;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      data = await res.json();
      lastErr = null;
      break;
    }

    const text = await res.text();
    lastErr = new Error(`Groq API error ${res.status}: ${text.slice(0, 500)}`);
    // Groq's daily/rate limits are much more generous than Gemini's free
    // tier, but still retry transient 503/429s -- fail fast otherwise.
    const retryable = res.status === 503 || res.status === 429;
    if (!retryable || attempt === MAX_ATTEMPTS) throw lastErr;
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  if (lastErr) throw lastErr;

  const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text) throw new Error('Groq API returned no content');

  if (responseSchema) {
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error(`Groq did not return valid JSON for the requested schema: ${text.slice(0, 300)}`);
    }
  }
  return text;
}

module.exports = { callLLM };
