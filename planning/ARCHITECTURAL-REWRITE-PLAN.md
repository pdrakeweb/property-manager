# Architectural Rewrite Plan — Property Manager

**Date:** 2026-04-20
**Model:** Opus 4.7 (extended thinking)
**Scope:** Three coordinated rewrites — (1) UI design system, (2) declarative record schema, (3) extracted storage-plugin library
**Status:** Review + plan; no code changes yet

---

## Executive Summary

Three layers currently drift because each record type is redefined in five-plus places (TS interface, form fields, markdown formatter, AI tool, folder mapping, title heuristic, sync enum). The UI has a good component-class foundation but only ~60% adoption and no button/badge vocabulary. The storage/sync core is already almost-generic — the main things blocking extraction are a hardcoded type enum, a switch-statement formatter, and a hardcoded title heuristic.

The plan below is **sequenced so each phase stands alone** (it can ship and deliver value without the next), and each later phase builds on the previous:

1. **Phase A — Design System Consolidation** (1–2 weeks, low risk). Widen the `index.css` component layer, add buttons/badges/section vocabulary, retire local input class variants.
2. **Phase B — Declarative Record Schema (DSL)** (2–3 weeks, medium risk). Single declaration per record type produces TS types, forms, markdown, AI tool descriptors, and reference docs.
3. **Phase C — Extract Storage Plugin** (1–2 weeks, medium risk). Pull `localIndex` + `driveClient` + `syncEngine` into a standalone library parameterized by the schema registry from Phase B.
4. **Phase D — Migration & Hardening** (ongoing). Migrate all 21 record types onto the DSL; add runtime validation, generated docs, React reactivity.

---

## Part 1 — Current-State Review

### 1.1 UI design layer

Foundation is solid:
- [src/index.css:19-72](src/index.css:19) defines 8 fully dark-mode-aware classes: `card-surface`, `modal-surface`, `input-surface`, `muted-surface`, `toggle-active`, `toggle-inactive`, `card-divider`, and the `text-muted/primary/subtle` triplet.
- [src/index.css:80-177](src/index.css:80) provides a `:where()` fallback layer that remaps bare `bg-white`, `bg-slate-*`, `text-slate-*`, `border-slate-*`, and colored soft fills for dark mode without needing explicit `dark:` variants.
- `tailwind.config.ts` uses `darkMode: 'class'` and extends with a single `brand` (green) palette.

Gaps:

| Issue | Evidence | Impact |
|---|---|---|
| No button vocabulary | ~30 inline `bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-4 py-2.5` instances across screens | Every new button is a copy-paste decision |
| No badge/pill vocabulary | 30+ color-prefixed badge strings, inconsistently dark-mode-aware — compare `BudgetScreen:23-26` (has dark:) vs `ExpiryManageScreen:18-24` (no dark variants) | Subtle UX bugs in dark mode |
| Five local input class variants | [src/screens/MaintenanceScreen.tsx:67](src/screens/MaintenanceScreen.tsx:67), [src/screens/EquipmentFormScreen.tsx:67](src/screens/EquipmentFormScreen.tsx:67), etc. — each slightly different from `.input-surface` | Drift; when one evolves, others don't |
| Inconsistent modal backdrops | `bg-black/40` vs `bg-black/50`; `z-50` vs `z-[70]` | Visual inconsistency between modals |
| No `.section-title` / `.empty-state` / `.form-row` classes | Repeated inline patterns across dashboards | Typography inconsistency |
| Cancel buttons miss `dark:` in many places | `CalendarScreen`, `ChecklistRunScreen` | Saved by fallback rules but implicit |

### 1.2 Record / data layer

21 record types are defined across `src/types/` and `src/schemas/`. Each one appears in up to **seven independent places**:

