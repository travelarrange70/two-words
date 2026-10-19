/**
 * wordEngineService.js - TwoWords Procedural World Engine
 *
 * Implements the TwoWords: Complete Interaction & State Matrix:
 *  1. Procedurally parses Word_1 and Word_2 into a rich themed World:
 *     - World Codex (active dictionary of terms, definitions, lore & unlock status)
 *     - Atmospheric palette & environmental aesthetics
 *     - Dynamic POI nodes scaled by config.densityMultiplier
 *  2. Evaluates Contextual Node Decision Choices:
 *     - "Investigate Pathway": Loot drops, discovery XP, path highlights
 *     - "Establish Camp": Waypoint registration, stamina/health, rest bonuses
 *     - "Avoid Node": Stealth bypass, path tint shift
 *  3. In-memory data store with live event logging for the System Dashboard
 */

// In-memory active game state
const worldDatabase = {
  config: {
    densityMultiplier: 1.0,
    densityMode: 'Balanced (Suburban)'
  },
  activeWorld: {
    word1: 'PLAY',
    word2: 'GOLF',
    theme: {
      name: 'Fairway Green & Golden Precision',
      accentColor: '#00e5ff',
      secondaryColor: '#22c55e',
      pathColor: '#00e5ff',
      atmosphericFog: 'crisp-emerald',
      ambientFrequencyHz: 432
    },
    codex: [],
    nodes: [],
    discoveredNodes: new Set(),
    activePathways: []
  },
  playerInventory: [
    { id: 'inv_compass', name: 'Kinematic GPS Compass', count: 1, type: 'tool', icon: '🧭', rarity: 'rare' },
    { id: 'inv_stamina_pack', name: 'Hydro Electrolyte Pack', count: 2, type: 'consumable', icon: '⚡', rarity: 'common' }
  ],
  playerStats: {
    campsEstablished: 0,
    pathwaysInvestigated: 0,
    nodesAvoided: 0,
    codexTermsUnlocked: 0
  },
  logs: {
    live_map: [],
    word_engine: [],
    database_state: []
  }
};

const MAX_LOGS = 120;

function pushLog(feedType, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    feed: feedType,
    message,
    meta
  };
  if (!worldDatabase.logs[feedType]) worldDatabase.logs[feedType] = [];
  worldDatabase.logs[feedType].unshift(entry);
  if (worldDatabase.logs[feedType].length > MAX_LOGS) {
    worldDatabase.logs[feedType].pop();
  }
  return entry;
}

// Initial system logs
pushLog('live_map', 'GPS telemetry stream initialized. Awaiting player fix.', { lat: 37.804456, lon: -122.271356 });
pushLog('word_engine', 'WordEngine.cs procedural runtime ready. Density multiplier primed at 1.0x.');
pushLog('database_state', 'Game database instance provisioned. Tables: [worlds, codex, nodes, inventory].');

/**
 * 1. World Generation based on Word_1, Word_2 and densityMultiplier
 */
