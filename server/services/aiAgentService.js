/**
 * aiAgentService.js - TwoWords GROK-VERA Super Genius AI Agent
 *
 * Combines Grok-style witty, high-energy positive personality with
 * an Algorithmic Telemetry Matrix that crunches real-time player telemetry:
 *  - Ambition vector & semantic domain
 *  - Player coordinates, heading & city
 *  - Match proximity, closing velocity & ETA
 *  - Fitness kinematics (distance walked, pace, calories burned, vibe momentum)
 *
 * Supported Providers:
 *  1. Local Super-Genius Proxy (http://localhost:8080/v1/messages, gemini-3.8-flash-tiered / claude-sonnet-4-6)
 *  2. xAI Grok API (https://api.x.ai/v1/chat/completions, grok-2 / grok-beta)
 *  3. Google Gemini API (generativelanguage.googleapis.com)
 *  4. OpenAI API (api.openai.com/v1/chat/completions, gpt-4o)
 *  5. Built-in Algorithmic Neural Matrix Engine (zero-dependency mathematical synthesis)
 */

const http = require('http');
const https = require('https');

// Memory per session
const sessions = new Map();
const MAX_HISTORY = 12;

function getHistory(sessionId) {
  if (!sessions.has(sessionId)) sessions.set(sessionId, []);
  return sessions.get(sessionId);
}

function addToHistory(sessionId, role, text) {
  const h = getHistory(sessionId);
  h.push({ role, text });
  if (h.length > MAX_HISTORY * 2) h.splice(0, 2);
}

function clearHistory(sessionId) {
  sessions.delete(sessionId);
}

/**
 * Algorithmic Telemetry Matrix Cruncher.
 * Mathematically analyzes incoming player state to build a real-time behavioral & kinematic profile.
 */
function crunchPlayerTelemetry(context = {}) {
  const w1 = (context.word1 || 'PLAY').toUpperCase();
  const w2 = (context.word2 || 'GOLF').toUpperCase();
  const playerLat = Number(context.lat) || 37.804456;
  const playerLon = Number(context.lon) || -122.271356;
  const heading = Number(context.heading) || 45;
  const distToMatch = context.distToMatch != null ? Math.round(Number(context.distToMatch)) : 320;
  const distanceWalked = Math.round(Number(context.distanceWalked) || 0);
  const city = context.city || 'Oakland, CA';
  const matchName = context.matchName || 'Alex M.';
  const mode = context.arMode || 'Map View';

  // 1. Ambition Category Analysis
  const ambitionStr = `${w1} ${w2}`;
  let category = 'Lifestyle & Recreation';
  let domain = 'General Exploration';
  if (ambitionStr.match(/GOLF|TENNIS|RUN|HIKE|SWIM|WORKOUT|GYM|FIT/)) {
    category = 'Physical & Athletic Mastery';
    domain = 'Sports & Precision Kinematics';
  } else if (ambitionStr.match(/CODE|HACK|BUILD|CYBER|TECH|AI|ROBOT/)) {
    category = 'Cybernetic & Technology Creation';
    domain = 'High-Tech Engineering & Cybernetics';
  } else if (ambitionStr.match(/FOOD|EAT|RAMEN|COFFEE|COOK|BAKE|TACO/)) {
    category = 'Culinary & Sensory Discovery';
    domain = 'Gastronomy & Local Tastes';
  } else if (ambitionStr.match(/BEACH|CHILL|NIGHT|WALK|MUSIC|ART|PHOTO/)) {
    category = 'Creative & Aesthetic Exploration';
    domain = 'Visual Arts & Cultural Pulse';
  }

  // 2. Kinematics & Energy Metrics
  const caloriesBurned = Math.round(distanceWalked * 0.045);
  const stepsEstimated = Math.round(distanceWalked * 1.35);
  const etaMinutes = (distToMatch / 1.4 / 60).toFixed(1); // average walking speed 1.4 m/s
  const vibeMomentum = Math.min(100, Math.round(45 + (distanceWalked / 12) + (distToMatch < 100 ? 30 : 0)));

  const digest = `[CRUNCHED TELEMETRY MATRIX]
• Ambition Vector: ${w1} x ${w2} (Domain: ${domain} | Category: ${category})
• Real-Time Location: ${playerLat.toFixed(5)}, ${playerLon.toFixed(5)} in ${city}
• Kinematics: ${distanceWalked}m walked today | Calories: ${caloriesBurned} kcal | Steps: ${stepsEstimated}
• Target Vector: Match with "${matchName}" at ${distToMatch}m distance (Walking ETA: ~${etaMinutes} mins)
• Navigation Compass: Heading ${heading}° | Viewport: ${mode}
• Algorithmic Vibe Momentum Score: ${vibeMomentum}%`;

  return {
    w1, w2,
    ambition: `${w1} · ${w2}`,
    category, domain,
    playerLat, playerLon, heading,
    distToMatch, matchName, city,
    distanceWalked, caloriesBurned, stepsEstimated,
    etaMinutes, vibeMomentum, mode,
    digest
  };
}