1. **TS interface** in `src/types/*.ts` or `src/schemas/index.ts`
2. **Enum entry** in `IndexRecordType` at [src/lib/localIndex.ts:29-47](src/lib/localIndex.ts:29)
3. **Store factory call** in `src/lib/*Store.ts` (e.g. `makeSyncedStore<Vendor>('pm_vendors', 'vendor', 'vendor')`)
4. **Markdown formatter** in [src/lib/domainMarkdown.ts](src/lib/domainMarkdown.ts)
5. **Dispatch case** in `exportMarkdown()` switch at [src/lib/markdownExport.ts:54-112](src/lib/markdownExport.ts:54)
6. **Folder name** in `CATEGORY_FOLDER_NAMES` at [src/lib/driveClient.ts:10-40](src/lib/driveClient.ts:10)
7. **Form fields** — sometimes in [src/screens/EquipmentFormScreen.tsx](src/screens/EquipmentFormScreen.tsx) `CATEGORY_FIELDS`, sometimes in [src/data/categories.ts](src/data/categories.ts) `CaptureCategory.fields`, sometimes bespoke per-screen

Further issues:
- **Zod is installed but unused** for runtime validation. It appears only in AI JSON-schema generation via `zod-to-json-schema`.
- **No migration infrastructure**: records are coerced straight from localStorage / Drive JSON with `as` casts.
- **Title derivation is heuristic**: [src/lib/syncedStore.ts](src/lib/syncedStore.ts) picks from `label ?? name ?? title ?? provider ?? taskTitle`.
- **AI context is a fourth serialization layer**: [src/services/PropertyRecordsAPI.ts](src/services/PropertyRecordsAPI.ts) returns its own shapes for the LLM, independent of TS types and markdown.

### 1.3 Storage / sync layer

Good news — the core is **already mostly generic**:

| Layer | Domain coupling | Extraction effort |
|---|---|---|
| [src/lib/localIndex.ts](src/lib/localIndex.ts) | **None** — pure `IndexRecord<Record<string,unknown>>` store keyed on opaque `type` | Trivial |
| [src/lib/driveClient.ts](src/lib/driveClient.ts) | **None** in code — only a `CATEGORY_FOLDER_NAMES` constant dict | Trivial (make it config) |
| [src/lib/syncEngine.ts](src/lib/syncEngine.ts) | Low — generic push/pull/conflict; but [syncEngine.ts:373-404](src/lib/syncEngine.ts:373) special-cases `propertyStore` | Easy |
| [src/lib/syncedStore.ts](src/lib/syncedStore.ts) | Medium — hardcoded title-field heuristic | Easy |
| [src/lib/markdownExport.ts](src/lib/markdownExport.ts) | **High** — 17-case switch dispatching to named formatters | Medium |
| [src/lib/domainMarkdown.ts](src/lib/domainMarkdown.ts) | **High by design** — per-type formatters | N/A — lives in app, not library |

Other observations:
- Drive wire format is **JSON IndexRecord**, not markdown. Markdown is a separate, purely-human-facing export.
- Markdown export is "quiesced" by a 6-hour debounce — a 1-hour check-timer only fires if ≥6h have elapsed since the last export ([App.tsx:309-346](src/App.tsx:309)).
- Photos are base64-encoded inside the JSON record, so binary sync uses the same path.
- **No change-notification bus**: components call `store.getAll()` at render time. Single-tab mutations flow through React re-renders, but cross-tab/cross-device sync does not trigger re-renders.

---

## Part 2 — The Rewrite Plan

### Phase A — Design System Consolidation

**Goal:** One authoritative source for every visual primitive, with exhaustive dark-mode coverage and a readable class catalog.

**Approach — extend, don't replace.** The existing component classes stay; we widen the vocabulary and retire duplicates.

#### A.1 Design tokens
Add semantic tokens to `tailwind.config.ts` so component classes reference intent, not raw colors:

```ts
theme.extend.colors = {
  brand: { /* existing greens */ },
  surface: {
    DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
    raised:  'rgb(var(--surface-raised) / <alpha-value>)',
    muted:   'rgb(var(--surface-muted) / <alpha-value>)',
    input:   'rgb(var(--surface-input) / <alpha-value>)',
  },
  ink: { primary, secondary, muted, inverse },
  border: { DEFAULT, strong, subtle },
  accent: { primary, success, warning, danger, info },
}
```
CSS variables in `:root` (light) and `:root.dark` (dark) drive the palette. This makes the `:where()` fallback layer in `index.css` unnecessary — tokens give us dark mode for free everywhere.

