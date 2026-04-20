# Code Review — Property Manager (master post-merge)

**Date:** 2026-04-13  
**Reviewer:** Claude (automated read-only review)  
**Branch reviewed:** master (after merging `claude/relaxed-maxwell`)  
**Scope:** Full `src/` tree

---

## §1 — Duplicate and Orphaned Modules

### Two auth implementations (one deleted, one active)

| File | Status | Notes |
|------|--------|-------|
| `src/auth/oauth.ts` | **Active** | Correct PKCE, no client secret; used by `App.tsx` |
| `src/auth/AuthContext.tsx` | **Deleted** (missing from tree) | Was in master pre-merge; `main.tsx` still imports it — **build error** |

`src/main.tsx:5` imports `{ AuthProvider } from './auth/AuthContext'` and wraps `<App />` with it. Since `App.tsx` manages its own auth state and never calls `useAuth()`, the wrapper was already functionally dead before the file was lost. Its deletion makes `main.tsx` un-buildable.

### Drive client: one file, one deleted folder

| File | Status |
|------|--------|
| `src/lib/driveClient.ts` | **Active** — dynamic folder find-or-create |
| `src/drive/DriveClient.ts` | **Gone** — was in master pre-merge |
| `src/drive/FolderMap.ts` | **Gone** — was in master pre-merge |

`src/data/categories.ts:6` imports `{ DRIVE_FOLDER_MAP } from '../drive/FolderMap'`. That file is missing — **second build error**.

### Two `CATEGORIES` exports with different types

| Location | Export type | Used by |
|----------|-------------|---------|
| `src/data/categories.ts` | `CaptureCategory[]` — has `fields`, `driveFolderId`, `nameplatePrompt` | `EquipmentFormScreen` |
| `src/data/mockData.ts` | `Category[]` — has `description`, `propertyTypes`, `recordCount` | Dashboard, Inventory, Maintenance, Budget screens |

Both are named `CATEGORIES`. There is no shared supertype. Code that navigates between screens (e.g. CaptureSelectScreen reads mockData `CATEGORIES` for ids, then EquipmentFormScreen reads `categories.ts`) may disagree on category IDs (see §7).

### Offline queue: two implementations

| File | Storage | Photo support |
|------|---------|--------------|
| `src/lib/offlineQueue.ts` | localStorage | No — stores `mdContent: string` only |
| `src/hooks/useOfflineQueue.ts` | IndexedDB via `idb-keyval` | Yes — stores `photoDataUrls: string[]` |

`src/hooks/useOfflineQueue.ts` is **not in the current file tree** (deleted by merge). `src/lib/offlineQueue.ts` is the active implementation but cannot store photo blobs; photos are silently lost when a save is queued offline.

### Markdown formatter duplication

`src/lib/markdownFormatter.ts` is the active formatter. The path `src/utils/markdownFormatter.ts` (referenced in the spec) does not exist; the active file is correctly in `lib/`.

---

## §2 — TypeScript Correctness

### Unused union member in `App.tsx`

```typescript
// App.tsx:250
type AuthState = 'checking' | 'callback' | 'authenticated' | 'unauthenticated'
```

`'checking'` is part of the type but never assigned — the state is initialized directly to `'callback'`, `'authenticated'`, or `'unauthenticated'` in the `useState` initializer. Dead code; `noUnusedLocals` doesn't catch union members.

### Category folder ID mismatches in `categories.ts`

`CaptureCategory.driveFolderId` is populated from the missing `FolderMap`, but the field keys reveal logical problems that will persist if FolderMap is restored:

| Category | `driveFolderId` value | Problem |
|----------|-----------------------|---------|
| `waterHeater` | `DRIVE_FOLDER_MAP.waterTreatment` | Water heater records land in the water treatment folder |
| `wellSystem` | `DRIVE_FOLDER_MAP.waterTreatment` | Well records also land in water treatment folder |
| `septic` | `DRIVE_FOLDER_MAP.root` | No dedicated subfolder — dumped at root |
| `barn` | `DRIVE_FOLDER_MAP.root` | Same issue |
| `electricalPanel` | `DRIVE_FOLDER_MAP.projects` | Semantically odd; "projects" is not the electrical panel folder |
| `appliance` | `DRIVE_FOLDER_MAP.kitchen` | Misses laundry/garage appliances |

Note: `EquipmentFormScreen` does **not** use `driveFolderId` at all — it calls `DriveClient.resolveFolderId(token, categoryId, rootFolderId)` which does dynamic folder resolution by name. So these bad folder IDs have no runtime effect currently. The field is dead weight until wired.

### `formatRecord` type mismatch (low severity)

`src/lib/markdownFormatter.ts:8` accepts `Category` from `../types`. The `Category` type from `types/index.ts` does not have `fields`, `driveFolderId`, or `nameplatePrompt` — it is the mock-data variant. `EquipmentFormScreen` calls `formatRecord` with a `CaptureCategory` from `categories.ts`. TypeScript won't error because `CaptureCategory` is structurally a superset, but the formatter only uses `category.label` and `category.id`, so no runtime issue today. A future refactor that adds field-aware formatting would hit this type gap.

