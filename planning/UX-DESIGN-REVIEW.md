# UX Design Review — Property Manager PWA

**Reviewed:** April 12, 2026  
**Scope:** Field capture flow, form design, confidence badges, error/empty states, navigation, microcopy  
**Context:** Solo-user PWA. Primary use case: standing in front of a piece of equipment — crawlspace,
utility room, exterior pad — one-handed, often dim light, sometimes gloves.

Source references are to `src/screens/` files.

---

## Overall

The visual design is clean and the component structure is solid. The primary gap is that the UI doesn't
yet account for the physical reality of field use: touch targets are too small, hover-only affordances
break on mobile, the Save button is buried below a 13-field form, and input font sizes trigger iOS
auto-zoom on every tap. Fix the physical constraints first — everything else is refinement.

---

## 1. Capture Flow

The flow is correctly sequenced: photo → extraction → form review → save. Problems are in execution.

### 1.1 Camera vs. Upload Button Hierarchy

`EquipmentFormScreen.tsx:181–194` — Camera and Upload share a `grid grid-cols-2 gap-2`, equal weight.
Camera is the primary action in 90%+ of field sessions. Upload is "I already have the photo." They
should not be equal.

**Fix:**
```tsx
// Primary — full width, tall target
<button
  onClick={simulateExtraction}
  disabled={aiState === 'extracting'}
  className="w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700
             disabled:bg-sky-400 text-white text-sm font-semibold rounded-xl px-4 py-4
             transition-colors"
>
  <Camera className="w-4 h-4" /> Take Photo
</button>
// Secondary — text style, below
<button className="w-full text-sm text-slate-500 py-2 text-center hover:text-slate-700">
  or choose existing image
</button>
```

### 1.2 Photo Thumbnail X Button Broken on Touch

`EquipmentFormScreen.tsx:225–230`:
```tsx
className="... hidden group-hover:flex"
```
`hover` doesn't exist on touch devices. There is no way to remove a photo on mobile. This is a
complete regression for the primary use case.

**Fix — always visible, adequate touch target:**
```tsx
<button
  onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
  className="absolute -top-1.5 -right-1.5 w-7 h-7 bg-slate-700 text-white
             rounded-full flex items-center justify-center shadow z-10"
  aria-label="Remove photo"
>
  <X className="w-3.5 h-3.5" />
</button>
```
Current `w-4 h-4` (16px) is also too small. The `w-7 h-7` above is 28px visual; if you want the
full 44px tap area, add a transparent padding ring via `::before` or a larger invisible wrapper.

### 1.3 Save Button Not Sticky

`EquipmentFormScreen.tsx:317–336` — Save/Cancel are in normal document flow at the bottom of a long
form. With 13 generator fields, the user must scroll all the way down before saving. One-handed in a
crawlspace this is a real problem — scroll past it, scroll back, try again.

**Fix — fixed bottom bar:**
```tsx
// Separate the action buttons from the scroll container entirely:
<div className="fixed bottom-0 left-0 right-0 z-10
                bg-white/95 backdrop-blur-sm border-t border-slate-200
                px-4 py-3 flex gap-3
                pb-[calc(0.75rem+env(safe-area-inset-bottom))]
                lg:static lg:bg-transparent lg:border-0 lg:backdrop-blur-none lg:pb-4">
  <button ...>Cancel</button>
  <button ...>Save to Drive</button>
</div>
```
Remove the current save buttons from the `space-y-5` scroll container. On desktop (`lg:`) the
static placement is fine.

### 1.4 Post-Save Full-Screen Takeover

`EquipmentFormScreen.tsx:117–146` — A full-screen success state after every save breaks flow during a
multi-system field session. The displayed title `{values.brand || 'Equipment'} {values.model || ''}`
renders "Equipment ·" when both fields are empty, which is useless.

**Fix — toast by default:**
- 3-second auto-dismiss toast: `"{category.label} record saved to Drive"` (use category label, not
  "Equipment")
- After dismissal, return to `/capture` ready for the next item
- Keep the full-screen confirmation only for first save of a new category (a meaningful milestone)