#### A.2 Component-class catalog
Add to `@layer components` in `index.css`:

| Category | Classes |
|---|---|
| Buttons | `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-ghost`, `.btn-muted`, size modifiers `.btn-sm`, `.btn-lg`, `.btn-icon` |
| Badges | `.badge`, `.badge-soft-{brand,success,warning,danger,info,neutral,violet}`, `.badge-solid-*`, `.badge-outline-*` |
| Pills / chips | `.chip`, `.chip-removable`, `.chip-interactive` |
| Modals | `.modal-backdrop`, `.modal-surface` (existing), `.modal-header`, `.modal-body`, `.modal-footer` |
| Forms | `.form-field`, `.form-label`, `.form-help`, `.form-error`, `.form-row`, `.form-grid` |
| Typography | `.section-title`, `.section-subtitle`, `.eyebrow`, existing `.text-muted/primary/subtle` |
| States | `.empty-state`, `.skeleton`, `.loading-spinner` |
| Layout | `.stack-*`, `.cluster-*`, `.card-grid` |

Each class is defined with `@apply` over tokens, not raw colors. Dark mode is implicit via the token system.

#### A.3 Design system documentation
Create [planning/UI-DESIGN-SYSTEM.md](planning/UI-DESIGN-SYSTEM.md) with:
- Token table (semantic → light/dark values)
- Class catalog (class → visual description → canonical markup example)
- Contribution rules ("prefer a new class over inline Tailwind; prefer extending tokens over new hex values")

A route `/design-system` (dev-only) could render a live gallery of every class for visual regression checks.

#### A.4 Migration
Mechanical sweep, one PR per screen cluster:
1. Replace local `const inp = '...'` with `className="input-surface"`.
2. Replace inline button strings with `.btn-*` classes.
3. Replace color badge strings with `.badge-soft-*` / `.badge-solid-*`.
4. Remove the `:where()` fallback layer from `index.css` once all raw-color usages are gone (keeps behavior honest and CSS smaller).

**Exit criteria:** Zero local input-class variants; zero inline button or badge color strings outside component classes; dark mode works without the fallback layer.

**Deferred to Phase B's integration:** form rendering itself stays hand-written for now. The DSL in Phase B will consume `.form-field` / `.form-label` / `.form-row`, which is exactly why we define them first.

---

### Phase B — Declarative Record Schema (DSL)

**Goal:** Every record type is declared **once** in a single file and drives everything downstream: TS types, localIndex routing, form rendering, markdown export, AI tools, Drive folder placement, title derivation, validation, and human-readable reference docs.

#### B.1 The schema shape

Use Zod as the runtime core (already in deps) plus a side-channel metadata object keyed by field path. Why Zod: gives us runtime validation, TS type inference, and a downstream path to JSON Schema / AI tools. Why side-channel metadata instead of Zod describe-chaining: keeps the schema readable and lets non-Zod consumers (markdown, docs) iterate fields without walking the Zod AST.

```ts
// src/records/_framework.ts
export interface RecordDefinition<Z extends z.ZodType> {
  type: string                       // IndexRecordType
  label: string                      // "Vendor", "Tax Assessment"
  pluralLabel: string
  folderName: string                 // → CATEGORY_FOLDER_NAMES replacement
  icon?: string
  propertyTypes?: PropertyType[]     // which properties this applies to
  allowMultiple: boolean
  schema: Z                          // Zod validator + type source
  fields: FieldDef[]                 // ordered, for forms + markdown + docs
  title: (r: z.infer<Z>) => string   // replaces heuristic
  summary?: (r: z.infer<Z>) => string
  markdown?: (r: z.infer<Z>) => string // optional override; default is generated
  ai?: {
    toolName?: string
    description?: string
    extractionPrompt?: string       // for document capture
    searchable?: (keyof z.infer<Z>)[]
  }
  migrations?: Array<{ from: number; to: number; up: (r: any) => any }>
  version: number
}

export interface FieldDef {
  id: string
  label: string
  kind: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'boolean'
        | 'currency' | 'reference' | 'array' | 'photo'
  options?: readonly string[] | (() => readonly string[])
  unit?: string
  placeholder?: string
  required?: boolean
  aiExtractHint?: string
  helpText?: string
  markdownFormat?: 'bullet' | 'table-row' | 'hidden' | 'table' // for array kinds
  showIn?: { form?: boolean; markdown?: boolean; docs?: boolean; ai?: boolean } // default all true
}
```