function generateWorld({ word1 = 'PLAY', word2 = 'GOLF', densityMultiplier = 1.0, densityMode = 'Balanced (Suburban)', lat = 37.804456, lon = -122.271356 }) {
  const w1 = String(word1).trim().toUpperCase();
  const w2 = String(word2).trim().toUpperCase();
  const mult = Number(densityMultiplier) || 1.0;

  worldDatabase.config.densityMultiplier = mult;
  worldDatabase.config.densityMode = densityMode;
  worldDatabase.activeWorld.word1 = w1;
  worldDatabase.activeWorld.word2 = w2;

  pushLog('word_engine', `Processing input token pair: [${w1}, ${w2}] with density multiplier ${mult}x (${densityMode})`);

  // ─── Procedural Theme Engine v2 ─────────────────────────────────────────────
  // 40+ semantic categories. Any two-word input generates a uniquely styled world.
  const pair = `${w1} ${w2}`;
  let themeName = '';
  let accentColor = '';
  let secondaryColor = '';
  let pathColor = '';

  const THEME_MAP = [
    // ── SPORT ────────────────────────────────────────────────────────────────
    { keys: ['GOLF'],         name: 'Fairway Green & Golden Precision',           accent: '#00ff99', secondary: '#ffd700', path: '#00e5ff' },
    { keys: ['SURF','WAVE'],  name: 'Turquoise Swell & Wind-Carved Shore',        accent: '#00d4ff', secondary: '#ff8c00', path: '#00d4ff' },
    { keys: ['SKATE','BLADE'],name: 'Concrete Canvas & Kinetic Rail City',        accent: '#ff3366', secondary: '#ffd700', path: '#ff3366' },
    { keys: ['CLIMB','PEAK'], name: 'Granite Summit & Alpine Horizon Protocol',   accent: '#a3e635', secondary: '#0ea5e9', path: '#a3e635' },
    { keys: ['RUN','SPRINT'], name: 'Neon Stride & Velocity Meridian',            accent: '#00e5ff', secondary: '#ff0077', path: '#00e5ff' },
    { keys: ['SWIM','DIVE'],  name: 'Bioluminescent Depth & Midnight Tide',       accent: '#22d3ee', secondary: '#7c3aed', path: '#22d3ee' },
    { keys: ['BIKE','CYCLE'], name: 'Carbon Trail & Spinning Geometry',           accent: '#f59e0b', secondary: '#ef4444', path: '#f59e0b' },
    { keys: ['DANCE'],        name: 'Chromatic Rhythm & Pulse Architecture',      accent: '#ec4899', secondary: '#a855f7', path: '#ec4899' },
    { keys: ['FIGHT','BOXER'],name: 'Iron Ring & Shadowbox Circuit',              accent: '#ef4444', secondary: '#f97316', path: '#ef4444' },
    { keys: ['HIKE','TRAIL'], name: 'Terracotta Ridge & Forest Meridian',         accent: '#84cc16', secondary: '#7c2d12', path: '#84cc16' },
    // ── NATURE ───────────────────────────────────────────────────────────────
    { keys: ['OCEAN','SEA'],  name: 'Aquatic Expanse & Deep Blue Sovereignty',   accent: '#0ea5e9', secondary: '#06b6d4', path: '#0ea5e9' },
    { keys: ['FIRE','FLAME'], name: 'Inferno Corridor & Ember Drift Protocol',    accent: '#f97316', secondary: '#ef4444', path: '#f97316' },
    { keys: ['FOREST','WOOD'],name: 'Emerald Canopy & Root System Nexus',         accent: '#22c55e', secondary: '#713f12', path: '#22c55e' },
    { keys: ['DESERT','SAND'],name: 'Ochre Dunes & Golden Hour Meridian',         accent: '#fbbf24', secondary: '#d97706', path: '#fbbf24' },
    { keys: ['STORM','THUNDER'],name: 'Voltage Sky & Electro-Anvil Domain',      accent: '#818cf8', secondary: '#f0abfc', path: '#818cf8' },
    { keys: ['SNOW','ICE','FROST'],name: 'Crystalline Tundra & Glacial Silence', accent: '#bae6fd', secondary: '#818cf8', path: '#bae6fd' },
    { keys: ['RAIN','CLOUD'], name: 'Monsoon Grid & Silver Veil Frequency',       accent: '#94a3b8', secondary: '#0284c7', path: '#94a3b8' },
    { keys: ['SUN','SOLAR'],  name: 'Radiant Zenith & Photon Cascade Lanes',      accent: '#fde047', secondary: '#f97316', path: '#fde047' },
    { keys: ['MOON','LUNAR'], name: 'Selenite Arc & Nocturnal Cartography',       accent: '#e2e8f0', secondary: '#818cf8', path: '#e2e8f0' },
    { keys: ['STAR','COSMOS'],name: 'Stellar Drift & Deep Space Topology',        accent: '#c4b5fd', secondary: '#1d4ed8', path: '#c4b5fd' },
    { keys: ['FLOWER','BLOOM'],name: 'Pollination Circuit & Petal Grid Arcs',    accent: '#f9a8d4', secondary: '#4ade80', path: '#f9a8d4' },
    // ── CITY & CULTURE ───────────────────────────────────────────────────────
    { keys: ['CITY','URBAN','METRO'],name: 'Urban Frequency & Glass Tower Lanes',accent: '#a78bfa', secondary: '#38bdf8', path: '#a78bfa' },
    { keys: ['NIGHT','DARK'], name: 'Obsidian Midnight & Bioluminescent Lanterns',accent: '#a855f7', secondary: '#3b82f6', path: '#a855f7' },
    { keys: ['STREET','ALLEY'],name: 'Concrete Veins & Graffiti Signal Matrix', accent: '#fb923c', secondary: '#06b6d4', path: '#fb923c' },
    { keys: ['MARKET','TRADE'],name: 'Bazaar Circuit & Commerce Flow Architecture',accent: '#f59e0b', secondary: '#16a34a', path: '#f59e0b' },
    // ── TECH & SCI-FI ────────────────────────────────────────────────────────
    { keys: ['CYBER','TECH','HACK','CODE'],name: 'Neon Cyber Grid & High-Velocity Stride',accent: '#00e5ff', secondary: '#ff0077', path: '#00e5ff' },
    { keys: ['ROBOT','AI','MECH'],name: 'Autonomous Grid & Neural Topology Mesh',accent: '#6ee7b7', secondary: '#3b82f6', path: '#6ee7b7' },
    { keys: ['QUANTUM','FLUX'],name: 'Superposition Field & Entangled Corridor',  accent: '#d946ef', secondary: '#06b6d4', path: '#d946ef' },
    { keys: ['SPACE','GALAXY'],name: 'Interstellar Void & Graviton Path Weave',   accent: '#6366f1', secondary: '#0f172a', path: '#6366f1' },
    { keys: ['MATRIX','PROGRAM'],name: 'Source Code Lattice & Green Rain Node',  accent: '#00ff41', secondary: '#0d0208', path: '#00ff41' },
    // ── FANTASY & MYSTICAL ───────────────────────────────────────────────────
    { keys: ['DRAGON','DRAGON'],name: 'Dragonfire Meridian & Scorched Realm',     accent: '#dc2626', secondary: '#fbbf24', path: '#dc2626' },
    { keys: ['MAGIC','SPELL'], name: 'Arcane Lattice & Ley Line Intersection',    accent: '#c084fc', secondary: '#34d399', path: '#c084fc' },
    { keys: ['SHADOW','GHOST'],name: 'Umbral Fabric & Spectral Geometry Matrix',  accent: '#6b7280', secondary: '#7c3aed', path: '#6b7280' },
    { keys: ['LIGHT','AURA'], name: 'Photonic Halo & Radiance Node Network',      accent: '#fef3c7', secondary: '#fcd34d', path: '#fef3c7' },
    // ── FOOD & LIFESTYLE ─────────────────────────────────────────────────────
    { keys: ['COFFEE','CAFE'],name: 'Roasted Meridian & Espresso Signal Map',     accent: '#92400e', secondary: '#f59e0b', path: '#a16207' },
    { keys: ['MUSIC','BEAT'], name: 'Frequency Canvas & Harmonic Pathway Grid',   accent: '#c084fc', secondary: '#ec4899', path: '#c084fc' },
    { keys: ['BEACH','CHILL','VIBE'],name: 'Sunlit Coastal Shore & Twilight Drift',accent: '#ffaa00', secondary: '#00d4ff', path: '#ffd700' },
    // ── EMOTION & PHILOSOPHY ─────────────────────────────────────────────────
    { keys: ['PEACE','ZEN','CALM'],name: 'Stillwater Domain & Mindful Arc Network',accent: '#86efac', secondary: '#a5f3fc', path: '#86efac' },
    { keys: ['FURY','RAGE','WAR'],name: 'Crimson Front & Battle-Forged Topology', accent: '#dc2626', secondary: '#7f1d1d', path: '#ef4444' },
    { keys: ['LOVE','HEART'], name: 'Rosy Resonance & Compassion Grid Arcs',      accent: '#f43f5e', secondary: '#fb7185', path: '#f43f5e' },
    { keys: ['DREAM','VISION'],name: 'Oneiric Drift & Subconscious Cartography',  accent: '#a78bfa', secondary: '#f0abfc', path: '#c4b5fd' },
  ];

  // Match against the first keyword found in the pair
  let matchedTheme = null;
  for (const theme of THEME_MAP) {
    if (theme.keys.some(k => pair.includes(k))) {
      matchedTheme = theme;
      break;
    }
  }

  if (matchedTheme) {
    themeName = matchedTheme.name;
    accentColor = matchedTheme.accent;
    secondaryColor = matchedTheme.secondary;
    pathColor = matchedTheme.path;
  } else {
    // ── Deterministic Color Hash Fallback ──────────────────────────────────
    // Any novel word pair gets a unique, non-generic color palette derived
    // from the character codes of the two words (always same output for same input).
    const hash1 = [...w1].reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
    const hash2 = [...w2].reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
    const h1 = Math.abs(hash1) % 360;
    const h2 = Math.abs(hash2) % 360;
    const s = 70 + (Math.abs(hash1) % 20); // 70-90% saturation
    const l = 55 + (Math.abs(hash2) % 15); // 55-70% lightness
    const toHsl = (h, sat, lit) => `hsl(${h},${sat}%,${lit}%)`;
    accentColor = toHsl(h1, s, l);
    secondaryColor = toHsl((h1 + 140) % 360, s - 10, l - 10);
    pathColor = toHsl(h2, s + 5, l + 5);
    themeName = `${w1} Frontier & ${w2} Meridian Protocol`;
  }

  worldDatabase.activeWorld.theme = {
    name: themeName,
    accentColor,
    secondaryColor,
    pathColor,
    atmosphericFog: 'ambient-procedural',
    ambientFrequencyHz: 432
  };

  // Generate procedural World Codex terms
  const codexTerms = generateCodexTerms(w1, w2);
  worldDatabase.activeWorld.codex = codexTerms;
  worldDatabase.playerStats.codexTermsUnlocked = codexTerms.filter(c => c.discovered).length;

  // Generate dynamic POI decision nodes based on density multiplier
  const nodes = generateDecisionNodes(w1, w2, lat, lon, mult);
  worldDatabase.activeWorld.nodes = nodes;

  pushLog('database_state', `Committed world snapshot: ${themeName} | Codex terms: ${codexTerms.length} | Generated decision nodes: ${nodes.length}`);
  pushLog('live_map', `Map viewport re-indexed around (${lat.toFixed(5)}, ${lon.toFixed(5)}) with ${nodes.length} spatial nodes.`);

  return {
    success: true,
    config: worldDatabase.config,
    world: {
      word1: w1,
      word2: w2,
      theme: worldDatabase.activeWorld.theme,
      codex: worldDatabase.activeWorld.codex,
      nodes: worldDatabase.activeWorld.nodes,
      inventory: worldDatabase.playerInventory,
      stats: worldDatabase.playerStats
    }
  };
}

