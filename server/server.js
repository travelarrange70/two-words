const express     = require('express');
const http        = require('http');
const https       = require('https');
const fs          = require('fs');
const path        = require('path');
const os          = require('os');
const { WebSocketServer, WebSocket } = require('ws');

// Security & performance middleware
const cors        = require('cors');
const helmet      = require('helmet');
const compression = require('compression');
const morgan      = require('morgan');
const rateLimit   = require('express-rate-limit');
const selfsigned  = require('selfsigned');

// ── Load .env ─────────────────────────────────────────────────────────────────
try {
  const envPath = require('path').join(__dirname, '.env');
  if (require('fs').existsSync(envPath)) {
    require('fs').readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
      const [k, ...v] = line.split('=');
      if (k && v.length && !process.env[k.trim()]) process.env[k.trim()] = v.join('=').trim();
    });
  }
} catch(_) {}

// ── VERA AI Agent Service ─────────────────────────────────────────────────────
const aiAgent = require('./services/aiAgentService');

// ── Self-Signed TLS Cert (enables camera/GPS on mobile over LAN) ─────────────
async function getOrGenerateCerts() {
  const certPath = path.join(__dirname, '.certs');
  const certFile = path.join(certPath, 'cert.pem');
  const keyFile  = path.join(certPath, 'key.pem');

  try {
    const stat = fs.statSync(certFile);
    const ageDays = (Date.now() - stat.mtimeMs) / 86400000;
    if (ageDays < 30) {
      console.log('[TLS] Reusing cached self-signed cert');
      return { cert: fs.readFileSync(certFile, 'utf8'), private: fs.readFileSync(keyFile, 'utf8') };
    }
  } catch (_) {}

  const pems = await selfsigned.generate([{ name: 'commonName', value: 'twowords.local' }], { days: 365, keySize: 2048 });
  fs.mkdirSync(certPath, { recursive: true });
  fs.writeFileSync(certFile, pems.cert);
  fs.writeFileSync(keyFile,  pems.private);
  console.log('[TLS] Generated new self-signed cert (valid 365 days)');
  return pems;
}

// ── App & Servers ─────────────────────────────────────────────────────────────
const app        = express();
const httpServer  = http.createServer(app);
const wss         = new WebSocketServer({ server: httpServer });
let httpsServer = null;
let wssSSL      = null;

const PORT     = Number(process.env.PORT)     || 3000;
const PORT_SSL = Number(process.env.PORT_SSL) || 3443;

// keep legacy alias
const server = httpServer;

function getLocalIP() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

// ── Security Headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", 'unpkg.com', 'cdnjs.cloudflare.com', 'maps.googleapis.com', 'maps.gstatic.com'],
      scriptSrcAttr: ["'unsafe-inline'"],  // Allow onclick= handlers in HTML
      styleSrc:    ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'unpkg.com'],
      fontSrc:     ["'self'", 'fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:', 'blob:', '*.cartocdn.com', '*.openstreetmap.org', '*.openstreetmap.fr', '*.arcgisonline.com', '*.openfreemap.org', '*.googleapis.com', '*.gstatic.com', 'maps.gstatic.com', 'source.unsplash.com', 'api.qrserver.com'],
      connectSrc:  ["'self'", 'ws:', 'wss:', '*.cartocdn.com', '*.overpass-api.de', 'nominatim.openstreetmap.org', '*.arcgisonline.com', '*.openfreemap.org', 'maps.googleapis.com', '*.googleapis.com', 'generativelanguage.googleapis.com', 'en.wikipedia.org'],
      mediaSrc:    ["'self'", 'blob:', 'data:'],
      workerSrc:   ["'self'", 'blob:'],
      frameSrc:    ["'self'", 'www.google.com'],
      objectSrc:   ["'none'"],
      upgradeInsecureRequests: null,  // CRITICAL: prevents browser upgrading http://localhost:3000 to https://localhost:3000
    }
  },
  hsts: false,  // Disable HSTS for local dev (was forcing HTTPS redirect)
  crossOriginEmbedderPolicy: false,  // needed for SharedArrayBuffer / camera
}));

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => cb(null, true), // allow all in dev; restrict in prod
  credentials: true,
}));

