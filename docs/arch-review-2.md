# Architectural Review — Pass 2

**Date:** 2026-05-02
**Branch reviewed:** `upstream/master` @ `1967a2f` (Merge branch 'fix/critical-and-ux')
**Scope:** Deeper dive on the 8 areas requested after pass 1, plus everything pass 1 didn't fully analyse.
**Reviewer:** Claude (architectural review, second pass)
**Companion:** `docs/arch-review.md` (first pass) — this doc does not re-litigate items already addressed in the post-review fix branches (`fix/sync-reliability`, `fix/mock-residue-ux`, `fix/critical-and-ux`).

---

## Executive summary

The data layer holds up well under deeper inspection: the registry, vault index, push and pull paths are symmetric and complete. The remaining risk is concentrated at the React/UI layer — modals without a11y plumbing, two `<button>`s without confirmations or click handlers, and a structural perf issue around forced re-renders via a `tick` counter on the dashboard and maintenance screens.

Tally for this pass: **2 critical, 7 high, 24 medium, 9 low**. The only verified *critical* defects are a one-click delete in `MortgageScreen` and the long-known but still-present dead "Configure" button under HA Entity Mapping. The headline architectural finding is positive: **vault and `localIndex` are not duplicated** — the façade in `src/lib/localIndex.ts` is the only path to the single localStorage key `pm_index_v1` (verified §1.5).

---

## 1. Vault / records layer completeness

### 1.1 All 21 registered records have schemas, folder names, and definitions — OK
- `src/records/registry.ts:37-59` registers 21 record types. Every one has a Zod schema and a `folderName` (verified by reading each `src/records/*.ts`):

  | Type | folderName | Special |
  | --- | --- | --- |
  | `equipment` | "Equipment" | `valuePath: 'values'`, polymorphic via `equipmentProfiles.ts` |
  | `vendor` | "Vendors" | |
  | `well_test` | "Well Tests" | |
  | `task` | "Maintenance Tasks" | |
  | `completed_event` | "Service History" | |
  | `capital_item` | "Capital" | |
  | `capital_transaction` | "Capital" | |
  | `capital_override` | "Capital" | |
  | `fuel_delivery` | "Fuel Deliveries" | |
  | `septic_event` | "Septic System" | shares folder with equipment subsystem |
  | `tax_assessment` | "Tax Records" | |
  | `tax_payment` | "Tax Records" | |
  | `mortgage` | "Mortgage" | |
  | `mortgage_payment` | "Mortgage" | |
  | `utility_account` | "Utilities" | |
  | `utility_bill` | "Utilities" | |
  | `insurance` | "Insurance" | |
  | `permit` | "Permits" | |
  | `road` | "Road Maintenance" | |
  | `generator_log` | "Generator" | shares folder with equipment subsystem |
  | `property` | "Property" | self-referential propertyId |

- The 9 record types in the question are all present. The full registry is broader (21 not 9).

### 1.2 `IndexRecordType` still has dead aliases — LOW
- `src/lib/localIndex.ts:24` `'tax'` and `:29` `'utility'` are bare aliases that exist in the union but have no entry in `RECORDS`. Verified unused: `grep -rn "type: 'tax'\|type: 'utility'\|getAll('tax'\|getAll('utility'"` returns no production hits. (First-pass finding still standing — fix is a one-line union edit.)

### 1.3 Push completeness — OK
- `src/vault/core/syncEngine.ts:76-120` (`pushPending`) iterates `getPending()` and is type-agnostic. The only filter is "skip if no `rootFolderId`" (line 91). Every registered type with a queued record will be pushed.