function generateCodexTerms(w1, w2) {
  const isGolf = `${w1} ${w2}`.includes('GOLF');
  if (isGolf) {
    return [
      { id: 'cdx_fairway', term: 'The Fairway', category: 'Terrain', def: 'The closely cut corridor guiding explorers from tee to target.', lore: 'True adventurers maintain their center of gravity along this path.', discovered: true, xp: 25 },
      { id: 'cdx_green', term: 'Putting Green', category: 'Sanctuary', def: 'The manicured target zone where millimeter precision dictates success.', lore: 'Here, adrenaline transforms into deliberate, frozen focus.', discovered: true, xp: 25 },
      { id: 'cdx_lag', term: 'Kinetic Lag', category: 'Mechanics', def: 'Preserving the angular delay between lever and fulcrum to maximize release velocity.', lore: 'The secret of the ancients: speed is born from patience, not force.', discovered: true, xp: 50 },
      { id: 'cdx_bunker', term: 'Hazard Bunker', category: 'Obstacle', def: 'A recessed sand trap engineered to test emotional poise and recovery.', lore: 'Escape clean on the first strike or let the dunes swallow your score.', discovered: false, xp: 75 },
      { id: 'cdx_eagle', term: 'The Eagle', category: 'Milestone', def: 'Completing a journey node in two steps under standard allocation.', lore: 'A legendary feat whispered in urban clubhouses.', discovered: false, xp: 100 },
      { id: 'cdx_ambition', term: 'True Ambition', category: 'Philosophy', def: 'The magnetic force binding two distinct words into a living landscape.', lore: 'When words crystallize, the entire city re-aligns to match.', discovered: true, xp: 100 }
    ];
  }

  return [
    { id: 'cdx_genesis', term: `${w1} Genesis`, category: 'Core Concept', def: `The foundational primary force driving the ${w1} ambition.`, lore: 'The spark that commands the real world to rearrange its pathways.', discovered: true, xp: 25 },
    { id: 'cdx_catalyst', term: `${w2} Catalyst`, category: 'Momentum', def: `The secondary operational frequency that steers ${w1} into action.`, lore: 'Without the catalyst, energy remains potential.', discovered: true, xp: 25 },
    { id: 'cdx_resonance', term: 'Spatial Resonance', category: 'Physics', def: 'When player physical coordinates intersect procedural thematic nodes.', lore: 'Walking is no longer transport; it is world synthesis.', discovered: true, xp: 50 },
    { id: 'cdx_junction', term: 'Fork of Destiny', category: 'Decision Node', def: 'A street junction transformed into a branching choice.', lore: 'Every turn leaves a permanent mark on your inventory and map visual.', discovered: false, xp: 75 },
    { id: 'cdx_beacon', term: 'Ambition Beacon', category: 'Milestone', def: 'The distant point of light uniting kindred explorers.', lore: 'Follow the glowing cyan line until the stranger becomes an ally.', discovered: false, xp: 100 }
  ];
}

