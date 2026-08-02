#!/usr/bin/env bash
# Create and push an annotated semver tag from the production branch.
# Tag push triggers .github/workflows/docker-publish.yml →
#   ghcr.io/tylerterzigni/huntarr:vX.Y.Z and :production
#
# Usage:
#   ./scripts/tag-production.sh 0.2.0
#   ./scripts/tag-production.sh v0.2.0 "Promote 0.2.0"
#   ./scripts/tag-production.sh --dry-run 0.2.0

set -euo pipefail

DRY_RUN=0
VERSION=""
MESSAGE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    -*)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
    *)
      if [[ -z "$VERSION" ]]; then
        VERSION="$1"
      elif [[ -z "$MESSAGE" ]]; then
        MESSAGE="$1"
      else
        echo "Unexpected argument: $1" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 [--dry-run] <X.Y.Z|vX.Y.Z> [message]" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TAG="$VERSION"
[[ "$TAG" == v* ]] || TAG="v$TAG"
if [[ ! "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-].+)?$ ]]; then
  echo "Version must look like vX.Y.Z (got '$TAG')" >&2
  exit 1
fi

if [[ -z "$MESSAGE" ]]; then
  MESSAGE="Huntarr $TAG"
fi

git fetch origin --tags

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "production" ]]; then
  echo "Checkout production first (currently on '$BRANCH')." >&2
  exit 1
fi

BEHIND="$(git rev-list --count HEAD..origin/production)"
AHEAD="$(git rev-list --count origin/production..HEAD)"
if [[ "$BEHIND" -gt 0 ]]; then
  echo "Local production is behind origin/production. Run: git pull --ff-only origin production" >&2
  exit 1
fi
if [[ "$AHEAD" -gt 0 ]]; then
  echo "Local production is ahead of origin. Push commits first, then retag." >&2
  exit 1
fi

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "Tag $TAG already exists locally." >&2
  exit 1
fi
if git ls-remote --tags origin "refs/tags/$TAG" | grep -q .; then
  echo "Tag $TAG already exists on origin." >&2
  exit 1
fi

SHA="$(git rev-parse --short HEAD)"
echo "Will tag production @$SHA as $TAG"
echo "  → GHCR: ghcr.io/tylerterzigni/huntarr:$TAG"
echo "  → GHCR: ghcr.io/tylerterzigni/huntarr:production (refreshed)"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[DryRun] Skipping tag create/push."
  exit 0
fi

git tag -a "$TAG" -m "$MESSAGE"
git push origin "$TAG"

echo "Pushed $TAG. Watch Actions: https://github.com/tylerterzigni/Huntarr/actions"
echo "Packages: https://github.com/tylerterzigni/Huntarr/pkgs/container/huntarr"
