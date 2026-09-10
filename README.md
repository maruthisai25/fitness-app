# VigorEngine

VigorEngine is a local-first AI fitness coach that remembers your workouts, nutrition, preferences, constraints and progress, and uses that history to decide what you should train and eat next. It runs as an Expo mobile app and a Vite React PWA over one shared TypeScript core: progressive overload, plateau detection, readiness adjustment, nutrition arithmetic, PR detection and streaks are deterministic engines in `packages/core`, and Claude receives their output as facts to select from and explain. Your data lives in a SQLite database on your own device — there is no server and no account. You supply your own Anthropic API key; anything that does not need reasoning works with no network at all.

## Prerequisites

- Node 25 (developed against 25.4; the workspace requires >= 22)
- pnpm 11 (pinned to 11.25.0 by `packageManager`)
- git

No local Android SDK, Xcode or native toolchain is needed. Mobile runs through Expo Go and EAS development builds, which compile on Expo's servers.

## Install

```
pnpm install
```

This installs every workspace project. The packages are consumed as TypeScript source, so there is no build step between them.

## Run the web app

Development server with hot reload:

```
pnpm dev:web
```

Vite prints the local URL. In dev the service worker is not active, so the offline shell and the PWA install prompt are not exercised.

To run the app as it actually ships — precached shell, install prompt, offline start:

```
pnpm build:web
pnpm --filter web preview
```

`preview` serves the production `dist/` on port 4173. Data is stored in OPFS through a SQLite WebAssembly worker, so it persists per browser profile and origin — the dev server and the preview server are different origins and do not share a database.

## Run the mobile app

```
pnpm dev:mobile
```

That starts the Expo dev server. Scan the QR code with Expo Go to run the app on a phone on the same network; the database is `expo-sqlite` on the device and the API key goes into `expo-secure-store`.

For a build you install on the device rather than running inside Expo Go, use an EAS development build. There is no `eas.json` in the repo yet, so the first run creates one:

```
pnpm dlx eas-cli@latest login
pnpm dlx eas-cli@latest build:configure
pnpm dlx eas-cli@latest build --profile development --platform android
```

The build runs on EAS infrastructure and hands back an installable artifact — nothing native compiles on your machine. `pnpm dev:mobile` then connects to it the same way it connects to Expo Go.

## Your Anthropic API key

Get a key from the Anthropic Console (`console.anthropic.com`). The app asks for it during onboarding, and you can change or remove it later:

- Web: **You → Settings**
- Mobile: **You → Settings**

Where it is stored: `expo-secure-store` on mobile (hardware-backed keystore); IndexedDB on web, which is not hardware-backed — the settings screen says so. The key is never logged and is never written into an export. Removing it takes one tap, and queued AI work parks until a working key is back.

### What it costs you

You are billed by Anthropic directly for your own key; VigorEngine takes nothing and adds nothing. Two models are used, both changeable in **You → Settings**:

| Role                                            | Default model      | Input                  | Output                  |
| ----------------------------------------------- | ------------------ | ---------------------- | ----------------------- |
| Coach (chat, workout generation, weekly review) | `claude-opus-5`    | $5.00 / million tokens | $25.00 / million tokens |
| Fast tasks (food parsing, insight phrasing)     | `claude-haiku-4-5` | $1.00 / million tokens | $5.00 / million tokens  |

The assembled coach context is held under 8k tokens, so a coach turn costs on the order of a few cents ($0.04 of input plus whatever it writes back), and parsing a meal on the fast model costs a fraction of a cent. Logging workouts and food, seeing plans from the rule-based planner, charts, PRs and reminders all work with no key at all and cost nothing.

## Privacy

- All of your data stays in the SQLite database and file sandbox on the device that created it. There is no backend, no account, no sync and no telemetry.
- The only host the app ever contacts is `api.anthropic.com`, and only when a feature needs reasoning. Everything else runs offline.
- Requests that fail offline are queued in `ai_jobs` and retried later rather than lost.
- Progress photos stay on the device (app sandbox on mobile, OPFS on web) and are only included in an export you create yourself.
- Every memory the coach holds is visible, editable and deletable in **You → Memories**.
- Moving data between devices is a file you carry, not a sync service — see below.

