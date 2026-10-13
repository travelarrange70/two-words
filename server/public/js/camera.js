/**
 * TwoWords — Camera Manager
 * Handles getUserMedia with mobile/HTTPS detection,
 * torch control, front/back flip, and clean teardown.
 */

import { Config }        from './config.js';
import { bus, Events }   from './eventbus.js';
import { state, setState } from './state.js';

let _stream     = null;
let _videoEl    = null;

// ── Public API ─────────────────────────────────────────────────────────────────

/** Start camera and pipe to a <video> element */
export async function startCamera(videoElement, facingMode = state.ar.cameraFacing) {
  _videoEl = videoElement;

  // ── Security gate: getUserMedia blocked on HTTP + LAN IP ──────────────────
  if (!_isSecureContext()) {
    bus.emit(Events.CAMERA_ERROR, { type: 'NEEDS_HTTPS', httpsUrl: _buildHttpsUrl() });
    return false;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    bus.emit(Events.CAMERA_ERROR, { type: 'NOT_SUPPORTED', message: 'Camera API not available.' });
    return false;
  }

  // Stop any existing stream
  await stopCamera();

  try {
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    const constraints = isMobile || Config.CAMERA_MOBILE_SIMPLE
      ? { video: { facingMode: { ideal: facingMode } } }
      : { video: {
            facingMode:  { ideal: facingMode },
            width:       { ideal: Config.CAMERA_IDEAL_WIDTH },
            height:      { ideal: Config.CAMERA_IDEAL_HEIGHT },
          }
        };

    _stream = await navigator.mediaDevices.getUserMedia(constraints);

    if (_videoEl) {
      _videoEl.srcObject = _stream;
      _videoEl.style.display = 'block';
      await _videoEl.play().catch(() => {});
    }

    setState('ar', { cameraFacing: facingMode });
    bus.emit(Events.CAMERA_START, { facingMode });
    return true;

  } catch (err) {
    console.warn('[Camera] getUserMedia failed:', err.name, err.message);

    const type =
      (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
        ? (_isSecureContext() ? 'PERMISSION_DENIED' : 'NEEDS_HTTPS')
        : err.name === 'NotFoundError' ? 'NOT_FOUND'
        : 'UNKNOWN';

    bus.emit(Events.CAMERA_ERROR, {
      type,
      message: err.message,
      httpsUrl: _buildHttpsUrl(),
    });
    return false;
  }
}

/** Flip between front and rear camera */
export async function flipCamera() {
  const next = state.ar.cameraFacing === 'environment' ? 'user' : 'environment';
  return startCamera(_videoEl, next);
}

/** Stop the active camera stream */
export async function stopCamera() {
  if (_stream) {
    _stream.getTracks().forEach(t => t.stop());
    _stream = null;
  }
  if (_videoEl) {
    _videoEl.srcObject = null;
    _videoEl.style.display = 'none';
  }
  bus.emit(Events.CAMERA_STOP);
}

/** Toggle device torch / flashlight */
export async function toggleTorch() {
  const track = _stream?.getVideoTracks()[0];
  if (!track) return;
  const caps = track.getCapabilities?.() ?? {};
  if (!caps.torch) return;

  const torchOn = !state.ui.torchOn;
  try {
    await track.applyConstraints({ advanced: [{ torch: torchOn }] });
    setState('ui', { torchOn });
  } catch (e) { console.warn('[Camera] Torch failed:', e); }
}

export function isActive()   { return !!_stream; }
export function getStream()  { return _stream; }

// ── Internals ─────────────────────────────────────────────────────────────────

function _isSecureContext() {
  return (
    location.protocol === 'https:' ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1'
  );
}

function _buildHttpsUrl() {
  return location.href
    .replace(/^http:\/\//, 'https://')
    .replace(/:(\d+)/, ':3443');
}
