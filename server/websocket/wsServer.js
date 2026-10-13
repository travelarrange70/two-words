/**
 * wsServer.js - WebSocket Connection Handler & Telemetry Synchronizer
 */
const { WebSocketServer, WebSocket } = require('ws');

const activeSockets = new Set();

function initWebSocketServer(server, sslServer) {
  const wss = new WebSocketServer({ server });
  
  wss.on('connection', (ws, req) => {
    activeSockets.add(ws);
    console.log('[WS] Client connected. Active clients:', activeSockets.size);

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        } else if (data.type === 'location_update') {
          broadcast({ type: 'player_moved', player: data.player }, ws);
        }
      } catch (e) {}
    });

    ws.on('close', () => {
      activeSockets.delete(ws);
      console.log('[WS] Client disconnected. Active clients:', activeSockets.size);
    });

    ws.on('error', (err) => {
      console.error('[WS] Error:', err.message);
    });
  });

  if (sslServer) {
    const wssSSL = new WebSocketServer({ server: sslServer });
    wssSSL.on('connection', (ws) => {
      activeSockets.add(ws);
      ws.on('close', () => activeSockets.delete(ws));
    });
  }

  return wss;
}

function broadcast(data, excludeWs = null) {
  const payload = JSON.stringify(data);
  for (const client of activeSockets) {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

module.exports = {
  initWebSocketServer,
  broadcast
};