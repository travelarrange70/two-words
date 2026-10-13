/**
 * TwoWords — GPS / Location Manager
 * Handles geolocation API, heading from DeviceOrientation,
 * and publishes clean GPS events to the EventBus.
 */

import { Config }          from './config.js';
import { bus, Events }     from './eventbus.js';
import { state, setState } from './state.js';

let _watchId        = null;
let _orientationActive = false;

// Debounce timer for orientation events (fires every ~10-50ms on mobile)
let _orientDebounce = null;

// ── Public API ─────────────────────────────────────────────────────────────────

export function startGPS() {
  if (!navigator.geolocation) {
    bus.emit(Events.GPS_ERROR, { message: 'Geolocation not supported on this device.' });
    return;
  }
  _watchId = navigator.geolocation.watchPosition(
    _onPosition,
    _onGPSError,
    {
      enableHighAccuracy: Config.GPS_HIGH_ACCURACY,
      timeout:            Config.GPS_TIMEOUT_MS,
      maximumAge:         Config.GPS_MAX_AGE_MS,
    }
  );
}

export function stopGPS() {
  if (_watchId !== null) {
    navigator.geolocation.clearWatch(_watchId);
    _watchId = null;
  }
}

export async function requestOrientationPermission() {
  if (_orientationActive) return;
  // iOS 13+ requires explicit permission
  if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
    try {
      const result = await DeviceOrientationEvent.requestPermission();
      if (result === 'granted') _attachOrientationListener();
    } catch (e) {
      console.warn('[GPS] Orientation permission denied:', e.message);
    }
  } else {
    // Android & desktop — no permission needed
    _attachOrientationListener();
  }
}

export function getCurrentPosition() {
  return { ...state.player };
}

// ── Internals ─────────────────────────────────────────────────────────────────

function _onPosition(pos) {
  const { latitude: lat, longitude: lon, accuracy, altitude, speed } = pos.coords;

  // Filter out low-accuracy readings during initial lock
  const wasLocked = state.player.gpsLocked;
  const isGood    = accuracy <= Config.GPS_ACCURACY_THRESHOLD_M;

  setState('player', {
    lat, lon, accuracy,
    altitude: altitude ?? state.player.altitude,
    speed:    speed    ?? state.player.speed,
    gpsLocked: isGood,
  });

  bus.emit(Events.GPS_UPDATE, { lat, lon, accuracy, altitude, speed });
  if (isGood && !wasLocked) bus.emit(Events.GPS_LOCKED, { lat, lon });

  // Reverse geocode city name (throttled — only when moved > ~50m)
  _maybeReverseGeocode(lat, lon);
}

function _onGPSError(err) {
  const messages = {
    1: 'Location permission denied. Enable in browser settings.',
    2: 'GPS position unavailable. Move to an open area.',
    3: 'GPS request timed out. Retrying…',
  };
  bus.emit(Events.GPS_ERROR, { code: err.code, message: messages[err.code] || err.message });
}

function _attachOrientationListener() {
  _orientationActive = true;
  window.addEventListener('deviceorientation', _onOrientation, { passive: true });
}

function _onOrientation(e) {
  // Debounce to ~30 fps
  clearTimeout(_orientDebounce);
  _orientDebounce = setTimeout(() => {
    let heading = e.webkitCompassHeading ?? (e.alpha !== null ? (360 - e.alpha) % 360 : null);
    if (heading === null) return;
    heading = (heading + 360) % 360;
    setState('player', { heading });
    bus.emit(Events.HEADING_UPDATE, { heading });
  }, 33);
}

// Simple reverse geocode using Nominatim (free, no key)
let _lastGeocodeAt = { lat: 0, lon: 0 };
async function _maybeReverseGeocode(lat, lon) {
  const d = Math.hypot(lat - _lastGeocodeAt.lat, lon - _lastGeocodeAt.lon);
  if (d < 0.0005) return; // ~55m threshold
  _lastGeocodeAt = { lat, lon };
  try {
    const res  = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const json = await res.json();
    const addr = json.address;
    const city = addr.city || addr.town || addr.village || addr.county || 'Unknown';
    setState('player', { cityName: city });
  } catch (_) { /* silently ignore network failures */ }
}