### 1.4 Pull completeness — OK
- `src/vault/core/syncEngine.ts:212-222` (`allFolderNames`) walks every registered `folderName` plus `legacyFolderNames` (the equipment-category map from `CATEGORY_FOLDER_NAMES`). All 21 type folders + 16 equipment folders are scanned per property (`pullFromDrive` in `src/vault/core/syncEngine.ts:224-299`).
- Two intentional folder collisions: `septic_event`'s "Septic System" overlaps with the equipment-category `septic`; `generator_log`'s "Generator" overlaps with the equipment-category `generator`. Both are intentional — the per-record `type` discriminator inside the file means there's no ambiguity at read time.

### 1.5 `localIndex` vs vault — single source of truth — OK
- `src/lib/localIndex.ts` is a façade; every accessor delegates to `getVault().localIndex` (lines 54-120). The vault's `createLocalIndex` (`src/vault/core/localIndex.ts:65`) writes to a single key `'pm_index_v1'` (default).
- Grep confirms no other writer to that key. `localStorage.setItem('pm_index*'` returns zero non-vault hits.
- The first review already noted that `lib/localIndex.upsert` *also* fires `syncBus.emit` directly (`src/lib/localIndex.ts:75`) on top of the vault's own subscription; this is documented as intentional double-fire (lines 70-74) and is harmless because syncBus subscribers are idempotent. Worth being aware of when adding new subscribers.

