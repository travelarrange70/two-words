/**
 * TwoWords — Central Configuration
 * All constants, feature flags, and runtime config in one place.
 * Import via: import { Config } from './config.js'
 */
export const Config = Object.freeze({

  // ── App Identity ──────────────────────────────────────────────
  APP_NAME:    'TwoWords',
  APP_VERSION: '2.0.0',

  // ── Server / WebSocket ────────────────────────────────────────
  get WS_URL() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const port  = location.protocol === 'https:' ? '3443' : '3000';
    return `${proto}//${location.hostname || 'localhost'}:${port}`;
  },
  HTTP_PORT:  3000,
  HTTPS_PORT: 3443,

  // ── Map ───────────────────────────────────────────────────────
  DEFAULT_LAT:  37.804456,
  DEFAULT_LON: -122.271356,
  DEFAULT_HEADING: 45,
  MAP_STYLE_DAY:       'https://tiles.openfreemap.org/styles/liberty',
  MAP_STYLE_SATELLITE: 'https://tiles.openfreemap.org/styles/dark',
  BUILDING_EXTRUSION_HEIGHT_SCALE: 1.0,

  // ── AR ────────────────────────────────────────────────────────
  AR_FOV_DEG:          75,
  AR_NEAR_CLIP:         0.1,
  AR_FAR_CLIP:       1500,
  AR_HEADING_SMOOTH:    0.08,  // lerp factor
  AR_PITCH_SMOOTH:      0.10,
  WALK_STEP_METERS:     3.5,
  MAX_PITCH_DEG:       60,

  // ── GPS / Location ────────────────────────────────────────────
  GPS_ACCURACY_THRESHOLD_M: 20,
  GPS_HIGH_ACCURACY: true,
  GPS_TIMEOUT_MS:  10000,
  GPS_MAX_AGE_MS:   5000,

  // ── Camera ────────────────────────────────────────────────────
  CAMERA_IDEAL_WIDTH:  1920,
  CAMERA_IDEAL_HEIGHT: 1080,
  CAMERA_MOBILE_SIMPLE: true,  // use simple constraints on mobile

  // ── Live Broadcast ────────────────────────────────────────────
  LIVE_VIEWER_TICK_MS: 3000,

  // ── WebSocket ─────────────────────────────────────────────────
  WS_RECONNECT_BASE_MS:   1000,
  WS_RECONNECT_MAX_MS:   30000,
  WS_KEEPALIVE_MS:       25000,

  // ── Animation ────────────────────────────────────────────────
  TARGET_FPS:         60,
  CANVAS_SCALE:       window.devicePixelRatio || 1,

  // ── POI ──────────────────────────────────────────────────────
  POI_MAX_DISPLAY_DISTANCE_M: 800,

  // ── Colours / Theme ──────────────────────────────────────────
  ACCENT_CYAN:  '#00e5ff',
  ACCENT_GREEN: '#00ff99',
  ACCENT_PINK:  '#ff3366',
  ACCENT_BLUE:  '#1a73e8',
  BG_DARK:      '#030305',

  // ── Feature Flags ────────────────────────────────────────────
  FEATURES: {
    SOCIAL_HUB:      true,
    GO_LIVE:         true,
    AVATAR_CREATOR:  true,
    STREET_VIEW:     true,
    SATELLITE:       true,
    CYBER_CITY:      true,
    AUDIO:           true,
    PWA:             true,
  },
});
