/**
 * TwoWords — Geo Utilities
 * Pure functions for coordinate math and geospatial calculations.
 * No side effects, no imports — safe to use anywhere.
 */

const R = 6371000; // Earth radius in meters

/**
 * Haversine distance between two lat/lon points in meters.
 */
export function distanceMeters(lat1, lon1, lat2, lon2) {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Initial bearing (degrees) from point A to point B.
 * 0° = North, 90° = East.
 */
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y   = Math.sin(Δλ) * Math.cos(φ2);
  const x   = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/**
 * Relative bearing: how far left/right the target is from the player's heading.
 * Returns value in [-180, 180].
 */
export function relativeBearing(playerHeading, targetBearing) {
  let rel = (targetBearing - playerHeading + 540) % 360 - 180;
  return rel;
}

/**
 * Move a lat/lon point by (dx meters East, dy meters North).
 */
export function offsetLatLon(lat, lon, dxMeters, dyMeters) {
  const dLat = (dyMeters / R) * (180 / Math.PI);
  const dLon = (dxMeters / R) * (180 / Math.PI) / Math.cos((lat * Math.PI) / 180);
  return { lat: lat + dLat, lon: lon + dLon };
}

/**
 * Walk forward `meters` in the direction of `headingDeg`.
 */
export function walkForward(lat, lon, headingDeg, meters) {
  const rad = (headingDeg * Math.PI) / 180;
  const dx  = Math.sin(rad) * meters;
  const dy  = Math.cos(rad) * meters;
  return offsetLatLon(lat, lon, dx, dy);
}

/**
 * Convert meters to canvas pixels at a given zoom / scale factor.
 */
export function metersToPixels(meters, metersPerPixel) {
  return meters / metersPerPixel;
}

/**
 * Project a 3D AR point from world-space to screen-space.
 * Returns { x, y, visible } where visible = point is in front of camera.
 *
 * @param {number} relBearing  — horizontal bearing relative to view direction (deg)
 * @param {number} elevationDeg — vertical angle to target (deg, positive = up)
 * @param {number} fovH        — horizontal field of view (deg)
 * @param {number} fovV        — vertical field of view (deg)
 * @param {number} canvasW     — canvas width in px
 * @param {number} canvasH     — canvas height in px
 */
export function projectToScreen(relBearing, elevationDeg, fovH, fovV, canvasW, canvasH) {
  const halfH = fovH / 2;
  const halfV = fovV / 2;

  if (Math.abs(relBearing) > halfH + 20) return { x: 0, y: 0, visible: false };

  const x = canvasW / 2 + (relBearing / halfH) * (canvasW / 2);
  const y = canvasH / 2 - (elevationDeg / halfV) * (canvasH / 2);

  return { x, y, visible: true };
}

/**
 * Smooth lerp — used for heading/pitch interpolation each frame.
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Lerp for angles, correctly handles the 0°/360° wrap.
 */
export function lerpAngle(a, b, t) {
  let diff = ((b - a + 540) % 360) - 180;
  return (a + diff * t + 360) % 360;
}

/**
 * Format meters to human-readable string.
 */
export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Format seconds to mm:ss or h:mm.
 */
export function formatDuration(seconds) {
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

/**
 * Compass heading to cardinal direction string.
 */
export function headingToCardinal(deg) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(deg / 45) % 8];
}