### 1.6 Property records have no central manifest folder — MEDIUM (architectural quirk)
- Each property's record uploads to `<that property's driveRootFolderId>/Property/property_<id>.json`. There is no central "Properties" folder anywhere. Cross-device discovery relies on `syncPropertyConfig` (the `pm_properties.json` manifest at root, `src/lib/syncEngine.ts:151-178`), which the first review covered.
- **Implication:** A property record uploaded to Tannerville's folder is invisible to anyone scanning Camp's folder. A new device that can read Camp's folder but not Tannerville's will never see Tannerville's property record — only the manifest can list it. The dual-path is documented (lines 137-147) but worth noting as a permanent constraint.

---

## 2. `localIndex` vs vault integration

Covered in §1.5 above. **Verdict:** they are not duplicated; the façade is a thin pass-through to a single source of truth.

One side-note worth calling out: when the OAuth token swaps (sign in / sign out / dev-bypass toggle), `vaultSingleton.resetVault()` rebuilds the vault, which means the in-memory subscriber list is rebuilt. Components subscribing through `localIndex.subscribe(...)` (or via the `syncBus`) survive because they re-subscribe on next mount. This is fine for the current flow but coupled to the *order* in which `getVault()` is first called after a token change — `src/lib/vaultSingleton.ts:69-87`.

---

## 3. Drive sync completeness

Covered in §1.3 and §1.4 above. **Verdict:** push and pull are symmetric; every record type that can be pushed will be discovered on pull from any folder it could land in.

Additional observation:
- `pollDriveChanges` in `src/lib/syncEngine.ts` (delta polling against `/changes`) operates on Drive file IDs already known to the local index (`getAllForProperty(propertyId).map(r => r.driveFileId)`). **A record created on another device that this device has never pulled before will not appear via delta polling** — only the next full `pullFromDrive` will catch it. Not a bug, but a real reason to keep the 5-minute full sync.

---

## 4. Property isolation

### 4.1 Every `localIndex.getAll(type, propertyId)` callsite passes a real propertyId — OK
- Verified callsites:
  - `src/components/SystemLabelCombobox.tsx:35` ✓ (prop)
  - `src/lib/calendarClient.ts:161` ✓
  - `src/services/PropertyRecordsAPI.ts:151,214` ✓ (`this.propertyId`)
  - `src/lib/maintenanceStore.ts:31` ✓
  - `src/lib/vault/markdownExport.ts:71` ✓ (per-property loop)
  - `src/vault/core/syncEngine.ts:232` ✓
  - `src/lib/syncEngine.ts:383` ✓
  - `src/screens/DashboardScreen.tsx:248,286,331,345,358,378` ✓
  - `src/screens/InventoryScreen.tsx:24` ✓
  - `src/vault/react/hooks.ts:48,58` ✓
- No site found that passes `''` or omits the property scope.

### 4.2 Cross-store `.getAll().filter(e => e.propertyId === ...)` pattern is pervasive but consistent — MEDIUM (smell)
- `costStore`, `narrativeStore`, `expiryStore`, `checklistStore`, `equipmentStore`, `capitalItemStore` all expose helpers like `getXForProperty(propertyId)` that internally do `store.getAll().filter(...)`. Every direct caller passes the active property. Verified at:
  - `src/screens/MaintenanceScreen.tsx:768`, `src/screens/BudgetScreen.tsx:719`, `src/screens/CalendarScreen.tsx:484`, `src/lib/syncEngine.ts:275`, `src/screens/DashboardScreen.tsx:252`.
- **Smell:** `costStore.getAll()` (and similar bare `getAll()` calls) returns *every* property's records and relies on every caller to filter. A future caller forgetting the filter is a latent isolation bug. A typed `getForProperty` wrapper that hides `getAll()` would make this safer.

### 4.3 Vendor multi-property model is intentional — OK
- `src/lib/vendorStore.ts` uses a custom `getPropertyId` resolver `(v) => v.propertyIds[0] ?? 'tannerville'`. Vendors carry `propertyIds: string[]`; UI in `src/screens/VendorScreen.tsx:193` and `src/components/VendorSelector.tsx:30` works against the global list and lets the user assign multi-property membership.
- The hard-coded `?? 'tannerville'` fallback is a leak from the seed data; if Tannerville is ever deleted (now possible after the property-store refactor), a vendor with empty `propertyIds` would route through a non-existent property's drive root and fail. Low likelihood, but should fall back to the first-seen property id instead.

### 4.4 `App.tsx` startup loop iterates correctly — OK
- `src/App.tsx:298,315,409` use `for (const p of propertyStore.getAll())` and call per-property methods (`seedTasksForProperty(p.id)`, `syncAll(token, p.id)`, `exportAllMarkdownToDrive(token, p.id)`).

### 4.5 Aggregate counts — OK
- DashboardScreen filters per-property correctly (`src/screens/DashboardScreen.tsx:244,261,272`).

**Verdict:** No isolation breaches. The architecture leans heavily on convention rather than enforcement; consider hiding `getAll()` in stores that only make sense per-property.

---

## 5. Settings screen dead UI (and other dead controls)

### 5.1 HA "Entity Mapping" Configure button — STILL DEAD — CRITICAL UX
- `src/screens/SettingsScreen.tsx:683-687` — confirmed unchanged from the pre-merge review:
  ```tsx
  <Row label="Entity Mapping" sub="Map HA entities to property systems">
    <button className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
      Configure <ChevronRight className="w-3 h-3" />
    </button>
  </Row>
  ```
- No `onClick` handler. Looks live but does nothing.

### 5.2 AIAdvisoryScreen — Save and 👍 buttons are dead — HIGH UX
- `src/screens/AIAdvisoryScreen.tsx:169-175` — both buttons have no `onClick`:
  ```tsx
  <button className="flex items-center gap-1 text-xs ...">
    <Save className="w-3 h-3" /> Save
  </button>
  <button className="flex items-center gap-1 text-xs ...">
    <ThumbsUp className="w-3 h-3" />
  </button>
  ```
- They appear in the same hover-revealed group as the working Copy button (lines 162-168). Either implement them or remove them.

### 5.3 No other widespread dead UI
- Spot-checked DashboardScreen, SyncScreen, ChecklistScreen, MaintenanceScreen, InventoryScreen, BudgetScreen, PermitsScreen, PropertyProfileScreen, VendorScreen, CalendarScreen, EmergencyScreen, UtilityScreen — every interactive control reaches a real handler.
- `src/screens/SettingsScreen.tsx:920` returns `null` as a defensive fallback after the `view` discriminated-union exhaustion. Safe but undocumented; a one-line comment explaining why would help.
- "Knowledge Cache Refresh" mentioned in the question doesn't appear in master — the knowledgebase sync controls under each property in the SettingsScreen properties modal are all functional (`src/screens/SettingsScreen.tsx:215-243` and the sync screen at `src/screens/SyncScreen.tsx:89-116`).

### 5.4 Modals never opened — none found
- Every modal trigger I traced reaches a render path. No orphan modals.

---

## 6. React patterns & performance

### 6.1 `tick` counter forces full-screen re-renders — HIGH (perf)
- `src/screens/DashboardScreen.tsx:218` declares `const [tick, setTick] = useState(0)`.
- Three `useMemo` blocks include `tick` in their deps with `// eslint-disable-next-line react-hooks/exhaustive-deps`:
  - `:278-282` `allCapitalItems` — depends on `[properties, tick]`. **Notably missing `activePropertyId`** even though the displayed list also depends on the active property in some code paths.
  - `:285-294` `linkedEquipment` — `[activePropertyId, tick]`.
  - `:330-375` `recentActivity` — `[activePropertyId, tick]`.
