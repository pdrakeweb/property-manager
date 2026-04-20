# Property Manager PWA — UI Design Review v2

**Date:** April 13, 2026  
**Scope:** All 17 screens + shared components  
**Branch reviewed:** `claude/ecstatic-goodall`

---

## 1. Visual Consistency

### Strengths
- Card system is coherent: `bg-white border border-slate-200 rounded-2xl shadow-sm` used throughout
- Primary action color (`sky-600`) is consistently applied to CTA buttons
- Status color palette is well-defined: emerald = positive, amber = warning, red = danger

### Issues

#### 1.1 Padding drift
Card internal padding varies with no pattern:
- `px-4 py-4` (MaintenanceScreen)
- `px-5 pt-5 pb-4` (BudgetScreen summary cards)
- `px-4 py-3` (various list rows)
- `p-5` (InventoryScreen progress card)

**Recommendation:** Standardize on `p-4` (tight cards/list rows) and `p-5` (hero/summary cards).

#### 1.2 Button size inconsistency
Three different padding scales in use for same semantic button type:
- `px-3 py-1.5` (filter chips)
- `px-4 py-2` (inline actions)
- `px-4 py-2.5` or `py-3.5` (primary CTAs)

No documented tier. Secondary/tertiary actions look identical to each other.

**Recommendation:** Define three tiers: `sm` (`px-3 py-1.5 text-xs`), `md` (`px-4 py-2.5 text-sm`), `lg` (`px-5 py-3.5 text-sm font-semibold`).

#### 1.3 Badge border inconsistency
Some type badges include a border (`border border-sky-100`), others use background only. For example, ExpiryManageScreen uses `bg-sky-50 border border-sky-100`, while MaintenanceScreen priority badges use `bg-amber-100` without a border.

**Recommendation:** Pick one convention (background-only is cleaner) and apply it everywhere.

#### 1.4 Icon style mixing
Empty states mix emoji icons (`🧹`, `💧`, `👥`) with Lucide icons (`Search`, `FileText`, `Zap`). The emoji icons feel inconsistent with the rest of the design system.

**Recommendation:** Replace all emoji empty-state icons with Lucide icons. Use a consistent size (`w-12 h-12`) and `text-slate-300` color.

#### 1.5 Typography weight inconsistency
- Section headings: `text-sm font-semibold` in some places, `text-base font-semibold` in others
- Stat values: `text-2xl font-bold` (Budget), `text-lg font-bold` (some Dashboard cards)
- Screen titles: `text-xl font-bold` (most) vs. `text-lg font-bold` (some)

**Recommendation:** Standardize screen title to `text-xl font-bold`, section headings to `text-sm font-semibold text-slate-900`, stat values to `text-2xl font-bold`.

---

## 2. Mobile-First Gaps

### 2.1 Tap target sizes (critical)
Icon-only action buttons across the app measure 14–16px (`w-3.5 h-3.5`, `w-4 h-4`). The minimum recommended touch target is 44×44px. Affected patterns:
- Expand/collapse chevrons in MaintenanceScreen task cards
- Camera, Wrench, Trash2 icons in InventoryScreen equipment rows
- Edit (+) and Delete icons in ExpiryManageScreen
- Close (X) buttons in modals

**Recommendation:** Wrap icon buttons in a `<button className="p-2.5 -m-2.5">` padding shell to expand tap area without changing visual size.

### 2.2 Responsive table overflow
Three screens display table-like layouts that don't adapt on narrow viewports:
- **TaxScreen Assessments tab:** four columns (Year, Total Assessed, YoY Δ, Market Value) — Market Value hidden on mobile but layout still cramped
- **UtilityScreen Account Detail:** period/consumption/cost row may overflow
- **WellTestScreen expanded test detail:** parameter table (4 columns) scrolls horizontally but no scroll indicator

**Recommendation:** For all 4-column tables: on mobile, stack each row as a labeled key-value card (`<dl>` pattern) instead of a table row.

### 2.3 Charts on mobile
Both the Fuel price trend (SVG line chart) and Well Test trends chart have fixed SVG viewBox proportions that become cramped below ~375px. The Fuel bar chart (CSS) has 12 months of bars that can't scroll.

