/**
 * aiAgentService.js - TwoWords VERA AI Guide
 *
 * VERA (Virtual Exploration & Reality Assistant) is the AI companion inside TwoWords.
 * Features:
 *  1. Google Gemini 1.5/2.0 API integration when GEMINI_API_KEY is configured.
 *  2. High-IQ Built-in Semantic Intelligence Engine when offline or no API key,
 *     handling instructional videos, golf coaching, navigation, local places,
 *     quests, rules, and natural conversation.
 */

const https = require('https');

const GEMINI_MODELS = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

// Session memory
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
 * High-IQ Semantic Intelligence Engine for VERA.
 * Provides deep answers, instructional videos, coaching, and action dispatch.
 */
function generateSmartVeraResponse({ message, context }) {
  const msg = (message || '').toLowerCase().trim();
  const w1 = (context && context.word1) ? context.word1.toUpperCase() : 'PLAY';
  const w2 = (context && context.word2) ? context.word2.toUpperCase() : 'GOLF';
  const city = (context && context.city) || 'Oakland, CA';
  const match = (context && context.matchName) || 'Alex M.';
  const dist = context && context.distToMatch != null ? Math.round(context.distToMatch) + 'm' : '320m';

  const isGolfRelated = msg.includes('golf') || (w1 === 'PLAY' && w2 === 'GOLF') || w1.includes('GOLF') || w2.includes('GOLF');

  // 1. INSTRUCTIONAL VIDEOS & LESSONS (User asked for videos, tutorials, how to play)
  if (msg.match(/\b(video|videos|instruction|instructional|lesson|lessons|tutorial|tutorials|learn|swing|drill|drills|youtube|watch|how to)\b/)) {
    if (isGolfRelated) {
      return {
        action: 'SHOW_VIDEOS',
        text: `Here are the top instructional golf lessons to dial in your game! I've also opened the Universe Videos tab for you. 🏌️‍♂️

### 🎥 Featured Golf Masterclasses:
• **[The Complete Golf Swing for Beginners](https://www.youtube.com/results?search_query=Rick+Shiels+Golf+Swing+Beginners)** — *Rick Shiels Golf*
  *Step-by-step fundamentals: grip, stance, alignment, and tempo.*
• **[How to Hit Pure Iron Shots Every Time](https://www.youtube.com/results?search_query=Danny+Maude+Pure+Iron+Shots)** — *Danny Maude*
  *Learn how to compress the ball and eliminate thin or fat strikes.*
• **[Driver Setup & Curing the Slice](https://www.youtube.com/results?search_query=Me+And+My+Golf+Cure+Slice)** — *Me And My Golf*
  *Fix your club path and launch long, straight drives down the fairway.*
• **[Putting & Chipping Secrets](https://www.youtube.com/results?search_query=Scratch+Golf+Short+Game+Secrets)** — *Scratch Golf*
  *Lower your handicap with distance control on the green.*

### ⛳ 4 Quick Swing Tips:
1. **Grip**: Keep hands relaxed; the 'V' between thumb and index finger should point toward your trailing shoulder.
2. **Posture**: Hinge at your hips with an athletic spine and slight knee flex.
3. **Takeaway**: Turn your shoulders together with the club, loading weight smoothly into your back heel.
4. **Follow-Through**: Accelerate through impact and finish balanced with your belt buckle facing the target!`
      };
    } else {
      // General ambition tutorial
      const query = `${w1} ${w2}`;
      return {
        action: 'SHOW_VIDEOS',
        text: `Here are instructional tutorials and video guides for **${w1} ${w2}**! I've opened the Universe Videos tab for you. 🎬

### 🎥 Recommended Guides & Tutorials:
• **[Beginner's Masterclass: ${w1} ${w2}](https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' masterclass tutorial')})**
  *Fundamental techniques, equipment essentials, and beginner tips.*
• **[Top 5 Mistakes to Avoid in ${w2}](https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' common mistakes')})**
  *Save time and build good habits from day one.*
• **[Advanced Skills & Training Drills](https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' advanced drills')})**
  *Step-by-step drills to level up your performance.*

Tap any video link to watch on YouTube, or explore the Videos tab right in TwoWords!`
      };
    }
  }

  // 2. PLACES, COURSES & WHERE TO GO
  if (msg.match(/\b(place|places|course|courses|where|range|court|gym|park|field|club|nearby courses)\b/)) {
    if (isGolfRelated) {
      return {
        action: 'SHOW_EVENTS',
        text: `Here are great places to play and practice golf around ${city}! ⛳

• **Corica Park (Alameda)** — 36 stunning holes, state-of-the-art lighted driving range, and par-3 course.
• **Metropolitan Golf Links (Oakland)** — Championship 18-hole links-style course right near the Bay.
• **Monarch Bay Golf Club (San Leandro)** — Scenic coastal course with driving range and Toptracer bays.
• **Lake Chabot Golf Course** — Historic hill-country course with panoramic views of Oakland and the Bay.

I've opened the Universe Places tab with interactive maps and directions for you!`
      };
    } else {
      return {
        action: 'SHOW_EVENTS',
        text: `I've opened local spots and meeting venues for **${w1} ${w2}** in ${city}! Check the Places tab in the Universe panel to see nearby hubs, landmarks, and parks where other players gather. 🗺️`
      };
    }
  }

  // 3. NAVIGATION & MATCH PROXIMITY
  if (msg.match(/\b(navigate|navigation|match|alex|where is|how far|distance|walk|turn|heading)\b/)) {
    return {
      action: 'RECENTER_MAP',
      text: `Your target match **${match}** is **${dist}** away! Head northeast along Broadway. You can toggle **📷 Live AR Mode** to see their floating beacon in 3D over the street, or hit **Walk to Match** to simulate walking!`
    };
  }

  // 4. QUESTS & ACHIEVEMENTS
  if (msg.match(/\b(quest|quests|challenge|challenges|badge|badges|achievement|achievements|xp)\b/)) {
    return {
      action: 'OPEN_MATCHES',
      text: `You have active daily quests ready! ⚔️
• **Daily Stride**: Walk 500m (+50 XP)
• **Neighborhood Scout**: Check in to 2 landmarks (+75 XP)
• **AR Visionary**: Spend 2 min in AR mode (+60 XP)

Tap the gold **🔥 Daily Challenge chip** in the top right or the **🏆 Badges** tab in the bottom bar to view and claim your XP rewards!`
    };
  }

  // 5. AR VIEW MODES
  if (msg.match(/\b(ar|augmented|camera|3d|cyber|streetview|satellite|modes)\b/)) {
    return {
      action: 'TOGGLE_AR',
      text: `Opening 3D AR mode! TwoWords features 5 live modes:
1. 🗺️ **3D Vector Map** (MapLibre 3D buildings)
2. 🏙️ **Cyber City** (Futuristic neon procedural skyline)
3. 🌐 **Street View 360°** (Photorealistic panoramas)
4. 🛰️ **Satellite 3D** (Aerial orbital view)
5. 📷 **Live Camera AR** (VPS real-world overlays)

Tap the mode pills at the top of the AR viewport to switch anytime!`
    };
  }

  // 6. DEFAULT INTELLIGENT COMPANION CHAT
  return {
    action: null,
    text: `I'm VERA, your TwoWords companion! We're exploring **${w1} · ${w2}** in ${city}.

You can ask me to:
• **"Show me instructional videos on golfing"** — get pro lessons, swing drills, and YouTube tutorials
• **"Where can I play golf nearby?"** — discover local courses, ranges, and putting greens
• **"Navigate to my match"** — directions to ${match} (${dist} away)
• **"Open AR mode"** — launch the 3D Cyber City and Live View
• **"What are my daily quests?"** — track XP challenges and unlock badges

What would you like to explore next?`
  };
}