If you keep the full-screen: fix the title fallback — use `category?.label` when brand and model are
both empty.

### 1.5 AI Extraction Loading Copy

`EquipmentFormScreen.tsx:207–208` — Static "Extracting specifications…" during what may be a 3–8
second call on cellular. Standing still with nothing changing is the worst-case perceived latency.

**Fix — cycle messages:**
```tsx
const LOADING_MSGS = ['Reading nameplate…', 'Identifying specifications…', 'Almost there…']
const [msgIdx, setMsgIdx] = useState(0)

useEffect(() => {
  if (aiState !== 'extracting') { setMsgIdx(0); return }
  const t = setInterval(() => setMsgIdx(i => (i + 1) % LOADING_MSGS.length), 2500)
  return () => clearInterval(t)
}, [aiState])

// In JSX:
{aiState === 'extracting' && LOADING_MSGS[msgIdx]}
```

---

## 2. Form Design

### 2.1 Field Label Size — Most Impactful Legibility Change

`EquipmentFormScreen.tsx:262`:
```tsx
<label className="block text-xs font-medium text-slate-600 mb-1.5">
```
`text-xs` (12px) is borderline unreadable in dim utility rooms. This is the single most impactful
legibility issue in the app.

**Fix:**
```tsx
<label className="block text-sm font-medium text-slate-700 mb-1.5">
```

### 2.2 Input Font Size Triggers iOS Auto-Zoom

`EquipmentFormScreen.tsx:273, 282, 299` — All inputs, selects, and textareas use `text-sm` (14px).
iOS auto-zooms the viewport on focus when `font-size < 16px`. On a one-handed field session, viewport
zoom is disorienting and breaks layout. This fires on every single field tap.

**Fix — add `text-base` on mobile for every form input:**
```tsx
className="... text-base md:text-sm ..."
```
Apply to every `<input>`, `<select>`, and `<textarea>` in the form.

### 2.3 13 Fields in One Undifferentiated List

`EquipmentFormScreen.tsx:48–66` — The generator form has 13 fields in a flat vertical list. No visual
grouping, no sense of progress, no way to know where you are when partially scrolled.

**Add section dividers.** Define groups in the category schema:
```typescript
interface FieldGroup {
  label: string
  fieldIds: string[]
}
interface Category {
  // ...existing fields
  fieldGroups?: FieldGroup[]  // optional — if absent, render flat
}

// Generator groups:
fieldGroups: [
  { label: 'Identification', fieldIds: ['brand', 'model', 'model_number', 'serial_number'] },
  { label: 'Specs',          fieldIds: ['kw_rating', 'fuel_type'] },
  { label: 'Maintenance',    fieldIds: ['transfer_switch_brand', 'transfer_switch_amps',
                                         'oil_type', 'oil_capacity_qt', 'air_filter_part',
                                         'last_service_date'] },
  { label: 'Notes',          fieldIds: ['notes'] },
]
```

Section header style:
```tsx
<div className="text-xs font-semibold uppercase tracking-wide text-slate-400
                pt-4 pb-1 border-b border-slate-100 mb-3">
  {group.label}
</div>
```

This turns "13 things to fill in" into "4 sections of 2–5 things" — a meaningfully different
cognitive load when you're standing in a utility room.

### 2.4 Required Fields Not Indicated

`EquipmentFormScreen.tsx:252–313` — Brand, Model Number, and Serial Number are the minimum viable
record. The user can save a completely empty form with no warning and get a useless Drive file.

**Fix:**
1. The `required` field is already in `FieldSchema` per ADR-007 (`required: z.boolean().optional()`).
   Render it: show `*` after the label for required fields.
2. On save with missing required fields: inline error state + scroll to the first empty required field.
3. Add a one-liner below the form header: `* required — everything else is optional`

### 2.5 Boolean Fields Are Ambiguous

`EquipmentFormScreen.tsx:289–295` — Boolean fields render as a checkbox labeled "Yes" next to the
field label. Unchecked state has no "No" label — it's unclear whether unchecked means "No" or "not
answered yet."