**Recommendation:** Add `overflow-x-auto` scroll container with a min-width chart width (e.g., `min-w-[480px]`) so users can swipe. Add a subtle scroll hint gradient on the right edge.

### 2.4 Content below bottom nav
The mobile bottom nav is fixed and adds visual height. Content area uses `pb-28` (112px) but the nav + safe area is closer to 72–80px on most devices. On iPhone SE (375×667) this wastes ~30px of viewable content.

**Recommendation:** Measure actual nav height and derive the padding dynamically, or use CSS `env(safe-area-inset-bottom)` + fixed `pb-20`.

### 2.5 Modal behavior on small screens
Modals use `max-w-sm` (384px) which fills the full width of a 375px phone with no horizontal margin. Combined with `p-6` internal padding, this is tight. The Done modal in MaintenanceScreen (8 fields) is especially long.

**Recommendation:** Add `mx-4` to modal wrappers. For long modals, add `max-h-[85vh] overflow-y-auto` to prevent content from going off-screen.

---

## 3. Navigation Structure

### 3.1 Desktop vs. mobile nav parity gap
Desktop sidebar shows 11 nav items. The mobile bottom bar shows only 5. The 6 hidden routes (Budget, Vendors, Expiry, Emergency, Settings, and specialty screens like Well Tests/Septic/Fuel) are unreachable from mobile nav without typing a URL directly.

**Recommendation:** Add a "More" item (grid icon) as the 5th mobile nav slot that opens a full-screen drawer with all remaining nav items.

### 3.2 No back-button pattern for nested views
Three screens push a detail view without a router route change: VendorScreen (vendor detail), UtilityScreen (account detail), and implicitly the Emergency screen edit mode. These use local `selectedId` state, so the browser back button doesn't return to the list.

**Recommendation:** Either route each detail view (e.g., `/vendors/:id`) or use `window.history.pushState` + `popstate` handler to make the back button functional.

### 3.3 Active state on mobile bottom nav
Mobile bottom nav items apply the active style based on `location.pathname === item.path`, but since the app uses HashRouter (`/#/path`), the `location.pathname` will always be `/`. Active highlighting never works on mobile.

**Recommendation:** Use `location.hash.includes(item.path)` or switch to `useMatch()` from React Router for active detection.

### 3.4 Deep links to specialty screens
Specialty screens (WellTestScreen, SepticScreen, FuelScreen, etc.) are not linked from the main nav. They appear to only be reachable if the user already knows the URL. These should surface somewhere — a logical home would be a "Property Systems" hub page or a "More" drawer.

---

## 4. Empty States

### 4.1 Inconsistent visual language

| Screen | Empty State Style |
|--------|------------------|
| FuelScreen | Lucide `Droplet` icon, descriptive text |
| SepticScreen | Emoji `🧹` as text, no icon |
| WellTestScreen | Lucide `FlaskConical`, descriptive text |
| InventoryScreen | Lucide `Search` (for no search results) |
| VendorScreen | Lucide `Users` |
| ExpiryManageScreen | Lucide `FileText` |

Phrasing also varies: "No deliveries recorded", "No tests yet", "No vendors added yet", etc.

**Recommendation:** Standardize on Lucide icons. Adopt consistent phrasing: "No [items] yet — [action to get started]." with a CTA button where applicable.

### 4.2 Missing first-run empty states
**DashboardScreen** has no empty/first-run state. When no properties have been documented, the dashboard shows blank maintenance cards, blank capital cards, and a 0% documentation bar — but no welcoming or guiding message to help a new user know what to do first.

**Recommendation:** Add a first-run state on Dashboard (triggered when `documented === 0 && tasks.length === 0`) that shows a "Let's get started" card with links to Capture, Emergency setup, and Settings.

### 4.3 No empty state for filtered results in some screens
MaintenanceScreen tabs (Due Now / Upcoming / History) don't show an empty state when the filtered list is empty — the tab content area is just blank.

**Recommendation:** Add "No [tab name] tasks" empty state to each tab.

---

## 5. Form UX

### 5.1 Required vs. optional fields not communicated
No screen consistently marks which fields are required. The Done modal in MaintenanceScreen has 8 fields, but no indication that actualCost or completionDate are more important than invoiceRef.

