# Two Words 🎯 

> A real-world GPS social navigation game connecting people and destinations through two-word ambitions.

Users input **two words** capturing their ambition or vibe (e.g., *"PLAY GOLF"*, *"CYBER RUN"*, *"BEACH VIBES"*, *"NIGHT WALK"*). The app instantly generates real-world destinations, 3D cartography, Live View AR guidance, and discovers nearby players sharing similar ambitions.

---

## 🚀 Quick Start

### Option 1: One-Click Launch (Windows)
Double-click `run.bat` or run in PowerShell:
```powershell
.\Run-TwoWords.ps1
```
This script automatically:
1. Verifies your Node.js runtime and dependencies
2. Starts the backend server (HTTP `3000` & HTTPS `3443` for Camera AR & GPS)
3. Detects your LAN IPv4 address for mobile testing
4. Opens your default browser to `http://localhost:3000`

### Option 2: Node.js Server Direct
```bash
cd server
npm install
node server.js
```
Then open `http://localhost:3000` in any browser.

---

## 📱 Playing on Android / Mobile

1. **Local Wi-Fi Network**:
   - Start the server on your computer using `run.bat`.
   - The launcher will output your local network address (e.g., `https://192.168.x.x:3443`).
   - Open that URL in Chrome on your Android device (accept the self-signed certificate for local HTTPS).
2. **PWA / Add to Home Screen**:
   - In Chrome on Android, tap the three dots **(⋮)** and select **Add to Home screen** / **Install App**.
   - Launch TwoWords from your home screen as a full-screen native-like app with GPS and Camera AR enabled.
3. **Stand-alone Web / APK**:
   - The game runs directly in any modern mobile browser via `index.html`.
   - On the intro screen, type your two words into Box 1 and Box 2, tap "Next" on your keyboard or choose any of the quick-suggestion chips, and tap **Find My Matches ➔** to start.

---

## 🌟 Key Features

- **2-Word Ambition Engine**: Enter any 2 words to automatically locate matching points of interest via OpenStreetMap.
- **Mobile-Optimized Intro Screen**: Auto-splitting of two-word entries, native Android soft keyboard navigation (`enterkeyhint="next"` / `enterkeyhint="go"`), and touch-friendly quick chips.
- **Live 3D Cartography & Bird's-Eye View**: MapLibre 3D vector map, procedural building heights, and real-time player GPS marker.
- **Augmented Reality Live View**: Camera AR overlay with directional compass HUD, target beacons, distance indicator, and heading damping.
- **Custom Character Creator**: Customize your avatar emoji icon, glow aura color, and player style.
- **Real-time Discovery & WebSocket**: Sync ambitions and locate nearby players via WebSocket on port `3000`/`3443`.

---

## 🛠️ Project Structure

```
TwoWords/
├── index.html                   # Main stand-alone web application & game client
├── MASTER_index.html            # Master client template
├── manifest.json                # Progressive Web App (PWA) manifest
├── sw.js                        # Service Worker for offline PWA caching
├── run.bat                      # One-click Windows launcher
├── Run-TwoWords.ps1             # PowerShell master sync and launcher
├── scripts/
│   └── sync_and_launch.cjs      # Server check, port manager, and network IP detector
└── server/
    ├── server.js                # Express + WebSocket HTTP/HTTPS server
    ├── package.json             # Server dependencies
    └── public/
        └── index.html           # Production client bundle served on :3000/:3443
```

---

## 📄 License

MIT
