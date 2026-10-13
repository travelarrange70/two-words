/**
 * gisService.js - Spatial & Building Footprint Service
 */
const fs = require('fs');
const path = require('path');

let cachedBuildings = null;

function loadBuildingFootprints() {
  if (cachedBuildings) return cachedBuildings;
  const jsonPath = path.join(__dirname, '..', 'oakland_buildings.json');
  try {
    if (fs.existsSync(jsonPath)) {
      cachedBuildings = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      console.log('[GIS] Loaded ' + (cachedBuildings.features ? cachedBuildings.features.length : 0) + ' cached building footprints');
      return cachedBuildings;
    }
  } catch (err) {
    console.error('[GIS] Error reading oakland_buildings.json:', err.message);
  }
  return { type: "FeatureCollection", features: [] };
}

module.exports = {
  loadBuildingFootprints
};