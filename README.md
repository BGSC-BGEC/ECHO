# ECHO

Real-world GPS manhunt. Phase 1.5: lobby code, play zone, head start, timed pulses, catch codes, results, safety/technical pause, background location (phones can be locked), local alerts, crash-safe server.
Plan & phases: [`docs/DEV_BUILD_PLAN.md`](docs/DEV_BUILD_PLAN.md). Product/engineering specs in `docs/`.

```text
apps/mobile/       Expo (React Native) app — Android + iOS
server/            Fastify + WebSocket authoritative game server (SQLite snapshots)
packages/shared/   protocol types, presets, geo helpers
deploy/            Dockerfile + docker-compose + Caddy (HTTPS/wss) for a VPS
```

## Campus playtest

Follow **[`docs/PLAYTEST_RUNSHEET.md`](docs/PLAYTEST_RUNSHEET.md)**: run `npm run server` on a machine on the campus Wi-Fi, and players type the IP it prints into ECHO → Server.

## Local dev

```bash
npm install                 # once, from repo root
npm run server              # prints the IP players type (health: http://<ip>:8787/health); npm run dev = auto-reload
npm test                    # server rule tests
```

## Host the server on a VPS (for campus play on mobile data)

Any small Linux VPS with Docker works (1 vCPU / 1 GB is plenty for a few matches).

1. Point a domain/subdomain at the VPS IP (DNS **A record**, e.g. `echo.yourdomain.com`). Free option: a DuckDNS subdomain.
2. Open ports **80** and **443** on the VPS firewall.
3. On the VPS:
   ```bash
   git clone <this repo> echo && cd echo
   ECHO_DOMAIN=echo.yourdomain.com docker compose -f deploy/docker-compose.yml up -d --build
   curl https://echo.yourdomain.com/health          # {"ok":true,...}
   ```
   Caddy fetches a TLS certificate automatically. Match state survives restarts (`echo-data` volume); a live round comes back **paused** after a restart and the host resumes it.
4. Phones use **`wss://echo.yourdomain.com/ws`** — bake it into the APK (below) or set it in-app (Server on the home screen).

Update later: `git pull && docker compose -f deploy/docker-compose.yml up -d --build`. Logs: `docker compose -f deploy/docker-compose.yml logs -f server`.

## Build the Android APK (no USB needed)

```bash
cd apps/mobile
npx expo prebuild --platform android        # only after adding/removing native packages or changing app.json
cd android
EXPO_PUBLIC_SERVER_URL=wss://echo.yourdomain.com/ws nice -n 19 ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
# -> app/build/outputs/apk/release/app-release.apk  (send it to phones, tap to install)
```

Or in the cloud: `npx eas-cli@latest build -p android --profile preview`.

## iOS (no Mac needed)

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest build -p ios --profile development   # needs an Apple Developer account; register the iPhone when prompted
```

## Playtest checklist

- Host picks **Test · 3 min** for a dry run (10 s head start, pulse every 30 s), then **Quick** / **Classic**.
- Everyone allows **location** and **notifications** when asked. Android shows a "round in progress" notification while sharing — that's what keeps GPS alive with the screen locked.
- Phones can be locked during the round; ECHO buzzes 10 s before each reveal.
- Anyone can tap **pause** (top right) for safety; only the host resumes.
- Battery saver / aggressive OEM battery modes (Xiaomi, Oppo, Vivo, OnePlus…) can still kill background apps: set ECHO to **Unrestricted** in battery settings before playing.
