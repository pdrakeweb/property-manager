# Property Manager — Architecture

This is the deep reference. For the day-to-day onboarding view (how to
run, how to add a module, gotchas), start with
[`/CLAUDE.md`](../CLAUDE.md). For the QA-oriented per-module test
plan, see [`integration-test-plan.md`](integration-test-plan.md).

## 1. System overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Browser PWA                                 │
│                                                                      │
│  main.tsx                                                            │
│    └─ <ThemeProvider>                                                │
│       └─ <ToastProvider>                                             │
│          └─ <ActiveModuleProvider>                                   │
│             └─ <App>                                                 │
│                └─ <AppStoreProvider>                                 │
│                   └─ <HashRouter>                                    │
│                      └─ <AppShell>            ← static fallback nav  │
│                         │                       + dynamic per-active │
│                         │                         module nav         │
│                         └─ <ErrorBoundary>                           │
│                            └─ <Suspense>                             │
│                               └─ <AppRoutes>  ← useRoutes(           │
│                                  ├─ moduleRoutes  buildRoutes(ids))  │
│                                  └─ staticFallbackRoutes             │
│                                                                      │
│  React-side:        AppStoreContext (active property), syncBus       │
│                     (cross-tab events), syncedStore (domain CRUD)    │
│                                                                      │
│  Storage / sync:                                                     │
│  ┌─ localStorage  ──┬─ pm_index_v1  (record index)                   │
│  │                  ├─ pm_properties_v1  (property list)             │
│  │                  ├─ pm_<store>_v1  (per-domain stores)            │
│  │                  ├─ pm_dev_drive_v1  (dev mock Drive)             │
│  │                  └─ pm_settings_*  (per-user config)              │
│  │                                                                   │
│  └─ vaultSingleton  ─→  RecordVault  ─→  StorageAdapter              │
│                                            │                         │
│                                            ├─ GoogleDriveAdapter     │
│                                            │   (PKCE OAuth, real)    │
│                                            └─ MemoryAdapter          │
│                                                (dev_token bypass)    │
└──────────────────────────────────────────────────────────────────────┘
                                │
                                ▼  (at sign-in or sync tick)
                       ┌────────────────────┐
                       │  Google Drive API  │
                       │  scope drive.file  │
                       └────────────────────┘
```

The PWA is a static SPA. There is no application server. Persistence
flows through localStorage as the eager working copy and Google Drive
as the canonical store; the user's Drive root holds one folder per
record category (`equipment/`, `tasks/`, `permits/`, …) plus the
property-level config files.

## 2. Data model

### IndexRecord

The shape every store, every sync code path, and the conflict
resolver agree on:

```ts
interface IndexRecord {
  id:              string                    // UUID, also lives in `data.id`
  type:            IndexRecordType           // 'equipment' | 'task' | …
  propertyId:      string
  title:           string                    // derived via DSL
  data:            Record<string, unknown>   // user-facing fields
  syncState:       'local_only' | 'pending_upload' | 'synced'
                   | 'conflict' | 'deleted'
  vclock?:         VClock                    // per-device counter map
  conflictFields?: ConflictField[]           // for syncState='conflict'
  conflictReason?: string
  driveFileId?:    string
  driveEtag?:      string
  driveUpdatedAt?: string                    // ISO timestamp
  localUpdatedAt?: string
  deletedAt?:      string                    // tombstone marker
  categoryId?:     string                    // Drive folder routing
}
```

### syncState lifecycle

```
            user write                     push  ✓
   local_only ─────────────► pending_upload ─────► synced
        │                          │  ▲              │
        │  (no Drive root yet)     │  │ pull  ✓     │  user delete
        │                          │  │              ▼
        │           push 412 etag  │  │             deleted   (tombstone)
        │                          ▼  │              │
        │                       conflict             │  GC after 30 days
        │                          │                 ▼
        │                          │             (removed from index)
        │                          ▼
        │                  user resolves field-by-field
        │                          │
        ▼                          ▼
        └─► (re-enter the diagram via pending_upload)
