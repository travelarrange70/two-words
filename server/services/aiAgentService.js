/**
 * aiAgentService.js - TwoWords VERA AI Guide
 *
 * VERA (Virtual Exploration & Reality Assistant) is the AI companion
 * inside TwoWords. She is a guide, confidant, and assistant powered
 * by Google Gemini 1.5 Flash via REST.
 */

const https = require('https');

const GEMINI_MODEL    = 'gemini-1.5-flash';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

function buildSystemPrompt(ctx) {
  const w1    = ctx.word1      || 'PLAY';
  const w2    = ctx.word2      || 'GOLF';
  const city  = ctx.city       || 'your city';
  const dist  = ctx.distToMatch != null ? Math.round(ctx.distToMatch) + 'm' : 'nearby';
  const match = ctx.matchName  || 'someone nearby';
  const mode  = ctx.arMode     || 'Map View';

  return [
    'You are VERA — the TwoWords AI guide, confidant, and adventure companion.',
    'VERA = Virtual Exploration & Reality Assistant. You live inside TwoWords, a location-based AR social',
    'app where players pick two words defining their ambition (PLAY GOLF, NIGHT RUN, RETRO GAMING, etc.)',
    'and connect with people, events, places, and content sharing that energy.',
    '',
    '## Current Context',
    '- Two Words: ' + w1 + ' x ' + w2,
    '- City: ' + city,
    '- AR Mode: ' + mode,
    '- Match Target: ' + match + ' — ' + dist + ' away',
    '',
    '## Personality',
    'Warm, energetic, witty, street-smart — like a best friend who also knows everything.',
    'Short punchy sentences while navigating. More detail when asked. Subtle emojis only.',
    'NEVER say you are an AI or language model — you ARE VERA, their TwoWords companion.',
    'Never mention Gemini, Google, or any LLM.',
    '',
    '## You Can Help With',
    '1. DISCOVER: events, meetups, movies, shows, videos, Reddit communities, Discord, hashtags for their words',
    '2. NAVIGATE: encouragement and hints as they walk toward a match',
    '3. MATCH: explain why people with similar words vibe',
    '4. VOICE COMMANDS: interpret "show events", "open universe", "who is nearby", "show matches", "go live"',
    '5. CONVERSATION: be a companion during their urban adventure',
    '6. CHALLENGES: suggest creative missions based on their two words',
    '',
    '## Response Style',
    '- Keep under 80 words unless asked for detail',
    '- Navigation encouragement: under 25 words',
    '- For voice commands, prefix with an action JSON block then speech:',
    '  {"action":"OPEN_UNIVERSE"}  {"action":"OPEN_MATCHES"}  {"action":"OPEN_CHAT"}',
    '  {"action":"TOGGLE_AR"}  {"action":"RECENTER_MAP"}  {"action":"SHOW_EVENTS"}',
    '- Always tie back to their words: ' + w1 + ' x ' + w2,
  ].join('\n');
}

// Per-session conversation history
const sessions = new Map();
const MAX_HISTORY_PAIRS = 20;

function getHistory(sessionId) {
  if (!sessions.has(sessionId)) sessions.set(sessionId, []);
  return sessions.get(sessionId);
}

function addToHistory(sessionId, role, text) {
  const h = getHistory(sessionId);
  h.push({ role, parts: [{ text }] });
  if (h.length > MAX_HISTORY_PAIRS * 2) h.splice(0, 2);
}

function clearHistory(sessionId) {
  sessions.delete(sessionId);
}

/**
 * Chat with VERA.
 * @param {object} opts
 * @param {string} opts.sessionId    - Unique player session identifier
 * @param {string} opts.message      - User's message (text or transcribed voice)
 * @param {object} opts.context      - Player context: word1, word2, city, arMode, matchName, distToMatch
 * @param {string} opts.apiKey       - Gemini API key
 * @returns {Promise<{text:string, action:string|null, raw:string}>}
 */
async function chat({ sessionId, message, context, apiKey }) {
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured. Add it to server/.env');
  if (!message || !message.trim()) throw new Error('Empty message');

  const history = getHistory(sessionId);
  const systemPrompt = buildSystemPrompt(context || {});

  const payload = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [
      ...history,
      { role: 'user', parts: [{ text: message }] }
    ],
    generationConfig: {
      temperature: 0.85,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 300
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
    ]
  };

  const postData = JSON.stringify(payload);
  const fullUrl  = GEMINI_BASE_URL + GEMINI_MODEL + ':generateContent?key=' + apiKey;
  const urlObj   = new URL(fullUrl);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error('[VERA] Gemini: ' + (json.error.message || JSON.stringify(json.error))));

          const responseText = json.candidates && json.candidates[0] &&
            json.candidates[0].content && json.candidates[0].content.parts &&
            json.candidates[0].content.parts[0] && json.candidates[0].content.parts[0].text;

          if (!responseText) return reject(new Error('[VERA] No text in Gemini response'));

          addToHistory(sessionId, 'user',  message);
          addToHistory(sessionId, 'model', responseText);

          // Parse optional action tag e.g. {"action":"OPEN_UNIVERSE"}
          const actionRx  = /\{"action":"([A-Z_]+)"\}/g;
          const actionMatch = actionRx.exec(responseText);
          const action    = actionMatch ? actionMatch[1] : null;
          const speech    = responseText.replace(/\{"action":"[A-Z_]+"\}/g, '').trim();

          resolve({ text: speech, action, raw: responseText });
        } catch (e) {
          reject(new Error('[VERA] Parse error: ' + e.message));
        }
      });
    });

    req.on('error', e => reject(e));
    req.write(postData);
    req.end();
  });
}

/**
 * Generate a welcome greeting when the player enters the app with new words.
 */
async function generateGreeting({ word1, word2, city, apiKey }) {
  const msg = 'I just opened TwoWords and set my two words to "' + word1 + ' ' + word2 +
              '" in ' + (city || 'my city') + '. Give me a short exciting welcome and one specific tip for ' + word1 + ' ' + word2 + '.';
  return chat({
    sessionId: 'greeting_' + Date.now(),
    message:   msg,
    context:   { word1, word2, city },
    apiKey
  });
}

module.exports = { chat, generateGreeting, clearHistory };