#### B.2 Example declaration

```ts
// src/records/vendor.ts
export const VendorZ = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: z.string(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  license: z.string().optional(),
  notes: z.string().optional(),
  propertyIds: z.array(z.string()).min(1),
  rating: z.number().min(1).max(5).optional(),
  lastUsed: z.string().optional(),
})
export type Vendor = z.infer<typeof VendorZ>

export const vendorDef: RecordDefinition<typeof VendorZ> = {
  type: 'vendor',
  label: 'Vendor',
  pluralLabel: 'Vendors',
  folderName: 'Vendors',
  allowMultiple: true,
  schema: VendorZ,
  title: (v) => v.name,
  summary: (v) => `${v.type}${v.phone ? ' · ' + v.phone : ''}`,
  fields: [
    { id: 'name',    label: 'Name',    kind: 'text',    required: true },
    { id: 'type',    label: 'Type',    kind: 'text' },
    { id: 'phone',   label: 'Phone',   kind: 'text' },
    { id: 'email',   label: 'Email',   kind: 'text' },
    { id: 'license', label: 'License', kind: 'text' },
    { id: 'rating',  label: 'Rating',  kind: 'number', unit: 'stars' },
    { id: 'notes',   label: 'Notes',   kind: 'textarea' },
  ],
  ai: {
    toolName: 'get_vendors',
    description: 'Look up saved service vendors/contractors by name or type',
    searchable: ['name', 'type', 'notes'],
  },
  version: 1,
}
```

#### B.3 Generated outputs

From a single `RecordDefinition`:

1. **TypeScript type** — `z.infer<typeof schema>` replaces hand-written interfaces.
2. **Form renderer** — `<RecordForm def={vendorDef} value={v} onChange={...} />` walks `fields[]`, emitting `.form-field` markup from Phase A.
3. **Markdown formatter** — default implementation iterates `fields[]` and renders `# {title}` + field bullets; types override via `markdown()` for tables etc. (e.g., WellTest parameters, generator log entries).
4. **AI tool descriptor** — `buildAITools(registry)` produces OpenRouter tool definitions from `ai` metadata plus `zod-to-json-schema`.
5. **localIndex registration** — registry provides `type`, `title`, `folderName`, `version` to the storage plugin (Phase C).
6. **Human-readable reference** — `planning/RECORD-TYPES.md` auto-generated from the registry: for every type, table of fields, examples, relationships. This is the "structural documentation format" requested.
7. **Runtime validation** — `def.schema.parse(data)` at sync ingress / form submit.
8. **Migrations** — if `record.version < def.version`, run chain of `up()` transforms.

#### B.4 Registry

```ts
// src/records/registry.ts
import { vendorDef } from './vendor'
import { taskDef } from './task'
// ... 19 more
export const RECORDS = {
  vendor: vendorDef,
  task: taskDef,
  ...
} as const
export type RecordType = keyof typeof RECORDS
```

Type-safe everywhere: `RECORDS['vendor'].schema` resolves to `VendorZ` at compile time.

#### B.5 Auto-generated reference doc

A build-time (or dev-time) script `scripts/generate-record-docs.ts` walks `RECORDS` and emits `planning/RECORD-TYPES.md` — one section per record type:

```markdown
## Vendor (`vendor`)
Service vendors and contractors available across properties.

**Folder:** `Vendors/`   **Version:** 1   **Allow multiple:** yes

| Field | Type | Required | Notes |
|---|---|---|---|
| name | text | ✓ | |
| type | text | | |
| phone | text | | |
| ...
```

This doc becomes the authoritative human reference for what records the app manages. A CI check can fail if it drifts from the registry.

