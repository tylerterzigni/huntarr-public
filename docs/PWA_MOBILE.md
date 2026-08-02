# Huntarr PWA / Mobile

Install Huntarr on a phone home screen for a full-screen app experience.

## Prerequisites

1. Phone and Huntarr host on the **same Wi‑Fi** (or VPN).
2. Know your URL, e.g. `http://YOUR_LAN_IP:3000`.
3. Set `AUTH_URL` in `.env` to **exactly** that URL, then recreate the app container.
4. Allow the host firewall to accept inbound TCP on that port.
5. Sign in once in the mobile browser before or after adding to home screen.

## iPhone (Safari)

1. Open Safari → `http://YOUR_LAN_IP:3000`
2. Sign in
3. Share → **Add to Home Screen** → Add
4. Open the icon for standalone mode

## Android (Chrome)

1. Open Chrome → `http://YOUR_LAN_IP:3000`
2. Sign in
3. Menu → **Install app** / **Add to Home screen**
4. Launch from the home screen

## Limitations (typical LAN HTTP)

- Service workers may not register on plain `http://LAN_IP` (need HTTPS or localhost).
- No web push in the base app.
- Server must be online for browse, AI, and integrations.

## Troubleshooting

| Issue | Check |
|-------|--------|
| Can’t reach site | Same Wi‑Fi; firewall; correct IP/port |
| Login loops | `AUTH_URL` matches the phone URL |
