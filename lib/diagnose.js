// Diagnostic engine.
//
// Flow: take the car + the symptom the user describes, and produce:
//   - the most likely cause(s), ranked, with severity
//   - 1-2 follow-up questions to narrow it down
//   - the parts and tools a fix would need
//   - a starting set of repair steps
//   - a YouTube video and a manual to follow along with
//
// AI guidance (the "what's likely wrong" part) uses the Anthropic / Claude API
// if a key is set. Without a key, the app still works — it just returns search
// links instead of a reasoned diagnosis, and tells the user how to upgrade.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

function carLabel(v) {
  return [v?.year, v?.make, v?.model, v?.trim].filter(Boolean).join(' ').trim();
}

function ytSearchUrl(q) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}

function manualSearchUrl(q) {
  return `https://www.google.com/search?q=${encodeURIComponent(q + ' repair manual')}`;
}

// Optionally resolve a specific top YouTube video (needs a YouTube Data API key).
async function findVideo({ query, youtubeKey }) {
  if (!youtubeKey) {
    return { title: `Search YouTube for "${query}"`, url: ytSearchUrl(query), source: 'search' };
  }
  try {
    const url =
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1` +
      `&q=${encodeURIComponent(query)}&key=${youtubeKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`YouTube API ${res.status}`);
    const data = await res.json();
    const item = data.items?.[0];
    if (!item) return { title: `Search YouTube for "${query}"`, url: ytSearchUrl(query), source: 'search' };
    return {
      title: item.snippet.title,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      source: 'youtube',
    };
  } catch {
    return { title: `Search YouTube for "${query}"`, url: ytSearchUrl(query), source: 'search' };
  }
}

// Pull the first JSON object out of a model's text response, defensively.
function extractJson(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function aiGuidance({ vehicle, symptom, mileage, apiKey, model }) {
  const car = carLabel(vehicle) || 'the car';
  const system =
    `You are an expert master automotive technician helping a hands-on owner diagnose ` +
    `their own car. Be practical and safety-aware. Respond with STRICT JSON only, no prose, ` +
    `matching this shape:\n` +
    `{"likelyCauses":[{"cause":"","why":"","severity":"low|medium|high"}],` +
    `"followUps":["",""],"parts":[""],"tools":[""],"steps":[""],` +
    `"safety":"","searchQuery":""}\n` +
    `"searchQuery" should be the best short YouTube query to fix the most likely cause on this exact car.`;
  const user =
    `Car: ${car}\n` +
    (mileage ? `Mileage: ${mileage}\n` : '') +
    `Reported symptom: ${symptom}\n\n` +
    `Give the most likely causes (ranked), follow-up questions to confirm, the parts and ` +
    `tools needed, a short ordered list of repair steps, and any safety warning.`;

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: 1200,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Anthropic API ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.content?.map((b) => b.text).join('') || '';
  const parsed = extractJson(text);
  if (!parsed) throw new Error('Could not parse AI response');
  return parsed;
}

export async function diagnose({ vehicle, symptom, settings = {} }) {
  const car = carLabel(vehicle);
  const anthropicKey = settings.ANTHROPIC_API_KEY;
  const youtubeKey = settings.YOUTUBE_API_KEY;
  const model = settings.ANTHROPIC_MODEL;

  // No AI key: graceful fallback to search links only.
  if (!anthropicKey) {
    const query = `${car} ${symptom}`.trim();
    const video = await findVideo({ query: `${query} fix how to`, youtubeKey });
    return {
      aiUsed: false,
      car,
      symptom,
      likelyCauses: [],
      followUps: [],
      parts: [],
      tools: [],
      steps: [],
      safety: '',
      video,
      manual: { title: `Find a manual for "${query}"`, url: manualSearchUrl(query) },
      note:
        'Add an Anthropic (Claude) API key in Settings to turn this into a real diagnosis ' +
        '— likely cause, parts, tools, and steps. For now, here are the best places to look.',
    };
  }

  const ai = await aiGuidance({
    vehicle,
    symptom,
    mileage: vehicle?.mileage,
    apiKey: anthropicKey,
    model,
  });

  const videoQuery = ai.searchQuery || `${car} ${symptom} fix how to`;
  const video = await findVideo({ query: videoQuery, youtubeKey });

  return {
    aiUsed: true,
    car,
    symptom,
    likelyCauses: ai.likelyCauses || [],
    followUps: ai.followUps || [],
    parts: ai.parts || [],
    tools: ai.tools || [],
    steps: ai.steps || [],
    safety: ai.safety || '',
    video,
    manual: {
      title: `Service manual / guide for ${car}`,
      url: manualSearchUrl(`${car} ${ai.likelyCauses?.[0]?.cause || symptom}`),
    },
    note: youtubeKey ? '' : 'Tip: add a YouTube API key in Settings to pin a specific video instead of a search link.',
  };
}