**Recommendation:** Add a line at the top of each modal form: "Fields marked * are required." Mark required `<label>` elements with a `*` span. Add HTML `required` attribute for browser validation fallback.

### 5.2 No inline validation feedback
All forms submit and fail silently (or succeed without feedback). No fields highlight red, no error messages appear below inputs.

**Recommendation:** On submit attempt, validate client-side and show `border-red-400` ring + `<p className="text-xs text-red-600 mt-1">` error message per field.

### 5.3 Auto-calculated field opacity
FuelScreen's "Total Cost" field auto-fills from gallons × price/gallon but accepts manual override. There is no visual indication it's calculated — users may be confused when it updates on blur.

**Recommendation:** Add a `bg-slate-50` background + italic placeholder "auto-calculated" on calculated fields. Show a small "Auto" badge that disappears when the user overrides.

### 5.4 Date inputs with no constraints
Many date pickers accept any date. FuelScreen allows future delivery dates; SepticScreen allows service dates decades in the future.

**Recommendation:** Add `max={today}` to service/event date inputs. Where logical, add `min` constraints (e.g., mortgage start date can't be after today).

### 5.5 Long modals without section structure
The Done modal (MaintenanceScreen) and Add Well Test modal have 7–8+ fields stacked with no grouping. Users must scroll through the entire form to understand what's being asked.

**Recommendation:** Group related fields under light dividers with sub-headings: "Completion Details", "Cost & Payment", "Warranty & Notes". Use `<fieldset>` + `<legend className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">` pattern.

---

## 6. Data Visualization

### 6.1 Budget progress bars mislead proportions
BudgetScreen year-by-year cards show a progress bar representing that year's cost as a % of the maximum year. The minimum bar width is forced to `Math.max(pct, 4)%` to prevent invisible bars. This means a $500 year and a $50,000 year may look similar if most years are high-cost.

**Recommendation:** Remove the 4% minimum floor. If the value is truly small, render a 1px stub or no bar. The current approach makes visual comparison meaningless.

### 6.2 Line charts with single data point
Both WellTestScreen and FuelScreen SVG line charts render a line connecting one point — which draws as a dot at the start with no line, or may throw off the scale. The chart silently shows nothing useful.

**Recommendation:** Check `data.length < 2` before rendering the chart. For single-point data, show a simple stat card instead ("1 test on [date], value: X") with messaging: "Add another test to see a trend."

### 6.3 CSS bar chart months not labeled on mobile
FuelScreen's 12-month bar chart shows abbreviated month labels below bars. On screens narrower than 360px, the 12 labels overlap. No responsive behavior defined.

**Recommendation:** On mobile, show every other label (even months only) or rotate labels 45°.

### 6.4 No data density indicator on charts
Charts show historical data but don't indicate gaps (months with no data). The fuel price line chart interpolates between points that may be months apart, implying continuity that doesn't exist.

**Recommendation:** Use dashed line segments for gaps > 60 days. Add a dot at each actual data point.

### 6.5 No chart legend
Neither the bar chart nor the line chart in FuelScreen includes a legend. The fuel type dropdown above the chart implies context, but the chart itself has no label.

---

## 7. Cross-Screen Flows

### 7.1 Mark Done → Budget not updated
When a maintenance task is marked done via the DoneModal and a cost is recorded via `costStore.add()`, the BudgetScreen's "Historical Spend" section doesn't reflect this — it reads from `MAINTENANCE_HISTORY` mock data, not costStore.

**Recommendation:** BudgetScreen should read actual costs from `costStore.getAll()` in addition to or instead of mock history.

### 7.2 Capture → Inventory disconnect
After capturing equipment via EquipmentFormScreen and saving to Drive, the InventoryScreen's category still shows "Missing" because `cat.recordCount` is read from static mockData, not live Drive counts. The user sees a false zero after successfully documenting a system.

**Recommendation:** InventoryScreen should use the same `driveFileCounts` cache that CaptureSelectScreen uses for live counts.

### 7.3 Vendor → Maintenance not surfaced
VendorScreen shows a vendor's "Service History" — maintenance tasks where the vendor was assigned. But there's no reciprocal link in MaintenanceScreen: when viewing a completed task, there's no link to the vendor record.

**Recommendation:** In the MaintenanceScreen history tab, show a tappable vendor name chip that navigates to the vendor detail.

### 7.4 Emergency screen not integrated with Dashboard
The Dashboard has no persistent "Emergency Info" status card. New users setting up the app won't know the Emergency screen exists until they navigate to it manually.

**Recommendation:** Add a conditional "Emergency card not set up" alert to the Dashboard (amber banner, shown only if no emergency card exists for the active property).

### 7.5 Expiry alerts on Dashboard and Expiry screen are duplicated but different
The DashboardScreen ExpiryWidget and ExpiryManageScreen both show expiry items. ExpiryWidget limits to 5 items; the full screen shows all. The sorting and color logic is slightly different between the two.

**Recommendation:** Extract a shared `useExpiryItems(propertyId)` hook that both screens consume. Ensure consistent sorting (soonest first) and color thresholds.

### 7.6 Property switch does not reset form state
When the user switches properties in AppShell while a modal is open (e.g., Add Delivery in FuelScreen), the modal stays open but now renders data for the new property. This creates a data integrity risk — the user might save a record to the wrong property.

**Recommendation:** Subscribe to `activePropertyId` changes in screens with open modals. On change, close any open modals and reset form state.

---

## 8. Quick Wins (Low Effort / High Impact)

### 8.1 Fix active state on mobile bottom nav
**Effort:** 10 min  
**Impact:** Users will know where they are. Change `location.pathname === item.path` to `location.hash.includes(item.path)` or use `useMatch`.

### 8.2 Add tap-target shells to icon buttons
**Effort:** 30 min  
**Impact:** Significantly reduces mis-taps on mobile. Add `p-2 -m-2` wrapper class to all icon-only buttons.

### 8.3 Fix empty state for Maintenance tabs
**Effort:** 15 min  
**Impact:** Removes confusing blank tab content. Add a simple "No tasks" message for each empty tab.

### 8.4 Change ExpiryManageScreen edit icon from + to pencil
**Effort:** 5 min  
**Impact:** + currently means "add" everywhere else. Swap `Plus` → `Pencil` icon on the edit button.

### 8.5 Disable "Retry all" in Settings when offline queue is empty
**Effort:** 10 min  
**Impact:** Removes a confusing always-enabled button. Condition: `queue.length === 0 ? disabled : active`.

### 8.6 Add `max={today}` to service date inputs
**Effort:** 15 min  
**Impact:** Prevents nonsensical future dates on historical event logs (SepticScreen, WellTestScreen, FuelScreen).

### 8.7 Add Escape handler to modals
**Effort:** 20 min  
**Impact:** Standard web behavior. Add `useEffect(() => { onKeyDown: e.key === 'Escape' && onClose() }, [])` in modal components.

### 8.8 Replace emoji empty-state icons with Lucide
**Effort:** 20 min  
**Impact:** Visual consistency. Replace `🧹` etc. in SepticScreen with Lucide equivalents.

---

## 9. Bigger Improvements

### 9.1 Design system token file
**Problem:** Spacing, color, and border-radius values are scattered as inline Tailwind classes with no single source of truth. Drift between screens is ongoing.  
**Recommendation:** Create `src/styles/tokens.ts` that exports Tailwind class string constants:
```ts
export const card = 'bg-white border border-slate-200 rounded-2xl shadow-sm'
export const cardPadding = 'p-4'
export const inputBase = 'border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300'
```
Use these in all components. This is the foundation for future design consistency.

### 9.2 Shared `<Modal>` component
**Problem:** Modal structure (backdrop, container, header, footer) is duplicated ~10 times across screens. Changes (Escape key, animation, mobile padding) must be made in each copy.  
**Recommendation:** Create `src/components/Modal.tsx` with props: `title`, `onClose`, `footer`, `children`. Include Escape handler, focus trap, and mobile-safe max-height. All screens migrate to this component.

### 9.3 Shared `<EmptyState>` component
**Problem:** Empty states have inconsistent layout, icon style, and copy across 10+ screens.  
**Recommendation:** Create `src/components/EmptyState.tsx`:
```tsx
<EmptyState icon={FlaskConical} title="No tests yet" description="Log your first well water test to get started." action={{ label: 'Add Test', onClick: () => setShowModal(true) }} />
```

### 9.4 Form validation layer
**Problem:** No screen validates inputs before submission. Users can save blank or nonsensical data.  
**Recommendation:** Adopt a lightweight validation approach (or `react-hook-form`) with a shared `<FieldError>` component. Define a schema per form (similar to the Zod schemas already used in AI extraction) and run validation on submit.

### 9.5 "More" mobile navigation drawer
**Problem:** 6 screens are inaccessible from mobile nav.  
**Recommendation:** Replace the 5th mobile nav slot (currently "AI") with a "More" grid drawer:
- AI Advisory
- Vendors
- Expiry Tracker
- Emergency Card
- Well Tests / Septic / Fuel (grouped as "Systems")
- Settings

### 9.6 First-run onboarding flow
**Problem:** A new user opening the app sees an empty Dashboard with no guidance.  
**Recommendation:** Add a lightweight onboarding checklist (4–5 steps) displayed once on first use:
1. ✅ Sign in with Google (auto-complete)
2. ☐ Set up emergency contacts
3. ☐ Capture your first equipment record
4. ☐ Add an upcoming maintenance task
5. ☐ Set your first expiry reminder

Persist completion state in localStorage. Dismiss after all steps are checked or user clicks "Skip".

### 9.7 Standardized date and number formatting utilities
**Problem:** Dates are formatted with inline `toLocaleDateString()` calls using slightly different options across 10+ screens. Currency formatting is inconsistent (some with cents, some without).  
**Recommendation:** Create `src/utils/format.ts`:
```ts
export const fmtDate   = (d: string | Date) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
export const fmtMonth  = (d: string | Date) => new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
export const fmtCurrency = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
export const fmtCurrencyCents = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
```

### 9.8 Replace hardcoded placeholder data
**Problem:** Dashboard "Recent Activity", AI Advisory responses, and several Dashboard cards contain hardcoded static data that never updates, creating a false impression of functionality.  
**Recommendation:**
- Recent Activity: derive from costStore entries sorted by date descending
- AI Advisory: wire to actual OpenRouter API (or show "Enter your OpenRouter API key to enable AI features" state when key is absent)
- Remove all hardcoded `RECENT_ACTIVITY` arrays; only show real data or a proper empty state

---

## Summary Matrix

| # | Topic | Severity | Effort | Priority |
|---|-------|----------|--------|----------|
| 8.1 | Mobile nav active state | High | XS | P0 |
| 8.2 | Tap target shells | High | S | P0 |
| 3.3 | Mobile nav active state (HashRouter) | High | XS | P0 |
| 5.1 | Required field indicators | High | S | P1 |
| 5.2 | Inline validation feedback | High | M | P1 |
| 8.3 | Maintenance empty tab states | Medium | XS | P1 |
| 8.7 | Escape key in modals | Medium | XS | P1 |
| 4.2 | Dashboard first-run empty state | High | S | P1 |
| 9.2 | Shared Modal component | High | M | P1 |
| 9.7 | Format utilities | Medium | S | P1 |
| 1.1 | Padding standardization | Medium | M | P2 |
| 1.4 | Replace emoji icons | Low | XS | P2 |
| 2.2 | Responsive table stacking | High | M | P2 |
| 2.3 | Mobile chart scroll | Medium | S | P2 |
| 6.1 | Budget progress bar fix | Medium | XS | P2 |
| 6.2 | Single data point chart guard | Medium | XS | P2 |
| 7.2 | Inventory live counts | High | S | P2 |
| 7.6 | Property switch resets forms | High | S | P2 |
| 9.3 | Shared EmptyState component | Medium | S | P2 |
| 9.5 | "More" mobile drawer | High | M | P2 |
| 9.8 | Replace hardcoded placeholder data | Medium | M | P2 |
| 9.1 | Design system tokens | Medium | L | P3 |
| 9.4 | Form validation layer | High | L | P3 |
| 9.6 | First-run onboarding flow | Medium | L | P3 |
| 7.1 | Mark Done → Budget spend | High | S | P3 |
| 7.3 | Vendor ↔ Maintenance link | Low | S | P3 |

---

*This review was generated from a full read of all 17 screen files and 6 component files on the `claude/ecstatic-goodall` branch, April 13 2026.*