```

- **`local_only`** — record persisted locally but the property has no
  `driveRootFolderId`, so it's not eligible for upload yet. The
  `syncedStore` factory writes this when `getPropertyDriveRoot(...)`
  returns empty.
- **`pending_upload`** — the canonical "needs to push" state. Set by
  every `add` / `update` / `upsert` through `makeSyncedStore`, and on
  conflict resolution once `conflictFields` is empty.
- **`synced`** — the local copy matches the last known Drive content.
  Sync ticks short-circuit on matching ETag here.
- **`conflict`** — vclock-aware merge produced one of: a
  validation-failure (legacy record fails Zod), `drive-wins` while
  the user had a stale local edit, or `concurrent` (neither vclock
  dominates). Surfaced in the SyncPill badge + `ConflictsModal`.
- **`deleted`** — tombstoned. The record stays in the index with
  `deletedAt` set so the deletion propagates to other devices on
  next sync. GC removes tombstones older than 30 days
  (`syncEngine.gcTombstones`).

### Tombstone GC

Every full sync (`syncAll`) calls
`vault.gcTombstones({ maxAgeDays: 30 })` after pull/push. Records with
`deletedAt < now - 30d` are removed from the local index AND deleted
from Drive. The 30-day window is long enough that any device offline
for less than a month sees the deletion before it's collected.

### vclock

```ts
type VClock = Record<DeviceId, number>
```

Per-device counters stored on every IndexRecord. `mergeRecords(local,
remote, deviceId)` returns one of:

- `equal` — `vclock[d] === remote.vclock[d]` for every device.
- `drive-wins` — `remote.vclock[d] >= local.vclock[d]` for all `d` and
  strictly greater for at least one. Adopt remote.
- `local-wins` — strictly mirror image of drive-wins.
- `concurrent` — neither dominates. Diff `data` field-by-field, write
  `conflictFields[]`.

`vclock.merge(a, b)` is the per-key max. `vclock.equals(a, b)` and
`vclock.dominates(a, b)` round out the primitives. All four
operations are pure and tested in
`src/vault/__tests__/vclock.test.ts` (24 tests, including CRDT-
property assertions: increment+dominates, merge commutativity /
associativity / idempotence).

## 3. Sync engine

Two layers:

- `src/vault/core/syncEngine.ts` — the CRDT-aware core: per-property
  `pullFromDrive`, `pushPending`, `pullSingleRecord`,
  `mergeRemoteRecord`. Validates every remote payload against the
  registered Zod schema BEFORE running the vclock comparison so a
  garbled remote can't silently win.
- `src/lib/syncEngine.ts` — host-app entry points consumed by React
  components: `useStartupSync`, `pollDriveChanges`,
  `syncPendingPhotos`, `syncPropertyConfig`, `syncAuditLog`,
  `seedTasksForProperty`. Composes the vault-core APIs with the host's
  property store, audit log, OAuth token, and `syncBus` event channel.

### Startup pull → 30s poll → mutation push

```
┌───────────── App boot ─────────────────────────────────────────────┐
│                                                                    │
│ 1. main.tsx mounts <App>                                           │
│ 2. App auth gate: localStorage.google_access_token ⇒ MainApp       │
│ 3. MainApp() calls useStartupSync():                               │
│    - syncPropertyConfig (legacy pm_properties.json)                │
│    - syncAll(token, propertyId) for the active property            │
│    - syncAuditLog                                                  │
│    - seedTasksForProperty (idempotent first-time seed)             │
│    - syncPendingPhotos                                             │
│ 4. AppShell mounts → starts pollDriveChanges() interval (30s) +   │
│    focus-driven HA refresh                                         │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘

┌─────────── Mutation cycle (any module) ────────────────────────────┐
│                                                                    │
│ store.upsert(item)                                                 │
│   ├─ baseStore.upsert(item)              (pm_<store>_v1)           │
│   └─ syncToIndex(item)                                             │
│      ├─ Zod validate → audit if invalid                            │
│      └─ localIndex.upsert({ ..., syncState: 'pending_upload' })    │
│         └─ syncBus.emit('index-updated')                           │
│            └─ subscribers (UI, badge counters) re-render           │
│                                                                    │
│ Next tick of pollDriveChanges (or manual /sync push):              │
│   pushPending(token, propertyId)                                   │
│     ├─ for each record where syncState === 'pending_upload':       │
│     │  ├─ resolve folder: registry.getDef(type).folderName         │
│     │  ├─ JSON.stringify({ ...record, data: {..., id, filename,    │
│     │  │                  rootFolderId, categoryId } })            │
│     │  ├─ storage.uploadFile(folder, name, content,                │
│     │  │                     'application/json', if-match=etag)    │
│     │  ├─ on success → localIndex.markSynced(id, fileId, etag)     │
│     │  └─ on 412 ETag conflict → resolveConflict(record, error)    │
│     │     │                                                        │
│     │     └─ same vclock-aware merge as the pull-side;             │
│     │        write back with merged clock + conflictFields if      │
│     │        concurrent                                            │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Pull-side: how `mergeRemoteRecord` decides

