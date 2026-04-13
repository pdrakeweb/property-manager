# Phase 3 Plan — Differentiation

**Project:** Property Manager PWA  
**Properties:** 2392 Tannerville Rd, Orrville OH · Camp (secondary)  
**Author:** Pete Drake  
**Created:** April 2026  
**Status:** Planning

Phase 3 builds on the Phase 1 foundation and Phase 2 intelligence layer to deliver the features that make this app genuinely differentiated from anything commercially available for property owners: deep Home Assistant telemetry, AI-powered condition assessment, guided seasonal workflows with PDF reports, full-text Drive search, predictive failure analysis, a professional property disclosure document generator, and hands-free voice logging.

Each of these is technically ambitious relative to a simple CRUD app. This plan documents what makes each one hard, how to do it right in the React/TS/Vite/Drive/OpenRouter stack, and exactly what "done" looks like.

---

## Table of Contents

1. [Home Assistant Deep Integration](#1-home-assistant-deep-integration)
2. [Computer Vision Condition Assessment](#2-computer-vision-condition-assessment)
3. [Camp Closing Mode — Guided Seasonal Workflow](#3-camp-closing-mode--guided-seasonal-workflow)
4. [Full-Text Search](#4-full-text-search)
5. [Predictive Failure Engine](#5-predictive-failure-engine)
6. [The Home Book Export](#6-the-home-book-export)
7. [Voice Memo Logging](#7-voice-memo-logging)
8. [Home Contents Inventory (Insurance-Grade)](#8-home-contents-inventory-insurance-grade)

---

## 1. Home Assistant Deep Integration

### Goal

Elevate the HA integration from a settings-screen connection test into a live telemetry layer. Equipment detail screens show real-time sensor readings in context. Alert rules defined in-app fire maintenance tasks when thresholds are crossed. Historical charts use HA's history API. Offline: last-known values cached in the service worker.

### User Story

> I open the well system detail screen and see live pressure (42 PSI, green), runtime today (12 minutes), and a 7-day pressure chart. I notice pressure has been trending low over the past week. I tap "Create Task" and a maintenance task is pre-filled: "Well pressure declining — inspect pressure tank."

### Data Model

```typescript
// Entity mapping stored in localStorage / settings
interface HaEntityMapping {
  entityId: string                    // "sensor.farmhouse_well_pressure"
  propertyId: string
  equipmentId?: string                // links to EquipmentRecord.id
  categoryId: string                  // "well"
  metricLabel: string                 // "Supply Pressure"
  unit?: string                       // "PSI"
  alertRules: HaAlertRule[]
}

interface HaAlertRule {
  id: string
  condition: 'above' | 'below' | 'equals'
  threshold: number
  severity: 'info' | 'warning' | 'critical'
  message: string                     // "Well pressure below normal operating range"
  createMaintenanceTask: boolean
  taskTitle?: string
  taskPriority?: Priority
  cooldownHours: number               // don't re-fire within this window
  lastFiredAt?: string
}

// Cached telemetry (service worker cache + localStorage fallback)
interface HaEntitySnapshot {
  entityId: string
  state: string
  attributes: Record<string, unknown>
  lastUpdated: string
  cachedAt: string
}

// Historical data point (from HA history API)
interface HaHistoryPoint {
  timestamp: string
  state: string
}
```

### Component Breakdown

```
src/
  lib/
    haClient.ts                       // extend existing; add WebSocket, history, alertRule eval
    haCache.ts                        // localStorage cache for last-known values
  screens/
    SettingsScreen.tsx                // extend entity mapping UI
    EquipmentDetailScreen.tsx         // embed HA sensor cards and chart
  components/
    ha/
      HaSensorCard.tsx                // live value card with status color
      HaHistoryChart.tsx              // 7-day sparkline using inline SVG path
      HaAlertRuleForm.tsx             // threshold + severity + task creation config
      HaEntityMapper.tsx              // pair HA entities to equipment in Settings
      HaConnectionStatus.tsx          // persistent indicator in app header
```

### Implementation Notes

**HA REST vs. WebSocket:**
- REST (`GET /api/states/{entityId}`) on app mount and manual refresh — works through Nabu Casa.
- WebSocket (`ws://{haUrl}/api/websocket`) for real-time push — attempt first; fall back to polling every 60s if WebSocket fails. WebSocket auth: `{"type":"auth","access_token":"..."}` then subscribe to `state_changed` events for mapped entities.

**`haClient.ts` additions:**
```typescript
// Real-time subscription
subscribeToEntityChanges(
  entityIds: string[],
  onUpdate: (entityId: string, newState: string) => void
): () => void   // returns unsubscribe function

// History
fetchEntityHistory(
  entityId: string,
  startTime: Date,
  endTime: Date,
): Promise<HaHistoryPoint[]>
```

**Alert rule evaluation:** On every state update received (REST or WebSocket), evaluate all `HaAlertRule[]` for the updated entity. If condition triggered and `Date.now() - lastFiredAt > cooldownHours * 3600_000`, fire the alert. If `createMaintenanceTask`, call the same maintenance task creation path as the app's manual "add task" flow and persist to Drive.

**`HaHistoryChart`:** 7-day sparkline as inline SVG `<path>`. Normalize values to the SVG viewBox. No library. Color the line based on current status (green/amber/red). Tooltip on hover with `title` element. Touch-friendly: tap anywhere on chart to show last 24h detail.

**Entity mapper UI in Settings:** Two-column layout — left: HA entity selector (fetched from `GET /api/states`, filtered to `sensor.*` and `binary_sensor.*`); right: property + category + equipment pickers. Drag-drop not required; dropdowns are sufficient.

**Offline / last-known values:** Service worker intercepts HA API calls and serves cached responses when offline. Cache key: entity ID + date. `haCache.ts` writes snapshots to `localStorage` on every successful fetch; reads from cache when fetch fails.

### Acceptance Criteria

- [ ] Entity mapper in Settings allows pairing any HA sensor to any equipment record
- [ ] Equipment detail screen shows live sensor reading in correct color based on value
- [ ] 7-day history chart renders with correct data from HA history API
- [ ] Alert rule fires maintenance task when threshold is crossed and cooldown has elapsed
- [ ] Alert rule does not re-fire within cooldown window even if condition persists
- [ ] Offline mode shows last-known value with "as of {time}" indicator
- [ ] WebSocket real-time updates reflected on screen without manual refresh

---

## 2. Computer Vision Condition Assessment

### Goal

Add an "Inspection" flow where you photograph a piece of equipment, Claude analyzes the image in context of what the equipment is and how old it is, and returns a structured condition report: severity rating, findings description, and recommended action. Stored as inspection records linked to equipment; trend condition ratings over time.

### User Story

> The barn roof looks rough after winter. I open the barn record, tap "Inspect", take a photo of the soffit, and within 10 seconds get: "Condition 3/5 — Moderate. Paint peeling and wood rot visible in lower corner. Recommend carpenter inspection within 6 months before structural damage occurs." I tap "Create Task" and it's in my maintenance queue.

### Data Model

```typescript
type ConditionSeverity = 1 | 2 | 3 | 4 | 5
// 1 = New/Excellent, 2 = Good, 3 = Fair, 4 = Poor, 5 = Critical

interface InspectionRecord {
  id: string
  propertyId: string
  equipmentId: string
  categoryId: string
  inspectedAt: string
  inspectedBy?: string
  photos: InspectionPhoto[]
  voiceNoteTranscript?: string
  aiAssessment?: AiConditionAssessment
  userOverrideSeverity?: ConditionSeverity
  linkedMaintenanceTaskId?: string
  driveFileId?: string                // stored JSON record in Drive
}

interface InspectionPhoto {
  filename: string
  driveFileId?: string
  takenAt: string
}

interface AiConditionAssessment {
  severity: ConditionSeverity
  severityLabel: string               // "Moderate"
  summary: string                     // 1-2 sentence summary
  findings: string[]                  // bulleted list from AI
  recommendedAction: string
  urgency: 'immediate' | 'within-30-days' | 'within-6-months' | 'annual' | 'monitor'
  confidenceNote?: string             // e.g. "Unable to assess internal components from exterior photo"
  modelUsed: string
}
```

**Zod schema for structured AI response:**

```typescript
const AiConditionAssessmentSchema = z.object({
  severity: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  severityLabel: z.string(),
  summary: z.string(),
  findings: z.array(z.string()),
  recommendedAction: z.string(),
  urgency: z.enum(['immediate', 'within-30-days', 'within-6-months', 'annual', 'monitor']),
  confidenceNote: z.string().optional(),
})
```

### Component Breakdown

```
src/
  screens/
    InspectionScreen.tsx              // photo + voice capture + AI result view
    InspectionHistoryScreen.tsx       // timeline of past inspections per equipment
  components/
    inspection/
      ConditionBadge.tsx              // 1-5 severity pill with color
      AiAssessmentCard.tsx            // structured assessment display
      ConditionTrendChart.tsx         // severity over time sparkline
      VoiceNoteCapture.tsx            // hold-to-record using Web Speech API
      InspectionCreateTaskButton.tsx  // one-tap → pre-filled MaintenanceTask
```

### Implementation Notes

**AI prompt construction:**
```typescript
function buildInspectionPrompt(
  equipment: EquipmentRecord,
  category: CaptureCategory,
  voiceNote?: string,
): string {
  return `You are inspecting a ${category.label} at a property.
Equipment: ${equipment.brand ?? ''} ${equipment.model ?? ''}, installed ${equipment.installYear ?? 'unknown year'}.
${voiceNote ? `Owner's note: "${voiceNote}"` : ''}

Analyze the photo for visible condition issues. Rate severity 1-5 (1=excellent, 5=critical).
Focus on: visible damage, wear, corrosion, leaks, structural concerns visible in the image.
Do not speculate about internal components not visible in the photo.`
}
```

**OpenRouter call:** Same pattern as nameplate extraction in `EquipmentFormScreen` — base64 image, `response_format: json_schema` with `AiConditionAssessmentSchema`, model `anthropic/claude-sonnet-4-6` (vision capable).

**Voice note integration:** Web Speech API (`SpeechRecognition`) in `VoiceNoteCapture`. Hold button starts recognition, release stops. Transcript injected into prompt as owner's note. Graceful degradation: if `SpeechRecognition` unavailable, show a text field instead.

**Trend chart:** `ConditionTrendChart` plots severity (1–5, inverted Y so 1=top=good) over time as a connected scatter plot using inline SVG. Color each point by severity. Used on `EquipmentDetailScreen` to show degradation rate.

**`InspectionCreateTaskButton`:** On tap: open `MaintenanceScreen` modal (or inline) pre-populated with `recommendedAction` as title, `urgency` mapped to `dueDate`, `severity` mapped to `priority` (5=critical, 4=high, 3=medium, 1-2=low).

**Drive persistence:** Inspection record JSON at `{driveRoot}/Inspections/{equipmentId}/{inspectionId}.json`. Photos uploaded to same folder.

### Acceptance Criteria

- [ ] Inspection flow accessible from EquipmentDetailScreen for any equipment record
- [ ] AI condition assessment returns severity 1–5 with structured findings
- [ ] Assessment renders as structured card with urgency and recommended action
- [ ] "Create Task" from assessment pre-fills maintenance form correctly
- [ ] Voice note transcript included in AI prompt when provided
- [ ] Condition trend chart shows multiple inspections over time for same equipment
- [ ] Inspection record and photos stored in Drive

---

## 3. Camp Closing Mode — Guided Seasonal Workflow

### Goal

A fullscreen guided checklist experience purpose-built for multi-hour tasks like camp closing. Each step has full instructions, optional voice read-aloud, and a photo requirement for documentation checkpoints. Completion generates a structured PDF stored in Drive.

### User Story

> It's October. I open "Camp Fall Closing" on my phone, put it in my chest pocket, and work through 12 steps. At step 6 (blow out water lines) the app reads the instructions aloud. Step 9 requires a photo of the breaker panel. When done, the app generates a PDF with all completion times, notes, and photos — stored in Drive and shared with my co-owner.

### Data Model

Extends `ChecklistTemplate` and `ChecklistInstance` from Phase 2 with guided-mode fields:

```typescript
interface GuidedChecklistConfig {
  ttsEnabled: boolean                 // text-to-speech for instructions
  requirePhotosForFlagged: boolean    // enforce photos on items with requiresPhoto=true
  generatePdfOnComplete: boolean
  shareEmailOnComplete?: string       // auto-draft email on completion
}

interface GuidedChecklistSession {
  instanceId: string
  currentItemIndex: number
  startedAt: string
  pausedAt?: string
  config: GuidedChecklistConfig
}

// Extends ChecklistInstanceItem (Phase 2)
interface GuidedChecklistInstanceItem extends ChecklistInstanceItem {
  startedAt?: string
  completedAt?: string
  durationSeconds?: number
  photoPaths: string[]
}
```

**PDF report structure:**

```
Property: Camp
Checklist: Fall Closing 2026
Date: October 15, 2026
Completed by: Pete Drake
Duration: 2h 14m

STEP 1 — Winterize Water Lines (completed 9:14 AM, 8 min)
[Photo: winterize_water_2026-10-15_0914.jpg]
Notes: Used compressor, all lines clear, hose bibs open.

...

STEP 12 — Lock up and depart (completed 11:28 AM, 3 min)
[Photo: lockup_2026-10-15_1128.jpg]

COMPLETION SUMMARY
All 12 items completed · Duration: 2h 14m · October 15, 2026
```

### Component Breakdown

```
src/
  screens/
    ChecklistGuidedScreen.tsx         // fullscreen step-through UI
    ChecklistPdfPreviewScreen.tsx     // review generated PDF before saving
  components/
    guided/
      GuidedStepCard.tsx              // full-screen step: title, detail, photo, notes
      TtsSpeakButton.tsx              // read aloud this step's instructions
      PhotoRequiredGate.tsx           // block "Next" until photo taken
      GuidedProgressHeader.tsx        // step N of M, elapsed time
      CompletionSummary.tsx           // checklist done state with PDF button
  lib/
    pdfGenerator.ts                   // pdfmake wrapper; builds PDF from ChecklistInstance
    ttsService.ts                     // Web Speech API SpeechSynthesis wrapper
```

### Implementation Notes

**`ttsService.ts`:** Wraps `window.speechSynthesis`. `speak(text)` cancels any ongoing speech and speaks the provided text. `stop()` cancels. Falls back silently on iOS WebView where speech synthesis may behave differently. Expose `isSupported` boolean for conditional rendering of the TTS button.

**`pdfGenerator.ts` using pdfmake:**
```typescript
import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
pdfMake.vfs = pdfFonts.pdfMake.vfs

export async function generateChecklistPdf(
  instance: ChecklistInstance,
  template: ChecklistTemplate,
  property: Property,
): Promise<Blob>
```

Each step becomes a section in the `docDefinition`. Photos are embedded as base64 data URIs (fetched from `photo.preview` object URLs held in session state before Drive upload, or from Drive after upload). Keep photos to max 800px width to control PDF size.

**Photo gate (`PhotoRequiredGate`):** Wraps the "Next" button when `item.requiresPhoto === true`. Shows an amber warning if user taps Next without a photo. Second tap bypasses with a "Skip photo" confirmation. Never hard-blocks — user is always able to proceed.

**Drive upload on complete:** Upload the PDF blob to `{driveRoot}/Checklists/{year}/{templateName}_closing_{date}.pdf`. Then upload the JSON instance record alongside it. Return `driveFileId` for the share link.

**Email share (`shareEmailOnComplete`):** Use `mailto:` scheme with pre-filled subject and body containing the Drive link to the PDF. No backend required. Body: `"Camp Fall Closing complete — {date}. Report: {driveLink}"`.

**State persistence during session:** `GuidedChecklistSession` serialized to `sessionStorage` on each step completion. If app is closed mid-checklist, session can be resumed. `sessionStorage` is cleared on PDF generation.

**`pdfmake` as dependency:** Add to `package.json`. Tree-shakes poorly (~400KB); acceptable for a PWA but lazy-load the PDF module only when generating. Use `React.lazy` + dynamic import on the CompletionSummary screen.

### Acceptance Criteria

- [ ] Guided mode renders each step fullscreen with full instruction text
- [ ] TTS speaks step instructions when enabled; stop button works
- [ ] Steps with `requiresPhoto = true` warn before advancing without a photo
- [ ] Elapsed time per step tracked and shown in completion summary
- [ ] PDF generated with all steps, completion times, notes, and embedded photos
- [ ] PDF uploaded to correct Drive folder with correct filename
- [ ] Interrupted session resumable after app close/reopen
- [ ] Share via email opens mail client with pre-filled Drive link

---

## 4. Full-Text Search

### Goal

Search across all documents stored in Drive — equipment records, service history, permits, inspection reports — from a single search bar. Results grouped by type and linked directly to the relevant screen.

### User Story

> I remember the pump was serviced by "Buckeye Well Drilling" but can't remember which equipment record. I search "Buckeye" and see three service records across two properties — I tap the right one and I'm there.

### Data Model

No new types. Search results are resolved to existing types:

```typescript
interface SearchResult {
  driveFileId: string
  driveFileName: string
  driveMimeType: string
  driveModifiedTime: string
  snippet?: string                    // Drive API provides text snippets
  resolvedType: 'equipment' | 'service-record' | 'permit' | 'inspection' | 'checklist' | 'unknown'
  resolvedId?: string                 // local record ID if matched
  resolvedLabel?: string              // human-readable name
  propertyId?: string
  navigateTo?: string                 // app route to navigate to on tap
}
```

### Component Breakdown

```
src/
  lib/
    driveSearch.ts                    // Drive API full-text search wrapper
    searchResultResolver.ts           // map Drive file → resolvedType + route
  screens/
    SearchScreen.tsx                  // search input + grouped results
  components/
    search/
      SearchBar.tsx                   // global search input (also in AppShell header)
      SearchResultGroup.tsx           // results grouped by type with section header
      SearchResultRow.tsx             // single result with type icon, snippet, property badge
```

### Implementation Notes

**Drive API full-text search:**
```typescript
// driveSearch.ts
export async function searchDrive(
  query: string,
  token: string,
  rootFolderIds: string[],            // one per property
): Promise<DriveFile[]> {
  // Drive API: files.list with q parameter
  // fullText contains '{query}' AND ('{rootId1}' in parents OR '{rootId2}' in parents)
  const q = `fullText contains '${query.replace(/'/g, "\\'")}' and trashed = false`
  // ...fetch with pagination, return up to 50 results
}
```

Drive's full-text search indexes text files (markdown), JSON files, and PDFs automatically. No additional indexing step required.

**`searchResultResolver.ts`:** Pattern-matches Drive filenames against known naming conventions from `formatFileStem`:
- Filenames matching `{categoryId}_*` → `equipment` record
- Filenames matching `service_*` → `service-record`
- Files in `Permits/` folder → `permit`
- Files in `Inspections/` folder → `inspection`
- Files in `Checklists/` folder → `checklist`

Resolve to a `navigateTo` route for in-app navigation.

**Search bar placement:** In `AppShell`, add a search icon to the desktop sidebar footer and mobile header. Tapping opens `SearchScreen` (full-page on mobile, could be a modal on desktop). Results load as the user types, debounced 400ms.

**Offline handling:** Drive search requires connectivity. Show "Search requires a connection" message when offline. Cache the last 5 search queries + results in `sessionStorage` as a convenience.

**Result grouping:** `SearchResultGroup` renders results under headers: "Equipment Records", "Service History", "Permits", "Inspections", "Other". Each group collapsed if empty. Count shown in header ("Service History (3)").

### Acceptance Criteria

- [ ] Searching any word appearing in a Drive-stored markdown or JSON file returns that file
- [ ] Results resolve to correct in-app route and navigate correctly on tap
- [ ] Results grouped by type with counts in group headers
- [ ] Debounced search: API call fires 400ms after user stops typing
- [ ] Drive snippet shown as preview text under each result
- [ ] Offline state shows appropriate message, no broken requests

---

## 5. Predictive Failure Engine

### Goal

A quarterly AI reasoning pass over all property data. Claude serializes the full state of each property — equipment ages, maintenance gaps, runtime hours, water test trends, open capital items — and reasons about failure risk. Returns a structured risk brief that surfaces items the owner hasn't yet thought about. Each risk item is one tap away from becoming a maintenance task or capital project.

### User Story

> It's January. I trigger the quarterly review. Three minutes later I see a risk brief: "Well pressure tank showing age (installed 2007, 19 years) — probability of waterlogged tank condition elevated. Recommend bladder test before spring." I tap "Add to Capital Watch" and it's there with a pre-filled estimate.

### Data Model

```typescript
interface PropertyRiskBrief {
  id: string
  propertyId: string
  generatedAt: string
  modelUsed: string
  inputSummary: string                // what data was serialized and sent
  risks: RiskItem[]
  driveFileId?: string
}

interface RiskItem {
  id: string
  title: string
  categoryId: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  reasoning: string                   // Claude's explanation
  recommendedAction: string
  suggestedTaskTitle?: string
  suggestedCapitalItemTitle?: string
  estimatedCostLow?: number
  estimatedCostHigh?: number
  convertedToTaskId?: string
  convertedToCapitalItemId?: string
}
```

**Serialized prompt payload structure:**

```typescript
interface PropertyPromptPayload {
  property: Property
  equipment: EquipmentRecord[]        // with ages computed
  maintenanceTasks: MaintenanceTask[] // pending only
  serviceHistory: ServiceRecord[]     // last 2 years
  capitalItems: CapitalItem[]         // planned + in-progress
  openPermits: Permit[]
  generatorRuntime?: { cumulativeHours: number; lastServiceHours: number }
  // Note: do NOT include photos, Drive file IDs, or auth tokens
}
```

### Component Breakdown

```
src/
  lib/
    riskEngine.ts                     // serialize property data, call AI, parse response
  screens/
    RiskBriefScreen.tsx               // display current + historical briefs
  components/
    risk/
      RiskBriefCard.tsx               // summary of a brief: date, property, risk count
      RiskItemCard.tsx                // single risk with severity, reasoning, action buttons
      RiskSeverityBadge.tsx           // color-coded severity pill
      ConvertRiskButton.tsx           // "Add to Maintenance" / "Add to Capital Watch"
```

### Implementation Notes

**Prompt engineering in `riskEngine.ts`:**

```typescript
const systemPrompt = `You are an experienced property maintenance advisor analyzing a property owner's complete equipment and maintenance data. 

Your task: identify systems or items showing risk factors that may not yet appear in the owner's maintenance queue. Focus on:
- Equipment approaching or past typical failure age for its category
- Maintenance gaps (no service records when expected intervals suggest service is due)
- Combinations of factors (e.g., old equipment + no recent service + HA data showing abnormal readings)
- Items the owner has noted but not yet actioned

Do NOT repeat items already in the maintenance queue. Focus on gaps.
Return 3–8 risk items ordered by severity descending. Be specific: name the equipment, give the reasoning, cite the age or gap.`
```

Serialize `PropertyPromptPayload` to JSON, embed in user message. Use `anthropic/claude-opus-4-6` via OpenRouter with `response_format: json_schema` and `PropertyRiskBriefSchema`.

**Token budget:** A typical property payload is ~3,000–6,000 tokens. Add service history truncation: summarize records older than 2 years as counts only. Stay under 8,000 input tokens to keep cost reasonable.

**Trigger UI:** Manual trigger button on the Dashboard ("Run Quarterly Review") and from a schedule (`CronCreate` if using Claude scheduled tasks, or a `localStorage` reminder that surfaces "It's been 90 days — run your quarterly review?" banner).

**`ConvertRiskButton`:** Two options per risk item — "Add to Maintenance" and "Add to Capital Watch". Tapping pre-populates the respective form and navigates. Set `convertedToTaskId` or `convertedToCapitalItemId` on the `RiskItem` to show "Already actioned" state on re-view.

**Drive persistence:** Store the full `PropertyRiskBrief` JSON to `{driveRoot}/AI/risk_brief_{date}.json`. Load historical briefs from Drive when opening `RiskBriefScreen`.

**Cost awareness:** At ~6,000 input + 1,000 output tokens, one quarterly run costs approximately $0.10 with Claude Opus 4.6 via OpenRouter. Show estimated cost ("~$0.10") on the trigger button.

### Acceptance Criteria

- [ ] Trigger button generates a risk brief within 60 seconds
- [ ] Risk brief contains 3–8 items with severity, reasoning, and recommended action
- [ ] Risk items do not duplicate items already in the maintenance queue
- [ ] "Add to Maintenance" pre-fills and navigates to maintenance task form
- [ ] "Add to Capital Watch" pre-fills and navigates to capital item form
- [ ] Converted risk items show "Actioned" state on risk brief re-view
- [ ] Historical briefs loadable from Drive
- [ ] Estimated cost displayed before triggering

---

## 6. The Home Book Export

### Goal

Generate a professional property disclosure document — "The Home Book" — in PDF format. Comprehensive enough to hand to a buyer, an estate attorney, or an insurance adjuster. Versioned copies stored in Drive. Runnable on demand or on an annual schedule.

### User Story

> I'm refinancing. The bank's appraiser asks for documentation of the major systems. I open the app, tap "Generate Home Book", wait 3 minutes, and hand them a 20-page PDF with every system spec, maintenance history, capital improvement, and warranty organized clearly.

### Data Model

```typescript
interface HomeBookExport {
  id: string
  propertyId: string
  generatedAt: string
  version: number                     // increments per export
  sections: HomeBookSection[]
  driveFileId?: string
  pdfFilename: string                 // "Tannerville_HomeBook_v3_2026-04.pdf"
}

interface HomeBookSection {
  id: string
  title: string
  generatedContent: string            // Claude-formatted prose + tables
  dataSnapshot: unknown               // the data serialized for this section
}

// Section definitions
const HOME_BOOK_SECTIONS = [
  { id: 'overview',        title: 'Property Overview' },
  { id: 'systems',         title: 'Systems & Specifications' },
  { id: 'maintenance',     title: 'Maintenance History (5 Years)' },
  { id: 'capital',         title: 'Capital Improvements' },
  { id: 'warranties',      title: 'Active Warranties' },
  { id: 'permits',         title: 'Permits & Inspections' },
  { id: 'contractors',     title: 'Contractor Contacts' },
  { id: 'well_water',      title: 'Well & Water Systems' },
  { id: 'septic',          title: 'Septic History' },
]
```

### Component Breakdown

```
src/
  lib/
    homeBookGenerator.ts              // orchestrates AI calls + pdfmake assembly
    homeBookPrompts.ts                // per-section prompt templates
  screens/
    HomeBookScreen.tsx                // version history + generate button
  components/
    homebook/
      HomeBookVersionCard.tsx         // past export: date, version, Drive link
      SectionProgressIndicator.tsx    // shows which sections are generating
      HomeBookPreview.tsx             // rendered section content before PDF commit
```

### Implementation Notes

**Generation strategy — section-by-section:**
Generate one section at a time with separate AI calls. Benefits: parallel-able, each call fits comfortably in token budget, section failures don't abort the whole export, progress visible to user.

```typescript
async function generateSection(
  sectionId: string,
  propertyData: PropertyPromptPayload,
  token: string,
): Promise<string>  // returns formatted markdown
```

Use `Promise.allSettled` to run all sections concurrently. Total elapsed time: ~30–60 seconds for 9 sections at Sonnet speeds.

**`homeBookPrompts.ts` — example section prompt:**

```typescript
const SECTION_PROMPTS: Record<string, (data: PropertyPromptPayload) => string> = {
  systems: (data) => `
Write the "Systems & Specifications" section for a property disclosure document.
Property: ${data.property.name}, ${data.property.address}

Format as a professional specification table per system, then a brief paragraph noting any 
relevant condition notes. Include: ${data.equipment.map(e => e.label).join(', ')}.
Use a formal, factual tone appropriate for a real estate disclosure document.

Equipment data: ${JSON.stringify(data.equipment)}
`.trim(),
}
```

**pdfmake assembly:** After all sections complete, `homeBookGenerator.ts` assembles the `docDefinition`. Use a clean two-column header layout for the property name and generation date. Each section gets a bold title, horizontal rule, then the AI-generated markdown converted to pdfmake content blocks (parse headings, tables, lists).

**Markdown → pdfmake conversion:** Write a lightweight `markdownToPdfmake(md: string): ContentBlock[]` function. Handle: `##` headings → bold large text, `|` tables → pdfmake table, `- ` lists → unordered list, `**bold**` → bold style. No full markdown parser needed — just the patterns Claude reliably outputs.

**Drive versioning:** Before each generation, read existing exports from `{driveRoot}/HomeBook/` to determine the next version number. Store as `{propertyShortName}_HomeBook_v{n}_{YYYY-MM}.pdf`.

**Size management:** Target under 5MB per export. Limit embedded photos to equipment nameplate images only (not service record photos). Compress images to 600px max width before embedding.

### Acceptance Criteria

- [ ] Home Book generates with all 9 sections within 90 seconds
- [ ] Section progress indicator shows which sections are complete during generation
- [ ] Generated PDF opens correctly and is readable on mobile and desktop
- [ ] Each section contains factually accurate data sourced from the property record
- [ ] PDF uploaded to Drive with correct versioned filename
- [ ] Version history screen shows all past exports with Drive open links
- [ ] Failed sections show graceful error content ("Data not available") rather than aborting PDF

---

## 7. Voice Memo Logging

### Goal

Hands-free maintenance event entry using Web Speech API. Designed for the "hands are dirty" scenario — mid-job, when typing on a phone screen is impractical. Hold a button, speak, transcription fills the description field. Optionally uses AI to parse the spoken memo into structured fields.

### User Story

> I just finished bleeding the pressure tank at camp. My hands are wet and cold. I hold the mic button and say: "Pressure tank, drained and bled, took about 20 minutes, pressure looks normal now." The description field fills in. I tap Save. Done.

### Data Model

No new types. Voice input maps to existing `ServiceRecord` or `MaintenanceTask` fields. Add optional metadata:

```typescript
// Extend ServiceRecord with voice metadata
interface ServiceRecordVoiceCapture {
  rawTranscript: string
  aiParsed: boolean
  capturedAt: string
}

// AI parsing output (optional — only if OpenRouter key present)
interface ParsedVoiceMemo {
  system?: string                     // detected system/category
  workDone?: string                   // cleaned description
  duration?: string                   // "20 minutes"
  contractor?: string                 // if mentioned
  cost?: number                       // if mentioned ("cost $40")
  followUpNeeded?: boolean            // "should check again next week"
  followUpNote?: string
}
```

### Component Breakdown

```
src/
  lib/
    speechRecognition.ts              // Web Speech API wrapper with iOS fallback
    voiceMemoParser.ts                // AI parsing of raw transcript into structured fields
  components/
    voice/
      VoiceMemoButton.tsx             // hold-to-record button with waveform animation
      TranscriptPreview.tsx           // live transcript display while recording
      VoiceMemoReview.tsx             // editable transcript + parsed fields before save
  screens/
    MaintenanceScreen.tsx             // embed VoiceMemoButton in QuickLog flow
    EquipmentFormScreen.tsx           // embed VoiceMemoButton in notes field
```

### Implementation Notes

**`speechRecognition.ts` wrapper:**

```typescript
interface SpeechRecognitionOptions {
  continuous: boolean
  interimResults: boolean
  onInterimResult: (text: string) => void
  onFinalResult: (text: string) => void
  onError: (error: string) => void
}

export class SpeechRecognitionSession {
  start(): void
  stop(): void
  abort(): void
  readonly isSupported: boolean   // static check: 'webkitSpeechRecognition' in window
}
```

**iOS caveat:** `webkitSpeechRecognition` on iOS 17+ Safari works but requires user gesture to start, stops automatically after short pauses, and does not support `continuous: true`. Workaround: restart recognition on `onend` if `continuous` is desired. Test on actual device; simulator behavior differs.

**`VoiceMemoButton` interaction:**
- On `pointerdown`: start recognition, animate waveform
- On `pointerup` / `pointercancel`: stop recognition, show `VoiceMemoReview`
- On desktop: also handle `mousedown` / `mouseup`
- Minimum hold time: 500ms (prevent accidental taps)
- Visual feedback: pulsing red circle during recording, waveform SVG animation

**AI parsing (optional, uses OpenRouter):**

```typescript
async function parseVoiceMemo(
  transcript: string,
  contextCategoryId?: string,
): Promise<ParsedVoiceMemo>
```

Short transcript → cheap to parse with `google/gemini-flash-1.5`. Prompt: extract system, work description, duration, cost, contractor from conversational text. Structured JSON output via `response_format`. Show spinner while parsing; allow user to use raw transcript if no key configured.

**`VoiceMemoReview`:** Shows raw transcript (editable), and below it the AI-parsed fields in an editable form. User can tweak any field. "Use this" button applies parsed values to the parent form.

**Placement:** `VoiceMemoButton` appears as an optional "mic" icon in:
1. The `notes` / `work_done` field in any form that accepts free-text
2. A dedicated "Quick Voice Log" entry point on the maintenance screen (floating action button on mobile)

**Accessibility:** The button has `aria-label="Hold to record voice memo"` and `role="button"`. Visual recording state changes are accompanied by a screen-reader announcement via `aria-live`.

### Acceptance Criteria

- [ ] Hold-to-record button starts speech recognition, waveform animates
- [ ] Live transcript appears in real time during recording
- [ ] Releasing button stops recording and shows VoiceMemoReview
- [ ] AI parsing (when key available) extracts system, description, and duration correctly
- [ ] Parsed fields editable before applying to form
- [ ] Works correctly without OpenRouter key (raw transcript only, no AI parsing)
- [ ] Graceful fallback on unsupported browsers: button replaced with text field
- [ ] iOS: recognition restarts correctly after brief pause interruptions

---

## 8. Home Contents Inventory (Insurance-Grade)

### Goal

A room-by-room AI-assisted inventory of personal property contents, built specifically for the insurance documentation use case. Photos drive the data — AI parses what it sees into a structured item list. The completed inventory exports as a PDF suitable for presenting to an insurance adjuster after a loss. Stored in Drive so it survives the disaster that would make you need it.

### User Story

> After a kitchen fire, the adjuster asks for a contents inventory. I open the app, tap "Export Inventory PDF", and hand them a 35-page document listing every appliance, piece of furniture, and piece of equipment in every room — with photos, estimated replacement values, and model numbers where visible. My claim is processed in days instead of months.

### Data Model

```typescript
interface InventoryRoom {
  id: string
  propertyId: string
  name: string                        // "Living Room", "Master Bedroom", "Barn", "Garage"
  notes?: string
  lastPhotoDate?: string
  drivePhotoFolderPrefix?: string     // Drive subfolder path for this room's photos
}

interface InventoryItem {
  id: string
  roomId: string
  propertyId: string
  description: string                 // "Samsung 65" QLED TV"
  category: InventoryItemCategory
  brand?: string
  model?: string
  serialNumber?: string
  estimatedReplacementValue?: number  // AI-estimated or user-entered
  purchaseDate?: string
  purchasePrice?: number
  receiptDriveFileId?: string
  condition: 'new' | 'excellent' | 'good' | 'fair' | 'poor'
  photoIds: string[]                  // DriveFile IDs of item photos
  notes?: string
  aiGenerated: boolean                // true if AI parsed this from a photo
  aiConfidence?: 'high' | 'medium' | 'low'
  needsReview?: boolean               // flagged by AI for user verification
}

type InventoryItemCategory =
  | 'electronics'
  | 'furniture'
  | 'appliance'
  | 'tool'
  | 'clothing'
  | 'jewelry'
  | 'artwork'
  | 'collectible'
  | 'outdoor'
  | 'other'

// Zod schema for AI photo parsing
const AiInventoryParseSchema = z.object({
  items: z.array(z.object({
    description:              z.string(),
    category:                 z.string(),
    brand:                    z.string().optional(),
    model:                    z.string().optional(),
    serialNumber:             z.string().optional(),
    estimatedReplacementValue: z.number().optional(),
    condition:                z.enum(['new', 'excellent', 'good', 'fair', 'poor']),
    confidence:               z.enum(['high', 'medium', 'low']),
    notes:                    z.string().optional(),
  })),
  roomContext: z.string().optional(), // AI's description of the visible space
})
```

### Component Breakdown

```
src/
  types/
    inventory.ts                      // InventoryRoom, InventoryItem types
  screens/
    ContentsInventoryScreen.tsx       // property-level: room list + total value + export
    InventoryRoomScreen.tsx           // room-level: item list + photo capture
    InventoryItemDetailScreen.tsx     // single item view + edit
  components/
    contents/
      RoomCard.tsx                    // room thumbnail + item count + last updated
      RoomForm.tsx                    // add/edit room
      InventoryItemRow.tsx            // item in list: description, value, review badge
      InventoryItemForm.tsx           // add/edit item manually
      AiParseResultReview.tsx         // review AI-parsed items before accepting
      ContentsExportButton.tsx        // generate + upload PDF
      TotalValueSummary.tsx           // sum of estimated replacement values by room
      StaleInventoryBanner.tsx        // "Last updated 90 days ago" reminder
```

### Implementation Notes

**AI parsing flow:**

```typescript
async function parseRoomPhoto(
  photoBlob: Blob,
  mimeType: string,
  roomName: string,
): Promise<z.infer<typeof AiInventoryParseSchema>>
```

Prompt to Claude:
```
You are documenting a "${roomName}" for insurance purposes. List all identifiable items visible in this photo.
For each item: description, category, any visible brand/model/serial number, estimated replacement cost at current retail, and condition.
Be thorough — insurance claims require complete inventories. If you can see 15 items, list all 15.
For items you're uncertain about, set confidence to "low" and still include them.
```

Use `anthropic/claude-sonnet-4-6` (vision). One API call per photo. Multiple photos can be taken per room — merge item lists, deduplicating obvious overlap.

**Review before saving (`AiParseResultReview`):** Present parsed items as an editable list. Each row shows: description, category, estimated value, confidence badge. Low-confidence items have a yellow `needsReview` badge. User can edit any field inline, delete false positives, or add missed items before tapping "Accept All". This review step is required — AI estimates are approximate.

**Deduplication across photos:** When multiple photos are parsed for the same room, show a combined review. AI may list the same TV from two angles. The review UI allows merging duplicate items (select both, tap "Merge").

**PDF export via pdfmake:**

Each room becomes a section. Within each section: room header, summary (item count, total estimated value), then item rows in a two-column table (description + value), plus a photo plate (up to 4 thumbnails per room embedded in the PDF, scaled to 300px max width).

```typescript
async function generateInventoryPdf(
  property: Property,
  rooms: InventoryRoom[],
  items: InventoryItem[],
  photos: Map<string, string>, // driveFileId → base64 for embedding
): Promise<Blob>
```

**Cover page:** Property address, generation date, total rooms, total items, total estimated replacement value. Footer on every page: "Prepared by Property Manager app · {date} · Page N of M".

**Drive storage architecture:**
```
{driveRoot}/
  Inventory/
    inventory.json              // all rooms + all items (full state)
    {roomId}/
      {photoFilename}           // room and item photos
```

Load the full `inventory.json` on `ContentsInventoryScreen` mount. Write on every add/edit/delete. Photo uploads happen at capture time.

**Staleness reminder:** Store `lastInventoryUpdateDate` per property in `localStorage`. On `ContentsInventoryScreen` mount, if `Date.now() - lastUpdate > 90 days`, show `StaleInventoryBanner` with a "Review Now" CTA. This is the nudge that keeps the inventory useful.

**Offline consideration:** Item data writes are small JSON — queue via `offlineQueue` if Drive is unreachable. Photos must be uploaded while connected. If offline, show a warning that photos will upload when connection is restored and photos are temporarily stored in `IndexedDB`.

**Room templates:** Pre-populate a new property with suggested rooms based on property type: residence gets Living Room, Kitchen, Master Bedroom, Bedroom 2, Bathroom, Basement, Garage, Attic; camp gets Main Room, Bedroom, Kitchen, Loft, Garage/Storage.

### Acceptance Criteria

- [ ] Room can be added, edited, and deleted per property
- [ ] Photo capture triggers AI parsing with progress indicator
- [ ] AI returns structured item list with descriptions, categories, and estimated values
- [ ] Review screen shows all AI-parsed items; user can edit, delete, or add items before saving
- [ ] Low-confidence items flagged with review badge; badge clears on user confirmation
- [ ] Multiple photos for the same room merge into a single item list review
- [ ] Manual item add works without any photo
- [ ] Total estimated replacement value shown per room and property-wide
- [ ] PDF export contains all rooms, item lists, embedded thumbnails, and cover page
- [ ] PDF uploaded to Drive with versioned filename
- [ ] Staleness banner appears after 90 days without update
- [ ] Offline photo upload queued in IndexedDB and retried on reconnect