// ── Compression (Brotli → gzip fallback) ─────────────────────────────────────
app.use(compression({ level: 6, threshold: 1024 }));

// ── Structured HTTP logging ───────────────────────────────────────────────────
app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));

// ── Body Parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '256kb' }));

// ── Rate Limiting ─────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60_000,   // 1 minute
  max: 120,           // 2 req/sec average
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please slow down.' },
  skip: (req) => req.ip === '::1' || req.ip === '127.0.0.1', // no limit for localhost
});
app.use('/api/', apiLimiter);

// ── Static File Serving ───────────────────────────────────────────────────────
// Service worker must be served from root with no-cache so it updates promptly
app.use('/sw.js', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Service-Worker-Allowed', '/');
  next();
});
// Manifest & icons — short cache
app.use('/manifest.json', (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  next();
});
// JS modules — versioned, long cache in production; no-cache in dev
const isDev = process.env.NODE_ENV !== 'production';
const jsCacheControl = isDev
  ? 'no-store'
  : 'public, max-age=31536000, immutable';

// Serve root project folder (index.html lives here)
app.use(express.static(path.join(__dirname, '..'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store'); // always fresh HTML
    } else if (filePath.endsWith('.js') && !filePath.includes('sw.js')) {
      res.setHeader('Cache-Control', jsCacheControl);
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));
// Public assets (icons, screenshots, etc.)
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res) { res.setHeader('Cache-Control', 'public, max-age=86400'); }
}));


// In-Memory Database
const database = {
  players: new Map(),
  currentCalibration: {
    latitude: 37.804456,
    longitude: -122.271356,
    heading: 45,
    altitude: 15,
    accuracy: 3.5,
    city: "Oakland, CA",
    ambition: "PLAY GOLF",
    timestamp: Date.now()
  },
  activeMatch: {
    name: "Alex M.",
    avatar: "🏌️",
    latitude: 37.8075,
    longitude: -122.2680,
    ambition: "PLAY GOLF"
  },
  pois: [
    { id: '1', title: 'Oakland City Center', category: 'Landmark', latitude: 37.8038, longitude: -122.2730, altitude: 0, icon: '🏛️', color: '#00e5ff' },
    { id: '2', title: 'Fox Theater Oakland', category: 'Culture', latitude: 37.8080, longitude: -122.2705, altitude: 0, icon: '🎭', color: '#a855f7' },
    { id: '3', title: 'Lake Merritt Pergola', category: 'Scenic', latitude: 37.8010, longitude: -122.2590, altitude: 0, icon: '⛵', color: '#00ff99' },
    { id: '4', title: 'Jack London Square', category: 'Landmark', latitude: 37.7945, longitude: -122.2770, altitude: 0, icon: '⚓', color: '#00d4ff' },
    { id: '5', title: 'Grand Lake Theatre', category: 'Culture', latitude: 37.8115, longitude: -122.2478, altitude: 0, icon: '🎬', color: '#ff7043' },
    { id: '6', title: 'Oakland Museum of CA', category: 'Culture', latitude: 37.7986, longitude: -122.2638, altitude: 0, icon: '🎨', color: '#e91e63' },
    { id: '7', title: 'Snow Park Waterfront', category: 'Park', latitude: 37.8055, longitude: -122.2630, altitude: 0, icon: '🌳', color: '#22c55e' }
  ],
  collectibles: [],
  chatMessages: [
    {
      id: 'm1',
      sender: 'Alex M.',
      avatar: '🏌️',
      text: "Hey! I'm waiting near Broadway & 15th St. Ready when you are!",
      timestamp: Date.now() - 120000
    }
  ]
};

// REST API Endpoints

