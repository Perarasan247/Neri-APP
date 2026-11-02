# Neri Mobile

React Native (Expo SDK 58) client for the Neri habit & task tracker. It talks to the same
FastAPI backend as the web app in `../frontend`, with feature parity: Today, Inbox, Upcoming,
the monthly habit tracker, habit and task insights, archived habits and settings.

## Run it

**1. Start the backend so your phone can reach it** (note `0.0.0.0`, not `127.0.0.1`):

```bash
cd ../backend
source .venv/bin/activate
PYTHONPATH=. uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**2. Start the app**

```bash
cd Mobile
npm install          # first time only
npx expo start
```

Scan the QR code with the camera (iOS) or the Expo Go app (Android). Phone and computer must
be on the same Wi-Fi. Press `a` for an Android emulator or `i` for the iOS simulator.

The app finds the backend automatically in development: it uses the IP of the machine running
`expo start`, port 8000. To point it elsewhere, set `EXPO_PUBLIC_API_URL` in `.env`
(see `.env.example`) or change it in **Browse → Settings → Server**.

### Auth

Without Supabase keys the app runs in demo mode ("Continue with demo"), exactly like the web
app. To enable real accounts, copy `.env.example` to `.env` and set
`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Checks

```bash
npx tsc --noEmit     # typecheck
npx expo lint        # lint
npx expo-doctor      # dependency / config health
```

## Offline, data and appearance

**Offline.** The app opens on the data saved on the device (`src/offline/persist.ts`, kept in SQLite) and
works without a connection. Habit logs, values, rest days and task create/edit/complete/delete made offline
go into a persisted outbox (`src/offline/outbox.ts`) and are sent, in order, when the server is reachable
again (`src/offline/sync.ts`). Writes are idempotent (absolute log values, `client_id` on creates), so a
retry never duplicates anything. A change the server rejects is kept for you to retry or discard under
Settings → Sync. Creating or editing habits and goals, and repeat-rule changes, still need a connection.
Reads wait for queued writes, so a refresh never overwrites a change that hasn't been sent yet.

**Your data.** Settings → Your data exports a JSON backup or CSVs (habit logs, tasks) and imports Neri
backups, Loop Habit Tracker exports and any CSV with date and habit columns, with a preview first
(backend: `GET /api/export`, `POST /api/import`).

**Appearance.** Settings → Appearance: light/dark, accent colour (presets or any hex, adjusted to stay
readable), text size (follow the device, or five in-app sizes) and reduce motion (follow the device, on, off).
Pure logic lives in `src/theme/accent.ts` and `appearance.ts` and is unit tested.

New native modules (`expo-network`, `expo-sharing`, `expo-document-picker`, `expo-file-system`) mean a new
development build is needed: `npx expo run:android` or an EAS build.

## Project structure

```
src/
  app/                 Routes (Expo Router). Every file here is a screen.
    _layout.tsx        Providers + auth gate (sign-in → onboarding → app)
    (tabs)/            Today · Inbox · Upcoming · Habits · Browse
    task/ habit/       Task composer & detail, habit forms & detail
    insights/          Habit and task insights
  api/                 types.ts, endpoints.ts (every backend call), client.ts (fetch, auth, timeout, errors)
  hooks/               queries.ts (React Query hooks, optimistic updates), session.tsx
  components/
    ui/                Design-system primitives (Text, Screen, Button, Sheet, Kpi, …)
    tasks/ today/ habits/ insights/ charts/ account/   Feature components
  theme/               Tokens (Ledger palette, light + dark) and ThemeProvider
  offline/             Outbox, connectivity, saved-cache logic (pure, tested) and sync.ts (the engine)
  lib/                 config, supabase, format (dates/timezone), haptics, todoistParser
```

### Conventions

- Screens never call the API directly; they use hooks from `src/hooks/queries.ts`, which own
  caching, retries, optimistic updates and cache invalidation. Add new endpoints there.
- No raw colors in components; read tokens through `useTheme()`.
- Non-route code lives outside `src/app/`.
- Add packages with `npx expo install <pkg>` so versions match the SDK.

## Building

Use EAS: `npx eas-cli@latest build --profile development` (dev client) or `--profile production`.
`ios/` and `android/` are generated; don't edit them by hand.
