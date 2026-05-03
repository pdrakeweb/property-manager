# Property Manager — Claude Instructions

This file is the primary onboarding reference for Claude Code and human
developers. For deeper architectural detail, see
[`docs/architecture.md`](docs/architecture.md).

## Project overview

Property Manager is a local-first PWA for managing one or more
properties (residence + camp/cabin). Every record (equipment,
maintenance task, capital item, permit, fuel delivery, …) lives in
browser `localStorage`, with Google Drive as the canonical backing
store and CRDT-style vector clocks for concurrent-edit reconciliation.

**Stack:** React 18, TypeScript (strict), Vite 6, Tailwind 3.4, React
Router 6 (HashRouter for static-host friendliness), Lucide icons, Zod
for runtime validation, Leaflet (`react-leaflet@4.2.1`) for maps.

**Deployment target:** static asset host. The bundle ships to a CDN
or GitHub Pages; the user signs in with Google OAuth and Drive
becomes the per-user backend. No application server.

## Repository layout

```
property-manager/
├── src/
│   ├── App.tsx                  # Auth gate + router root + AppShell
│   ├── main.tsx                 # React mount + ActiveModuleProvider
│   ├── components/              # Reusable UI (AppShell, ConflictsModal, etc.)
│   │   └── layout/AppShell.tsx  # Sidebar, top rail, dynamic nav from active modules
│   ├── screens/                 # Top-level route components
│   ├── modules/                 # Module system: 22 modules + registry framework
│   │   ├── _registry/           # ModuleDefinition, Registry, DepResolver,
│   │   │                        # ActiveModuleContext, RouterBuilder
│   │   ├── core/                # Always-on baseline (dashboard, settings, sync)
│   │   ├── ai/, capital/, …     # 22 feature modules
│   │   └── index.ts             # Discovery barrel
│   ├── lib/                     # Stores, sync engine, drive adapter, helpers
│   │   ├── localIndex.ts        # Façade over the vault's localStorage record index
│   │   ├── syncedStore.ts       # makeSyncedStore<T>() factory: store + Drive queue
│   │   ├── propertyDriveRoot.ts # Cycle-breaking helper used by syncedStore
│   │   ├── propertyStore.ts     # Property records + useProperties() hook
│   │   ├── syncEngine.ts        # useStartupSync, pushPending, pollDriveChanges
│   │   ├── vaultSingleton.ts    # Composes the @/vault package with host deps
│   │   ├── localDriveAdapter.ts # In-memory dev mock of the Drive adapter
│   │   └── …                    # haAlerts, inboxPoller, syncBus, etc.
│   ├── vault/                   # CRDT-aware record storage extracted as a package
│   │   ├── core/syncEngine.ts   # vclock-aware pull/push/merge
│   │   ├── core/mergeRecord.ts  # Three-way merge with conflictFields
│   │   └── core/vclock.ts       # Vector clock primitives
│   ├── records/                 # DSL definitions for every record type (Zod + UI)
│   ├── store/                   # AppStoreContext, settings (per-user)
│   ├── auth/oauth.ts            # PKCE OAuth flow
│   ├── data/mockData.ts         # First-run seed (Tannerville + Camp + E2E + R2)
│   └── types/                   # Shared TypeScript types
├── tests/                       # Playwright E2E specs
│   ├── modules.spec.ts          # Module toggle + route + dep cascade
│   ├── multi-device.spec.ts     # CRDT concurrent-edit scenarios
│   └── persist.spec.ts          # Round-trip via dev Drive adapter
├── docs/                        # Architectural docs and QA references
│   ├── architecture.md          # Full system reference (companion to this file)
│   ├── integration-test-plan.md # Per-module manual + automated QA plan
│   └── GOOGLE_OAUTH_SETUP.md    # OAuth client setup notes
├── scripts/
│   └── gen-module-tests.mjs     # Re-emits the 26 per-module Vitest files
├── vitest.config.ts             # Vitest (jsdom) for module-contract tests
├── playwright.config.ts         # Playwright (Chromium) for E2E
├── vite.config.ts               # Vite + React plugin
├── tsconfig.json                # strict, noUnusedLocals, paths: '@/*' → src/*
└── package.json
```

## Key architectural concepts