#### B.6 Migration

1. Build the framework (`_framework.ts`, `registry.ts`, form renderer, markdown generator, doc generator).
2. Migrate two pilot types: **Vendor** (simple) and **WellTest** (has nested array → exercises complex markdown). Ship them alongside the existing hand-written code to prove the pattern.
3. Migrate remaining 19 types one at a time or in small batches.
4. Delete `src/types/*.ts`, `src/lib/domainMarkdown.ts`, the `exportMarkdown` switch, and the `CATEGORY_FOLDER_NAMES` dict once the migration is complete.

**Exit criteria:** All record types defined in `src/records/*.ts`; `domainMarkdown.ts` deleted; `RECORD-TYPES.md` generated; Zod validates at every store.add / sync ingress.

---

### Phase C — Extract Storage Plugin

**Goal:** A standalone package `@pdrake/recordvault` (working name) that any app can depend on. Inputs: a schema registry (from Phase B) + OAuth token provider. Outputs: local-first, Drive-synced, markdown-quiesced record storage with conflict handling.

#### C.1 Package shape

```
@pdrake/recordvault
├── core/
│   ├── localIndex.ts           // lifted as-is
│   ├── driveClient.ts          // lifted, CATEGORY_FOLDER_NAMES removed
│   ├── syncEngine.ts           // lifted, propertyStore special case removed
│   └── markdownExport.ts       // rewritten to consume registry
├── react/
│   ├── useRecord.ts            // new — subscribe to one record
│   ├── useRecords.ts           // new — subscribe to type+property
│   ├── useSyncStatus.ts        // new
│   └── RecordVaultProvider.tsx // context
├── registry.ts                 // RecordDefinition interface (re-exported from Phase B)
└── index.ts
```

#### C.2 Key changes to extract

| Current coupling | Fix |
|---|---|
| `IndexRecordType` hardcoded union | Accept `type: string`; validation via registry |
| `CATEGORY_FOLDER_NAMES` constant dict | `registry[type].folderName` |
| Title heuristic `label ?? name ?? title ?? provider ?? taskTitle` | `registry[type].title(data)` |
| `exportMarkdown` switch statement | `registry[type].markdown?.(data) ?? defaultMarkdown(registry[type], data)` |
| `propertyStore` special-cased in syncEngine | Expose a `HostMetadataStore` interface the app implements; propertyStore becomes a normal record type in the host app |
| No change notification | Add `localIndex.subscribe(filter, handler)`; `useRecords` wraps it |
| Drive OAuth in `src/auth/oauth.ts` | Library takes a `getToken: () => Promise<string>` injection; does not own OAuth |
| Audit logging has Drive hooks | Split: `AuditLog` is generic; Drive adapter is opt-in |

#### C.3 API sketch

```ts
const vault = createRecordVault({
  registry: RECORDS,                      // from Phase B
  getToken: async () => oauth.getToken(),
  driveRootFolderId: () => currentProperty().driveRootFolderId,
  storage: localStorage,                  // or IDB
  quiesceMarkdownEveryMs: 6 * 60 * 60_000,
  syncEveryMs: 5 * 60_000,
})

// Host-app usage:
const vendors = vault.getAll('vendor', propertyId)
vault.upsert('vendor', { id, name: 'Ohio HVAC', ... })  // validated via Zod
const { data, status } = useRecords(vault, 'vendor', propertyId)  // reactive
```

#### C.4 Backwards compatibility inside the host app

The host app keeps its `src/lib/vendorStore.ts` etc. as thin wrappers over `vault.getAll('vendor', ...)` during migration — then those wrappers are deleted.

#### C.5 Migration

1. Move `localIndex.ts`, `driveClient.ts`, `syncEngine.ts` into `src/vault/core/` as an in-repo library first (monorepo-friendly but no separate publish yet).
2. Parameterize them on the registry. Run tests.
3. Remove the `propertyStore` special case; make it a registered record type.
4. Add `subscribe` + React hooks.
5. Once stable, extract `src/vault/` as its own package (`pnpm workspace` or a separate repo) and consume via `npm link` / workspace reference.
6. Publish to npm or a private registry when other apps want it.

