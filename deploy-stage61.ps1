# Stage 61 deploy helper.
# Run it from the project root (the folder that contains .git, frontend and backend):
#   powershell -ExecutionPolicy Bypass -File .\deploy-stage61.ps1
# If the zip is not in your Downloads folder:
#   powershell -ExecutionPolicy Bypass -File .\deploy-stage61.ps1 -Zip "C:\path\to\stage61-lux.zip"
param([string]$Zip = (Join-Path $HOME "Downloads\stage61-lux.zip"))
$ErrorActionPreference = "Stop"

if (-not (Test-Path ".git") -or -not (Test-Path "frontend") -or -not (Test-Path "backend")) {
  throw "Run this from the project root (the folder with .git, frontend and backend)."
}
if (-not (Test-Path $Zip)) { throw "Zip not found: $Zip  (pass -Zip <path>)" }

# Stop if there are local edits to tracked files, so nothing of yours gets mixed into this commit.
$dirty = git status --porcelain --untracked-files=no
if ($dirty) {
  Write-Host "You have uncommitted changes:"
  $dirty | Select-Object -First 15
  throw "Commit or stash them first, then run the script again."
}

git pull --ff-only
if ($LASTEXITCODE -ne 0) { throw "git pull failed" }

# Step 1: copy the files over the project (the zip is flat: backend, frontend, README.md)
if (Get-Command tar -ErrorAction SilentlyContinue) { tar -xf $Zip -C (Get-Location).Path }
else { Expand-Archive -Path $Zip -DestinationPath (Get-Location).Path -Force }
if ($LASTEXITCODE -ne 0) { throw "Extracting the zip failed" }

# Step 2: remove the stray stage61 folder that was committed by mistake
if (Test-Path "stage61") {
  git rm -r -q --ignore-unmatch stage61
  Remove-Item "stage61" -Recurse -Force -ErrorAction SilentlyContinue
}

git add -A
Write-Host "--- changes about to be committed (first 25) ---"
git status --short | Select-Object -First 25

git commit -m "Stage 61: eagle intro, trail, insights, wrapped, live presence, comfort wizard, how-it-works canvas"
if ($LASTEXITCODE -ne 0) { throw "git commit failed" }
git push
if ($LASTEXITCODE -ne 0) { throw "git push failed" }

Write-Host ""
Write-Host "Pushed. Last step: open Render and click Manual Deploy."
