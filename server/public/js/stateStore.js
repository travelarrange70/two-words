/**
 * stateStore.js - Central Application State & Math Utilities
 * TwoWords Betterment Platform
 */

window.appState = window.appState || {
  userPos: { lat: 37.8044, lng: -122.2712, heading: 0, speed: 0 },
  selectedWords: localStorage.getItem('twowords_selection') || '',
  currentARMode: 'cyber',
  viewMode: '3d',
  targetPOI: null,
  activeMatch: null,
  xp: 1250,
  level: 4,
  connectedServer: false,
  nearbyMatches: []
};

window.haversineDistance = function(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

window.getBearing = function(lat1, lon1, lat2, lon2) {
  const y = Math.sin((lon2-lon1)*Math.PI/180) * Math.cos(lat2*Math.PI/180);
  const x = Math.cos(lat1*Math.PI/180)*Math.sin(lat2*Math.PI/180) -
            Math.sin(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.cos((lon2-lon1)*Math.PI/180);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};

window.fmtDist = function(meters) {
  if (meters < 1000) return Math.round(meters) + ' m';
  return (meters / 1000).toFixed(1) + ' km';
};

window.fmtTime = function(meters, walkSpeedMps = 1.35) {
  const sec = meters / walkSpeedMps;
  if (sec < 60) return Math.round(sec) + ' sec';
  const min = Math.round(sec / 60);
  if (min < 60) return min + ' min';
  return (min / 60).toFixed(1) + ' hr';
};

window.shortestAngleDiff = function(target, current) {
  let diff = (target - current) % 360;
  if (diff < -180) diff += 360;
  if (diff > 180) diff -= 360;
  return diff;
};