**`lib/localIndex.ts` — record index façade.** Thin façade over the
extracted `@/vault` package's local record index (`pm_index_v1` in
`localStorage`). Each record carries `{ id, type, propertyId, title,
data, syncState, vclock, conflictFields?, deletedAt? }`. Cross-tab
reactivity goes through `syncBus`, which both the façade and
`vaultSingleton` emit to. UI code reads via `getVault().localIndex` or
the façade's helpers; never read raw `localStorage.pm_index_v1`.

**`lib/syncedStore.ts` — domain store factory.** `makeSyncedStore<T>(
key, indexType, driveCategoryId, getPropertyId?)` wraps a plain
list-in-localStorage store so every `add` / `update` / `upsert` /
`remove` also mirrors into `localIndex` with `syncState:
'pending_upload'`. The Drive root folder for the upload comes from
`getPropertyDriveRoot(propertyId)` — a dependency-free helper added in
the cycle-break refactor (see "Known gotchas" below). Records that
fail Zod validation are still queued (the UI has already persisted)
but logged via `auditLog` for surface-level regression detection.

**`lib/syncEngine.ts` — host-app sync orchestrator.** Three public
entry points:
- `useStartupSync(token, propertyId)` — runs once per app boot (and on
  property switch). Pulls every category folder, pushes anything still
  pending. Wired in `App.tsx` via the `MainApp` component.
- `pushPending(token, propertyId)` — uploads every record with
  `syncState === 'pending_upload'`.
- `pollDriveChanges(token, propertyId)` — runs every 30s and on focus,
  pulling fresh content from Drive and surfacing concurrent-edit
  conflicts. The 30s timer is started by the AppShell's mount effect.

**Vault layer (`src/vault/`).** Phase D extracted the CRDT/sync core
into a self-contained package. Each pull validates the remote payload
against the registered Zod schema before applying it; an invalid
payload becomes a `conflict` record with a human-readable reason
instead of silently overwriting local state. Vector-clock-aware
three-way merge runs in `pullFromDrive`'s per-file branch and again
on the push-side ETag-conflict path; both paths route through the
shared `mergeRemoteRecord` helper.

**CRDT model.** Per-record vector clocks (`vclock.ts`) on every
`IndexRecord`. `mergeRecords(local, remote, deviceId)` returns one of
`equal`, `drive-wins`, `local-wins`, `concurrent`. Conflicts are
**whole-record, not field-level** — when two devices edit different
top-level keys of `data`, BOTH paths show up in `conflictFields[]` and
the user picks Mine/Theirs per path in the `ConflictsModal` (in
`AppShell`). The merge is content-addressed: equal vclocks ⇒ equal
content (up to non-CRDT bugs); the equal/local-wins branches now also
clear stale `conflictReason` from prior bad pulls.

**Module system.** A module is a `ModuleDefinition` (id, name,
version, category, icon, capabilities, optional `requires`/`enhances`,
optional `routes`/`navItems`/`recordTypes`/`onActivate`/`onDeactivate`
/ `settingsSection`). Modules self-register via `src/modules/index.ts`
calling `moduleRegistry.register(...)` at module-load time.
`ActiveModuleContext` (`<ActiveModuleProvider>` in `main.tsx`) tracks
which modules are enabled per property; the closure over `requires`
(`expandWithDeps`) plus the always-active floor (`core`) gives the
final active set. **All three phases are complete:** Phase 1
infrastructure, Phase 2 module declarations (22+ modules), Phase 3
dynamic routing — `App.tsx`'s `<AppRoutes>` builds React Router routes
from `useActiveModuleIds()` via `RouterBuilder.buildRoutes(...)`, and
`AppShell.tsx` builds the sidebar from the same set. Defaults policy:
every registered module is enabled by default; users opt-out per
property via `/settings/modules`.

**Drive adapter.** `vaultSingleton.pickStorage()` returns either
`createGoogleDriveAdapter(...)` (real Google Drive via the `drive.file`
scope) or `createMemoryAdapter({ storeKey: 'pm_dev_drive_v1' })` (an
in-memory mock backed by localStorage). The dev adapter is selected
when `localStorage.google_access_token === 'dev_token'`. Test specs
and the manual integration-test plan rely on the dev adapter — it has
the same ETag and conflict semantics as the real one. OAuth uses PKCE
(`code_verifier` + `code_challenge`) with the optional client secret
for the "Web application" client type; the secret is **not** required
to be in the bundle (see security notes below).