/**
 * Builds the Grok-Style Super-Genius System Prompt with crunched telemetry.
 */
function buildGrokSystemPrompt(telemetry) {
  return `You are GROK-VERA (VERA 2.0) — the hyper-intelligent, witty, highly energetic AI companion and real-time strategist in TwoWords.

## CORE PERSONALITY & IDENTITY
- You possess the sharp wit, unfiltered brilliance, relentless optimism, and infectious humor of Grok and JARVIS combined.
- You think in first principles and celebrate the player's ambition! You are genuinely stoked to help them level up.
- You are not a boring corporate bot. You speak with punchy, high-energy charisma.
- You crunch live telemetry from their device (coordinates, speed, heading, distance, ambition) and turn it into brilliant insights.

${telemetry.digest}

## CRITICAL CAPABILITIES:
1. INSTRUCTIONAL VIDEOS & LESSONS:
   When asked for videos, tutorials, lessons, or tips (e.g. Golf swing, running pace, cooking, coding):
   - Deliver enthusiastic, witty Grok-level commentary.
   - List 4 real, world-class YouTube masterclasses formatted as [Title](https://www.youtube.com/results?search_query=...). For Golf: recommend top creators like Rick Shiels, Danny Maude, Me And My Golf, Scratch Golf.
   - Break down 4 first-principles physics fundamentals (e.g. Grip, Stance, Hip Rotation/Lag, Follow-Through).
   - ALWAYS include the action tag {"action":"SHOW_VIDEOS"} so the game automatically opens the TwoWords Universe Videos tab.
2. LOCAL VENUES & PLACES:
   When asked where to go or play (e.g. golf courses in ${telemetry.city}):
   - Recommend real landmarks (e.g. Corica Park, Metropolitan Golf Links, Monarch Bay, Lake Chabot).
   - Include {"action":"SHOW_EVENTS"}.
3. NAVIGATION & TARGETING:
   - Provide directional guidance toward ${telemetry.matchName} (${telemetry.distToMatch}m away, ETA ${telemetry.etaMinutes} min).
   - Include {"action":"RECENTER_MAP"} or {"action":"TOGGLE_AR"}.
4. ACTION TAGS:
   {"action":"SHOW_VIDEOS"}  {"action":"SHOW_EVENTS"}  {"action":"OPEN_MATCHES"}  {"action":"TOGGLE_AR"}  {"action":"RECENTER_MAP"}

## FORMATTING:
Use clean markdown with headers (###), bold text (**text**), bullet points, and action tags.`;
}

/**
 * Call Local Claude/Gemini Proxy (localhost:8080/v1/messages).
 */
function callLocalProxy({ systemPrompt, message, history }) {
  return new Promise((resolve, reject) => {
    const formattedMessages = [];
    history.forEach(h => {
      formattedMessages.push({
        role: h.role === 'model' || h.role === 'assistant' ? 'assistant' : 'user',
        content: h.text
      });
    });
    formattedMessages.push({ role: 'user', content: message });

    const payload = JSON.stringify({
      model: 'gemini-3.8-flash-tiered',
      max_tokens: 750,
      system: systemPrompt,
      messages: formattedMessages
    });

    const req = http.request({
      hostname: 'localhost',
      port: 8080,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'dummy',
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const replyText = json.content && json.content[0] ? json.content[0].text : null;
          if (!replyText) return reject(new Error('Empty response from local proxy'));
          resolve(replyText);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Local proxy timeout')); });
    req.write(payload);
    req.end();
  });
}

/**
 * Call xAI Grok API (https://api.x.ai/v1/chat/completions).
 */
function callXAI({ apiKey, systemPrompt, message, history }) {
  return new Promise((resolve, reject) => {
    const messages = [{ role: 'system', content: systemPrompt }];
    history.forEach(h => {
      messages.push({
        role: h.role === 'model' || h.role === 'assistant' ? 'assistant' : 'user',
        content: h.text
      });
    });
    messages.push({ role: 'user', content: message });

    const payload = JSON.stringify({
      model: 'grok-beta',
      messages,
      temperature: 0.85,
      max_tokens: 700
    });

    const req = https.request({
      hostname: 'api.x.ai',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(json.error.message || 'xAI error'));
          const text = json.choices && json.choices[0] && json.choices[0].message ? json.choices[0].message.content : null;
          if (!text) return reject(new Error('No response from xAI'));
          resolve(text);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('xAI timeout')); });
    req.write(payload);
    req.end();
  });
}

/**
 * Call Google Gemini REST API.
 */