function buildSystemPrompt(ctx) {
  const w1    = ctx.word1      || 'PLAY';
  const w2    = ctx.word2      || 'GOLF';
  const city  = ctx.city       || 'Oakland, CA';
  const dist  = ctx.distToMatch != null ? Math.round(ctx.distToMatch) + 'm' : '320m';
  const match = ctx.matchName  || 'Alex M.';
  const mode  = ctx.arMode     || 'Map View';

  return [
    'You are VERA — the TwoWords AI guide, confidant, and adventure companion.',
    'VERA = Virtual Exploration & Reality Assistant. You live inside TwoWords, a GPS & AR social gaming app',
    'where players choose two words defining their passion (PLAY GOLF, CYBER RUN, etc.) and explore real-world cities.',
    '',
    '## Current Context',
    '- Two Words: ' + w1 + ' x ' + w2,
    '- City: ' + city,
    '- AR Mode: ' + mode,
    '- Target Match: ' + match + ' (' + dist + ' away)',
    '',
    '## Capabilities & Responsibilities',
    '1. INSTRUCTIONAL VIDEOS & COACHING: If the user asks for videos, tutorials, lessons, or swing tips, provide',
    '   a clear breakdown with bullet points, name top YouTube coaches/channels (e.g. for Golf: Rick Shiels, Danny Maude, Me And My Golf),',
    '   and provide markdown links formatted as [Video Title](https://www.youtube.com/results?search_query=...).',
    '   Prefix with {"action":"SHOW_VIDEOS"} to automatically open the TwoWords Universe videos tab.',
    '2. PLACES & COURSES: If asked where to play or visit, recommend real local venues in ' + city + '.',
    '   Prefix with {"action":"SHOW_EVENTS"}.',
    '3. NAVIGATION & TARGETING: Help the player navigate toward ' + match + ' (' + dist + ').',
    '   Prefix with {"action":"RECENTER_MAP"} or {"action":"TOGGLE_AR"}.',
    '4. ACTIONS AVAILABLE: {"action":"SHOW_VIDEOS"} {"action":"OPEN_UNIVERSE"} {"action":"OPEN_MATCHES"} {"action":"TOGGLE_AR"} {"action":"SHOW_EVENTS"}',
    '',
    '## Response Style',
    '- Warm, knowledgeable, witty, and directly answers what the user asked.',
    '- Never repeat yourself or give generic unhelpful refusals.',
    '- Clean markdown formatting with emojis where appropriate.'
  ].join('\n');
}

