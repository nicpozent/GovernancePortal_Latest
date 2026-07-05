# ============================================================
#  backup-all.ps1 — full-application backup for the Governance Portal
#  Backs up EVERYTHING needed to restore on a fresh machine:
#    - the database (pg_dump via the db container)
#    - the whole deployment folder (code, web/, certs, .env, db SQL)
#  into a single timestamped .zip.
#
#  MANUAL:    right-click > Run with PowerShell, or:  .\backup-all.ps1
#  AUTOMATIC: schedule weekly with Windows Task Scheduler (see bottom).
# ============================================================

# --- where to store backups (change this, or pass -Dest) ---
# TIP: point -Dest at an OFF-HOST location (a file share, mounted Azure Files,
# or another disk) so a loss of THIS VM doesn't take the backups with it, e.g.
#   .\backup-all.ps1 -Dest \\backup-server\governance
param(
  [string]$Dest = "C:\governance-backups",
  # Also mirror the uploaded training files (they are NOT in the DB dump).
  # On by default so a full backup really is complete. Uploads are mirrored
  # (not re-zipped each run) so large videos don't bloat every snapshot.
  [bool]$IncludeUploads = $true
)

$ErrorActionPreference = "Stop"
# This script lives in deploy/scripts/. deploy/ holds docker-compose.yml + certs;
# the project root (one level above deploy/) is what we archive.
$deploy = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$root   = Split-Path -Parent $deploy
$stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$work  = Join-Path $env:TEMP "govbackup_$stamp"
New-Item -ItemType Directory -Force -Path $work | Out-Null
New-Item -ItemType Directory -Force -Path $Dest | Out-Null

Write-Host "1/3  Dumping database..."
# Dump straight from the running db container (no client needed on the host).
docker compose -f (Join-Path $deploy "docker-compose.yml") exec -T db `
  pg_dump -U postgres -d governance --no-owner --clean --if-exists `
  | Out-File -Encoding utf8 (Join-Path $work "database.sql")

Write-Host "2/3  Copying application files (excluding secrets)..."
# Archive the whole project, EXCLUDING secret-bearing material:
#   certs\ (TLS key), any .env, backups\, uploads\, node_modules, .git.
# The DB dump (database.sql) remains, so the zip is still DB-secret-bearing —
# store it on access-controlled, encrypted, OFF-HOST storage.
$appDir = Join-Path $work "app"
New-Item -ItemType Directory -Force -Path $appDir | Out-Null
robocopy $root $appDir /E /XD "backups" "uploads" "node_modules" ".git" "certs" /XF ".env" "*.env" "privkey.pem" "fullchain.pem" /NFL /NDL /NJH /NJS /NP | Out-Null
# Re-include the placeholder templates (robocopy excluded *.env above).
Get-ChildItem $root -Recurse -Filter "*.env.example" -ErrorAction SilentlyContinue | ForEach-Object {
  $rel = $_.FullName.Substring($root.Length).TrimStart('\'); $dst = Join-Path $appDir $rel
  New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null; Copy-Item $_.FullName $dst -Force
}

Write-Host "3/3  Compressing..."
$zip = Join-Path $Dest "governance-full-$stamp.zip"
Compress-Archive -Path (Join-Path $work "*") -DestinationPath $zip -Force
Remove-Item -Recurse -Force $work

# Retention: keep the 8 most recent full backups.
Get-ChildItem $Dest -Filter "governance-full-*.zip" |
  Sort-Object LastWriteTime -Descending | Select-Object -Skip 8 |
  Remove-Item -Force -ErrorAction SilentlyContinue

# --- uploads: mirror the training files alongside the zip -------------------
# The DB dump inside the zip does NOT contain the uploaded files (they live on
# the ./uploads volume). Without this, a restore yields a DB whose upload_path
# rows point at files that no longer exist. Mirror (not zip) so 250 MB videos
# don't multiply across every snapshot; the mirror always reflects "now".
if ($IncludeUploads) {
  $uploads = Join-Path $deploy "uploads"
  if (Test-Path $uploads) {
    $upDest = Join-Path $Dest "uploads-mirror"
    New-Item -ItemType Directory -Force -Path $upDest | Out-Null
    Write-Host "     mirroring uploads -> $upDest ..."
    robocopy $uploads $upDest /MIR /Z /R:2 /W:5 /NFL /NDL /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "uploads mirror (robocopy) failed with exit code $LASTEXITCODE" }
  } else {
    Write-Host "     (no uploads folder at $uploads — skipping)"
  }
}

Write-Host "Done -> $zip"
if ($IncludeUploads) { Write-Host "     + uploads mirror in $(Join-Path $Dest 'uploads-mirror')" }
if ($Dest -notmatch '^\\\\' -and $Dest -match '^[A-Za-z]:') {
  Write-Warning "Backups are on a LOCAL path ($Dest). For real DR, pass an OFF-HOST -Dest (e.g. \\server\share) so a loss of this VM doesn't lose the backups too."
}

# ============================================================
#  Schedule WEEKLY (run once, in an elevated PowerShell):
#
#    $action  = New-ScheduledTaskAction -Execute "powershell.exe" `
#                 -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\backup-all.ps1`""
#    $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 2am
#    Register-ScheduledTask -TaskName "Governance Full Backup" `
#                 -Action $action -Trigger $trigger -RunLevel Highest
# ============================================================