**Fix — Yes/No pill buttons, bigger targets, unambiguous state:**
```tsx
<div className="flex gap-2">
  {[['true', 'Yes'], ['false', 'No']].map(([v, lbl]) => (
    <button
      key={v}
      onClick={() => setValues(p => ({ ...p, [field.id]: v }))}
      className={cn(
        'flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors',
        val === v
          ? v === 'true'
            ? 'bg-sky-600 text-white border-sky-600'
            : 'bg-slate-700 text-white border-slate-700'
          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
      )}
    >
      {lbl}
    </button>
  ))}
</div>
```

### 2.6 Progressive Disclosure for Advanced Fields

Fields like "Transfer Switch Type", "Covered Circuits", "Regulator Outlet PSI", "Oil Capacity" require
prior knowledge the user won't have from the nameplate. They shouldn't be front-loaded.

**Strategy:** Add `advanced?: boolean` to field definitions. Show only non-advanced fields by default.
Add a "Show more fields" disclosure at the bottom of each group. For generator: 13 visible → ~7 by
default. Much more approachable one-handed in the field.

---

## 3. Confidence Badges

### 3.1 Current State: All AI Fields Look Identical

`EquipmentFormScreen.tsx:255–257`:
```tsx
const aiFilledStyle = aiState === 'done' && val
  ? 'ring-2 ring-sky-200 border-sky-300'
  : ''
```
Every AI-populated field gets the same blue ring. "Generac" extracted from a clear visible logo gets
the same treatment as a manufacture date inferred from a serial number prefix. The user has no signal
about where to focus verification effort.

### 3.2 Recommended: Three-Level Confidence

Update the extraction response shape:
```typescript
interface AIExtractionResult {
  fields: Record<string, {
    value: string
    confidence: 'high' | 'medium' | 'low'
    source?: string  // e.g. 'nameplate', 'serial_prefix', 'inferred'
  }>
}
```

Render inline with the label — small indicator, not a badge:
```tsx
{conf === 'high'   && <span className="ml-1.5 text-xs text-emerald-600">✓</span>}
{conf === 'medium' && <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-amber-400 align-middle" />}
{conf === 'low'    && <span className="ml-1.5 text-xs font-bold text-red-500">?</span>}
```

Field border/background by confidence:
- High:   `border-emerald-200 bg-emerald-50/20`
- Medium: `border-amber-200 bg-amber-50/20`
- Low:    `border-red-200 bg-red-50/20`

### 3.3 Legend and Form Header Copy

Replace `EquipmentFormScreen.tsx:249`:
```
// From:
"Fields highlighted in blue were filled by AI — please verify."

// To (single line, text-xs text-slate-500, no extra vertical space):
"AI auto-filled · ✓ confirmed  ● review  ? verify"
```

---

## 4. Error States

### 4.1 AI Extraction Failure

`EquipmentFormScreen.tsx:210–211` — Current: `"Extraction failed — fill manually"`. Correct behavior,
inadequate copy. Differentiate network failure from parse failure:

**Network failure:**
```
Couldn't connect — photo saved locally.
Fill in what you know, or retry when you have signal.
```

**Parse failure (unreadable nameplate):**
```
Couldn't read the nameplate.
Minimum to fill in: Brand, Model Number, Serial Number.
```

In both cases: auto-scroll to the first required field and focus it. Removes the "now what?" moment.

### 4.2 Drive Upload Failure

Not surfaced anywhere in the UI. The IndexedDB offline queue logic exists per the spec, but there's
no visual layer for it.

**Build in priority order:**

**A. Toast on upload failure:**
```
Saved locally — will upload when reconnected.
```
Style: amber background, auto-dismisses in 5s.

**B. Pending count in the mobile header — when queue > 0:**
```tsx
{pendingCount > 0 && (
  <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200
                   rounded-full px-2 py-0.5 flex items-center gap-1">
    <Upload className="w-3 h-3" />
    {pendingCount} pending
  </span>
)}
```

