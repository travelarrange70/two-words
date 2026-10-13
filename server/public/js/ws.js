/**
 * TwoWords — WebSocket Manager
 * Handles connection lifecycle, exponential backoff reconnect,
 * message routing to the EventBus, and outbound message queue.
 */

import { Config }            from './config.js';
import { bus, Events }       from './eventbus.js';
import { state, setState }   from './state.js';

let _ws       = null;
let _retryTimer = null;
let _retries  = 0;

/** Message queue for messages sent while disconnected */
const _queue  = [];

// ── Public API ─────────────────────────────────────────────────────────────────

export function connect() {
  if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) return;
  _ws = new WebSocket(Config.WS_URL);
  _ws.onopen    = _onOpen;
  _ws.onmessage = _onMessage;
  _ws.onclose   = _onClose;
  _ws.onerror   = _onError;
}

/** Send a typed message. Queues if not connected. */
export function send(type, payload = {}) {
  const msg = JSON.stringify({ type, ...payload });
  if (_ws?.readyState === WebSocket.OPEN) {
    _ws.send(msg);
  } else {
    _queue.push(msg);
    if (_queue.length > 50) _queue.shift(); // cap queue
  }
}

export function disconnect() {
  clearTimeout(_retryTimer);
  _ws?.close();
  _ws = null;
}

export function isConnected() {
  return _ws?.readyState === WebSocket.OPEN;
}

// ── Internals ─────────────────────────────────────────────────────────────────

function _onOpen() {
  _retries = 0;
  const backoff = Config.WS_RECONNECT_BASE_MS;
  setState('ws', { connected: true, reconnectMs: backoff, retries: 0 });
  bus.emit(Events.WS_CONNECTED);
  console.info('[WS] Connected to', Config.WS_URL);

  // Flush queued messages
  while (_queue.length) {
    try { _ws.send(_queue.shift()); } catch(_) {}
  }
}

function _onMessage(event) {
  let data;
  try { data = JSON.parse(event.data); }
  catch (e) { console.warn('[WS] Non-JSON message:', event.data); return; }

  // Route to EventBus so any module can react without coupling to WS
  bus.emit(Events.WS_MESSAGE, data);

  // Also dispatch a DOM event for legacy inline handlers still in index.html
  document.dispatchEvent(new CustomEvent('tw-ws-message', { detail: data }));
}

function _onClose(e) {
  setState('ws', { connected: false });
  bus.emit(Events.WS_DISCONNECTED, { code: e.code, reason: e.reason });

  if (e.code === 1000) return; // clean close, don't reconnect

  // Exponential backoff with jitter
  const delay = Math.min(
    Config.WS_RECONNECT_MAX_MS,
    Config.WS_RECONNECT_BASE_MS * Math.pow(2, _retries) + Math.random() * 500
  );
  _retries++;
  setState('ws', { reconnectMs: delay, retries: _retries });
  console.info(`[WS] Disconnected. Retrying in ${Math.round(delay)}ms (attempt ${_retries})`);
  _retryTimer = setTimeout(connect, delay);
}

function _onError(e) {
  console.warn('[WS] Error:', e.message || e);
}

// ── Keepalive ping ─────────────────────────────────────────────────────────────
setInterval(() => {
  if (_ws?.readyState === WebSocket.OPEN) {
    try { _ws.send(JSON.stringify({ type: 'PING', ts: Date.now() })); } catch(_) {}
  }
}, Config.WS_KEEPALIVE_MS);
