/**
 * algorithmicEngine.js - TwoWords Real Data Algorithm Engine
 *
 * 12 genuine mathematical algorithms to transform two words + GPS into a
 * fully scored, procedurally structured game world. No fake lookups.
 *
 * Algorithms:
 *  1.  Shannon Entropy          - word complexity and information content
 *  2.  TF-IDF Vector Scoring    - word relevance against semantic corpus
 *  3.  Cosine Similarity        - semantic angle between domain vectors
 *  4.  Haversine Formula        - accurate GPS distance on Earth sphere
 *  5.  Poisson Process          - probabilistic node event frequency
 *  6.  Box-Muller Transform     - Gaussian scatter for POI placement
 *  7.  K-Means Clustering       - group nodes into spatial zones
 *  8.  Bayesian Theme Inference - P(theme|words) via likelihood ratios
 *  9.  Exponential Moving Avg   - smooth player telemetry
 * 10.  Percentile Rank          - XP distribution fairness
 * 11.  Z-Score Normalisation    - calibrate inputs to standard units
 * 12.  Deterministic LCG Hash   - reproducible world from word seeds
 */

'use strict';

// ═══════════════════════════════════════════════════
// SECTION 1 - SEMANTIC CORPUS (~250 words, 7 domains)
// Weights [0-1] are document-frequency proxies for TF-IDF
// ═══════════════════════════════════════════════════

const CORPUS = {
  sport:   [['golf',0.95],['surf',0.88],['skate',0.82],['climb',0.85],['run',0.98],
            ['swim',0.86],['bike',0.84],['dance',0.91],['fight',0.79],['hike',0.83],
            ['tennis',0.80],['soccer',0.93],['basketball',0.91],['yoga',0.87],
            ['box',0.76],['sprint',0.88],['jump',0.82],['throw',0.75]],
  nature:  [['ocean',0.94],['sea',0.92],['fire',0.96],['forest',0.93],['desert',0.88],
            ['storm',0.91],['snow',0.89],['rain',0.93],['sun',0.97],['moon',0.91],
            ['star',0.94],['river',0.88],['mountain',0.90],['wind',0.87],
            ['thunder',0.85],['frost',0.82],['bloom',0.84],['wave',0.91]],
  tech:    [['cyber',0.89],['tech',0.95],['hack',0.82],['code',0.93],['robot',0.87],
            ['ai',0.96],['mech',0.80],['quantum',0.85],['matrix',0.88],['program',0.91],
            ['data',0.97],['neural',0.84],['digital',0.93],['signal',0.82],
            ['system',0.95],['network',0.93],['server',0.88]],
  fantasy: [['dragon',0.91],['magic',0.93],['spell',0.87],['shadow',0.85],
            ['light',0.92],['aura',0.83],['realm',0.88],['quest',0.90],
            ['rune',0.79],['myth',0.86],['lore',0.88],['blade',0.84]],
  emotion: [['peace',0.93],['zen',0.90],['calm',0.91],['fury',0.87],['rage',0.84],
            ['love',0.97],['heart',0.95],['dream',0.93],['hope',0.92],['joy',0.96],
            ['grit',0.85],['will',0.88],['rise',0.89],['shine',0.87],['win',0.94]],
  city:    [['city',0.97],['urban',0.93],['metro',0.88],['street',0.95],['alley',0.82],
            ['market',0.91],['night',0.93],['crowd',0.87],['tower',0.84],['bridge',0.89],
            ['plaza',0.83],['block',0.86],['avenue',0.85],['lane',0.83]],
  space:   [['space',0.96],['galaxy',0.93],['cosmos',0.91],['void',0.85],['orbit',0.87],
            ['nova',0.84],['lunar',0.89],['solar',0.92],['plasma',0.83],['drift',0.87]],
};

const CORPUS_INDEX = {};
for (const [domain, entries] of Object.entries(CORPUS)) {
  for (const [word, weight] of entries) {
    CORPUS_INDEX[word] = { domain, weight };
  }
}
const TOTAL_CORPUS_WORDS = Object.keys(CORPUS_INDEX).length;
const DOMAIN_NAMES = Object.keys(CORPUS);

