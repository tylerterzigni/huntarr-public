#Requires -Version 5.1
<#
.SYNOPSIS
  Backup Huntarr Postgres from a running Docker container (pg_dump → gzip).

.DESCRIPTION
  Writes backups/huntarr-YYYYMMDD-HHMMSS.sql.gz under the repo root.
  Default container: huntarr-db (Docker Compose default naming).

.PARAMETER ContainerName
  Docker container name for Postgres.

.PARAMETER OutDir
  Directory for dump files (created if missing).

.EXAMPLE
  .\scripts\backup-db.ps1
  .\scripts\backup-db.ps1 -ContainerName huntarr-db
#>
[CmdletBinding()]
param(
  [string] $ContainerName = "huntarr-db",
  [string] $OutDir = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutDir) {
  $OutDir = Join-Path $RepoRoot "backups"
}

function Assert-ContainerRunning([string] $Name) {
  $running = docker inspect -f "{{.State.Running}}" $Name 2>$null
  if ($LASTEXITCODE -ne 0 -or $running -ne "true") {
    throw "Container '$Name' is not running. Start the stack first (e.g. docker compose up -d db)."
  }
}

Assert-ContainerRunning $ContainerName

$PgUser = (docker exec $ContainerName printenv POSTGRES_USER 2>$null).Trim()
if (-not $PgUser) { $PgUser = "huntarr" }
$PgDb = (docker exec $ContainerName printenv POSTGRES_DB 2>$null).Trim()
if (-not $PgDb) { $PgDb = "huntarr" }

if (-not (Test-Path -LiteralPath $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir | Out-Null
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$fileName = "huntarr-$stamp.sql.gz"
$outFile = Join-Path $OutDir $fileName
$remotePath = "/tmp/$fileName"

Write-Host "Backing up database '$PgDb' from container '$ContainerName'..."

docker exec $ContainerName sh -c "pg_dump -U `"$PgUser`" -d `"$PgDb`" --no-owner --no-acl | gzip -c > `"$remotePath`""
if ($LASTEXITCODE -ne 0) {
  throw "pg_dump failed inside container '$ContainerName'."
}

docker cp "${ContainerName}:${remotePath}" $outFile
if ($LASTEXITCODE -ne 0) {
  throw "docker cp failed for '$remotePath'."
}

docker exec $ContainerName rm -f $remotePath | Out-Null

$size = (Get-Item -LiteralPath $outFile).Length
Write-Host "Backup written: $outFile ($size bytes)"
Write-Output $outFile