## Development workflow

- `npm run dev` — Vite dev server with HMR on `localhost:5173`. In a
  worktree, choose an available port (5170–5179):
  `npm run dev -- --port 5176`.
- `npm run build` — production build (`tsc && vite build`). Sanity-
  check the `dist/` directory has no embedded secrets after a refactor
  that touches `store/settings.ts`.
- `npm run test:vault` — 109 vault unit tests via `node --test`
  (CRDT, syncEngine, vclock, validation, mergeRecord). Fast — runs in
  ~1s.
- `npm run test:modules` — 91 module-contract tests via Vitest
  (jsdom). Validates every module's `ModuleDefinition` shape +
  registry primitives + `computeToggle` cascade logic. Runs in ~14s.
- `npm test` — full Playwright E2E suite (requires `npm run dev` to
  be running on `:5173`, or Playwright will boot one via the
  `webServer` config).
- `npx playwright test tests/modules.spec.ts` — module toggle/route
  Playwright spec (5 scenarios; ~17s).
- `npm run typecheck` — `tsc --noEmit`. Zero errors expected on every
  commit.

## Environment variables

All env vars are read in `src/store/settings.ts` through a static
allow-list (`ENV_DEFAULTS`). Vite inlines these into the bundle at
build time, so anything you list here ships to every user.

