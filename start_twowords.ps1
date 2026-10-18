# TwoWords PowerShell Full Stack Launcher
$ProjectRoot = $PSScriptRoot
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Launching TwoWords Backend and Frontend..." -ForegroundColor Yellow
Write-Host "======================================================" -ForegroundColor Cyan

# Check if port 3000 is already in use
$conn = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if (-not $conn) {
    Write-Host "Starting Node.js server..." -ForegroundColor Green
    Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", "cd `"$ProjectRoot`"; node server/server.js"
    Start-Sleep -Seconds 2
} else {
    Write-Host "Server already listening on port 3000." -ForegroundColor Green
}

# Launch browser
Write-Host "Opening frontend in default browser..." -ForegroundColor Cyan
Start-Process "http://localhost:3000"

Write-Host "TwoWords is now live at http://localhost:3000!" -ForegroundColor Green