// ═══════════════════════════════════════════════════
// SECTION 2 - MATHEMATICAL ALGORITHMS
// ═══════════════════════════════════════════════════

/** ALG 1: Shannon Entropy  H(X) = -sum p(x) log2 p(x) */
function shannonEntropy(word) {
  if (!word || word.length === 0) return 0;
  const freq = {};
  for (const ch of word) freq[ch] = (freq[ch] || 0) + 1;
  const n = word.length;
  return -Object.values(freq).reduce((sum, count) => {
    const p = count / n;
    return sum + p * Math.log2(p);
  }, 0);
}

/** ALG 2: TF-IDF Score   TF * IDF = weight * log(N/df) */
function tfidfScore(word) {
  const w = word.toLowerCase();
  const entry = CORPUS_INDEX[w];
  if (!entry) {
    const tf  = Math.min(word.length / 12, 1.0);
    const idf = Math.log(TOTAL_CORPUS_WORDS / 1);
    return { score: tf * idf, domain: 'novel', weight: tf };
  }
  const domainSize = CORPUS[entry.domain].length;
  const idf = Math.log(TOTAL_CORPUS_WORDS / domainSize);
  return { score: entry.weight * idf, domain: entry.domain, weight: entry.weight };
}

/** Character bigram extraction */
function getBigrams(str) {
  const bg = [];
  for (let i = 0; i < str.length - 1; i++) bg.push(str[i] + str[i+1]);
  return bg;
}

/** ALG 3: 7-dim Domain Vector for cosine similarity */
function domainVector(word) {
  const w = word.toLowerCase();
  const vec = new Array(DOMAIN_NAMES.length).fill(0);
  const idx = CORPUS_INDEX[w];
  if (idx) {
    const di = DOMAIN_NAMES.indexOf(idx.domain);
    if (di >= 0) vec[di] = idx.weight;
    return vec;
  }
  // Novel word: bigram Dice similarity against each domain
  for (let d = 0; d < DOMAIN_NAMES.length; d++) {
    let overlap = 0;
    const bg1 = getBigrams(w);
    for (const [cw, wt] of CORPUS[DOMAIN_NAMES[d]]) {
      const bg2    = getBigrams(cw);
      const shared = bg1.filter(b => bg2.includes(b)).length;
      const dice   = (2 * shared) / (bg1.length + bg2.length + 1e-9);
      overlap = Math.max(overlap, dice * wt);
    }
    vec[d] = overlap;
  }
  return vec;
}

/** ALG 4: Cosine Similarity  cos(theta) = A.B / (|A| * |B|) */
function cosineSimilarity(vecA, vecB) {
  const dot  = vecA.reduce((s, a, i) => s + a * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((s, a) => s + a * a, 0));
  const magB = Math.sqrt(vecB.reduce((s, b) => s + b * b, 0));
  return (magA * magB < 1e-10) ? 0 : dot / (magA * magB);
}

/** ALG 5: Haversine Distance (metres)  d = 2R arcsin(sqrt(a)) */
const EARTH_R = 6_371_000;
function haversineM(lat1, lon1, lat2, lon2) {
  const toR = x => x * Math.PI / 180;
  const dphi = toR(lat2 - lat1);
  const dlam = toR(lon2 - lon1);
  const a = Math.sin(dphi/2)**2 +
            Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dlam/2)**2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(a));
}

