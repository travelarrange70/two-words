/**
 * TwoWords — EventBus
 * Lightweight typed publish/subscribe event system.
 * Replaces scattered global state mutations and callback chains.
 *
 * Usage:
 *   import { bus } from './eventbus.js';
 *   bus.on('gps:update', ({ lat, lon }) => { ... });
 *   bus.emit('gps:update', { lat: 37.8, lon: -122.3 });
 *   const off = bus.on('gps:update', handler); off(); // unsubscribe
 */

class EventBus {
  #listeners = new Map();

  /**
   * Subscribe to an event.
   * @param {string} event
   * @param {Function} handler
   * @returns {Function} unsubscribe function
   */
  on(event, handler) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  /** Subscribe once — auto-removes after first emit */
  once(event, handler) {
    const wrapper = (...args) => { handler(...args); this.off(event, wrapper); };
    return this.on(event, wrapper);
  }

  /** Unsubscribe */
  off(event, handler) {
    this.#listeners.get(event)?.delete(handler);
  }

  /** Emit an event with optional payload */
  emit(event, payload) {
    this.#listeners.get(event)?.forEach(h => {
      try { h(payload); }
      catch (err) { console.error(`[EventBus] Handler error on "${event}":`, err); }
    });
  }

  /** Remove all listeners for an event (or all events) */
  clear(event) {
    if (event) this.#listeners.delete(event);
    else this.#listeners.clear();
  }

  /** Debug — list all active event types */
  get activeEvents() {
    return [...this.#listeners.keys()].filter(k => this.#listeners.get(k).size > 0);
  }
}

/** Global singleton bus */
export const bus = new EventBus();

/**
 * Standard TwoWords event names.
 * Use these constants instead of raw strings to catch typos at dev time.
 */
export const Events = Object.freeze({
  // GPS / Location
  GPS_UPDATE:         'gps:update',
  GPS_LOCKED:         'gps:locked',
  GPS_ERROR:          'gps:error',
  HEADING_UPDATE:     'heading:update',
  PITCH_UPDATE:       'pitch:update',

  // Player
  PLAYER_MOVE:        'player:move',
  PLAYER_WORDS_SET:   'player:words',
  PLAYER_AVATAR_SET:  'player:avatar',

  // AR View
  AR_OPEN:            'ar:open',
  AR_CLOSE:           'ar:close',
  AR_MODE_CHANGE:     'ar:mode',
  AR_FRAME:           'ar:frame',

  // Camera
  CAMERA_START:       'camera:start',
  CAMERA_STOP:        'camera:stop',
  CAMERA_ERROR:       'camera:error',

  // WebSocket
  WS_CONNECTED:       'ws:connected',
  WS_DISCONNECTED:    'ws:disconnected',
  WS_MESSAGE:         'ws:message',

  // UI
  NOTIFICATION:       'ui:notification',
  MODAL_OPEN:         'ui:modal:open',
  MODAL_CLOSE:        'ui:modal:close',

  // Live / Social
  LIVE_START:         'live:start',
  LIVE_STOP:          'live:stop',
  LIVE_VIEWER_JOIN:   'live:viewer:join',
  LIVE_BROADCAST:     'live:broadcast',
});
