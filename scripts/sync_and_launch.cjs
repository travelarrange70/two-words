/**
 * TwoWords - Master Synchronization & Launcher Script
 * Handles:
 *  1. Git pulling latest commits from origin (main branch).
 *  2. Checking secondary remote (stupidus3rsu-arch/TwoWords) and handling GitHub sync.
 *  3. Verifying Node.js environment and server dependencies.
 *  4. Cleaning up dangling/old server processes on ports 3000/3443.
 *  5. Launching Node.js backend server with real-time logs.
 *  6. Displaying LAN & mobile connection URLs (with HTTPS cert instructions).
 *  7. Automatically launching default browser to http://localhost:3000.
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SERVER_DIR = path.join(PROJECT_ROOT, 'server');
const PORT_HTTP = 3000;
const PORT_HTTPS = 3443;

const ARGS = process.argv.slice(2);
const SKIP_GIT = ARGS.includes('--skip-git');
const SKIP_BROWSER = ARGS.includes('--skip-browser');
const FORCE_RESTART = ARGS.includes('--force') || ARGS.includes('-f');
const PUSH_ORIGIN = ARGS.includes('--push');

// ANSI color helpers
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m'
};

function log(msg, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

function getLocalIP() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

function getGitToken() {
  try {
    const out = execSync('git credential fill', {
      input: 'protocol=https\nhost=github.com\n',
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf8'
    });
    const match = out.match(/password=(.+)/);
    return match ? match[1].trim() : null;
  } catch (_) {
    return null;
  }
}

async function githubRequest(endpoint, method = 'GET', data = null, token = null) {
  return new Promise((resolve) => {
    if (!token) return resolve({ ok: false, status: 401, error: 'No token' });
    const payload = data ? JSON.stringify(data) : null;
    const req = https.request(`https://api.github.com${endpoint}`, {
      method,
      headers: {
        'User-Agent': 'TwoWords-Launcher',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (_) {}
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: json });
      });
    });
    req.on('error', (err) => resolve({ ok: false, status: 0, error: err.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

async function syncGit() {
  log('\n[1/5] Synchronizing Git Repositories...', colors.cyan);

  try {
    // 1. Fetch & Pull from origin
    log('  → Fetching from origin (travelarrange70/two-words)...', colors.dim);
    execSync('git fetch origin main', { cwd: PROJECT_ROOT, stdio: 'ignore' });
    const pullOut = execSync('git pull origin main', { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
    log(`  ✅ Origin Sync: ${pullOut.split('\n')[0]}`, colors.green);

    // Optional push to origin if requested
    if (PUSH_ORIGIN) {
      log('  → Pushing local commits to origin main...', colors.dim);
      execSync('git push origin main', { cwd: PROJECT_ROOT, stdio: 'inherit' });
      log('  ✅ Pushed to origin main.', colors.green);
    }
  } catch (err) {
    log(`  ⚠️  Git pull notice: ${err.message}`, colors.yellow);
  }

  // 2. Check secondary remote 'stupidus'
  try {
    const remotes = execSync('git remote', { cwd: PROJECT_ROOT, encoding: 'utf8' });
    if (remotes.includes('stupidus')) {
      log('  → Checking secondary remote (stupidus3rsu-arch/TwoWords)...', colors.dim);
      let repoExists = false;
      try {
        execSync('git ls-remote stupidus', { cwd: PROJECT_ROOT, stdio: 'ignore' });
        repoExists = true;
      } catch (_) {
        repoExists = false;
      }

      if (repoExists) {
        log('  → Pushing to stupidus3rsu-arch/TwoWords...', colors.dim);
        try {
          execSync('git push stupidus main', { cwd: PROJECT_ROOT, stdio: 'inherit' });
          log('  ✅ Successfully synced to stupidus3rsu-arch/TwoWords!', colors.green);
        } catch (e) {
          log(`  ⚠️  Push failed to stupidus: ${e.message}`, colors.yellow);
        }
      } else {
        log('  ℹ️  Remote repo "stupidus3rsu-arch/TwoWords" does not exist yet on GitHub.', colors.yellow);
        const token = getGitToken();
        if (token) {
          const authUser = await githubRequest('/user', 'GET', null, token);
          if (authUser.ok && authUser.data?.login === 'stupidus3rsu-arch') {
            log('  → Authenticated as stupidus3rsu-arch! Creating repository "TwoWords"...', colors.cyan);
            const createRes = await githubRequest('/user/repos', 'POST', {
              name: 'TwoWords',
              description: 'TwoWords - GPS-based 2-word ambition matching game with AR, Cyber 3D, and satellite modes',
              private: false
            }, token);
            if (createRes.ok) {
              log('  ✅ Created repository on GitHub! Pushing code...', colors.green);
              execSync('git push -u stupidus main', { cwd: PROJECT_ROOT, stdio: 'inherit' });
              log('  ✅ Pushed to stupidus3rsu-arch/TwoWords!', colors.green);
            } else {
              log(`  ⚠️  Could not auto-create repo: ${createRes.data?.message || createRes.status}`, colors.yellow);
            }
          } else {
            log(`  ℹ️  Current GitHub credentials belong to "${authUser.data?.login || 'unknown'}".`, colors.dim);
            log('     To push to stupidus3rsu-arch, create the repo at https://github.com/new under that account, then rerun with --push.', colors.dim);
          }
        }
      }
    }
  } catch (err) {
    log(`  ⚠️  Remote check note: ${err.message}`, colors.yellow);
  }
}

function verifyDependencies() {
  log('\n[2/5] Verifying Dependencies...', colors.cyan);
  const nodeModulesPath = path.join(SERVER_DIR, 'node_modules');

  if (!fs.existsSync(nodeModulesPath)) {
    log('  → node_modules missing in server/. Running npm install...', colors.yellow);
    execSync('npm install', { cwd: SERVER_DIR, stdio: 'inherit' });
    log('  ✅ Dependencies installed successfully.', colors.green);
  } else {
    log('  ✅ Dependencies already installed.', colors.green);
  }
}

function killProcessOnPort(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    const lines = out.split('\n').filter(l => l.includes('LISTENING'));
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0' && pid !== `${process.pid}`) {
        log(`  → Terminating existing process on port ${port} (PID ${pid})...`, colors.yellow);
        try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch (_) {}
      }
    }
  } catch (_) {}
}

function checkAndFreePorts() {
  log('\n[3/5] Checking Network Ports (3000 & 3443)...', colors.cyan);
  if (FORCE_RESTART) {
    log('  → Force restart requested: clearing any listening processes...', colors.dim);
    killProcessOnPort(PORT_HTTP);
    killProcessOnPort(PORT_HTTPS);
    log('  ✅ Ports cleared.', colors.green);
  } else {
    try {
      const out = execSync(`netstat -ano | findstr :${PORT_HTTP}`, { encoding: 'utf8' });
      if (out.includes('LISTENING')) {
        log(`  ℹ️  Port ${PORT_HTTP} is already active. Will restart server for fresh session.`, colors.yellow);
        killProcessOnPort(PORT_HTTP);
        killProcessOnPort(PORT_HTTPS);
      }
    } catch (_) {}
    log('  ✅ Ports 3000 and 3443 ready.', colors.green);
  }
}

async function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ready = await new Promise((resolve) => {
      const req = http.get(url, (res) => resolve(res.statusCode < 500));
      req.on('error', () => resolve(false));
      req.setTimeout(800, () => { req.destroy(); resolve(false); });
    });
    if (ready) return true;
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

function launchBrowser(url) {
  if (SKIP_BROWSER) {
    log('\n  ℹ️  Browser auto-launch skipped (--skip-browser).', colors.dim);
    return;
  }
  log(`\n[5/5] Opening default browser to ${url}...`, colors.cyan);
  try {
    const startCmd = process.platform === 'win32' ? `start "" "${url}"` :
                     process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    execSync(startCmd, { stdio: 'ignore', shell: true });
    log('  ✅ Browser launched.', colors.green);
  } catch (err) {
    log(`  ⚠️  Could not launch browser automatically: ${err.message}`, colors.yellow);
  }
}

async function main() {
  console.log('\n' + '='.repeat(64));
  log('   🚀 TwoWords - Master Sync, Builder & Launcher', colors.bright + colors.magenta);
  console.log('='.repeat(64));

  // 1. Git Sync
  if (!SKIP_GIT) {
    await syncGit();
  } else {
    log('\n[1/5] Git Sync skipped (--skip-git)', colors.dim);
  }

  // 2. Dependencies
  verifyDependencies();

  // 3. Port check
  checkAndFreePorts();

  // 4. Start Server
  log('\n[4/5] Launching Node.js Backend Server...', colors.cyan);
  const localIP = getLocalIP();

  const serverProc = spawn('node', ['server/server.js'], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    detached: false
  });

  serverProc.on('error', (err) => {
    log(`❌ Failed to start server: ${err.message}`, colors.red);
    process.exit(1);
  });

  // Wait for HTTP server to become responsive
  const serverReady = await waitForServer(`http://localhost:${PORT_HTTP}/`);
  if (!serverReady) {
    log('⚠️  Server took longer than expected to respond, but process is running.', colors.yellow);
  }

  // Display status & connection links
  console.log('\n' + '-'.repeat(64));
  log(' ✨ TWOWORDS IS NOW LIVE AND READY!', colors.bright + colors.green);
  console.log('-'.repeat(64));
  log(`  🖥️  Desktop Web:   http://localhost:${PORT_HTTP}`, colors.bright + colors.cyan);
  log(`  📱  Mobile LAN:     https://${localIP}:${PORT_HTTPS}`, colors.bright + colors.yellow);
  console.log('-'.repeat(64));
  log('  💡 Mobile Instructions:');
  log('     1. Connect phone to the same Wi-Fi network.');
  log(`     2. Navigate to https://${localIP}:${PORT_HTTPS}`);
  log('     3. Accept the self-signed TLS warning (Advanced → Proceed) to enable Camera AR & GPS.');
  console.log('-'.repeat(64));

  // 5. Open browser
  launchBrowser(`http://localhost:${PORT_HTTP}`);

  log('\n  Press Ctrl+C anytime to stop the server.\n', colors.dim);

  // Handle clean exit
  process.on('SIGINT', () => {
    log('\nShutting down TwoWords server...', colors.yellow);
    try { serverProc.kill(); } catch (_) {}
    process.exit(0);
  });
}

main().catch(err => {
  console.error('\n❌ Fatal Error:', err);
  process.exit(1);
});
