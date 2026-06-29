# ============================================================
#  reset.ps1 — wipe Birgma Governance data back to a clean state.
#  Keeps the schema + the four platform roles. Destructive!
#  Run from anywhere:  deploy\scripts\reset.ps1
# ============================================================
$ErrorActionPreference = "Stop"
# This script lives in deploy/scripts/ — operate from the deploy/ folder
# (where docker-compose.yml is).
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

Write-Host "This wipes ALL policies, employees, signatures, quizzes and history." -ForegroundColor Yellow
$ans = Read-Host "Type RESET to continue"
if ($ans -ne "RESET") { Write-Host "Aborted."; exit }

# 0. safety backup
New-Item -ItemType Directory -Force -Path .\backups | Out-Null
$stamp = Get-Date -Format yyyyMMdd-HHmmss
Write-Host "1/3  Backing up to backups\pre-reset-$stamp.sql ..."
docker compose exec -T db pg_dump -U postgres -d governance --no-owner --clean --if-exists `
  | Out-File -Encoding utf8 ".\backups\pre-reset-$stamp.sql"

# 1. wipe data, keep the four platform roles
Write-Host "2/3  Wiping data (keeping platform roles) ..."
docker compose exec -T db psql -U postgres -d governance -c "truncate signatures, quiz_attempts, quiz_questions, quizzes, policy_versions, policy_groups, policy_roles, policies, notifications_sent, employee_groups, group_mappings, employees, audit_log, sync_runs restart identity cascade; delete from groups where name not in ('Administrators','Compliance','Read All','All Employees');"

# 2. clear stored backups except the safety one we just made
Get-ChildItem .\backups\*.sql -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -ne "pre-reset-$stamp.sql" } | Remove-Item -Force -ErrorAction SilentlyContinue

# 3. restart api
Write-Host "3/3  Restarting API ..."
docker compose restart api
Write-Host "Done. The portal is clean. Use Employees -> Sync now to re-import." -ForegroundColor Green