## Scripts

Run from the repo root unless noted.

| Command                                   | What it does                                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm check`                              | The gate: `typecheck` + `lint` + `test` across the workspace                                             |
| `pnpm typecheck`                          | `tsc --noEmit` for every project, plus test and e2e tsconfigs                                            |
| `pnpm lint`                               | ESLint at `--max-warnings=0` for every project                                                           |
| `pnpm test`                               | Vitest across the workspace projects                                                                     |
| `pnpm test:watch`                         | The same suite in watch mode                                                                             |
| `pnpm --filter mobile test:components`    | Mobile rendering tests under jest-expo (not covered by `pnpm test`)                                      |
| `pnpm --filter web test:e2e`              | Playwright smoke tests; builds `dist/` first if it is stale                                              |
| `pnpm --filter @vigor/core test:coverage` | Core engine tests with a v8 coverage report                                                              |
| `pnpm dev:web` / `pnpm dev:mobile`        | Dev servers                                                                                              |
| `pnpm build:web`                          | Production web build including the PWA precache manifest                                                 |
| `pnpm icons` / `pnpm icons:check`         | Rasterise every app icon from `tooling/assets/vigor-mark.svg`; `--check` verifies them without rewriting |
| `pnpm format` / `pnpm format:check`       | Prettier over the repo                                                                                   |
| `pnpm --filter @vigor/db migrations`      | Generate SQL migrations with drizzle-kit and rebuild the bundled migration list                          |

Playwright's browser needs to be installed once before the first e2e run: `pnpm --filter web exec playwright install chromium`.

## Repo layout

```
apps/
  mobile/      Expo SDK 57, Expo Router, expo-sqlite, expo-secure-store,
               expo-notifications, expo-image-picker, expo-file-system
  web/         Vite + React 19, vite-plugin-pwa, @sqlite.org/sqlite-wasm (OPFS)
packages/
  core/        domain types, engines, view-model builders. Zero IO, zero React
  db/          Drizzle schema, migrations, repositories over a SqlDriver interface
  ai/          Anthropic client, prompts, tools, coach orchestrator, AI job queue
  library/     seed exercise library and substitution graph
  platform/    adapter interfaces (SecureStore, FileStore, Notifications, Network)
  ui-tokens/   colors, spacing and type scale shared by both apps
tooling/
  eslint-config/, tsconfig/, scripts/, assets/
```

Dependencies point one way and ESLint enforces it: `apps → ai, db, core, library, platform, ui-tokens`; `ai → core, db, library, platform`; `db → core`; `library → core`; `core` depends on nothing internal.

Storage is always canonical metric — kg, cm, g, kcal, seconds. Metric or imperial is a display choice on your profile and is converted at the edge.

## Export and import your data

There is no sync. To move your history to another device, or to keep a backup, you export a file and import it.

**Export** — **You → Export**. Type a passphrase and confirm. The bundle is every table plus your progress photos as base64, encrypted with AES-GCM using a key derived from your passphrase, and written as `vigorengine-YYYY-MM-DD.json`. On web the file downloads. On mobile it is written into the app sandbox under `exports/` and you can hand it to any app through the share sheet. Deriving the key takes a few seconds on purpose — that cost is what anyone who steals the file has to pay for every guess. Your API key is not in the file.

**Import** — **You → Import**. Pick the file, enter the same passphrase. The schema version is checked before anything is written, and the restore happens in a single transaction. On mobile you choose **Merge** (keep what is here and add what is missing) or **Replace**; the mobile screen also lists the backups already sitting in this app's sandbox so you can restore one without leaving the app. On web, import replaces every table on the device — export first if the current data matters.

A lost passphrase means a lost backup. Nothing on any server can recover it.