| Var | Bundle? | Purpose |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | ✅ safe | OAuth client id (public per Google's PKCE flow) |
| `VITE_OPENROUTER_KEY` | ⚠️ optional, per-user prefer | OpenRouter API key for AI features. Settings UI accepts a per-user key that overrides this — set the env var only for personal builds. |
| `VITE_HA_URL` / `VITE_HA_TOKEN` | ⚠️ optional | Home Assistant base URL + long-lived token. Same per-user override available. |
| `VITE_GOOGLE_CLIENT_SECRET` | ❌ **DO NOT SET** | The PKCE flow does not need a client secret. A prior version of this codebase inlined it into the bundle via `import.meta.env[dynamicKey]` (Vite inlines the entire env object on dynamic access). Removed in commit `91a3b15` ("Phase D fix: client secret leak"). Do not re-add. |

Allow-list enforcement: `settings.ts` reads `import.meta.env` only via
**static property access** through the `ENV_DEFAULTS` object. Never
write `import.meta.env[someVar]` — Vite will inline every `VITE_*`
field of the env into the client bundle.

## Adding a new module

1. **Create the module folder.** `src/modules/<id>/` with
   `index.ts` (or `.tsx` if you need JSX in routes/navItems).
2. **Implement `ModuleDefinition`.** At minimum: `id`, `name`,
   `version`, `category`, `icon`, `capabilities`, `description`. Add
   `routes`, `navItems`, `recordTypes`, `requires`, lifecycle hooks
   as needed.
3. **Lazy-load screens.** Use `React.lazy(() => import('@/screens/
   FooScreen').then(m => ({ default: m.FooScreen })))` so module
   activation doesn't drag every screen into the initial bundle.
4. **Register in the discovery barrel.** Add the import + a
   `moduleRegistry.register(<NameModule>)` line to
   `src/modules/index.ts`.
5. **Generate the contract test.** `node scripts/gen-module-tests.mjs`
   (re-emits all module test files idempotently). Add the new
   module's `id` and exported symbol name to the `MODULES` map at the
   top of the script first. Run `npm run test:modules` — should pass
   without any module-specific tweaks.
6. **Document.** Add a section to `docs/integration-test-plan.md`
   following the existing template (Preconditions / Happy path /
   Edge cases / Integration points). Add a row to the module table
   in `docs/architecture.md`.
7. **Verify the dynamic router picks it up.** `npm run dev`,
   navigate to `/settings/modules`, confirm the new card appears.
   Toggle it off and back on; routes should disappear and re-appear.

## Known gotchas / non-obvious decisions

**Circular import: `syncedStore` ↔ `propertyStore`.** Resolved as of
commit `eb8e455`. The cycle was actually 5 nodes deep
(`syncedStore → localIndex → vaultSingleton → propertyStore →
syncedStore`) but the visible failure was Vitest tripping TDZ on
`__vite_ssr_import_*` when the cycle's body was invoked at module
init. Two fixes: (a) `propertyDriveRoot.ts` provides a dependency-
free `getPropertyDriveRoot(propertyId)` reader so syncedStore no
longer imports propertyStore at all, and (b) `propertyStore` lazy-
inits its underlying `makeSyncedStore` call so the chain doesn't
fire mid-cycle. Both pieces are needed; see commit message for
detail.

**`react-leaflet` is pinned at `^4.2.1`.** v5 requires React 19. We
ship React 18, so v5 crashes at runtime ("Cannot read properties of
undefined" in `useContainer`). If `npm install` ever upgrades it,
roll back. Removing `node_modules/.vite` after a roll-back is required
because Vite caches the broken transform.

**Don't remount on data changes with `key={tick}`.** The codebase had
a regression where listing screens forced a remount of their child
components on every index update via a numeric `tick` prop used as
the React key. This destroyed in-flight form state, autocomplete
suggestions, and animation timings. Use `useIndexVersion()` (in
`src/lib/useIndexVersion.ts`) which subscribes to the `syncBus`
`index-updated` event and returns a render-driving primitive that
React reconciles against — rebuilding without remounting.

**Always include `id` in the `data` bag on every store save.** The
DSL Zod schemas all require `data.id: string`. The `IndexRecord` has
`id` at the top level too; `pushPending` mirrors it into `data.id`
during upload, and `pullFromDrive` pre-injects it before validation
for legacy records. If you bypass `makeSyncedStore` (rare — almost
always wrong), you must include `data.id` yourself or cross-device
pulls will fail Zod validation and surface as conflicts with reason
"Invalid data from remote".

**CRDT is whole-record, not field-level.** When devices A and B edit
DIFFERENT top-level keys of `data` concurrently, the merge surfaces
both as `conflictFields` and the user picks Mine or Theirs per path.
Disjoint-field auto-merge is a planned future upgrade
(`docs/architecture.md` § "Known limitations").

**Never pull bypassing `mergeRemoteRecord`.** `pullSingleRecord` (used
by `pollDriveChanges` and detail-screen mount effects) routes through
the shared `mergeRemoteRecord` helper so the same vclock-aware merge
runs whether the pull was triggered from a list screen, a detail
screen, or the periodic poll. Calling vault `pull` directly from UI
code overwrites in-flight conflict resolutions and is the source of
the "edit lost after 30s" regression that was fixed in commit
`eef405c`.

**Dynamic property access on `import.meta.env` leaks.** Vite inlines
every accessed env var, but a dynamic-key access (e.g.
`import.meta.env[def.envVar]`) inlines the **entire env object**.
Always use static property access through the `ENV_DEFAULTS`
allow-list. (See "Environment variables" above.)

## Worktree setup

When working in a git worktree (`.claude/worktrees/<name>/` or a
parallel checkout under the project root):

- The `.env` file is gitignored and won't be present. Copy it from
  the main project root before starting:
  ```bash
  cp "$(git rev-parse --show-toplevel)/../.env" . 2>/dev/null || true
  ```
  Without it, the login screen falls back to the credential-input
  flow and OAuth fails.
- Always pick a port in 5170–5179 so worktrees don't fight each
  other:
  `npm run dev -- --port 5176`.
- Sync before starting new work: `git fetch upstream && git log
  --oneline HEAD..upstream/master`. If you're behind, rebase before
  any new commits.

## Important rules

- **Never chain Bash commands with `&&` or `;`.** Run them as
  separate Bash tool calls. Output stays clean and partial failures
  are surfaced.
- **Settings reads go through `getSetting`/`setSetting`.** Never read
  `localStorage` directly for OpenRouter / HA / Drive client keys.
- **Dark mode uses CSS component classes** from `index.css`
  (`card-surface`, `modal-surface`, `input-surface`, etc.). Don't
  use bare `bg-white` / `text-slate-900` without a `dark:` variant —
  the component classes handle that uniformly.
- **OAuth scope is `drive.file`**, NOT `drive` — we only access
  files our app created. Don't widen the scope without an explicit
  product reason; the consent screen text changes and existing
  users will see a re-consent prompt.