**C. Fix Settings > Sync & Storage** (`SettingsScreen.tsx:198–199`):
- "Retry all" shows enabled when queue is 0. Disable it when `pendingCount === 0`.
- When queue > 0: list each pending record (category + timestamp), not just a count. The user needs
  to know *what* is waiting, especially if multiple captures happened offline.

### 4.3 Auth Expiry

Not implemented anywhere. ADR-003 explicitly flags that `prompt=none` silent refresh fails on Safari
ITP — which is the primary target device. The 1-hour access token expiry is a frequent real failure
path on iOS Safari.

**Fix:** Intercept 401s in the Drive client wrapper. If silent re-auth fails:

1. Non-dismissible top banner (above the header, full width, amber):
   ```
   Session expired — sign in again to sync records.     [Sign in]
   ```
   Do not navigate away. Preserve any in-progress form data.

2. "Sign in" triggers the PKCE OAuth flow. On success: dismiss the banner, auto-retry queued uploads.

3. If queue items exist: `"(X records waiting to upload)"` in the banner.

### 4.4 Offline State

Not surfaced anywhere. The app works offline by design, but the user can't distinguish "Drive upload
is slow" from "I'm offline and this was queued."

**Fix:** Watch `navigator.onLine` + `online`/`offline` events. When offline, persistent small
indicator in the mobile header:
```
⊘ Offline — records saved locally
```
Style: slate-colored, not red. Being offline is fine. On reconnect: trigger queue flush, briefly show
`"Back online — uploading X records"`.

---

## 5. Empty States

### 5.1 Dashboard — No Data

`DashboardScreen.tsx:143–193` — Maintenance Due and Capital Watch will render as empty cards with
section headers and no content. Looks broken.

**Fix:** Replace both empty cards with a unified CTA when `documented === 0`:
```tsx
{documented === 0 && (
  <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center col-span-full">
    <Camera className="w-10 h-10 mx-auto text-slate-300 mb-3" />
    <p className="text-sm font-semibold text-slate-700 mb-1">Start documenting your property</p>
    <p className="text-xs text-slate-500 mb-4">
      Photograph equipment nameplates — AI fills in the specs automatically.
    </p>
    <button onClick={() => navigate('/capture')}
      className="bg-sky-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl">
      Capture first record
    </button>
  </div>
)}
```
Show Maintenance Due and Capital Watch only when there's data.

### 5.2 Documentation Card Navigates to Wrong Route

`DashboardScreen.tsx:265`:
```tsx
onClick={() => navigate('/capture')}  // ← drops user at category selector
```
Should be:
```tsx
onClick={() => navigate(`/capture/${cat.id}`)}  // ← goes directly to the right form
```
Clicking "Add" on a specific category and landing at the category picker is one unnecessary tap.

### 5.3 CaptureSelectScreen — All Categories Documented

`CaptureSelectScreen.tsx:22–52` — When `withoutRecords.length === 0`, the "Needs documentation (0)"
section renders a header with nothing below it. Fix: hide the section when empty, show a completion
note instead:
```tsx
{withoutRecords.length === 0 ? (
  <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200
                rounded-xl px-4 py-3 flex items-center gap-2">
    <CheckCircle2 className="w-4 h-4 shrink-0" />
    All categories documented. Add another record below.
  </p>
) : (
  // existing section
)}
```

### 5.4 Maintenance — Upcoming and History Tabs Have No Empty State

`MaintenanceScreen.tsx:224–228` — Upcoming tab renders nothing when `upcomingTasks.length === 0`.
`MaintenanceScreen.tsx:231–258` — Same for History. Both look broken.

**Upcoming:**
```tsx
{upcomingTasks.length === 0 && (
  <div className="text-center py-12 text-slate-400">
    <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
    <p className="text-sm">Nothing scheduled in the next 90 days.</p>
    <p className="text-xs mt-1">Tasks are generated from your equipment records.</p>
  </div>
)}
```

