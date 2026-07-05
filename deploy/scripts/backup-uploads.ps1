# ============================================================
#  backup-uploads.ps1 — off-host backup of the uploaded training files.
#
#  WHY THIS EXISTS: the daily pg_dump backs up ONLY the database, and
#  backup-all.ps1 deliberately EXCLUDES uploads\ from the full zip (they can be
#  large videos). So without this, the uploaded documents referenced by
#  policies.upload_path have NO backup — after a host loss the DB restores but
#  every training file is a dead link. This mirrors the uploads volume to an
#  off-host location so the two halves of the state stay recoverable together.
#
#  It uses robocopy /MIR (incremental mirror) so daily runs are cheap.
#
#  MANUAL:    .\backup-uploads.ps1 -Dest \\backup-server\governance\uploads
#  AUTOMATIC: schedule daily with Windows Task Scheduler (see bottom).
# ============================================================
param(
  # Off-HOST destination: a file share / mounted Azure Files / another disk.
  # Do NOT point this at a folder on the same VM — that defeats the purpose.
  [Parameter(Mandatory = $true)][string]$Dest
)

$ErrorActionPreference = "Stop"
# This script lives in deploy/scripts/. The uploads bind-mount is deploy/uploads.
$deploy  = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$uploads = Join-Path $deploy "uploads"

if (-not (Test-Path $uploads)) { throw "uploads folder not found at $uploads" }
New-Item -ItemType Directory -Force -Path $Dest | Out-Null

Write-Host "Mirroring $uploads -> $Dest ..."
# /MIR mirror, /Z restartable, /R:2 /W:5 modest retries, /NP quiet.
# NOTE: /MIR deletes files in $Dest that no longer exist in source. Uploads are
# only ever deleted when a training file is replaced/removed in-app, so mirroring
# is correct. If you need deleted-file retention, drop /MIR and keep /E instead.
robocopy $uploads $Dest /MIR /Z /R:2 /W:5 /NFL /NDL /NP | Out-Null
$code = $LASTEXITCODE
# robocopy exit codes 0-7 are success (8+ is a real error).
if ($code -ge 8) { throw "robocopy failed with exit code $code" }

Write-Host "Done. Uploads mirrored to $Dest (robocopy code $code)."

# ============================================================
#  Schedule DAILY (run once, in an elevated PowerShell) — align with the DB dump:
#
#    $action  = New-ScheduledTaskAction -Execute "powershell.exe" `
#                 -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\backup-uploads.ps1`" -Dest \\backup-server\governance\uploads"
#    $trigger = New-ScheduledTaskTrigger -Daily -At 2:30am
#    Register-ScheduledTask -TaskName "Governance Uploads Backup" `
#                 -Action $action -Trigger $trigger -RunLevel Highest
# ============================================================
