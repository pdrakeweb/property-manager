# End-to-End Test Findings — Round 2

**Branch under test:** `master` @ `1967a2f1873b26f2c1023f241423d04634a3f3dd`
**Date:** 2026-05-02 (continuation of session)
**Environment:** Vite dev server on `http://localhost:5198`, dev_token auth bypass.
**Driver:** Playwright via Claude Code preview tool (Chromium).

Focused round, exercising what changed since `26e013e` (the three fix branches: `fix/sync-reliability`, `fix/mock-residue-ux`, `fix/critical-and-ux`) plus the eight items the test brief called out.

---

## Bugs

### 1. CRITICAL — Map screen crashes the route when any property has coordinates
- **Severity:** critical (blank white page; the feature is non-functional in any realistic scenario)
- **Files:** `src/screens/MapScreen.tsx`, `src/components/map/BaseMap.tsx`, `package.json` (`react-leaflet ^5.0.0`)
- **Reproduction:** add `latitude`/`longitude` to any property in `pm_properties_v1`, navigate to `#/map`, hard-reload. The whole `<main>` subtree disappears (`bodyHTML` length drops to 103 chars, `document.querySelector('main')` returns `null`). With no error boundary above the route, the whole app appears blank.
- **Cause:** `react-leaflet@5` peer-depends on React 19, but the app pins `react@^18.3.1`. The `--legacy-peer-deps` flag bypasses the npm refusal at install time, but at render time React 18 chokes inside `MapContainerComponent` with:
  - `Warning: Rendering <Context> directly is not supported and will be removed in a future major release.`
  - `Warning: A context consumer was rendered with multiple children, or a child that isn't a function.`
  - `The above error occurred in the <Context.Consumer> component … Consider adding an error boundary to your tree.`
- **Why round 1 missed it:** my round-1 test only saw the empty-state branch (`geoProperties.length > 0` was false because no property had coords persisted). `BaseMap` never rendered, so the React 18 / react-leaflet@5 incompatibility never fired. Adding the route in `fix/critical-and-ux` was correct, but I didn't verify the populated-data path.
- **Fix direction (pick one):**
  - Downgrade to `react-leaflet@^4` (compatible with React 18). One-line `package.json` change plus possible minor API tweaks in `BaseMap.tsx`.
  - Upgrade React to 19 (a much larger change with cross-cutting impact on every component).
  - Wrap the `/map` route in an error boundary so a crash there doesn't blank the whole shell. Recommended regardless — there's currently no top-level error boundary in `App.tsx`, which is why a single broken screen drops the entire UI.

