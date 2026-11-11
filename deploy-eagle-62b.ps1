# Stage 62b deploy helper (file name deploy-eagle-62b.ps1).
# Run it from the project root (the folder with .git, frontend and backend):
#   powershell -ExecutionPolicy Bypass -File <path to>\deploy-eagle-62b.ps1
# It looks for stage62b-eagle-write*.zip in your Downloads folder. Different place:
#   powershell -ExecutionPolicy Bypass -File <path to>\deploy-eagle-62b.ps1 -Zip "C:\path\to\stage62b-eagle-write.zip"
param([string]$Zip = "")
$ErrorActionPreference = "Stop"

if (-not (Test-Path ".git") -or -not (Test-Path "frontend") -or -not (Test-Path "backend")) {
  throw "Run this from the project root (the folder with .git, frontend and backend)."
}

if ($Zip -eq "") {
  $found = Get-ChildItem (Join-Path $HOME "Downloads\stage62b-eagle-write*.zip") -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $found) { throw "stage62b-eagle-write zip was not found in Downloads. Download it again, or pass -Zip <path>." }
  $Zip = $found.FullName
}
if (-not (Test-Path $Zip)) { throw "Zip not found: $Zip" }
Write-Host "Using zip: $Zip"

git fetch origin
if ($LASTEXITCODE -ne 0) { throw "git fetch failed" }

$ahead = [int](git rev-list --count origin/main..HEAD)
if ($ahead -gt 0) {
  Write-Host "You have $ahead local commit(s) that were never pushed:"
  git log --oneline origin/main..HEAD
  throw "Push or discard them first (send me this output if unsure). Nothing was changed."
}

$dirty = git status --porcelain --untracked-files=no
if ($dirty) {
  Write-Host "You have uncommitted changes:"
  $dirty | Select-Object -First 15
  throw "Commit or stash them first, then run the script again."
}

git pull --ff-only
if ($LASTEXITCODE -ne 0) { throw "git pull failed" }

# The zip is flat: backend, frontend, e2e, README.md at its root.
Expand-Archive -Path $Zip -DestinationPath (Get-Location).Path -Force
if (-not (Test-Path "frontend\src\components\lux\EagleChat.tsx") -or -not (Test-Path "backend\src\lux-eagle.js")) {
  throw "Extraction did not produce the expected files. Nothing was committed."
}

# keep this helper itself out of the commit, wherever it was saved
Add-Content -Path ".git\info\exclude" -Value "deploy-eagle-62b.ps1"
git add -A
Write-Host "--- changes about to be committed ---"
git status --short

git commit -m "Stage 62: ask the eagle and eagle writing help (local-first, optional AI phrasing)"
if ($LASTEXITCODE -ne 0) { throw "git commit failed" }

git config http.postBuffer 524288000
$ok = $false
for ($i = 1; $i -le 3; $i++) {
  git push
  if ($LASTEXITCODE -eq 0) { $ok = $true; break }
  Write-Host "Push failed (attempt $i of 3), retrying in 5 seconds..."
  Start-Sleep -Seconds 5
}
if (-not $ok) { throw "git push failed 3 times. The commit is saved locally. Run 'git push' again in a minute, or send me the error." }

Write-Host ""
Write-Host "Pushed. Last step: open Render and click Manual Deploy."