- Every mutation that triggers `setTick(t => t + 1)` invalidates all three memos and forces a full re-render of the dashboard tree. Same pattern repeats in `src/screens/MaintenanceScreen.tsx:723` (uses `key={tick}` on the root container — even more aggressive: it tears down and remounts the entire screen).
- **Recommended approach:** subscribe these views to `syncBus` `index-updated` events (filtered to the relevant types) and let React's normal reconciliation do the work. The `useProperties` hook in `src/lib/propertyStore.ts:114-131` already follows this pattern and is the model.

### 6.2 `setTimeout` without cleanup in handler closures — MEDIUM
- `src/screens/AIAdvisoryScreen.tsx:121` (`setTimeout(() => setCopied(false), 1500)`) — fires after unmount → React state-on-unmounted warning in dev.
- Same pattern at `src/screens/EmergencyScreen.tsx:183`, `src/screens/PropertyProfileScreen.tsx:45`, `src/screens/EquipmentFormScreen.tsx:212` (`setTimeout(() => navigate('/capture'), 2000)` — navigate after unmount is a no-op but still ugly).
- Wrap in a `useRef`-tracked timer cleared in `useEffect` cleanup, or set `if (!mountedRef.current) return` inside the callback.

### 6.3 Stale closures in long-lived intervals — MEDIUM (already known)
- `src/App.tsx:291-388` (`useStartupSync`) and `:395-426` (`useScheduledMarkdownExport`) both close over `propertyStore.getAll()` and `getValidToken`. Because both reads happen at call time and not via captured props/state, this is safe in practice — but the `eslint-disable` comments at `:386` and `:424` mask any future regression where someone adds a *real* dependency.

### 6.4 Inline functions/objects defeat memoization — MEDIUM
- `src/screens/DashboardScreen.tsx:226` — `handlePropertySelect` is redefined every render and passed to `<PropertyHealthCard onSelect={handlePropertySelect} />` (line 443). If `PropertyHealthCard` is wrapped in `React.memo`, the new function reference invalidates it on every parent render.
- Similar patterns at `:410,423,512,550,622,637,758,812`. Wrap with `useCallback` if perf telemetry shows it's hot.

### 6.5 Index-keyed map of markdown fragments — MEDIUM
- `src/screens/AIAdvisoryScreen.tsx:126-138` uses `parts.map((part, j) => ... key={j})` while rendering a streaming markdown response that is appended to over time. Index keys here mean React may reuse the wrong DOM node on stream updates (e.g. when bold/code-fence boundaries shift), occasionally losing in-DOM selection or animations. Use a stable key (e.g. character offset, or `${i}-${part.kind}-${part.start}`).