**History:**
```tsx
{SERVICE_RECORDS.length === 0 && (
  <div className="text-center py-12 text-slate-400">
    <Wrench className="w-8 h-8 mx-auto mb-2 opacity-40" />
    <p className="text-sm">No service history yet.</p>
    <p className="text-xs mt-1">Mark a task done to create the first service record.</p>
  </div>
)}
```

### 5.5 Inventory — Search Empty State Bug

`InventoryScreen.tsx:177–183` — The empty state renders `No categories match "{search}"` whenever
`visibleCategories.length === 0`, including when the filter is set to "Missing" or "Done" but the
search string is empty. Guard it:
```tsx
<p className="text-sm">
  {search ? `No categories match "${search}"` : 'No categories in this filter.'}
</p>
```

### 5.6 Inventory — Equipment Rows Have Broken Tap Target

`InventoryScreen.tsx:143–170` — Equipment record rows have `cursor-pointer` and a `ChevronRight`,
strongly implying navigation. There is no `onClick` handler. Tapping does nothing.

Fix: either add a detail route and navigate on tap, or remove `cursor-pointer` and `ChevronRight`
until that view exists. A broken affordance is worse than a missing one.

### 5.7 First Launch / No Auth

Not yet implemented. The spec describes a splash/onboarding flow but nothing in the screens directory
handles the unauthenticated state.

**Minimal first launch screen:**
```
┌────────────────────────────────────┐
│                                    │
│   🏠  Property Manager             │
│                                    │
│  Photograph equipment nameplates.  │
│  AI extracts the specs.            │
│  Everything saves to your          │
│  Google Drive automatically.       │
│                                    │
│  [  Sign in with Google  ]         │
│                                    │
│  Your data stays in your Drive     │
│  — accessible without this app.    │
│                                    │
└────────────────────────────────────┘
```

Move OpenRouter key setup to Settings. On first AI extraction attempt without a key: inline prompt
`"Add your OpenRouter key in Settings to enable smart fill."`

---

## 6. Navigation

### 6.1 Bottom Nav — 5 Items Is Correct

Dashboard, Capture, Maintenance, Budget, Ask AI. Inventory's exclusion is right — it's a reference
screen, not a workflow entry point. The Documentation card on Dashboard is the primary Inventory
entry. No change needed.

### 6.2 Back Button Touch Target Too Small

`EquipmentFormScreen.tsx:153–158` — Back button is `w-8 h-8` (32px). Minimum for comfortable
one-handed use is 44px.

```tsx
<button
  onClick={() => navigate('/capture')}
  className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200
             flex items-center justify-center transition-colors -ml-1.5"
>
  <ChevronLeft className="w-5 h-5 text-slate-600" />
</button>
```

Apply this to every back/close button across all screens.

### 6.3 Maintenance Task Expand Button Too Small

`MaintenanceScreen.tsx:55–61` — The expand/collapse chevron is `w-6 h-6` (24px), positioned in the
upper-right of each task card. One-handed, this is a miss target on most thumbs.

**Fix — expand the tap area without changing visual size:**
```tsx
<button
  onClick={() => setExpanded(e => !e)}
  className="shrink-0 w-10 h-10 flex items-center justify-center
             text-slate-400 hover:text-slate-600 -mr-2"
>
  {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
</button>
```

### 6.4 Property Context — No Warning When Shooting to the Wrong Property

If the wrong property is active during a field session, every capture goes to the wrong Drive folder.
The current property switcher is a small pill in the mobile header — easy to miss, easy to forget.

**Fix:** When the active property is not the primary residence, show a persistent contextual banner
below the header:
```tsx
{activeProperty.id !== PRIMARY_PROPERTY_ID && (
  <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-700
                  flex items-center gap-1.5">
    <MapPin className="w-3 h-3 shrink-0" />
    Recording to: <strong className="ml-0.5">{activeProperty.label}</strong>
    <button className="ml-auto text-amber-600 underline" onClick={switchToPrimary}>
      Switch
    </button>
  </div>
)}
```
This prevents silent "all my Camp captures went to Tannerville" mistakes.

### 6.5 Settings — API Input Fields Overflow on Narrow Screens