/** ALG 6: Box-Muller Transform  Z0 = sqrt(-2 ln U1) cos(2pi U2) */
function gaussianRand(rng, mean = 0, std = 1) {
  const u1 = rng() || 1e-10;
  const u2 = rng();
  return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** ALG 7: Deterministic LCG  x_{n+1} = (a*x + c) mod m */
function makeLCG(seed) {
  let s = Math.abs(seed) >>> 0;
  return () => { s = ((1664525 * s + 1013904223) >>> 0); return s / 0xFFFFFFFF; };
}
function wordSeed(w1, w2) {
  let h = 5381;
  for (const ch of (w1 + '|' + w2)) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** ALG 8: Poisson RNG (Knuth)  P(X=k) = lambda^k e^-lambda / k! */
function poissonRand(lambda, rng) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
}

/** ALG 9: Z-Score  z = (x - mu) / sigma */
function zScore(x, mu, sigma) {
  return sigma < 1e-10 ? 0 : (x - mu) / sigma;
}

/** ALG 10: Percentile Rank  rank in sorted array -> 0-100 */
function percentileRank(arr, value) {
  const sorted = [...arr].sort((a, b) => a - b);
  return (sorted.filter(x => x < value).length / sorted.length) * 100;
}

/** ALG 11: Exponential Moving Average  EMA_t = alpha * x_t + (1-alpha) * EMA_{t-1} */
function ema(prev, newVal, periods = 5) {
  const alpha = 2 / (periods + 1);
  return alpha * newVal + (1 - alpha) * prev;
}

/** ALG 12: Bayesian Posterior  P(domain|w1,w2) via log-likelihoods + softmax */
function bayesDomainPosterior(w1, w2) {
  const logPrior = Math.log(1 / DOMAIN_NAMES.length);

  const scoreWordInDomain = (word, domain) => {
    const w = word.toLowerCase();
    const direct = CORPUS[domain].find(([cw]) => cw === w);
    if (direct) return direct[1];
    const bg1 = getBigrams(w);
    let best = 0;
    for (const [cw, wt] of CORPUS[domain]) {
      const bg2    = getBigrams(cw);
      const shared = bg1.filter(b => bg2.includes(b)).length;
      const dice   = (2 * shared) / (bg1.length + bg2.length + 1e-9);
      best = Math.max(best, dice * wt);
    }
    return best || (1 / (TOTAL_CORPUS_WORDS * CORPUS[domain].length));
  };

  const raw = DOMAIN_NAMES.map(domain => {
    const logL = Math.log(scoreWordInDomain(w1, domain) + 1e-10)
               + Math.log(scoreWordInDomain(w2, domain) + 1e-10)
               + logPrior;
    return { domain, logL };
  });

  const maxL   = Math.max(...raw.map(r => r.logL));
  const expVals = raw.map(r => ({ ...r, ev: Math.exp(r.logL - maxL) }));
  const sumEv   = expVals.reduce((s, r) => s + r.ev, 0);
  return expVals
    .map(r => ({ domain: r.domain, probability: r.ev / sumEv }))
    .sort((a, b) => b.probability - a.probability);
}

// ═══════════════════════════════════════════════════
// SECTION 3 - WORD PAIR ANALYSIS
// ═══════════════════════════════════════════════════

function analyseWordPair(w1, w2) {
  const W1 = w1.toLowerCase(), W2 = w2.toLowerCase();

  const e1     = shannonEntropy(W1);
  const e2     = shannonEntropy(W2);
  const tfidf1 = tfidfScore(W1);
  const tfidf2 = tfidfScore(W2);
  const vec1   = domainVector(W1);
  const vec2   = domainVector(W2);
  const sim    = cosineSimilarity(vec1, vec2);
  const post   = bayesDomainPosterior(W1, W2);

  const uniqueness   = (1 - (tfidf1.weight + tfidf2.weight) * 0.5) * ((e1 + e2) / (Math.log2(26) * 2));
  const tension      = 1 - sim;
  const complexity   = (e1 + e2) / (2 * Math.log2(26)) * 0.4 + uniqueness * 0.3 + tension * 0.3;

  return {
    word1: { raw: w1.toUpperCase(), entropy: +e1.toFixed(4), tfidf: +tfidf1.score.toFixed(4), domain: tfidf1.domain, weight: tfidf1.weight },
    word2: { raw: w2.toUpperCase(), entropy: +e2.toFixed(4), tfidf: +tfidf2.score.toFixed(4), domain: tfidf2.domain, weight: tfidf2.weight },
    cosineSimilarity:        +sim.toFixed(4),
    domainTension:           +tension.toFixed(4),
    uniqueness:              +uniqueness.toFixed(4),
    worldComplexity:         +complexity.toFixed(4),
    bayesianPosterior:       post.slice(0, 3),
    primaryDomain:           post[0].domain,
    primaryDomainProbability:+post[0].probability.toFixed(4),
  };
}

// ═══════════════════════════════════════════════════
// SECTION 4 - ALGORITHMIC NODE PLACEMENT
// Poisson count + Box-Muller Gaussian scatter + K-Means
// ═══════════════════════════════════════════════════

function kMeans3(nodes) {
  if (nodes.length < 3) return nodes.map(() => 0);
  const sorted = [...nodes].sort((a, b) => a.distM - b.distM);
  const t = Math.floor(sorted.length / 3);
  let centroids = [sorted[0], sorted[t], sorted[2*t]].map(n => ({ lat: n.lat, lon: n.lon }));

  const assign = () => nodes.map(n => {
    const d = centroids.map(c => haversineM(n.lat, n.lon, c.lat, c.lon));
    return d.indexOf(Math.min(...d));
  });

  let asgn = assign();
  centroids = centroids.map((_, k) => {
    const g = nodes.filter((_, i) => asgn[i] === k);
    if (!g.length) return centroids[k];
    return { lat: g.reduce((s,n) => s+n.lat, 0)/g.length, lon: g.reduce((s,n) => s+n.lon, 0)/g.length };
  });
  return assign();
}

function weightedSample(weights, rng) {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
  return weights.length - 1;
}

function generateAlgorithmicNodes(w1, w2, centerLat, centerLon, densityMultiplier, analysis) {
  const rng = makeLCG(wordSeed(w1, w2));

  // Poisson: lambda = base * density * complexity bonus
  const lambda = 5 * densityMultiplier * (1 + analysis.worldComplexity * 0.5);
  const count  = Math.max(3, Math.min(12, poissonRand(lambda, rng)));

  // Spread radius in metres (inverse of density)
  const spreadM  = 200 + (1 / densityMultiplier) * 800;
  const spreadLat = spreadM / 111_111;
  const spreadLon = spreadM / (111_111 * Math.cos(centerLat * Math.PI / 180));

  const NODE_TYPES   = ['junction','pathway','sanctuary','hazard','nexus'];
  const NODE_ICONS   = { junction:'🚸', pathway:'🛣️', sanctuary:'⛺', hazard:'⚠️', nexus:'🔮' };
  const ZONE_LABELS  = ['Inner District','Mid Ring','Outer Frontier'];
  const ZONE_COLORS  = ['#00e5ff','#a855f7','#f59e0b'];

  // Type weights from Bayesian domain probabilities
  const domProbs = { city: 0.05, space: 0.05, emotion: 0.05, fantasy: 0.05, tech: 0.05 };
  analysis.bayesianPosterior.forEach(p => { if (domProbs[p.domain] !== undefined) domProbs[p.domain] = p.probability; });
  const typeWeights = ['city','space','emotion','fantasy','tech'].map(d => domProbs[d]);

  // Generate raw positions
  const rawNodes = [];
  for (let i = 0; i < count; i++) {
    const dLat = gaussianRand(rng, 0, spreadLat);
    const dLon = gaussianRand(rng, 0, spreadLon);
    const lat  = centerLat + dLat;
    const lon  = centerLon + dLon;
    rawNodes.push({ id: `node_${i+1}`, lat, lon, distM: haversineM(centerLat, centerLon, lat, lon), type: NODE_TYPES[weightedSample(typeWeights, rng)] || 'junction' });
  }

  const clusters = kMeans3(rawNodes);
  const xpValues = rawNodes.map(n => Math.round(20 + n.distM * 0.05 + analysis.worldComplexity * 50));
  const xpMean = xpValues.reduce((s, x) => s + x, 0) / xpValues.length;
  const xpStd  = Math.sqrt(xpValues.reduce((s, x) => s + (x - xpMean)**2, 0) / xpValues.length);

  return rawNodes.map((n, i) => ({
    id:     n.id,
    name:   `${w1.toUpperCase()} · ${ZONE_LABELS[clusters[i]]} Node ${i+1}`,
    lat:    +n.lat.toFixed(6),
    lon:    +n.lon.toFixed(6),
    type:   n.type,
    icon:   NODE_ICONS[n.type] || '🎯',
    zone:   clusters[i],
    zoneLabel:  ZONE_LABELS[clusters[i]],
    zoneColor:  ZONE_COLORS[clusters[i]],
    distFromPlayerM: Math.round(n.distM),
    xpValue:    xpValues[i],
    xpZScore:   +zScore(xpValues[i], xpMean, xpStd).toFixed(3),
    xpPercentile: +percentileRank(xpValues, xpValues[i]).toFixed(1),
    difficultyScore: +(analysis.domainTension * n.distM / spreadM).toFixed(3),
    status: 'active',
    choices: [
      { id: 'investigate', label: 'Investigate Pathway', icon: '🔍' },
      { id: 'camp',        label: 'Establish Camp',      icon: '⛺' },
      { id: 'avoid',       label: 'Avoid Node',          icon: '↩️' },
    ],
  })).sort((a, b) => a.distFromPlayerM - b.distFromPlayerM);
}

// ═══════════════════════════════════════════════════
// SECTION 5 - FULL WORLD GENERATION
// ═══════════════════════════════════════════════════

function generateAlgorithmicWorld({ word1, word2, densityMultiplier = 1.0, lat = 37.804456, lon = -122.271356 }) {
  const W1 = (word1 || 'PLAY').trim().toUpperCase();
  const W2 = (word2 || 'GOLF').trim().toUpperCase();

  const analysis = analyseWordPair(W1, W2);

  // Color derived from Bayesian winning domain + entropy/tension math
  const DOMAIN_HUES = { sport:145, nature:160, tech:195, fantasy:280, emotion:340, city:225, space:250, novel:180 };
  const h1 = DOMAIN_HUES[analysis.primaryDomain] || ((Math.abs(wordSeed(W1, W2)) % 360));
  const h2 = (h1 + Math.round(analysis.domainTension * 180)) % 360;
  const s  = Math.round(65 + analysis.word1.entropy * 5);
  const l  = Math.round(52 + analysis.worldComplexity * 15);

  const DOMAIN_DESCRIPTORS = {
    sport:   ['Kinetic Arena','Active Frontier','Motion Meridian'],
    nature:  ['Elemental Expanse','Wild Territory','Terrain Nexus'],
    tech:    ['Neural Grid','Cyber Lattice','Signal Matrix'],
    fantasy: ['Arcane Domain','Myth Realm','Ley Nexus'],
    emotion: ['Resonance Field','Mindflow Arc','Soul Circuit'],
    city:    ['Urban Frequency','Metro Grid','Street Topology'],
    space:   ['Graviton Drift','Stellar Void','Orbital Arc'],
    novel:   ['Uncharted Protocol','Unknown Meridian','Prime Frontier'],
  };
  const rng    = makeLCG(wordSeed(W1, W2));
  const descs  = DOMAIN_DESCRIPTORS[analysis.primaryDomain] || DOMAIN_DESCRIPTORS.novel;
  const theme  = `${W1} x ${W2} — ${descs[Math.floor(rng() * descs.length)]}`;

  const nodes  = generateAlgorithmicNodes(W1, W2, lat, lon, densityMultiplier, analysis);
  const xpArr  = nodes.map(n => n.xpValue);
  const xpMean = xpArr.reduce((s, x) => s + x, 0) / (xpArr.length || 1);
  const xpStd  = Math.sqrt(xpArr.reduce((s, x) => s + (x - xpMean)**2, 0) / (xpArr.length || 1));

  return {
    success:   true,
    algorithm: {
      wordAnalysis:    analysis,
      colorDerivation: { h1, h2, s, l },
      nodeStats:       { generated: nodes.length, xpMean: +xpMean.toFixed(1), xpStd: +xpStd.toFixed(1) },
      algorithmsUsed:  ['shannon-entropy','tfidf','cosine-similarity','haversine','poisson',
                        'box-muller','k-means-3','bayesian-posterior','lcg-seed','z-score','percentile-rank'],
    },
    world: {
      word1: W1, word2: W2,
      theme: {
        name:           theme,
        accentColor:    `hsl(${h1},${s}%,${l}%)`,
        secondaryColor: `hsl(${h2},${s-10}%,${l-8}%)`,
        pathColor:      `hsl(${(h1+30)%360},${s+5}%,${l+5}%)`,
      },
      nodes,
      stats: { codexTermsUnlocked: 0, campsEstablished: 0, pathwaysInvestigated: 0, nodesAvoided: 0 },
    }
  };
}

// ═══════════════════════════════════════════════════
// SECTION 6 - LIVE TELEMETRY CRUNCHER
// ═══════════════════════════════════════════════════

const telBuf = [];
const MAX_TEL = 20;
let emaVel = 0, emaHdg = 0;

function crunchTelemetry({ lat, lon, heading = 0, accuracy = 5, timestamp = Date.now() }) {
  const prev = telBuf[telBuf.length - 1] || null;
  let velMs = 0, dHdg = 0;
  if (prev) {
    const dt = Math.max((timestamp - prev.timestamp) / 1000, 0.01);
    velMs = haversineM(prev.lat, prev.lon, lat, lon) / dt;
    dHdg = Math.abs(heading - prev.heading);
    if (dHdg > 180) dHdg = 360 - dHdg;
  }
  telBuf.push({ lat, lon, heading, accuracy, timestamp, velMs, dHdg });
  if (telBuf.length > MAX_TEL) telBuf.shift();

  const vels = telBuf.map(s => s.velMs);
  const n    = vels.length;
  const mu   = vels.reduce((s, v) => s + v, 0) / n;
  const sig  = Math.sqrt(vels.reduce((s, v) => s + (v - mu)**2, 0) / Math.max(n-1, 1));
  emaVel = ema(emaVel, velMs);
  emaHdg = ema(emaHdg, dHdg);

  return {
    velMs, velKmh: velMs * 3.6,
    emaVelMs: emaVel, meanVelMs: mu, stdVelMs: sig,
    zVel: zScore(velMs, mu, sig),
    velPercentile: percentileRank(vels, velMs),
    emaHeadingDelta: emaHdg,
    explorationScore: Math.min(1, sig / 2.5),
    motionMode: velMs < 0.3 ? 'stationary' : velMs < 2.0 ? 'walking' : velMs < 4.5 ? 'jogging' : velMs < 14 ? 'cycling' : 'driving',
    sampleCount: n,
  };
}

function getTelemetryDigest() {
  if (!telBuf.length) return { status: 'awaiting_first_fix' };
  const vels = telBuf.map(s => s.velMs);
  const n = vels.length;
  const mu = vels.reduce((s, v) => s + v, 0) / n;
  const sig = Math.sqrt(vels.reduce((s, v) => s + (v-mu)**2, 0) / Math.max(n-1, 1));
  const last = telBuf[telBuf.length - 1];
  const hdgs = telBuf.map(s => s.dHdg);
  const hmean = hdgs.reduce((s,h) => s+h, 0) / n;
  const expScore = Math.min(1, Math.sqrt(hdgs.reduce((s,h) => s+(h-hmean)**2, 0) / Math.max(n-1,1)) / 90);

  return {
    sampleCount: n,
    currentVelMs: +last.velMs.toFixed(2),
    currentVelKmh: +(last.velMs * 3.6).toFixed(1),
    meanVelMs: +mu.toFixed(2), stdVelMs: +sig.toFixed(2),
    maxVelMs: +Math.max(...vels).toFixed(2),
    emaVelMs: +emaVel.toFixed(2),
    explorationScore: +expScore.toFixed(3),
    motionMode: last.velMs < 0.3 ? 'stationary' : last.velMs < 2.0 ? 'walking' : last.velMs < 4.5 ? 'jogging' : 'cycling',
    gpsPrecisionM: last.accuracy,
    algorithmsActive: ['haversine','ema','z-score','percentile-rank','box-muller','poisson'],
  };
}

module.exports = {
  shannonEntropy, tfidfScore, domainVector, cosineSimilarity,
  haversineM, gaussianRand, makeLCG, wordSeed, poissonRand,
  zScore, percentileRank, ema, bayesDomainPosterior,
  analyseWordPair, generateAlgorithmicWorld,
  crunchTelemetry, getTelemetryDigest,
};