### 2. CRITICAL — `useMemo([])` in `MapScreen` will silently freeze stale data even after the leaflet incompatibility is fixed
- **Severity:** medium (latent; not reachable until #1 is resolved, but it is in the same file and will surface immediately afterward)
- **File:** `src/screens/MapScreen.tsx:45-48`
  ```ts
  const geoProperties = useMemo(
    () => properties.filter((p): p is GeolocatedProperty => p.latitude != null && p.longitude != null),
    [],
  )
  ```
  The `[]` dep array means `geoProperties` is captured once on mount. Adding/editing a property's coordinates while the user is on `/map` will not refresh the marker set. Fix is `[properties]` (or, given that `properties` itself is memoised by the store, `[properties]`).

### 3. Medium — Dev-token bypass leaves `pm_auth_refresh_failed_at` flag set after sign-in
- **Severity:** low (cosmetic — banner shows on next sign-out cycle even though the prior failure is resolved)
- **Files:** `src/App.tsx` (`devBypass()`), `src/auth/oauth.ts` (`_persistTokens`)
- **Detail:** Real OAuth clears `pm_auth_refresh_failed_at` inside `_persistTokens` (line 146). The dev bypass writes the access-token / expires-at / email keys directly without going through `_persistTokens`, so the failed-refresh flag from a prior session sticks around. Trigger: `localStorage.setItem('pm_auth_refresh_failed_at', new Date().toISOString())`, sign out, sign back in via "Skip auth (dev mode)" — flag is still there, banner will show again on the next sign-out.
- **Fix direction:** call `clearAuthRefreshFailed()` (or `localStorage.removeItem(AUTH_REFRESH_FAILED_KEY)`) inside the `devBypass()` body in `App.tsx`, or route the dev path through `_persistTokens` with synthetic token values.

### 4. Low — No top-level error boundary in `App.tsx`
- **Severity:** medium architectural concern (compounds #1; could compound future runtime errors in any lazy route)
- **File:** `src/App.tsx`
- **Detail:** When MapScreen crashed, the entire `<main>` rendered nothing — sidebar/header survived because they're outside the route element, but the user effectively lost the app until reloading and avoiding `/map`. A `<ErrorBoundary>` wrapping `<Routes>` (or each `<Route element>` for finer scope) would let the rest of the shell stay usable while showing a "Something broke on this screen" message.

---

## Verified working (round 2)

### Item 1 — Map screen empty state + property switcher
Empty state ("No properties with coordinates / Add latitude and longitude to your properties") renders cleanly when no property has coords. Property switcher (in AppShell, not on the Map screen itself) opens the dropdown showing all 3 properties and switches active correctly. The screen's own *populated* state is broken (Bug #1).

### Item 2 — Dev-mode Drive bypass is fixed
Saving an equipment record (`/capture/well`, then "Save to Drive") now produces "Saved to Drive — Saved locally and uploaded to Well System folder", record `syncState: 'synced'`, **zero failed network calls**. Compare round 1 where the same flow produced a `googleapis.com 401`. The `fix/sync-reliability` change (routing dev token through `localDriveAdapter` end-to-end) holds. Triggering a full sync from `/sync` reports `↑ 3 uploaded · ↓ 0 pulled` and "All records are synced to Drive."

### Item 3 — OAuth refresh banner triggers correctly
Setting `pm_auth_refresh_failed_at` then signing out drops the user on `SignInScreen` showing the amber "Session expired / Please reconnect Google Drive to keep syncing your records" banner. The banner is correctly suppressed when the flag is absent. (See Bug #3 for the dev-bypass cleanup gap.)

### Item 4 — Empty-store grace is good
Switched the active property to one with zero tasks / zero equipment / zero capital items (`e2e_test_cabin`). Cycled `/`, `/budget`, `/maintenance`, `/calendar`. All four render meaningful empty-state copy and never expose `TypeError` / `undefined` text:
- Dashboard: cross-property panels still show, active-property panels are empty
- Budget: "$0k–$0k Est. Total · $0/mo Monthly Reserve · 0 Items Planned · $0 Avg Annual Spend"
- Maintenance: "0 tasks due · $0 estimated cost · All caught up!"
- Calendar: empty grid, "0 Tasks due · 0 overdue · 0 Completed"

Note: aggressive re-seeding from `MAINTENANCE_TASKS`/`CAPITAL_ITEMS` mocks means clearing the localStorage keys alone doesn't produce an empty state — `seedTasksForProperty` re-fires unless the active property is one the mock doesn't seed. Not a bug per se, but worth knowing for future tests.

### Item 5 — Photo upload + `syncPendingPhotos`
Mark Done modal on a Due Now task: filled cost / contractor / notes, attached a 1×1 PNG via `DataTransfer`, submitted. Result: a `completed_event` record in localStorage with `data.photos[0].localDataUrl` starting with `data:image/`, photo count = 1. Subsequent full sync from `/sync` reports `↑ 3 uploaded · ↓ 0 pulled` and zero network failures — `syncPendingPhotos` runs without throwing.

### Item 6 — Property CRUD across reload
Add → reload → edit → delete-with-confirm-modal cycle all worked. `pm_properties_v1` reflected each step correctly. (Minor session-internal note: the edit modal's submit button is labelled "Save" not "Save changes" — a tripping point for my earlier selectors but not a user-visible defect.)

### Item 7 — EquipmentDetailScreen + HA link/unlink
- Detail screen renders all fields (HVAC equipment seeded from round 1)
- "Link to HA Entity" modal opens with the search input + type-filter chips + "No entities match" empty state
- After linking (simulated by direct `data.haEntityId` write to mimic a successful selection from the modal), the detail screen shows: entity ID, "Refresh state" + "Unlink" buttons, and "State unavailable — check HA connection in Settings" copy (graceful since HA isn't configured)
- "Unlink" clears `haEntityId` and reverts the panel to the "Link to HA Entity" prompt

### Item 8 — No duplicate React keys, no general console errors
Cycled all 20 sidebar nav links. Captured every `console.error` call into an in-page array (the preview tool's log buffer was contaminated by stale Map-crash output, so I patched `console.error` directly to count *new* warnings during this cycle). Result: **0 new errors**, **0 duplicate-key warnings**, **0 "Each child in a list" warnings**. The pre-existing `ce1` dupe that the `fix/mock-residue-ux` work claimed to fix is genuinely gone.

### General sweep
- All 20 reachable routes render `>= 79` chars of meaningful body text — no blank pages other than the Map crash documented in Bug #1.
- Zero unhandled promise rejections during the route cycle.
- Forms that submit silently with no feedback: not observed in this round (I had this as a concern carried over from round 1's Add-Property "Add" with empty fields, but in round 2 every form submit I exercised either succeeded with a localStorage update or kept the modal open — nothing slipped through silently).

---

## Console / network signal

- **Errors:** the only ones in the buffer are the cluster from Bug #1 (Map / react-leaflet). Outside the `/map` route, the console is clean.
- **Warnings:** unchanged from round 1 — React Router v7 future-flag warnings only.
- **Failed network requests:** 0 during this round (compared to 1 × `googleapis.com` 401 in round 1).

## Out-of-scope notes

- Round 1 created `e2e_test_cabin` and never cleaned it up; it survived the merge sequence and is still in `pm_properties_v1`. Cosmetic only — happy to clean if you want, but I left it alone since deletion is a stateful action you didn't authorise for this round.
- The Well System equipment capture form generates a title `"Well System"` rather than `"<brand> <model>"` like HVAC does; doesn't break anything but is inconsistent. Out of scope.
- The previous round's note about `fix/drive-restore-syncstate` (an existing branch from a parallel session that softens the strict-zod pull validation to keep records `synced` instead of `conflict`) — still unmerged, still relevant: my E2E HA-link test produced a `Sync: conflict` on the equipment record because writing `haEntityId` post-sync diverged from the remote shape. That's the same pull-validation policy issue you'd discussed earlier; nothing new but worth flagging that the user-facing artifact (records flipping to `conflict` on minor edits) is still active.
