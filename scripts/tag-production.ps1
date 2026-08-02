#Requires -Version 5.1
<#
.SYNOPSIS
  Create and push an annotated semver tag from the production branch.

.DESCRIPTION
  Tags the current tip of `production` as vX.Y.Z (annotated) and pushes the tag
  to origin. That tag push triggers `.github/workflows/docker-publish.yml`, which
  publishes GHCR images:
    ghcr.io/tylerterzigni/huntarr:vX.Y.Z
    ghcr.io/tylerterzigni/huntarr:production

  Does not bump package.json. Starting app version is package.json "version"
  (currently 0.1.0) — pick the next semver intentionally.

.PARAMETER Version
  Semver with or without leading v (e.g. 0.2.0 or v0.2.0).

.PARAMETER Message
  Annotated tag message. Default: "Huntarr vX.Y.Z".

.PARAMETER DryRun
  Show what would run without creating or pushing the tag.

.EXAMPLE
  .\scripts\tag-production.ps1 -Version 0.2.0
  .\scripts\tag-production.ps1 -Version v0.2.0 -Message "Promote 0.2.0"
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $Version,

  [string] $Message = "",

  [switch] $DryRun
)

$ErrorActionPreference = "Stop"

function Resolve-Git {
  $candidates = @(
    "git",
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\Common7\IDE\CommonExtensions\Microsoft\TeamFoundation\Team Explorer\Git\cmd\git.exe"
  )
  foreach ($c in $candidates) {
    if ($c -eq "git") {
      $cmd = Get-Command git -ErrorAction SilentlyContinue
      if ($cmd) { return $cmd.Source }
    } elseif (Test-Path -LiteralPath $c) {
      return $c
    }
  }
  throw "git.exe not found. Install Git or add it to PATH."
}

$git = Resolve-Git
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$tag = $Version.Trim()
if ($tag -notmatch '^v') { $tag = "v$tag" }
if ($tag -notmatch '^v\d+\.\d+\.\d+([.-].+)?$') {
  throw "Version must look like vX.Y.Z (got '$tag')."
}

if (-not $Message) {
  $Message = "Huntarr $tag"
}

Write-Host "Fetching origin..."
& $git fetch origin --tags
if ($LASTEXITCODE -ne 0) { throw "git fetch failed" }

$branch = (& $git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne "production") {
  throw "Checkout production first (currently on '$branch')."
}

& $git status -sb
$behind = & $git rev-list --count "HEAD..origin/production"
$ahead = & $git rev-list --count "origin/production..HEAD"
if ([int]$behind -gt 0) {
  throw "Local production is behind origin/production. Run: git pull --ff-only origin production"
}
if ([int]$ahead -gt 0) {
  throw "Local production is ahead of origin. Push commits first, then retag."
}

$existing = & $git rev-parse -q --verify "refs/tags/$tag" 2>$null
if ($existing) {
  throw "Tag $tag already exists locally. Choose a new version."
}

$remoteTag = & $git ls-remote --tags origin "refs/tags/$tag"
if ($remoteTag) {
  throw "Tag $tag already exists on origin. Choose a new version."
}

$sha = (& $git rev-parse --short HEAD).Trim()
Write-Host "Will tag production @$sha as $tag"
Write-Host "  → GHCR: ghcr.io/tylerterzigni/huntarr:$tag"
Write-Host "  → GHCR: ghcr.io/tylerterzigni/huntarr:production (refreshed)"

if ($DryRun) {
  Write-Host "[DryRun] Skipping tag create/push."
  exit 0
}

& $git tag -a $tag -m $Message
if ($LASTEXITCODE -ne 0) { throw "git tag failed" }

& $git push origin $tag
if ($LASTEXITCODE -ne 0) { throw "git push tag failed" }

Write-Host "Pushed $tag. Watch Actions: https://github.com/tylerterzigni/Huntarr/actions"
Write-Host "Packages: https://github.com/tylerterzigni/Huntarr/pkgs/container/huntarr"
