// ============================================================
  // APP STATE & OAKLAND DEFAULTS
  // ============================================================
  // App State & View Modes
  let isArActive = false;
  let viewMode = 'realmap'; // Default: 'realmap' (Real 3D Vector Map), 'cyber' (3D Cyber City), 'streetview', 'satellite', 'camera'
  let currentARMode = 'realmap';

  // MapLibre GL 3D Real Map Engine State
  let realMap3DInstance = null;
  let isRealMap3DInit = false;
  let realMapMarker = null;
  let realMapDestMarker = null;

  // Google Maps Platform Live Integration State
  let streetViewPanorama = null;
  let gmapSatelliteInstance = null;
  let isGmapsApiLoaded = false;
  let isStreetViewInit = false;
  let gmapsApiKey = localStorage.getItem('gmaps_api_key') || 'AIzaSyCTUW_AiAXOJ_PHflqpJ5Cyq05Ro_TESlEt';

  // Player Orientation
  let currentHeading = 45, targetHeading = 45, smoothedHeading = 45;
  let currentPitch = 0, targetPitch = 0, smoothedPitch = 0;
  let dragStartX = 0, dragStartY = 0;
  let headingAtDragStart = 0, pitchAtDragStart = 0;
  let isDragging = false;
  let destinationBearing = 45, destinationDist = 320;

  // Ambition & Target Match
  let currentAmbition = { word1: 'PLAY', word2: 'GOLF' };
  let activeMatch = {
    name: "Alex M.",
    avatar: "🏌️",
    words: "PLAY · GOLF",
    distance: 320,
    lat: 37.8075,
    lon: -122.2680
  };
  let nearbyMatches = [];
  let hasCelebratedArrival = false;
  let isAutoWalking = false, autoWalkInterval = null;

  // Real Oakland, CA Coordinates
  let playerLat = 37.804456, playerLon = -122.271356;
  let originLat = null, originLon = null;
  let hasRealGPS = false;
  let destLat = 37.8075, destLon = -122.2680;
  let cityName = "Oakland, CA";

  // Real Geographic Landmarks in Oakland (POIs)
  let arPOIs = [
    { id: '1', name: "Oakland City Center", category: "Landmark", lat: 37.8038, lon: -122.2730, color: "#00e5ff", icon: "🏛️" },
    { id: '2', name: "Fox Theater Oakland", category: "Culture", lat: 37.8080, lon: -122.2705, color: "#a855f7", icon: "🎭" },
    { id: '3', name: "Lake Merritt Pergola", category: "Scenic", lat: 37.8010, lon: -122.2590, color: "#00ff99", icon: "⛵" },
    { id: '4', name: "Jack London Square", category: "Landmark", lat: 37.7945, lon: -122.2770, color: "#00d4ff", icon: "⚓" },
    { id: '5', name: "Grand Lake Theatre", category: "Culture", lat: 37.8115, lon: -122.2478, color: "#ff7043", icon: "🎬" },
    { id: '6', name: "Oakland Museum of CA", category: "Culture", lat: 37.7986, lon: -122.2638, color: "#e91e63", icon: "🎨" },
    { id: '7', name: "Snow Park Waterfront", category: "Park", lat: 37.8055, lon: -122.2630, color: "#22c55e", icon: "🌳" }
  ];

  // Map & Visual Layers
  let map, playerMarker, destMarker, routeLine, nearbyMapMarkers = [], mapPoiMarkers = [];
  let pipMap = null, pipPlayerMarker = null, pipDestMarker = null, pipRouteLine = null, pipFovCone = null;
  let isPipExpanded = false;
  let gpsWatchId = null;
  let isLiveCameraMode = false, cameraStream = null;

  // ============================================================
  // MATH & GEOSPATIAL HELPERS
  // ============================================================
  function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function getBearing(lat1, lon1, lat2, lon2) {
    const r = d => d * Math.PI / 180;
    const dLon = r(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(r(lat2));
    const x = Math.cos(r(lat1)) * Math.sin(r(lat2)) - Math.sin(r(lat1)) * Math.cos(r(lat2)) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function fmtDist(m) {
    if (m < 1000) return `${Math.round(m)} m`;
    return `${(m / 1609.34).toFixed(1)} mi`;
  }

  function fmtTime(m) {
    const mins = Math.round(m / 80); // Average walking speed ~80m/min (1.33m/s)
    return mins < 1 ? '< 1 min' : `${mins} min`;
  }

  function shortestAngleDiff(target, current) {
    let d = (target - current) % 360;
    if (d < -180) d += 360;
    if (d > 180) d -= 360;
    return d;
  }

  function recalcBearingAndDist() {
    destinationBearing = getBearing(playerLat, playerLon, destLat, destLon);
    destinationDist = haversineDistance(playerLat, playerLon, destLat, destLon);
    const distBig = document.getElementById('ar-dist-big');
    const distSub = document.getElementById('ar-dist-sub');
    if (distBig) distBig.textContent = `${fmtDist(destinationDist)} · ${fmtTime(destinationDist)}`;
    if (distSub) distSub.textContent = `${activeMatch.name} — ${currentAmbition.word1} ${currentAmbition.word2}`;
    const mapLoc = document.getElementById('map-loc-text');
    if (mapLoc) mapLoc.textContent = `${cityName} • ${playerLat.toFixed(4)}, ${playerLon.toFixed(4)}`;
  }

  // ============================================================
  // WEBSOCKET SYNC
  // ============================================================
  let ws = null;
  const WS_PROTOCOL = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const WS_PORT     = location.protocol === 'https:' ? '3443' : '3000';
  const WS_URL      = `${WS_PROTOCOL}//${location.hostname || 'localhost'}:${WS_PORT}`;

  function connectWebSocket() {
    try {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => { pushPositionToServer(); };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'INIT_STATE') {
            if (data.calibration) {
              const c = data.calibration;
              playerLat = Number(c.latitude) || playerLat;
              playerLon = Number(c.longitude) || playerLon;
              if (c.heading !== undefined) setHeading(Number(c.heading));
              if (c.ambition) applyAmbitionString(c.ambition);
              if (c.city) cityName = c.city;
            }
            if (data.pois && Array.isArray(data.pois) && data.pois.length > 0) {
              const iconMap = { 'Landmark': '🏛️', 'Cafe': '☕', 'Transit': '🚆', 'Scenic': '⛵', 'Culture': '🎭', 'Park': '🌳' };
              const colorMap = { 'Landmark': '#00e5ff', 'Cafe': '#ffd700', 'Transit': '#a855f7', 'Scenic': '#00ff99', 'Culture': '#e91e63', 'Park': '#22c55e' };
              arPOIs = data.pois.map(p => ({
                id: p.id,
                name: p.title || p.name,
                category: p.category,
                lat: Number(p.latitude || p.lat),
                lon: Number(p.longitude || p.lon),
                icon: p.icon || iconMap[p.category] || '📍',
                color: p.color || colorMap[p.category] || '#00e5ff'
              }));
              updateMapPOIs();
            }
            if (data.activeMatch) applyActiveMatch(data.activeMatch);
            syncMapToState();
            recalcBearingAndDist();
          }
          if (data.type === "MATCH_DESTINATION" && data.latitude && data.longitude) {
            destLat = Number(data.latitude);
            destLon = Number(data.longitude);
            if (data.name) activeMatch.name = data.name;
            if (data.avatar) activeMatch.avatar = data.avatar;
            recalcBearingAndDist();
            if (destMarker) destMarker.setLatLng([destLat, destLon]);
            if (map && routeLine) routeLine.setLatLngs([[playerLat, playerLon], [destLat, destLon]]);
          }
          if (data.type === "GPS_CALIBRATE" || data.type === "LIVE_WALK_STEP") {
            const p = data.player || data;
            playerLat = Number(p.latitude);
            playerLon = Number(p.longitude);
            if (p.heading !== undefined) setHeading(p.heading);
            if (p.ambition) applyAmbitionString(p.ambition);
            if (data.destLat && data.destLon) {
              destLat = Number(data.destLat);
              destLon = Number(data.destLon);
              if (destMarker) destMarker.setLatLng([destLat, destLon]);
            }
            if (data.matchName) activeMatch.name = data.matchName;
            if (data.matchAvatar) activeMatch.avatar = data.matchAvatar;
            syncMapToState();
            recalcBearingAndDist();
            checkProximityTrigger(destinationDist);
          }
        } catch(e) {}
      };
      ws.onclose = () => { setTimeout(connectWebSocket, 4000); };
    } catch(e) {}
  }

  function pushPositionToServer() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      type: "PLAYER_MOVE",
      playerId: "Player_1",
      latitude: playerLat,
      longitude: playerLon,
      heading: currentHeading,
      altitude: 0
    }));
  }
  connectWebSocket();

  // Fetch lock/calibration from REST
  (async function applyServerGPSLock() {
    try {
      const resp = await fetch('/api/gps/lock');
      if (!resp.ok) return;
      const data = await resp.json();
      if (!data.calibration) return;
      const c = data.calibration, m = data.activeMatch;
      playerLat = Number(c.latitude) || playerLat;
      playerLon = Number(c.longitude) || playerLon;
      if (c.heading !== undefined) setHeading(Number(c.heading));
      if (c.ambition) applyAmbitionString(c.ambition);
      if (c.city) cityName = c.city;
      if (m) applyActiveMatch(m);
      syncMapToState();
      recalcBearingAndDist();
    } catch(e) {}
  })();

  function applyAmbitionString(str) {
    const parts = str.split(/[\s·]+/);
    if (parts.length >= 2) {
      currentAmbition.word1 = parts[0].toUpperCase();
      currentAmbition.word2 = parts[1].toUpperCase();
      document.getElementById('xp-words').textContent = `${currentAmbition.word1} · ${currentAmbition.word2}`;
    }
  }

  function applyActiveMatch(m) {
    destLat = Number(m.latitude) || destLat;
    destLon = Number(m.longitude) || destLon;
    activeMatch.name = m.name || activeMatch.name;
    activeMatch.avatar = m.avatar || activeMatch.avatar;
  }

  function syncMapToState() {
    if (playerMarker) playerMarker.setLatLng([playerLat, playerLon]);
    if (destMarker) destMarker.setLatLng([destLat, destLon]);
    if (map) {
      map.panTo([playerLat, playerLon]);
      if (routeLine) routeLine.setLatLngs([[playerLat, playerLon], [destLat, destLon]]);
    }
    updatePipMap();
    if (isThreeInitialized) checkAndRefreshBuildings();
  }

  // ============================================================
  // LEAFLET MAPS
  // ============================================================
  function initMap() {
    map = L.map('leaflet-map', { zoomControl: false }).setView([playerLat, playerLon], 16);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20 }).addTo(map);

    playerMarker = L.circleMarker([playerLat, playerLon], {
      radius: 9, color: '#00e5ff', fillColor: '#00e5ff', fillOpacity: 1, weight: 3
    }).addTo(map).bindPopup('<strong>You (Player 1)</strong><br>Oakland, CA');

    destMarker = L.circleMarker([destLat, destLon], {
      radius: 11, color: '#00ff99', fillColor: '#00ff99', fillOpacity: 0.85, weight: 3
    }).addTo(map).bindPopup(`<strong>${activeMatch.name}</strong><br>${currentAmbition.word1} ${currentAmbition.word2}`);

    routeLine = L.polyline([[playerLat, playerLon], [destLat, destLon]], {
      color: '#1a73e8', weight: 4, opacity: 0.8, dashArray: '10 6'
    }).addTo(map);

    updateMapPOIs();
    generateNearbyMatches(currentAmbition.word1, currentAmbition.word2);
  }

  function recenterMap() {
    if (map) map.flyTo([playerLat, playerLon], 17);
  }

  function updateMapPOIs() {
    if (!map) return;
    mapPoiMarkers.forEach(m => map.removeLayer(m));
    mapPoiMarkers = [];
    arPOIs.forEach(p => {
      if (!p.lat || !p.lon) return;
      const marker = L.circleMarker([p.lat, p.lon], {
        radius: 7, color: p.color || '#00e5ff', fillColor: p.color || '#00e5ff', fillOpacity: 0.75, weight: 2
      }).addTo(map).bindPopup(`<strong>${p.icon || '📍'} ${p.name}</strong><br>${p.category || 'POI'}`);
      marker.on('click', () => setTargetPOI(p));
      mapPoiMarkers.push(marker);
    });
  }

  function setTargetPOI(poi) {
    destLat = poi.lat;
    destLon = poi.lon;
    activeMatch.name = poi.name;
    activeMatch.avatar = poi.icon || '📍';
    recalcBearingAndDist();
    syncMapToState();
  }

  // Circular PIP Mini-Map in AR Mode
  function initPipMap() {
    if (pipMap) return;
    pipMap = L.map('ar-pip-map', {
      zoomControl: false, attributionControl: false, dragging: false,
      scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false
    }).setView([playerLat, playerLon], 16);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20 }).addTo(pipMap);

    pipPlayerMarker = L.circleMarker([playerLat, playerLon], {
      radius: 6, color: '#00e5ff', fillColor: '#00e5ff', fillOpacity: 1, weight: 2
    }).addTo(pipMap);

    pipDestMarker = L.circleMarker([destLat, destLon], {
      radius: 7, color: '#00ff99', fillColor: '#00ff99', fillOpacity: 0.9, weight: 2
    }).addTo(pipMap);

    pipRouteLine = L.polyline([[playerLat, playerLon], [destLat, destLon]], {
      color: '#1a73e8', weight: 3, opacity: 0.85, dashArray: '5 4'
    }).addTo(pipMap);
  }

  function updatePipMap() {
    if (!pipMap) return;
    pipMap.setView([playerLat, playerLon], 16, { animate: false });
    if (pipPlayerMarker) pipPlayerMarker.setLatLng([playerLat, playerLon]);
    if (pipDestMarker) pipDestMarker.setLatLng([destLat, destLon]);
    if (pipRouteLine) pipRouteLine.setLatLngs([[playerLat, playerLon], [destLat, destLon]]);
  }

  function togglePipSize() {
    const wrap = document.querySelector('.ar-minimap-wrap');
    if (!wrap) return;
    isPipExpanded = !isPipExpanded;
    if (isPipExpanded) {
      wrap.style.width = '200px';
      wrap.style.height = '200px';
      wrap.style.borderRadius = '24px';
    } else {
      wrap.style.width = '112px';
      wrap.style.height = '112px';
      wrap.style.borderRadius = '50%';
    }
    setTimeout(() => { if (pipMap) pipMap.invalidateSize(); }, 200);
  }

  // ============================================================
  // PROCEDURAL STREET BACKGROUND (High-Fidelity Oakland Street Camera Simulation)
  // ============================================================
  function drawProceduralStreetBackdrop(ctx, W, H, heading, pitch) {
    const horizon = H * 0.50 + (pitch / 60) * (H * 0.32);

    // 1. Sky Gradient (Atmospheric Daylight into Twilight)
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizon);
    skyGrad.addColorStop(0, '#0a1426');
    skyGrad.addColorStop(0.5, '#132847');
    skyGrad.addColorStop(0.85, '#20416d');
    skyGrad.addColorStop(1, '#3b628f');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, Math.max(0, horizon));

    // Subtle sun/light glow on horizon based on heading (facing SW ~225°)
    const sunAngle = ((225 - heading + 540) % 360) - 180;
    if (Math.abs(sunAngle) < 90) {
      const sunX = W / 2 + Math.tan(sunAngle * Math.PI / 180) * (W * 0.65);
      const sunGrad = ctx.createRadialGradient(sunX, horizon, 10, sunX, horizon, 220);
      sunGrad.addColorStop(0, 'rgba(255, 235, 180, 0.45)');
      sunGrad.addColorStop(0.4, 'rgba(255, 180, 100, 0.2)');
      sunGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = sunGrad;
      ctx.fillRect(0, 0, W, horizon + 50);
    }

    // 2. Distant Oakland Skyline Silhouette
    ctx.save();
    ctx.fillStyle = '#0a101d';
    const skylinePan = ((heading % 360) / 360) * W * 1.6;
    for (let x = -80; x < W + 80; x += 32) {
      const seed = Math.sin((x + skylinePan) * 0.04);
      const sH = 30 + Math.abs(seed) * 90;
      ctx.fillRect(x, horizon - sH, 30, sH);
      // Skyline window sparkles
      if (sH > 50) {
        ctx.fillStyle = 'rgba(255, 225, 140, 0.35)';
        for (let wy = horizon - sH + 8; wy < horizon - 6; wy += 12) {
          if (Math.sin(wy * 11 + x) > 0.2) ctx.fillRect(x + 5, wy, 3, 4);
        }
        ctx.fillStyle = '#0a101d';
      }
    }
    ctx.restore();

    // 3. Ground / Street Asphalt Base
    const groundGrad = ctx.createLinearGradient(0, horizon, 0, H);
    groundGrad.addColorStop(0, '#111824');
    groundGrad.addColorStop(0.35, '#161f2e');
    groundGrad.addColorStop(1, '#0b1019');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, horizon, W, H - horizon);

    // 4. Perspective Street Avenue (Broadway & 14th St Oakland Corridor)
    // Road vanishing point linked to camera heading & pitch
    const roadBearing = 45; // Broadway heading NE
    let roadRel = (roadBearing - heading + 540) % 360 - 180;
    const vpX = W / 2 + Math.tan(roadRel * Math.PI / 180) * (W * 0.65);

    ctx.save();
    // Perspective Road Polygon
    const roadTopHalf = Math.max(14, W * 0.04);
    const roadBottomHalf = W * 0.46;
    ctx.beginPath();
    ctx.moveTo(vpX - roadTopHalf, horizon);
    ctx.lineTo(vpX + roadTopHalf, horizon);
    ctx.lineTo(vpX + roadBottomHalf, H);
    ctx.lineTo(vpX - roadBottomHalf, H);
    ctx.closePath();
    ctx.fillStyle = 'rgba(18, 25, 38, 0.95)';
    ctx.fill();

    // Sidewalks on Left and Right
    const swTop = roadTopHalf + 10;
    const swBottom = roadBottomHalf + W * 0.22;
    // Left Sidewalk
    ctx.beginPath();
    ctx.moveTo(vpX - roadTopHalf, horizon);
    ctx.lineTo(vpX - swTop, horizon);
    ctx.lineTo(vpX - swBottom, H);
    ctx.lineTo(vpX - roadBottomHalf, H);
    ctx.closePath();
    ctx.fillStyle = 'rgba(28, 38, 54, 0.85)';
    ctx.fill();
    // Right Sidewalk
    ctx.beginPath();
    ctx.moveTo(vpX + roadTopHalf, horizon);
    ctx.lineTo(vpX + swTop, horizon);
    ctx.lineTo(vpX + swBottom, H);
    ctx.lineTo(vpX + roadBottomHalf, H);
    ctx.closePath();
    ctx.fillStyle = 'rgba(28, 38, 54, 0.85)';
    ctx.fill();

    // Sidewalk Curbs (Cyan neon street reflection)
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(vpX - roadTopHalf, horizon);
    ctx.lineTo(vpX - roadBottomHalf, H);
    ctx.moveTo(vpX + roadTopHalf, horizon);
    ctx.lineTo(vpX + roadBottomHalf, H);
    ctx.stroke();

    // Double-Solid Yellow Center Divider Line
    ctx.strokeStyle = 'rgba(255, 210, 60, 0.6)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(vpX - 2, horizon + 2);
    ctx.lineTo(vpX - 4, H);
    ctx.moveTo(vpX + 2, horizon + 2);
    ctx.lineTo(vpX + 4, H);
    ctx.stroke();

    // Dashed White Lane Markings
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 18]);
    ctx.beginPath();
    ctx.moveTo(vpX - roadTopHalf * 0.5, horizon + 4);
    ctx.lineTo(vpX - roadBottomHalf * 0.5, H);
    ctx.moveTo(vpX + roadTopHalf * 0.5, horizon + 4);
    ctx.lineTo(vpX + roadBottomHalf * 0.5, H);
    ctx.stroke();
    ctx.setLineDash([]);

    // Pedestrian Crosswalk Zebra Stripes
    const cwTop = horizon + (H - horizon) * 0.58;
    const cwBot = horizon + (H - horizon) * 0.72;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    for (let s = -roadBottomHalf * 0.75; s <= roadBottomHalf * 0.75; s += 24) {
      ctx.fillRect(vpX + s, cwTop, 12, cwBot - cwTop);
    }

    // 5. Left & Right Architectural Facades along Avenue
    // (Disabled in favor of true 3D GPS architectural buildings extruded in Three.js)


    ctx.restore();

    // 6. Camera Lens Vignette
    const vigGrad = ctx.createRadialGradient(W / 2, H / 2, W * 0.35, W / 2, H / 2, W * 0.75);
    vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vigGrad.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, W, H);
  }

  // Draw perspective building facades along the avenue
  function drawAvenueFacade(ctx, topX, topY, botX, botY, side, heading) {
    const bldgCount = 5;
    const colors = ['#152033', '#1c283d', '#111b2b', '#182436', '#202f47'];
    for (let i = 0; i < bldgCount; i++) {
      const t0 = i / bldgCount;
      const t1 = (i + 1) / bldgCount;
      const x0 = topX + (botX - topX) * t0;
      const y0 = topY + (botY - topY) * t0;
      const x1 = topX + (botX - topX) * t1;
      const y1 = topY + (botY - topY) * t1;

      const bldgH = (50 + (i * 38) + Math.abs(Math.sin(i * 2 + heading * 0.05)) * 40) * (0.4 + t1 * 0.7);
      const outerX0 = x0 + side * (70 + t0 * 160);
      const outerX1 = x1 + side * (70 + t1 * 160);

      // Building Face
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0, y0 - bldgH * 0.9);
      ctx.lineTo(x1, y1 - bldgH);
      ctx.lineTo(x1, y1);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Window Grids
      ctx.fillStyle = 'rgba(255, 235, 170, 0.22)';
      const floors = Math.floor(bldgH / 16);
      for (let f = 1; f < floors; f++) {
        const fy = y0 - (bldgH * 0.9) * (f / floors);
        if (fy > topY - 10) {
          const wx = x0 + (x1 - x0) * 0.4;
          ctx.fillRect(wx - 4, fy, 8, 5);
        }
      }

      // Street Lantern Posts along Sidewalk
      if (i > 0 && i < 4) {
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0, y0 - 28 * (0.5 + t0 * 0.6));
        ctx.stroke();
        // Light glow
        ctx.fillStyle = '#fffae0';
        ctx.beginPath();
        ctx.arc(x0, y0 - 28 * (0.5 + t0 * 0.6), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ============================================================
  // OAKLAND 3D AR STREET SIGNS DATA & RENDERER
  // ============================================================
  const oaklandStreetSigns = [
    { name: 'Broadway', lat: 37.8055, lon: -122.2710, type: 'Ave', icon: '🛣️' },
    { name: '14th St', lat: 37.8048, lon: -122.2722, type: 'St', icon: '🚸' },
    { name: '12th St / City Ctr', lat: 37.8035, lon: -122.2730, type: 'Cross', icon: '🏛️' },
    { name: 'Frank Ogawa Plaza', lat: 37.8062, lon: -122.2725, type: 'Plz', icon: '🌳' },
    { name: 'Telegraph Ave', lat: 37.8075, lon: -122.2700, type: 'Ave', icon: '🛣️' },
    { name: '15th St', lat: 37.8058, lon: -122.2702, type: 'St', icon: '🚸' }
  ];

  function drawStreetSign(ctx, proj, name, type, icon, distance) {
    const { x, y, scale } = proj;
    const signScale = Math.max(0.48, Math.min(1.0, scale));
    const signH = 34 * signScale;
    const padding = 10 * signScale;
    const fontMain = Math.round(11 * signScale);
    const fontSub = Math.round(9 * signScale);

    ctx.save();
    ctx.font = `800 ${fontMain}px "Plus Jakarta Sans", sans-serif`;
    const nameW = ctx.measureText(name).width;
    const signW = Math.max(nameW + 55 * signScale, 110 * signScale);
    const signX = x - signW / 2;
    const signY = y - signH;

    // Anchor pole down to ground
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.5 * signScale;
    ctx.beginPath();
    ctx.moveTo(x, signY + signH);
    ctx.lineTo(x, y + 25 * signScale);
    ctx.stroke();

    // Ground footprint dot
    ctx.beginPath();
    ctx.ellipse(x, y + 25 * signScale, 6 * signScale, 2.5 * signScale, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 229, 255, 0.6)';
    ctx.fill();

    // Sign Body - Highway Green / Dark Emerald Glass
    roundRect(ctx, signX, signY, signW, signH, 7 * signScale);
    ctx.fillStyle = 'rgba(10, 36, 24, 0.94)';
    ctx.shadowColor = 'rgba(0, 200, 115, 0.4)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 3;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Sign Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.5 * signScale;
    ctx.stroke();

    // Type Badge (e.g. "AVE" / "ST")
    const badgeW = 28 * signScale;
    const badgeH = 14 * signScale;
    const badgeX = signX + signW - badgeW - 6 * signScale;
    const badgeY = signY + 6 * signScale;
    roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 3 * signScale);
    ctx.fillStyle = 'rgba(0, 229, 255, 0.25)';
    ctx.fill();
    ctx.font = `800 ${fontSub}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#00e5ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(type.toUpperCase().slice(0, 3), badgeX + badgeW / 2, badgeY + badgeH / 2);

    // Street Name & Icon
    ctx.textAlign = 'left';
    ctx.font = `${Math.round(11 * signScale)}px sans-serif`;
    ctx.fillText(icon, signX + padding, signY + signH * 0.55);

    ctx.font = `800 ${fontMain}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name, signX + padding + 18 * signScale, signY + signH * 0.55);

    ctx.restore();
  }

  // ============================================================
  // GOOGLE MAPS LIVE VIEW & CAMERA AR PROJECTION & RENDERER
  // ============================================================
  function drawSimulatedCameraBackdrop(ctx, W, H, heading, pitch, t) {
    const horizon = H * 0.50 + (pitch / 60) * (H * 0.32);

    // 1. Daylight sky with atmospheric gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, Math.max(10, horizon));
    skyGrad.addColorStop(0, '#3a7bd5');
    skyGrad.addColorStop(0.5, '#68b0f8');
    skyGrad.addColorStop(1, '#d8eafc');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, Math.max(0, horizon));

    // 2. Distant Oakland urban silhouettes
    ctx.save();
    ctx.fillStyle = 'rgba(150, 180, 215, 0.7)';
    const bldgWidth = 60;
    for (let bx = -bldgWidth; bx < W + bldgWidth; bx += bldgWidth) {
      const bh = 35 + Math.abs(Math.sin((bx + heading * 3.5) * 0.015)) * 85;
      ctx.fillRect(bx, horizon - bh, bldgWidth - 4, bh);
    }
    ctx.restore();

    // 3. Ground / Street Asphalt Pavement
    const groundGrad = ctx.createLinearGradient(0, horizon, 0, H);
    groundGrad.addColorStop(0, '#59677b');
    groundGrad.addColorStop(0.35, '#374151');
    groundGrad.addColorStop(1, '#1f2937');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, horizon, W, H - horizon);

    // 4. Perspective Street Markings (Broadway Road Centerline & Lanes)
    ctx.save();
    const roadCenterX = W / 2 + Math.sin(heading * Math.PI / 180) * (W * 0.25);
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.75)'; // Yellow centerline
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(roadCenterX, horizon);
    ctx.lineTo(W * 0.5, H);
    ctx.stroke();

    // White lane dividers
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 14]);
    ctx.beginPath();
    ctx.moveTo(roadCenterX - 35, horizon);
    ctx.lineTo(W * 0.18, H);
    ctx.moveTo(roadCenterX + 35, horizon);
    ctx.lineTo(W * 0.82, H);
    ctx.stroke();
    ctx.restore();

    // 5. Optical Lens Vignette & Grain
    ctx.save();
    const grainGrad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.85);
    grainGrad.addColorStop(0, 'rgba(0,0,0,0)');
    grainGrad.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = grainGrad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function renderLiveARView(heading) {
    // Safeguard: ensure running in a browser environment
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return;
    }
    const W = window.innerWidth, H = window.innerHeight;
    const t = Date.now();

    // 1. Background Video / Simulated Camera Backdrop handling
    const bgCanvas = document.getElementById('ar-bg-procedural');
    const video = document.getElementById('ar-bg-video');

    if (viewMode === 'camera') {
      if (cameraStream && video && video.srcObject) {
        if (bgCanvas) bgCanvas.style.display = 'none';
        if (video) video.style.display = 'block';
      } else if (bgCanvas) {
        bgCanvas.style.display = 'block';
        if (bgCanvas.width !== W || bgCanvas.height !== H) { bgCanvas.width = W; bgCanvas.height = H; }
        const bgCtx = typeof bgCanvas.getContext === 'function' ? bgCanvas.getContext('2d') : null;
        if (bgCtx) {
          bgCtx.clearRect(0, 0, W, H);
          drawSimulatedCameraBackdrop(bgCtx, W, H, heading, smoothedPitch, t);
        }
      }
    } else {
      if (bgCanvas) bgCanvas.style.display = 'none';
    }

    // 2. Overlay Canvas (Live View Chevrons, Destination Pin, POIs, Street Signs)
    const canvas = document.getElementById('ar-overlay-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    ctx.clearRect(0, 0, W, H);

    // Perspective Projection Calculator
    function project(bearingDeg, distMeters, heightAboveGround = 0) {
      let a = (bearingDeg - heading + 360) % 360;
      if (a > 180) a -= 360;
      if (Math.abs(a) > 58) return null; // Outside camera horizontal FOV

      const screenX = W / 2 + Math.tan(a * Math.PI / 180) * (W * 0.58);
      const horizon = H * 0.50 + (smoothedPitch / 60) * (H * 0.32);

      // True optical depression: angle below horizon for ground contact point
      const camHeight = 1.6;
      const elevationRad = Math.atan2(camHeight - heightAboveGround, Math.max(1.5, distMeters));
      const screenY = horizon + elevationRad * (H * 0.88);

      // Perspective Scale (smooth decay from 1.15 to 0.38)
      const scale = Math.min(1.15, Math.max(0.38, 28 / (Math.sqrt(distMeters) + 12)));
      return { x: screenX, y: screenY, a, scale, horizon, dist: distMeters };
    }

    // Angular turn delta relative to destination
    const turnDelta = (() => {
      let d = (destinationBearing - heading + 360) % 360;
      if (d > 180) d -= 360;
      return d;
    })();

    // Update Top Navigation Guidance HUD Card
    updateNavGuidanceHUD(heading, destinationBearing, destinationDist, turnDelta);

    // 1. Off-Screen Turn Indicator Arrows (Google Maps Live View signature)
    if (Math.abs(turnDelta) > 35) {
      const isRight = turnDelta > 0;
      const isUTurn = Math.abs(turnDelta) > 130;
      const ax = isRight ? W - 70 : 70;
      const ay = H * 0.44;

      ctx.save();
      // Arrow circle badge with pulsing glow
      const pulseB = Math.sin(t * 0.006) * 4;
      ctx.beginPath();
      ctx.arc(ax, ay, 32 + pulseB, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(26, 115, 232, 0.92)';
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = 24;
      ctx.fill();

      // Border ring
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Arrow icon
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 30px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur = 0;
      ctx.fillText(isUTurn ? '⮌' : (isRight ? '→' : '←'), ax, ay);

      // Direction text pill below arrow
      ctx.font = '800 12px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#ffffff';
      const angleDeg = Math.round(Math.abs(turnDelta));
      ctx.fillText(isUTurn ? 'Turn Around' : (isRight ? `Turn Right ${angleDeg}°` : `Turn Left ${angleDeg}°`), ax, ay + 48);
      ctx.restore();
    }

    // 2. Ground Guidance Ribbon & Animated Chevrons
    if (viewMode !== 'cyber' && Math.abs(turnDelta) < 78) {
      // 2A. Translucent Pavement Guidance Corridor Ribbon
      ctx.save();
      ctx.beginPath();
      let hasRibbonStart = false;
      const ribbonSteps = 8;
      for (let r = 0; r <= ribbonSteps; r++) {
        const rDist = 3.5 + r * 4.0;
        if (rDist > destinationDist) break;
        const pL = project(destinationBearing - 2.5, rDist, 0);
        const pR = project(destinationBearing + 2.5, rDist, 0);
        if (pL && pR) {
          if (!hasRibbonStart) {
            ctx.moveTo(pL.x, pL.y);
            hasRibbonStart = true;
          } else {
            ctx.lineTo(pL.x, pL.y);
          }
        }
      }
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.25)';
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = 16;
      ctx.stroke();
      ctx.restore();

      // 2B. Animated Chevrons advancing along the path
      const chevronCount = 7;
      const animCycle = ((t * 0.0035) % 1.0); // 0 to 1 loop

      for (let i = 0; i < chevronCount; i++) {
        const dist = 3.5 + (i + animCycle) * 4.2;
        if (dist > destinationDist + 4) continue;

        const proj = project(destinationBearing, dist, 0);
        if (!proj) continue;

        const { x, y, scale } = proj;
        if (y < proj.horizon + 8 || y > H + 50) continue;

        const w = 52 * scale;
        const h = 26 * scale;
        const alpha = Math.min(1.0, Math.max(0.2, (1.0 - (dist / 42))));

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);

        // Chevron Path
        ctx.beginPath();
        ctx.moveTo(0, -h * 0.7);
        ctx.lineTo(w * 0.5, 0);
        ctx.lineTo(w * 0.3, 0);
        ctx.lineTo(0, h * 0.5);
        ctx.lineTo(-w * 0.3, 0);
        ctx.lineTo(-w * 0.5, 0);
        ctx.closePath();

        // Gradient & Glow
        const cGrad = ctx.createLinearGradient(0, -h, 0, h);
        cGrad.addColorStop(0, '#00e5ff');
        cGrad.addColorStop(1, '#1a73e8');
        ctx.fillStyle = cGrad;
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 16 * scale;
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.2 * scale;
        ctx.shadowBlur = 0;
        ctx.stroke();

        ctx.restore();
      }
    }

    // 3. Floating 3D AR Street Name Signs (Oakland Downtown Intersection Landmarks)
    oaklandStreetSigns.forEach(sign => {
      const b = getBearing(playerLat, playerLon, sign.lat, sign.lon);
      const d = haversineDistance(playerLat, playerLon, sign.lat, sign.lon);
      if (d > 350) return;
      const proj = project(b, d, 3.8); // 3.8m elevation
      if (!proj) return;
      drawStreetSign(ctx, proj, sign.name, sign.type, sign.icon, fmtDist(d));
    });

    // 4. Floating 3D Destination Pin (Google Maps Live View signature)
    const destProj = project(destinationBearing, destinationDist, 0);
    if (destProj) {
      const { x, y, scale } = destProj;
      const pinScale = Math.max(0.42, scale);
      const pinHeadY = y - 68 * pinScale;

      // A) Pulsing Ground Contact Rings
      ctx.save();
      const pulsePhase = ((t * 0.003) % 1);
      const pulseR = (16 + pulsePhase * 36) * pinScale;
      ctx.beginPath();
      ctx.ellipse(x, y, pulseR * 2, pulseR * 0.55, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0, 255, 153, ${(1 - pulsePhase) * 0.85})`;
      ctx.lineWidth = 2.5 * pinScale;
      ctx.stroke();

      // Ground anchor dot
      ctx.beginPath();
      ctx.ellipse(x, y, 14 * pinScale, 5 * pinScale, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 255, 153, 0.7)';
      ctx.fill();
      ctx.restore();

      // B) Vertical Glowing Light Pillar
      ctx.save();
      const beamGrad = ctx.createLinearGradient(x, y, x, pinHeadY - 90);
      beamGrad.addColorStop(0, 'rgba(0, 255, 153, 0.75)');
      beamGrad.addColorStop(0.7, 'rgba(0, 229, 255, 0.4)');
      beamGrad.addColorStop(1, 'rgba(0, 255, 153, 0)');
      ctx.strokeStyle = beamGrad;
      ctx.lineWidth = 3.5 * pinScale;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, pinHeadY - 90);
      ctx.stroke();
      ctx.restore();

      // C) Pin Pinhead & Stem
      ctx.save();
      const pinR = 21 * pinScale;

      // Pin stem cone
      ctx.beginPath();
      ctx.moveTo(x - 5 * pinScale, pinHeadY + pinR * 0.4);
      ctx.lineTo(x, y);
      ctx.lineTo(x + 5 * pinScale, pinHeadY + pinR * 0.4);
      ctx.closePath();
      ctx.fillStyle = '#00c853';
      ctx.fill();

      // Pinhead circle
      ctx.beginPath();
      ctx.arc(x, pinHeadY, pinR, 0, Math.PI * 2);
      ctx.fillStyle = '#00ff99';
      ctx.shadowColor = '#00ff99';
      ctx.shadowBlur = 22;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5 * pinScale;
      ctx.shadowBlur = 0;
      ctx.stroke();

      // Pinhead Avatar
      ctx.font = `${Math.round(pinR * 1.05)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(activeMatch.avatar || '🏌️', x, pinHeadY);
      ctx.restore();

      // D) Destination Match Card
      drawDestinationCard(ctx, x, pinHeadY - pinR - 12, activeMatch.name, activeMatch.avatar,
        `${currentAmbition.word1} · ${currentAmbition.word2}`, fmtDist(destinationDist), pinScale, t);
    }

    // 5. Floating Real-World Geographic POI Cards (Oakland Landmarks)
    arPOIs.forEach(poi => {
      const b = (poi.lat && poi.lon) ? getBearing(playerLat, playerLon, poi.lat, poi.lon) : 0;
      const d = (poi.lat && poi.lon) ? haversineDistance(playerLat, playerLon, poi.lat, poi.lon) : 100;
      const proj = project(b, d, 2.5); // Floating ~2.5m above ground
      if (!proj) return;
      drawPoiCard(ctx, proj, poi.name, poi.icon, fmtDist(d), poi.color || '#00e5ff', t);
    });
  }

  // Update Top Navigation Guidance HUD Card
  function updateNavGuidanceHUD(heading, destinationBearing, dist, turnDelta) {
    const iconEl = document.getElementById('nav-maneuver-icon');
    const primaryEl = document.getElementById('nav-primary-instruction');
    const secondaryEl = document.getElementById('nav-secondary-instruction');
    if (!iconEl || !primaryEl || !secondaryEl) return;

    const matchName = activeMatch.name || 'Alex M.';
    const ambitionTxt = `${currentAmbition.word1} ${currentAmbition.word2}`.toUpperCase();
    const walkTimeMins = Math.max(1, Math.round(dist / 80));

    if (dist < 18) {
      iconEl.textContent = '🏁';
      primaryEl.textContent = `You have arrived at ${matchName}!`;
      secondaryEl.textContent = `${ambitionTxt} · Target Location Reached`;
    } else if (Math.abs(turnDelta) <= 25) {
      iconEl.textContent = '↑';
      primaryEl.textContent = 'Continue straight on Broadway';
      secondaryEl.textContent = `Toward ${matchName} (${ambitionTxt}) · ${fmtDist(dist)} (${walkTimeMins} min)`;
    } else if (turnDelta > 25 && turnDelta <= 65) {
      iconEl.textContent = '↗';
      primaryEl.textContent = 'Bear slight right toward 14th St';
      secondaryEl.textContent = `${fmtDist(dist)} remaining · ${matchName}`;
    } else if (turnDelta < -25 && turnDelta >= -65) {
      iconEl.textContent = '↖';
      primaryEl.textContent = 'Bear slight left toward Frank Ogawa Plaza';
      secondaryEl.textContent = `${fmtDist(dist)} remaining · ${matchName}`;
    } else if (turnDelta > 65 && turnDelta <= 120) {
      iconEl.textContent = '➔';
      primaryEl.textContent = 'Turn right onto 14th St';
      secondaryEl.textContent = `In ${fmtDist(dist)} · Destination is on your right`;
    } else if (turnDelta < -65 && turnDelta >= -120) {
      iconEl.textContent = '⬅';
      primaryEl.textContent = 'Turn left toward Broadway';
      secondaryEl.textContent = `In ${fmtDist(dist)} · Destination is on your left`;
    } else {
      iconEl.textContent = '⮌';
      primaryEl.textContent = 'Make a U-turn when possible';
      secondaryEl.textContent = `Facing wrong direction · Walk toward Broadway`;
    }
  }

  // Visual Positioning System (VPS) Calibration Trigger
  function triggerVPSCalibration() {
    const scan = document.getElementById('ar-scanning-overlay');
    const cloud = document.getElementById('vps-feature-cloud');
    const title = document.getElementById('vps-scan-title');
    const sub = document.getElementById('vps-scan-sub');
    if (!scan) return;

    scan.classList.remove('hidden');

    // Spawn animated SLAM feature tracking points
    if (cloud) {
      cloud.innerHTML = '';
      for (let i = 0; i < 40; i++) {
        const pt = document.createElement('div');
        pt.className = 'vps-pt';
        pt.style.left = (8 + Math.random() * 84) + '%';
        pt.style.top = (12 + Math.random() * 76) + '%';
        pt.style.animationDelay = (Math.random() * 1.2) + 's';
        cloud.appendChild(pt);
      }
    }

    if (title) title.textContent = 'Scanning Oakland Streetscape…';
    if (sub) sub.textContent = 'Point camera at buildings and signs across the street';

    setTimeout(() => {
      if (title) title.textContent = 'Detecting 3D Building Geometry…';
      if (sub) sub.textContent = 'Matching with Oakland OpenStreetMap 3D anchor points';
    }, 700);

    setTimeout(() => {
      if (title) title.textContent = '✓ VPS Calibrated & GPS Locked';
      if (sub) sub.textContent = 'Position verified (Accuracy: 0.6 m) · Live View Active';
    }, 1500);

    setTimeout(() => {
      scan.classList.add('hidden');
    }, 2200);
  }

  
  function drawDestinationCard(ctx, x, y, name, avatar, ambition, distance, scale, t) {
    const cardScale = Math.max(0.65, Math.min(1.15, scale));
    const cardH = 46 * cardScale;
    const padding = 12 * cardScale;
    const fontMain = Math.round(13 * cardScale);
    const fontSub = Math.round(11 * cardScale);

    ctx.save();
    ctx.font = `800 ${fontMain}px "Plus Jakarta Sans", sans-serif`;
    const nameW = ctx.measureText(name).width;
    const cardW = Math.max(nameW + 80 * cardScale, 150 * cardScale);
    const cardX = x - cardW / 2;
    const cardY = y - cardH;

    // Card Glass Background
    roundRect(ctx, cardX, cardY, cardW, cardH, 12 * cardScale);
    ctx.fillStyle = 'rgba(8, 16, 32, 0.94)';
    ctx.shadowColor = 'rgba(0, 255, 153, 0.6)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;
    ctx.fill();

    ctx.strokeStyle = 'rgba(0, 255, 153, 0.95)';
    ctx.lineWidth = 2 * cardScale;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Downward pointer triangle
    ctx.beginPath();
    ctx.moveTo(x - 7 * cardScale, cardY + cardH);
    ctx.lineTo(x + 7 * cardScale, cardY + cardH);
    ctx.lineTo(x, cardY + cardH + 8 * cardScale);
    ctx.closePath();
    ctx.fillStyle = 'rgba(8, 16, 32, 0.94)';
    ctx.fill();

    // Avatar Circle
    const ax = cardX + padding + 12 * cardScale;
    const ay = cardY + cardH / 2;
    ctx.beginPath();
    ctx.arc(ax, ay, 14 * cardScale, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 200, 83, 0.35)';
    ctx.fill();
    ctx.strokeStyle = '#00ff99';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = `${Math.round(14 * cardScale)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(avatar, ax, ay);

    // Text details
    const tx = ax + 16 * cardScale + 4;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${fontMain}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText(name, tx, cardY + cardH * 0.38);

    ctx.fillStyle = '#00ff99';
    ctx.font = `700 ${fontSub}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText(`${ambition} • ${distance}`, tx, cardY + cardH * 0.75);

    ctx.restore();
  }

  // Draw Floating POI Card (Google Maps Live View style)
  function drawPoiCard(ctx, proj, title, icon, distance, color, t) {
    const { x, y, scale } = proj;
    const cardScale = Math.max(0.5, Math.min(0.95, scale));
    const cardH = 36 * cardScale;
    const padding = 10 * cardScale;
    const fontMain = Math.round(12 * cardScale);
    const fontSub = Math.round(10 * cardScale);

    ctx.save();
    ctx.font = `800 ${fontMain}px "Plus Jakarta Sans", sans-serif`;
    const titleW = ctx.measureText(title).width;
    const cardW = Math.max(titleW + 55 * cardScale, 120 * cardScale);
    const cardX = x - cardW / 2;
    const cardY = y - cardH - 12 * cardScale;

    // Card Body (Sleek Dark Cyber Glass)
    roundRect(ctx, cardX, cardY, cardW, cardH, 10 * cardScale);
    ctx.fillStyle = 'rgba(8, 14, 28, 0.92)';
    ctx.shadowColor = color || '#00e5ff';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    ctx.fill();

    ctx.strokeStyle = color || '#00e5ff';
    ctx.lineWidth = 1.5 * cardScale;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Stem line to ground
    ctx.strokeStyle = color || '#00e5ff';
    ctx.lineWidth = 1.5 * cardScale;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x, cardY + cardH);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Icon Circle
    const ax = cardX + padding + 10 * cardScale;
    const ay = cardY + cardH / 2;
    ctx.beginPath();
    ctx.arc(ax, ay, 11 * cardScale, 0, Math.PI * 2);
    ctx.fillStyle = (color || '#00e5ff') + '33';
    ctx.fill();
    ctx.font = `${Math.round(11 * cardScale)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, ax, ay);

    // Text labels
    const tx = ax + 14 * cardScale + 3;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${fontMain}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText(title, tx, cardY + cardH * 0.38);

    ctx.fillStyle = color || '#00e5ff';
    ctx.font = `700 ${fontSub}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText(distance, tx, cardY + cardH * 0.75);

    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ============================================================
  // THREE.JS 3D GEOSPATIAL CYBER CITY AR ENGINE (GPS-Locked Real World)
  // ============================================================
  let threeScene = null, threeCamera = null, threeRenderer = null;
  let threeObjectsGroup = null, threeBuildingsGroup = null, threeGroundGroup = null;
  let threeDestinationGroup = null, threePoiPinsGroup = null, threeChevronsGroup = null;
  let threeRaycaster = null, threeMouse = null;
  let isThreeInitialized = false;
  let selectedBuildingMesh = null;

  // Real geographic buildings dataset (preloaded 80 Oakland buildings)
  const PRELOADED_OAKLAND_BUILDINGS = [{"id":22971147,"name":"1001 Broadway","type":"hotel","lat":37.80206,"lon":-122.273086,"height":83,"levels":21,"geometry":[{"lat":37.801728,"lon":-122.273047},{"lat":37.801918,"lon":-122.272936},{"lat":37.802067,"lon":-122.272995},{"lat":37.802248,"lon":-122.273067},{"lat":37.802413,"lon":-122.273133},{"lat":37.802501,"lon":-122.273356},{"lat":37.801877,"lon":-122.273105},{"lat":37.801728,"lon":-122.273047}]},{"id":22971155,"name":"1814 Franklin Street","type":"yes","lat":37.806987,"lon":-122.267631,"height":49,"levels":11,"geometry":[{"lat":37.807183,"lon":-122.267745},{"lat":37.807025,"lon":-122.267334},{"lat":37.807007,"lon":-122.267286},{"lat":37.806716,"lon":-122.267465},{"lat":37.806889,"lon":-122.267925},{"lat":37.806905,"lon":-122.267916},{"lat":37.807183,"lon":-122.267745}]},{"id":25169843,"name":"260 13th Street","type":"yes","lat":37.802269,"lon":-122.267333,"height":41,"levels":7,"geometry":[{"lat":37.802298,"lon":-122.267865},{"lat":37.802783,"lon":-122.267555},{"lat":37.802413,"lon":-122.266626},{"lat":37.801935,"lon":-122.26693},{"lat":37.802004,"lon":-122.267108},{"lat":37.802017,"lon":-122.26714},{"lat":37.802223,"lon":-122.26701},{"lat":37.802266,"lon":-122.267119},{"lat":37.802233,"lon":-122.267139},{"lat":37.802344,"lon":-122.26742},{"lat":37.802378,"lon":-122.267398},{"lat":37.802419,"lon":-122.267502},{"lat":37.802207,"lon":-122.267636},{"lat":37.802223,"lon":-122.267678},{"lat":37.802298,"lon":-122.267865}]},{"id":25169852,"name":"1314 Franklin Street","type":"apartments","lat":37.803393,"lon":-122.269677,"height":122,"levels":40,"geometry":[{"lat":37.803704,"lon":-122.269925},{"lat":37.803653,"lon":-122.269794},{"lat":37.80364,"lon":-122.269802},{"lat":37.803611,"lon":-122.269678},{"lat":37.803574,"lon":-122.269594},{"lat":37.803516,"lon":-122.269436},{"lat":37.803504,"lon":-122.269442},{"lat":37.803491,"lon":-122.269406},{"lat":37.803502,"lon":-122.269399},{"lat":37.803414,"lon":-122.269174},{"lat":37.803405,"lon":-122.269177},{"lat":37.803392,"lon":-122.269143},{"lat":37.803403,"lon":-122.269137},{"lat":37.803347,"lon":-122.268981},{"lat":37.802843,"lon":-122.269292},{"lat":37.803078,"lon":-122.269857}]},{"id":25347592,"name":"250 14th Street","type":"apartments","lat":37.802898,"lon":-122.266669,"height":21.6,"levels":6,"geometry":[{"lat":37.802612,"lon":-122.2665},{"lat":37.802985,"lon":-122.266267},{"lat":37.80317,"lon":-122.266732},{"lat":37.80304,"lon":-122.266814},{"lat":37.803013,"lon":-122.266834},{"lat":37.802985,"lon":-122.266851},{"lat":37.802922,"lon":-122.266688},{"lat":37.802904,"lon":-122.266699},{"lat":37.802733,"lon":-122.266807},{"lat":37.802612,"lon":-122.2665}]},{"id":27809056,"name":"1301 Clay Street","type":"public","lat":37.804959,"lon":-122.274617,"height":81.7,"levels":18,"geometry":[{"lat":37.804938,"lon":-122.274611},{"lat":37.80498,"lon":-122.274452},{"lat":37.805158,"lon":-122.274341},{"lat":37.805131,"lon":-122.274268},{"lat":37.805112,"lon":-122.274218},{"lat":37.805079,"lon":-122.274238},{"lat":37.805005,"lon":-122.274035},{"lat":37.805037,"lon":-122.274016},{"lat":37.805022,"lon":-122.273973},{"lat":37.80519,"lon":-122.273875},{"lat":37.805206,"lon":-122.273916},{"lat":37.805238,"lon":-122.273897},{"lat":37.805314,"lon":-122.274098},{"lat":37.80528,"lon":-122.274119},{"lat":37.805297,"lon":-122.274161},{"lat":37.805311,"lon":-122.274198}]},{"id":31149191,"name":"521 19th Street","type":"theatre","lat":37.808058,"lon":-122.270467,"height":10.8,"levels":3,"geometry":[{"lat":37.808427,"lon":-122.270892},{"lat":37.808309,"lon":-122.270128},{"lat":37.808213,"lon":-122.270049},{"lat":37.808074,"lon":-122.270084},{"lat":37.807939,"lon":-122.270117},{"lat":37.807789,"lon":-122.270156},{"lat":37.807722,"lon":-122.270291},{"lat":37.807839,"lon":-122.271023},{"lat":37.807842,"lon":-122.27104},{"lat":37.808427,"lon":-122.270892}]},{"id":31149229,"name":"1615 Broadway","type":"yes","lat":37.806235,"lon":-122.270256,"height":42,"levels":12,"geometry":[{"lat":37.806362,"lon":-122.270253},{"lat":37.806319,"lon":-122.270143},{"lat":37.806062,"lon":-122.270302},{"lat":37.806073,"lon":-122.270327},{"lat":37.806362,"lon":-122.270253}]},{"id":32829462,"name":"325,327,329,331,333,335,337,339,341,343 17th Street","type":"yes","lat":37.805445,"lon":-122.26711,"height":10.8,"levels":3,"geometry":[{"lat":37.805584,"lon":-122.267258},{"lat":37.805419,"lon":-122.26736},{"lat":37.805239,"lon":-122.266887},{"lat":37.805398,"lon":-122.266788},{"lat":37.805584,"lon":-122.267258}]},{"id":34610433,"name":null,"type":"yes","lat":37.805914,"lon":-122.271431,"height":36,"levels":10,"geometry":[{"lat":37.805766,"lon":-122.271566},{"lat":37.806024,"lon":-122.271643},{"lat":37.806078,"lon":-122.271394},{"lat":37.805956,"lon":-122.271351},{"lat":37.805983,"lon":-122.271232},{"lat":37.805827,"lon":-122.271265},{"lat":37.805766,"lon":-122.271566}]},{"id":34610438,"name":"350 Frank H. Ogawa Plaza","type":"yes","lat":37.806128,"lon":-122.271564,"height":43,"levels":11,"geometry":[{"lat":37.806024,"lon":-122.271643},{"lat":37.80622,"lon":-122.271703},{"lat":37.806234,"lon":-122.271634},{"lat":37.806187,"lon":-122.271368},{"lat":37.806078,"lon":-122.271394},{"lat":37.806024,"lon":-122.271643}]},{"id":34610443,"name":null,"type":"yes","lat":37.806091,"lon":-122.271317,"height":10.8,"levels":3,"geometry":[{"lat":37.806187,"lon":-122.271368},{"lat":37.806156,"lon":-122.271187},{"lat":37.805983,"lon":-122.271232},{"lat":37.805956,"lon":-122.271351},{"lat":37.806078,"lon":-122.271394},{"lat":37.806187,"lon":-122.271368}]},{"id":34610471,"name":"300 Frank H. Ogawa Plaza","type":"yes","lat":37.805805,"lon":-122.27115,"height":39,"levels":8,"geometry":[{"lat":37.806156,"lon":-122.271187},{"lat":37.806051,"lon":-122.270587},{"lat":37.80542,"lon":-122.27075},{"lat":37.805481,"lon":-122.271119},{"lat":37.805407,"lon":-122.271454},{"lat":37.805766,"lon":-122.271566},{"lat":37.805827,"lon":-122.271265},{"lat":37.805983,"lon":-122.271232},{"lat":37.806156,"lon":-122.271187}]},{"id":34958134,"name":"550 10th Street","type":"yes","lat":37.802528,"lon":-122.274397,"height":18,"levels":5,"geometry":[{"lat":37.802551,"lon":-122.27513},{"lat":37.802823,"lon":-122.274956},{"lat":37.80306,"lon":-122.274804},{"lat":37.803032,"lon":-122.274732},{"lat":37.802501,"lon":-122.273356},{"lat":37.801877,"lon":-122.273105},{"lat":37.801826,"lon":-122.273285},{"lat":37.802529,"lon":-122.275073},{"lat":37.802551,"lon":-122.27513}]},{"id":36976591,"name":"1916 Telegraph Avenue","type":"retail","lat":37.808234,"lon":-122.269546,"height":3.6,"levels":1,"geometry":[{"lat":37.808425,"lon":-122.269722},{"lat":37.808194,"lon":-122.269778},{"lat":37.808171,"lon":-122.269764},{"lat":37.808037,"lon":-122.269425},{"lat":37.808147,"lon":-122.269354},{"lat":37.808183,"lon":-122.269331},{"lat":37.808221,"lon":-122.269432},{"lat":37.808299,"lon":-122.269383},{"lat":37.808425,"lon":-122.269722}]},{"id":36976597,"name":"","type":"yes","lat":37.80809,"lon":-122.269261,"height":7.2,"levels":2,"geometry":[{"lat":37.808147,"lon":-122.269354},{"lat":37.808037,"lon":-122.269425},{"lat":37.807921,"lon":-122.269135},{"lat":37.808069,"lon":-122.269042},{"lat":37.808125,"lon":-122.269187},{"lat":37.808183,"lon":-122.269331},{"lat":37.808147,"lon":-122.269354}]},{"id":36976599,"name":"1915 Broadway","type":"yes","lat":37.808192,"lon":-122.26925,"height":33,"levels":9,"geometry":[{"lat":37.808299,"lon":-122.269383},{"lat":37.808221,"lon":-122.269432},{"lat":37.808183,"lon":-122.269331},{"lat":37.808125,"lon":-122.269187},{"lat":37.808069,"lon":-122.269042},{"lat":37.808147,"lon":-122.268994},{"lat":37.808299,"lon":-122.269383}]},{"id":36976604,"name":"1900 Broadway","type":"yes","lat":37.807863,"lon":-122.268579,"height":14.4,"levels":4,"geometry":[{"lat":37.808025,"lon":-122.268684},{"lat":37.807977,"lon":-122.268563},{"lat":37.807867,"lon":-122.268632},{"lat":37.807736,"lon":-122.268294},{"lat":37.807618,"lon":-122.268366},{"lat":37.807796,"lon":-122.268826},{"lat":37.808025,"lon":-122.268684}]},{"id":36977526,"name":"1325;1333 Broadway","type":"yes","lat":37.804175,"lon":-122.27194,"height":39,"levels":10,"geometry":[{"lat":37.804425,"lon":-122.271984},{"lat":37.804439,"lon":-122.271924},{"lat":37.80433,"lon":-122.271649},{"lat":37.804283,"lon":-122.271624},{"lat":37.803869,"lon":-122.271881},{"lat":37.803849,"lon":-122.27195},{"lat":37.80395,"lon":-122.272225},{"lat":37.804005,"lon":-122.272242},{"lat":37.804425,"lon":-122.271984}]},{"id":36977527,"name":"475 14th Street","type":"yes","lat":37.804531,"lon":-122.272376,"height":48,"levels":12,"geometry":[{"lat":37.804724,"lon":-122.272508},{"lat":37.804547,"lon":-122.272061},{"lat":37.804391,"lon":-122.272156},{"lat":37.804344,"lon":-122.272353},{"lat":37.804459,"lon":-122.272671},{"lat":37.804724,"lon":-122.272508}]},{"id":36977558,"name":"505 14th Street","type":"yes","lat":37.804711,"lon":-122.272934,"height":48,"levels":12,"geometry":[{"lat":37.804771,"lon":-122.272628},{"lat":37.804513,"lon":-122.272791},{"lat":37.804588,"lon":-122.272986},{"lat":37.804629,"lon":-122.273091},{"lat":37.804676,"lon":-122.273111},{"lat":37.804791,"lon":-122.27316},{"lat":37.804947,"lon":-122.273074},{"lat":37.804771,"lon":-122.272628}]},{"id":36977600,"name":"1300 Clay Street","type":"yes","lat":37.804803,"lon":-122.273563,"height":44,"levels":11,"geometry":[{"lat":37.805129,"lon":-122.273531},{"lat":37.805021,"lon":-122.273267},{"lat":37.804647,"lon":-122.273512},{"lat":37.804651,"lon":-122.273524},{"lat":37.804642,"lon":-122.27353},{"lat":37.804611,"lon":-122.273648},{"lat":37.804648,"lon":-122.273745},{"lat":37.804749,"lon":-122.273781},{"lat":37.805129,"lon":-122.273531}]},{"id":36977642,"name":"1111 Broadway","type":"office","lat":37.802845,"lon":-122.272886,"height":110,"levels":24,"geometry":[{"lat":37.802765,"lon":-122.273214},{"lat":37.803107,"lon":-122.272998},{"lat":37.803095,"lon":-122.27297},{"lat":37.80312,"lon":-122.272954},{"lat":37.803109,"lon":-122.272924},{"lat":37.803134,"lon":-122.272909},{"lat":37.803122,"lon":-122.272878},{"lat":37.803146,"lon":-122.272862},{"lat":37.80305,"lon":-122.272616},{"lat":37.803025,"lon":-122.272632},{"lat":37.803016,"lon":-122.272608},{"lat":37.802989,"lon":-122.272612},{"lat":37.80296,"lon":-122.272617},{"lat":37.802914,"lon":-122.272629},{"lat":37.802868,"lon":-122.272646},{"lat":37.802825,"lon":-122.272666}]},{"id":36977687,"name":null,"type":"yes","lat":37.803452,"lon":-122.273816,"height":34,"levels":10,"geometry":[{"lat":37.803669,"lon":-122.274178},{"lat":37.803591,"lon":-122.273976},{"lat":37.803505,"lon":-122.273755},{"lat":37.803443,"lon":-122.273592},{"lat":37.803426,"lon":-122.273547},{"lat":37.803409,"lon":-122.273502},{"lat":37.803343,"lon":-122.273325},{"lat":37.803227,"lon":-122.273395},{"lat":37.803268,"lon":-122.273504},{"lat":37.803294,"lon":-122.273573},{"lat":37.803327,"lon":-122.273661},{"lat":37.803334,"lon":-122.273673},{"lat":37.803394,"lon":-122.273823},{"lat":37.803478,"lon":-122.27404},{"lat":37.803514,"lon":-122.274137},{"lat":37.803531,"lon":-122.274181}]},{"id":36977811,"name":"150 Frank H. Ogawa Plaza","type":"yes","lat":37.805134,"lon":-122.27116,"height":36,"levels":8,"geometry":[{"lat":37.805341,"lon":-122.270774},{"lat":37.80511,"lon":-122.270834},{"lat":37.804602,"lon":-122.271152},{"lat":37.804596,"lon":-122.271167},{"lat":37.804602,"lon":-122.271186},{"lat":37.805171,"lon":-122.271366},{"lat":37.805212,"lon":-122.271409},{"lat":37.805259,"lon":-122.271418},{"lat":37.805293,"lon":-122.271401},{"lat":37.80532,"lon":-122.271366},{"lat":37.805334,"lon":-122.271315},{"lat":37.805327,"lon":-122.271255},{"lat":37.805368,"lon":-122.270825},{"lat":37.805341,"lon":-122.270774}]},{"id":36977855,"name":"1 Frank H. Ogawa Plaza","type":"public","lat":37.805407,"lon":-122.272567,"height":98,"levels":18,"geometry":[{"lat":37.80562,"lon":-122.272621},{"lat":37.805614,"lon":-122.272605},{"lat":37.80555,"lon":-122.272443},{"lat":37.805531,"lon":-122.272393},{"lat":37.805469,"lon":-122.272235},{"lat":37.805459,"lon":-122.27221},{"lat":37.805303,"lon":-122.272302},{"lat":37.805142,"lon":-122.272409},{"lat":37.804991,"lon":-122.272505},{"lat":37.805156,"lon":-122.272926},{"lat":37.805304,"lon":-122.272833},{"lat":37.805334,"lon":-122.272908},{"lat":37.805524,"lon":-122.272787},{"lat":37.805493,"lon":-122.272708},{"lat":37.80562,"lon":-122.272621}]},{"id":36978056,"name":"250 Frank H. Ogawa Plaza","type":"yes","lat":37.806074,"lon":-122.272356,"height":21.6,"levels":6,"geometry":[{"lat":37.8065,"lon":-122.272679},{"lat":37.806384,"lon":-122.272382},{"lat":37.806263,"lon":-122.27207},{"lat":37.805836,"lon":-122.271941},{"lat":37.805775,"lon":-122.271982},{"lat":37.80575,"lon":-122.272217},{"lat":37.805684,"lon":-122.272255},{"lat":37.805978,"lon":-122.272997},{"lat":37.8065,"lon":-122.272679}]},{"id":36978078,"name":"575 15th Street","type":"yes","lat":37.80585,"lon":-122.273867,"height":10.8,"levels":3,"geometry":[{"lat":37.806151,"lon":-122.273937},{"lat":37.806118,"lon":-122.273851},{"lat":37.805947,"lon":-122.273421},{"lat":37.805471,"lon":-122.273724},{"lat":37.805492,"lon":-122.273775},{"lat":37.805465,"lon":-122.273792},{"lat":37.805533,"lon":-122.273964},{"lat":37.80575,"lon":-122.273826},{"lat":37.805797,"lon":-122.273796},{"lat":37.805913,"lon":-122.274088},{"lat":37.805966,"lon":-122.274054},{"lat":37.806047,"lon":-122.274003},{"lat":37.806094,"lon":-122.273973},{"lat":37.806151,"lon":-122.273937}]},{"id":36978080,"name":"560 14th Street","type":"yes","lat":37.805704,"lon":-122.273986,"height":14.4,"levels":4,"geometry":[{"lat":37.805818,"lon":-122.274002},{"lat":37.80575,"lon":-122.273826},{"lat":37.805533,"lon":-122.273964},{"lat":37.8056,"lon":-122.274138},{"lat":37.805818,"lon":-122.274002}]},{"id":36978098,"name":"532 16th Street","type":"yes","lat":37.806495,"lon":-122.271649,"height":21.6,"levels":6,"geometry":[{"lat":37.806528,"lon":-122.27184},{"lat":37.806531,"lon":-122.271826},{"lat":37.806602,"lon":-122.271473},{"lat":37.806606,"lon":-122.271453},{"lat":37.806597,"lon":-122.271449},{"lat":37.806349,"lon":-122.27151},{"lat":37.80637,"lon":-122.271663},{"lat":37.806348,"lon":-122.271783},{"lat":37.806528,"lon":-122.27184}]},{"id":36978116,"name":"510 16th Street","type":"yes","lat":37.806431,"lon":-122.271065,"height":14.4,"levels":4,"geometry":[{"lat":37.80656,"lon":-122.271113},{"lat":37.806573,"lon":-122.271109},{"lat":37.806536,"lon":-122.27083},{"lat":37.806254,"lon":-122.270899},{"lat":37.80629,"lon":-122.271135},{"lat":37.806295,"lon":-122.271133},{"lat":37.806401,"lon":-122.271106},{"lat":37.806409,"lon":-122.271151},{"lat":37.80656,"lon":-122.271113}]},{"id":36978167,"name":null,"type":"yes","lat":37.805133,"lon":-122.269488,"height":7.2,"levels":2,"geometry":[{"lat":37.805255,"lon":-122.269507},{"lat":37.805181,"lon":-122.269316},{"lat":37.804951,"lon":-122.269459},{"lat":37.805025,"lon":-122.269653},{"lat":37.805255,"lon":-122.269507}]},{"id":36978174,"name":"1504 Franklin Street","type":"yes","lat":37.804855,"lon":-122.268956,"height":7.2,"levels":2,"geometry":[{"lat":37.804873,"lon":-122.269163},{"lat":37.804703,"lon":-122.268722},{"lat":37.804828,"lon":-122.268643},{"lat":37.804998,"lon":-122.269088},{"lat":37.804873,"lon":-122.269163}]},{"id":36978185,"name":"1515 Webster Street","type":"yes","lat":37.804766,"lon":-122.268407,"height":18,"levels":5,"geometry":[{"lat":37.804921,"lon":-122.268528},{"lat":37.804668,"lon":-122.268688},{"lat":37.804656,"lon":-122.268695},{"lat":37.80449,"lon":-122.268273},{"lat":37.804722,"lon":-122.268127},{"lat":37.804777,"lon":-122.268093},{"lat":37.804881,"lon":-122.268359},{"lat":37.80486,"lon":-122.268373},{"lat":37.804921,"lon":-122.268528}]},{"id":36978190,"name":"1531 Webster Street","type":"yes","lat":37.805037,"lon":-122.268288,"height":35,"levels":10,"geometry":[{"lat":37.805207,"lon":-122.268371},{"lat":37.805201,"lon":-122.268357},{"lat":37.805034,"lon":-122.26793},{"lat":37.804777,"lon":-122.268093},{"lat":37.804881,"lon":-122.268359},{"lat":37.80495,"lon":-122.268533},{"lat":37.805207,"lon":-122.268371}]},{"id":36978195,"name":"1537 Webster Street","type":"yes","lat":37.805201,"lon":-122.268145,"height":30,"levels":9,"geometry":[{"lat":37.805312,"lon":-122.268288},{"lat":37.805201,"lon":-122.268357},{"lat":37.805034,"lon":-122.26793},{"lat":37.805146,"lon":-122.26786},{"lat":37.805312,"lon":-122.268288}]},{"id":36978197,"name":"1615 Webster Street","type":"yes","lat":37.805511,"lon":-122.268005,"height":19,"levels":5,"geometry":[{"lat":37.805636,"lon":-122.268138},{"lat":37.805454,"lon":-122.268247},{"lat":37.805276,"lon":-122.267779},{"lat":37.805456,"lon":-122.267668},{"lat":37.805606,"lon":-122.268061},{"lat":37.805636,"lon":-122.268138}]},{"id":36978202,"name":"1600 Franklin Street","type":"yes","lat":37.805404,"lon":-122.268624,"height":36,"levels":10,"geometry":[{"lat":37.805185,"lon":-122.268444},{"lat":37.805283,"lon":-122.268695},{"lat":37.805334,"lon":-122.268663},{"lat":37.80535,"lon":-122.268712},{"lat":37.805361,"lon":-122.268748},{"lat":37.805381,"lon":-122.268783},{"lat":37.805402,"lon":-122.2688},{"lat":37.805422,"lon":-122.268809},{"lat":37.80545,"lon":-122.268814},{"lat":37.80548,"lon":-122.268809},{"lat":37.805668,"lon":-122.268692},{"lat":37.805621,"lon":-122.268567},{"lat":37.805545,"lon":-122.268379},{"lat":37.805496,"lon":-122.268249},{"lat":37.805305,"lon":-122.268372},{"lat":37.805185,"lon":-122.268444}]},{"id":36978211,"name":"1600 Broadway","type":"yes","lat":37.806011,"lon":-122.269716,"height":32,"levels":9,"geometry":[{"lat":37.806146,"lon":-122.269855},{"lat":37.805987,"lon":-122.269954},{"lat":37.805811,"lon":-122.269508},{"lat":37.805968,"lon":-122.269407},{"lat":37.806146,"lon":-122.269855}]},{"id":36978222,"name":"1701 Franklin Street","type":"yes","lat":37.806477,"lon":-122.268609,"height":39,"levels":11,"geometry":[{"lat":37.806653,"lon":-122.268735},{"lat":37.806559,"lon":-122.268489},{"lat":37.806549,"lon":-122.268495},{"lat":37.806545,"lon":-122.268482},{"lat":37.806529,"lon":-122.268475},{"lat":37.806512,"lon":-122.268483},{"lat":37.806505,"lon":-122.268502},{"lat":37.80651,"lon":-122.268516},{"lat":37.806479,"lon":-122.268536},{"lat":37.806487,"lon":-122.268556},{"lat":37.806454,"lon":-122.268577},{"lat":37.80645,"lon":-122.268569},{"lat":37.806444,"lon":-122.268562},{"lat":37.806437,"lon":-122.268557},{"lat":37.80643,"lon":-122.268555},{"lat":37.806421,"lon":-122.268554}]},{"id":36978224,"name":"1700 Broadway","type":"office","lat":37.806698,"lon":-122.269394,"height":44,"levels":11,"geometry":[{"lat":37.806801,"lon":-122.269434},{"lat":37.806656,"lon":-122.269525},{"lat":37.806613,"lon":-122.269412},{"lat":37.806595,"lon":-122.269366},{"lat":37.80668,"lon":-122.269313},{"lat":37.80674,"lon":-122.269276},{"lat":37.806801,"lon":-122.269434}]},{"id":36978226,"name":"1701 Broadway","type":"office","lat":37.806934,"lon":-122.269976,"height":10.8,"levels":3,"geometry":[{"lat":37.807033,"lon":-122.270083},{"lat":37.806904,"lon":-122.270114},{"lat":37.806792,"lon":-122.269838},{"lat":37.80691,"lon":-122.269764},{"lat":37.807033,"lon":-122.270083}]},{"id":36978231,"name":"1721 Broadway","type":"yes","lat":37.807138,"lon":-122.269905,"height":7.2,"levels":2,"geometry":[{"lat":37.807245,"lon":-122.270031},{"lat":37.807033,"lon":-122.270083},{"lat":37.80691,"lon":-122.269764},{"lat":37.807097,"lon":-122.269648},{"lat":37.80716,"lon":-122.269811},{"lat":37.807205,"lon":-122.269928},{"lat":37.807212,"lon":-122.269946},{"lat":37.807245,"lon":-122.270031}]},{"id":36978232,"name":"1725 Broadway","type":"yes","lat":37.80721,"lon":-122.269869,"height":10.8,"levels":3,"geometry":[{"lat":37.807314,"lon":-122.270015},{"lat":37.807245,"lon":-122.270031},{"lat":37.807212,"lon":-122.269946},{"lat":37.807223,"lon":-122.269939},{"lat":37.807169,"lon":-122.269804},{"lat":37.80716,"lon":-122.269811},{"lat":37.807097,"lon":-122.269648},{"lat":37.807153,"lon":-122.269613},{"lat":37.807314,"lon":-122.270015}]},{"id":36978252,"name":"1711 Telegraph Avenue","type":"yes","lat":37.807063,"lon":-122.270568,"height":7.2,"levels":2,"geometry":[{"lat":37.807147,"lon":-122.270686},{"lat":37.806991,"lon":-122.270725},{"lat":37.806933,"lon":-122.270392},{"lat":37.807096,"lon":-122.270351},{"lat":37.807147,"lon":-122.270686}]},{"id":36978254,"name":"1715;1721 Telegraph Avenue","type":"yes","lat":37.807173,"lon":-122.270568,"height":3.6,"levels":1,"geometry":[{"lat":37.807148,"lon":-122.270694},{"lat":37.807147,"lon":-122.270686},{"lat":37.807096,"lon":-122.270351},{"lat":37.807223,"lon":-122.27032},{"lat":37.807275,"lon":-122.270663},{"lat":37.807148,"lon":-122.270694}]},{"id":36978260,"name":"1723 Telegraph Avenue","type":"yes","lat":37.807295,"lon":-122.270515,"height":3.6,"levels":1,"geometry":[{"lat":37.807344,"lon":-122.270646},{"lat":37.807291,"lon":-122.270303},{"lat":37.807223,"lon":-122.27032},{"lat":37.807275,"lon":-122.270663},{"lat":37.807344,"lon":-122.270646}]},{"id":36978261,"name":"1722;1724 Broadway","type":"yes","lat":37.806886,"lon":-122.269127,"height":14.4,"levels":4,"geometry":[{"lat":37.8069,"lon":-122.269376},{"lat":37.806788,"lon":-122.269085},{"lat":37.806718,"lon":-122.268903},{"lat":37.806873,"lon":-122.268806},{"lat":37.80697,"lon":-122.269064},{"lat":37.807055,"lon":-122.269283},{"lat":37.8069,"lon":-122.269376}]},{"id":36978264,"name":"1740 Broadway","type":"yes","lat":37.807218,"lon":-122.269091,"height":10.8,"levels":3,"geometry":[{"lat":37.807432,"lon":-122.269048},{"lat":37.807347,"lon":-122.268829},{"lat":37.80697,"lon":-122.269064},{"lat":37.807055,"lon":-122.269283},{"lat":37.807072,"lon":-122.269272},{"lat":37.807432,"lon":-122.269048}]},{"id":36978273,"name":"1770 Broadway","type":"yes","lat":37.807493,"lon":-122.268851,"height":18,"levels":5,"geometry":[{"lat":37.807664,"lon":-122.268926},{"lat":37.807545,"lon":-122.26862},{"lat":37.807533,"lon":-122.268628},{"lat":37.807321,"lon":-122.268762},{"lat":37.807347,"lon":-122.268829},{"lat":37.807432,"lon":-122.269048},{"lat":37.80744,"lon":-122.269066},{"lat":37.807664,"lon":-122.268926}]},{"id":36978310,"name":"519","type":"yes","lat":37.807499,"lon":-122.27138,"height":50,"levels":14,"geometry":[{"lat":37.807801,"lon":-122.271849},{"lat":37.807217,"lon":-122.271993},{"lat":37.807127,"lon":-122.271406},{"lat":37.8071,"lon":-122.271413},{"lat":37.80704,"lon":-122.27102},{"lat":37.807323,"lon":-122.27095},{"lat":37.807618,"lon":-122.270878},{"lat":37.807662,"lon":-122.27116},{"lat":37.807666,"lon":-122.271185},{"lat":37.807688,"lon":-122.27133},{"lat":37.807707,"lon":-122.271458},{"lat":37.807739,"lon":-122.27145},{"lat":37.807801,"lon":-122.271849}]},{"id":36978311,"name":"1728 San Pablo Avenue","type":"yes","lat":37.807706,"lon":-122.272083,"height":22,"levels":6,"geometry":[{"lat":37.807799,"lon":-122.272243},{"lat":37.807836,"lon":-122.272069},{"lat":37.807801,"lon":-122.271861},{"lat":37.807485,"lon":-122.271938},{"lat":37.807516,"lon":-122.272144},{"lat":37.807799,"lon":-122.272243}]},{"id":36978324,"name":"510 17th Street","type":"yes","lat":37.807159,"lon":-122.270844,"height":14.4,"levels":4,"geometry":[{"lat":37.807315,"lon":-122.270921},{"lat":37.807275,"lon":-122.270663},{"lat":37.807148,"lon":-122.270694},{"lat":37.806993,"lon":-122.270732},{"lat":37.807033,"lon":-122.270991},{"lat":37.807035,"lon":-122.270989},{"lat":37.807315,"lon":-122.270921}]},{"id":36978395,"name":"1825 San Pablo Avenue","type":"yes","lat":37.808268,"lon":-122.272882,"height":55,"levels":16,"geometry":[{"lat":37.808215,"lon":-122.273092},{"lat":37.808514,"lon":-122.272904},{"lat":37.808529,"lon":-122.272827},{"lat":37.808073,"lon":-122.272681},{"lat":37.808061,"lon":-122.272695},{"lat":37.808215,"lon":-122.273092}]},{"id":36978501,"name":null,"type":"yes","lat":37.80421,"lon":-122.270065,"height":14.4,"levels":4,"geometry":[{"lat":37.804344,"lon":-122.270085},{"lat":37.804263,"lon":-122.26988},{"lat":37.804011,"lon":-122.270034},{"lat":37.804089,"lon":-122.270241},{"lat":37.804344,"lon":-122.270085}]},{"id":36978519,"name":"1330 Broadway","type":"yes","lat":37.803843,"lon":-122.270815,"height":91,"levels":21,"geometry":[{"lat":37.804148,"lon":-122.27109},{"lat":37.803871,"lon":-122.270385},{"lat":37.803784,"lon":-122.27044},{"lat":37.803713,"lon":-122.270484},{"lat":37.803643,"lon":-122.270528},{"lat":37.803653,"lon":-122.270552},{"lat":37.803701,"lon":-122.270667},{"lat":37.803771,"lon":-122.270842},{"lat":37.803802,"lon":-122.270926},{"lat":37.803821,"lon":-122.270972},{"lat":37.803835,"lon":-122.271009},{"lat":37.803921,"lon":-122.271233},{"lat":37.803997,"lon":-122.271185},{"lat":37.804148,"lon":-122.27109}]},{"id":36978526,"name":"","type":"yes","lat":37.80373,"lon":-122.270394,"height":65,"levels":15,"geometry":[{"lat":37.803871,"lon":-122.270385},{"lat":37.803783,"lon":-122.270162},{"lat":37.803556,"lon":-122.270307},{"lat":37.803617,"lon":-122.270461},{"lat":37.803643,"lon":-122.270528},{"lat":37.803713,"lon":-122.270484},{"lat":37.803784,"lon":-122.27044},{"lat":37.803871,"lon":-122.270385}]},{"id":36978527,"name":"1404 Franklin Street","type":"yes","lat":37.803922,"lon":-122.269551,"height":28,"levels":7,"geometry":[{"lat":37.804056,"lon":-122.269697},{"lat":37.803875,"lon":-122.269235},{"lat":37.803721,"lon":-122.269332},{"lat":37.803902,"lon":-122.269794},{"lat":37.804056,"lon":-122.269697}]},{"id":36978535,"name":"1200 Broadway","type":"yes","lat":37.802991,"lon":-122.271541,"height":28.8,"levels":8,"geometry":[{"lat":37.803108,"lon":-122.271755},{"lat":37.802983,"lon":-122.271833},{"lat":37.802792,"lon":-122.271359},{"lat":37.802944,"lon":-122.271261},{"lat":37.802994,"lon":-122.271384},{"lat":37.802967,"lon":-122.271402},{"lat":37.803036,"lon":-122.271577},{"lat":37.803108,"lon":-122.271755}]},{"id":36978551,"name":"1226 Broadway","type":"yes","lat":37.803246,"lon":-122.271393,"height":7.2,"levels":2,"geometry":[{"lat":37.803185,"lon":-122.27148},{"lat":37.803256,"lon":-122.271661},{"lat":37.803485,"lon":-122.271517},{"lat":37.803295,"lon":-122.271037},{"lat":37.803068,"lon":-122.271181},{"lat":37.803185,"lon":-122.27148}]},{"id":36978562,"name":"","type":"yes","lat":37.802292,"lon":-122.271601,"height":46,"levels":12,"geometry":[{"lat":37.802166,"lon":-122.271916},{"lat":37.802307,"lon":-122.271827},{"lat":37.802654,"lon":-122.271607},{"lat":37.802586,"lon":-122.271436},{"lat":37.802426,"lon":-122.271026},{"lat":37.801937,"lon":-122.271334},{"lat":37.802099,"lon":-122.271747},{"lat":37.802166,"lon":-122.271916}]},{"id":36979127,"name":"375;383 11th Street","type":"yes","lat":37.801251,"lon":-122.270899,"height":36,"levels":10,"geometry":[{"lat":37.801372,"lon":-122.271349},{"lat":37.801389,"lon":-122.271362},{"lat":37.801407,"lon":-122.271362},{"lat":37.801581,"lon":-122.271249},{"lat":37.801595,"lon":-122.271228},{"lat":37.8016,"lon":-122.271192},{"lat":37.801285,"lon":-122.270402},{"lat":37.801249,"lon":-122.270312},{"lat":37.80123,"lon":-122.270307},{"lat":37.801216,"lon":-122.270308},{"lat":37.801032,"lon":-122.27042},{"lat":37.801022,"lon":-122.270446},{"lat":37.801024,"lon":-122.270484},{"lat":37.800995,"lon":-122.270504},{"lat":37.800978,"lon":-122.270461},{"lat":37.800942,"lon":-122.270485}]},{"id":36979208,"name":"1901 Franklin Street","type":"yes","lat":37.807738,"lon":-122.267967,"height":18,"levels":5,"geometry":[{"lat":37.808051,"lon":-122.268098},{"lat":37.807959,"lon":-122.267868},{"lat":37.807866,"lon":-122.267624},{"lat":37.807825,"lon":-122.26765},{"lat":37.807799,"lon":-122.267666},{"lat":37.807468,"lon":-122.26787},{"lat":37.807457,"lon":-122.267883},{"lat":37.80745,"lon":-122.267914},{"lat":37.807581,"lon":-122.268266},{"lat":37.807618,"lon":-122.268366},{"lat":37.807736,"lon":-122.268294},{"lat":37.808051,"lon":-122.268098}]},{"id":89535132,"name":"160 FranklinSt.","type":"yes","lat":37.806984,"lon":-122.272371,"height":24,"levels":7,"geometry":[{"lat":37.806941,"lon":-122.272426},{"lat":37.807006,"lon":-122.27239},{"lat":37.807018,"lon":-122.272383},{"lat":37.807023,"lon":-122.272371},{"lat":37.807024,"lon":-122.272353},{"lat":37.807018,"lon":-122.272338},{"lat":37.807006,"lon":-122.272329},{"lat":37.806936,"lon":-122.272313},{"lat":37.806923,"lon":-122.272377},{"lat":37.806941,"lon":-122.272426}]},{"id":89535257,"name":"","type":"yes","lat":37.801528,"lon":-122.27417,"height":10.8,"levels":3,"geometry":[{"lat":37.801669,"lon":-122.274258},{"lat":37.80163,"lon":-122.27416},{"lat":37.801582,"lon":-122.274191},{"lat":37.801468,"lon":-122.273896},{"lat":37.801262,"lon":-122.274017},{"lat":37.801417,"lon":-122.274413},{"lat":37.801669,"lon":-122.274258}]},{"id":89535260,"name":"476;478 9th Street","type":"yes","lat":37.801365,"lon":-122.27383,"height":10.8,"levels":3,"geometry":[{"lat":37.801492,"lon":-122.273882},{"lat":37.801468,"lon":-122.273896},{"lat":37.801262,"lon":-122.274017},{"lat":37.801174,"lon":-122.27378},{"lat":37.801271,"lon":-122.273712},{"lat":37.801397,"lon":-122.273643},{"lat":37.801492,"lon":-122.273882}]},{"id":89535262,"name":"493;495 10th Street","type":"yes","lat":37.801799,"lon":-122.274039,"height":14.4,"levels":4,"geometry":[{"lat":37.80191,"lon":-122.274081},{"lat":37.801726,"lon":-122.274203},{"lat":37.801633,"lon":-122.273978},{"lat":37.801817,"lon":-122.273856},{"lat":37.80191,"lon":-122.274081}]},{"id":91164876,"name":null,"type":"yes","lat":37.806423,"lon":-122.270178,"height":10.8,"levels":3,"geometry":[{"lat":37.806418,"lon":-122.270239},{"lat":37.806484,"lon":-122.270222},{"lat":37.806427,"lon":-122.270075},{"lat":37.806368,"lon":-122.270112},{"lat":37.806418,"lon":-122.270239}]},{"id":91164878,"name":"1629;1621 Telegraph Avenue","type":"commercial","lat":37.806543,"lon":-122.270693,"height":21.6,"levels":6,"geometry":[{"lat":37.806536,"lon":-122.27083},{"lat":37.806631,"lon":-122.270807},{"lat":37.80658,"lon":-122.27048},{"lat":37.806485,"lon":-122.270504},{"lat":37.806501,"lon":-122.270611},{"lat":37.806531,"lon":-122.270793},{"lat":37.806536,"lon":-122.27083}]},{"id":91164893,"name":"1727 Telegraph Avenue","type":"yes","lat":37.807348,"lon":-122.270502,"height":10.8,"levels":3,"geometry":[{"lat":37.807344,"lon":-122.270646},{"lat":37.807291,"lon":-122.270303},{"lat":37.807355,"lon":-122.270287},{"lat":37.807408,"lon":-122.27063},{"lat":37.807344,"lon":-122.270646}]},{"id":91164895,"name":"1636 Telegraph Avenue","type":"yes","lat":37.80658,"lon":-122.270116,"height":10.8,"levels":3,"geometry":[{"lat":37.80658,"lon":-122.270198},{"lat":37.806653,"lon":-122.270179},{"lat":37.806576,"lon":-122.269983},{"lat":37.806512,"lon":-122.270023},{"lat":37.80658,"lon":-122.270198}]},{"id":91164913,"name":"1601 San Pablo Avenue","type":"yes","lat":37.806525,"lon":-122.272225,"height":26,"levels":7,"geometry":[{"lat":37.80658,"lon":-122.27231},{"lat":37.806601,"lon":-122.272207},{"lat":37.806503,"lon":-122.272168},{"lat":37.806492,"lon":-122.27217},{"lat":37.806483,"lon":-122.272179},{"lat":37.806482,"lon":-122.272189},{"lat":37.806483,"lon":-122.272201},{"lat":37.806524,"lon":-122.272293},{"lat":37.80658,"lon":-122.27231}]},{"id":91164918,"name":"511;519 17th Street","type":"yes","lat":37.806672,"lon":-122.270952,"height":18,"levels":5,"geometry":[{"lat":37.806536,"lon":-122.27083},{"lat":37.806631,"lon":-122.270807},{"lat":37.806688,"lon":-122.270793},{"lat":37.806753,"lon":-122.270777},{"lat":37.806819,"lon":-122.27076},{"lat":37.806877,"lon":-122.271122},{"lat":37.806851,"lon":-122.271129},{"lat":37.806573,"lon":-122.271199},{"lat":37.80656,"lon":-122.271113},{"lat":37.806573,"lon":-122.271109},{"lat":37.806536,"lon":-122.27083}]},{"id":91164922,"name":"426 17th Street","type":"yes","lat":37.806604,"lon":-122.269034,"height":27,"levels":7,"geometry":[{"lat":37.806661,"lon":-122.269165},{"lat":37.806545,"lon":-122.269237},{"lat":37.806515,"lon":-122.269157},{"lat":37.80646,"lon":-122.269011},{"lat":37.806426,"lon":-122.268924},{"lat":37.806429,"lon":-122.268922},{"lat":37.806546,"lon":-122.268849},{"lat":37.806668,"lon":-122.268774},{"lat":37.806718,"lon":-122.268903},{"lat":37.806788,"lon":-122.269085},{"lat":37.806746,"lon":-122.269111},{"lat":37.806692,"lon":-122.269145},{"lat":37.806661,"lon":-122.269165}]},{"id":91164925,"name":"444;446 17th Street","type":"yes","lat":37.806639,"lon":-122.269257,"height":10.8,"levels":3,"geometry":[{"lat":37.80668,"lon":-122.269313},{"lat":37.806595,"lon":-122.269366},{"lat":37.806545,"lon":-122.269237},{"lat":37.806661,"lon":-122.269165},{"lat":37.806671,"lon":-122.269192},{"lat":37.80664,"lon":-122.269211},{"lat":37.80668,"lon":-122.269313}]},{"id":91164929,"name":"1634 Telegraph Avenue","type":"yes","lat":37.806497,"lon":-122.270148,"height":10.8,"levels":3,"geometry":[{"lat":37.806484,"lon":-122.270222},{"lat":37.80658,"lon":-122.270198},{"lat":37.806512,"lon":-122.270023},{"lat":37.806427,"lon":-122.270075},{"lat":37.806484,"lon":-122.270222}]},{"id":91164931,"name":"1617 Broadway","type":"yes","lat":37.806366,"lon":-122.2702,"height":7.2,"levels":2,"geometry":[{"lat":37.806362,"lon":-122.270253},{"lat":37.806418,"lon":-122.270239},{"lat":37.806368,"lon":-122.270112},{"lat":37.806319,"lon":-122.270143},{"lat":37.806362,"lon":-122.270253}]},{"id":91164934,"name":"1741 Telegraph Avenue","type":"yes","lat":37.807486,"lon":-122.270397,"height":10.8,"levels":3,"geometry":[{"lat":37.807537,"lon":-122.270241},{"lat":37.807593,"lon":-122.270584},{"lat":37.807408,"lon":-122.27063},{"lat":37.807355,"lon":-122.270287},{"lat":37.807537,"lon":-122.270241}]},{"id":91164954,"name":"1645 Telegraph Avenue","type":"yes","lat":37.806762,"lon":-122.270571,"height":10.8,"levels":3,"geometry":[{"lat":37.806769,"lon":-122.270433},{"lat":37.806819,"lon":-122.27076},{"lat":37.806753,"lon":-122.270777},{"lat":37.806703,"lon":-122.27045},{"lat":37.806769,"lon":-122.270433}]},{"id":91164956,"name":"","type":"yes","lat":37.806739,"lon":-122.271523,"height":18,"levels":5,"geometry":[{"lat":37.806723,"lon":-122.271887},{"lat":37.806733,"lon":-122.271844},{"lat":37.806957,"lon":-122.271789},{"lat":37.806949,"lon":-122.271725},{"lat":37.806977,"lon":-122.271717},{"lat":37.806907,"lon":-122.271268},{"lat":37.806891,"lon":-122.271172},{"lat":37.806858,"lon":-122.271181},{"lat":37.806851,"lon":-122.271129},{"lat":37.806573,"lon":-122.271199},{"lat":37.806554,"lon":-122.271203},{"lat":37.806575,"lon":-122.271315},{"lat":37.806592,"lon":-122.271412},{"lat":37.806634,"lon":-122.271401},{"lat":37.806655,"lon":-122.271557},{"lat":37.806614,"lon":-122.27157}]}];
  let activeBuildingsData = PRELOADED_OAKLAND_BUILDINGS;

  // Real-world Coordinate Math (WGS84 Lat/Lon <-> 3D Cartesian Meters)
  const METERS_PER_DEG_LAT = 111139;
  function getMetersPerDegLon(lat) {
    return 111139 * Math.cos(((lat || originLat || 37.804456) * Math.PI) / 180);
  }

  function gpsToWorld(lat, lon) {
    const anchorLat = originLat || playerLat || 37.804456;
    const anchorLon = originLon || playerLon || -122.271356;
    const mLon = getMetersPerDegLon(anchorLat);
    const x = (lon - anchorLon) * mLon;
    const z = -(lat - anchorLat) * METERS_PER_DEG_LAT; // North is -Z, East is +X
    return { x, z };
  }

  function worldToGps(x, z) {
    const anchorLat = originLat || playerLat || 37.804456;
    const anchorLon = originLon || playerLon || -122.271356;
    const mLon = getMetersPerDegLon(anchorLat);
    const lon = anchorLon + (x / mLon);
    const lat = anchorLat - (z / METERS_PER_DEG_LAT);
    return { lat, lon };
  }

  // ── Procedural Texture Generators ──────────────────────────────────

  // ── Procedural Atmospheric Sky & Texture Generators ────────────────
  function createAtmosphericSkyTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const W = 1024, H = 512;

    // Atmospheric twilight gradient: deep space navy into sapphire into twilight horizon
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.72);
    skyGrad.addColorStop(0, '#040714');
    skyGrad.addColorStop(0.30, '#0a152d');
    skyGrad.addColorStop(0.60, '#15294d');
    skyGrad.addColorStop(0.82, '#213d6c');
    skyGrad.addColorStop(0.94, '#2d5088');
    skyGrad.addColorStop(1.0, '#3f679e');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H * 0.72);

    // Horizon cyber glow strip (cyan, warm amber, sunset magenta)
    const horizY = H * 0.70;
    const glowGrad = ctx.createLinearGradient(0, horizY - 40, 0, horizY + 30);
    glowGrad.addColorStop(0, 'rgba(0, 229, 255, 0)');
    glowGrad.addColorStop(0.45, 'rgba(0, 229, 255, 0.45)');
    glowGrad.addColorStop(0.70, 'rgba(255, 140, 50, 0.35)');
    glowGrad.addColorStop(1, 'rgba(12, 20, 36, 1.0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, horizY - 40, W, 70);

    // Ground plane base
    const groundGrad = ctx.createLinearGradient(0, horizY, 0, H);
    groundGrad.addColorStop(0, '#0c1424');
    groundGrad.addColorStop(1, '#050912');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, horizY, W, H - horizY);

    // Distant city skyline silhouettes along the horizon with window lights
    ctx.fillStyle = '#08101e';
    for (let x = 0; x < W; x += 14) {
      const hSeed = Math.sin(x * 0.08) * 20 + Math.cos(x * 0.03) * 35 + 32;
      const bH = Math.max(12, hSeed);
      ctx.fillRect(x, horizY - bH, 12, bH);

      // Window lights on distant buildings
      if (bH > 22) {
        for (let wy = horizY - bH + 4; wy < horizY - 4; wy += 8) {
          if (Math.sin(wy * 13 + x * 7) > 0.15) {
            const isCyan = (x + wy) % 5 === 0;
            ctx.fillStyle = isCyan ? 'rgba(0, 229, 255, 0.85)' : 'rgba(255, 220, 120, 0.9)';
            ctx.fillRect(x + 2.5, wy, 2.5, 3);
            ctx.fillStyle = '#08101e';
          }
        }
      }
    }

    // Twinkling stars in the upper atmosphere
    for (let s = 0; s < 400; s++) {
      const sx = (Math.sin(s * 91) * 0.5 + 0.5) * W;
      const sy = Math.random() * (horizY - 60);
      const r = 0.6 + Math.random() * 1.2;
      const starAlpha = 0.4 + Math.random() * 0.6;
      ctx.fillStyle = `rgba(255, 255, 255, ${starAlpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  // Window grid with per-building color variant and glowing illuminated glass
  function createWindowGridTexture(variant = 0) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Modern architectural spandrel & mullion frame background
    const facadeBases = ['#152030', '#1c222b', '#261e1a', '#181b2a', '#19242b'];
    ctx.fillStyle = facadeBases[variant % facadeBases.length];
    ctx.fillRect(0, 0, 512, 512);

    const rows = 16, cols = 10;
    const cellW = 512 / cols, cellH = 512 / rows;
    const winW = cellW * 0.72, winH = cellH * 0.68;
    const padX = (cellW - winW) / 2, padY = (cellH - winH) / 2;

    const warmLight  = ['#ffe599', '#ffcc00', '#fff2cc', '#ffb74d'];
    const cyberLight = ['#00e5ff', '#80deea', '#00f0ff', '#4fc3f7'];
    const techPurple = ['#d1c4e9', '#b388ff', '#ea80fc', '#ce93d8'];
    const darkGlass  = ['#0e1520', '#121b28', '#0b111a', '#101620'];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cellW + padX;
        const y = r * cellH + padY;
        const seed = (r * 19 + c * 23 + variant * 7) % 24;

        let col, isLit = false;
        if (seed >= 16) {
          col = warmLight[seed % warmLight.length];
          isLit = true;
        } else if (seed >= 11) {
          col = cyberLight[seed % cyberLight.length];
          isLit = true;
        } else if (seed >= 9) {
          col = techPurple[seed % techPurple.length];
          isLit = true;
        } else {
          col = darkGlass[seed % darkGlass.length];
        }

        // Window Glass with Emissive Warmth
        ctx.fillStyle = col;
        if (isLit) {
          ctx.shadowColor = col;
          ctx.shadowBlur = 8;
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.fillRect(x, y, winW, winH);

        // Internal mullion divider
        if (winW > 18) {
          ctx.strokeStyle = 'rgba(10, 16, 26, 0.55)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + winW / 2, y);
          ctx.lineTo(x + winW / 2, y + winH);
          ctx.stroke();
        }
      }
    }
    ctx.shadowBlur = 0;

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 8);
    return tex;
  }

  // Grass ground texture (green, varied)
  function createGrassTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1a3a0a';
    ctx.fillRect(0, 0, 256, 256);
    // Random grass tufts
    for (let i = 0; i < 800; i++) {
      const x = Math.random() * 256, y = Math.random() * 256;
      const hue = 90 + Math.random() * 40;
      const light = 15 + Math.random() * 20;
      ctx.fillStyle = `hsl(${hue},60%,${light}%)`;
      ctx.beginPath();
      ctx.ellipse(x, y, 1.5 + Math.random() * 2, 4 + Math.random() * 5, (Math.random() - 0.5) * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(12, 12);
    return tex;
  }

  // Concrete/asphalt sidewalk texture
  function createSidewalkTexture() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#2a2e36';
    ctx.fillRect(0, 0, 128, 128);
    // Tile cracks
    ctx.strokeStyle = '#1a1e26';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * 32, 0); ctx.lineTo(i * 32, 128); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * 32); ctx.lineTo(128, i * 32); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 60);
    return tex;
  }

  // 3D Billboard Sprite for Landmark Names & POIs
  function createBillboardSprite(text, subtext, color = '#00e5ff', icon = '🏢') {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');

    // Rounded Glass Card
    roundRect(ctx, 4, 4, 312, 72, 16);
    ctx.fillStyle = 'rgba(8, 14, 26, 0.92)';
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Icon Circle
    ctx.beginPath();
    ctx.arc(36, 40, 22, 0, Math.PI * 2);
    ctx.fillStyle = color + '33';
    ctx.fill();
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, 36, 40);

    // Text Labels
    ctx.textAlign = 'left';
    ctx.font = '900 18px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 68, 32);

    ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(subtext, 68, 54);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(16, 4, 1);
    return sprite;
  }

  function initThreeAR() {
    if (isThreeInitialized) return;
    const canvas = document.getElementById('three-ar-canvas');
    if (!canvas) return;

    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;

    threeScene = new THREE.Scene();
    threeScene.fog = new THREE.FogExp2(0x101a2d, 0.00075);

    // Atmospheric 360 Cyber Sky Dome (twilight horizon, stars & distant skyline)
    const skyTex = createAtmosphericSkyTexture();
    const skyGeo = new THREE.SphereGeometry(900, 32, 16);
    const skyMat = new THREE.MeshBasicMaterial({
      map: skyTex,
      side: THREE.BackSide,
      fog: false
    });
    const skyDome = new THREE.Mesh(skyGeo, skyMat);
    threeScene.add(skyDome);

    // Stars
    const starGeo = new THREE.BufferGeometry();
    const starVerts = [];
    for (let i = 0; i < 1200; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.5;
      starVerts.push(Math.sin(phi)*Math.cos(theta)*650, Math.cos(phi)*650, Math.sin(phi)*Math.sin(theta)*650);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVerts, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, transparent: true, opacity: 0.65 });
    threeScene.add(new THREE.Points(starGeo, starMat));

    threeCamera = new THREE.PerspectiveCamera(65, width / height, 0.2, 1500);
    const pPos = gpsToWorld(playerLat, playerLon);
    threeCamera.position.set(pPos.x, 1.6, pPos.z);
    threeCamera.rotation.order = 'YXZ';

    threeRenderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    threeRenderer.setSize(width, height);
    threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    threeRaycaster = new THREE.Raycaster();
    threeMouse = new THREE.Vector2();

    // Lighting
    const ambLight = new THREE.AmbientLight(0xffffff, 0.85);
    threeScene.add(ambLight);

    const sunLight = new THREE.DirectionalLight(0x00e5ff, 1.2);
    sunLight.position.set(60, 150, 80);
    threeScene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0xa855f7, 0.7);
    fillLight.position.set(-80, 100, -60);
    threeScene.add(fillLight);

    threeObjectsGroup = new THREE.Group();
    threeScene.add(threeObjectsGroup);

    // 1. Asphalt Ground Plane & Street Grid
    threeGroundGroup = new THREE.Group();
    build3DGroundSystem();
    threeObjectsGroup.add(threeGroundGroup);

    // 2. Real Geographic 3D Buildings
    threeBuildingsGroup = new THREE.Group();
    buildRealGeographicBuildings(activeBuildingsData);
    threeObjectsGroup.add(threeBuildingsGroup);

    // 3. Active Destination Beacon (Alex M. - PLAY GOLF)
    threeDestinationGroup = new THREE.Group();
    build3DDestinationBeacon();
    threeObjectsGroup.add(threeDestinationGroup);

    // 4. Real Oakland POI Pins
    threePoiPinsGroup = new THREE.Group();
    build3DPoiPins();
    threeObjectsGroup.add(threePoiPinsGroup);

    // 5. Dynamic Ground Runway Chevrons
    threeChevronsGroup = new THREE.Group();
    build3DRunwayChevrons();
    threeObjectsGroup.add(threeChevronsGroup);

    // Setup Canvas Click Listener for Building Raycasting
    setupBuildingRaycasting(canvas);

    // Fetch live updated buildings from backend / Overpass
    fetchLiveBuildings();

    isThreeInitialized = true;
  }

  // 1. Ground, Grass, Streets, Sidewalks & Street Furniture
  // Streets are positioned using GPS-derived world coordinates for Oakland accuracy.
  function build3DGroundSystem() {
    const grassTex = createGrassTexture();
    const sidewalkTex = createSidewalkTexture();
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x0d1018, roughness: 0.98, metalness: 0.05 });
    const swMat   = new THREE.MeshStandardMaterial({ map: sidewalkTex, roughness: 0.88, color: 0x1e2230 });
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 0.7 });
    const cwMat   = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });

    // ── Base ground plane (full city block, dark asphalt) ──
    const groundGeo = new THREE.PlaneGeometry(3000, 3000);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x080c12, roughness: 0.99, metalness: 0.0 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    threeGroundGroup.add(ground);

    // ── Subtle GPS-scale cyber grid ──
    const grid = new THREE.GridHelper(2000, 200, 0x00e5ff, 0x050a14);
    grid.position.y = 0.01;
    grid.material.opacity = 0.10;
    grid.material.transparent = true;
    threeGroundGroup.add(grid);

    // ── GPS-referenced Oakland streets ──
    // Broadway: lon -122.2715 → compute real x offset
    const anchorLat = playerLat || 37.804456;
    const anchorLon = playerLon || -122.271356;
    const mLon = 111139 * Math.cos(anchorLat * Math.PI / 180);

    // Real Oakland N/S avenues (lon positions)
    const northSouthStreets = [
      { lon: -122.2715, name: 'Broadway',       w: 22 },
      { lon: -122.2696, name: 'Telegraph',      w: 18 },
      { lon: -122.2684, name: 'Webster',        w: 16 },
      { lon: -122.2676, name: 'Harrison',       w: 15 },
      { lon: -122.2730, name: 'San Pablo',      w: 20 },
      { lon: -122.2745, name: 'Franklin',       w: 16 },
      { lon: -122.2760, name: 'Valdez',         w: 14 },
    ];
    northSouthStreets.forEach(({ lon, w }) => {
      const x = (lon - anchorLon) * mLon;
      const road = new THREE.Mesh(new THREE.PlaneGeometry(w, 2400), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, 0.02, 0);
      threeGroundGroup.add(road);
      // Sidewalks
      [-w/2 - 4, w/2 + 4].forEach(ox => {
        const sw = new THREE.Mesh(new THREE.PlaneGeometry(5, 2400), swMat);
        sw.rotation.x = -Math.PI / 2;
        sw.position.set(x + ox, 0.025, 0);
        threeGroundGroup.add(sw);
      });
      // Center dashes on Broadway
      if (w >= 20) {
        for (let z = -1100; z <= 1100; z += 18) {
          const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 8), dashMat);
          dash.rotation.x = -Math.PI / 2;
          dash.position.set(x, 0.04, z);
          threeGroundGroup.add(dash);
        }
      }
    });

    // Real Oakland E/W streets (lat positions → z offset)
    // Oakland block spacing ~90m; 11th St ≈37.801, 12th≈37.802, … 19th≈37.808
    const ewStreets = [
      { lat: 37.8010, name: '10th St',   w: 16 },
      { lat: 37.8019, name: '11th St',   w: 16 },
      { lat: 37.8028, name: '12th St',   w: 18 },
      { lat: 37.8037, name: '13th St',   w: 16 },
      { lat: 37.8046, name: '14th St',   w: 18 },
      { lat: 37.8055, name: '15th St',   w: 16 },
      { lat: 37.8064, name: '16th St',   w: 16 },
      { lat: 37.8073, name: '17th St',   w: 16 },
      { lat: 37.8083, name: '18th St',   w: 16 },
      { lat: 37.8092, name: '19th St',   w: 18 },
      { lat: 37.8001, name: '9th St',    w: 14 },
      { lat: 37.7992, name: '8th St',    w: 14 },
    ];
    ewStreets.forEach(({ lat, w }) => {
      const z = -(lat - anchorLat) * 111139;
      const road = new THREE.Mesh(new THREE.PlaneGeometry(2400, w), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0.02, z);
      threeGroundGroup.add(road);
      // Sidewalks
      [-w/2 - 3.5, w/2 + 3.5].forEach(oz => {
        const sw = new THREE.Mesh(new THREE.PlaneGeometry(2400, 4), swMat);
        sw.rotation.x = -Math.PI / 2;
        sw.position.set(0, 0.025, z + oz);
        threeGroundGroup.add(sw);
      });
      // Crosswalks at each N/S avenue intersection
      northSouthStreets.forEach(({ lon }) => {
        const ix = (lon - anchorLon) * mLon;
        for (let stripe = -7; stripe <= 7; stripe += 2.5) {
          const cw = new THREE.Mesh(new THREE.PlaneGeometry(0.85, w + 6), cwMat);
          cw.rotation.x = -Math.PI / 2;
          cw.position.set(ix + stripe, 0.045, z);
          threeGroundGroup.add(cw);
        }
      });
    });

    // ── Grass / block fill patches between buildings ──
    const grassPatchMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95, color: 0x162c09 });
    for (let gx = -400; gx <= 400; gx += 90) {
      for (let gz = -400; gz <= 400; gz += 90) {
        // Skip street corridors
        const onNS = northSouthStreets.some(s => Math.abs((s.lon - anchorLon)*mLon - gx) < 20);
        const onEW = ewStreets.some(s => Math.abs(-(s.lat - anchorLat)*111139 - gz) < 14);
        if (onNS || onEW) continue;
        const pw = 35 + Math.random() * 30, pd = 30 + Math.random() * 30;
        const patch = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), grassPatchMat);
        patch.rotation.x = -Math.PI / 2;
        patch.position.set(gx + (Math.random()-0.5)*20, 0.03, gz + (Math.random()-0.5)*20);
        threeGroundGroup.add(patch);
      }
    }

    // ── Trees along sidewalks ──
    buildTrees();

    // ── Street lamps ──
    buildStreetLamps();
  }

  // Instanced billboard grass blades scattered on grass patches

  // Stylised low-poly trees placed along real Oakland sidewalks
  function buildTrees() {
    const anchorLat = playerLat || 37.804456;
    const anchorLon = playerLon || -122.271356;
    const mLon = 111139 * Math.cos(anchorLat * Math.PI / 180);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a2e10, roughness: 0.9 });
    const leafColors = [0x1a5c0e, 0x267318, 0x0d4a08, 0x2e8020, 0x1e6b12, 0x194d0a];
    // Tree positions derived from real avenue x offsets + EW street z offsets
    const avenueXs = [-122.2715, -122.2696, -122.2730, -122.2745].map(lon => (lon - anchorLon) * mLon);
    const streetZs = [37.8010, 37.8019, 37.8028, 37.8037, 37.8046, 37.8055, 37.8064, 37.8073, 37.8083].map(lat => -(lat - anchorLat) * 111139);
    let idx = 0;
    avenueXs.forEach(ax => {
      streetZs.forEach(sz => {
        // Two trees per block mid-segment, sidewalk sides
        for (const side of [ax + 14, ax - 14]) {
          for (const zOff of [-38, 38]) {
            const h = 4 + Math.random() * 5;
            const r = 2.2 + Math.random() * 1.5;
            const tx = side + (Math.random()-0.5)*3;
            const tz = sz + zOff + (Math.random()-0.5)*4;
            const trunk = new THREE.Mesh(
              new THREE.CylinderGeometry(0.18, 0.3, h*0.4, 6), trunkMat
            );
            trunk.position.set(tx, h*0.2, tz);
            threeGroundGroup.add(trunk);
            const leafMat = new THREE.MeshStandardMaterial({
              color: leafColors[idx % leafColors.length], roughness: 0.8, flatShading: true
            });
            const cone1 = new THREE.Mesh(new THREE.ConeGeometry(r, h*0.6, 7), leafMat);
            cone1.position.set(tx, h*0.4 + h*0.3, tz);
            threeGroundGroup.add(cone1);
            const cone2 = new THREE.Mesh(new THREE.ConeGeometry(r*0.7, h*0.5, 7), leafMat);
            cone2.position.set(tx, h*0.4 + h*0.6*0.6 + h*0.25, tz);
            threeGroundGroup.add(cone2);
            idx++;
          }
        }
      });
    });
  }


  // Neon-glowing street lamps — placed at real GPS-derived avenue+street intersections
  function buildStreetLamps() {
    const anchorLat = playerLat || 37.804456;
    const anchorLon = playerLon || -122.271356;
    const mLon = 111139 * Math.cos(anchorLat * Math.PI / 180);
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 5.5, 6);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x334455, metalness: 0.9, roughness: 0.2 });
    const headGeo = new THREE.SphereGeometry(0.38, 8, 8);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffe8a0 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.2 });
    const glowGeo = new THREE.SphereGeometry(1.2, 8, 8);

    const avenueXs = [-122.2715, -122.2696, -122.2730, -122.2745].map(lon => (lon - anchorLon) * mLon);
    const streetZs = [37.8010, 37.8019, 37.8028, 37.8037, 37.8046, 37.8055, 37.8064, 37.8073, 37.8083].map(lat => -(lat - anchorLat) * 111139);

    avenueXs.forEach(ax => {
      streetZs.forEach(sz => {
        // Lamp on each corner of each intersection
        [[ax+13, sz-10], [ax-13, sz+10]].forEach(([lx, lz]) => {
          const pole = new THREE.Mesh(poleGeo, poleMat);
          pole.position.set(lx, 2.75, lz);
          threeGroundGroup.add(pole);
          const head = new THREE.Mesh(headGeo, headMat);
          head.position.set(lx, 5.7, lz);
          threeGroundGroup.add(head);
          const glow = new THREE.Mesh(glowGeo, glowMat);
          glow.position.copy(head.position);
          threeGroundGroup.add(glow);
        });
      });
    });
  }

  // 2. Real Geographic Buildings Construction
  function buildRealGeographicBuildings(data) {
    if (!threeBuildingsGroup) return;
    // Clear previous
    while (threeBuildingsGroup.children.length > 0) {
      const obj = threeBuildingsGroup.children[0];
      threeBuildingsGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
    }

    // Per-building material variety based on type & height
    const neonColors  = [0x00e5ff, 0x00ff99, 0xa855f7, 0x3b82f6, 0xff7043, 0xffd700];
    const facadePalette = [
      { color: 0x223652, metal: 0.75, rough: 0.25 }, // glass tower – azure
      { color: 0x3d281e, metal: 0.20, rough: 0.75 }, // brick/terracotta – warm
      { color: 0x2a3340, metal: 0.50, rough: 0.55 }, // architectural steel – grey
      { color: 0x19333d, metal: 0.70, rough: 0.30 }, // curtain wall – teal
      { color: 0x282038, metal: 0.65, rough: 0.35 }, // cyber obsidian – purple
      { color: 0x203045, metal: 0.85, rough: 0.20 }, // mirrored high-rise – blue
    ];

    data.forEach((b, idx) => {
      if (!b.lat || !b.lon) return;

      const bPos = gpsToWorld(b.lat, b.lon);
      const height = b.height || (b.levels ? b.levels * 3.6 : 24);
      const levels = b.levels || Math.max(1, Math.round(height / 3.5));
      const edgeColor = neonColors[idx % neonColors.length];
      const edgeOpacity = 0.5 + (idx % 3) * 0.15;

      // Choose facade style based on height bucket
      const fIdx = height > 60 ? 0 : height > 35 ? 3 : height > 20 ? (idx % 2 === 0 ? 1 : 2) : 4;
      const { color: facadeColor, metal: buildingMetal, rough: buildingRough } = facadePalette[fIdx % facadePalette.length];
      const windowTex = createWindowGridTexture(fIdx);

      let bMesh = null;

      // If real polygon geometry footprint available
      if (b.geometry && b.geometry.length >= 3) {
        try {
          const rawPts = b.geometry.slice();
          // Filter out duplicate closing point if same as first
          if (rawPts.length > 3 && rawPts[0].lat === rawPts[rawPts.length - 1].lat && rawPts[0].lon === rawPts[rawPts.length - 1].lon) {
            rawPts.pop();
          }

          const shape = new THREE.Shape();
          const p0 = gpsToWorld(rawPts[0].lat, rawPts[0].lon);
          shape.moveTo(p0.x - bPos.x, -(p0.z - bPos.z));
          for (let i = 1; i < rawPts.length; i++) {
            const pi = gpsToWorld(rawPts[i].lat, rawPts[i].lon);
            shape.lineTo(pi.x - bPos.x, -(pi.z - bPos.z));
          }
          shape.closePath();

          const extrudeSettings = { depth: height, bevelEnabled: false };
          const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
          geom.rotateX(-Math.PI / 2);
          const mat = new THREE.MeshStandardMaterial({
            map: windowTex,
            emissiveMap: windowTex,
            emissive: new THREE.Color(0xffffff),
            emissiveIntensity: 0.70,
            roughness: buildingRough,
            metalness: buildingMetal,
            color: facadeColor,
            side: THREE.DoubleSide
          });
          bMesh = new THREE.Mesh(geom, mat);
          bMesh.position.set(bPos.x, 0, bPos.z);

          // Glowing rooftop perimeter outline
          const roofPts = rawPts.map(pt => {
            const p = gpsToWorld(pt.lat, pt.lon);
            return new THREE.Vector3(p.x, height + 0.35, p.z);
          });
          const roofGeom = new THREE.BufferGeometry().setFromPoints(roofPts);
          const roofOutline = new THREE.LineLoop(roofGeom, new THREE.LineBasicMaterial({
            color: edgeColor,
            transparent: true,
            opacity: 0.92
          }));
          threeBuildingsGroup.add(roofOutline);
        } catch(e) { 
          console.error("Failed to build geometry for", b.id, e);
          bMesh = null; 
        }
      }
      // Fallback to bounding box with realistic architectural dimensions
      if (!bMesh) {
        const w = 22 + Math.min(28, levels * 1.4);
        const d = 20 + Math.min(26, levels * 1.2);
        const boxGeo = new THREE.BoxGeometry(w, height, d);
        const mat = new THREE.MeshStandardMaterial({
          map: windowTex,
          emissiveMap: windowTex,
          emissive: new THREE.Color(0xffffff),
          emissiveIntensity: 0.70,
          roughness: 0.28,
          metalness: buildingMetal,
          color: facadeColor,
          side: THREE.DoubleSide
        });
        bMesh = new THREE.Mesh(boxGeo, mat);
        bMesh.position.set(bPos.x, height / 2, bPos.z);
      }

      bMesh.userData = {
        name: b.name || `Building #${b.id}`,
        type: b.type || 'Commercial',
        height: height, levels: levels, lat: b.lat, lon: b.lon
      };
      threeBuildingsGroup.add(bMesh);

      // Glowing edge wireframe
      const edges = new THREE.EdgesGeometry(bMesh.geometry);
      const wire = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: edgeOpacity })
      );
      wire.position.copy(bMesh.position);
      wire.rotation.copy(bMesh.rotation);
      wire.userData = bMesh.userData;
      threeBuildingsGroup.add(wire);

      // ── Rooftop details & 3D AR Landmark Billboard ──
      // Aviation beacon (red blink sphere)
      if (height > 20) {
        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(0.55, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xff2244 })
        );
        beacon.position.set(bPos.x, height + 1.1, bPos.z);
        threeBuildingsGroup.add(beacon);
      }

      // Floating 3D holographic landmark tag over prominent towers
      if (b.name && (height >= 40 || b.type === 'theatre' || b.name.includes('Plaza') || b.name.includes('Broadway'))) {
        const tag = createBillboardSprite(b.name, `${Math.round(height)}m · ${b.type || 'Landmark'}`, '#00e5ff', b.type === 'theatre' ? '🎭' : '🏢');
        tag.position.set(bPos.x, height + 10, bPos.z);
        tag.scale.set(18, 4.5, 1);
        threeBuildingsGroup.add(tag);
      }

      // Antenna spire on tall towers
      if (height >= 45) {
        const spire = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.18, height * 0.22, 5),
          new THREE.MeshStandardMaterial({ color: 0x8899bb, metalness: 0.9, roughness: 0.15 })
        );
        spire.position.set(bPos.x, height + height * 0.11, bPos.z);
        threeBuildingsGroup.add(spire);
      }

      // Water tower on mid-rise brick buildings
      if (height >= 18 && height < 40 && idx % 5 === 0) {
        const tank = new THREE.Mesh(
          new THREE.CylinderGeometry(2.2, 2.2, 3.5, 9),
          new THREE.MeshStandardMaterial({ color: 0x5c3a1a, roughness: 0.85 })
        );
        tank.position.set(bPos.x + 4, height + 1.75, bPos.z + 3);
        threeBuildingsGroup.add(tank);
        const tankRoof = new THREE.Mesh(
          new THREE.ConeGeometry(2.4, 2, 9),
          new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.9 })
        );
        tankRoof.position.set(bPos.x + 4, height + 3.5 + 1, bPos.z + 3);
        threeBuildingsGroup.add(tankRoof);
      }

      // HVAC box on flat roofs
      if (height >= 25 && idx % 3 === 1) {
        const hvac = new THREE.Mesh(
          new THREE.BoxGeometry(4, 1.8, 3),
          new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 0.7, metalness: 0.5 })
        );
        hvac.position.set(bPos.x - 3, height + 0.9, bPos.z - 2);
        threeBuildingsGroup.add(hvac);
      }

      // Compact floating name label for shorter notable buildings (no label if already got holographic tag above)
      const alreadyHasTag = b.name && (height >= 40 || b.type === 'theatre' || b.name.includes('Plaza') || b.name.includes('Broadway'));
      if (b.name && !alreadyHasTag && (height >= 20 || b.type === 'hotel' || b.type === 'apartments' || b.type === 'office')) {
        const typeIcon = { hotel: '🏨', apartments: '🏠', office: '🏢', retail: '🛍️', public: '🏛️', commercial: '🏪' }[b.type] || '🏗️';
        const labelColor = neonColors[idx % neonColors.length];
        const colorHex = '#' + labelColor.toString(16).padStart(6, '0');
        const sub2 = `${Math.round(height)}m · ${levels} fl`;
        const sprite2 = createBillboardSprite(b.name, sub2, colorHex, typeIcon);
        sprite2.position.set(bPos.x, height + 5.5, bPos.z);
        sprite2.scale.set(14, 3.5, 1);
        threeBuildingsGroup.add(sprite2);
      }
    });

    console.log(`[Three.js 3D] Constructed ${data.length} real geographic buildings around Oakland calibration`);
  }

  // 3. Active Match Destination (Alex M. - PLAY GOLF)
  let destDiamondMesh = null, destPulseRingMesh = null;
  function build3DDestinationBeacon() {
    if (!threeDestinationGroup) return;
    while (threeDestinationGroup.children.length > 0) {
      threeDestinationGroup.remove(threeDestinationGroup.children[0]);
    }

    const dPos = gpsToWorld(destLat, destLon);

    // A) 150m Vertical Glowing Light Cylinder
    const beamGeo = new THREE.CylinderGeometry(0.8, 3.2, 160, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x00ff99,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(dPos.x, 80, dPos.z);
    threeDestinationGroup.add(beam);

    // B) Rotating Emerald Diamond Beacon at 14m
    const diamondGeo = new THREE.OctahedronGeometry(2.6, 0);
    const diamondMat = new THREE.MeshStandardMaterial({
      color: 0x00ff99,
      emissive: 0x00c853,
      emissiveIntensity: 0.8,
      roughness: 0.1,
      metalness: 0.9
    });
    destDiamondMesh = new THREE.Mesh(diamondGeo, diamondMat);
    destDiamondMesh.position.set(dPos.x, 14, dPos.z);
    threeDestinationGroup.add(destDiamondMesh);

    // Wireframe on diamond
    const diamondWire = new THREE.LineSegments(
      new THREE.EdgesGeometry(diamondGeo),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
    );
    destDiamondMesh.add(diamondWire);

    // C) Concentric Pulsing Ground Ring
    const ringGeo = new THREE.RingGeometry(3, 3.8, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ff99,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    });
    destPulseRingMesh = new THREE.Mesh(ringGeo, ringMat);
    destPulseRingMesh.rotation.x = -Math.PI / 2;
    destPulseRingMesh.position.set(dPos.x, 0.08, dPos.z);
    threeDestinationGroup.add(destPulseRingMesh);

    // D) Floating 3D Destination Info Billboard (Managed crisply by 2D AR HUD Overlay with real-time distance updates)
    // 3D scene retains glowing cylinder light beacon, pulsing emerald diamond, and ground ring.
  }

  // 4. Real Oakland Landmark POI Pins in 3D
  function build3DPoiPins() {
    if (!threePoiPinsGroup) return;
    while (threePoiPinsGroup.children.length > 0) {
      threePoiPinsGroup.remove(threePoiPinsGroup.children[0]);
    }

    arPOIs.forEach(poi => {
      if (!poi.lat || !poi.lon) return;
      const pPos = gpsToWorld(poi.lat, poi.lon);
      const colorHex = parseInt((poi.color || '#00e5ff').replace('#', '0x'), 16);

      // Vertical pin stem (30m high)
      const stemGeo = new THREE.CylinderGeometry(0.3, 0.3, 30, 8);
      const stemMat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.7 });
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.set(pPos.x, 15, pPos.z);
      threePoiPinsGroup.add(stem);

      // Ground Anchor Dot
      const dotGeo = new THREE.CircleGeometry(2.5, 16);
      const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide }));
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(pPos.x, 0.06, pPos.z);
      threePoiPinsGroup.add(dot);

      // 3D Beacon Stem & Ground Dot (POI labels managed crisply by 2D Live View overlay with real-time distance counters)
    });
  }

  // 5. Dynamic 3D Runway Chevrons along Ground Path
  let chevronMeshes = [];
  function build3DRunwayChevrons() {
    if (!threeChevronsGroup) return;
    while (threeChevronsGroup.children.length > 0) {
      threeChevronsGroup.remove(threeChevronsGroup.children[0]);
    }
    chevronMeshes = [];

    const numChevrons = 14;
    const chevShape = new THREE.Shape();
    chevShape.moveTo(0, 2.0);
    chevShape.lineTo(2.2, 0);
    chevShape.lineTo(1.3, 0);
    chevShape.lineTo(0, 1.2);
    chevShape.lineTo(-1.3, 0);
    chevShape.lineTo(-2.2, 0);
    chevShape.closePath();

    const chevGeo = new THREE.ShapeGeometry(chevShape);
    chevGeo.rotateX(-Math.PI / 2);

    for (let i = 0; i < numChevrons; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x00e5ff,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(chevGeo, mat);
      mesh.position.set(0, 0.08, 0);
      mesh.visible = false;
      threeChevronsGroup.add(mesh);
      chevronMeshes.push(mesh);
    }
  }

  function update3DRunwayChevrons(pPos, dPos, time) {
    if (!chevronMeshes || chevronMeshes.length === 0) return;

    const dx = dPos.x - pPos.x;
    const dz = dPos.z - pPos.z;
    const totalDist = Math.sqrt(dx * dx + dz * dz);
    const angle = Math.atan2(dx, -dz);

    const stepSpacing = 7.0;
    const animPhase = ((time * 0.003) % 1.0) * stepSpacing;

    chevronMeshes.forEach((mesh, idx) => {
      const distAlongPath = 4.0 + animPhase + idx * stepSpacing;
      if (distAlongPath > totalDist - 8) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      const t = distAlongPath / totalDist;
      mesh.position.x = pPos.x + dx * t;
      mesh.position.z = pPos.z + dz * t;
      mesh.position.y = 0.08;
      mesh.rotation.y = angle;

      const alpha = Math.max(0.15, Math.min(0.9, 1.0 - (distAlongPath / 65)));
      mesh.material.opacity = alpha;
    });
  }

  // 6. Raycasting Interaction on Buildings
  function setupBuildingRaycasting(canvas) {
    const liveAr = document.getElementById('gmaps-live-ar') || canvas;
    if (!liveAr) return;

    liveAr.addEventListener('click', (e) => {
      // Don't raycast if user clicked UI buttons, modals, cards, or minimap
      if (e.target.closest('button') || e.target.closest('.ar-minimap-wrap') || 
          e.target.closest('#ar-bldg-card') || e.target.closest('#ar-sheet') || 
          e.target.closest('#gmaps-key-modal') || e.target.closest('.ar-mode-dropdown') ||
          e.target.closest('.ar-heading-chip') || e.target.closest('.ar-gps-pill')) {
        return;
      }
      if (!threeBuildingsGroup || !threeCamera) return;

      threeMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      threeMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

      threeRaycaster.setFromCamera(threeMouse, threeCamera);
      const intersects = threeRaycaster.intersectObjects(threeBuildingsGroup.children);

      if (intersects.length > 0) {
        const hit = intersects.find(i => i.object.userData && i.object.userData.name);
        if (hit) {
          const u = hit.object.userData;
          const pPos = gpsToWorld(playerLat, playerLon);
          const bDist = Math.round(Math.hypot(hit.object.position.x - pPos.x, hit.object.position.z - pPos.z));

          const card = document.getElementById('ar-bldg-card');
          const title = document.getElementById('bldg-card-title');
          const desc = document.getElementById('bldg-card-desc');
          if (card && title && desc) {
            title.textContent = `🏢 ${u.name}`;
            desc.innerHTML = `Height: <strong>${u.height}m</strong> (${u.levels} floors) · ${u.type}<br>Distance: <strong>${bDist}m</strong> · ${u.lat.toFixed(5)}, ${u.lon.toFixed(5)}`;
            card.style.display = 'block';
          }

          // Visual Pulse Flash on the clicked building
          if (hit.object.material && hit.object.material.emissive) {
            const origEmissive = hit.object.material.emissive.getHex();
            hit.object.material.emissive.setHex(0x00e5ff);
            setTimeout(() => {
              if (hit.object && hit.object.material && hit.object.material.emissive) {
                hit.object.material.emissive.setHex(origEmissive);
              }
            }, 1000);
          }
        }
      } else {
        closeBldgCard();
      }
    });
  }

  function closeBldgCard() {
    const card = document.getElementById('ar-bldg-card');
    if (card) card.style.display = 'none';
  }

  // Dynamic Real-Time Building Streaming from Server / Overpass API
  let lastFetchedBldgsLat = 0;
  let lastFetchedBldgsLon = 0;
  let isFetchingBldgs = false;

  async function checkAndRefreshBuildings() {
    if (isFetchingBldgs) return;
    const distSq = Math.pow(playerLat - lastFetchedBldgsLat, 2) + Math.pow(playerLon - lastFetchedBldgsLon, 2);
    // If moved more than ~150 meters (0.00135 deg ~ 150m)
    if (distSq > 0.000002) {
      await fetchLiveBuildings();
    }
  }

  async function fetchLiveBuildings() {
    if (isFetchingBldgs) return;
    isFetchingBldgs = true;
    lastFetchedBldgsLat = playerLat;
    lastFetchedBldgsLon = playerLon;
    try {
      const res = await fetch(`/api/buildings?lat=${playerLat}&lon=${playerLon}&radius=450`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.buildings && json.buildings.length > 0) {
          activeBuildingsData = json.buildings;
          buildRealGeographicBuildings(activeBuildingsData);
          updateTelemetryHUD();
        }
      }
    } catch(err) {
      console.log('[Three.js 3D] Using preloaded Oakland buildings dataset');
    } finally {
      isFetchingBldgs = false;
    }
  }

  // Real-Time 3D Frame Render Loop (Synchronized to GPS)
  function renderThreeARFrame(heading) {
    if (!isThreeInitialized) initThreeAR();
    if (!threeScene || !threeCamera || !threeRenderer) return;

    // 1. Synchronize 3D Camera Position with Player's Live GPS Coordinates
    const pPos = gpsToWorld(playerLat, playerLon);
    threeCamera.position.x = pPos.x;
    threeCamera.position.z = pPos.z;
    threeCamera.position.y = 1.6; // Human eye height

    // 2. Camera Orientation (Yaw + Pitch)
    const headingRad = (heading * Math.PI) / 180;
    const pitchRad = (smoothedPitch * Math.PI) / 180;
    threeCamera.rotation.order = 'YXZ';
    threeCamera.rotation.y = -headingRad;
    threeCamera.rotation.x = pitchRad;

    // 3. Animate Destination Beacon
    const dPos = gpsToWorld(destLat, destLon);
    if (destDiamondMesh) {
      destDiamondMesh.rotation.y += 0.025;
      destDiamondMesh.rotation.x += 0.012;
    }
    if (destPulseRingMesh) {
      const pTime = (Date.now() * 0.0018) % 1.0;
      const s = 1.0 + pTime * 2.5;
      destPulseRingMesh.scale.set(s, s, s);
      destPulseRingMesh.material.opacity = Math.max(0, 0.85 - pTime);
    }

    // 4. Update Ground Runway Chevrons
    update3DRunwayChevrons(pPos, dPos, Date.now());

    // 5. Render & Telemetry
    threeRenderer.render(threeScene, threeCamera);
    updateTelemetryHUD();
  }

  // Update AR Telemetry HUD
  function updateTelemetryHUD() {
    const el = document.getElementById('ar-gps-telemetry');
    if (!el) return;
    const pPos = gpsToWorld(playerLat, playerLon);
    const bldgCount = activeBuildingsData.length;
    el.textContent = `GPS: ${playerLat.toFixed(6)}, ${playerLon.toFixed(6)} · 3D: (${pPos.x >= 0 ? '+' : ''}${pPos.x.toFixed(1)}m, ${(-pPos.z) >= 0 ? '+' : ''}${(-pPos.z).toFixed(1)}m) · ${bldgCount} Real Bldgs · GPS-LOCKED`;
  }

  // ============================================================
  // GOOGLE MAPS PLATFORM LIVE VIEW & STREET VIEW AR ENGINE
  // ============================================================
  function loadGoogleMapsAPI(apiKey, forceReload = false) {
    if (!forceReload && window.google && window.google.maps) {
      onGoogleMapsReady();
      return;
    }
    const existing = document.getElementById('google-maps-js-sdk');
    if (existing) existing.remove();
    if (forceReload && window.google) {
      try { delete window.google.maps; } catch(e) {}
    }

    const script = document.createElement('script');
    script.id = 'google-maps-js-sdk';
    const keyParam = apiKey ? `key=${apiKey}&` : '';
    script.src = `https://maps.googleapis.com/maps/api/js?${keyParam}libraries=geometry,places,routes,marker&v=weekly&loading=async&callback=onGoogleMapsReady`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      console.warn('Google Maps API load notice: Running in Daylight 3D mode until API key is set.');
      const badge = document.getElementById('ar-gmaps-badge-txt');
      if (badge) badge.textContent = 'Daylight 3D Cartography Active';
    };
    document.head.appendChild(script);
  }

  window.gm_authFailure = function() {
    console.warn('Google Maps Notice: Maps API Key unverified. Automatically switching to Cyber 3D City & Real 3D Vector Engine.');
    isGmapsApiLoaded = false;
    isStreetViewInit = false;

    // Remove Google error popups from DOM
    const cleanBanners = () => {
      document.querySelectorAll('.gm-err-container, .gm-err-content, button.dismissButton').forEach(el => {
        try { el.remove(); } catch(e) {}
      });
    };
    cleanBanners();
    setTimeout(cleanBanners, 200);
    setTimeout(cleanBanners, 800);

    const svPano = document.getElementById('ar-streetview-pano');
    const realMapEl = document.getElementById('ar-realmap-3d');
    if (svPano) svPano.style.display = 'none';
    if (currentARMode === 'streetview' || currentARMode === 'satellite') {
      selectARMode('cyber');
    } else {
      if (realMapEl) realMapEl.style.display = 'block';
      if (!isRealMap3DInit) initRealMap3D();
      syncRealMap3DPosition(playerLat, playerLon, smoothedHeading, smoothedPitch);
    }
    const badge = document.getElementById('ar-gmaps-badge-txt');
    if (badge) badge.textContent = 'Daylight Real 3D Map · 1st-Person Navigation Active';
  };

  window.onGoogleMapsReady = function() {
    isGmapsApiLoaded = true;
    initGoogleSatelliteMap();
    if (currentARMode === 'streetview') {
      checkAndActivateStreetView();
    }
  };

  function checkAndActivateStreetView() {
    const svPano = document.getElementById('ar-streetview-pano');
    const realMapEl = document.getElementById('ar-realmap-3d');
    const badge = document.getElementById('ar-gmaps-badge-txt');

    if (!window.google || !window.google.maps || !window.google.maps.StreetViewService) {
      if (svPano) svPano.style.display = 'none';
      if (realMapEl) realMapEl.style.display = 'block';
      if (!isRealMap3DInit) initRealMap3D();
      syncRealMap3DPosition(playerLat, playerLon, smoothedHeading, smoothedPitch);
      if (badge) badge.textContent = 'Street View AR · Daylight 3D Map Active';
      return;
    }

    try {
      const svService = new google.maps.StreetViewService();
      svService.getPanorama({ location: { lat: playerLat, lng: playerLon }, radius: 100 }, (data, status) => {
        if (status === google.maps.StreetViewStatus.OK && data && data.location) {
          if (!streetViewPanorama) initGoogleStreetViewPano();
          if (streetViewPanorama) streetViewPanorama.setPano(data.location.pano);
          if (currentARMode === 'streetview') {
            if (svPano) { svPano.style.display = 'block'; svPano.classList.add('sv-loaded'); }
            if (realMapEl) realMapEl.style.display = 'none';
            if (badge) badge.textContent = 'Google Maps Live View · Street View Active';
          }
        } else {
          // If no Street View or unauthorized key, keep white Google container hidden!
          console.warn('Street View notice: No panorama or key pending, showing Daylight Real 3D Map representation.');
          if (svPano) svPano.style.display = 'none';
          if (currentARMode === 'streetview') {
            if (realMapEl) realMapEl.style.display = 'block';
            if (!isRealMap3DInit) initRealMap3D();
            syncRealMap3DPosition(playerLat, playerLon, smoothedHeading, smoothedPitch);
            if (badge) badge.textContent = 'Street View AR · Daylight 3D Map Active';
          }
        }
      });
    } catch(err) {
      if (svPano) svPano.style.display = 'none';
      if (realMapEl) realMapEl.style.display = 'block';
    }
  }

  function initGoogleStreetViewPano() {
    if (!window.google || !window.google.maps) return;
    const container = document.getElementById('ar-streetview-pano');
    if (!container) return;

    try {
      streetViewPanorama = new google.maps.StreetViewPanorama(container, {
        position: { lat: playerLat, lng: playerLon },
        pov: { heading: smoothedHeading, pitch: smoothedPitch },
        zoom: 1,
        disableDefaultUI: true,
        showRoadLabels: true,
        clickToGo: true,
        linksControl: false,
        panControl: false,
        enableCloseButton: false,
        addressControl: false,
        motionTracking: false,
        motionTrackingControl: false
      });

      streetViewPanorama.addListener('pov_changed', () => {
        if (!isArActive || isDragging) return;
        const pov = streetViewPanorama.getPov();
        if (pov && (Math.abs(pov.heading - currentHeading) > 1.5 || Math.abs(pov.pitch - currentPitch) > 1.5)) {
          targetHeading = pov.heading;
          targetPitch = pov.pitch;
        }
      });

      streetViewPanorama.addListener('position_changed', () => {
        const pos = streetViewPanorama.getPosition();
        if (pos) {
          playerLat = pos.lat();
          playerLon = pos.lng();
          recalcBearingAndDist();
          syncMapToState();
          updatePipMap();
          pushPositionToServer();
          checkProximityTrigger(destinationDist);
        }
      });

      isStreetViewInit = true;
      if (currentARMode === 'streetview') {
        const badge = document.getElementById('ar-gmaps-badge-txt');
        if (badge) badge.textContent = 'Google Maps Live View · Street View Active';
      }

      // Enforce outdoor Street View to avoid snapping into indoor cafes/shops
      try {
        if (window.google && google.maps && google.maps.StreetViewService) {
          const svService = new google.maps.StreetViewService();
          svService.getPanorama({
            location: { lat: playerLat, lng: playerLon },
            radius: 120,
            source: google.maps.StreetViewSource.OUTDOOR
          }, (data, status) => {
            if (status === 'OK' && data && data.location && streetViewPanorama) {
              streetViewPanorama.setPano(data.location.pano);
              streetViewPanorama.setPov({ heading: smoothedHeading, pitch: smoothedPitch, zoom: 1 });
            }
          });
        }
      } catch(e) {}
    } catch (err) {
      console.error('Error initializing Street View:', err);
    }
  }

  function initGoogleSatelliteMap() {
    if (!window.google || !window.google.maps) return;
    const container = document.getElementById('ar-gmaps-satellite');
    if (!container) return;

    try {
      gmapSatelliteInstance = new google.maps.Map(container, {
        center: { lat: playerLat, lng: playerLon },
        zoom: 19,
        mapTypeId: 'satellite',
        heading: smoothedHeading,
        disableDefaultUI: true,
        gestureHandling: 'greedy'
      });
      isSatelliteInit = true;
    } catch(e) {
      console.error('Error initializing Satellite Map:', e);
    }
  }

  function syncStreetViewPOV(heading, pitch) {
    if (streetViewPanorama && isStreetViewInit && currentARMode === 'streetview') {
      try {
        streetViewPanorama.setPov({
          heading: (heading + 360) % 360,
          pitch: Math.max(-60, Math.min(60, pitch)),
          zoom: 1
        });
      } catch(e) {}
    }
    if (gmapSatelliteInstance && isSatelliteInit && currentARMode === 'satellite') {
      try {
        gmapSatelliteInstance.setHeading(heading);
      } catch(e) {}
    }
  }

  function syncStreetViewPosition(lat, lon) {
    if (streetViewPanorama && isStreetViewInit) {
      try {
        streetViewPanorama.setPosition({ lat, lng: lon });
      } catch(e) {}
    }
    if (gmapSatelliteInstance && isSatelliteInit) {
      try {
        gmapSatelliteInstance.setCenter({ lat, lng: lon });
      } catch(e) {}
    }
  }

  // ============================================================
  // MAPLIBRE GL 3D REAL MAP ENGINE (Daylight & Satellite 1st Person Cartography)
  // ============================================================
  let isSatelliteLayerActive = false;

  function initRealMap3D() {
    if (isRealMap3DInit || !window.maplibregl) return;
    const container = document.getElementById('ar-realmap-3d');
    if (!container) return;

    try {
      realMap3DInstance = new maplibregl.Map({
        container: 'ar-realmap-3d',
        style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
        center: [playerLon, playerLat],
        zoom: 17.6,
        pitch: 65,
        bearing: currentHeading,
        maxPitch: 85,
        attributionControl: false
      });

      realMap3DInstance.on('load', () => {
        isRealMap3DInit = true;

        // Configure realistic natural sunlight for 3D extrusion lighting
        try {
          realMap3DInstance.setLight({
            anchor: 'viewport',
            color: '#ffffff',
            intensity: 0.85,
            position: [1.15, 210, 30]
          });
        } catch(e) {}

        // Add High-Resolution Satellite Raster Source
        try {
          if (!realMap3DInstance.getSource('esri-sat')) {
            realMap3DInstance.addSource('esri-sat', {
              type: 'raster',
              tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
              tileSize: 256,
              maxzoom: 19
            });
          }
          if (!realMap3DInstance.getLayer('esri-satellite-layer')) {
            const firstSymbol = realMap3DInstance.getStyle().layers.find(l => l.type === 'symbol');
            realMap3DInstance.addLayer({
              id: 'esri-satellite-layer',
              type: 'raster',
              source: 'esri-sat',
              layout: { 'visibility': isSatelliteLayerActive ? 'visible' : 'none' },
              paint: { 'raster-opacity': 1.0 }
            }, firstSymbol ? firstSymbol.id : undefined);
          }
        } catch(e) {
          console.warn('Satellite layer init notice:', e);
        }

        // Add 3D Extruded Buildings Layer to MapLibre with warm natural sandstone colors
        try {
          if (realMap3DInstance.getSource('carto') && !realMap3DInstance.getLayer('3d-buildings-extrusion')) {
            realMap3DInstance.addLayer({
              'id': '3d-buildings-extrusion',
              'source': 'carto',
              'source-layer': 'building',
              'type': 'fill-extrusion',
              'minzoom': 15,
              'paint': {
                'fill-extrusion-color': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  15, '#ede9e3',
                  18, '#f5f2eb'
                ],
                'fill-extrusion-height': 24,
                'fill-extrusion-base': 0,
                'fill-extrusion-opacity': 0.95
              }
            });
          }
        } catch(e) {
          console.log('MapLibre building extrusion init:', e);
        }

        // Add 3D Walking Route & Turn-by-Turn Line
        try {
          if (!realMap3DInstance.getSource('route-nav-source')) {
            realMap3DInstance.addSource('route-nav-source', {
              type: 'geojson',
              data: {
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [playerLon, playerLat],
                    [-122.2708, 37.8052],
                    [-122.2696, 37.8062],
                    [destLon, destLat]
                  ]
                }
              }
            });
          }
          if (!realMap3DInstance.getLayer('route-nav-glow')) {
            realMap3DInstance.addLayer({
              id: 'route-nav-glow',
              type: 'line',
              source: 'route-nav-source',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: {
                'line-color': '#1a73e8',
                'line-width': 16,
                'line-opacity': 0.45,
                'line-blur': 4
              }
            });
          }
          if (!realMap3DInstance.getLayer('route-nav-core')) {
            realMap3DInstance.addLayer({
              id: 'route-nav-core',
              type: 'line',
              source: 'route-nav-source',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: {
                'line-color': '#1a73e8',
                'line-width': 7,
                'line-opacity': 1.0
              }
            });
          }
          if (!realMap3DInstance.getLayer('route-nav-dash')) {
            realMap3DInstance.addLayer({
              id: 'route-nav-dash',
              type: 'line',
              source: 'route-nav-source',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: {
                'line-color': '#ffffff',
                'line-width': 2.5,
                'line-dasharray': [2, 2]
              }
            });
          }
        } catch(e) {}

        // Add Player Position Marker
        try {
          const pEl = document.createElement('div');
          pEl.className = 'realmap-player-marker';
          realMapMarker = new maplibregl.Marker({ element: pEl })
            .setLngLat([playerLon, playerLat])
            .addTo(realMap3DInstance);
        } catch(e) {}
      });

      // Synchronize look rotation when user drags on map
      realMap3DInstance.on('rotate', () => {
        if (currentARMode === 'realmap' || currentARMode === 'satellite' || currentARMode === 'streetview') {
          currentHeading = (realMap3DInstance.getBearing() + 360) % 360;
          targetHeading = currentHeading;
        }
      });

    } catch(err) {
      console.error('Failed to init MapLibre 3D map:', err);
    }
  }

  function syncRealMap3DPosition(lat, lon, heading, pitch) {
    if (!realMap3DInstance || !isRealMap3DInit) return;
    try {
      const targetPitch = Math.max(50, Math.min(85, 65 + (pitch * 0.2)));
      realMap3DInstance.jumpTo({
        center: [lon, lat],
        bearing: heading,
        pitch: targetPitch
      });
      if (realMapMarker) realMapMarker.setLngLat([lon, lat]);
      
      const routeSrc = realMap3DInstance.getSource('route-nav-source');
      if (routeSrc) {
        routeSrc.setData({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [lon, lat],
              [-122.2708, 37.8052],
              [-122.2696, 37.8062],
              [destLon, destLat]
            ]
          }
        });
      }
    } catch(e) {}
  }

  function setSatelliteLayerVisibility(visible) {
    isSatelliteLayerActive = visible;
    if (realMap3DInstance && realMap3DInstance.getLayer('esri-satellite-layer')) {
      realMap3DInstance.setLayoutProperty('esri-satellite-layer', 'visibility', visible ? 'visible' : 'none');
    }
  }

  // ============================================================
  // AR VIEW MODE SELECTION & CONTROLS
  // ============================================================
  function toggleModeDropdown() {
    const menu = document.getElementById('ar-mode-menu');
    if (menu) menu.classList.toggle('show');
  }

  function selectARMode(mode) {
    currentARMode = mode;
    viewMode = mode;
    const menu = document.getElementById('ar-mode-menu');
    if (menu) menu.classList.remove('show');

    // If AR panel isn't open yet and user picked a mode from top bar, open it
    const panel = document.getElementById('gmaps-live-ar');
    if (panel && !panel.classList.contains('active')) {
      toggleLiveARMode();
      // Let AR init first, then apply mode after short delay
      setTimeout(() => selectARMode(mode), 300);
      return;
    }

    const realMapEl = document.getElementById('ar-realmap-3d');
    const svPano = document.getElementById('ar-streetview-pano');
    const satMap = document.getElementById('ar-gmaps-satellite');
    const threeCanvas = document.getElementById('three-ar-canvas');
    const overlayCanvas = document.getElementById('ar-overlay-canvas');
    const video = document.getElementById('ar-bg-video');
    const proceduralBg = document.getElementById('ar-bg-procedural');
    const navCard = document.getElementById('ar-nav-guidance-card');
    const vfHud = document.getElementById('camera-viewfinder-hud');
    const btnTxt = document.getElementById('viewmode-txt');
    const btnIcon = document.getElementById('viewmode-icon');
    const badge = document.getElementById('ar-gmaps-badge-txt');

    // Reset base layers
    if (realMapEl) realMapEl.style.display = 'none';
    if (svPano) svPano.style.display = 'none';
    if (satMap) satMap.style.display = 'none';
    if (threeCanvas) threeCanvas.style.display = 'none';
    if (video) video.style.display = 'none';
    if (proceduralBg) proceduralBg.style.display = 'none';
    if (overlayCanvas) overlayCanvas.style.display = 'block';
    // Nav card visible for all modes except camera (camera uses its own HUD)
    if (navCard) navCard.style.display = mode === 'camera' ? 'none' : 'flex';
    // Camera viewfinder only visible in camera mode
    if (vfHud) vfHud.style.display = mode === 'camera' ? 'block' : 'none';
    // Hide camera AR nav HUD by default — shown only in camera mode
    const camNavHudReset = document.getElementById('camera-ar-nav-hud');
    if (camNavHudReset) camNavHudReset.style.display = 'none';

    // Highlight active mode in dropdown and chip bar
    document.querySelectorAll('.ar-mode-item').forEach(item => {
      const text = item.textContent.toLowerCase();
      item.classList.toggle('active', text.includes(mode.toLowerCase()) ||
        (mode === 'realmap' && text.includes('daylight')) ||
        (mode === 'cyber' && text.includes('cyber')) ||
        (mode === 'streetview' && text.includes('street')) ||
        (mode === 'satellite' && text.includes('satellite')) ||
        (mode === 'camera' && text.includes('camera')));
    });
    document.querySelectorAll('.ar-mode-chip').forEach(chip => {
      chip.classList.toggle('active', chip.id === 'mode-chip-' + mode);
    });

    const btnFlip = document.getElementById('btn-camera-flip');
    const btnTorch = document.getElementById('btn-camera-torch');

    if (mode === 'realmap') {
      if (realMapEl) realMapEl.style.display = 'block';
      setSatelliteLayerVisibility(false);
      if (!isRealMap3DInit) initRealMap3D();
      syncRealMap3DPosition(playerLat, playerLon, smoothedHeading, smoothedPitch);
      if (btnTxt) btnTxt.textContent = 'Daylight 3D';
      if (btnIcon) btnIcon.textContent = '☀️';
      if (badge) badge.textContent = 'Daylight 3D Map · 1st-Person Cartography';
      if (btnFlip) btnFlip.style.display = 'none';
      if (btnTorch) btnTorch.style.display = 'none';
      stopCamera();
    } else if (mode === 'streetview') {
      if (isGmapsApiLoaded) {
        checkAndActivateStreetView();
      } else {
        // Fallback to daylight 3D map if streetview key not active
        if (svPano) svPano.style.display = 'none';
        if (realMapEl) realMapEl.style.display = 'block';
        setSatelliteLayerVisibility(false);
        if (!isRealMap3DInit) initRealMap3D();
        syncRealMap3DPosition(playerLat, playerLon, smoothedHeading, smoothedPitch);
      }
      if (btnTxt) btnTxt.textContent = 'Street View AR';
      if (btnIcon) btnIcon.textContent = '📍';
      if (badge) badge.textContent = isGmapsApiLoaded
        ? 'Google Maps Live View · Street View Active'
        : 'Street View AR · Daylight 3D Map Active';
      if (btnFlip) btnFlip.style.display = 'none';
      if (btnTorch) btnTorch.style.display = 'none';
      stopCamera();
    } else if (mode === 'satellite') {
      if (realMapEl) realMapEl.style.display = 'block';
      setSatelliteLayerVisibility(true);
      if (!isRealMap3DInit) initRealMap3D();
      syncRealMap3DPosition(playerLat, playerLon, smoothedHeading, smoothedPitch);
      if (btnTxt) btnTxt.textContent = 'Satellite 3D';
      if (btnIcon) btnIcon.textContent = '🛰️';
      if (badge) badge.textContent = 'Photorealistic Satellite 3D · Aerial Imagery Active';
      if (btnFlip) btnFlip.style.display = 'none';
      if (btnTorch) btnTorch.style.display = 'none';
      stopCamera();
    } else if (mode === 'cyber') {
      // Ensure Three.js is initialized for Cyber City 3D
      if (!isThreeInitialized) initThreeAR();
      if (threeCanvas) threeCanvas.style.display = 'block';
      if (btnTxt) btnTxt.textContent = 'Cyber 3D City';
      if (btnIcon) btnIcon.textContent = '🏙️';
      if (badge) badge.textContent = '3D Cyber City · Neon Architectural Footprints';
      if (btnFlip) btnFlip.style.display = 'none';
      if (btnTorch) btnTorch.style.display = 'none';
      stopCamera();
    } else if (mode === 'camera') {
      if (btnTxt) btnTxt.textContent = 'Camera AR';
      if (btnIcon) btnIcon.textContent = '📷';
      if (badge) badge.textContent = 'Live Device Camera · VPS Active';
      if (btnFlip) btnFlip.style.display = 'flex';
      if (btnTorch) btnTorch.style.display = 'flex';
      // Show the floating directional nav HUD on the camera feed
      const camNavHud = document.getElementById('camera-ar-nav-hud');
      if (camNavHud) camNavHud.style.display = 'flex';
      startCamera();
    }
  }


  function toggleViewMode() {
    toggleModeDropdown();
  }

  // ============================================================
  // GOOGLE MAPS API KEY MODAL & DIAGNOSTICS
  // ============================================================
  function openGoogleMapsKeyModal() {
    const modal = document.getElementById('gmaps-key-modal');
    const input = document.getElementById('gmaps-key-input');
    if (input) input.value = gmapsApiKey;
    if (modal) modal.classList.add('show');
  }

  function closeGoogleMapsKeyModal() {
    const modal = document.getElementById('gmaps-key-modal');
    if (modal) modal.classList.remove('show');
  }

  function setPresetKey(key) {
    const input = document.getElementById('gmaps-key-input');
    if (input) input.value = key;
    testCurrentMapsKey();
  }

  async function testCurrentMapsKey() {
    const input = document.getElementById('gmaps-key-input');
    const statusEl = document.getElementById('gmaps-key-status');
    const key = input ? input.value.trim() : gmapsApiKey;
    if (!statusEl) return;

    if (!key) {
      statusEl.innerHTML = '<span style="color:#a0aec0;">Key is empty. Running in zero-config Daylight 3D Map & Satellite mode.</span>';
      return;
    }

    statusEl.innerHTML = '<span style="color:#00e5ff;">⏳ Testing API key with Google servers...</span>';

    try {
      const res = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${playerLat},${playerLon}&key=${key}`);
      const data = await res.json();
      if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
        statusEl.innerHTML = '<span style="color:#00ff99; font-weight:700;">🟢 Key Verified & Ready! Street View & Maps APIs are active.</span>';
      } else if (data.status === 'REQUEST_DENIED') {
        if (data.error_message && data.error_message.includes('not activated')) {
          statusEl.innerHTML = `<span style="color:#f6ad55;">🟡 Key recognized! Enable <strong>Maps JavaScript API</strong> in Google Cloud Console:<br><a href="https://console.cloud.google.com/apis/library/maps-backend.googleapis.com" target="_blank" style="color:#00e5ff; text-decoration:underline;">Click here to enable in Google Cloud</a></span>`;
        } else {
          statusEl.innerHTML = `<span style="color:#fc8181;">🔴 Google rejected key: ${data.error_message || 'The provided API key is invalid.'} Check for copy/paste typos.</span>`;
        }
      } else {
        statusEl.innerHTML = `<span style="color:#e2e8f0;">Status: ${data.status}</span>`;
      }
    } catch(err) {
      statusEl.innerHTML = '<span style="color:#a0aec0;">Key set. Full live check will complete when loading Google Maps SDK.</span>';
    }
  }

  function saveGoogleMapsKey() {
    const input = document.getElementById('gmaps-key-input');
    if (input) {
      const key = input.value.trim();
      gmapsApiKey = key;
      localStorage.setItem('gmaps_api_key', key);
      loadGoogleMapsAPI(key, true);
    }
    closeGoogleMapsKeyModal();
  }

  function useDemoMapsKey() {
    loadGoogleMapsAPI('', true);
    selectARMode('realmap');
    closeGoogleMapsKeyModal();
  }

  // ============================================================
  // CAMERA & SENSOR CONTROLS (Live Device Camera AR)
  // ============================================================
  let currentCameraFacing = 'environment';
  let isTorchOn = false;

  async function startCamera() {
    isLiveCameraMode = true;
    const video = document.getElementById('ar-bg-video');
    const procBg = document.getElementById('ar-bg-procedural');

    // ── Mobile HTTPS gate ─────────────────────────────────────────────────────
    // getUserMedia is blocked on plain HTTP on mobile browsers (security policy).
    // localhost is always allowed, but LAN IPs require HTTPS.
    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isSecure && !navigator.mediaDevices) {
      showCameraHttpsPrompt();
      if (procBg) procBg.style.display = 'block';
      return;
    }

    // Show a loading indicator while we wait for permission
    const badge = document.getElementById('ar-gmaps-badge-txt');
    if (badge) badge.textContent = '📷 Requesting camera permission…';

    try {
      if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
      }

      // On mobile we use simpler constraints first — some devices reject ideal resolutions
      const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      const constraints = isMobile
        ? { video: { facingMode: { ideal: currentCameraFacing } } }
        : { video: { facingMode: { ideal: currentCameraFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } } };

      cameraStream = await navigator.mediaDevices.getUserMedia(constraints);

      if (video) {
        video.srcObject = cameraStream;
        video.style.display = 'block';
        await video.play().catch(() => {});
      }
      if (procBg) procBg.style.display = 'none';
      if (badge) badge.textContent = 'Live Device Camera · VPS Active';
      requestOrientationPermission();
    } catch (err) {
      console.warn('[Camera] getUserMedia failed:', err.name, err.message);
      if (video) video.style.display = 'none';

      // NotAllowedError = user denied OR browser blocked (HTTPS needed on mobile)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        if (!isSecure) {
          showCameraHttpsPrompt();
        } else {
          showCameraError('Camera permission denied.\nPlease allow camera access in your browser settings, then try again.');
        }
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        showCameraError('No camera found on this device.');
      } else {
        showCameraError('Camera unavailable: ' + (err.message || err.name));
      }

      if (procBg) procBg.style.display = 'block';
    }
  }

  function showCameraHttpsPrompt() {
    // Build the HTTPS equivalent URL (port 3443)
    const httpsUrl = location.href
      .replace(/^http:\/\//, 'https://')
      .replace(/:(\d+)/, (_, p) => ':3443');

    // Remove any old prompt
    const old = document.getElementById('camera-https-prompt');
    if (old) old.remove();

    const prompt = document.createElement('div');
    prompt.id = 'camera-https-prompt';
    prompt.style.cssText = `
      position:fixed;inset:0;z-index:9999;
      background:rgba(3,3,5,0.95);backdrop-filter:blur(20px);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      gap:18px;padding:32px;text-align:center;
    `;
    prompt.innerHTML = `
      <div style="font-size:3rem;">📷🔒</div>
      <div style="font-size:1.15rem;font-weight:800;color:#fff;max-width:320px;line-height:1.4;">
        Camera needs a secure connection
      </div>
      <div style="font-size:0.85rem;color:rgba(240,240,245,0.7);max-width:300px;line-height:1.5;">
        Your browser blocks camera access on plain HTTP when using a local IP address.
        Open the <strong style="color:#00e5ff;">HTTPS version</strong> of this page instead — your browser will show a security warning, just tap <em>Advanced → Proceed</em>.
      </div>
      <a href="${httpsUrl}" style="
        display:inline-block;padding:14px 28px;border-radius:24px;
        background:linear-gradient(135deg,#1a73e8,#00e5ff);
        color:#fff;font-weight:800;font-size:1rem;text-decoration:none;
        box-shadow:0 4px 20px rgba(0,212,255,0.4);
      ">Open Secure Camera Link →</a>
      <div style="font-size:0.72rem;color:rgba(240,240,245,0.4);">
        Or connect to: <code style="color:#00e5ff;">${httpsUrl}</code>
      </div>
      <button onclick="document.getElementById('camera-https-prompt').remove();selectARMode('realmap');" style="
        background:transparent;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.6);
        border-radius:20px;padding:8px 20px;cursor:pointer;font-size:0.8rem;
      ">Use 3D Map instead</button>
    `;
    document.body.appendChild(prompt);
  }

  function showCameraError(msg) {
    const old = document.getElementById('camera-error-toast');
    if (old) old.remove();
    const toast = document.createElement('div');
    toast.id = 'camera-error-toast';
    toast.style.cssText = `
      position:fixed;bottom:120px;left:50%;transform:translateX(-50%);z-index:9999;
      background:rgba(255,51,102,0.15);border:1px solid rgba(255,51,102,0.4);
      backdrop-filter:blur(16px);border-radius:16px;padding:14px 20px;
      color:#fff;font-size:0.82rem;max-width:320px;text-align:center;
      box-shadow:0 4px 20px rgba(255,51,102,0.25);
    `;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);
  }

  async function flipCamera() {
    currentCameraFacing = currentCameraFacing === 'environment' ? 'user' : 'environment';
    await startCamera();
  }

  async function toggleTorch() {
    if (!cameraStream) return;
    const track = cameraStream.getVideoTracks()[0];
    if (!track) return;
    try {
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (caps.torch) {
        isTorchOn = !isTorchOn;
        await track.applyConstraints({ advanced: [{ torch: isTorchOn }] });
        const icon = document.getElementById('camera-torch-icon');
        if (icon) icon.textContent = isTorchOn ? '🔦' : '💡';
      }
    } catch(e) {}
  }

  async function toggleCameraMode() {
    if (isLiveCameraMode) {
      stopCamera();
      selectARMode('realmap');
    } else {
      selectARMode('camera');
    }
  }

  // Camera AR Nav HUD auto-walk (mirrors toggleAutoWalk but syncs camera HUD button)
  function toggleCamNavAutoWalk() {
    toggleAutoWalk(); // reuse existing logic
    // Sync camera HUD walk button state
    const btn = document.getElementById('cam-nav-walk-btn');
    const icon = document.getElementById('cam-walk-icon');
    if (btn) btn.classList.toggle('walking', isAutoWalking);
    if (icon) icon.textContent = isAutoWalking ? '⏸' : '🚶';
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
    }
    isLiveCameraMode = false;
    const video = document.getElementById('ar-bg-video');
    if (video) { video.srcObject = null; video.style.display = 'none'; }
    const procBg = document.getElementById('ar-bg-procedural');
    if (procBg) procBg.style.display = 'none';
  }

  function setHeading(h) {
    targetHeading = (h + 360) % 360;
  }

  function setPitch(p) {
    targetPitch = Math.max(-60, Math.min(60, p));
  }

  // Pointer & Drag Controls for Look Around
  function setupARLookControls() {
    const section = document.getElementById('gmaps-live-ar');
    if (!section) return;

    section.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || e.target.closest('.ar-minimap-wrap') || e.target.closest('#gmaps-key-modal')) return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      headingAtDragStart = currentHeading;
      pitchAtDragStart = currentPitch;
    });

    window.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      const sensitivityX = 0.22;
      const sensitivityY = 0.18;
      setHeading((headingAtDragStart - dx * sensitivityX + 360) % 360);
      setPitch(pitchAtDragStart + dy * sensitivityY);
    });

    window.addEventListener('pointerup', () => { isDragging = false; });
  }

  // Device Orientation Gyroscope
  async function requestOrientationPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res === 'granted') listenOrientation();
      } catch(e) {}
    } else {
      listenOrientation();
    }
  }

  let hasRealCompass = false;

  function listenOrientation() {
    window.addEventListener('deviceorientation', (e) => {
      if (!isArActive || isDragging) return;
      // Only bind sensor motion on touch mobile devices with genuine compass to prevent desktop laptop jitter
      const isTouchMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 1);
      if (!isTouchMobile) return;

      if (e.webkitCompassHeading !== undefined && e.webkitCompassHeading !== null) {
        hasRealCompass = true;
        setHeading(e.webkitCompassHeading);
      } else if (hasRealCompass && e.alpha !== null) {
        setHeading(360 - e.alpha);
      }
      if (e.beta !== null) {
        setPitch(e.beta - 55);
      }
    });
  }

  // ============================================================
  // FIRST-PERSON WALKING SIMULATION & GOOGLE MAPS POSITION SYNC
  // ============================================================
  function walkForward(meters = 2.5) {
    AudioManager.playStep();
    if (originLat === null) { originLat = playerLat; originLon = playerLon; }
    const rad = (currentHeading * Math.PI) / 180;
    const dLat = (meters * Math.cos(rad)) / 111139;
    const dLon = (meters * Math.sin(rad)) / (111139 * Math.cos((playerLat * Math.PI) / 180));
    playerLat += dLat;
    playerLon += dLon;
    recalcBearingAndDist();
    syncMapToState();
    syncStreetViewPosition(playerLat, playerLon);
    pushPositionToServer();
    checkProximityTrigger(destinationDist);
  }

  function toggleAutoWalk() {
    const btn = document.getElementById('ar-walk-btn');
    const txt = document.getElementById('walk-txt');
    const icon = document.getElementById('walk-icon');
    isAutoWalking = !isAutoWalking;

    if (isAutoWalking) {
      if (btn) btn.classList.add('walking');
      if (txt) txt.textContent = 'Pause Walk';
      if (icon) icon.textContent = '⏸';
      autoWalkInterval = setInterval(() => {
        const stepDist = 1.4; // 1.4m per tick (~1.4m/s)
        const rad = (destinationBearing * Math.PI) / 180;
        const dLat = (stepDist * Math.cos(rad)) / 111139;
        const dLon = (stepDist * Math.sin(rad)) / (111139 * Math.cos((playerLat * Math.PI) / 180));
        playerLat += dLat;
        playerLon += dLon;
        recalcBearingAndDist();
        syncMapToState();
        syncStreetViewPosition(playerLat, playerLon);
        pushPositionToServer();
        checkProximityTrigger(destinationDist);
        if (destinationDist <= 12) {
          toggleAutoWalk();
        }
      }, 500);
    } else {
      if (btn) btn.classList.remove('walking');
      if (txt) txt.textContent = 'Walk to Match';
      if (icon) icon.textContent = '🚶';
      if (autoWalkInterval) { clearInterval(autoWalkInterval); autoWalkInterval = null; }
    }
  }

  // Keyboard Navigation Controls
  document.addEventListener('keydown', (e) => {
    if (!isArActive) return;
    if (e.key === 'w' || e.key === 'W') walkForward(3.2);
    else if (e.key === 's' || e.key === 'S') walkForward(-3.2);
    else if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') setHeading((currentHeading - 5 + 360) % 360);
    else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') setHeading((currentHeading + 5) % 360);
    else if (e.key === 'ArrowUp' || e.key === 'r' || e.key === 'R') setPitch(currentPitch + 4);
    else if (e.key === 'ArrowDown' || e.key === 'f' || e.key === 'F') setPitch(currentPitch - 4);
    else if (e.key === ' ' || e.key === 'Home') setPitch(0);
  });

  // ============================================================
  // AR TOGGLE & MAIN ANIMATION LOOP
  // ============================================================
  async function toggleLiveARMode() {
    isArActive = !isArActive;
    const panel = document.getElementById('gmaps-live-ar');
    const bottomSheet = document.getElementById('ar-sheet');

    if (isArActive) {
      panel.classList.add('active');
      if (bottomSheet) bottomSheet.classList.add('active');
      if (originLat === null) { originLat = playerLat; originLon = playerLon; }

      // Load Google Maps JavaScript API for Live View
      loadGoogleMapsAPI(gmapsApiKey);

      setTimeout(() => {
        initPipMap();
        updatePipMap();
        initRealMap3D();
        initThreeAR();
        selectARMode(currentARMode || 'realmap');
      }, 150);

      startGPS();
      await requestOrientationPermission();

      triggerVPSCalibration();
    } else {
      panel.classList.remove('active');
      if (bottomSheet) bottomSheet.classList.remove('active');
      stopCamera();
      stopGPS();
      if (isAutoWalking) toggleAutoWalk();
    }
  }

  // Smooth Render Loop
  function startARAnimationLoop() {
    function animate() {
      // Smooth heading damping
      const diffH = shortestAngleDiff(targetHeading, currentHeading);
      currentHeading = (currentHeading + diffH * 0.18 + 360) % 360;
      smoothedHeading = currentHeading;

      // Smooth pitch damping
      currentPitch += (targetPitch - currentPitch) * 0.18;
      smoothedPitch = currentPitch;

      if (isArActive) {
        const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const dirName = dirs[Math.round(smoothedHeading / 45) % 8];
        const pitchText = Math.abs(smoothedPitch) < 3 ? 'Horizon' : (smoothedPitch > 0 ? `+${Math.round(smoothedPitch)}° Up` : `${Math.round(smoothedPitch)}° Down`);
        const el = document.getElementById('ar-heading-label');
        if (el) el.textContent = `${Math.round(smoothedHeading)}° ${dirName} · ${pitchText}`;

        // Sync Street View & Satellite POV
        syncStreetViewPOV(smoothedHeading, smoothedPitch);

        // Sync MapLibre 3D Real Map if in realmap mode
        if (currentARMode === 'realmap') {
          syncRealMap3DPosition(playerLat, playerLon, smoothedHeading, smoothedPitch);
        }

        // Render AR Spatial Overlays directly on top of Google Maps
        renderLiveARView(smoothedHeading);

        // Render Three.js if in Cyber mode
        if (currentARMode === 'cyber') {
          renderThreeARFrame(smoothedHeading);
        }
      }

      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  }

  // ============================================================
  // GPS & LOCATION TRACKING
  // ============================================================
  function startGPS() {
    if (!navigator.geolocation) return;
    gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        playerLat = pos.coords.latitude;
        playerLon = pos.coords.longitude;
        hasRealGPS = true;
        syncMapToState();
        recalcBearingAndDist();
        pushPositionToServer();
        checkProximityTrigger(destinationDist);
      },
      (err) => console.warn('GPS error:', err),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
  }

  function stopGPS() {
    if (gpsWatchId !== null) {
      navigator.geolocation.clearWatch(gpsWatchId);
      gpsWatchId = null;
    }
  }

  // ============================================================
  // PROXIMITY & ARRIVAL CELEBRATION
  // ============================================================
  function checkProximityTrigger(d) {
    if (d <= 15 && !hasCelebratedArrival && isArActive) {
      triggerArrivalCelebration();
    }
  }

  let audioCtx = null;
  function playCelebrationSound() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const now = audioCtx.currentTime;
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
        const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0, now + idx * 0.12);
        gain.gain.linearRampToValueAtTime(0.25, now + idx * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.35);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.4);
      });
    } catch(e) {}
  }

  function launchConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d'), parts = [], colors = ['#00ff99', '#00d4ff', '#ffd700', '#ff3366', '#a855f7'];
    for (let i = 0; i < 80; i++) {
      parts.push({
        x: canvas.width / 2, y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 16, vy: (Math.random() - 0.7) * 16 - 2,
        size: Math.random() * 8 + 4, color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * 360, rotSpeed: (Math.random() - 0.5) * 10, alpha: 1
      });
    }
    const st = Date.now();
    function frame() {
      const el = Date.now() - st;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      parts.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.35;
        p.rot += p.rotSpeed;
        p.alpha = Math.max(0, 1 - el / 2500);
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot * Math.PI / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });
      if (el < 2500) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(frame);
  }

  function triggerArrivalCelebration() {
    hasCelebratedArrival = true;
    playCelebrationSound();
    launchConfetti();
    const cel = document.getElementById('ar-celebration');
    if (cel) {
      document.getElementById('cel-badge').textContent = `${currentAmbition.word1} · ${currentAmbition.word2} MATCH`;
      document.getElementById('cel-avatar').textContent = activeMatch.avatar || '🏌️';
      document.getElementById('cel-name').textContent = activeMatch.name;
      document.getElementById('cel-ambition').textContent = `${currentAmbition.word1} ${currentAmbition.word2}`;
      cel.classList.add('active');
      AudioManager.playArrival();
    }
  }

  function dismissCelebration() {
    const cel = document.getElementById('ar-celebration');
    if (cel) cel.classList.remove('active');
  }

  
  // ============================================================
  // PROCEDURAL WEB AUDIO SYNTHESIZER (ZERO EXTERNAL MP3s)
  // ============================================================
  const AudioManager = {
    ctx: null,
    isMuted: false,
    init() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    },
    playTone(freq, duration, type = 'sine', gainVal = 0.12) {
      if (this.isMuted) return;
      try {
        this.init();
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
      } catch(e) {}
    },
    playStep() {
      this.playTone(160, 0.05, 'triangle', 0.04);
    },
    playManeuver() {
      this.playTone(523.25, 0.10, 'sine', 0.14); // C5
      setTimeout(() => this.playTone(659.25, 0.16, 'sine', 0.12), 90); // E5
    },
    playArrival() {
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        setTimeout(() => this.playTone(freq, 0.35, 'triangle', 0.18), i * 110);
      });
    },
    playXpClaim() {
      [659.25, 783.99, 987.77, 1318.51].forEach((freq, i) => {
        setTimeout(() => this.playTone(freq, 0.28, 'sine', 0.16), i * 80);
      });
    },
    toggleMute() {
      this.isMuted = !this.isMuted;
      const el = document.getElementById('audio-icon');
      if (el) el.textContent = this.isMuted ? '🔇' : '🔊';
      return this.isMuted;
    }
  };

  function toggleAudioMute() {
    AudioManager.toggleMute();
  }

  // ============================================================
  // GAMIFICATION & XP PROGRESSION SYSTEM
  // ============================================================
  let playerXP = 350;
  let playerLevel = 1;
  const levelNames = ['Street Scout', 'Urban Explorer', 'Metro Navigator', 'Master Pathfinder'];

  function updatePlayerLevelUI() {
    const fill = document.querySelector('.xp-fill');
    const levelIdx = Math.min(levelNames.length - 1, Math.floor(playerXP / 500));
    playerLevel = levelIdx + 1;
    const progressInLevel = (playerXP % 500) / 500;
    if (fill) fill.style.width = Math.max(15, Math.min(100, Math.round(progressInLevel * 100))) + '%';
    const locLabel = document.getElementById('xp-loc-label');
    if (locLabel) {
      locLabel.innerHTML = `<span class="loc-dot"></span> Oakland, CA • Lv.${playerLevel} ${levelNames[levelIdx]} (${playerXP} XP)`;
    }
  }

  function showFloatingXPNotification(amount, sub) {
    const toast = document.createElement('div');
    toast.className = 'xp-toast';
    toast.innerHTML = `✨ ${amount} · ${sub}`;
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 2300);
  }

  // ============================================================
  // CHAT SYSTEM & MESSAGING
  // ============================================================
  let localChatMessages = [
    {
      id: 'm1',
      sender: 'Alex M.',
      avatar: '🏌️',
      text: "Hey! Glad you're heading this way. I'm right near Broadway & 15th with my clubs.",
      timestamp: Date.now() - 120000
    }
  ];

  function openChatModal(targetMatch = null) {
    const target = targetMatch || activeMatch;
    const avatarEl = document.getElementById('chat-header-avatar');
    const nameEl = document.getElementById('chat-header-name');
    const subEl = document.getElementById('chat-header-sub');
    if (avatarEl) avatarEl.textContent = target.avatar || '🏌️';
    if (nameEl) nameEl.textContent = target.name || 'Alex M.';
    if (subEl) subEl.textContent = `Online · ${target.avatar || '🎯'} ${target.words || currentAmbition.word1 + ' ' + currentAmbition.word2} · Oakland, CA`;

    renderChatMessages();
    const modal = document.getElementById('chat-modal');
    if (modal) modal.classList.add('active');
    setTimeout(() => {
      const input = document.getElementById('chat-input');
      if (input) input.focus();
    }, 150);
  }

  function openChatFromCelebration() {
    dismissCelebration();
    openChatModal();
  }

  function closeChatModal() {
    const modal = document.getElementById('chat-modal');
    if (modal) modal.classList.remove('active');
  }

  function renderChatMessages() {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;
    container.innerHTML = '';
    localChatMessages.forEach(msg => {
      const isMe = msg.sender === 'You';
      const div = document.createElement('div');
      div.className = `chat-msg ${isMe ? 'me' : 'them'}`;
      const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      div.innerHTML = `<div>${escapeHtml(msg.text)}</div><div class="chat-msg-time">${timeStr}</div>`;
      container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
  }

  function sendChatMessage(text = null) {
    const input = document.getElementById('chat-input');
    const msgText = (text || (input ? input.value : '')).trim();
    if (!msgText) return;
    if (input) input.value = '';

    AudioManager.playTone(440, 0.08, 'sine', 0.1);
    const newMsg = {
      id: 'm_' + Date.now(),
      sender: 'You',
      avatar: '🎯',
      text: msgText,
      timestamp: Date.now()
    };
    localChatMessages.push(newMsg);
    renderChatMessages();

    // Broadcast over WebSocket if open
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'CHAT_MESSAGE', ...newMsg }));
    }

    // Realistic auto-reply simulation
    simulateMatchReply(msgText);
  }

  function sendQuickReply(text) {
    sendChatMessage(text);
  }

  function simulateMatchReply(userText) {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;
    const typing = document.createElement('div');
    typing.className = 'chat-typing';
    typing.id = 'chat-typing-indicator';
    typing.textContent = `${activeMatch.name} is typing...`;
    container.appendChild(typing);
    container.scrollTop = container.scrollHeight;

    setTimeout(() => {
      const typingEl = document.getElementById('chat-typing-indicator');
      if (typingEl) typingEl.remove();

      let reply = "Sounds fantastic! Looking forward to it.";
      const lower = userText.toLowerCase();
      if (lower.includes('golf') || lower.includes('play')) {
        reply = "Awesome! The Oakland City Center indoor golf simulator has a bay open, or we can hit the driving range by Lake Merritt. Ready when you are!";
      } else if (lower.includes('coffee') || lower.includes('drink')) {
        reply = "Great call, Modern Coffee is right on 13th! Let's meet on their patio.";
      } else if (lower.includes('arrived') || lower.includes('broadway')) {
        reply = "I see your GPS pin right here! Standing right outside the building entrance.";
      }

      const replyMsg = {
        id: 'm_' + Date.now(),
        sender: activeMatch.name || 'Alex M.',
        avatar: activeMatch.avatar || '🏌️',
        text: reply,
        timestamp: Date.now()
      };
      localChatMessages.push(replyMsg);
      renderChatMessages();
      AudioManager.playTone(587.33, 0.12, 'sine', 0.12);
    }, 1400);
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ============================================================
  // MATCHES LIST MODAL & TARGETING
  // ============================================================
  function openMatchesModal() {
    renderMatchesList();
    const modal = document.getElementById('matches-modal');
    if (modal) modal.classList.add('active');
  }

  function closeMatchesModal() {
    const modal = document.getElementById('matches-modal');
    if (modal) modal.classList.remove('active');
  }

  function renderMatchesList() {
    const container = document.getElementById('matches-list-container');
    if (!container) return;
    container.innerHTML = '';

    const list = nearbyMatches.length > 0 ? nearbyMatches : [
      { name: 'Alex M.', avatar: '🏌️', words: 'PLAY · GOLF', lat: 37.8075, lon: -122.2680, dist: 251 },
      { name: 'Elena R.', avatar: '🍜', words: 'EAT · RAMEN', lat: 37.8062, lon: -122.2740, dist: 380 },
      { name: 'Marcus K.', avatar: '☕', words: 'FIND · COFFEE', lat: 37.8020, lon: -122.2725, dist: 420 }
    ];

    list.forEach((m, idx) => {
      const isTarget = (activeMatch && activeMatch.name === m.name);
      const card = document.createElement('div');
      card.className = `match-item-card ${isTarget ? 'is-active-target' : ''}`;
      card.innerHTML = `
        <div class="match-item-left">
          <div class="match-item-avatar">${m.avatar || '🎯'}</div>
          <div>
            <div class="match-item-name">${m.name} ${isTarget ? '• <span style="color:#00ff99; font-size:0.75rem;">Active Target</span>' : ''}</div>
            <div class="match-item-ambition">${m.words}</div>
            <div class="match-item-dist">${fmtDist(m.dist || haversineDistance(playerLat, playerLon, m.lat, m.lon))} away</div>
          </div>
        </div>
        <div class="match-item-actions">
          <button class="match-act-btn match-act-chat" onclick="closeMatchesModal(); openChatModal(nearbyMatches[${idx}] || {name:'${m.name}', avatar:'${m.avatar}', words:'${m.words}'});">💬 Chat</button>
          <button class="match-act-btn match-act-nav" onclick="targetMatchFromList(${idx})">${isTarget ? 'Targeted' : 'Navigate'}</button>
        </div>
      `;
      container.appendChild(card);
    });
  }

  function targetMatchFromList(idx) {
    if (nearbyMatches && nearbyMatches[idx]) {
      activeMatch = nearbyMatches[idx];
      destLat = activeMatch.lat;
      destLon = activeMatch.lon;
      const parts = (activeMatch.words || 'PLAY GOLF').split('·').map(s => s.trim());
      if (parts.length >= 2) {
        currentAmbition = { word1: parts[0], word2: parts[1] };
      }
      recalcBearingAndDist();
      syncMapToState();
      build3DDestinationBeacon();
      closeMatchesModal();
      showFloatingXPNotification('Target Set', `Navigating to ${activeMatch.name}`);
      AudioManager.playManeuver();
    }
  }

  function claimDiscoveryReward() {
    dismissCelebration();
    playerXP += 100;
    AudioManager.playXpClaim();
    updatePlayerLevelUI();
    showFloatingXPNotification('+100 XP', 'Discovery Claimed! 🎉');
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'ITEM_COLLECTED',
        item: { id: 'match_reached', type: 'DISCOVERY_REWARD', xp: 100, title: `Reached ${activeMatch.name}` },
        score: playerXP,
        level: playerLevel
      }));
    }
  }

  // ============================================================
  // AMBITION MODAL & NEARBY MATCH GENERATION
  // ============================================================
  function openAmbitionModal() {
    document.getElementById('amb-word1').value = currentAmbition.word1;
    document.getElementById('amb-word2').value = currentAmbition.word2;
    document.getElementById('ambition-modal').classList.add('active');
  }

  function closeAmbitionModal() {
    document.getElementById('ambition-modal').classList.remove('active');
  }

  function selectPreset(w1, w2) {
    document.getElementById('amb-word1').value = w1;
    document.getElementById('amb-word2').value = w2;
    document.querySelectorAll('.preset-chip').forEach(chip => {
      chip.classList.toggle('active', chip.textContent.includes(w1) && chip.textContent.includes(w2));
    });
  }

  const avatarPool = { 'GOLF': '🏌️', 'RAMEN': '🍜', 'PIANO': '🎹', 'COFFEE': '☕', 'TRAIL': '🥾', 'APPS': '💻' };
  const namesPool = ['Alex M.', 'Elena R.', 'Marcus K.', 'Chloe T.', 'Liam D.', 'Sarah J.'];

  function generateNearbyMatches(w1, w2) {
    nearbyMatches = [];
    const mainAvatar = avatarPool[w2] || '🎯';
    for (let i = 0; i < 3; i++) {
      const angle = (Math.PI * 2 * i / 3) + 0.4;
      const distOffset = 0.0025 + Math.random() * 0.003;
      const mLat = playerLat + Math.cos(angle) * distOffset;
      const mLon = playerLon + Math.sin(angle) * distOffset;
      nearbyMatches.push({
        name: namesPool[i % namesPool.length],
        avatar: mainAvatar,
        words: `${w1} · ${w2}`,
        lat: mLat,
        lon: mLon,
        dist: haversineDistance(playerLat, playerLon, mLat, mLon)
      });
    }
    nearbyMatches.sort((a, b) => a.dist - b.dist);
    activeMatch = nearbyMatches[0];
    destLat = activeMatch.lat;
    destLon = activeMatch.lon;

    if (map) {
      nearbyMapMarkers.forEach(m => map.removeLayer(m));
      nearbyMapMarkers = [];
      nearbyMatches.forEach((match, idx) => {
        const isPrimary = (idx === 0);
        const marker = L.circleMarker([match.lat, match.lon], {
          radius: isPrimary ? 11 : 7,
          color: isPrimary ? '#00ff99' : '#00e5ff',
          fillColor: isPrimary ? '#00ff99' : '#00e5ff',
          fillOpacity: 0.85, weight: 2
        }).addTo(map).bindPopup(`<strong>${match.name}</strong><br>${match.words}`);
        nearbyMapMarkers.push(marker);
      });
      if (destMarker) destMarker.setLatLng([destLat, destLon]);
      if (routeLine) routeLine.setLatLngs([[playerLat, playerLon], [destLat, destLon]]);
      map.panTo([playerLat, playerLon]);
    }
    recalcBearingAndDist();
    syncAmbitionToBackend(w1, w2);
  }

  async function syncAmbitionToBackend(w1, w2) {
    try {
      await fetch('/api/ambitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ words: `${w1} ${w2}` })
      });
    } catch(e) {}
  }

  function saveAmbition() {
    const w1 = (document.getElementById('amb-word1').value || 'PLAY').trim().toUpperCase();
    const w2 = (document.getElementById('amb-word2').value || 'GOLF').trim().toUpperCase();
    currentAmbition.word1 = w1;
    currentAmbition.word2 = w2;
    hasCelebratedArrival = false;
    document.getElementById('xp-words').textContent = `${w1} · ${w2}`;
    closeAmbitionModal();
    generateNearbyMatches(w1, w2);
  }

  // ============================================================
  // INTRO SCREEN — Two Words Entry & Destination Resolution
  // ============================================================

  const TW_PROMPTS = [
    'two words',
    'enter two words',
    'your two words',
    'two words',
    'enter your two words',
    'two words',
  ];

  // Semantic tag map: a word (or stem) → Overpass OSM tags to search nearby
  const TW_WORD_TAG_MAP = {
    // Activity / Sport
    golf: [{ k: 'leisure', v: 'golf_course' }, { k: 'leisure', v: 'miniature_golf' }],
    play: [{ k: 'leisure', v: 'playground' }, { k: 'leisure', v: 'park' }, { k: 'leisure', v: 'sports_centre' }],
    run: [{ k: 'leisure', v: 'track' }, { k: 'leisure', v: 'running_track' }, { k: 'highway', v: 'path' }],
    swim: [{ k: 'leisure', v: 'swimming_pool' }, { k: 'leisure', v: 'water_park' }],
    climb: [{ k: 'leisure', v: 'climbing' }, { k: 'sport', v: 'climbing' }],
    yoga: [{ k: 'leisure', v: 'fitness_centre' }, { k: 'sport', v: 'yoga' }],
    dance: [{ k: 'leisure', v: 'dance' }, { k: 'amenity', v: 'community_centre' }],
    skate: [{ k: 'leisure', v: 'skatepark' }, { k: 'sport', v: 'skateboard' }],
    surf: [{ k: 'sport', v: 'surfing' }, { k: 'natural', v: 'beach' }],
    hike: [{ k: 'highway', v: 'path' }, { k: 'leisure', v: 'nature_reserve' }],
    bike: [{ k: 'highway', v: 'cycleway' }, { k: 'amenity', v: 'bicycle_rental' }],
    // Creative
    music: [{ k: 'amenity', v: 'music_venue' }, { k: 'amenity', v: 'studio' }],
    art: [{ k: 'tourism', v: 'gallery' }, { k: 'amenity', v: 'arts_centre' }],
    write: [{ k: 'amenity', v: 'library' }, { k: 'amenity', v: 'cafe' }],
    code: [{ k: 'amenity', v: 'hackerspace' }, { k: 'amenity', v: 'coworking_space' }],
    create: [{ k: 'amenity', v: 'arts_centre' }, { k: 'leisure', v: 'studio' }],
    build: [{ k: 'amenity', v: 'hackerspace' }, { k: 'craft', v: 'workshop' }],
    film: [{ k: 'amenity', v: 'cinema' }, { k: 'tourism', v: 'attraction' }],
    // Social / Life
    eat: [{ k: 'amenity', v: 'restaurant' }, { k: 'amenity', v: 'food_court' }],
    coffee: [{ k: 'amenity', v: 'cafe' }],
    drink: [{ k: 'amenity', v: 'bar' }, { k: 'amenity', v: 'pub' }],
    shop: [{ k: 'shop', v: 'mall' }, { k: 'shop', v: 'marketplace' }],
    read: [{ k: 'amenity', v: 'library' }, { k: 'amenity', v: 'bookstore' }],
    learn: [{ k: 'amenity', v: 'college' }, { k: 'amenity', v: 'university' }, { k: 'amenity', v: 'library' }],
    teach: [{ k: 'amenity', v: 'school' }, { k: 'amenity', v: 'university' }],
    heal: [{ k: 'amenity', v: 'hospital' }, { k: 'amenity', v: 'clinic' }, { k: 'leisure', v: 'spa' }],
    meditate: [{ k: 'amenity', v: 'place_of_worship' }, { k: 'leisure', v: 'park' }],
    peace: [{ k: 'leisure', v: 'park' }, { k: 'leisure', v: 'garden' }],
    grow: [{ k: 'leisure', v: 'garden' }, { k: 'landuse', v: 'farmland' }],
    cook: [{ k: 'amenity', v: 'restaurant' }, { k: 'amenity', v: 'fast_food' }],
    pray: [{ k: 'amenity', v: 'place_of_worship' }],
    // Nature
    nature: [{ k: 'leisure', v: 'nature_reserve' }, { k: 'leisure', v: 'park' }],
    water: [{ k: 'natural', v: 'water' }, { k: 'natural', v: 'bay' }],
    mountain: [{ k: 'natural', v: 'peak' }, { k: 'leisure', v: 'nature_reserve' }],
    forest: [{ k: 'landuse', v: 'forest' }, { k: 'leisure', v: 'nature_reserve' }],
    beach: [{ k: 'natural', v: 'beach' }],
    // Fallback
    live: [{ k: 'amenity', v: 'community_centre' }, { k: 'leisure', v: 'park' }],
    feel: [{ k: 'leisure', v: 'park' }, { k: 'tourism', v: 'viewpoint' }],
    find: [{ k: 'tourism', v: 'attraction' }, { k: 'leisure', v: 'park' }],
    see: [{ k: 'tourism', v: 'viewpoint' }, { k: 'tourism', v: 'museum' }],
  };

  function twWordsToOSMTags(w1, w2) {
    const normalize = w => w.toLowerCase().replace(/s$/, '').replace(/ing$/, '').replace(/er$/, '');
    const tags = [];
    [w1, w2].forEach(w => {
      const n = normalize(w);
      const found = TW_WORD_TAG_MAP[n] || TW_WORD_TAG_MAP[w.toLowerCase()];
      if (found) tags.push(...found);
    });
    // Deduplicate
    const seen = new Set();
    return tags.filter(t => {
      const key = t.k + '=' + t.v;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function resolveDestinationFromWords(w1, w2, lat, lon) {
    const tags = twWordsToOSMTags(w1, w2);
    const radius = 3000; // 3km search radius

    if (tags.length === 0) {
      // Unknown words: fall back to a nearby park
      tags.push({ k: 'leisure', v: 'park' });
    }

    // Build Overpass QL query
    const tagQueries = tags.slice(0, 4).map(t =>
      `node["${t.k}"="${t.v}"](around:${radius},${lat},${lon});\nway["${t.k}"="${t.v}"](around:${radius},${lat},${lon});`
    ).join('\n');

    const query = `[out:json][timeout:12];\n(\n${tagQueries}\n);\nout center 20;`;

    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      const data = await res.json();
      const elements = data.elements || [];

      if (elements.length === 0) {
        // No POI found — return a random nearby point
        const angle = Math.random() * Math.PI * 2;
        const d = 0.002 + Math.random() * 0.003;
        return {
          lat: lat + Math.cos(angle) * d,
          lon: lon + Math.sin(angle) * d,
          name: `${w1} ${w2} Destination`,
          type: 'generated',
        };
      }

      // Score by distance, pick the closest
      const scored = elements.map(el => {
        const eLat = el.lat || el.center?.lat || lat;
        const eLon = el.lon || el.center?.lon || lon;
        const dist = haversineDistance(lat, lon, eLat, eLon);
        const name = el.tags?.name || el.tags?.['name:en'] || `${w1} ${w2} Place`;
        return { lat: eLat, lon: eLon, name, dist, tags: el.tags };
      }).filter(e => e.dist > 20); // Ignore spots right under the player

      scored.sort((a, b) => a.dist - b.dist);
      const best = scored[0];

      return {
        lat: best.lat,
        lon: best.lon,
        name: best.name,
        type: 'osm',
        dist: best.dist,
      };
    } catch (err) {
      console.warn('Overpass lookup failed, using fallback:', err);
      const angle = Math.random() * Math.PI * 2;
      const d = 0.002 + Math.random() * 0.003;
      return {
        lat: lat + Math.cos(angle) * d,
        lon: lon + Math.sin(angle) * d,
        name: `${w1} ${w2} Destination`,
        type: 'fallback',
      };
    }
  }

  async function submitTwoWords() {
    const w1El = document.getElementById('tw-w1');
    const w2El = document.getElementById('tw-w2');
    const w1 = (w1El ? w1El.value.trim() : '').toUpperCase() || 'PLAY';
    const w2 = (w2El ? w2El.value.trim() : '').toUpperCase() || 'GOLF';

    if (!w1 || !w2) return;

    // Show loading
    const goBtn = document.getElementById('tw-go-btn');
    const loadingDots = document.getElementById('tw-loading-dots');
    const goLabel = document.getElementById('tw-go-label');
    if (goBtn) goBtn.style.display = 'none';
    if (loadingDots) loadingDots.classList.add('active');

    // Save to state + localStorage
    currentAmbition.word1 = w1;
    currentAmbition.word2 = w2;
    localStorage.setItem('tw_word1', w1);
    localStorage.setItem('tw_word2', w2);
    const xpWords = document.getElementById('xp-words');
    if (xpWords) xpWords.textContent = `${w1} · ${w2}`;

    // Resolve real-world destination
    let destResult = null;
    try {
      destResult = await resolveDestinationFromWords(w1, w2, playerLat, playerLon);
    } catch (e) {
      destResult = {
        lat: playerLat + 0.002,
        lon: playerLon + 0.003,
        name: `${w1} ${w2}`,
        type: 'fallback'
      };
    }

    // Apply destination
    destLat = destResult.lat;
    destLon = destResult.lon;
    activeMatch.name = destResult.name;
    activeMatch.avatar = '🎯';
    activeMatch.words = `${w1} · ${w2}`;

    // Update maps if ready
    if (map) {
      if (destMarker) destMarker.setLatLng([destLat, destLon]);
      if (routeLine) routeLine.setLatLngs([[playerLat, playerLon], [destLat, destLon]]);
    }
    recalcBearingAndDist();
    syncAmbitionToBackend(w1, w2);

    // Dissolve intro → reveal app
    const intro = document.getElementById('tw-intro');
    if (intro) intro.classList.add('tw-dissolve');

    // After dissolve, clean up and launch AR
    setTimeout(() => {
      if (intro) intro.remove();
      // Auto-open AR mode so they're immediately navigating
      toggleLiveARMode();
    }, 950);
  }

  function runIntroSequence() {
    const saved1 = localStorage.getItem('tw_word1');
    const saved2 = localStorage.getItem('tw_word2');

    // If player already has words, skip the full intro
    if (saved1 && saved2) {
      currentAmbition.word1 = saved1.toUpperCase();
      currentAmbition.word2 = saved2.toUpperCase();
      const xpWords = document.getElementById('xp-words');
      if (xpWords) xpWords.textContent = `${currentAmbition.word1} · ${currentAmbition.word2}`;
      generateNearbyMatches(currentAmbition.word1, currentAmbition.word2);

      // Brief black flash → dissolve fast
      const intro = document.getElementById('tw-intro');
      setTimeout(() => {
        if (intro) intro.classList.add('tw-dissolve');
        setTimeout(() => { if (intro) intro.remove(); }, 900);
      }, 600);
      return;
    }

    // Phase 1: Blink cursor for 1.2s, then start flashing prompts
    const promptEl = document.getElementById('tw-flash-prompt');
    let pIdx = 0;
    let phase1Timer;

    function showNextPrompt() {
      if (!promptEl) return;
      promptEl.classList.remove('tw-visible');
      setTimeout(() => {
        promptEl.textContent = TW_PROMPTS[pIdx % TW_PROMPTS.length];
        promptEl.classList.add('tw-visible');
        pIdx++;
      }, 420);
    }

    // Start flashing after 1.2s
    setTimeout(() => {
      showNextPrompt();
      phase1Timer = setInterval(showNextPrompt, 1600);
    }, 1200);

    // Transition to input on click / touch / keypress
    function advanceToInput() {
      clearInterval(phase1Timer);
      const cursorPhase = document.getElementById('tw-cursor-phase');
      const inputPhase = document.getElementById('tw-input-phase');
      if (cursorPhase) cursorPhase.style.display = 'none';
      if (inputPhase) { inputPhase.style.display = 'flex'; }

      // Auto-focus first word after a short delay
      setTimeout(() => {
        const w1El = document.getElementById('tw-w1');
        if (w1El) w1El.focus();
      }, 80);

      // Wire up Enter key in input fields
      ['tw-w1', 'tw-w2'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('keydown', e => {
          if (e.key === 'Enter') submitTwoWords();
        });
        // Make GO button glow when both fields have content
        el.addEventListener('input', () => {
          const w1 = document.getElementById('tw-w1');
          const w2 = document.getElementById('tw-w2');
          const btn = document.getElementById('tw-go-btn');
          if (btn) btn.classList.toggle('tw-ready', !!(w1?.value.trim() && w2?.value.trim()));
          // Auto-advance from word1 → word2
          if (id === 'tw-w1' && el.value.length >= el.maxLength) {
            const w2El = document.getElementById('tw-w2');
            if (w2El) w2El.focus();
          }
        });
      });

      // Tab: word1 → word2
      const w1El = document.getElementById('tw-w1');
      if (w1El) {
        w1El.addEventListener('keydown', e => {
          if (e.key === 'Tab') {
            e.preventDefault();
            document.getElementById('tw-w2')?.focus();
          }
        });
      }

      // Remove the listener after advancing
      document.removeEventListener('click', advanceToInput);
      document.removeEventListener('keydown', advanceToInput);
    }

    // Click anywhere or press any key to advance to input
    setTimeout(() => {
      document.addEventListener('click', advanceToInput);
      document.addEventListener('keydown', advanceToInput, { once: false });
    }, 800);
  }

  // ============================================================
  // INITIALIZATION ON PAGE LOAD
  // ============================================================
  window.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupARLookControls();
    startARAnimationLoop();
    // Start the intro sequence
    runIntroSequence();
  });

  window.addEventListener('resize', () => {
    const overlay = document.getElementById('ar-overlay-canvas');
    if (overlay) { overlay.width = window.innerWidth; overlay.height = window.innerHeight; }
    const bg = document.getElementById('ar-bg-procedural');
    if (bg) { bg.width = window.innerWidth; bg.height = window.innerHeight; }
    if (map) map.invalidateSize();
    if (pipMap) pipMap.invalidateSize();
  });
  // ============================================================
  // TWO WORDS UNIVERSE — Digital Immersion Panel
  // ============================================================

  let universeCurrentTab = 'all';
  let universeLoaded = false;
  let universeData = { videos: [], images: [], places: [], knowledge: null };

  // Icon map for place categories
  const TWU_PLACE_ICONS = {
    golf_course: '⛳', park: '🌳', library: '📚', cafe: '☕', gym: '🏋️',
    cinema: '🎬', museum: '🏛️', gallery: '🖼️', beach: '🏖️', restaurant: '🍽️',
    swimming_pool: '🏊', climbing: '🧗', yoga: '🧘', skatepark: '🛹',
    nature_reserve: '🌿', hackerspace: '💻', studio: '🎨', community_centre: '🏢',
    university: '🎓', school: '📐', hospital: '🏥', bar: '🍺', viewpoint: '🔭',
    default: '📍'
  };

  function twuPlaceIcon(tags) {
    if (!tags) return TWU_PLACE_ICONS.default;
    for (const key of Object.keys(TWU_PLACE_ICONS)) {
      if (tags.leisure === key || tags.amenity === key || tags.tourism === key ||
          tags.sport === key || tags.shop === key) return TWU_PLACE_ICONS[key];
    }
    return TWU_PLACE_ICONS.default;
  }

  function openUniversePanel() {
    const panel = document.getElementById('tw-universe') || document.getElementById('universe-panel');
    if (!panel) return;
    panel.classList.add('open');
    panel.style.display = 'flex';

    // Update header words
    const w1 = (currentAmbition && currentAmbition.word1) || 'PLAY';
    const w2 = (currentAmbition && currentAmbition.word2) || 'GOLF';
    const titleEl = document.getElementById('twu-title-words');
    const liveEl = document.getElementById('twu-live-words');
    if (titleEl) titleEl.textContent = `${w1} · ${w2}`;
    if (liveEl) liveEl.textContent = `${w1} · ${w2}`;

    // Activate Universe nav tab
    document.querySelectorAll('.nb').forEach(el => el.classList.remove('active'));
    document.getElementById('nb-universe')?.classList.add('active');

    // Load content if not loaded yet or words changed
    loadUniverseContent(w1, w2);
  }

  function closeUniversePanel() {
    const panel = document.getElementById('tw-universe') || document.getElementById('universe-panel');
    if (panel) {
      panel.classList.remove('open');
      panel.style.display = 'none';
    }
    // Restore Map tab as active
    document.querySelectorAll('.nb').forEach(el => el.classList.remove('active'));
    document.getElementById('nb-map')?.classList.add('active');
  }

  function switchUniverseTab(tab) {
    universeCurrentTab = tab;
    document.querySelectorAll('.twu-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    renderUniverseBody();
  }

  async function loadUniverseContent(w1, w2) {
    const body = document.getElementById('twu-body');
    if (!body) return;

    // Show loading state
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:14px;padding:20px;">
        <div class="twu-skeleton" style="height:18px;width:45%;"></div>
        <div class="twu-skeleton" style="height:112px;"></div>
        <div class="twu-skeleton" style="height:18px;width:55%;margin-top:8px;"></div>
        <div class="twu-skeleton" style="height:90px;"></div>
        <div class="twu-skeleton" style="height:90px;"></div>
      </div>`;

    universeData = { videos: [], images: [], places: [], knowledge: null };

    // Load in parallel
    await Promise.allSettled([
      loadUniverseVideos(w1, w2),
      loadUniverseImages(w1, w2),
      loadUniverseKnowledge(w1, w2),
      loadUniversePlaces(w1, w2),
    ]);

    universeLoaded = true;
    renderUniverseBody();
  }

  // Videos — YouTube search links (no API key needed, opens YouTube)
  async function loadUniverseVideos(w1, w2) {
    // We generate curated search-based video stubs using YouTube's embed-friendly search
    const query = `${w1} ${w2}`;
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    // Generate representative video cards that link to YouTube search
    const seeds = [
      { title: `${w1} ${w2} — How to get started`, channel: 'YouTube Guide', q: query },
      { title: `Best ${w2} spots for people who love ${w1}`, channel: 'Explore More', q: query },
      { title: `${w1} ${w2} community stories`, channel: 'Real People', q: `${query} community` },
      { title: `${w2} tips for ${w1} enthusiasts`, channel: 'Pro Tips', q: `${query} tips` },
      { title: `A day in the life: ${w1} ${w2}`, channel: 'Daily Vlog', q: `${query} vlog` },
    ];
    // Use YouTube's oembed thumbnail trick for a real-looking thumbnail
    universeData.videos = seeds.map((v, i) => ({
      ...v,
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(v.q)}`,
      // Unsplash as fallback thumbnail
      thumb: `https://source.unsplash.com/400x225/?${encodeURIComponent(w1 + ',' + w2)}&sig=${i}`,
    }));
  }

  // Images — Unsplash source (free, no API key)
  async function loadUniverseImages(w1, w2) {
    const keywords = [w1, w2, `${w1} ${w2}`];
    universeData.images = Array.from({ length: 9 }, (_, i) => ({
      url: `https://source.unsplash.com/300x300/?${encodeURIComponent(keywords[i % 3])}&sig=${i * 7}`,
      alt: `${w1} ${w2} image ${i + 1}`,
      searchUrl: `https://unsplash.com/s/photos/${encodeURIComponent(w1 + '-' + w2)}`,
    }));
  }

  // Knowledge — Wikipedia summary API (free, no key)
  async function loadUniverseKnowledge(w1, w2) {
    const tryWord = async (word) => {
      try {
        const res = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`,
          { headers: { 'Accept': 'application/json' } }
        );
        if (!res.ok) return null;
        const data = await res.json();
        if (data.type === 'disambiguation' || !data.extract) return null;
        return {
          title: data.title,
          extract: data.extract.split('. ').slice(0, 3).join('. ') + '.',
          url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(word)}`,
          thumbnail: data.thumbnail?.source || null,
        };
      } catch { return null; }
    };
    universeData.knowledge = await tryWord(w2) || await tryWord(w1) || {
      title: `${w1} ${w2}`,
      extract: `Explore everything about ${w1} and ${w2} — from techniques to communities to real-world experiences.`,
      url: `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(w1 + ' ' + w2)}`,
    };
  }

  // Places — Overpass API (reuse the word tag map)
  async function loadUniversePlaces(w1, w2) {
    try {
      const tags = twWordsToOSMTags(w1, w2);
      if (tags.length === 0) tags.push({ k: 'leisure', v: 'park' });
      const radius = 5000;
      const lat = playerLat, lon = playerLon;
      const tagQ = tags.slice(0, 3).map(t =>
        `node["${t.k}"="${t.v}"](around:${radius},${lat},${lon});way["${t.k}"="${t.v}"](around:${radius},${lat},${lon});`
      ).join('\n');
      const query = `[out:json][timeout:10];\n(\n${tagQ}\n);\nout center 12;`;
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      const data = await res.json();
      universeData.places = (data.elements || [])
        .filter(el => el.tags?.name)
        .map(el => {
          const eLat = el.lat || el.center?.lat || lat;
          const eLon = el.lon || el.center?.lon || lon;
          return {
            name: el.tags.name,
            dist: haversineDistance(lat, lon, eLat, eLon),
            icon: twuPlaceIcon(el.tags),
            lat: eLat, lon: eLon,
            tags: el.tags,
          };
        })
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 8);
    } catch { universeData.places = []; }
  }

  function renderUniverseBody() {
    const body = document.getElementById('twu-body');
    if (!body) return;
    const w1 = currentAmbition.word1 || 'PLAY';
    const w2 = currentAmbition.word2 || 'GOLF';
    const tab = universeCurrentTab;
    let html = '';

    const showVideos = tab === 'all' || tab === 'videos';
    const showImages = tab === 'all' || tab === 'images';
    const showPeople = tab === 'all' || tab === 'people';
    const showPlaces = tab === 'all' || tab === 'places';
    const showLearn  = tab === 'all' || tab === 'learn';

    // VIDEOS
    if (showVideos && universeData.videos.length > 0) {
      html += `<div class="twu-section-label">Videos</div>`;
      html += `<div class="twu-video-row">`;
      universeData.videos.forEach(v => {
        html += `
          <a class="twu-video-card" href="${v.url}" target="_blank" rel="noopener">
            <div class="twu-video-thumb-wrap">
              <img class="twu-video-thumb" src="${v.thumb}" alt="${v.title}" loading="lazy"
                onerror="this.style.background='rgba(255,255,255,0.06)';this.style.display='block';">
              <div class="twu-video-play">
                <div class="twu-video-play-btn">▶</div>
              </div>
            </div>
            <div class="twu-video-info">
              <div class="twu-video-title">${v.title}</div>
              <div class="twu-video-channel">${v.channel} · YouTube</div>
            </div>
          </a>`;
      });
      html += `</div>`;
    }

    // IMAGES
    if (showImages && universeData.images.length > 0) {
      html += `<div class="twu-section-label">Images</div>`;
      html += `<div class="twu-image-grid">`;
      universeData.images.forEach(img => {
        html += `
          <div class="twu-image-cell" onclick="window.open('${img.searchUrl}','_blank')">
            <img src="${img.url}" alt="${img.alt}" loading="lazy"
              onerror="this.parentElement.style.background='rgba(255,255,255,0.06)';">
          </div>`;
      });
      html += `</div>`;
    }

    // PEOPLE (nearby matches with same words)
    if (showPeople) {
      html += `<div class="twu-section-label">People nearby</div>`;
      html += `<div class="twu-people-list">`;
      if (nearbyMatches && nearbyMatches.length > 0) {
        nearbyMatches.forEach((m, idx) => {
          const dist = fmtDist(m.dist || haversineDistance(playerLat, playerLon, m.lat, m.lon));
          html += `
            <div class="twu-person-card" onclick="selectMatch(${idx}); closeUniversePanel(); toggleLiveARMode();">
              <div class="twu-person-avatar">${m.avatar || '🎯'}</div>
              <div class="twu-person-info">
                <div class="twu-person-name">${m.name}</div>
                <div class="twu-person-words">${m.words || w1 + ' · ' + w2}</div>
              </div>
              <span class="twu-person-dist">${dist}</span>
              <button class="twu-person-nav-btn">Navigate →</button>
            </div>`;
        });
      } else {
        html += `<div style="padding:12px 0;color:rgba(255,255,255,0.3);font-size:0.82rem;">No nearby people found yet. Enter the AR to discover matches.</div>`;
      }
      html += `</div>`;
    }

    // PLACES
    if (showPlaces) {
      html += `<div class="twu-section-label">Places near you</div>`;
      html += `<div class="twu-places-list">`;
      if (universeData.places.length > 0) {
        universeData.places.forEach(p => {
          html += `
            <div class="twu-place-card">
              <div class="twu-place-icon">${p.icon}</div>
              <div class="twu-place-info">
                <div class="twu-place-name">${p.name}</div>
                <div class="twu-place-meta">${fmtDist(p.dist)} away</div>
              </div>
              <button class="twu-place-go-btn" onclick="setDestinationFromUniverse(${p.lat},${p.lon},'${p.name.replace(/'/g,'&apos;')}'); closeUniversePanel(); toggleLiveARMode();">Go →</button>
            </div>`;
        });
      } else {
        html += `<div style="padding:12px 0;color:rgba(255,255,255,0.3);font-size:0.82rem;">Searching nearby places...</div>`;
      }
      html += `</div>`;
    }

    // LEARN / KNOWLEDGE
    if (showLearn && universeData.knowledge) {
      const k = universeData.knowledge;
      html += `<div class="twu-section-label">Knowledge</div>`;
      html += `
        <div class="twu-knowledge-card">
          <div class="twu-know-title">📖 ${k.title}</div>
          <div class="twu-know-text">${k.extract}</div>
          <a class="twu-know-link" href="${k.url}" target="_blank" rel="noopener">Read more on Wikipedia →</a>
        </div>`;
      // Also add web search link
      html += `
        <div class="twu-knowledge-card" style="margin-top:-8px;">
          <div class="twu-know-title">🔍 Search the web</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;">
            <a class="twu-know-link" href="https://www.google.com/search?q=${encodeURIComponent(w1+' '+w2)}" target="_blank">Google →</a>
            <a class="twu-know-link" href="https://reddit.com/search/?q=${encodeURIComponent(w1+' '+w2)}" target="_blank">Reddit →</a>
            <a class="twu-know-link" href="https://www.youtube.com/results?search_query=${encodeURIComponent(w1+' '+w2)}" target="_blank">YouTube →</a>
            <a class="twu-know-link" href="https://www.instagram.com/explore/tags/${encodeURIComponent((w1+w2).toLowerCase().replace(/\s/g,''))}" target="_blank">Instagram →</a>
            <a class="twu-know-link" href="https://www.pinterest.com/search/pins/?q=${encodeURIComponent(w1+' '+w2)}" target="_blank">Pinterest →</a>
            <a class="twu-know-link" href="https://www.tiktok.com/search?q=${encodeURIComponent(w1+' '+w2)}" target="_blank">TikTok →</a>
          </div>
        </div>`;
    }

    body.innerHTML = html || `<div class="twu-section-label" style="padding-top:32px;">Nothing found yet — try changing your two words.</div>`;
  }

  function setDestinationFromUniverse(lat, lon, name) {
    destLat = lat;
    destLon = lon;
    activeMatch.name = name;
    activeMatch.avatar = '📍';
    if (map) {
      if (destMarker) destMarker.setLatLng([destLat, destLon]);
      if (routeLine) routeLine.setLatLngs([[playerLat, playerLon], [destLat, destLon]]);
    }
    recalcBearingAndDist();
    showFloatingXPNotification('Destination Set', name);
  }

  // ============================================================
  // AVATAR CREATOR / CHARACTER CUSTOMIZATION
  // ============================================================
  const AVATAR_EMOJIS = [
    '🎯','🚀','🏆','⚡','🔥','🌊','🦁','🐉','🦊','🐺','🦅','🦋',
    '🌟','💎','🎮','🎨','🎸','🎭','🏋️','⚽','🏌️','🏄','🧗','🏇',
    '🤺','🥊','🤸','🧘','🎯','🚂','🏍️','🛸','🤖','👾','🧙','🥷',
    '🦸','🧜','🧝','🎅','🤠','🥸','😎','🤩','🫡','🫶','🙌','✌️'
  ];
  const AURA_COLORS = [
    '#00d4ff','#a855f7','#ff3366','#00ff99','#f59e0b','#ec4899',
    '#06b6d4','#84cc16','#f97316','#8b5cf6','#ef4444','#10b981'
  ];

  let playerAvatar = '🎯';
  let playerName   = 'Player';
  let playerAura   = '#00d4ff';
  let playerStyle  = 'explorer';

  function initAvatarCreator() {
    // Build emoji grid
    const grid = document.getElementById('ac-emoji-grid');
    if (!grid) return;
    grid.innerHTML = AVATAR_EMOJIS.map(e =>
      `<div class="ac-emoji${e === playerAvatar ? ' selected' : ''}" onclick="selectAvatarEmoji('${e}', this)">${e}</div>`
    ).join('');

    // Build color row
    const colorRow = document.getElementById('ac-color-row');
    if (colorRow) {
      colorRow.innerHTML = AURA_COLORS.map(c =>
        `<div class="ac-color-swatch${c === playerAura ? ' selected' : ''}" style="background:${c}" onclick="selectAvatarColor('${c}', this)"></div>`
      ).join('');
    }

    // Pre-fill name with Two Words
    const nameInput = document.getElementById('ac-name-input');
    if (nameInput && nameInput.value === '') {
      nameInput.value = playerName;
    }
  }

  function selectAvatarEmoji(emoji, el) {
    playerAvatar = emoji;
    document.querySelectorAll('.ac-emoji').forEach(e => e.classList.remove('selected'));
    el.classList.add('selected');
    const preview = document.getElementById('ac-preview-avatar');
    if (preview) preview.textContent = emoji;
    // Update aura border based on current color
    if (preview) preview.style.borderColor = playerAura;
  }

  function selectAvatarColor(color, el) {
    playerAura = color;
    document.querySelectorAll('.ac-color-swatch').forEach(e => e.classList.remove('selected'));
    el.classList.add('selected');
    const preview = document.getElementById('ac-preview-avatar');
    if (preview) {
      preview.style.borderColor = color;
      preview.style.boxShadow = `0 0 40px ${color}44, 0 0 0 8px ${color}11`;
    }
  }

  function selectAvatarStyle(el) {
    document.querySelectorAll('.ac-style-chip').forEach(e => e.classList.remove('selected'));
    el.classList.add('selected');
    playerStyle = el.dataset.style;
  }

  function cycleAvatarRandom() {
    const emoji = AVATAR_EMOJIS[Math.floor(Math.random() * AVATAR_EMOJIS.length)];
    const color = AURA_COLORS[Math.floor(Math.random() * AURA_COLORS.length)];
    // Find and click them
    document.querySelectorAll('.ac-emoji').forEach(el => {
      if (el.textContent === emoji) selectAvatarEmoji(emoji, el);
    });
    document.querySelectorAll('.ac-color-swatch').forEach(el => {
      if (el.style.background === color || el.style.backgroundColor === color) selectAvatarColor(color, el);
    });
    // fallback direct set
    playerAvatar = emoji;
    playerAura   = color;
    const preview = document.getElementById('ac-preview-avatar');
    if (preview) {
      preview.textContent = emoji;
      preview.style.borderColor = color;
      preview.style.boxShadow = `0 0 40px ${color}44, 0 0 0 8px ${color}11`;
    }
  }

  function confirmAvatarAndEnter() {
    const nameInput = document.getElementById('ac-name-input');
    playerName = (nameInput && nameInput.value.trim()) || playerName;

    // Save to localStorage
    localStorage.setItem('tw_avatar', playerAvatar);
    localStorage.setItem('tw_name',   playerName);
    localStorage.setItem('tw_aura',   playerAura);
    localStorage.setItem('tw_style',  playerStyle);

    // Update the top bar avatar
    const xpAvatar = document.querySelector('.xp-avatar');
    if (xpAvatar) xpAvatar.textContent = playerAvatar;

    // Hide avatar creator, show main app
    const ac = document.getElementById('avatar-creator');
    if (ac) { ac.style.transition = 'opacity 0.4s ease'; ac.style.opacity = '0'; setTimeout(() => { ac.style.display = 'none'; }, 400); }

    showFloatingXPNotification('Welcome ' + playerName + '!', playerAvatar + ' Ready to play');
  }

  // Show avatar creator after two words are entered
  function showAvatarCreator() {
    const ac = document.getElementById('avatar-creator') || document.getElementById('avatar-modal');
    if (!ac) return;
    initAvatarCreator();
    ac.classList.add('show');
    ac.classList.add('active');
    ac.style.display = 'flex';
    ac.style.opacity = '1';
  }

  function closeAvatarCreator() {
    const ac = document.getElementById('avatar-creator') || document.getElementById('avatar-modal');
    if (ac) {
      ac.classList.remove('show');
      ac.classList.remove('active');
      ac.style.display = 'none';
    }
  }

  // Load saved avatar on startup
  (function loadSavedAvatar() {
    const saved = {
      avatar: localStorage.getItem('tw_avatar'),
      name:   localStorage.getItem('tw_name'),
      aura:   localStorage.getItem('tw_aura'),
      style:  localStorage.getItem('tw_style')
    };
    if (saved.avatar) { playerAvatar = saved.avatar; }
    if (saved.name)   { playerName   = saved.name; }
    if (saved.aura)   { playerAura   = saved.aura; }
    if (saved.style)  { playerStyle  = saved.style; }
    // Update top bar avatar immediately
    const xpAvatar = document.querySelector('.xp-avatar');
    if (xpAvatar && saved.avatar) xpAvatar.textContent = saved.avatar;
  })();

  // ============================================================
  // GO LIVE — WebRTC Broadcast
  // ============================================================
  let glStream = null;
  let glIsLive = false;
  let glViewers = 0;
  let glViewerInterval = null;
  let glReach = 'nearby';

  function openGoLiveModal() {
    const modal = document.getElementById('golive-modal') || document.getElementById('go-live-modal');
    if (modal) {
      modal.classList.add('show');
      modal.classList.add('active');
      modal.style.display = 'flex';
    }
    // Update overlay words
    const ow = document.getElementById('gl-overlay-words');
    if (ow) ow.textContent = `${playerAvatar} ${playerAmbitionWords || 'PLAY · GOLF'} · ${cityName || 'Loading…'}`;
    // Start camera preview
    startGoLivePreview();
    // Count nearby players
    updateNearbyCount();
  }

  function closeGoLiveModal() {
    if (glIsLive) stopGoLive();
    const modal = document.getElementById('golive-modal') || document.getElementById('go-live-modal');
    if (modal) {
      modal.classList.remove('show');
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
    stopGoLivePreview();
  }

  async function startGoLivePreview() {
    const video = document.getElementById('gl-video-preview');
    if (!video) return;
    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isSecure) return;
    try {
      glStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
      video.srcObject = glStream;
    } catch(e) { console.warn('[GoLive] Preview camera unavailable:', e.message); }
  }

  function stopGoLivePreview() {
    if (glStream && !glIsLive) {
      glStream.getTracks().forEach(t => t.stop());
      glStream = null;
    }
    const video = document.getElementById('gl-video-preview');
    if (video) { video.srcObject = null; }
  }

  function selectLiveReach(reach, el) {
    glReach = reach;
    document.querySelectorAll('.gl-reach-chip').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    updateNearbyCount();
  }

  function updateNearbyCount() {
    const el = document.getElementById('gl-nearby-count');
    if (!el) return;
    const radius = glReach === 'nearby' ? '500m' : glReach === 'city' ? '10km' : '∞';
    const count  = glReach === 'nearby' ? 3 : glReach === 'city' ? 24 : '1.2k+';
    el.textContent = `📍 ${count} potential viewers within ${radius}`;
  }

  function toggleGoLive() {
    if (!glIsLive) startGoLive();
    else stopGoLive();
  }

  function startGoLive() {
    glIsLive  = true;
    glViewers = 0;

    const badge  = document.getElementById('gl-live-badge');
    const btnTxt = document.getElementById('gl-btn-txt');
    const btnIcon= document.getElementById('gl-btn-icon');
    const btn    = document.getElementById('gl-start-btn');

    if (badge) badge.classList.remove('hidden');
    if (btnTxt) btnTxt.textContent = 'End Broadcast';
    if (btnIcon) btnIcon.textContent = '⏹';
    if (btn) btn.classList.add('live');

    // Simulate growing viewer count
    glViewerInterval = setInterval(() => {
      glViewers += Math.floor(Math.random() * 3);
      const vc = document.getElementById('gl-viewer-count');
      if (vc) vc.textContent = glViewers + ' watching';
    }, 3000);

    // Broadcast via WebSocket to all nearby players
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'GO_LIVE_START',
        avatar: playerAvatar,
        name:   playerName,
        words:  playerAmbitionWords || 'PLAY GOLF',
        lat:    playerLat,
        lon:    playerLon,
        reach:  glReach
      }));
    }

    showFloatingXPNotification('🔴 You are LIVE!', 'Broadcasting to ' + glReach + ' players');
  }

  function stopGoLive() {
    glIsLive  = false;
    clearInterval(glViewerInterval);

    const badge  = document.getElementById('gl-live-badge');
    const btnTxt = document.getElementById('gl-btn-txt');
    const btnIcon= document.getElementById('gl-btn-icon');
    const btn    = document.getElementById('gl-start-btn');

    if (badge) badge.classList.add('hidden');
    if (btnTxt) btnTxt.textContent = 'Start Broadcast';
    if (btnIcon) btnIcon.textContent = '📡';
    if (btn) btn.classList.remove('live');

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'GO_LIVE_STOP', name: playerName }));
    }
  }

  function shareLiveLink() {
    const url  = location.href;
    const text = `Watch me live on TwoWords! ${playerAmbitionWords || 'PLAY GOLF'} 🎯`;
    if (navigator.share) {
      navigator.share({ title: 'TwoWords Live', text, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        showFloatingXPNotification('Link copied!', 'Share it anywhere');
      });
    }
  }

  // ============================================================
  // SOCIAL HUB
  // ============================================================
  let playerAmbitionWords = 'PLAY GOLF';

  function openSocialHub() {
    const hub = document.getElementById('social-hub');
    if (!hub) return;
    hub.classList.add('show');
    // Pre-fill search with two words
    const input = document.getElementById('sh-search-input');
    if (input && !input.value) input.value = playerAmbitionWords || '';
  }

  function closeSocialHub() {
    const hub = document.getElementById('social-hub');
    if (hub) hub.classList.remove('show');
  }

  function shGetQuery() {
    const input = document.getElementById('sh-search-input');
    return (input && input.value.trim()) || playerAmbitionWords || 'TwoWords';
  }

  function shSearch(platform) {
    const q = encodeURIComponent(shGetQuery());
    const urls = {
      youtube:   `https://www.youtube.com/results?search_query=${q}`,
      instagram: `https://www.instagram.com/explore/tags/${q.replace(/%20/g, '')}`,
      facebook:  `https://www.facebook.com/search/top?q=${q}`,
      tiktok:    `https://www.tiktok.com/search?q=${q}`,
      reddit:    `https://www.reddit.com/search/?q=${q}`,
      wikipedia: `https://en.wikipedia.org/wiki/Special:Search?search=${q}`,
      twitter:   `https://x.com/search?q=${q}`,
      spotify:   `https://open.spotify.com/search/${q}`
    };
    const url = urls[platform];
    if (url) window.open(url, '_blank');
  }

  function shOpenProfile(platform) {
    // Deep link to search for the user's Two Words on each platform
    shSearch(platform);
  }

  // ============================================================
  // HOOK: After submitTwoWords → show Avatar Creator
  // Patch the existing submitTwoWords function
  // ============================================================
  const _origSubmitTwoWords = typeof submitTwoWords === 'function' ? submitTwoWords : null;

  // We override by wrapping: find where intro dissolves and inject avatar creator
  // We'll patch by hooking into the DOMContentLoaded flow after intro
  // The avatar creator shows AFTER the intro fades (before main app visible)
  const _checkAvatarOnboarding = function() {
    const hasProfile = localStorage.getItem('tw_avatar');
    if (!hasProfile) {
      // First time — show avatar creator after intro
      const origIntroDissolve = window._origIntroDissolve;
      // We hook into tw-go-btn click
      const goBtn = document.getElementById('tw-go-btn');
      if (goBtn) {
        const _origClick = goBtn.onclick;
        goBtn.onclick = function(e) {
          // Call original to handle validation
          if (_origClick) _origClick.call(this, e);
          // After short delay (intro animation), show avatar creator
          setTimeout(() => {
            const tw_intro = document.getElementById('tw-intro');
            if (!tw_intro || tw_intro.style.display === 'none' || tw_intro.classList.contains('tw-dissolve')) {
              showAvatarCreator();
            }
          }, 1800);
        };
      }
    }
  };
  // Run once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _checkAvatarOnboarding);
  } else {
    setTimeout(_checkAvatarOnboarding, 200);
  }

  // Also update playerAmbitionWords when ambition changes
  const _origSetAmbition = window.setAmbition;
  // We sync it via a watch on the xp-words element
  const _xpWordsEl = document.getElementById('xp-words');
  if (_xpWordsEl) {
    const _observer = new MutationObserver(() => {
      const txt = _xpWordsEl.textContent.replace('·','').trim();
      if (txt) playerAmbitionWords = txt;
    });
    _observer.observe(_xpWordsEl, { childList: true, characterData: true, subtree: true });
  }

  // Handle incoming GoLive events from server
  const _origWsMessage = null; // already handled by main WS handler — add case
  // We inject handler via a broadcast-aware WS message hook
  document.addEventListener('tw-ws-message', (e) => {
    const data = e.detail;
    if (data && data.type === 'GO_LIVE_START') {
      showFloatingXPNotification(
        `🔴 ${data.avatar || '🎯'} ${data.name || 'Someone'} is LIVE!`,
        `${data.words || ''} · Tap to watch`
      );
    }
  });

  // Service Worker PWA Registration
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        console.log('[PWA] ServiceWorker registered with scope:', reg.scope);
      }).catch((err) => {
        console.warn('[PWA] ServiceWorker registration failed:', err);
      });
    });
  }

  // ============================================================
  // SETTINGS & CONTROL CENTER HANDLERS
  // ============================================================
  window.openSettingsModal = function() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
      modal.style.display = 'flex';
      const nameEl = document.getElementById('settings-player-name');
      const styleEl = document.getElementById('settings-player-style');
      const avatarEl = document.getElementById('settings-avatar-preview');
      if (nameEl) nameEl.textContent = localStorage.getItem('tw_name') || 'Cyber Explorer';
      if (styleEl) styleEl.textContent = `⚡ ${localStorage.getItem('tw_style') || 'Explorer'} · Aura: ${localStorage.getItem('tw_aura') || 'Cyan'}`;
      if (avatarEl) avatarEl.textContent = localStorage.getItem('tw_avatar') || '🎯';
    }
  };

  window.closeSettingsModal = function() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.style.display = 'none';
  };

  window.updateAudioVolume = function(val) {
    const valEl = document.getElementById('volume-val');
    if (valEl) valEl.textContent = val + '%';
    localStorage.setItem('tw_audio_vol', val);
  };

  window.toggleAmbientAudio = function(enabled) {
    localStorage.setItem('tw_ambient_audio', enabled);
  };

  window.toggleSoundFX = function(enabled) {
    localStorage.setItem('tw_sfx', enabled);
  };

  window.setGraphicsQuality = function(mode) {
    localStorage.setItem('tw_graphics_quality', mode);
  };

  window.toggleGraphicsBloom = function(enabled) {
    localStorage.setItem('tw_graphics_bloom', enabled);
  };