`SettingsScreen.tsx:89–99, 135–145` — API key and HA token inputs are hardcoded `w-44` (176px)
inside a flex row. On a 360px device or in landscape this will push the eye toggle off-screen.

**Fix:** Replace `w-44` with `w-full max-w-[176px]` or switch to a stacked layout for these rows.

### 6.6 Desktop Sidebar — Settings at Bottom

`SettingsScreen` is separated in the sidebar footer. Keep this. Settings-at-bottom is the correct
pattern and right for this context.

---

## 7. Microcopy

### 7.1 Button Labels

| File | Line | Current | Problem | Fix |
|------|------|---------|---------|-----|
| `EquipmentFormScreen.tsx` | 187 | `Camera` | Too terse, doesn't say what happens | `Take Photo` |
| `EquipmentFormScreen.tsx` | 191 | `Upload` | Ambiguous direction | `Choose Existing` |
| `EquipmentFormScreen.tsx` | 133 | `Capture another` | Vague after saving | `Record another` |
| `MaintenanceScreen.tsx` | 128 | `Delay` | Ambiguous — what gets delayed, by how much? | `Snooze` |
| `MaintenanceScreen.tsx` | 133 | `Schedule` | Schedule what, how? | `Set date` |
| `SettingsScreen.tsx` | 165 | `Testing…` | Implies failure is possible (yes but don't prime it) | `Connecting…` |
| `SettingsScreen.tsx` | 165 | `Re-test` | Inconsistent verb form | `Verify` |
| `SettingsScreen.tsx` | 199 | `Retry all` (0 pending) | Active when nothing to retry | Disable when queue = 0 |
| `DashboardScreen.tsx` | 265 | `+ Add` | Generic, could be anything | `+ Capture` |

### 7.2 Section and Screen Copy

**CaptureSelectScreen subtitle** (`CaptureSelectScreen.tsx:17–19`):
```
From: "Select what you want to capture. AI extraction is available for camera-enabled categories."
To:   "Choose a system to document. Categories with ✦ auto-fill specs from a photo."
```
Shorter. Explains the AI badge inline. "Document" is more accurate than "capture."

**EquipmentFormScreen subtitle** (`EquipmentFormScreen.tsx:163`) — currently hardcoded regardless of
context:
```
recordType === 'service'   → "New service record"
recordType === 'activity'  → "New activity log"
default                    → "New equipment record"
```

**Photo section header** (`EquipmentFormScreen.tsx:171`):
```
// When hasAIExtraction === true:  "Photograph Nameplate"    ← keep
// When hasAIExtraction === false: "Add Photos"              ← change
```
Barn, Septic, Roof, Forestry Log don't have nameplates. "Photograph Nameplate" on these is wrong.

**AI extraction badge** (`EquipmentFormScreen.tsx:172–176`):
```
From: "AI extraction"
To:   "Smart fill ✦"
```
"AI extraction" is implementation language. "Smart fill" is the user benefit.

**Form AI header** (`EquipmentFormScreen.tsx:249`):
```
From: "Fields highlighted in blue were filled by AI — please verify."
To:   "AI auto-filled · verify fields marked ?"
```

**Inventory progress note** (`InventoryScreen.tsx:62–65`):
```
From: "X systems still need documentation — these represent knowledge gaps"
To:   "X systems still need documentation"
```
"Knowledge gaps" is self-evident and condescending.

**Settings "Knowledge Cache"** (`SettingsScreen.tsx:201`):
```
From: "Knowledge Cache · Index last synced: just now"
To:   "Local Index · Updated just now"
```
"Knowledge cache" is implementation jargon the user doesn't need. Also: replace "just now" with
actual relative time — `"Updated 4 min ago"` using `formatDistanceToNow()`.

### 7.3 Toast Messages

No toasts exist yet. When implemented:

| Event | Copy | Duration | Style |
|-------|------|----------|-------|
| Save success | `"{Category} record saved to Drive"` | 3s | Emerald |
| Save queued (offline) | `"Saved locally — uploads when reconnected"` | 5s | Amber |
| Upload failure | `"Upload failed — will retry"` | Persist | Amber |
| Queue flushed on reconnect | `"Uploaded {n} records to Drive"` | 3s | Emerald |
| Auth expiry | Use persistent banner, not toast — requires action | Persist | Amber |
| AI complete | No toast — inline status is sufficient | — | — |

### 7.4 Loading State Copy

**Drive upload** (`EquipmentFormScreen.tsx:326–328`) — static "Saving…" during a 2–5 second upload:
- 0–1s: "Saving…"
- 1–3s: "Uploading to Drive…"
- 3+s: "Almost there…"

Same `useEffect` interval approach as §1.5 above.

### 7.5 Placeholder Text

| Field | Current | Fix |
|-------|---------|-----|
| Oil Type | `e.g. 5W-30 Synthetic` | Good |
| Filter Size | `e.g. 20×25×4` | Good |
| Service Interval | `e.g. Annual / 200 hrs` | `e.g. Annual or every 200 hrs` |
| Covered Circuits | `List circuits on transfer switch` | `e.g. Well pump, HVAC main, refrigerator` |
| Appliances Served (Propane) | `List all propane appliances + BTU loads` | `e.g. Generator (500k BTU), furnace (120k BTU), water heater (38k BTU)` |
| Tank Location (Septic) | `Describe location relative to structures; reference GPS pin or sketch` | `e.g. 40 ft east of back door, near the oak tree` |

---

## 8. Priority Order

### Must fix before any real field use

1. **Sticky Save button** (`EquipmentFormScreen.tsx:317–336`) — Most critical workflow friction.
   Without it, one-handed form submission requires scrolling a 13-field list. Implement the fixed
   bottom action bar first.

2. **Photo remove button always visible** (`EquipmentFormScreen.tsx:225–230`) — Touch users cannot
   remove photos. `hidden group-hover:flex` is a complete regression on mobile. Fix unconditionally.

3. **Input font size to `text-base` on mobile** (`EquipmentFormScreen.tsx:273, 282, 299`) — iOS
   auto-zoom on every field tap (`font-size < 16px`) destroys the one-handed UX. Apply
   `text-base md:text-sm` to every input.

4. **Camera button full-width, Upload secondary** (`EquipmentFormScreen.tsx:181–194`) — Wrong visual
   hierarchy. Camera is the primary action 90% of the time.

5. **Documentation card `+ Add` routes to wrong screen** (`DashboardScreen.tsx:265`) — Should go to
   `/capture/${cat.id}`, not `/capture`. One unnecessary tap.

### High priority — before first real use

6. **Three-level confidence badges** — Even rough confidence (high/medium/low) on AI-extracted fields
   is meaningfully better than uniform blue highlights. Users need to know where to focus review effort.

7. **Drive upload failure UI** — The offline queue logic exists. Surface it: toast on failure,
   pending count in header, actionable queue view in Settings.

8. **Auth expiry handler** — 1-hour OAuth token expiry on iOS Safari ITP is a real, frequent failure
   mode. The non-dismissible banner + OAuth retry pattern must exist before field use.

9. **Field grouping** — Identification / Specs / Maintenance / Notes with section dividers makes the
   generator form scannable. 13 flat fields is cognitively hard in dim light.

10. **Inventory equipment rows — fix broken tap target** (`InventoryScreen.tsx:143`) —
    `cursor-pointer` + `ChevronRight` with no `onClick` is worse than no affordance.

### Refinement — after initial deployment

11. Required field indicators + save validation
12. Boolean fields → Yes/No pill buttons
13. Progressive disclosure for advanced fields
14. Empty states: Dashboard no-data, CaptureSelectScreen complete, Maintenance tabs
15. First launch / onboarding screen
16. Property context banner when non-primary property is active
17. Microcopy pass: button labels, section titles, placeholders
18. Loading state copy cycling for extraction and save
19. Relative timestamps in Settings sync status

---

*All items 1–10 are confined to existing components. No new screens or significant architecture
changes required to implement the must-fix items.*
