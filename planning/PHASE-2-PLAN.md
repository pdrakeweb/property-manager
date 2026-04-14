# Phase 2 Plan — Intelligence Layer

**Project:** Property Manager PWA  
**Properties:** 2392 Tannerville Rd, Orrville OH · Camp (secondary)  
**Author:** Pete Drake  
**Created:** April 2026  
**Status:** Planning

This document details the features planned for Phase 2. Phase 1 established capture, maintenance tracking, budgeting, AI advisory, and inventory. Phase 2 adds the intelligence and financial depth that makes the system genuinely useful over multiple seasons: seasonal checklists, capital project financials, cross-property situational awareness, photo workflows, generator runtime, road/access logging, permit history, insurance tracking, utility bill tracking, property taxes, and mortgages.

---

## Standard Document Input Pattern

All data entry screens that involve structured documents — utility bills, tax notices, mortgage statements, insurance policy declarations, permit documents — **must** implement three input modes simultaneously on the same form. This is the established pattern from `EquipmentFormScreen.tsx` and applies everywhere in Phase 2 and beyond.

### The Three Modes

**1. Photo capture** — Camera button using `<input type="file" accept="image/*" capture="environment">`. On selection, calls OpenRouter vision extraction, pre-populates form fields with confidence badges.

**2. File upload** — `<input type="file" accept="image/*,application/pdf">` for uploading existing scans or PDFs. Same extraction pipeline as camera capture. For PDFs: attempt text extraction via `pdfjs-dist` first; fall back to vision if the PDF is scanned.

**3. Manual text entry** — All fields are always visible and editable below the capture controls, regardless of AI state. Manual entry is never blocked or hidden.

### UX Specification

```
┌─────────────────────────────────────┐
│  📷 Capture          📄 Upload       │  ← always visible at top
└─────────────────────────────────────┘
  [thumbnail if photo taken]
  ⟳ Extracting…                         ← spinner during AI call
  ✓ Extraction complete — review below  ← success state

  Field Label
  ┌────────────────────────────┐ 🟢    ← green = high confidence (AI-filled)
  │ AI-extracted value         │       ← editable regardless
  └────────────────────────────┘
  Field Label
  ┌────────────────────────────┐ 🟡    ← yellow = medium confidence
  │ AI-extracted value         │
  └────────────────────────────┘
  Field Label
  ┌────────────────────────────┐       ← no badge = user-entered or not extracted
  │                            │
  └────────────────────────────┘
```

Confidence badge colors: green = `high`, yellow = `medium`, red = `low`. Red-confidence fields get a subtle `ring-red-200` highlight prompting the user to verify. AI-filled fields use `ring-sky-200` to distinguish them from manually entered fields (same as `EquipmentFormScreen`).

### Shared Component: `DocumentCaptureCard`

Extract the capture/upload/extraction UI into a reusable component so every data entry screen gets the same UX without duplicating the logic:

```typescript
// src/components/capture/DocumentCaptureCard.tsx

interface ExtractedFields {
  [fieldId: string]: {
    value: string
    confidence: 'high' | 'medium' | 'low'
  }
}

interface DocumentCaptureCardProps {
  onExtracted: (fields: ExtractedFields) => void
  onError: (message: string) => void
  extractFn: (blob: Blob, mimeType: string) => Promise<ExtractedFields>
  label?: string                        // "Photograph or upload document"
  acceptPdf?: boolean                   // default true
  disabled?: boolean
}
```

`extractFn` is injected per screen — each feature provides its own OpenRouter call with its own Zod schema. The card handles: file input refs, thumbnail display, loading state, error state. The parent handles: form fields and the `extractFn` implementation.

Usage in any data entry screen:
```tsx
<DocumentCaptureCard
  extractFn={(blob, mime) => extractUtilityBill(blob, mime, accountHint)}
  onExtracted={fields => applyExtractedFields(fields)}
  onError={msg => setError(msg)}
/>
```

---

## Table of Contents

