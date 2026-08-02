# Huntarr

Self-hosted media discovery for homelab *arr stacks — browse TMDB, get personalized recommendations from your watch history, refine taste with AI chat, and send titles to Radarr or Sonarr.

## Features

- Browse & discover movies/TV (TMDB)
- Personalized recommendations (Tautulli history + optional AI)
- AI chat to refine criteria
- Radarr / Sonarr / Plex / Tautulli integrations
- Likes & hide lists
- Installable PWA (LAN)

## Quick start (Docker)

**Prerequisites:** [Docker](https://docs.docker.com/get-docker/) (Docker Desktop on Windows/macOS, or Docker Engine on Linux).

```bash
git clone https://github.com/tylerterzigni/huntarr-public.git
cd huntarr-public
cp .env.example .env
```

Edit `.env` and set:

- `AUTH_SECRET` — long random string (`openssl rand -hex 32`)
- `SETTINGS_ENCRYPTION_KEY` — 64 hex chars (`openssl rand -hex 32`) — **do not change** after you save Settings
- `AUTH_URL` — `http://localhost:3000` for local use (or `http://YOUR_LAN_IP:3000` for phones)

```bash
docker compose up -d --build
```

Open http://localhost:3000 — default seed admin is `admin` / `changeme` (override with `SEED_ADMIN_*` before first boot).

Configure **Settings** (TMDB required for browse). Integration URLs:

| Where *arr/Plex run | Example Base URL |
|---------------------|------------------|
| Same machine as Docker Desktop | `http://host.docker.internal:7878` (Radarr), `:8989` Sonarr, `:32400` Plex |
| Another LAN host | `http://YOUR_LAN_IP:7878` etc. |

Plex Base URL must be the **server** address (e.g. `http://YOUR_LAN_IP:32400`) — not `app.plex.tv` and not a `/web` UI path.

## Documentation

| Guide | Description |
|-------|-------------|
| [Docker Install](docs/DOCKER_INSTALL.md) | Windows & Linux Docker, updates, troubleshooting |
| [User Guide](docs/USER_GUIDE.md) | Using Huntarr day to day |
| [PWA / Mobile](docs/PWA_MOBILE.md) | Add to phone home screen |
| [Database Safety](docs/DATABASE_SAFETY.md) | Volumes, backups, never wipe production data |

## Multi-user

Integrations and API keys are **shared for the whole server**. Each person gets their own login; likes and personal preferences are per-user.

## License

See repository license file if present; otherwise all rights reserved by the author unless stated otherwise.