function callGemini({ apiKey, systemPrompt, message, history }) {
  return new Promise((resolve, reject) => {
    const contents = [];
    history.forEach(h => {
      contents.push({
        role: h.role === 'model' || h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.text }]
      });
    });
    contents.push({ role: 'user', parts: [{ text: message }] });

    const payload = JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.85, maxOutputTokens: 700 }
    });

    const fullUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const urlObj = new URL(fullUrl);

    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(json.error.message || 'Gemini error'));
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) return reject(new Error('No response from Gemini'));
          resolve(text);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Gemini timeout')); });
    req.write(payload);
    req.end();
  });
}

/**
 * High-IQ Autonomous Algorithmic Neural Matrix Engine.
 * Formulates brilliant Grok-style responses using crunched telemetry when offline or APIs are unavailable.
 */
function generateAlgorithmicNeuralResponse({ message, telemetry }) {
  const msg = (message || '').toLowerCase().trim();
  const { w1, w2, city, matchName, distToMatch, etaMinutes, vibeMomentum } = telemetry;
  const isGolf = msg.includes('golf') || `${w1} ${w2}`.includes('GOLF');

  // Instructional Videos
  if (msg.match(/\b(video|videos|instruction|instructional|lesson|lessons|tutorial|tutorials|learn|swing|drill|drills|youtube|watch|how to)\b/)) {
    if (isGolf) {
      return {
        action: 'SHOW_VIDEOS',
        text: `### 🏌️ Let's Get Your Swing Dialed In, Legend! ⛳
Alex M. is only **${distToMatch}m** away (~${etaMinutes} mins), so let's make sure you're ready to hit absolute missiles down the fairway! I've opened the **Universe Videos** tab for you.

### 🎥 4 World-Class Golf Masterclasses:
• **[The Complete Golf Swing for Beginners](https://www.youtube.com/results?search_query=Rick+Shiels+complete+golf+swing+beginners)** — *Rick Shiels Golf*
  *Step-by-step foundation: grip, posture, alignment, and fluid tempo.*
• **[Simple Golf Swing That Purely Compresses](https://www.youtube.com/results?search_query=Danny+Maude+pure+iron+shots)** — *Danny Maude*
  *Learn how to strike the ball before the turf for effortless compression.*
• **[Driver Setup & Curing the Slice Forever](https://www.youtube.com/results?search_query=Me+And+My+Golf+cure+slice)** — *Me And My Golf*
  *Fix your clubface path and unlock 20+ extra yards off the tee.*
• **[Putting & Chipping Short-Game Secrets](https://www.youtube.com/results?search_query=Scratch+Golf+short+game+secrets)** — *Scratch Golf*
  *Distance control and green-reading hacks to save strokes.*

### ⚙️ 4 First-Principles Swing Mechanics:
1. **Grip (Handshake Pressure 6/10)**: Neutral grip with both V's pointing to your trailing shoulder. Never death-grip the club.
2. **Stance (Launch Pad)**: Hinge at the hips, athletic knee flex, spine tilted ~30°, weight balanced 50/50.
3. **Hip Rotation & Lag**: Start downswing with the lower body uncoiling first; hold wrist lag to unleash stored kinetic energy.
4. **Follow-Through**: Accelerate through the ball and finish tall with your belt buckle facing the target!

⚡ **Vibe Momentum: ${vibeMomentum}%** — Watch one video, lock in the grip, and let's get you in the zone!`
      };
    } else {
      const q = `${w1} ${w2}`;
      return {
        action: 'SHOW_VIDEOS',
        text: `### 🚀 Masterclass Guides for ${w1} ${w2}!
Telemetry shows your vibe momentum at **${vibeMomentum}%**. I've opened the **Universe Videos** tab with curated guides!

### 🎥 Recommended Tutorials:
• **[Beginner's Masterclass: ${w1} ${w2}](https://www.youtube.com/results?search_query=${encodeURIComponent(q + ' masterclass')})**
• **[Pro Mechanics & Common Pitfalls](https://www.youtube.com/results?search_query=${encodeURIComponent(q + ' tutorial drills')})**
• **[Daily Training Drills & Routines](https://www.youtube.com/results?search_query=${encodeURIComponent(q + ' advanced training')})**

Tap any link to watch on YouTube or explore the Videos tab right in TwoWords!`
      };
    }
  }

  // Places & Courses
  if (msg.match(/\b(place|places|course|courses|where|range|court|gym|park|field|club|nearby)\b/)) {
    if (isGolf) {
      return {
        action: 'SHOW_EVENTS',
        text: `### ⛳ Top Golf Courses & Ranges around ${city}:
• **Corica Park (Alameda)** — 36 award-winning holes, Australian sand-belt styling, and Toptracer driving range.
• **Metropolitan Golf Links (Oakland)** — Championship links course near the water with scenic Bay views.
• **Monarch Bay Golf Club (San Leandro)** — Coastal greens, lighted practice facilities, and bay-side driving bays.
• **Lake Chabot Golf Course** — Rolling hillside fairways with panoramic city vistas.

I've opened the Universe Places tab with interactive maps and directions for you! 🗺️`
      };
    } else {
      return {
        action: 'SHOW_EVENTS',
        text: `I've opened local spots and gathering hubs for **${w1} ${w2}** in ${city}! Check the Places tab in the Universe panel. 🗺️`
      };
    }
  }

  // Navigation
  if (msg.match(/\b(navigate|navigation|match|where is|how far|distance|walk|turn|heading)\b/)) {
    return {
      action: 'RECENTER_MAP',
      text: `Your target match **${matchName}** is **${distToMatch}m** away (~${etaMinutes} min walk). Heading is aligned! Tap **📷 Live AR Mode** to see their floating 3D beacon over the skyline!`
    };
  }

  // Default Grok witty response
  return {
    action: null,
    text: `⚡ **GROK-VERA Live Telemetry Active!**
Ambition: **${w1} · ${w2}** in ${city} | Vibe Momentum: **${vibeMomentum}%**

Ask me for:
• 🎥 *"Show me instructional videos on golfing"* — pro lessons, YouTube masterclasses, and swing physics
• ⛳ *"Where can I play golf nearby?"* — top local courses, ranges, and putting greens
• 🎯 *"Navigate to ${matchName}"* — live directional guidance (${distToMatch}m away)
• ⚔️ *"What are my daily quests?"* — claim XP and unlock badges

What are we conquering next? 🚀`
  };
}

