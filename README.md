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