---

## §3 — Import Consistency

### Broken imports (build blockers — see §8)

```
src/main.tsx:5      → './auth/AuthContext'     (file missing)
src/data/categories.ts:6 → '../drive/FolderMap' (file missing)
```

### Unused path alias

`@/` is configured in both `vite.config.ts` and `tsconfig.json` (`@` → `./src`) but **zero files use it**. Every import is a relative path. The alias adds configuration surface area with no benefit until adopted.

### Split data dependency between screens

Screens pull from two incompatible data sources:

| Screen | Import source |
|--------|--------------|
| `EquipmentFormScreen` | `../data/categories` (CaptureCategory — real schema) |
| `CaptureSelectScreen` | `../data/mockData` (Category — mock, for category list + navigation) |
| `DashboardScreen` | `../data/mockData` |
| `InventoryScreen` | `../data/mockData` |
| `MaintenanceScreen` | `../data/mockData` |
| `BudgetScreen` | `../data/mockData` |
| `AIAdvisoryScreen` | `../data/mockData` (SAMPLE_AI_MESSAGES, SUGGESTED_PROMPTS) |

This means the "live" path (CaptureSelect → EquipmentForm) straddles both data models and has an ID mismatch (see §7).

---

## §4 — Screen Completeness

| Screen | Wiring status | Gaps |
|--------|--------------|------|
| `EquipmentFormScreen` | **Fully wired** | Photo blobs lost on offline queue; `driveFolderId` field unused |
| `CaptureSelectScreen` | **Partially wired** | Drive file counts live; category list still from mockData |
| `SettingsScreen` | **Wired** | OR key read here but not passed to AI screen |
| `DashboardScreen` | **Mock only** | HA values, maintenance tasks, capital items all static |
| `MaintenanceScreen` | **Mock only** | "Mark Done" is UI-only useState — no persistence |
| `BudgetScreen` | **Mock only** | `CURRENT_YEAR = 2026` hardcoded; no real cost data |
| `AIAdvisoryScreen` | **Simulated only** | Has model picker with OpenRouter model IDs; sends no real API calls; uses `setTimeout` to fake a response |
| `InventoryScreen` | **Mock only** | Reads mockData CATEGORIES and EQUIPMENT |

The "Mark Done" button in `MaintenanceScreen` resets to undone on page refresh — state is not persisted. The "Delay" and "Schedule" buttons are rendered but have no `onClick` handlers.

---

## §5 — Auth Flow Correctness

### PKCE implementation

`src/auth/oauth.ts` is a correct public-client PKCE implementation:
- Code verifier generated via `crypto.getRandomValues`, base64url encoded ✓
- Code challenge: SHA-256 hash, base64url encoded ✓
- State validated on callback to prevent CSRF ✓
- No client secret in token requests ✓
- Refresh token stored; proactive refresh 5 minutes before expiry ✓

### `isAuthenticated()` does not check expiry

```typescript
// auth/oauth.ts:165
export function isAuthenticated(): boolean {
  return !!localStorage.getItem('google_access_token')
}
```

The presence of a token is checked but not its expiry. A user whose token expired and has no refresh token will pass `isAuthenticated()` and see the main app, but all Drive calls will return 401 until they are silently signed out by `getValidToken()`. A better check:

```typescript
export function isAuthenticated(): boolean {
  const token = localStorage.getItem('google_access_token')
  if (!token) return false
  const expiresAt = Number(localStorage.getItem('google_token_expires_at') ?? 0)
  return Date.now() < expiresAt
}
```

### Dead `AuthProvider` wrapper in `main.tsx`

Even when `AuthContext.tsx` existed, wrapping `App` with `AuthProvider` was redundant — `App.tsx` manages its own auth state through `useState` + `oauth.ts` helpers and never calls `useAuth()`. The fix is simply to remove the wrapper and its import from `main.tsx`.

### Dev bypass leaves no refresh token

`devBypass()` sets `google_access_token = 'dev_token'` with a 1-hour expiry but no refresh token. After one hour, `getValidToken()` will call `refreshAccessToken()`, fail (no refresh token), then call `signOut()` — silently logging the dev user out mid-session.

---

## §6 — Drive Integration

### Active client (`src/lib/driveClient.ts`)

- `resolveFolderId` — calls `findOrCreateFolder` which searches by name then creates. Correct; no caching means 2 API calls per capture (search + optional create).
- `uploadFile` — multipart FormData. Google requires `uploadType=multipart` for files under 5 MB. Correct for markdown files; photo uploads would need resumable upload for large images.
- `listFiles` — pageSize hardcoded at 100. Folders with >100 files will silently truncate.

### N+1 API calls on CaptureSelectScreen load

`CaptureSelectScreen` calls `DriveClient.listFiles` once per category to derive a count. With 15 categories × 2 Drive calls each (folder resolve + list), a cold load fires 30+ API requests. This will hit Drive API rate limits and is slow on mobile.

