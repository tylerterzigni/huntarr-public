# User Guide

How to use Huntarr day to day. For install, see [DOCKER_INSTALL.md](./DOCKER_INSTALL.md).

## What it is

Huntarr helps you discover movies and TV for a homelab with Radarr, Sonarr, Plex, and optional Tautulli/AI. Data lives in PostgreSQL; API keys in Settings are encrypted.

## First login

1. Open Huntarr (e.g. http://localhost:3000).
2. Sign in with the seed admin (or register if enabled).
3. Change the admin password after first login.

## Settings (once per server)

Integrations are **shared by all users** on this Huntarr instance:

- **TMDB** — required for browse
- **AI provider** — optional; for chat / For You re-ranking
- **Radarr / Sonarr** — add titles to your libraries
- **Plex** — library sync / “in library” state (server URL + X-Plex-Token)
- **Tautulli** — watch history for personalized rows

Use each **Test** button after saving.

### Per-user

- Account login
- Likes
- Personal hide list
- AI chat criteria / recommendation preferences
- Tautulli display names mapped to “your” history

## Browse & recommendations

Use Home, Movies, TV, and Search. For You / Because You Watched rows need Tautulli (and optionally AI) configured and synced.

## Add to Radarr / Sonarr

On a title, choose quality profile / root folder and add. Requires working *arr Settings.

## Safety

Updating Docker images does not wipe data if you leave the Postgres volume alone. See [DATABASE_SAFETY.md](./DATABASE_SAFETY.md).
