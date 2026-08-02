#Requires -Version 5.1
<#
.SYNOPSIS
  Restore Huntarr Postgres from a dump file (DESTRUCTIVE).

.DESCRIPTION
  Requires an explicit dump path and interactive confirmation (type RESTORE).
  Refuses cross-environment restores (Windows dump → MediaServer or reverse)
  unless -AllowCrossEnvironment is passed with owner intent.
  Restore is never part of the default update path.

.PARAMETER DumpFile
  Path to .sql or .sql.gz dump (required).

.PARAMETER ContainerName
  Docker container name for Postgres.

.PARAMETER Environment
  Label for the target: Windows or MediaServer (used in prompts / guards).

.PARAMETER AllowCrossEnvironment
  Required to restore when dump name/path suggests the other environment,
  or when -ForceCross is needed after the script warns. Prefer separate DBs.

.EXAMPLE
  .\scripts\restore-db.ps1 -DumpFile .\backups\huntarr-20260101-120000.sql.gz
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $DumpFile,

  [string] $ContainerName = "huntarr-db",

  [ValidateSet("Windows", "MediaServer")]
  [string] $Environment = "Windows",

  [switch] $AllowCrossEnvironment
)

$ErrorActionPreference = "Stop"

if (-not $DumpFile) {
  throw "DumpFile is required. Refusing restore without an explicit dump path."
}

$resolved = Resolve-Path -LiteralPath $DumpFile -ErrorAction SilentlyContinue
if (-not $resolved) {
  throw "Dump file not found: $DumpFile"
}
$DumpFile = $resolved.Path

function Assert-ContainerRunning([string] $Name) {
  $running = docker inspect -f "{{.State.Running}}" $Name 2>$null
  if ($LASTEXITCODE -ne 0 -or $running -ne "true") {
    throw "Container '$Name' is not running."
  }
}

Assert-ContainerRunning $ContainerName

$lowerPath = $DumpFile.ToLowerInvariant()
$looksMediaServer = $lowerPath -match "mediaserver|/mnt/md0/"
$looksWindows = $lowerPath -match "onedrive|\\projects\\huntarr|windows"

if ($Environment -eq "MediaServer" -and $looksWindows -and -not $AllowCrossEnvironment) {
  throw @"
Refusing to restore a Windows-looking dump onto MediaServer.
Windows Docker DB and MediaServer DB are strictly separate.
If the owner explicitly requested this one-way restore, re-run with -AllowCrossEnvironment after taking a fresh production backup.
"@
}

if ($Environment -eq "Windows" -and $looksMediaServer -and -not $AllowCrossEnvironment) {
  throw @"
Refusing to restore a MediaServer-looking dump onto Windows Docker.
Re-run with -AllowCrossEnvironment only if the owner explicitly requested it.
"@
}

$PgUser = (docker exec $ContainerName printenv POSTGRES_USER 2>$null).Trim()
if (-not $PgUser) { $PgUser = "huntarr" }
$PgDb = (docker exec $ContainerName printenv POSTGRES_DB 2>$null).Trim()
if (-not $PgDb) { $PgDb = "huntarr" }

Write-Host ""
Write-Host "WARNING: This will OVERWRITE database '$PgDb' in container '$ContainerName' ($Environment)."
Write-Host "Dump: $DumpFile"
Write-Host "Restore is NOT part of the normal update path. Prefer pull + migrate + keep the volume."
Write-Host ""
$confirm = Read-Host "Type RESTORE to continue (anything else aborts)"
if ($confirm -ne "RESTORE") {
  Write-Host "Aborted. No changes made."
  exit 1
}

$remoteSql = "/tmp/huntarr-restore-incoming.sql"
$isGz = $DumpFile -match "\.gz$"

if ($isGz) {
  $remoteGz = "/tmp/huntarr-restore-incoming.sql.gz"
  docker cp $DumpFile "${ContainerName}:${remoteGz}"
  if ($LASTEXITCODE -ne 0) { throw "docker cp failed." }
  docker exec $ContainerName sh -c "gunzip -c `"$remoteGz`" > `"$remoteSql`" && rm -f `"$remoteGz`""
  if ($LASTEXITCODE -ne 0) { throw "gunzip failed inside container." }
} else {
  docker cp $DumpFile "${ContainerName}:${remoteSql}"
  if ($LASTEXITCODE -ne 0) { throw "docker cp failed." }
}

Write-Host "Restoring into '$PgDb'..."
docker exec -i $ContainerName sh -c "psql -U `"$PgUser`" -d `"$PgDb`" -v ON_ERROR_STOP=1 -f `"$remoteSql`""
$restoreExit = $LASTEXITCODE
docker exec $ContainerName rm -f $remoteSql | Out-Null

if ($restoreExit -ne 0) {
  throw "psql restore failed (exit $restoreExit)."
}

Write-Host "Restore complete."