### 6.6 Modal Escape-key listeners with closure-stale `onClose` — MEDIUM
- `src/screens/MaintenanceScreen.tsx:124-128`, `src/screens/CalendarScreen.tsx:65-68`, `src/screens/InsuranceScreen.tsx:97-101`, `src/screens/PermitsScreen.tsx:107-111` — each modal sets up `document.addEventListener('keydown', onKey)` inside an effect and lists `[onClose]` as the dep. Correct on paper, but if the parent re-renders frequently (e.g. via §6.1's `tick`) the listener is repeatedly removed/re-added, which is wasteful and racy. Memoize `onClose` upstream (`useCallback`) before passing.

### 6.7 BudgetScreen, ConflictResolutionScreen, ExpiryManageScreen modals lack Escape handlers — LOW
- Several modals don't bind Escape to close. Inconsistent with the other modal patterns in §6.6.

### 6.8 No infinite-loop or setState-during-render hazards found
- I grepped for `setX(` calls in render bodies — all sites are inside event handlers or effects.

---

## 7. Accessibility

### 7.1 Modals have no role/dialog/labelledby/focus-trap — HIGH
- Every modal in the app is a `<div>` over a backdrop, with no `role="dialog"`, `aria-modal="true"`, or `aria-labelledby` pointing at the title. Examples:
  - `src/screens/SettingsScreen.tsx` (property add/edit, delete confirm)
  - `src/screens/MaintenanceScreen.tsx:179` (DoneModal), `:395` (AddTaskModal), `:540` (Schedule), `:642` (Quick Add)
  - `src/screens/DashboardScreen.tsx:143` (QuickAdd)
  - `src/screens/InsuranceScreen.tsx:166` (PolicyForm)
  - `src/screens/PermitsScreen.tsx:172` (PermitForm)
  - `src/screens/BudgetScreen.tsx:442` (transaction modal)
  - `src/components/layout/AppShell.tsx:258-336` (FailedItemsModal)
- No focus trap library is in use. Tab can escape the modal to the page behind. Focus is not returned to the trigger when the modal closes.
- Most do close on Escape (good); some do not (§6.7).

### 7.2 Icon-only buttons missing `aria-label` — HIGH
- The destructive trash button in the property list — `src/screens/SettingsScreen.tsx:720-722` — has only a Trash2 icon, no label.
- VendorSelector clear button — `src/components/VendorSelector.tsx:65-71` — X icon only.
- Most modal close X buttons across the app: `src/screens/MaintenanceScreen.tsx:183,252,299,354`, `src/screens/DashboardScreen.tsx:147`, `src/screens/InsuranceScreen.tsx`, `src/screens/PermitsScreen.tsx`. (FailedItemsModal at `AppShell.tsx:286` correctly has `aria-label="Close"` — good template.)
- Ten or more total. Pattern: every `<button onClick={...}><Icon /></button>` needs an `aria-label`.

### 7.3 Form inputs without label association — MEDIUM
- `src/screens/MaintenanceScreen.tsx:188-193` (DoneModal): `<label>` text exists but no `htmlFor` and inputs have no `id`. Repeats throughout the modal forms.
- `src/screens/SettingsScreen.tsx:759-825` (property add/edit fields): same — coordinate inputs, acreage, year built use `<span>` labels with no input id.
- `src/screens/InsuranceScreen.tsx`, `src/screens/PermitsScreen.tsx` modals: same pattern.

### 7.4 Custom dropdowns lack arrow-key navigation — MEDIUM
- `PropertySwitcher` (`src/components/layout/AppShell.tsx:142-198`) and `MobilePropertySwitcher` (`:200-256`) — Tab works, but ↑/↓/Enter doesn't cycle/select. No Escape to close.
- `VendorSelector` (`src/components/VendorSelector.tsx:52-110`), `SystemLabelCombobox` (`src/components/SystemLabelCombobox.tsx:57-99`), and `ModelPicker` (`src/screens/AIAdvisoryScreen.tsx:61-112`) all use mousedown-based click-outside, no keyboard nav.

### 7.5 Touch targets below 44×44px — MEDIUM
- `src/screens/SettingsScreen.tsx:720-722` — bare trash button with `w-3.5 h-3.5` icon and no padding.
- `src/components/VendorSelector.tsx:65` — `p-0.5` X button (~12px hit area).
- `src/screens/ChecklistRunScreen.tsx:133-139` — undo button `px-1.5 py-1` (~19px).
- `src/screens/AIAdvisoryScreen.tsx:162-177` — copy/save/thumbs-up buttons `px-1.5 py-1` with `w-3 h-3` icons.
- All fail Apple/MDN's 44px guidance and Android Material's 48dp guidance.

### 7.6 Color-contrast borderlines — MEDIUM
- `text-slate-400 dark:text-slate-500` on dark slate-800 backgrounds: ~3.5:1, fails WCAG AA for normal text.
- Sites: `src/screens/ActivityScreen.tsx:8,140,156`, `src/components/layout/AppShell.tsx:160,181`, AI advisory hover-button labels.
- `text-green-400` on dark-mode card backgrounds is borderline as well.

### 7.7 No `aria-live` on the sync indicator — MEDIUM
- `src/components/BackgroundSyncIndicator.tsx:25-34` shows a spinner with `title="Syncing with Drive…"` only — no `aria-live="polite"`. Screen reader users get no announcement when sync starts or finishes.

### 7.8 No skip-to-content link and no global heading-order guarantees — LOW
- AppShell renders the sidebar before `<main>` with no skip link. Most screens have one h1 per view; ChecklistRunScreen and ConflictResolutionScreen jump from h2 to h4 in places. Spot check, not exhaustive.

---

## 8. Loading and error states

### 8.1 `RouteFallback` for lazy chunks is just a spinner — HIGH
- `src/App.tsx:478-483` — every lazy-loaded route falls back to a centred `Loader2` icon. No skeleton, no context, and no prefetching hint. With 23 lazy routes the hop-around UX is choppy on cold starts.

### 8.2 `MortgageScreen` "Delete" with no confirmation — CRITICAL
- `src/screens/MortgageScreen.tsx:532-537`:
  ```tsx
  <button
    onClick={() => { mortgageStore.remove(mortgage.id); onDeleted() }}
    className="text-xs text-red-400 hover:text-red-600"
  >
    Delete
  </button>
  ```
- Single click → mortgage record gone, no undo, no confirm. Other delete sites (RoadScreen, BudgetScreen capital items, SettingsScreen properties) use confirmation modals; this one slipped.

### 8.3 Other delete handlers — VERIFY
- `src/screens/PermitsScreen.tsx:416` invokes an `onDelete()` prop — needs trace to confirm it goes through a confirm modal.
- `src/screens/ExpiryManageScreen.tsx:254` `handleDelete()` — same.
- Spot-check before signing off; assume Medium severity until verified.

### 8.4 Silent failure on weather/climate fetch — MEDIUM
- `src/screens/MapScreen.tsx:56-62` chains `.catch(() => {})`. On network failure the climate panel renders empty with no banner.

### 8.5 HA fetch failure renders as "unknown" with no signal — MEDIUM (carry-over)
- Already in pass 1 §5.11; still present at `src/screens/DashboardScreen.tsx:296-319`. Worth re-flagging because it's the most user-visible silent failure.

### 8.6 No global toast/notification system — HIGH (UX consistency)
- Grep for "toast" / "snackbar" returns nothing. Each screen rolls its own:
  - AIAdvisoryScreen → inline error banner.
  - EquipmentFormScreen → full-screen success/offline view (good but heavyweight).
  - SettingsScreen → status text inside a card.
  - SyncScreen → result string under the button.
  - "Copied!" feedback (`AIAdvisoryScreen.tsx:118-122`) is a 1.5 s text swap inside the button — easy to miss.
- Inconsistent and means transient feedback (saved, undone, network reconnected) has no canonical surface.

### 8.7 Form save state inconsistency — MEDIUM
- `EquipmentFormScreen` uses an explicit `idle / saving / saved / offline` state machine (`src/screens/EquipmentFormScreen.tsx:70-91`). Verified: when Drive fails, the screen flips to the *Offline* view (line 217 `setSaveState('offline')`), so the user is told. Good.
- `SettingsScreen.saveProp` (`src/screens/SettingsScreen.tsx:293-315`) and `MaintenanceScreen.DoneModal.handleConfirm` (`:144-220`) close their modal immediately on save with no `saving` indicator and no error path. If `propertyStore.upsert` or `costStore.add` throws (it can — schema validation in `syncedStore.ts:75-84`), the modal closes as if successful and the audit log is the only signal.

### 8.8 KB sync progress is wrong for multi-property — MEDIUM
- `src/screens/SyncScreen.tsx:89-116` reports per-property progress (`done/total`) but no overall progress across the multi-property loop. The label tries to fix this with `${p.shortName}: ${done}/${total} (${i + 1}/${targets.length})` (line 100) but the visible progress bar (if any) is per-property, so it resets each iteration. Confusing for users with 2+ properties.

### 8.9 Optimistic updates do not roll back on failure — MEDIUM
- The optimistic-write-then-sync pattern in `EquipmentFormScreen` is *fine* because the `offline` screen surfaces failure (§8.7).
- The optimistic write in `MaintenanceScreen.DoneModal.handleConfirm` and `costStore.add` does not have any UI to surface a failure — relies on next sync. Minor in practice (the record stays as `pending_upload` and will be retried) but the user thinks it's done.

### 8.10 Empty-state quality — OK
- VendorScreen, PermitsScreen, MortgageScreen, MapScreen all have friendly empty states with primary-action CTAs. CaptureSelectScreen's all-categories-documented case (`src/screens/CaptureSelectScreen.tsx:26-56`) renders empty groups silently — minor LOW.

---

## Severity summary (this pass)

| Bucket | Count |
| --- | --- |
| Critical | 2 — §5.1 dead "Configure" button under HA Entity Mapping; §8.2 one-click `MortgageScreen` delete |
| High | 7 — §5.2 (dead Save/👍 in AIAdvisory), §6.1 (`tick`-counter forced re-renders), §7.1 (modal a11y), §7.2 (icon-only buttons no label), §8.1 (Suspense fallback too thin), §8.6 (no global toast), §1.6 (per-property property folder location is permanent quirk) |
| Medium | 24 — assorted, see body |
| Low | 9 — tax/utility dead union members, color contrast, skip links, etc. |

## Recommended top 5 (this pass)

1. **Wire up or remove the dead controls.** §5.1 (HA Entity Mapping `Configure`) and §5.2 (AIAdvisory `Save` / 👍). One sweep file.
2. **Add a confirmation dialog to `MortgageScreen` delete (§8.2).** Reuse the property-delete confirmation pattern from `SettingsScreen` (`requestDelete` + `confirmDelete` state).
3. **Replace the dashboard `tick` counter with `syncBus` subscription (§6.1).** Use `useProperties` (`src/lib/propertyStore.ts:114-131`) as the template; do the same for `MaintenanceScreen` to remove the `key={tick}` remount.
4. **Add `role="dialog"` / `aria-modal="true"` / `aria-labelledby` to every modal and an `aria-label` to every icon-only button (§7.1, §7.2).** Mostly mechanical; a single shared `<Modal>` component would also let you trap focus and return it on close.
5. **Add a global toast surface (§8.6) and route Drive-sync errors / "Copied!" / save success through it.** Removes the per-screen ad-hoc status text and gives screen reader users a live region to follow (`role="status"`, `aria-live="polite"`).

---

*All cited line numbers refer to `upstream/master` @ `1967a2f`. Pass 1 (`docs/arch-review.md`) covers prior findings and is not duplicated here.*