/**
 * Main chat handler.
 * Crunches telemetry, chooses best available AI brain, and dispatches actions.
 */
async function chat({ sessionId, message, context, apiKey }) {
  if (!message || !message.trim()) throw new Error('Empty message');

  // Step 1: Crunch real-time player telemetry
  const telemetry = crunchPlayerTelemetry(context);
  const systemPrompt = buildGrokSystemPrompt(telemetry);
  const history = getHistory(sessionId);

  let rawResponse = null;

  // Step 2: Route to best available Super-Genius AI model
  // Priority A: xAI Grok (if key provided)
  const xaiKey = process.env.XAI_API_KEY || (apiKey && apiKey.startsWith('xai-') ? apiKey : null);
  if (xaiKey) {
    try {
      rawResponse = await callXAI({ apiKey: xaiKey, systemPrompt, message, history });
    } catch(e) {
      console.warn('[GROK-VERA] xAI call failed:', e.message);
    }
  }

  // Priority B: Local Proxy (Active Claude / Gemini proxy on localhost:8080)
  if (!rawResponse) {
    try {
      rawResponse = await callLocalProxy({ systemPrompt, message, history });
    } catch(e) {
      console.warn('[GROK-VERA] Local proxy call failed or offline:', e.message);
    }
  }

  // Priority C: Google Gemini API (if key provided)
  const geminiKey = process.env.GEMINI_API_KEY || (apiKey && apiKey.startsWith('AIza') ? apiKey : null);
  if (!rawResponse && geminiKey) {
    try {
      rawResponse = await callGemini({ apiKey: geminiKey, systemPrompt, message, history });
    } catch(e) {
      console.warn('[GROK-VERA] Gemini call failed:', e.message);
    }
  }

  // Priority D: Autonomous Algorithmic Neural Matrix Engine
  if (!rawResponse) {
    const algo = generateAlgorithmicNeuralResponse({ message, telemetry });
    addToHistory(sessionId, 'user', message);
    addToHistory(sessionId, 'model', algo.text);
    return { ...algo, telemetry };
  }

  // Parse action from AI output
  const actionRx = /\{"action":"([A-Z_]+)"\}/;
  const actionMatch = actionRx.exec(rawResponse);
  const action = actionMatch ? actionMatch[1] : null;
  const speech = rawResponse.replace(/\{"action":"[A-Z_]+"\}/g, '').trim();

  addToHistory(sessionId, 'user', message);
  addToHistory(sessionId, 'model', speech);

  return { text: speech, action, raw: rawResponse, telemetry };
}

/**
 * Generate energetic Grok greeting.
 */
async function generateGreeting({ word1, word2, city, apiKey }) {
  const context = { word1, word2, city };
  return chat({
    sessionId: 'greeting_' + Date.now(),
    message: `I just entered TwoWords with ambition ${word1 || 'PLAY'} ${word2 || 'GOLF'} in ${city || 'Oakland'}. Give me an energetic, witty Grok-style welcome and one golden tip!`,
    context,
    apiKey
  });
}

module.exports = {
  chat,
  generateGreeting,
  clearHistory,
  crunchPlayerTelemetry,
  generateAlgorithmicNeuralResponse
};