// === AUTOMATIC GLOBAL WINDOW BINDINGS ===
if (typeof haversineDistance !== 'undefined') window.haversineDistance = haversineDistance;
if (typeof getBearing !== 'undefined') window.getBearing = getBearing;
if (typeof fmtDist !== 'undefined') window.fmtDist = fmtDist;
if (typeof fmtTime !== 'undefined') window.fmtTime = fmtTime;
if (typeof shortestAngleDiff !== 'undefined') window.shortestAngleDiff = shortestAngleDiff;
if (typeof recalcBearingAndDist !== 'undefined') window.recalcBearingAndDist = recalcBearingAndDist;
if (typeof connectWebSocket !== 'undefined') window.connectWebSocket = connectWebSocket;
if (typeof pushPositionToServer !== 'undefined') window.pushPositionToServer = pushPositionToServer;
if (typeof applyServerGPSLock !== 'undefined') window.applyServerGPSLock = applyServerGPSLock;
if (typeof applyAmbitionString !== 'undefined') window.applyAmbitionString = applyAmbitionString;
if (typeof applyActiveMatch !== 'undefined') window.applyActiveMatch = applyActiveMatch;
if (typeof syncMapToState !== 'undefined') window.syncMapToState = syncMapToState;
if (typeof initMap !== 'undefined') window.initMap = initMap;
if (typeof recenterMap !== 'undefined') window.recenterMap = recenterMap;
if (typeof updateMapPOIs !== 'undefined') window.updateMapPOIs = updateMapPOIs;
if (typeof setTargetPOI !== 'undefined') window.setTargetPOI = setTargetPOI;
if (typeof initPipMap !== 'undefined') window.initPipMap = initPipMap;
if (typeof updatePipMap !== 'undefined') window.updatePipMap = updatePipMap;
if (typeof togglePipSize !== 'undefined') window.togglePipSize = togglePipSize;
if (typeof drawProceduralStreetBackdrop !== 'undefined') window.drawProceduralStreetBackdrop = drawProceduralStreetBackdrop;
if (typeof drawAvenueFacade !== 'undefined') window.drawAvenueFacade = drawAvenueFacade;
if (typeof drawStreetSign !== 'undefined') window.drawStreetSign = drawStreetSign;
if (typeof drawSimulatedCameraBackdrop !== 'undefined') window.drawSimulatedCameraBackdrop = drawSimulatedCameraBackdrop;
if (typeof renderLiveARView !== 'undefined') window.renderLiveARView = renderLiveARView;
if (typeof project !== 'undefined') window.project = project;
if (typeof updateNavGuidanceHUD !== 'undefined') window.updateNavGuidanceHUD = updateNavGuidanceHUD;
if (typeof triggerVPSCalibration !== 'undefined') window.triggerVPSCalibration = triggerVPSCalibration;
if (typeof drawDestinationCard !== 'undefined') window.drawDestinationCard = drawDestinationCard;
if (typeof drawPoiCard !== 'undefined') window.drawPoiCard = drawPoiCard;
if (typeof roundRect !== 'undefined') window.roundRect = roundRect;
if (typeof getMetersPerDegLon !== 'undefined') window.getMetersPerDegLon = getMetersPerDegLon;
if (typeof gpsToWorld !== 'undefined') window.gpsToWorld = gpsToWorld;
if (typeof worldToGps !== 'undefined') window.worldToGps = worldToGps;
if (typeof createAtmosphericSkyTexture !== 'undefined') window.createAtmosphericSkyTexture = createAtmosphericSkyTexture;
if (typeof createWindowGridTexture !== 'undefined') window.createWindowGridTexture = createWindowGridTexture;
if (typeof createGrassTexture !== 'undefined') window.createGrassTexture = createGrassTexture;
if (typeof createSidewalkTexture !== 'undefined') window.createSidewalkTexture = createSidewalkTexture;
if (typeof createBillboardSprite !== 'undefined') window.createBillboardSprite = createBillboardSprite;
if (typeof initThreeAR !== 'undefined') window.initThreeAR = initThreeAR;
if (typeof build3DGroundSystem !== 'undefined') window.build3DGroundSystem = build3DGroundSystem;
if (typeof buildTrees !== 'undefined') window.buildTrees = buildTrees;
if (typeof buildStreetLamps !== 'undefined') window.buildStreetLamps = buildStreetLamps;
if (typeof buildRealGeographicBuildings !== 'undefined') window.buildRealGeographicBuildings = buildRealGeographicBuildings;
if (typeof build3DDestinationBeacon !== 'undefined') window.build3DDestinationBeacon = build3DDestinationBeacon;
if (typeof build3DPoiPins !== 'undefined') window.build3DPoiPins = build3DPoiPins;
if (typeof build3DRunwayChevrons !== 'undefined') window.build3DRunwayChevrons = build3DRunwayChevrons;
if (typeof update3DRunwayChevrons !== 'undefined') window.update3DRunwayChevrons = update3DRunwayChevrons;
if (typeof setupBuildingRaycasting !== 'undefined') window.setupBuildingRaycasting = setupBuildingRaycasting;
if (typeof closeBldgCard !== 'undefined') window.closeBldgCard = closeBldgCard;
if (typeof checkAndRefreshBuildings !== 'undefined') window.checkAndRefreshBuildings = checkAndRefreshBuildings;
if (typeof fetchLiveBuildings !== 'undefined') window.fetchLiveBuildings = fetchLiveBuildings;
if (typeof renderThreeARFrame !== 'undefined') window.renderThreeARFrame = renderThreeARFrame;
if (typeof updateTelemetryHUD !== 'undefined') window.updateTelemetryHUD = updateTelemetryHUD;
if (typeof loadGoogleMapsAPI !== 'undefined') window.loadGoogleMapsAPI = loadGoogleMapsAPI;
if (typeof checkAndActivateStreetView !== 'undefined') window.checkAndActivateStreetView = checkAndActivateStreetView;
if (typeof initGoogleStreetViewPano !== 'undefined') window.initGoogleStreetViewPano = initGoogleStreetViewPano;
if (typeof initGoogleSatelliteMap !== 'undefined') window.initGoogleSatelliteMap = initGoogleSatelliteMap;
if (typeof syncStreetViewPOV !== 'undefined') window.syncStreetViewPOV = syncStreetViewPOV;
if (typeof syncStreetViewPosition !== 'undefined') window.syncStreetViewPosition = syncStreetViewPosition;
if (typeof initRealMap3D !== 'undefined') window.initRealMap3D = initRealMap3D;
if (typeof syncRealMap3DPosition !== 'undefined') window.syncRealMap3DPosition = syncRealMap3DPosition;
if (typeof setSatelliteLayerVisibility !== 'undefined') window.setSatelliteLayerVisibility = setSatelliteLayerVisibility;
if (typeof toggleModeDropdown !== 'undefined') window.toggleModeDropdown = toggleModeDropdown;
if (typeof selectARMode !== 'undefined') window.selectARMode = selectARMode;
if (typeof toggleViewMode !== 'undefined') window.toggleViewMode = toggleViewMode;
if (typeof openGoogleMapsKeyModal !== 'undefined') window.openGoogleMapsKeyModal = openGoogleMapsKeyModal;
if (typeof closeGoogleMapsKeyModal !== 'undefined') window.closeGoogleMapsKeyModal = closeGoogleMapsKeyModal;
if (typeof setPresetKey !== 'undefined') window.setPresetKey = setPresetKey;
if (typeof testCurrentMapsKey !== 'undefined') window.testCurrentMapsKey = testCurrentMapsKey;
if (typeof saveGoogleMapsKey !== 'undefined') window.saveGoogleMapsKey = saveGoogleMapsKey;
if (typeof useDemoMapsKey !== 'undefined') window.useDemoMapsKey = useDemoMapsKey;
if (typeof startCamera !== 'undefined') window.startCamera = startCamera;
if (typeof showCameraHttpsPrompt !== 'undefined') window.showCameraHttpsPrompt = showCameraHttpsPrompt;
if (typeof showCameraError !== 'undefined') window.showCameraError = showCameraError;
if (typeof flipCamera !== 'undefined') window.flipCamera = flipCamera;
if (typeof toggleTorch !== 'undefined') window.toggleTorch = toggleTorch;
if (typeof toggleCameraMode !== 'undefined') window.toggleCameraMode = toggleCameraMode;
if (typeof toggleCamNavAutoWalk !== 'undefined') window.toggleCamNavAutoWalk = toggleCamNavAutoWalk;
if (typeof stopCamera !== 'undefined') window.stopCamera = stopCamera;
if (typeof setHeading !== 'undefined') window.setHeading = setHeading;
if (typeof setPitch !== 'undefined') window.setPitch = setPitch;
if (typeof setupARLookControls !== 'undefined') window.setupARLookControls = setupARLookControls;
if (typeof requestOrientationPermission !== 'undefined') window.requestOrientationPermission = requestOrientationPermission;
if (typeof listenOrientation !== 'undefined') window.listenOrientation = listenOrientation;
if (typeof walkForward !== 'undefined') window.walkForward = walkForward;
if (typeof toggleAutoWalk !== 'undefined') window.toggleAutoWalk = toggleAutoWalk;
if (typeof toggleLiveARMode !== 'undefined') window.toggleLiveARMode = toggleLiveARMode;
if (typeof startARAnimationLoop !== 'undefined') window.startARAnimationLoop = startARAnimationLoop;
if (typeof animate !== 'undefined') window.animate = animate;
if (typeof startGPS !== 'undefined') window.startGPS = startGPS;
if (typeof stopGPS !== 'undefined') window.stopGPS = stopGPS;
if (typeof checkProximityTrigger !== 'undefined') window.checkProximityTrigger = checkProximityTrigger;
if (typeof playCelebrationSound !== 'undefined') window.playCelebrationSound = playCelebrationSound;
if (typeof launchConfetti !== 'undefined') window.launchConfetti = launchConfetti;
if (typeof frame !== 'undefined') window.frame = frame;
if (typeof triggerArrivalCelebration !== 'undefined') window.triggerArrivalCelebration = triggerArrivalCelebration;
if (typeof dismissCelebration !== 'undefined') window.dismissCelebration = dismissCelebration;
if (typeof toggleAudioMute !== 'undefined') window.toggleAudioMute = toggleAudioMute;
if (typeof updatePlayerLevelUI !== 'undefined') window.updatePlayerLevelUI = updatePlayerLevelUI;
if (typeof showFloatingXPNotification !== 'undefined') window.showFloatingXPNotification = showFloatingXPNotification;
if (typeof openChatModal !== 'undefined') window.openChatModal = openChatModal;
if (typeof openChatFromCelebration !== 'undefined') window.openChatFromCelebration = openChatFromCelebration;
if (typeof closeChatModal !== 'undefined') window.closeChatModal = closeChatModal;
if (typeof renderChatMessages !== 'undefined') window.renderChatMessages = renderChatMessages;
if (typeof sendChatMessage !== 'undefined') window.sendChatMessage = sendChatMessage;
if (typeof sendQuickReply !== 'undefined') window.sendQuickReply = sendQuickReply;
if (typeof simulateMatchReply !== 'undefined') window.simulateMatchReply = simulateMatchReply;
if (typeof escapeHtml !== 'undefined') window.escapeHtml = escapeHtml;
if (typeof openMatchesModal !== 'undefined') window.openMatchesModal = openMatchesModal;
if (typeof closeMatchesModal !== 'undefined') window.closeMatchesModal = closeMatchesModal;
if (typeof renderMatchesList !== 'undefined') window.renderMatchesList = renderMatchesList;
if (typeof targetMatchFromList !== 'undefined') window.targetMatchFromList = targetMatchFromList;
if (typeof claimDiscoveryReward !== 'undefined') window.claimDiscoveryReward = claimDiscoveryReward;
if (typeof openAmbitionModal !== 'undefined') window.openAmbitionModal = openAmbitionModal;
if (typeof closeAmbitionModal !== 'undefined') window.closeAmbitionModal = closeAmbitionModal;
if (typeof selectPreset !== 'undefined') window.selectPreset = selectPreset;
if (typeof generateNearbyMatches !== 'undefined') window.generateNearbyMatches = generateNearbyMatches;
if (typeof syncAmbitionToBackend !== 'undefined') window.syncAmbitionToBackend = syncAmbitionToBackend;
if (typeof saveAmbition !== 'undefined') window.saveAmbition = saveAmbition;
if (typeof twWordsToOSMTags !== 'undefined') window.twWordsToOSMTags = twWordsToOSMTags;
if (typeof resolveDestinationFromWords !== 'undefined') window.resolveDestinationFromWords = resolveDestinationFromWords;
if (typeof submitTwoWords !== 'undefined') window.submitTwoWords = submitTwoWords;
if (typeof runIntroSequence !== 'undefined') window.runIntroSequence = runIntroSequence;
if (typeof showNextPrompt !== 'undefined') window.showNextPrompt = showNextPrompt;
if (typeof advanceToInput !== 'undefined') window.advanceToInput = advanceToInput;
if (typeof twuPlaceIcon !== 'undefined') window.twuPlaceIcon = twuPlaceIcon;
if (typeof openUniversePanel !== 'undefined') window.openUniversePanel = openUniversePanel;
if (typeof closeUniversePanel !== 'undefined') window.closeUniversePanel = closeUniversePanel;
if (typeof switchUniverseTab !== 'undefined') window.switchUniverseTab = switchUniverseTab;
if (typeof loadUniverseContent !== 'undefined') window.loadUniverseContent = loadUniverseContent;
if (typeof loadUniverseVideos !== 'undefined') window.loadUniverseVideos = loadUniverseVideos;
if (typeof loadUniverseImages !== 'undefined') window.loadUniverseImages = loadUniverseImages;
if (typeof loadUniverseKnowledge !== 'undefined') window.loadUniverseKnowledge = loadUniverseKnowledge;
if (typeof loadUniversePlaces !== 'undefined') window.loadUniversePlaces = loadUniversePlaces;
if (typeof renderUniverseBody !== 'undefined') window.renderUniverseBody = renderUniverseBody;
if (typeof setDestinationFromUniverse !== 'undefined') window.setDestinationFromUniverse = setDestinationFromUniverse;
if (typeof initAvatarCreator !== 'undefined') window.initAvatarCreator = initAvatarCreator;
if (typeof selectAvatarEmoji !== 'undefined') window.selectAvatarEmoji = selectAvatarEmoji;
if (typeof selectAvatarColor !== 'undefined') window.selectAvatarColor = selectAvatarColor;
if (typeof selectAvatarStyle !== 'undefined') window.selectAvatarStyle = selectAvatarStyle;
if (typeof cycleAvatarRandom !== 'undefined') window.cycleAvatarRandom = cycleAvatarRandom;
if (typeof confirmAvatarAndEnter !== 'undefined') window.confirmAvatarAndEnter = confirmAvatarAndEnter;
if (typeof showAvatarCreator !== 'undefined') window.showAvatarCreator = showAvatarCreator;
if (typeof closeAvatarCreator !== 'undefined') window.closeAvatarCreator = closeAvatarCreator;
if (typeof loadSavedAvatar !== 'undefined') window.loadSavedAvatar = loadSavedAvatar;
if (typeof openGoLiveModal !== 'undefined') window.openGoLiveModal = openGoLiveModal;
if (typeof closeGoLiveModal !== 'undefined') window.closeGoLiveModal = closeGoLiveModal;
if (typeof startGoLivePreview !== 'undefined') window.startGoLivePreview = startGoLivePreview;
if (typeof stopGoLivePreview !== 'undefined') window.stopGoLivePreview = stopGoLivePreview;
if (typeof selectLiveReach !== 'undefined') window.selectLiveReach = selectLiveReach;
if (typeof updateNearbyCount !== 'undefined') window.updateNearbyCount = updateNearbyCount;
if (typeof toggleGoLive !== 'undefined') window.toggleGoLive = toggleGoLive;
if (typeof startGoLive !== 'undefined') window.startGoLive = startGoLive;
if (typeof stopGoLive !== 'undefined') window.stopGoLive = stopGoLive;
if (typeof shareLiveLink !== 'undefined') window.shareLiveLink = shareLiveLink;
if (typeof openSocialHub !== 'undefined') window.openSocialHub = openSocialHub;
if (typeof closeSocialHub !== 'undefined') window.closeSocialHub = closeSocialHub;
if (typeof shGetQuery !== 'undefined') window.shGetQuery = shGetQuery;
if (typeof shSearch !== 'undefined') window.shSearch = shSearch;
if (typeof shOpenProfile !== 'undefined') window.shOpenProfile = shOpenProfile;