1. [Seasonal Checklist Engine](#1-seasonal-checklist-engine)
2. [Capital Project Budget vs. Actual](#2-capital-project-budget-vs-actual)
3. [Cross-Property Status Dashboard](#3-cross-property-status-dashboard)
4. [Before/After Photo Workflow](#4-beforeafter-photo-workflow)
5. [Generator Runtime Hour Tracking](#5-generator-runtime-hour-tracking)
6. [Road / Access Maintenance Log](#6-road--access-maintenance-log)
7. [Permit & Inspection History](#7-permit--inspection-history)
8. [Insurance Policy Tracker](#8-insurance-policy-tracker)
9. [PDF Utility Bill Parser & Consumption Tracker](#9-pdf-utility-bill-parser--consumption-tracker)
10. [Property Tax Tracker](#10-property-tax-tracker)
11. [Mortgage Tracker](#11-mortgage-tracker)

---

## 1. Seasonal Checklist Engine

### Goal

Replace one-off reminders with a structured seasonal workflow system. Templates define what needs to happen each season; the engine filters templates against what equipment a property actually has and generates checklist instances that log to maintenance history when completed.

### User Story

> As a property owner who winters away from camp, I want a guided spring-opening checklist that only shows me the items relevant to my equipment so I don't miss anything or waste time reading inapplicable steps.

### Data Model

**Template definition** (static JSON, shipped with the app, forkable):

```typescript
interface ChecklistTemplate {
  id: string
  name: string                          // "Camp Spring Opening"
  trigger: 'spring-open' | 'fall-close' | 'winter-prep' | 'summer-prep' | 'annual'
  propertyTypes: PropertyType[]         // ['camp'] | ['residence'] | ['camp','residence']
  requiresEquipment: string[]           // categoryIds: ['well', 'generator', 'dock']
                                        // empty = always applies
  estimatedMinutes: number
  items: ChecklistItem[]
}

interface ChecklistItem {
  id: string
  order: number
  title: string
  detail?: string                       // expanded instructions
  requiresPhoto: boolean
  requiresNote: boolean
  system?: string                       // categoryId this item relates to
  linkedMaintenanceCategory?: string    // if checked, logs a maintenance event here
}
```

**Checklist instance** (persisted to Drive as JSON, one file per completion):

```typescript
interface ChecklistInstance {
  id: string
  templateId: string
  templateName: string
  propertyId: string
  startedAt: string                     // ISO 8601
  completedAt?: string
  completedBy?: string
  items: ChecklistInstanceItem[]
  driveFileId?: string
}

interface ChecklistInstanceItem {
  itemId: string
  checked: boolean
  checkedAt?: string
  note?: string
  photoFilenames?: string[]
}
```

**Starter templates (ship with app):**

| Template | Trigger | Property Types | Requires Equipment | Items |
|---|---|---|---|---|
| Camp Spring Opening | spring-open | camp | well, generator | 15 |
| Camp Fall Closing | fall-close | camp | well, generator | 12 |
| Farmhouse Winter Prep | winter-prep | residence | generator, well | 10 |
| Generator Annual Service | annual | both | generator | 8 |
| Well Annual Checkup | annual | both | well | 6 |
| Septic Pre-Winter | fall-close | both | septic | 4 |

### Component Breakdown

```
src/
  data/
    checklistTemplates.ts           // static template definitions
  types/
    checklist.ts                    // ChecklistTemplate, ChecklistInstance types
  screens/
    ChecklistScreen.tsx             // list of available + past checklists
    ChecklistRunScreen.tsx          // active checklist step-through UI
    ChecklistTemplateScreen.tsx     // fork + edit a template
  components/
    checklist/
      ChecklistCard.tsx             // template card showing trigger/estimated time
      ChecklistItemRow.tsx          // single step with check, photo, note controls
      ChecklistProgress.tsx         // progress bar + completion summary
  lib/
    checklistEngine.ts              // filter templates against installed equipment
```

### Implementation Notes

**Template filtering in `checklistEngine.ts`:**

```typescript
export function getApplicableTemplates(
  templates: ChecklistTemplate[],
  property: Property,
  installedCategoryIds: string[],   // from EQUIPMENT filtered by propertyId
): ChecklistTemplate[] {
  return templates.filter(t => {
    if (!t.propertyTypes.includes(property.type)) return false
    if (t.requiresEquipment.length === 0) return true
    return t.requiresEquipment.some(req => installedCategoryIds.includes(req))
  })
}
```

**Instance persistence:** On checklist completion, serialize `ChecklistInstance` to JSON, upload to Drive at `{driveRoot}/Checklists/{year}/{templateName}_{date}.json`. Also create a markdown summary file alongside it for human readability.

**Maintenance event logging:** When a `ChecklistItem` with `linkedMaintenanceCategory` is checked, call the same `formatRecord` + DriveClient pipeline used by `EquipmentFormScreen` to create a service record in the appropriate category folder.

**Custom template builder:** Present a form that clones an existing template and allows reordering, editing, and adding items. Store custom templates in `localStorage` under `pm_custom_checklists`. Sync to Drive not required in Phase 2.

**Nav integration:** Add "Checklists" to `NAV_ITEMS` in `AppShell.tsx` with a `ClipboardCheck` icon. Show a badge when a seasonal checklist is due (trigger date within 2 weeks). Trigger date logic: spring = March 15–May 31, fall = Sept 15–Nov 15, winter = Nov 1–Dec 31, summer = May 15–July 15.

### Acceptance Criteria

- [ ] Camp Spring Opening template appears for Camp property, not for Tannerville residence
- [ ] Templates requiring generator only appear when generator is in installed equipment for that property
- [ ] Completing a checklist with 15 items logs one maintenance event per item that has `linkedMaintenanceCategory`
- [ ] Checklist instance JSON is uploaded to Drive on completion
- [ ] Custom template forked from existing template persists across app restarts
- [ ] Nav badge appears when current date is within 2 weeks of trigger window

---

## 2. Capital Project Budget vs. Actual

### Goal

Extend capital planning from a "someday" forecast into an active project ledger. Track spending against budget, log transactions, flag cost overruns, and aggregate capital spend historically.

### User Story

> When I start the roofing project, I want to log the deposit, materials, and labor invoices against the budget estimate so I can see at a glance whether I'm on track — and get warned if I'm going over.

### Data Model

Extend `CapitalItem` with transaction tracking and project status:

```typescript
interface CapitalItem {
  // --- existing ---
  id: string
  propertyId: string
  title: string
  categoryId: string
  installYear?: number
  ageYears?: number
  priority: Priority
  estimatedYear: number
  costLow: number
  costHigh: number
  notes?: string
  source: 'manual' | 'ai-suggested' | 'age-based'

  // --- new in Phase 2 ---
  status: 'planned' | 'in-progress' | 'complete' | 'deferred'
  budgetAmount?: number               // locked-in budget (may differ from estimate range)
  percentComplete?: number            // 0–100
  startDate?: string
  completionDate?: string
  contractor?: string
  transactions: CapitalTransaction[]
  driveDocLinks?: string[]            // links to stored invoices/contracts
}

interface CapitalTransaction {
  id: string
  date: string
  vendor: string
  description: string
  amount: number                      // positive = spend
  invoiceRef?: string
  driveFileId?: string                // linked invoice PDF in Drive
}
```

Add aggregate types for reporting:

```typescript
interface CapitalSpendSummary {
  year: number
  propertyId: string
  categoryId: string
  totalBudgeted: number
  totalActual: number
  projectCount: number
}
```

### Component Breakdown

```
src/
  screens/
    BudgetScreen.tsx                  // extend with project status tabs
    CapitalProjectDetailScreen.tsx    // new: full project view
  components/
    budget/
      ProjectStatusBadge.tsx          // planned/in-progress/complete/deferred
      TransactionLedger.tsx           // sortable table of transactions
      BudgetWaterfallChart.tsx        // budget vs. actual bar using inline SVG
      SpendByYearChart.tsx            // aggregate view
      OverrunAlert.tsx                // inline warning when actual > budget
```

### Implementation Notes

**Budget vs. actual waterfall:** Render inline SVG — no chart library dependency. Two bars per project: budget (gray) and actual (blue, turning red at >100%). Show variance amount and percentage.

**`CapitalProjectDetailScreen`:** Route at `/budget/:projectId`. Sections: header (title, status, progress bar), budget summary card (budgeted/actual/variance/% complete), transaction ledger (add inline), document links, contractor contact.

**Transaction entry:** Inline form at bottom of ledger — date, vendor, description, amount, optional invoice ref. On save, updates `CapitalItem` in state and persists full item JSON to Drive at `{driveRoot}/Budget/{year}/{itemId}.json`.

**Overrun detection:** `actual > budgetAmount * 1.1` (>10% over) triggers `OverrunAlert` banner on detail screen and a yellow badge on the `BudgetScreen` project list.

**Aggregate spend view:** New tab on `BudgetScreen` — "Spend History". Groups completed transactions by year and category. Renders `SpendByYearChart` as horizontal stacked bars by category.

**State management:** `CapitalItem[]` state lifted into `AppStoreContext` alongside `activePropertyId`. CRUD operations dispatch to state + Drive upload.

**Persistence format:** Each `CapitalItem` stored as `{driveRoot}/Budget/{itemId}.json`. On app load, fetch index listing from Drive and hydrate store. Phase 2 can use lazy loading — only fetch detail (transactions) when opening project detail screen.

### Acceptance Criteria

- [ ] Capital project detail screen shows budget vs. actual with correct variance calculation
- [ ] Adding a transaction updates the actual total in real time
- [ ] Projects >10% over budget show overrun alert on detail screen and badge on list
- [ ] Spend History tab correctly aggregates transactions by year and category
- [ ] Project status transitions: planned → in-progress → complete are reflected in BudgetScreen list
- [ ] Transaction data persists to Drive and reloads correctly on next app open

---

## 3. Cross-Property Status Dashboard

### Goal

Replace the current single-property dashboard with a unified view that shows both properties side by side. Useful when planning a camp trip — see at a glance what's due there before driving up.

### User Story

> I'm planning a weekend at camp. I open the app and immediately see: 2 maintenance items due at camp (generator oil, dock check), Tannerville is all clear. I can log a quick maintenance note without first navigating into a property.

### Data Model

No new types. Extend the dashboard with aggregation logic across all properties.

```typescript
interface PropertyHealthSummary {
  propertyId: string
  overdueCount: number
  dueSoonCount: number              // due within 30 days
  activeCapitalProjects: number
  lastVisitDate?: string            // user-logged, stored in localStorage
  haAlertCount: number              // HA entities in warning/alert status
  healthScore: 'green' | 'yellow' | 'red'
}

// Health score algorithm:
// red    = overdueCount >= 4  OR any critical overdue task
// yellow = overdueCount 1–3   OR dueSoonCount >= 5
// green  = overdueCount === 0
```

### Component Breakdown

```
src/
  screens/
    DashboardScreen.tsx               // extend: add cross-property mode toggle
  components/
    dashboard/
      PropertyHealthCard.tsx          // compact card per property with health score
      CrossPropertySummary.tsx        // side-by-side property health row
      QuickLogModal.tsx               // add maintenance log from dashboard
      LastVisitBadge.tsx              // "Last visit: 3 weeks ago" with edit
```

### Implementation Notes

**Dashboard mode toggle:** Two modes controlled by `localStorage` setting `pm_dashboard_mode: 'single' | 'all'`. Default `'all'`. Existing single-property view becomes the "filtered" mode when actively working within one property context.

**`PropertyHealthCard`:** Shows property name, health score color pill, overdue count, due-soon count, active capital projects. Tapping navigates to maintenance screen scoped to that property (sets `activePropertyId` via `AppStoreContext` and navigates to `/maintenance`).

**`QuickLogModal`:** A bottom sheet triggered from the dashboard. Fields: property (dropdown), system category (dropdown populated from that property's installed equipment), description, date (defaults today). On submit: creates a service record via `formatRecord` + DriveClient. No photo support in quick-log — full capture is always available via the Capture screen.

**`LastVisitBadge`:** Stored per property in `localStorage` as `pm_last_visit_{propertyId}`. User manually updates it from the dashboard or it's auto-updated when the user saves a capture or maintenance record for that property.

**HA alerts aggregation:** Count HA entities currently in `warning` or `alert` status per property (using the existing `HA_STATUS` data, extended to include `propertyId`). Show count in `PropertyHealthCard`.

**Mobile layout:** Stack `PropertyHealthCard` vertically on mobile; side-by-side on `lg:` breakpoint.

### Acceptance Criteria

- [ ] Dashboard shows both properties simultaneously when `pm_dashboard_mode === 'all'`
- [ ] Health score pill correctly reflects overdue task counts
- [ ] Tapping a PropertyHealthCard sets active property and navigates to maintenance
- [ ] QuickLogModal creates a service record visible in Maintenance > History for the correct property
- [ ] Last visit date persists and displays correctly for each property
- [ ] Single-property mode still works and shows only active property data

---

## 4. Before/After Photo Workflow

### Goal

When a maintenance task is completed with photos, distinguish between "before" photos (showing the problem) and "after" photos (showing the completed repair). Enable side-by-side comparison in the task history view.

### User Story

> I photographed the cracked pressure tank before replacing it and the new installation after. In the maintenance history for the well, I want to see both photos labeled and compare them — not just a pile of unlabeled images.

### Data Model

No backend changes. Add `role` metadata to photo file naming and to maintenance event JSON:

```typescript
// Extend maintenance event (service record) with photo metadata
interface ServiceRecordPhoto {
  filename: string
  role: 'before' | 'after' | 'general'
  capturedAt: string
  caption?: string
}

// Stored inline in the service record JSON alongside other fields
// Filename convention: {fileStem}_before_01.jpg, {fileStem}_after_01.jpg
```

### Component Breakdown

```
src/
  components/
    photos/
      PhotoRolePicker.tsx             // toggle: Before / After / General
      BeforeAfterComparison.tsx       // side-by-side or swipe slider view
      PhotoGrid.tsx                   // general unlabeled photo grid
  screens/
    MaintenanceScreen.tsx             // extend Mark Done modal with photo role picker
    ServiceRecordDetailScreen.tsx     // new: full history record view with comparison
```

### Implementation Notes

**Photo role assignment:** In the Mark Done modal (added in Phase 1), show photo capture/upload section with `PhotoRolePicker` above each photo slot. Default is `'general'`. The picker is a 3-button toggle — Before / After / General.

**File naming:** Encode role in the filename. `formatFileStem` in `markdownFormatter.ts` already handles the stem; append `_before_{n}` or `_after_{n}` before the extension. Update `formatRecord` to include a `photos` section listing each photo with its role.

**`BeforeAfterComparison`:** Renders as two columns on tablet/desktop (`lg:grid-cols-2`). On mobile, a swipe-toggle slider using CSS transitions (`transform: translateX`). No library required — pure CSS.

**Accessing comparison:** `ServiceRecordDetailScreen` at `/maintenance/record/:recordId`. Link from the maintenance history row (currently shows just the description — add a `>` chevron). Screen parses the markdown record from Drive (or cached local state) and renders the comparison component.

**Graceful degradation:** If a service record has no before/after photos, `BeforeAfterComparison` is not rendered. `PhotoGrid` renders any general photos.

### Acceptance Criteria

- [ ] Mark Done modal shows photo role picker when a photo is attached
- [ ] Role is encoded in Drive filename and in the markdown record `photos` section
- [ ] ServiceRecordDetailScreen renders side-by-side comparison when both before and after photos exist
- [ ] Mobile swipe toggle works between before and after views
- [ ] Records with only general photos show PhotoGrid, no comparison UI

---

## 5. Generator Runtime Hour Tracking

### Goal

Track cumulative generator runtime hours to surface service milestones before they're missed. If the Home Assistant integration is active and a runtime sensor is mapped, pull hours automatically; otherwise, allow manual entry per run.

### User Story

> My generator runs during ice storms — sometimes for 10 hours, sometimes 30. I need to know when I'm approaching the 100-hour oil change milestone so I can schedule service before the next storm season.

### Data Model

Extend the generator equipment record with runtime tracking:

```typescript
interface GeneratorRuntimeEntry {
  id: string
  date: string
  hours: number
  reason?: string                     // "Ice storm 2026-01-17", "Annual load test"
  source: 'manual' | 'ha-sensor' | 'service-reset'
}

interface GeneratorEquipmentRecord extends EquipmentRecord {
  runtimeEntries: GeneratorRuntimeEntry[]
  lastServiceHours: number            // cumulative hours at last oil change
  cumulativeHours: number             // computed: sum of all entries
}

// Service milestones (configurable, defaults shown)
const GENERATOR_MILESTONES = [
  { label: 'Oil Change',         intervalHours: 100 },
  { label: 'Spark Plugs',        intervalHours: 200 },
  { label: 'Air Filter',         intervalHours: 200 },
  { label: 'Full Annual Service',intervalHours: 500 },
]
```

### Component Breakdown

```
src/
  components/
    generator/
      RuntimeMilestoneBar.tsx         // progress bar: hours since last service / interval
      RuntimeLogEntry.tsx             // single entry row with date, hours, reason
      RuntimeEntryForm.tsx            // add manual runtime entry
      HaSyncBadge.tsx                 // "Synced from HA" indicator
  screens/
    EquipmentDetailScreen.tsx         // new: equipment detail (generalizes beyond generator)
```

### Implementation Notes

**`RuntimeMilestoneBar`:** Renders a labeled progress bar for each milestone. `progress = (cumulativeHours - lastServiceHours) % intervalHours`. Color: green < 60%, yellow 60–80%, red > 80%. Clicking a milestone bar opens a "Mark Serviced" dialog that creates a `GeneratorRuntimeEntry` with `source: 'service-reset'` and resets `lastServiceHours`.

**HA integration path:** In Settings > Home Assistant > Entity Mapping, user maps a HA sensor entity (e.g., `sensor.generator_runtime_hours`) to the generator equipment record. On each app load and on manual sync, call `GET /api/states/{entityId}` via the existing HA connection and diff against the stored value to create a new `GeneratorRuntimeEntry` with `source: 'ha-sensor'`.

**Persistence:** Append runtime entries to the generator equipment record JSON in Drive. Load on demand when opening the equipment detail screen.

**Alert at 80%:** When `(cumulativeHours - lastServiceHours) / intervalHours >= 0.8`, add a maintenance task with priority `high` and title `"Generator — {milestone} due in {n} hours"` to the maintenance list. This is a computed/ephemeral task, not stored to Drive.

**`EquipmentDetailScreen`:** Route at `/inventory/:equipmentId`. Shows equipment specs, runtime tracking (for generator), photo gallery, and linked service records. This screen generalizes — Phase 2 builds it for generator; future phases fill out other categories.

### Acceptance Criteria

- [ ] Manual runtime entry adds to cumulative hours total
- [ ] Milestone progress bars reflect hours since last service reset correctly
- [ ] Bar turns red when hours are within 20% of milestone interval
- [ ] "Mark Serviced" resets the milestone progress and creates a service record
- [ ] When HA entity is mapped and connected, runtime hours update on app load
- [ ] Alert maintenance task appears in list when 80% threshold is crossed

---

## 6. Road / Access Maintenance Log

### Goal

Add a dedicated category for road and access infrastructure. Gravel roads, culverts, and seasonal plowing are high-cost, high-frequency items at both properties that currently fall through the cracks of the equipment-focused model.

### User Story

> I had 12 tons of limestone delivered and a culvert cleaned in the same week. I want both logged in one place with quantities, vendor, and cost — and to be able to see total road spend per year when budgeting for gravel.

### Data Model

New equipment category `access_roads` with specialized maintenance event fields:

```typescript
// New category definition (add to CATEGORIES)
{
  id: 'access_roads',
  label: 'Access / Roads',
  icon: '🚧',
  description: 'Driveway, gravel roads, culverts, gates',
  propertyTypes: ['residence', 'camp', 'land'],
  allowMultiple: false,
  hasAIExtraction: false,
}

// Predefined maintenance types for this category
const ROAD_MAINTENANCE_TYPES = [
  { id: 'gravel_delivery',       label: 'Gravel Delivery',       hasQuantity: true,  unit: 'tons'  },
  { id: 'culvert_cleaning',      label: 'Culvert Cleaning',       hasQuantity: false              },
  { id: 'plowing_service',       label: 'Plowing Service',        hasQuantity: false              },
  { id: 'washout_repair',        label: 'Washout Repair',         hasQuantity: false              },
  { id: 'vegetation_control',    label: 'Vegetation Control',     hasQuantity: true,  unit: 'yards'},
  { id: 'gate_maintenance',      label: 'Gate / Entrance',        hasQuantity: false              },
]

// Extend maintenance event / service record for road-specific fields
interface RoadMaintenanceEvent extends ServiceRecord {
  maintenanceType: string             // one of ROAD_MAINTENANCE_TYPES[].id
  quantity?: number
  unit?: string                       // 'tons' | 'yards'
  areaDescription?: string            // "lower lane, first 400ft"
  vendor: string
}
```

### Component Breakdown

```
src/
  data/
    roadMaintenanceTypes.ts           // ROAD_MAINTENANCE_TYPES constant
  components/
    road/
      RoadEventForm.tsx               // maintenance type picker + quantity fields
      RoadSpendSummary.tsx            // total by type + year, used in budget view
  screens/
    MaintenanceScreen.tsx             // extend to render RoadEventForm for access_roads category
```

### Implementation Notes

**Category fields in `categories.ts`:** The `access_roads` category uses no AI extraction. Its `CATEGORY_FIELDS` entry should include: `maintenance_type` (select from `ROAD_MAINTENANCE_TYPES`), `vendor`, `quantity` (number, conditional), `unit` (auto-populated from type), `area_description` (text), `cost`, `date`, `notes`.

**`RoadEventForm`:** Selecting a maintenance type in the form auto-shows or hides the quantity/unit row. When `maintenanceType = 'gravel_delivery'`, quantity is required. Rendered as a specialized section within `EquipmentFormScreen` when `categoryId === 'access_roads'`.

**Spend summary integration:** `RoadSpendSummary` component included on the Capital Watch / Budget screen as a card below the main capital items. Groups road service records by `maintenanceType` and year. Shows cumulative tons of gravel delivered (useful for tracking road degradation rate).

**Maintenance task generation:** Add a suggested annual task for culvert inspection (annual trigger, medium priority) when `access_roads` equipment is present at a property.

### Acceptance Criteria

- [ ] `access_roads` category appears in Capture and Inventory screens for all property types
- [ ] Selecting "Gravel Delivery" as maintenance type shows quantity/unit fields
- [ ] Quantity and unit are stored in the service record and displayed in Maintenance > History
- [ ] Road Spend Summary on Budget screen correctly totals by type and year
- [ ] Annual culvert inspection task is auto-generated when access_roads equipment is present

---

## 7. Permit & Inspection History

### Goal

Create a searchable record of all permits, inspections, and regulatory filings across both properties. Many permits have expiration dates; the system should surface upcoming expirations as alerts.

### User Story

> My contractor asked for the septic installation permit from 2011. I found it in 30 seconds by searching the app. The PDF was right there, stored in Drive.

### Data Model

New top-level collection `permits` per property:

```typescript
type PermitStatus = 'active' | 'expired' | 'pending' | 'closed'
type PermitType =
  | 'building'
  | 'septic'
  | 'well'
  | 'electrical'
  | 'plumbing'
  | 'zoning'
  | 'environmental'
  | 'cauv'
  | 'other'

interface Permit {
  id: string
  propertyId: string
  type: PermitType
  description: string                 // "Septic System Installation"
  issuingAuthority: string            // "Wayne County Health Dept"
  permitNumber: string
  issuedDate: string
  expirationDate?: string
  status: PermitStatus
  inspector?: string
  inspectionResult?: 'pass' | 'fail' | 'conditional'
  linkedCapitalItemId?: string        // link to Capital Watch project
  driveFileId?: string                // permit PDF in Drive
  notes?: string
}
```

### Component Breakdown

```
src/
  types/
    permits.ts
  screens/
    PermitsScreen.tsx                 // list with search/filter + add button
    PermitDetailScreen.tsx            // full record with linked project + PDF
  components/
    permits/
      PermitCard.tsx                  // compact card with status badge + expiry
      PermitForm.tsx                  // add/edit form with DocumentCaptureCard at top
      ExpiryAlert.tsx                 // inline warning for expiring permits
    capture/
      DocumentCaptureCard.tsx         // shared — see Standard Document Input Pattern
```

### Implementation Notes

**Input pattern:** `PermitForm` uses `DocumentCaptureCard` at the top. The user photographs the permit document or uploads a scan/PDF. The `extractFn` for permits targets these fields from the document image:

```typescript
const PermitExtractionSchema = z.object({
  permitNumber:     z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }),
  issuingAuthority: z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }),
  type:             z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }),
  description:      z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }),
  issuedDate:       z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }),
  expirationDate:   z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }),
})
```

All fields remain manually editable below the capture card per the standard pattern. A user without a scan can still fill in everything by hand.

**Routes:** Add `/permits` to `App.tsx` routes and `NAV_ITEMS`. Consider grouping under a "Documents" nav item in Phase 2 (Permits + Insurance sharing a nav slot to avoid nav overcrowding).

**Expiry alerting:** On app load, compute permits expiring within 90 days. Surface as banner on `PermitsScreen` and as items in the cross-property dashboard alert count. Severity: red if expired, orange if expiring within 30 days, yellow if within 90 days.

**Drive storage:** Permit records as JSON at `{driveRoot}/Permits/{permitId}.json`. PDF uploads use `DriveClient.uploadFile` to `{driveRoot}/Permits/` and store the returned `driveFileId`. The uploaded document is separate from the JSON record — `driveFileId` links them.

**Search:** Client-side filter on `description`, `permitNumber`, `issuingAuthority`, `type`. Filter chips for `type` and `status`. Sort by `issuedDate` descending (most recent first).

**Link to Capital Watch:** When `linkedCapitalItemId` is set, `PermitDetailScreen` shows a card linking to the associated capital project. Reciprocally, `CapitalProjectDetailScreen` shows any linked permits.

### Acceptance Criteria

- [ ] Permit form shows Capture and Upload buttons at the top per the standard pattern
- [ ] Photographing or uploading a permit document populates fields with confidence badges
- [ ] All fields remain editable regardless of AI extraction state
- [ ] PDF upload stores file in Drive and links from permit record
- [ ] Search filters permits by description, number, authority, and type
- [ ] Permits expiring within 90 days surface as alerts on PermitsScreen
- [ ] Expired permits show red status badge
- [ ] Linking a permit to a Capital Watch project creates reciprocal links in both detail views

---

## 8. Insurance Policy Tracker

### Goal

Maintain a complete insurance record for both properties in one place. Surface coverage gaps, track renewal dates, and provide quick access to agent contacts for emergency situations.

### User Story

> During a hailstorm, I needed my homeowners policy number in 30 seconds. I also wanted to know whether I had equipment breakdown coverage before calling about the generator. The app had both.

### Data Model

New `policies` collection per property:

```typescript
type PolicyType = 'homeowners' | 'farm' | 'umbrella' | 'flood' | 'auto' | 'equipment' | 'other'

interface CoverageAmounts {
  dwelling?: number
  otherStructures?: number
  personalProperty?: number
  liability?: number
  medicalPayments?: number
  deductible?: number
}

interface InsurancePolicy {
  id: string
  propertyId: string
  type: PolicyType
  insurer: string
  policyNumber: string
  coverageAmounts: CoverageAmounts
  annualPremium?: number
  effectiveDate: string
  renewalDate: string
  agent?: {
    name: string
    phone: string
    email?: string
    agency?: string
  }
  driveFileId?: string                // policy PDF
  notes?: string
}

// Coverage gap analysis
const COVERAGE_CHECKLIST = [
  { id: 'flood',             label: 'Flood Insurance',            requiredFor: ['residence'] },
  { id: 'equipment_breakdown', label: 'Equipment Breakdown',      requiredFor: ['residence'] },
  { id: 'umbrella',          label: 'Umbrella / Excess Liability', requiredFor: ['residence', 'camp'] },
  { id: 'farm_structures',   label: 'Farm / Outbuilding Coverage', requiredFor: ['residence'] },
]
```

### Component Breakdown

```
src/
  types/
    insurance.ts
  screens/
    InsuranceScreen.tsx               // list of policies + coverage gap checklist
    PolicyDetailScreen.tsx            // full policy with agent contact + PDF link
  components/
    insurance/
      PolicyCard.tsx                  // compact card with insurer, type, renewal date
      PolicyForm.tsx                  // add/edit form with DocumentCaptureCard at top
      CoverageGapChecklist.tsx        // which coverage types are present/missing
      RenewalAlert.tsx                // alert for policies renewing within 30 days
      AgentContactCard.tsx            // name, phone, email with tap-to-call
    capture/
      DocumentCaptureCard.tsx         // shared — see Standard Document Input Pattern
```

### Implementation Notes

**Input pattern:** `PolicyForm` uses `DocumentCaptureCard` at the top. The user photographs the declarations page (the one-page summary that insurers send at renewal — it has everything). The `extractFn` targets:

```typescript
const PolicyExtractionSchema = z.object({
  insurer:       z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }),
  policyNumber:  z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }),
  policyType:    z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }),
  effectiveDate: z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }),
  renewalDate:   z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }),
  annualPremium: z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }),
  dwelling:      z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }).optional(),
  liability:     z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }).optional(),
  deductible:    z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }).optional(),
  agentName:     z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }).optional(),
  agentPhone:    z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }).optional(),
})
```

All fields remain manually editable below. A user can also just scan the declarations page at renewal time each year to update values — the capture flow is fast enough to make annual updates practical.

**Routes:** `/insurance` as a standalone screen, or co-located with Permits under a `/documents` parent route with sub-tabs.

**Coverage gap analysis in `CoverageGapChecklist`:** For each item in `COVERAGE_CHECKLIST`, check whether any active policy of the matching type exists for the current property. Render green check or red X. Clicking an X launches `PolicyForm` pre-filled with that policy type.

**Renewal alerting:** Policies renewing within 30 days surface as alerts. Computed on mount. Surface on `InsuranceScreen` and on the cross-property dashboard (adds to health score factors — a lapsing policy = yellow health).

**Agent contact card:** Phone and email rendered as `<a href="tel:...">` and `<a href="mailto:...">` for direct mobile action. Critical for the "hailstorm" scenario.

**Drive storage:** Policy JSON at `{driveRoot}/Insurance/{policyId}.json`. PDF at `{driveRoot}/Insurance/` with `driveFileId` stored in record.

**Emergency card concept (Phase 2 stretch):** A read-only single-page view of all active policies with agent contacts, formatted for quick scanning. Accessible from the main menu without navigating into a specific property context.

### Acceptance Criteria

- [ ] Policy form shows Capture and Upload buttons at the top per the standard pattern
- [ ] Photographing a declarations page populates insurer, policy number, dates, premium, and coverage amounts with confidence badges
- [ ] All fields remain editable regardless of AI extraction state
- [ ] PDF upload links policy to Drive document
- [ ] Coverage gap checklist correctly identifies missing coverage types for property type
- [ ] Policies renewing within 30 days show renewal alert on InsuranceScreen
- [ ] Agent phone and email render as tap-to-call / tap-to-email links on mobile
- [ ] Policies contribute to property health score (lapsing policy = yellow)

---

## 9. PDF Utility Bill Parser & Consumption Tracker

### Goal

Turn monthly utility bills into a structured time-series database. User uploads a PDF bill; AI vision extracts the key numbers; consumption and cost are plotted over time. Replaces the spreadsheet that doesn't exist yet for tracking whether electric usage is trending up after installing the new heat pump.

### User Story

> I upload my January electric bill. The app reads: 1,847 kWh, $187.42, billing period Dec 15 – Jan 14, rate $0.101/kWh. It plots this against the last 12 months and I see usage is 23% higher than last January — right after the heat pump install. I can investigate whether that's expected or a problem.

### Data Model

```typescript
type UtilityType = 'electric' | 'natural_gas' | 'water' | 'propane' | 'sewer' | 'other'
type ConsumptionUnit = 'kWh' | 'therms' | 'CCF' | 'gallons' | 'MCF' | 'other'

interface UtilityAccount {
  id: string
  propertyId: string
  utilityType: UtilityType
  provider: string                    // "AEP Ohio", "Aqua Ohio"
  accountNumber?: string
  serviceAddress?: string
  notes?: string
}

interface UtilityBill {
  id: string
  accountId: string
  propertyId: string
  periodStart: string                 // ISO date
  periodEnd: string                   // ISO date
  consumption: number
  consumptionUnit: ConsumptionUnit
  totalCost: number
  ratePerUnit?: number
  demandCharge?: number               // commercial/farm accounts
  taxes?: number
  fees?: number
  rawTranscript?: string              // full extracted text from PDF
  driveFileId?: string                // original PDF in Drive
  aiExtracted: boolean
  uploadedAt: string
}

// Zod schema for AI extraction
const UtilityBillSchema = z.object({
  utilityType:      z.enum(['electric', 'natural_gas', 'water', 'propane', 'sewer', 'other']),
  accountNumber:    z.string().optional(),
  serviceAddress:   z.string().optional(),
  periodStart:      z.string(),       // ISO date
  periodEnd:        z.string(),
  consumption:      z.number(),
  consumptionUnit:  z.string(),
  totalCost:        z.number(),
  ratePerUnit:      z.number().optional(),
  demandCharge:     z.number().optional(),
  taxes:            z.number().optional(),
  fees:             z.number().optional(),
  rawText:          z.string(),
})
```

### Component Breakdown

```
src/
  types/
    utilities.ts
  screens/
    UtilitiesScreen.tsx               // per-account view with bill entry + chart
    UtilityAccountListScreen.tsx      // all accounts across both properties
  components/
    utilities/
      UtilityConsumptionChart.tsx     // monthly bar/line chart, 12-month rolling window
      YearOverYearChart.tsx           // current month vs. same month last year comparison
      UtilityBillRow.tsx              // bill ledger entry: period, usage, cost
      UtilityDashboardWidget.tsx      // current month vs. LY for dashboard
      UtilityAccountForm.tsx          // add/edit account (provider, type, account#)
    capture/
      DocumentCaptureCard.tsx         // shared — see Standard Document Input Pattern
```

### Implementation Notes

**Input pattern:** Bill entry uses `DocumentCaptureCard` at the top of the add-bill form. "📷 Capture" (phone camera on a paper bill) and "📄 Upload" (PDF from email) both feed the same extraction pipeline. Manual fields below are always editable — the user can skip capture entirely and type the numbers in directly.

**PDF → image → AI:** For extraction, convert the first page of the PDF to a base64 image before sending to OpenRouter. Two approaches:
1. Use `pdf.js` (`pdfjs-dist`) to render the first PDF page to a canvas, then `canvas.toDataURL('image/jpeg')`. This works entirely in-browser with no server required.
2. If the PDF is text-based (not scanned), extract text directly via `pdfjs-dist` page text content and send as text input to Claude rather than a vision call. More reliable and cheaper.

**Preferred strategy:** Attempt text extraction first; if extracted text is empty or < 100 chars (scanned bill), fall back to vision call. This handles both digital PDFs (most common) and scanned paper bills.

**OpenRouter call for structured extraction:**
```typescript
async function extractUtilityBill(
  pdfTextOrBase64: string,
  isImage: boolean,
  accountHint?: { utilityType: UtilityType; provider: string },
): Promise<z.infer<typeof UtilityBillSchema>>
```
Use `google/gemini-flash-1.5` for this task — fast, cheap, capable of reading utility bill formats. Include account hint in the prompt to help resolve ambiguous consumption units.

**`UtilityConsumptionChart`:** 12-month rolling window of monthly consumption bars plus a cost line overlay (dual-axis). Use inline SVG — sufficient for this chart type without pulling in recharts. Y-axis: consumption units on left, cost ($) on right. Bars colored by utility type (blue=electric, orange=gas, teal=water).

**Year-over-year comparison:** For each month with data, compute `(current - previousYear) / previousYear * 100` delta percentage. Render as a table row or inline delta badge on each bar. Highlight increases >15% in amber, >30% in red.

**`UtilityDashboardWidget`:** Compact card on the cross-property dashboard showing current billing period consumption vs. same period last year for the primary utility type (usually electric). Shows delta % with up/down arrow.

**Drive storage:** Original PDF at `{driveRoot}/Utilities/{utilityType}/{YYYY-MM}_{provider}.pdf`. Extracted bill record as JSON at `{driveRoot}/Utilities/{utilityType}/{YYYY-MM}.json`. Account definitions in `{driveRoot}/Utilities/accounts.json`.

**Multiple accounts per property:** Wayne County electric (AEP), natural gas (Dominion/Columbia Gas), propane delivery (Ferrellgas), water (potentially municipal). Each is a separate `UtilityAccount`. The `UtilitiesScreen` has tabs or a picker per account.

### Acceptance Criteria

- [ ] PDF upload triggers AI extraction and fills all available fields
- [ ] Extraction works for both text-PDF and scanned bills (two code paths)
- [ ] Consumption chart renders correctly with 12 months of rolling data
- [ ] Year-over-year delta highlighted with correct color when >15% or >30%
- [ ] Dashboard widget shows current month vs. LY for the active property
- [ ] Original PDF stored in Drive alongside extracted JSON record
- [ ] Multiple accounts per property supported with per-account navigation
- [ ] Extraction failure shows manual entry form pre-filled with any partial data

---

## 10. Property Tax Tracker

### Goal

Maintain a complete record of assessed valuations and tax payment history per property. Wayne County OH bills semi-annually. The app tracks installments, flags overdue payments, and surfaces assessment trends to inform capital planning decisions (a big assessment jump changes the cash flow math).

### User Story

> I'm planning a major renovation. I want to know what the assessed value was in each of the last five years and how much tax I paid. I also want a reminder before each February 10 and July 10 installment is due — and a flag if I miss one.

### Data Model

```typescript
interface PropertyTaxRecord {
  id: string
  propertyId: string
  year: number                        // tax year (assessment year)
  parcelNumber: string                // Wayne County parcel ID
  assessedLandValue: number
  assessedImprovementValue: number
  assessedTotalValue: number          // land + improvement
  marketValue?: number                // county's estimated market value (may differ from assessed)
  taxRate?: number                    // mills (Wayne County rate)
  annualTaxBill?: number              // total annual tax obligation
  notes?: string
}

interface TaxPayment {
  id: string
  propertyId: string
  year: number                        // tax year being paid (may differ from payment year)
  installment: 1 | 2                  // Wayne County OH: 1=Feb 10, 2=Jul 10
  dueDate: string
  paidDate?: string                   // null = unpaid
  amount: number
  penalty?: number                    // late payment penalty
  parcelNumber: string
  receiptReference?: string
  driveFileId?: string                // receipt or payment confirmation PDF
}
```

### Component Breakdown

```
src/
  types/
    taxes.ts
  screens/
    TaxScreen.tsx                     // assessment history + payment ledger
  components/
    taxes/
      AssessmentHistoryTable.tsx      // year-by-year assessed values with YoY delta
      TaxPaymentLedger.tsx            // installment ledger with paid/due/overdue status
      TaxInstallmentCard.tsx          // upcoming payment alert card
      CountyAuditorLinkHelper.tsx     // side-by-side workflow helper
      AssessmentTrendChart.tsx        // assessed value trend over years (inline SVG)
    capture/
      DocumentCaptureCard.tsx         // shared — see Standard Document Input Pattern
```

### Implementation Notes

**Input pattern:** Both the assessment entry form and the payment entry form use `DocumentCaptureCard` at the top. Wayne County mails paper notices for both assessment changes and tax bills — photographing the notice is the fastest path to entry.

For assessment notices, the `extractFn` targets:
```typescript
const TaxAssessmentExtractionSchema = z.object({
  year:                        z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }),
  parcelNumber:                z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }),
  assessedLandValue:           z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }),
  assessedImprovementValue:    z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }),
  assessedTotalValue:          z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }),
  marketValue:                 z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }).optional(),
  annualTaxBill:               z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }).optional(),
})
```

For tax payment receipts, the `extractFn` targets `year`, `installment` (1 or 2), `amount`, `dueDate`, `paidDate`, and `parcelNumber`.

**County auditor side-by-side workflow:** As a complement to photo capture (for when the user doesn't have the paper notice handy):

1. "Sync from County" button opens the Wayne County Auditor parcel search (`auditor.waynecountyohio.gov`) in a new tab alongside the app
2. App shows a split-panel helper on desktop: left = county auditor web page (iFrame if CORS allows, otherwise just a launch button), right = the app's data entry form pre-filled with the parcel number
3. User reads values off the auditor page and types them in. This is faster than manual entry from scratch and handles both properties in one workflow

**Parcel number storage:** Store per-property in `Property.parcelNumber` field (add to `Property` type). The parcel number is the primary key for county auditor lookups.

**Wayne County installment schedule:** Hard-code the Ohio semi-annual schedule: installment 1 due February 10, installment 2 due July 10 of the following year. Generate upcoming due dates automatically from the year's `annualTaxBill` / 2.

**Overdue detection:** `paidDate === undefined && new Date() > new Date(dueDate)`. Surface as a red badge on `TaxScreen` and in the cross-property dashboard alert counts.

**Dashboard integration:** `TaxInstallmentCard` on the dashboard 30 days before each due date. Tapping navigates to `TaxScreen` for the relevant property.

**`AssessmentHistoryTable`:** Columns: Year, Land Value, Improvement Value, Total Assessed, Market Value, Delta (YoY change in total assessed, shown as $ and %). Highlight years where total assessment increased >10% in amber.

**Drive storage:** `{driveRoot}/Taxes/{year}_assessment.json` and `{driveRoot}/Taxes/{year}_payments.json`. Load all on `TaxScreen` mount.

### Acceptance Criteria

- [ ] Assessment form shows Capture and Upload buttons per the standard pattern
- [ ] Photographing a county assessment notice populates assessed values and parcel number with confidence badges
- [ ] All fields remain editable regardless of AI extraction state
- [ ] Assessment record can be entered for any year with all value fields
- [ ] "Sync from County" launches correct Wayne County Auditor URL for the property's parcel number
- [ ] Tax installment schedule auto-generates Feb 10 / Jul 10 due dates from annual bill
- [ ] Overdue installment (past due, no paid date) shows red flag on TaxScreen
- [ ] Dashboard alert appears 30 days before each installment due date
- [ ] Assessment history table shows YoY delta for all years with data
- [ ] Records persist to Drive and reload correctly

---

## 11. Mortgage Tracker

### Goal

Track active mortgages per property — current balance, payment history, and payoff trajectory. The extra-payment simulator answers the most common mortgage question: "What does one extra payment per year actually do?" Equity tracking across both properties gives a real net-worth snapshot.

### User Story

> I refinanced in 2022 to a 15-year at 3.125%. I want to see exactly where I am in the amortization, what my current principal balance is, and what happens to my payoff date if I put my bonus toward the mortgage instead of the renovation. The app shows me the tradeoff in 10 seconds.

### Data Model

```typescript
interface Mortgage {
  id: string
  propertyId: string
  lender: string
  accountNumber?: string
  originalBalance: number
  interestRate: number                // decimal (e.g., 0.03125 for 3.125%)
  termMonths: number                  // 180 = 15yr, 360 = 30yr
  startDate: string                   // first payment date
  monthlyPayment: number              // P+I only
  escrowAmount?: number               // taxes + insurance portion
  currentBalance?: number             // user-entered; overrides amortization if set
  type: 'conventional' | 'fha' | 'va' | 'heloc' | 'other'
  status: 'active' | 'paid-off' | 'sold'
  notes?: string
}

interface MortgagePayment {
  id: string
  mortgageId: string
  date: string
  totalAmount: number
  principal: number
  interest: number
  escrow?: number
  extraPrincipal?: number             // additional principal beyond scheduled payment
  balance: number                     // remaining balance after this payment
  notes?: string
}
```

### Component Breakdown

```
src/
  types/
    mortgage.ts
  lib/
    amortization.ts                   // pure functions: generate schedule, compute payoff
  screens/
    MortgageScreen.tsx                // mortgage list + equity summary
    MortgageDetailScreen.tsx          // detail: schedule, payment ledger, simulator
  components/
    mortgage/
      MortgageCard.tsx                // compact: balance, rate, payoff date
      AmortizationTable.tsx           // full schedule with principal/interest split
      PaymentLedger.tsx               // actual vs. scheduled payment history
      ExtraPaymentSimulator.tsx       // slider: extra $/mo → new payoff date + interest saved
      EquitySummaryCard.tsx           // market value minus balance = equity, across all properties
      PayoffProgressBar.tsx           // % paid down with payoff date
    capture/
      DocumentCaptureCard.tsx         // shared — see Standard Document Input Pattern
```

### Implementation Notes

**Input pattern:** Both the initial mortgage setup form and the monthly statement entry form use `DocumentCaptureCard`. Lenders send paper statements (or PDF emails) monthly with the current balance, payment breakdown, and escrow detail. Photographing the statement is the fast path to keeping the ledger current.

For the mortgage setup form, the `extractFn` targets:
```typescript
const MortgageSetupExtractionSchema = z.object({
  lender:          z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }),
  accountNumber:   z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }),
  originalBalance: z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }),
  interestRate:    z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }),
  termMonths:      z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }),
  startDate:       z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }),
  monthlyPayment:  z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }),
  escrowAmount:    z.object({ value: z.string(), confidence: z.enum(['high','medium','low']) }).optional(),
})
```

For monthly statement entry, the `extractFn` targets `currentBalance`, `principal`, `interest`, `escrow`, `paidDate`, and `nextPaymentDue`.

All fields always editable below the capture card.

**`amortization.ts` — pure client-side calculation:**

```typescript
interface ScheduledPayment {
  paymentNumber: number
  date: string
  payment: number
  principal: number
  interest: number
  balance: number
}

export function generateAmortizationSchedule(
  principal: number,
  annualRate: number,
  termMonths: number,
  startDate: Date,
  extraMonthlyPrincipal = 0,
): ScheduledPayment[]

export function computePayoffDate(
  currentBalance: number,
  annualRate: number,
  monthlyPayment: number,
  extraMonthlyPrincipal = 0,
): Date

export function totalInterestSaved(
  baseSchedule: ScheduledPayment[],
  acceleratedSchedule: ScheduledPayment[],
): number
```

All pure functions — no state, no side effects. The amortization algorithm: `monthlyRate = annualRate / 12`, each period `interest = balance * monthlyRate`, `principal = payment - interest + extraPrincipal`.

**`ExtraPaymentSimulator`:** A range slider (`<input type="range">`) from $0 to $2,000 extra/month. As the slider moves, recompute `computePayoffDate` and `totalInterestSaved` in real time (no debounce needed — pure JS is fast enough). Display: "Paying $500 extra/month saves $34,210 in interest and pays off in June 2034 instead of March 2041."

**Balance tracking:** User can either: (a) log individual payments (accurate but tedious), or (b) enter the current balance manually once and let the app project forward from the amortization schedule. Option (b) is the practical choice for most users. The `currentBalance` override on `Mortgage` supports this.

**`AmortizationTable`:** Full schedule can be 180–360 rows. Virtualize with a windowed list (use `react-window` or a simple CSS clamp with "Show all" toggle). Show the current payment highlighted. Scroll-to-current on mount.

**HELOC handling:** HELOC uses `type: 'heloc'`. Rate may be variable — store current rate, allow user to update it. No amortization schedule for HELOC (draw/repay is irregular); show payment ledger only with running balance.

**Equity summary:** `equity = marketValue - currentBalance`. `marketValue` comes from either the user-entered value on `Property` or from the most recent `PropertyTaxRecord.marketValue` (whichever is newer). Sum across all active mortgages and properties. Show on the cross-property dashboard as "Total Equity: $XXX,XXX".

**Drive storage:** Mortgage definitions at `{driveRoot}/Financial/mortgages.json`. Payment ledger at `{driveRoot}/Financial/mortgage_{id}_payments.json`.

### Acceptance Criteria

- [ ] Mortgage setup form shows Capture and Upload buttons per the standard pattern
- [ ] Photographing a mortgage statement or closing disclosure populates loan fields with confidence badges
- [ ] Monthly statement capture extracts current balance, payment breakdown, and escrow with confidence badges
- [ ] All fields remain editable regardless of AI extraction state
- [ ] Mortgage can be entered with all fields; amortization schedule generates immediately
- [ ] Amortization schedule shows correct principal/interest split for every payment
- [ ] Extra payment simulator re-computes payoff date and interest saved as slider moves
- [ ] Payment ledger shows actual vs. scheduled amounts with variance
- [ ] HELOC type shows payment ledger only (no amortization schedule)
- [ ] Equity summary on dashboard reflects current balance and market value for all properties
- [ ] Balance override allows manual correction without deleting payment history
