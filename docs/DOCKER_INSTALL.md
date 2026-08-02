# Docker Install (Huntarr)

Run Huntarr with Docker on **Windows Docker Desktop** or **Linux**. This guide is generic — replace placeholders with your own paths and LAN IP.

---

## Choose a path

| Path | Host | How |
|------|------|-----|
| **A. Compose build** | Windows or Linux | Root `docker-compose.yml` — recommended |
| **B. Homelab data dir** | Linux | [`deploy/docker-compose.homelab.yml`](../deploy/docker-compose.homelab.yml) + `./data/postgres` |

---

## Hard rules

- Secrets live in a host **`.env` only** — never commit `.env`.
- Never run `docker compose down -v` if you care about likes, logins, or settings.
- Never rotate `SETTINGS_ENCRYPTION_KEY` after saving Settings on that database.
- Updating the app image/container ≠ deleting the Postgres volume.

---

## A. Standard install (build from source)

### 1. Prerequisites

- Docker + Docker Compose plugin (Docker Desktop on Windows is fine)
- Git

### 2. Clone and configure

```bash
git clone https://github.com/tylerterzigni/huntarr-public.git
cd huntarr-public
cp .env.example .env
```

On Windows PowerShell:

```powershell
git clone https://github.com/tylerterzigni/huntarr-public.git
cd huntarr-public
copy .env.example .env
notepad .env
```

Generate secrets:

```bash
openssl rand -hex 32   # AUTH_SECRET
openssl rand -hex 32   # SETTINGS_ENCRYPTION_KEY (64 hex characters)
```

Set `AUTH_URL`:

- Local only: `http://localhost:3000`
- Phones on LAN: `http://YOUR_LAN_IP:3000`

Keep `DATABASE_URL` host as **`db`** (compose service name). Keep container `PORT=3000` unless you change the publish mapping.

### 3. Start

```bash
docker compose up -d --build
```

### 4. Verify

```bash
# Windows:
curl.exe --max-time 10 -s http://localhost:3000/api/health

# Linux/macOS:
curl --max-time 10 -s http://localhost:3000/api/health
```

Open http://localhost:3000 and sign in with the seed admin.

### 5. Day-to-day

```bash
# Rebuild app after pulling new code (keeps DB volume)
docker compose up -d --build app

# Stop (keeps data)
docker compose down

# Logs
docker logs huntarr-app --tail 100
```

---

## B. Homelab layout (optional)

Use a bind mount under `./data/postgres` instead of only a named volume:

```bash
mkdir -p data/postgres
cp deploy/env.homelab.example .env
# edit .env — AUTH_URL, secrets; DATABASE_URL host must be huntarr-db
docker compose -f deploy/docker-compose.homelab.yml --env-file .env up -d --build
```

Host port defaults to **3000** (`PORT` in `.env`). Change mapping and `AUTH_URL` together if needed.

---

## Networking to *arr / Plex / Tautulli

Configured in **Settings** (encrypted in Postgres):

| Service | Docker Desktop (apps on same PC) | Apps on another LAN host |
|---------|----------------------------------|---------------------------|
| Radarr | `http://host.docker.internal:7878` | `http://YOUR_LAN_IP:7878` |
| Sonarr | `http://host.docker.internal:8989` | `http://YOUR_LAN_IP:8989` |
| Plex | `http://host.docker.internal:32400` | `http://YOUR_LAN_IP:32400` |
| Tautulli | `http://host.docker.internal:8181` | `http://YOUR_LAN_IP:8181` |

Plex: use the **Media Server** URL (port 32400), not `app.plex.tv`, and not `.../web`.

---

## Troubleshooting

**DB healthy but app crash-loops:** Check `DATABASE_URL` hostname (`db` vs `huntarr-db`), matching Postgres password, and `docker logs huntarr-app`.

**Login loops on phone:** `AUTH_URL` must match the URL you type in the browser (including port).

**Port in use:** Set `PORT` in `.env` and update `AUTH_URL` to match.

See [DATABASE_SAFETY.md](./DATABASE_SAFETY.md) before deleting volumes.
