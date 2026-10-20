param (
    [string]$UnityPath = "C:\Program Files\Unity\Hub\Editor\6000.0.0f1\Editor\Unity.exe",
    [string]$Target = "Win64"
)

$projectDir = Get-Location
$buildDir = Join-Path $projectDir "Builds\$Target"

Write-Host "Cleaning temporary asset caches..." -ForegroundColor Yellow
Remove-Item -Path (Join-Path $projectDir "Temp") -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Triggering Unity Command-Line Build..." -ForegroundColor Cyan
if (Test-Path $UnityPath) {
    Start-Process -FilePath $UnityPath -ArgumentList "-quit", "-batchmode", "-projectPath", ""$projectDir"", "-buildWindows64Player", ""$buildDir\App.exe"" -Wait
    Write-Host "Build finished. Output saved to $buildDir" -ForegroundColor Green
} else {
    Write-Host "Unity executable not found at $UnityPath. Please update path in script." -ForegroundColor Red
}