function generateDecisionNodes(w1, w2, centerLat, centerLon, densityMultiplier) {
  // Base count: 3 nodes for Sparse (0.5x), 6 for Balanced (1.0x), 10 for Dense (2.0x)
  const count = Math.max(2, Math.round(6 * densityMultiplier));
  const nodes = [];

  const offsets = [
    { name: 'Broadway Junction Node', dLat: 0.0018, dLon: 0.0012, type: 'junction', icon: '🚸' },
    { name: 'Franklin Promenade Crossing', dLat: -0.0015, dLon: 0.0020, type: 'pathway', icon: '🛣️' },
    { name: 'Telegraph Meridian Outpost', dLat: 0.0024, dLon: -0.0016, type: 'sanctuary', icon: '⛺' },
    { name: 'Grand Avenue Kinetic Arch', dLat: 0.0032, dLon: 0.0028, type: 'junction', icon: '🏛️' },
    { name: 'Lake Merritt Shoreline Bend', dLat: -0.0028, dLon: 0.0035, type: 'pathway', icon: '⛵' },
    { name: 'Clay Street Canyon', dLat: -0.0022, dLon: -0.0025, type: 'hazard', icon: '⚠️' },
    { name: 'City Center Plaza Nexus', dLat: 0.0009, dLon: -0.0031, type: 'sanctuary', icon: '✨' },
    { name: '14th Street Transit Node', dLat: -0.0035, dLon: -0.0010, type: 'junction', icon: '🚆' },
    { name: 'Uptown Arts Labyrinth', dLat: 0.0040, dLon: -0.0020, type: 'pathway', icon: '🎨' },
    { name: 'Oakland Vista Ridge', dLat: 0.0048, dLon: 0.0042, type: 'sanctuary', icon: '🔭' }
  ];

  for (let i = 0; i < Math.min(count, offsets.length); i++) {
    const o = offsets[i];
    nodes.push({
      id: `node_${i + 1}`,
      name: `${w1} · ${o.name}`,
      lat: centerLat + o.dLat,
      lon: centerLon + o.dLon,
      type: o.type,
      icon: o.icon,
      status: 'active', // 'active' | 'investigated' | 'camped' | 'avoided'
      choices: [
        { id: 'investigate', label: 'Investigate Pathway', icon: '🔍', desc: 'Scan the pathway for procedural loot and codex discovery.' },
        { id: 'camp', label: 'Establish Camp', icon: '⛺', desc: 'Set up a tactical camp waypoint to replenish stamina.' },
        { id: 'avoid', label: 'Avoid Node', icon: '↩️', desc: 'Bypass node stealthily and alter visual path vector.' }
      ]
    });
  }

  return nodes;
}

