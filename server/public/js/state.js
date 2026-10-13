/**
 * TwoWords — StateManager
 * Single immutable-style reactive state store.
 * Eliminates the 88 scattered global let/var declarations.
 *
 * Usage:
 *   import { state, setState } from './state.js';
 *   const lat = state.player.lat;
 *   setState('player', { lat: 37.8 }); // shallow merge
 */

import { bus, Events } from './eventbus.js';

// ── Initial State ─────────────────────────────────────────────────────────────
const _state = {
  /** Player's current GPS position & orientation */
  player: {
    lat:       37.804456,
    lon:      -122.271356,
    heading:   45,
    pitch:      0,
    altitude:   0,
    accuracy:  99,
    speed:      0,
    cityName:  'Loading…',
    gpsLocked: false,
  },

  /** The player's profile / identity */
  profile: {
    avatar:    localStorage.getItem('tw_avatar') || '🎯',
    name:      localStorage.getItem('tw_name')   || 'Player',
    aura:      localStorage.getItem('tw_aura')   || '#00d4ff',
    style:     localStorage.getItem('tw_style')  || 'explorer',
    word1:     '',
    word2:     '',
    get words() { return `${this.word1} ${this.word2}`.trim() || 'PLAY GOLF'; },
  },

  /** Active navigation destination (match / POI) */
  destination: {
    lat:    null,
    lon:    null,
    name:   'Alex M.',
    avatar: '🏌️',
    words:  'PLAY GOLF',
    bearing:  0,
    distance: 0,
  },

  /** AR subsystem */
  ar: {
    open:         false,
    mode:         'realmap',  // realmap | cyber | streetview | satellite | camera
    heading:      45,
    pitch:         0,
    smoothHeading: 45,
    smoothPitch:   0,
    dragging:     false,
    autoWalking:  false,
    cameraFacing: 'environment',
  },

  /** Live broadcast */
  live: {
    active:    false,
    viewers:   0,
    reach:    'nearby',
    stream:    null,
  },

  /** WebSocket connection */
  ws: {
    connected:    false,
    reconnectMs:  1000,
    retries:      0,
  },

  /** POIs loaded from server */
  pois: [],

  /** Other online players */
  nearbyPlayers: [],

  /** UI flags */
  ui: {
    mapReady:        false,
    gmapsApiLoaded:  false,
    realMap3DInit:   false,
    torchOn:         false,
    audioMuted:      false,
    introComplete:   false,
    avatarCreated:   !!localStorage.getItem('tw_avatar'),
  },
};

// ── Proxy-based reactive state ─────────────────────────────────────────────────
function makeReactive(obj, path = '') {
  return new Proxy(obj, {
    get(target, key) {
      const val = target[key];
      return (val && typeof val === 'object' && !Array.isArray(val))
        ? makeReactive(val, path ? `${path}.${key}` : key)
        : val;
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    }
  });
}

export const state = makeReactive(_state);

/**
 * Merge partial updates into a top-level state slice.
 * Emits a 'state:<slice>' event after update.
 *
 * @param {string} slice   — top-level key of _state
 * @param {object} partial — fields to shallow-merge
 */
export function setState(slice, partial) {
  if (!(slice in _state)) {
    console.warn(`[State] Unknown slice: "${slice}"`);
    return;
  }
  if (typeof partial !== 'object' || Array.isArray(partial)) {
    _state[slice] = partial;
  } else {
    Object.assign(_state[slice], partial);
  }
  bus.emit(`state:${slice}`, _state[slice]);
}

/**
 * Subscribe to changes on a state slice.
 * @param {string}   slice
 * @param {Function} handler  — called with the updated slice object
 * @returns {Function} unsubscribe
 */
export function onState(slice, handler) {
  return bus.on(`state:${slice}`, handler);
}

/** Persist profile to localStorage */
export function saveProfile() {
  const p = _state.profile;
  localStorage.setItem('tw_avatar', p.avatar);
  localStorage.setItem('tw_name',   p.name);
  localStorage.setItem('tw_aura',   p.aura);
  localStorage.setItem('tw_style',  p.style);
}

/** Convenience: get raw (non-proxied) snapshot of a slice */
export function snapshot(slice) {
  return { ..._state[slice] };
}