For each Drive file in a category folder:

1. ETag match against the local copy → short-circuit, skip download.
2. Else download + JSON parse.
3. Pre-inject `id` from the IndexRecord top level into `remote.data`
   (defends against legacy records written before the push-side
   `data.id` heal landed).
4. Validate `remote.data` against the registered Zod schema.
   - Failure → mark local as `conflict` with reason "Invalid data
     from remote: …", do NOT run the vclock compare.
5. If no prior local copy → first-time pull. If `remote.deletedAt`
   set, mirror as a tombstone; else mark `synced`.
6. Else call `mergeRecords(local, remote, deviceId)`:
   - `equal` → refresh ETag; if `local.syncState === 'conflict'`, also
     clear stale `conflictReason` / `conflictFields` and reset to
     `synced`.
   - `local-wins` → refresh ETag, set `syncState = 'pending_upload'`
     (or `'deleted'` for tombstones), clear stale conflict state.
   - `drive-wins` → adopt remote with merged clock.
   - `concurrent` → write LOCAL data back (so the user's in-flight
     edit isn't lost) with the merged clock and a `conflictFields`
     array describing each diverging top-level key of `data`.

`pullSingleRecord` (used by detail-screen mount effects and the 30s
poll) routes through the same `mergeRemoteRecord` helper. UI code MUST
NOT call vault `pull` directly or it'll destructively overwrite
in-flight conflict resolutions — see the "edit lost after 30s"
regression fix in `eef405c`.

### ConflictsModal resolution

The badge in `AppShell` shows a count of records with
`syncState === 'conflict'`. Clicking opens the modal, which iterates
`conflictFields`. Each row shows the local value, remote value, and
buttons "Keep mine" / "Keep theirs". Clicking either calls
`resolveConflictField(record, fieldPath, side)` (in
`src/vault/core/mergeRecord.ts`), which:

1. Removes the field from `record.conflictFields`.
2. If `side === 'theirs'`, copies `target.remote` into `record.data`.
3. When `conflictFields` empties, sets `syncState = 'pending_upload'`
   so the next push uploads the user's resolved version.

`ConflictsModal` listens for `index-updated` syncBus events; the
badge count and modal contents stay live as the user resolves.

## 4. Module system

### Lifecycle: register → resolve → activate → render

```
boot                                       per-property
─────────────────                          ─────────────
src/modules/index.ts            ┌───►  enabled flags read from
   moduleRegistry.register(…)   │      localStorage[pm_property_modules_<id>]
   for every built-in module    │                │
                                │                ▼
   moduleRegistry.getAll()  ←───┘      expandWithDeps(enabled)
                                                 │
                                                 ▼
                                       activeIds: Set<ModuleId>
                                                 │
                              ┌──────────────────┼──────────────────┐
                              ▼                  ▼                  ▼
                        buildRoutes        useShellNav       getActivationOrder
                        (RouterBuilder)    (AppShell)        (DepResolver,
                              │                  │           post-order DFS)
                              ▼                  ▼                  │
                        useRoutes(...)    sidebar items              │
                              │                  │                  ▼
                              ▼                  ▼          for each ModuleDef:
                        rendered route    rendered nav            mod.onActivate()
```

### ModuleDefinition contract

```ts
interface ModuleDefinition {
  id:           string                       // kebab-case, unique
  name:         string                       // display
  description:  string
  version:      string                       // semver
  category:     'core' | 'property' | 'systems' | 'finance' | 'ai' | 'tools'
  icon:         string                       // emoji or Lucide name
  capabilities: string[]                     // bullet list for module browser
  required?:    boolean                      // can't be disabled (core only today)
  requires?:    string[]                     // hard deps (cascade enable/disable)
  enhances?:    string[]                     // soft pairings (browser-UI only)
  routes?:      RouteObject[]                // React-Router routes
  navItems?:    NavItem[]                    // sidebar entries
  recordTypes?: RecordTypeRegistration[]     // owned record types
  settingsSection?: SettingsSection          // panel in /settings
  onActivate?:  (propertyId: string) => Promise<void> | void
  onDeactivate?:(propertyId: string) => Promise<void> | void
}
```

### Registered modules

| id | category | requires | core capability |
|---|---|---|---|
| `core` | core | — | Always-on baseline (Dashboard, Settings, Sync, Search) |
| `maintenance` | property | — | Tasks, completed events, checklists, guided checklists |
| `inventory` | property | — | Equipment capture, detail, category-driven forms |
| `permits` | property | — | Permit lifecycle + expiry |
| `contents` | property | `ai` | AI-extracted insurance contents inventory |
| `narrative` | property | — | Free-form property narrative |
| `capital` | finance | — | Capital plan + spend tracking |
| `insurance` | finance | — | Policy list + renewals |
| `mortgage` | finance | — | Loan + amortization + payment log |
| `tax` | finance | — | Assessments, payments, YoY trend |
| `ha` | systems | — | Home Assistant live state, alerts, thresholds |
| `fuel` | systems | — | Propane/heating-oil delivery log + burn rate |
| `utility` | systems | — | Accounts (electric/gas/water) + monthly bills |
| `well` | systems | — | Well-test tracking |
| `septic` | systems | — | Pump-out log + next-due |
| `generator` | systems | — | Standby generator runtime + transfer-switch log |
| `road` | systems | — | Driveway / road maintenance log |
| `ai` | ai | — | OpenRouter advisor + condition assessment |
| `risk` | ai | `ai` | Property-level risk-brief generation |
| `calendar` | tools | — | Cross-module event calendar |
| `map` | tools | — | Leaflet map + climate zone overlay |
| `vendor` | tools | — | Contractor directory |
| `homebook` | tools | — | Long-form home book PDF export |
| `import` | tools | `ai` | Drive inbox poller + AI candidate extraction |
| `search` | tools | — | Cross-record full-text search |
| `expiry` | tools | — | Aggregated expiry tracker (90-day window) |

### Dep cascade

`computeToggle(prev, moduleId)` enforces both directions:

- **Turning ON** a module: BFS through `requires`, set every transitive
  dep to `true`. (Enabling `contents` also enables `ai`.)
- **Turning OFF** a module: walk every other module's `requires`; if
  the target appears (transitively) and the dependent isn't `required:
  true`, set it to `false`. (Disabling `ai` cascades off `contents`,
  `import`, `risk`.)

The cascade-off is one-way: re-enabling `ai` doesn't auto-re-enable
`contents` (the user explicitly turned it off when AI went; that
intent is preserved). The `Reset to defaults` button restores the
all-enabled state directly.

`assertNoCycles()` runs at boot (`main.tsx`). DFS gray/black coloring
over the registered modules; a back-edge throws an Error that names
every module on the cycle so the misconfigured `requires` chain is
obvious.

### Phase status

| Phase | Status | Description |
|---|---|---|
| Phase 0 | ✅ done | Registry framework: `ModuleDefinition`, `ModuleRegistry`, `DepResolver`, `ActiveModuleContext` |
| Phase 1 | ✅ done | Core module declared + always-on; `<ActiveModuleProvider>` mounted; defaults policy = all enabled |
| Phase 2 | ✅ done | All 26 module declarations (every module owns its routes, navItems, recordTypes) |
| Phase 3 | ✅ done | `<AppRoutes>` builds React-Router routes from `useActiveModuleIds()`; `AppShell` builds nav from the same set |
| Phase 4 | ⏸ planned | Module hot-reload (re-execute `onActivate` when a module is toggled on after first boot), settings sections rendered from `mod.settingsSection`, Zod migration runner via `mod.recordTypes[].migrate` |

## 5. Store pattern

### `makeSyncedStore<T>` factory internals

```
makeSyncedStore<T>(key, indexType, driveCategoryId, getPropertyId?)
  │
  ├─ store = makeStore<T>(key)              // plain JSON-array localStorage
  │
  ├─ resolvePropertyId = getPropertyId
  │                      ?? ((r) => r.propertyId)
  │
  ├─ def = getDefinition(indexType)         // DSL Zod schema + title fn
  │
  └─ returns {
       ...store,                             // getAll, getById, raw read
       add(item):    store.add(item);    syncToIndex(item)
       update(item): store.update(item); syncToIndex(item)
       upsert(item): store.upsert(item); syncToIndex(item)
       remove(id):   store.remove(id); localIndex.softDelete(id)
     }

syncToIndex(item):
  propId  = resolvePropertyId(item)
  rootId  = getPropertyDriveRoot(propId)    // dependency-free reader
  if !rootId: return                         // no Drive root → local_only
  if def: zod.safeParse(item) → audit on failure
  title   = resolveTitle(def, item) ?? `${type}_${id.slice(0,8)}`
  localIndex.upsert({
    id, type, propertyId, title,
    data: { ...item, filename, rootFolderId, categoryId },
    syncState: 'pending_upload',
  })
```

The factory is invoked from each domain store
(`capitalItemStore.ts`, `insuranceStore.ts`, `permitStore.ts`,
`fuelStore.ts`, `mortgageStore.ts`, etc.). They all close over a
single shared `localIndex` instance via the singleton in
`vaultSingleton.ts`.

### Why `getPropertyDriveRoot` exists

Until commit `eb8e455`, `syncedStore.ts` imported `propertyStore`
directly to look up `driveRootFolderId`. That created a 5-node import
cycle:

```
syncedStore  →  localIndex  →  vaultSingleton  →  propertyStore  →  syncedStore
```

Vite's browser ESM tolerates the cycle (every module finishes top-
level evaluation before any function body runs). Vite's SSR (vite-
node, used by Vitest + the Phase D vault test harness) tracks each
import as a lazy `__vite_ssr_import_*` binding; calling
`getDefinition(...)` from a `makeSyncedStore` invocation that ran
mid-cycle hit a TDZ error.

The fix:
1. Extract `getPropertyDriveRoot(propertyId): string` to its own
   dependency-free file (`lib/propertyDriveRoot.ts`). It reads the
   same `pm_properties_v1` localStorage key `propertyStore` writes
   to. `syncedStore` imports from this file instead, breaking the
   first edge of the cycle.
2. `propertyStore` lazy-inits its underlying `makeSyncedStore` call
   (deferred to first method invocation). The remaining
   `localIndex → vaultSingleton → propertyStore` arc still exists
   but no longer fires `makeSyncedStore`'s body during cycle
   resolution.

Both changes are minimal — public APIs unchanged.

### `syncBus` and the `useIndexVersion` pattern

`syncBus` is a tiny pub-sub with one event type today: `{ type:
'index-updated', recordIds: string[], source: 'local' | 'remote' }`.
Emitters: every `localIndex.*` write, every `vault.localIndex.*`
write (forwarded by `vaultSingleton.ts`), and direct
`propertyStore.notifyPropertyChange` calls.

UI components subscribe via `useIndexVersion()` which returns a
monotonic counter that increments on every event. Components include
the version in their `useEffect` deps and re-derive — but they DON'T
remount. The historical anti-pattern was

```tsx
<List key={tick}>{...}</List>
```

which forced a full subtree remount, destroying form state and
animation timings. `useIndexVersion()` lets reconciliation do its
job: same component instances, fresh derived data.

## 6. Auth and Drive

### OAuth PKCE flow

`src/auth/oauth.ts` implements the [Google PKCE flow][pkce] for an
"installed app"-class client. Steps:

1. App generates a `code_verifier` (random 64-char) and a
   `code_challenge` (SHA-256 of verifier, base64url).
2. User clicks "Sign in with Google" → redirect to
   `https://accounts.google.com/o/oauth2/v2/auth` with `client_id`,
   `redirect_uri`, `code_challenge`, `code_challenge_method=S256`,
   `scope=https://www.googleapis.com/auth/drive.file`,
   `access_type=offline`, `prompt=consent`.
3. Google redirects back with `?code=...`. The callback handler in
   `App.tsx` exchanges code + verifier for tokens at
   `https://oauth2.googleapis.com/token`.
4. Tokens persisted to `localStorage.google_access_token` (1h) and
   `google_refresh_token` (long-lived). `getValidToken()` refreshes
   if `_expires` has passed.

[pkce]: https://datatracker.ietf.org/doc/html/rfc7636

### `localDriveAdapter` (dev mock)

`createMemoryAdapter({ kvStore: localStorage, storeKey:
'pm_dev_drive_v1' })` gives the same `StorageAdapter` interface as
the real Google Drive client but persists everything to one
localStorage key. Selected automatically when
`localStorage.google_access_token === 'dev_token'`.

The dev adapter implements:
- File hierarchy (id, parentId, name, isFolder)
- Eager ETag bumping on every write (`v1` → `v2` → …)
- `If-Match`-header semantics on uploads (returns the ETag conflict
  error type the real adapter throws)
- `modifiedTime` ISO timestamp

This is what every Playwright spec uses, what the manual integration
test plan assumes, and what the multi-device CRDT scenarios in
`tests/multi-device.spec.ts` script.

To enable in a dev session manually:
```js
localStorage.google_access_token = 'dev_token'
localStorage.google_user_email   = 'dev@local'
localStorage.active_property_id  = 'tannerville'
location.reload()
```

## 7. Testing architecture

Three layers, with different runners for tradeoff reasons:

| Layer | Runner | Files | Tests | Speed | What it validates |
|---|---|---|---|---|---|
| Vault unit | `node --test` | `src/vault/__tests__/*.test.ts` | 109 | ~1s | CRDT primitives, syncEngine merge logic, vclock arithmetic, validation. Pure code, no DOM, no React. |
| Module contract | Vitest (jsdom) | `src/modules/**/*.test.ts` | 91 in 30 files | ~14s | Every module's `ModuleDefinition` shape; `ModuleRegistry`, `DepResolver`, `computeToggle` cascade; module-specific lib export checks (e.g. `pollInbox`, `assessCondition`). |
| E2E | Playwright (Chromium) | `tests/*.spec.ts` | varies | ~30s+ | Full app: auth bypass, sidebar nav, Drive sync round-trips, CRDT multi-device, module toggle UI. |

### When to add tests where

- **New CRDT logic** → vault unit. Add to `src/vault/__tests__/`.
- **New module registered** → run `node scripts/gen-module-tests.mjs`
  (after adding the new module's id and exported symbol to the
  generator's `MODULES` map). Add module-specific assertions if
  needed via the `EXTRAS` block.
- **New cross-module flow** → Playwright spec under `tests/`.
- **New per-domain behavior** (e.g. capital item write triggers
  calendar entry) → integration-test-plan.md cross-module scenario,
  optionally a Playwright spec for the user-facing surface.

### Vitest setup specifics

`vitest.config.ts` uses jsdom + the `@/*` alias + a setup file
(`vitestSetup.ts`). The setup is now intentionally minimal — only
`@testing-library/jest-dom/vitest` matchers. The earlier mocks for
`propertyStore` / `inboxPoller` / `expiryStore` were a workaround for
the syncedStore cycle and were removed once the cycle was broken.

## 8. Security decisions

### Client secret is NOT in the bundle

The PKCE flow does not require a client secret — `code_verifier`
proves possession of the original challenge. Earlier in the project's
history, `settings.ts` accessed `import.meta.env[def.envVar]` with a
dynamic key. Vite's transform inlines the **entire env object** on
dynamic access, which leaked `VITE_GOOGLE_CLIENT_SECRET` into every
production bundle. The fix (commit `91a3b15`):

1. Added a static `ENV_DEFAULTS` allow-list mapping each safe env var
   to its `import.meta.env.VITE_*` literal.
2. Replaced `import.meta.env[def.envVar]` with
   `ENV_DEFAULTS[def.envVar]`.
3. Removed `VITE_GOOGLE_CLIENT_SECRET` from `.env.example` and from
   the runtime config UI.

If you ever need a new env var:
- Decide if it's safe to bundle. If yes, add to `ENV_DEFAULTS`. If
  no (e.g. a backend secret), it doesn't belong in this codebase —
  proxy it through a real server.
- Never use dynamic property access on `import.meta.env`.

### OAuth scope: `drive.file`, not `drive`

`drive.file` only grants access to files this app created or the user
explicitly opened with the app. `drive` grants full read/write across
the user's entire Drive. We never need that.

The user's data lives in one root folder per property under their
Drive, named per their preference (`Property Manager — Tannerville`,
etc.). Switching properties switches root folders; we never read
outside.

### Token storage

Access + refresh tokens live in `localStorage`. This is the same
threat model as the rest of the app's data — a script-injection
attack on the static host can read them. Mitigations:

- No third-party scripts in `index.html`. No analytics, no CDN
  scripts, no ad SDKs. Every `<script>` is self-hosted.
- All user input is rendered through React (escapes by default) or
  `@/lib/markdownFormatter` (sanitizing markdown renderer).
- Drive API responses are JSON-parsed and Zod-validated; we never
  `eval()` or `new Function()` on user content.

A future improvement is moving tokens to `sessionStorage` or a
`HttpOnly` cookie behind a thin auth proxy, but that requires a
server. Current tradeoff: 100% static host, no infra, accept the
risk.

## 9. Known limitations and future work

### Resolved

- ✅ **`syncedStore` ↔ `propertyStore` circular import.** Fixed in
  commit `eb8e455` via `propertyDriveRoot.ts` extraction + lazy-init
  of `propertyStore`'s underlying `makeSyncedStore` call.
- ✅ **Client secret leaked into bundle.** Fixed in `91a3b15` via the
  static `ENV_DEFAULTS` allow-list.
- ✅ **`pullSingleRecord` bypassed vclock comparison.** Fixed in
  `eef405c` by extracting `mergeRemoteRecord` and routing every pull
  path through it.
- ✅ **`react-leaflet@5` crashed under React 18.** Pinned to
  `^4.2.1`.
- ✅ **`key={tick}` remount anti-pattern.** Replaced with
  `useIndexVersion()` + reconciliation.

### Open

- **CRDT is whole-record, not field-level.** When devices A and B
  edit different top-level keys of `data` concurrently, both paths
  surface as `conflictFields[]` and the user resolves Mine/Theirs per
  path. A field-level merge with last-writer-wins per leaf would
  collapse most of these conflicts to auto-merges. The trade-off is
  schema-aware: only schemas with commutative leaf updates (e.g.
  `cost: number`) auto-merge cleanly. See `planning/CRDT-PLAN.md`
  (when written) for the upgrade path.
- **Module hot-reload (Phase 4).** Toggling a module ON after first
  boot calls `onActivate` once, but its `recordTypes` aren't yet
  registered with the vault registry at that point — they were
  registered at app boot. Until Phase 4, the recommended path is to
  re-mount the property (switch away and back) which re-runs
  activation order. Phase 4 would re-register record types
  dynamically and re-build the route table on the fly without a
  remount.
- **Settings sections from `mod.settingsSection`.** The Settings
  screen still has a hand-rolled list of panel sections. The
  `ModuleDefinition.settingsSection?` field is wired up to the type
  system but the Settings screen doesn't iterate `moduleRegistry`
  yet to render them. Phase 4 work.
- **Zod migration runner.** `RecordTypeRegistration.migrate` is
  declared on the contract but no module ships a migration today.
  When Phase 4 adds the runner, the vault's `pullFromDrive` will
  call `migrate(oldRecord)` for any pull whose stored record version
  is older than the current schema's version field.
- **Offline-first gaps.** The 30s pull-poll plus on-mutation push
  works well online and tolerates short offline windows. True
  offline-first would queue every mutation in IndexedDB
  (`offlineQueue.ts` is the start) and replay on reconnect with
  exponential backoff. Today: if you write while offline and reload
  before reconnecting, the in-progress queue survives but the UI
  gives no clear indication it's pending.
- **Module hot-disable side effects.** `onDeactivate` runs but the
  module's leftover records stay in the index and on Drive (by
  design — re-enabling should restore them). There's no "clean up
  this module's data" flow if a user wants to remove a module's
  content forever; that's a deliberate omission to avoid accidental
  data loss but a future settings-screen "purge module data" action
  could fill the gap.
