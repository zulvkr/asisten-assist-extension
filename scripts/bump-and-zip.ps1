param (
    [Parameter(Position = 0)]
    [ValidateNotNullOrEmpty()]
    [string]$BumpType = "patch",

    [switch]$Commit,
    [switch]$Firefox,
    [switch]$All
)

$ErrorActionPreference = "Stop"

Write-Host "Updating package version ($BumpType)..." -ForegroundColor Cyan

# Update npm version
if ($Commit) {
    npm.cmd version $BumpType
} else {
    npm.cmd version $BumpType --no-git-tag-version
}

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to update package version."
    exit $LASTEXITCODE
}

# Read updated version from package.json
$pkg = Get-Content -Raw -Path "$PSScriptRoot/../package.json" | ConvertFrom-Json
$newVersion = $pkg.version

Write-Host "`nVersion updated to: $newVersion" -ForegroundColor Green
Write-Host "Building and creating zip package(s)..." -ForegroundColor Cyan

# Run zip for default (Chrome)
Write-Host "`nRunning npm run zip (Chrome)..." -ForegroundColor Yellow
npm.cmd run zip
if ($LASTEXITCODE -ne 0) {
    Write-Error "npm run zip failed."
    exit $LASTEXITCODE
}

# Optionally build firefox
if ($Firefox -or $All) {
    Write-Host "`nRunning npm run zip:firefox..." -ForegroundColor Yellow
    npm.cmd run zip:firefox
    if ($LASTEXITCODE -ne 0) {
        Write-Error "npm run zip:firefox failed."
        exit $LASTEXITCODE
    }
}

Write-Host "`nSuccessfully bumped version to v$newVersion and created zip package in .output/" -ForegroundColor Green