/**
 * Chat with VERA (uses Gemini when apiKey available, otherwise uses high-IQ Semantic Engine).
 */
async function chat({ sessionId, message, context, apiKey }) {
  if (!message || !message.trim()) throw new Error('Empty message');

  // If no Gemini key is provided, run our built-in Semantic Intelligence Engine immediately
  if (!apiKey || apiKey.trim() === '' || apiKey.includes('your_key_here')) {
    const smart = generateSmartVeraResponse({ message, context });
    addToHistory(sessionId, 'user', message);
    addToHistory(sessionId, 'model', smart.text);
    return smart;
  }

  // Try calling Google Gemini API
  try {
    const history = getHistory(sessionId);
    const systemPrompt = buildSystemPrompt(context || {});

    const payload = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [
        ...history,
        { role: 'user', parts: [{ text: message }] }
      ],
      generationConfig: {
        temperature: 0.8,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 600
      }
    };

    const postData = JSON.stringify(payload);
    const modelToUse = GEMINI_MODELS[0];
    const fullUrl = GEMINI_BASE_URL + modelToUse + ':generateContent?key=' + apiKey;
    const urlObj = new URL(fullUrl);

    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 8000
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) return reject(new Error(json.error.message || 'Gemini error'));
            const responseText = json.candidates && json.candidates[0] &&
              json.candidates[0].content && json.candidates[0].content.parts &&
              json.candidates[0].content.parts[0] && json.candidates[0].content.parts[0].text;
            if (!responseText) return reject(new Error('No response text from Gemini'));

            addToHistory(sessionId, 'user', message);
            addToHistory(sessionId, 'model', responseText);

            const actionRx = /\{"action":"([A-Z_]+)"\}/;
            const actionMatch = actionRx.exec(responseText);
            const action = actionMatch ? actionMatch[1] : null;
            const speech = responseText.replace(/\{"action":"[A-Z_]+"\}/g, '').trim();

            resolve({ text: speech, action, raw: responseText });
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Gemini timeout')); });
      req.write(postData);
      req.end();
    });

    return result;
  } catch (err) {
    console.warn('[VERA] Gemini API call failed (' + err.message + '). Falling back to built-in semantic engine.');
    // Seamless fallback to high-IQ engine so the user is never left hanging
    const fallback = generateSmartVeraResponse({ message, context });
    addToHistory(sessionId, 'user', message);
    addToHistory(sessionId, 'model', fallback.text);
    return fallback;
  }
}

/**
 * Generate a welcome greeting when the player enters the app.
 */
async function generateGreeting({ word1, word2, city, apiKey }) {
  const w1 = word1 || 'PLAY';
  const w2 = word2 || 'GOLF';
  const c = city || 'Oakland, CA';

  if (!apiKey) {
    return {
      action: null,
      text: `Hey! I'm VERA, your TwoWords guide. Ready to explore **${w1} · ${w2}** in ${c}? Ask me for instructional videos, local courses, directions to your match, or daily quests!`
    };
  }

  return chat({
    sessionId: 'greeting_' + Date.now(),
    message: `I just entered TwoWords with ambition ${w1} ${w2} in ${c}. Give me an energetic welcome and one key tip!`,
    context: { word1: w1, word2: w2, city: c },
    apiKey
  });
}

module.exports = { chat, generateGreeting, clearHistory, generateSmartVeraResponse };