**Exit criteria:** `src/vault/` has zero imports from `src/records/`, `src/types/`, `src/schemas/`, or any other app code except `RecordDefinition` (which lives in the vault package). App can instantiate the vault in three lines.

---

### Phase D — Hardening and Second Consumer

After A + B + C land, the work continues:
- **Runtime validation everywhere**: every `vault.upsert` runs `def.schema.parse`. Invalid Drive records surface in the conflict UI rather than crashing.
- **Auto-docs in CI**: `scripts/generate-record-docs.ts` runs in CI; PR is blocked if `RECORD-TYPES.md` is stale.
- **Design-system regression**: the `/design-system` dev route gets visual snapshot tests.
- **Second consumer app**: prove the extraction by building a trivial second app that consumes `@pdrake/recordvault` with its own registry (e.g., a contact manager or reading log). This is the real test of whether the extraction actually worked.

---

## Part 3 — Risks and Trade-offs

| Risk | Mitigation |
|---|---|
| **DSL becomes a leaky abstraction** — some record types (WellTest with nested parameters array; GeneratorRecord with runtime entry log) have bespoke markdown needs | Escape hatches: `markdown?: (r) => string` overrides the default; `fields[].markdownFormat: 'table'` handles common array cases; custom form widgets via `kind: 'custom'` + render prop |
| **Zod bundle size** | Already in deps; gzip cost is modest (~12kb) and we remove many hand-written types in exchange |
| **Form rendering generality** | Pilot phase uses simple types first; complex forms (EquipmentFormScreen with category-dependent fields) stay hand-written until we've proven the pattern |
| **Storage plugin churn** while migrating | Keep a `src/lib/*Store.ts` façade layer during migration so screens don't change until the end |
| **Design token migration** temporarily breaks dark mode | Keep the `:where()` fallback layer until every surface uses tokens, then delete |
| **Cross-tab reactivity** is a new feature, not just extraction | Scope it to Phase D; Phase C ships without it by simply exposing `subscribe()` and letting host app poll |

---

## Part 4 — Sequencing and Sizing

| Phase | Calendar estimate | Ship-alone? | Depends on |
|---|---|---|---|
| A — Design system | 1–2 weeks | Yes | — |
| B — Schema DSL | 2–3 weeks | Yes (can ship with 2 pilot types) | A (form classes) |
| C — Storage extraction | 1–2 weeks | Yes | B (registry shape) |
| D — Hardening / second consumer | Ongoing | — | A+B+C |

Each phase lands on `master` independently; no big-bang rewrite. At every point the app is shippable.

---

## Appendix — Files That Go Away

Once A+B+C are complete, these files shrink or disappear:

- `src/types/index.ts`, `src/types/insurance.ts`, `src/types/permits.ts`, `src/types/road.ts`, `src/types/generator.ts`, `src/types/checklist.ts` → replaced by Zod schemas in `src/records/*.ts`
- `src/schemas/index.ts` → replaced
- `src/lib/domainMarkdown.ts` → replaced by DSL-driven generator + per-type overrides
- `src/lib/markdownExport.ts` switch statement → replaced by registry dispatch (file stays, shorter)
- `src/lib/vendorStore.ts`, `src/lib/taxStore.ts`, ... (15 files) → collapse to a single factory that consumes the registry
- `CATEGORY_FOLDER_NAMES` in `src/lib/driveClient.ts` → deleted
- Title heuristic in `src/lib/syncedStore.ts` → deleted
- `:where(...)` fallback block in `src/index.css` (lines 80–177) → deleted after token migration

Everything replacing them lives in:
- `src/records/*.ts` (one file per record type, ~50 lines each)
- `src/records/_framework.ts` + `src/records/registry.ts`
- `src/components/RecordForm.tsx` (generic form renderer)
- `src/vault/` (extractable package)
- `planning/RECORD-TYPES.md` (auto-generated)
- `planning/UI-DESIGN-SYSTEM.md` (hand-written catalog + token table)

---

*End of plan. Ready to start Phase A, or iterate on the plan first.*