### Photo blobs lost on offline queue

`src/lib/offlineQueue.ts` queues `QueuedUpload` with `mdContent: string` — there is no field for photo blobs. Photos captured while offline are dropped. The IndexedDB-backed implementation (`useOfflineQueue.ts`, now missing) stored `photoDataUrls: string[]` which handles this at the cost of base64 bloat.

### `.env.example` has `VITE_GOOGLE_CLIENT_SECRET`

```
VITE_GOOGLE_CLIENT_SECRET=   # from .env.example
```

A public SPA using PKCE has no client secret. This variable should not exist. Its presence in the example file invites misconfiguration where a secret is added — which would then be visible in the built JS bundle.

---

## §7 — Data Categories

### Category ID mismatch between the two data sources

`src/data/categories.ts:319` defines:
```typescript
const forestryLog: CaptureCategory = { id: 'forestry_log', ... }
```

`src/data/mockData.ts:46` defines:
```typescript
{ id: 'forestry_cauv', label: 'Forestry / CAUV', ... }
```

`CaptureSelectScreen` reads from `mockData.CATEGORIES` and navigates to `/capture/forestry_cauv`. `EquipmentFormScreen` looks up the category in `CATEGORY_MAP` from `categories.ts`. The ID `'forestry_cauv'` is not in `CATEGORY_MAP` — the form would fall back to an empty/unknown category.

### Missing `service_record` in categories.ts

`mockData.CATEGORIES` includes `service_record` (id: `'service_record'`). `categories.ts` does not define it. If a user navigates to `/capture/service_record`, `EquipmentFormScreen` finds no matching category and renders nothing useful.

### 15 vs 16 categories

`categories.ts` defines 15 categories (generator through radon). `mockData.CATEGORIES` defines 16 (adds `service_record`). The two arrays are not in sync.

### `EquipmentFormScreen` maintains its own field definitions

`EquipmentFormScreen` has a large inline `CATEGORY_FIELDS` map that duplicates the field definitions in `categories.ts`. Two sources of truth for field schemas will drift. The `categories.ts` field definitions should be the canonical source.

---

## §8 — Build Blockers

These issues will cause `npm run build` (or `tsc`) to fail immediately.

### Blocker 1: Missing `src/auth/AuthContext.tsx`

```
src/main.tsx:5: Cannot find module './auth/AuthContext'
```

**Fix:** Remove lines 5 and 9–11 from `main.tsx`:

```tsx
// Remove:
import { AuthProvider } from './auth/AuthContext'

// Change:
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`AuthProvider` was never used by `App.tsx` and can be safely dropped.

### Blocker 2: Missing `src/drive/FolderMap.ts`

```
src/data/categories.ts:6: Cannot find module '../drive/FolderMap'
```

**Fix option A:** Restore `FolderMap.ts` from git history (`git show b1dd7d8:src/drive/FolderMap.ts > src/drive/FolderMap.ts`).

**Fix option B:** Remove the `driveFolderId` field from `CaptureCategory` entirely (it is not used by the active `DriveClient.resolveFolderId` flow) and drop the import.

Option B is cleaner until FolderMap is purposefully re-integrated.

---

## §9 — Quick Wins

In rough priority order:

| Priority | Win | Effort |
|----------|-----|--------|
| **Critical** | Fix Blocker 1: remove `AuthProvider` from `main.tsx` | 3 lines |
| **Critical** | Fix Blocker 2: drop `FolderMap` import from `categories.ts` | 2 lines |
| **High** | Remove `VITE_GOOGLE_CLIENT_SECRET` from `.env.example` | 1 line |
| **High** | Add token-expiry check to `isAuthenticated()` | 4 lines |
| **High** | Reconcile category ID: `forestry_log` vs `forestry_cauv` | pick one, update both files |
| **Medium** | Add `service_record` to `categories.ts` OR remove it from CaptureSelectScreen's navigation | — |
| **Medium** | Cache `resolveFolderId` result in `CaptureSelectScreen` to reduce 30+ API calls to ~15 | — |
| **Medium** | Wire `AIAdvisoryScreen` to real OpenRouter API using key from settings | — |
| **Medium** | Replace `CURRENT_YEAR = 2026` in BudgetScreen with `new Date().getFullYear()` | 1 line |
| **Low** | Remove unused `'checking'` from `AuthState` type in `App.tsx` | 1 char |
| **Low** | Adopt `@/` path alias consistently or remove the alias config entirely | — |
| **Low** | Unify field definitions: make `EquipmentFormScreen` read from `categories.ts` instead of its own inline map | — |

---

## Summary

The two **build blockers** (§8) must be resolved before any other work proceeds — `npm run build` will fail. Both are 1–3 line fixes. After those, the app is functional for the documented capture flow (auth → select category → fill form → upload to Drive). Screens beyond capture (Maintenance, Budget, Inventory, Dashboard, AI) remain on mock data and need real data wiring as the next major phase.