// 1. Health Status
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    service: 'TwoWords GPS Backend',
    uptimeSeconds: Math.floor(process.uptime()),
    activePlayers: database.players.size,
    totalPois: database.pois.length,
    timestamp: new Date().toISOString()
  });
});

// 1b. Real 3D Geographic Buildings (Cached Oakland + Dynamic Overpass)
app.get('/api/buildings', (req, res) => {
  const reqLat = parseFloat(req.query.lat) || database.currentCalibration.latitude;
  const reqLon = parseFloat(req.query.lon) || database.currentCalibration.longitude;
  const radius = parseInt(req.query.radius) || 450;

  // If near Oakland calibration center (~1.5km), return high-speed cached real buildings
  const dLat = Math.abs(reqLat - 37.804456);
  const dLon = Math.abs(reqLon - (-122.271356));
  if (dLat < 0.02 && dLon < 0.02) {
    try {
      const bldgsPath = path.join(__dirname, 'oakland_buildings.json');
      if (fs.existsSync(bldgsPath)) {
        const buildings = JSON.parse(fs.readFileSync(bldgsPath, 'utf8'));
        return res.json({ success: true, count: buildings.length, source: 'cached_oakland', buildings });
      }
    } catch(err) {
      console.warn('Error reading oakland_buildings.json:', err.message);
    }
  }

  // Live Overpass API fallback for other GPS locations
  try {
    const query = `[out:json][timeout:15];way["building"](around:${radius},${reqLat},${reqLon});out center geom tags 60;`;
    const overpassUrl = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);

    https.get(overpassUrl, { headers: { 'User-Agent': 'TwoWords-AR/1.0' } }, apiRes => {
      let data = '';
      apiRes.on('data', chunk => data += chunk);
      apiRes.on('end', () => {
        try {
          const json = JSON.parse(data);
          const buildings = (json.elements || []).map(el => {
            const center = el.center || (el.geometry && el.geometry.length > 0 ? {
              lat: el.geometry.reduce((a, p) => a + p.lat, 0) / el.geometry.length,
              lon: el.geometry.reduce((a, p) => a + p.lon, 0) / el.geometry.length
            } : null);
            const tags = el.tags || {};
            const levels = parseFloat(tags['building:levels']) || (tags.height ? parseFloat(tags.height) / 3.5 : null);
            const height = parseFloat(tags.height) || (levels ? levels * 3.6 : (15 + ((el.id * 17) % 45)));
            return {
              id: el.id,
              name: tags.name || (tags['addr:street'] ? `${tags['addr:housenumber'] || ''} ${tags['addr:street']}`.trim() : null),
              type: tags.building || 'yes',
              lat: center ? center.lat : null,
              lon: center ? center.lon : null,
              height: Math.round(height * 10) / 10,
              levels: levels ? Math.round(levels) : Math.round(height / 3.5),
              geometry: el.geometry ? el.geometry.slice(0, 16) : null
            };
          }).filter(b => b.lat && b.lon);
          res.json({ success: true, count: buildings.length, source: 'overpass_live', buildings });
        } catch(e) {
          res.status(500).json({ success: false, error: 'Failed to parse Overpass response' });
        }
      });
    }).on('error', e => {
      res.status(500).json({ success: false, error: e.message });
    });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 1c. Google Maps Routes API Proxy (Turn-by-Turn Navigation & Polyline)
app.post('/api/routes', (req, res) => {
  const apiKey = req.headers['x-goog-api-key'] || req.query.key || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(401).json({ success: false, error: 'Google Maps API key is required. Set GOOGLE_MAPS_API_KEY or send via X-Goog-Api-Key header.' });
  }

  const { origin, destination, travelMode = 'WALK' } = req.body;
  if (!origin || !destination) {
    return res.status(400).json({ success: false, error: 'Origin and destination { lat, lon } are required.' });
  }

  try {
    const postData = JSON.stringify({
      origin: {
        location: {
          latLng: {
            latitude: Number(origin.lat),
            longitude: Number(origin.lon)
          }
        }
      },
      destination: {
        location: {
          latLng: {
            latitude: Number(destination.lat),
            longitude: Number(destination.lon)
          }
        }
      },
      travelMode: travelMode,
      routingPreference: travelMode === 'DRIVE' ? 'TRAFFIC_AWARE' : undefined,
      computeAlternativeRoutes: false,
      languageCode: 'en-US',
      units: 'METRIC'
    });

    const options = {
      hostname: 'routes.googleapis.com',
      port: 443,
      path: '/directions/v2:computeRoutes',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps'
      }
    };

    const gReq = https.request(options, gRes => {
      let data = '';
      gRes.on('data', chunk => data += chunk);
      gRes.on('end', () => {
        try {
          const json = JSON.parse(data);
          res.json({ success: true, data: json });
        } catch(e) {
          res.status(500).json({ success: false, error: 'Failed to parse Routes API response' });
        }
      });
    });

    gReq.on('error', e => {
      res.status(500).json({ success: false, error: e.message });
    });

    gReq.write(postData);
    gReq.end();
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1d. Google Maps Geocoding API Proxy (Address <-> Coordinates)
app.get('/api/geocode', (req, res) => {
  const apiKey = req.headers['x-goog-api-key'] || req.query.key || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(401).json({ success: false, error: 'Google Maps API key is required. Set GOOGLE_MAPS_API_KEY or send via X-Goog-Api-Key header.' });
  }

  const { address, lat, lon } = req.query;
  let targetUrl = '';
  if (address) {
    targetUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${encodeURIComponent(apiKey)}`;
  } else if (lat && lon) {
    targetUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(lat)},${encodeURIComponent(lon)}&key=${encodeURIComponent(apiKey)}`;
  } else {
    return res.status(400).json({ success: false, error: 'Provide address or lat & lon query parameters.' });
  }

  https.get(targetUrl, gRes => {
    let data = '';
    gRes.on('data', chunk => data += chunk);
    gRes.on('end', () => {
      try {
        const json = JSON.parse(data);
        res.json({ success: true, data: json });
      } catch(e) {
        res.status(500).json({ success: false, error: 'Failed to parse Geocoding response' });
      }
    });
  }).on('error', e => {
    res.status(500).json({ success: false, error: e.message });
  });
});

// 1e. Reverse Geocoding (OpenStreetMap Nominatim + Google Maps fallback)
app.get('/api/reverse-geocode', (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({ success: false, error: 'Provide lat and lon query parameters.' });
  }

  const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=14&addressdetails=1`;
  https.get(nominatimUrl, { headers: { 'User-Agent': 'TwoWords-AR-GPS/1.0 (contact: support@twowords.app)' } }, apiRes => {
    let data = '';
    apiRes.on('data', chunk => data += chunk);
    apiRes.on('end', () => {
      try {
        const json = JSON.parse(data);
        const addr = json.address || {};
        const city = addr.city || addr.town || addr.municipality || addr.village || addr.suburb || addr.hamlet || addr.county || 'Local Area';
        const state = addr.state || addr.region || addr.country_code?.toUpperCase() || '';
        const country = addr.country || '';
        const formatted = state ? `${city}, ${state}` : `${city}, ${country}`;
        res.json({ success: true, city: formatted, details: addr, displayName: json.display_name });
      } catch(e) {
        res.json({ success: true, city: `${lat.toFixed(4)}°, ${lon.toFixed(4)}°` });
      }
    });
  }).on('error', e => {
    res.json({ success: true, city: `${lat.toFixed(4)}°, ${lon.toFixed(4)}°` });
  });
});


// 2. Get all POIs
app.get('/api/pois', (req, res) => {
  res.json({ success: true, count: database.pois.length, pois: database.pois });
});

// 3. Create a new custom POI
app.post('/api/pois', (req, res) => {
  const { title, category, latitude, longitude, altitude } = req.body;
  if (!title || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ success: false, error: 'Missing title or coordinates.' });
  }

  const newPoi = {
    id: 'poi_' + Date.now(),
    title,
    category: category || 'Custom',
    latitude: Number(latitude),
    longitude: Number(longitude),
    altitude: Number(altitude) || 0
  };

  database.pois.push(newPoi);
  broadcastToAll({ type: 'NEW_POI', poi: newPoi });

  res.status(201).json({ success: true, poi: newPoi });
});

// 4. Get active players
app.get('/api/players', (req, res) => {
  const playersList = Array.from(database.players.values());
  res.json({ success: true, count: playersList.length, players: playersList });
});

// 5. Update player location and stats
app.post('/api/player/update', (req, res) => {
  const { playerId, latitude, longitude, altitude, heading, score, level, mode } = req.body;
  const id = playerId || 'Player_1';

  const playerData = {
    id,
    latitude: Number(latitude) || 37.7749,
    longitude: Number(longitude) || -122.4194,
    altitude: Number(altitude) || 0,
    heading: Number(heading) || 0,
    score: Number(score) || 0,
    level: Number(level) || 1,
    mode: mode || 'ThirdPerson_GameView',
    lastSeen: Date.now()
  };

  database.players.set(id, playerData);
  broadcastToAll({ type: 'PLAYER_UPDATE', player: playerData });

  res.json({ success: true, player: playerData });
});

// 6. Live GPS Calibration Endpoint
app.post('/api/gps/calibrate', (req, res) => {
  const { latitude, longitude, heading, altitude, accuracy, ambition, city, matchLat, matchLon, matchName, matchAvatar } = req.body;

  if (latitude !== undefined && longitude !== undefined) {
    database.currentCalibration.latitude = Number(latitude);
    database.currentCalibration.longitude = Number(longitude);
  }
  if (city) database.currentCalibration.city = String(city);
  if (heading !== undefined) database.currentCalibration.heading = Number(heading);
  if (altitude !== undefined) database.currentCalibration.altitude = Number(altitude);
  if (accuracy !== undefined) database.currentCalibration.accuracy = Number(accuracy);
  if (ambition) database.currentCalibration.ambition = ambition.toUpperCase();
  database.currentCalibration.timestamp = Date.now();

  // If match destination provided or needs recalculation
  if (matchLat !== undefined && matchLon !== undefined) {
    database.activeMatch = {
      name: matchName || 'Alex M.',
      avatar: matchAvatar || '🏌️',
      latitude: Number(matchLat),
      longitude: Number(matchLon),
      ambition: database.currentCalibration.ambition
    };
  } else {
    // Generate default match ~350m ahead along current heading
    const rad = ((database.currentCalibration.heading || 0) * Math.PI) / 180;
    const distOffset = 0.003; // ~330m
    database.activeMatch = {
      name: matchName || 'Alex M.',
      avatar: matchAvatar || '🏌️',
      latitude: database.currentCalibration.latitude + Math.cos(rad) * distOffset,
      longitude: database.currentCalibration.longitude + Math.sin(rad) * distOffset,
      ambition: database.currentCalibration.ambition
    };
  }

  // Broadcast to all connected web and Unity clients
  broadcastToAll({
    type: 'GPS_CALIBRATE',
    player: {
      latitude: database.currentCalibration.latitude,
      longitude: database.currentCalibration.longitude,
      heading: database.currentCalibration.heading,
      altitude: database.currentCalibration.altitude,
      ambition: database.currentCalibration.ambition
    },
    destLat: database.activeMatch.latitude,
    destLon: database.activeMatch.longitude,
    matchName: database.activeMatch.name,
    matchAvatar: database.activeMatch.avatar
  });

  broadcastToAll({
    type: 'MATCH_DESTINATION',
    latitude: database.activeMatch.latitude,
    longitude: database.activeMatch.longitude,
    name: database.activeMatch.name,
    avatar: database.activeMatch.avatar
  });

  console.log(`[GPS Calibrate] Position calibrated: (${database.currentCalibration.latitude}, ${database.currentCalibration.longitude}) @ ${database.currentCalibration.heading}° | Match: ${database.activeMatch.name}`);

  res.json({
    success: true,
    calibration: database.currentCalibration,
    activeMatch: database.activeMatch
  });
});

// 7. Get Current Calibrated State  (also aliased as /api/gps/lock)
app.get('/api/gps/current', (req, res) => {
  res.json({
    success: true,
    calibration: database.currentCalibration,
    activeMatch: database.activeMatch
  });
});
app.get('/api/gps/lock', (req, res) => {
  res.json({
    success: true,
    locked: true,
    calibration: database.currentCalibration,
    activeMatch: database.activeMatch
  });
});

// 8. Set Two Words Ambition
app.post('/api/ambitions', (req, res) => {
  const { words } = req.body;
  if (!words) return res.status(400).json({ error: 'Field "words" required' });

  database.currentCalibration.ambition = words.trim().toUpperCase();
  const rad = ((database.currentCalibration.heading || 0) * Math.PI) / 180;
  database.activeMatch = {
    name: 'Alex M.',
    avatar: '🏌️',
    latitude: database.currentCalibration.latitude + Math.cos(rad) * 0.003,
    longitude: database.currentCalibration.longitude + Math.sin(rad) * 0.003,
    ambition: database.currentCalibration.ambition
  };

  broadcastToAll({
    type: 'MATCH_DESTINATION',
    latitude: database.activeMatch.latitude,
    longitude: database.activeMatch.longitude,
    name: database.activeMatch.name,
    avatar: database.activeMatch.avatar
  });

  res.json({ success: true, ambition: database.currentCalibration.ambition, match: database.activeMatch });
});

// 9. Discover Nearby Users
app.get('/api/discover/nearby', (req, res) => {
  const nearby = [
    database.activeMatch,
    {
      name: 'Elena R.',
      avatar: '🍜',
      latitude: database.currentCalibration.latitude + 0.002,
      longitude: database.currentCalibration.longitude - 0.0015,
      ambition: database.currentCalibration.ambition
    },
    {
      name: 'Marcus K.',
      avatar: '☕',
      latitude: database.currentCalibration.latitude - 0.0025,
      longitude: database.currentCalibration.longitude + 0.002,
      ambition: database.currentCalibration.ambition
    }
  ];
  res.json({ success: true, matches: nearby });
});

// 10. Geocoding search proxy
app.get('/api/geocode', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Query parameter "q" is required.' });

  try {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'TwoWords-Backend/1.0' }
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Geocoding failed', message: err.message });
  }
});

// 11. Get Chat Messages
app.get('/api/chat/messages', (req, res) => {
  res.json({ success: true, count: (database.chatMessages || []).length, messages: database.chatMessages || [] });
});

// 12. Send Chat Message
app.post('/api/chat/messages', (req, res) => {
  const { sender, avatar, text } = req.body;
  if (!text) return res.status(400).json({ error: 'Text is required' });
  const newMsg = {
    id: 'm_' + Date.now(),
    sender: sender || 'You',
    avatar: avatar || '🎯',
    text: text.trim(),
    timestamp: Date.now()
  };
  if (!database.chatMessages) database.chatMessages = [];
  database.chatMessages.push(newMsg);
  broadcastToAll({ type: 'CHAT_MESSAGE', message: newMsg });
  res.json({ success: true, message: newMsg });
});

// 13. VERA AI Agent Chat Endpoint
// POST /api/ai/chat  { sessionId, message, context:{word1,word2,city,arMode,matchName,distToMatch} }
app.post('/api/ai/chat', async (req, res) => {
  const { sessionId, message, context } = req.body;
  if (!message) return res.status(400).json({ success: false, error: 'message is required' });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Graceful offline fallback — VERA still responds, just without AI
    const fallbacks = [
      'I am VERA! Your GEMINI_API_KEY is not set yet — add it to server/.env to unlock my full intelligence. For now: keep exploring your ' + (context && context.word1 ? context.word1 + ' ' + context.word2 : 'two words') + ' adventure!',
      'Voice commands work without my AI brain, but to really talk to me, add GEMINI_API_KEY to server/.env.',
      'Almost there — add GEMINI_API_KEY=your_key to server/.env and restart. I have so much to tell you!'
    ];
    return res.json({ success: true, text: fallbacks[Math.floor(Math.random() * fallbacks.length)], action: null });
  }
  try {
    const result = await aiAgent.chat({ sessionId: sessionId || 'default', message, context: context || {}, apiKey });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[VERA] Chat error:', err.message);
    res.status(500).json({ success: false, error: err.message, text: 'VERA is thinking... try again in a moment.' });
  }
});

// POST /api/ai/greet  { word1, word2, city }
app.post('/api/ai/greet', async (req, res) => {
  const { word1, word2, city } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.json({ success: true, text: 'Hey! I am VERA, your TwoWords guide. Set GEMINI_API_KEY in server/.env to unlock my full personality. Let us go explore your ' + (word1 || 'TWO') + ' ' + (word2 || 'WORDS') + ' adventure!', action: null });
  }
  try {
    const result = await aiAgent.generateGreeting({ word1, word2, city, apiKey });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[VERA] Greet error:', err.message);
    res.json({ success: true, text: 'Welcome to TwoWords! Your journey with ' + (word1||'') + ' ' + (word2||'') + ' starts now. I am VERA, your guide. Ask me anything!', action: null });
  }
});

// DELETE /api/ai/session/:id  — clear history
app.delete('/api/ai/session/:sessionId', (req, res) => {
  aiAgent.clearHistory(req.params.sessionId);
  res.json({ success: true, message: 'Session cleared' });
});

// Real-Time WebSocket Server
function attachWSHandlers(wsServer) {
  if (wsServer) {
    wsServer.on('connection', handleWSConnection);
  }
}

function handleWSConnection(ws, req) {
  console.log('[WebSocket] Client connected from ' + req.socket.remoteAddress);

  // Send full state snapshot on connect
  ws.send(JSON.stringify({
    type: 'INIT_STATE',
    pois: database.pois,
    players: Array.from(database.players.values()),
    calibration: database.currentCalibration,
    activeMatch: database.activeMatch,
    messages: database.chatMessages || []
  }));

  ws.send(JSON.stringify({
    type: 'GPS_CALIBRATE',
    player: {
      latitude: database.currentCalibration.latitude,
      longitude: database.currentCalibration.longitude,
      heading: database.currentCalibration.heading,
      altitude: database.currentCalibration.altitude,
      ambition: database.currentCalibration.ambition
    },
    destLat: database.activeMatch.latitude,
    destLon: database.activeMatch.longitude,
    matchName: database.activeMatch.name,
    matchAvatar: database.activeMatch.avatar
  }));

  ws.send(JSON.stringify({
    type: 'MATCH_DESTINATION',
    latitude: database.activeMatch.latitude,
    longitude: database.activeMatch.longitude,
    name: database.activeMatch.name,
    avatar: database.activeMatch.avatar
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'PLAYER_MOVE') {
        const id = data.playerId || 'Player_1';
        database.players.set(id, { ...data, lastSeen: Date.now() });
        broadcastToAll({ type: 'PLAYER_UPDATE', player: data }, ws);
      } else if (data.type === 'GPS_CALIBRATE' || data.type === 'LIVE_WALK_STEP') {
        if (data.player) {
          database.currentCalibration.latitude = Number(data.player.latitude) || database.currentCalibration.latitude;
          database.currentCalibration.longitude = Number(data.player.longitude) || database.currentCalibration.longitude;
          if (data.player.city) database.currentCalibration.city = String(data.player.city);
          if (data.player.heading !== undefined) database.currentCalibration.heading = Number(data.player.heading);
        }
        broadcastToAll(data);
      } else if (data.type === 'ITEM_COLLECTED') {
        broadcastToAll({ type: 'ITEM_COLLECTED', ...data });
      } else if (data.type === 'GO_LIVE_START' || data.type === 'GO_LIVE_STOP') {
        broadcastToAll(data, ws);
      } else if (data.type === 'CHAT_MESSAGE') {
        const msg = {
          id: 'm_' + Date.now(),
          sender: data.sender || 'You',
          avatar: data.avatar || '🎯',
          text: (data.text || '').trim(),
          timestamp: Date.now()
        };
        if (!database.chatMessages) database.chatMessages = [];
        database.chatMessages.push(msg);
        broadcastToAll({ type: 'CHAT_MESSAGE', message: msg });
      } else if (data.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', ts: Date.now() }));
      }
    } catch (e) {
      console.error('[WebSocket] Bad message payload:', e.message);
    }
  });

  ws.on('close', () => {
    console.log('[WebSocket] Client disconnected.');
  });

  ws.on('error', (err) => {
    console.warn('[WebSocket] Client error:', err.message);
  });
}

// Process-level safety to prevent crashes from abrupt socket closures
process.on('uncaughtException', (err) => {
  console.warn('[Server Warning] Caught unhandled exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.warn('[Server Warning] Caught unhandled rejection:', reason);
});

// Broadcast to ALL clients across both HTTP and HTTPS WS servers
function broadcastToAll(payload, excludeWs = null) {
  const msg = JSON.stringify(payload);
  [wss, wssSSL].filter(Boolean).forEach(wsServer => {
    wsServer.clients.forEach((client) => {
      if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
        try {
          client.send(msg, (err) => {
            if (err) console.warn('[WebSocket] Broadcast error:', err.message);
          });
        } catch (e) {
          console.warn('[WebSocket] Broadcast send failed:', e.message);
        }
      }
    });
  });
}

// Keepalive: ping all clients on active servers every 25 seconds
setInterval(() => {
  [wss, wssSSL].filter(Boolean).forEach(wsServer => {
    wsServer.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify({ type: 'KEEPALIVE', ts: Date.now() }), (err) => {
            if (err) console.warn('[WebSocket] Keepalive send error:', err.message);
          });
        } catch (e) {
          console.warn('[WebSocket] Keepalive send failed:', e.message);
        }
      }
    });
  });
}, 25000);

async function startServer() {
  // Attach WS connection handlers to HTTP server
  attachWSHandlers(wss);

  // Setup HTTPS with self-signed certificate
  try {
    const pems = await getOrGenerateCerts();
    httpsServer = https.createServer({ key: pems.private, cert: pems.cert }, app);
    wssSSL = new WebSocketServer({ server: httpsServer });
    attachWSHandlers(wssSSL);

    httpsServer.listen(PORT_SSL, () => {
      console.log(`🔒 HTTPS server listening on port ${PORT_SSL}`);
    });
  } catch (err) {
    console.error('[TLS Error] Could not start HTTPS server:', err.message);
  }

  // Start HTTP Server
  httpServer.listen(PORT, () => {
    const localIP = getLocalIP();
    console.log(`\n======================================================`);
    console.log(`🚀 TwoWords GPS Backend LIVE`);
    console.log(`   HTTP  → http://localhost:${PORT}   (desktop)`);
    console.log(`   HTTPS → https://${localIP}:${PORT_SSL}  (📱 USE THIS ON PHONE)`);
    console.log(`   ⚠️  Phone browser will warn "not secure" — tap Advanced → Proceed`);
    console.log(`   ✅  Camera AR, GPS & mic work once you accept the self-signed cert`);
    console.log(`======================================================\n`);
  });
}

startServer();