/**
 * 2. Node Decision Action Execution
 * Choices: ["Investigate Pathway", "Establish Camp", "Avoid Node"]
 */
function handleNodeAction({ nodeId, choiceId, playerId = 'Player_1' }) {
  const node = worldDatabase.activeWorld.nodes.find(n => n.id === nodeId);
  const nodeName = node ? node.name : 'Unknown Node';

  let outcome = {
    success: true,
    choiceId,
    nodeId,
    nodeName,
    xpAwarded: 0,
    inventoryAdded: null,
    pathColorShift: '#00e5ff',
    message: ''
  };

  switch (choiceId) {
    case 'investigate':
      worldDatabase.playerStats.pathwaysInvestigated++;
      outcome.xpAwarded = 60;
      outcome.pathColorShift = '#ffd700'; // Luminous gold pathway
      outcome.message = `Pathway investigated! You uncovered the "Kinetic Lag" Codex entry and found 1x Tour Spec Ball.`;

      // Add to inventory
      const existing = worldDatabase.playerInventory.find(i => i.id === 'inv_tour_ball');
      if (existing) {
        existing.count += 1;
      } else {
        worldDatabase.playerInventory.push({ id: 'inv_tour_ball', name: 'Tour Spec Ball', count: 1, type: 'consumable', icon: '⚪', rarity: 'rare' });
      }
      outcome.inventoryAdded = { name: 'Tour Spec Ball', icon: '⚪', count: 1 };

      // Unlock a codex entry if available
      const lockedCodex = worldDatabase.activeWorld.codex.find(c => !c.discovered);
      if (lockedCodex) {
        lockedCodex.discovered = true;
        outcome.codexUnlocked = lockedCodex;
        worldDatabase.playerStats.codexTermsUnlocked++;
      }

      pushLog('word_engine', `Player chose [Investigate Pathway] at ${nodeName}. Dispatched discovery loot & codex unlock.`);
      pushLog('database_state', `Inventory updated (+1 Tour Spec Ball). Player pathways investigated: ${worldDatabase.playerStats.pathwaysInvestigated}`);
      break;

    case 'camp':
      worldDatabase.playerStats.campsEstablished++;
      outcome.xpAwarded = 45;
      outcome.pathColorShift = '#00ff99'; // Emerald sanctuary green
      outcome.message = `Camp established at ${nodeName}! Stamina restored and local waypoint anchored.`;

      pushLog('live_map', `Established tactical camp marker at (${node ? node.lat.toFixed(5) : 0}, ${node ? node.lon.toFixed(5) : 0}). Waypoint registered.`);
      pushLog('database_state', `Camp state committed. Total camps: ${worldDatabase.playerStats.campsEstablished}`);
      break;

    case 'avoid':
      worldDatabase.playerStats.nodesAvoided++;
      outcome.xpAwarded = 15;
      outcome.pathColorShift = '#a855f7'; // Stealth violet
      outcome.message = `Node bypassed stealthily. Route dynamically diverted to minimize friction.`;

      pushLog('live_map', `Player bypassed ${nodeName}. Path rerouted with stealth violet color vector.`);
      pushLog('database_state', `Node status updated to avoided: ${nodeId}`);
      break;

    default:
      outcome.success = false;
      outcome.message = `Unknown action choice: ${choiceId}`;
  }

  if (node) {
    node.status = choiceId === 'investigate' ? 'investigated' : (choiceId === 'camp' ? 'camped' : 'avoided');
    worldDatabase.activeWorld.discoveredNodes.add(nodeId);
  }

  return outcome;
}

/**
 * 3. Log Feed Provider for Dashboard
 */
function getLogs(feedType = 'live_map') {
  const normalized = feedType.toLowerCase().replace(/-/g, '_').replace(/ /g, '_');
  let key = 'live_map';
  if (normalized.includes('word') || normalized.includes('engine')) key = 'word_engine';
  if (normalized.includes('data') || normalized.includes('state')) key = 'database_state';

  return {
    success: true,
    feedType: key,
    label: key === 'live_map' ? 'Live Map Logs' : (key === 'word_engine' ? 'WordEngine Output' : 'Database State'),
    count: (worldDatabase.logs[key] || []).length,
    logs: worldDatabase.logs[key] || []
  };
}

module.exports = {
  worldDatabase,
  generateWorld,
  handleNodeAction,
  getLogs,
  pushLog
};
