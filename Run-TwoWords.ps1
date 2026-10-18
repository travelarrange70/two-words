<#
.SYNOPSIS
    TwoWords Master Synchronization & Launcher

.DESCRIPTION
    Automates the full TwoWords lifecycle:
    1. Synchronizes with GitHub (pulls updates from origin main, checks secondary remotes).
    2. Validates Node.js runtime and server dependencies.
    3. Manages port binding (detects and cleans up lingering processes on 3000/3443).
    4. Starts Node.js backend server (HTTP on 3000, HTTPS on 3443 with self-signed TLS).
    5. Discovers local network IPv4 for mobile Camera AR & GPS testing.
    6. Automatically launches your default web browser to http://localhost:3000.

.PARAMETER SkipGit
    Skip git pull and remote checks.

.PARAMETER SkipBrowser
    Do not launch the web browser automatically.

.PARAMETER ForceRestart
    Force kill any existing processes on ports 3000/3443 before starting.

.PARAMETER Push
    Push local commits to origin main and any configured remotes.
#>

[CmdletBinding()]
param(
    [switch]$SkipGit,
    [switch]$SkipBrowser,
    [switch]$ForceRestart,
    [switch]$Push
)

$ProjectRoot = $PSScriptRoot

# Check Node.js is installed
$nodeVersion = & node -v 2>$null
if (-not $nodeVersion) {
    Write-Host "`n[ERROR] Node.js is not found in PATH! Please install Node.js (https://nodejs.org)." -ForegroundColor Red
    exit 1
}

$scriptArgs = @()
if ($SkipGit) { $scriptArgs += "--skip-git" }
if ($SkipBrowser) { $scriptArgs += "--skip-browser" }
if ($ForceRestart) { $scriptArgs += "--force" }
if ($Push) { $scriptArgs += "--push" }

# Run the master Node script
$scriptPath = Join-Path $ProjectRoot "scripts\sync_and_launch.cjs"
& node $scriptPath @scriptArgs
