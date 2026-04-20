/**
 * Declarative Record Schema DSL — Phase B.
 *
 * A RecordDefinition declares a domain record type once. Downstream code
 * (forms, markdown export, AI tool descriptors, Drive folder routing,
 * title derivation, generated docs, runtime validation) consumes the
 * registry instead of hand-written per-type code.
 */

import type { z } from 'zod'
import type { PropertyType } from '../types'

/** Kinds supported by the default form renderer + markdown generator. */
export type FieldKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'date'
  | 'select'
  | 'boolean'
  | 'reference'   // foreign key to another record type
  | 'array'       // nested list of field bundles (requires `of`)
  | 'photo'
  | 'custom'      // renderer must be provided in consumer UI

/** Where this field participates. Defaults to all true. */
export interface FieldVisibility {
  form?:     boolean
  markdown?: boolean
  docs?:     boolean
  ai?:       boolean
}

export interface FieldDef {
  id: string
  label: string
  kind: FieldKind
  /** For `select` — static list or dynamic getter. */
  options?: readonly string[] | (() => readonly string[])
  /** For `reference` — target record type in the registry. */
  referenceType?: string
  /** For `array` — shape of each element (sub-fields). */
  of?: readonly FieldDef[]
  /** Unit label shown next to numeric values (e.g. "stars", "gal"). */
  unit?: string
  placeholder?: string
  required?: boolean
  helpText?: string
  /** Hint passed to the LLM when extracting from documents. */
  aiExtractHint?: string
  /** How the default markdown generator renders this field. */
  markdownFormat?: 'bullet' | 'table' | 'table-row' | 'hidden'
  showIn?: FieldVisibility
}

/**
 * A pluggable extension of a polymorphic record definition — e.g. one
 * equipment subsystem. The variant adds fields (beyond the base) and
 * may override the folder name, title, and AI extraction prompt.
 */
export interface PolymorphicVariant {
  /** Discriminator value this variant responds to (e.g. 'hvac'). */
  key: string
  /** Human-readable variant label (e.g. 'HVAC'). */
  label: string
  /** Optional icon (emoji or lucide name). */
  icon?: string
  /** Extra fields appended to the base definition's `fields`. */
  fields: readonly FieldDef[]
  /** Override the base `folderName` for records matching this variant. */
  folderName?: string
  /** Override the base `title(r)` for records matching this variant. */
  title?: (record: Record<string, unknown>) => string
  /** Prompt fragment used by the AI document extractor for this variant. */
  extractionPrompt?: string
  /** Subset of property types this variant applies to. */
  propertyTypes?: readonly PropertyType[]
  /** True when many records of this variant can coexist per property. */
  allowMultiple?: boolean
}

/**
 * Declares how a record type dispatches between variants at runtime.
 * Each record carries a discriminator field (e.g. `categoryId`) whose
 * value selects the matching `PolymorphicVariant`.
 */
export interface VariantConfig {
  /** Field id on the record that selects the variant. */
  discriminator: string
  /** Registered variants keyed by discriminator value. */
  variants: Readonly<Record<string, PolymorphicVariant>>
  /** Optional fallback when no variant matches. */
  fallback?: PolymorphicVariant
}

export interface RecordAIConfig {
  /** Tool name (defaults to `get_{type}s` or `search_{type}s`). */
  toolName?: string
  /** Tool description surfaced to the LLM. */
  description?: string
  /** Prompt fragment used when extracting this record from a document. */
  extractionPrompt?: string
  /** Fields searched by `search_records`-style tools (defaults to title field). */
  searchable?: string[]
  /** Set to false to skip generating an AI tool for this record type. */
  expose?: boolean
}

export interface RecordMigration {
  from: number
  to:   number
  up:   (r: Record<string, unknown>) => Record<string, unknown>
}

export interface RecordDefinition<Z extends z.ZodType = z.ZodType> {
  /** localIndex type key — stable across migrations. */
  type: string
  /** Human-readable singular label (e.g. "Vendor"). */
  label: string
  /** Human-readable plural label (e.g. "Vendors"). */
  pluralLabel: string
  /** Drive folder name. Replaces CATEGORY_FOLDER_NAMES entry. */
  folderName: string
  /** Optional icon name (lucide icon id). */
  icon?: string
  /** Which property types this record applies to. Omit for "all". */
  propertyTypes?: readonly PropertyType[]
  /** True if many records of this type can coexist per property. */
  allowMultiple: boolean
  /** Zod schema — source of truth for type + runtime validation. */
  schema: Z
  /** Ordered field descriptors. Used by forms, markdown, docs, AI extraction. */
  fields: readonly FieldDef[]
  /** Derive the display title from a record instance. */
  title: (r: z.infer<Z>) => string
  /** Short one-line summary (optional). */
  summary?: (r: z.infer<Z>) => string
  /** Optional markdown override. If omitted, default generator walks `fields`. */
  markdown?: (r: z.infer<Z>) => string
  /** Optional .md filename override. Default: `<type>_<titleSlug>_<idShort>.md`. */
  filename?: (r: z.infer<Z>) => string
  ai?: RecordAIConfig
  /** Ordered migrations — run if stored record.version < definition.version. */
  migrations?: readonly RecordMigration[]
  /** Schema version — bump when adding a migration. */
  version: number
  /**
   * Where field values live on the record. Default: the record root
   * (i.e. `record[fieldId]`). Set e.g. `'values'` to read/write via a
   * nested bag like `record.values[fieldId]` — used by the equipment
   * record whose subsystem-specific fields are stored under `values`.
   */
  valuePath?: string
  /**
   * Variant plugins — a single record type dispatches to a variant at
   * runtime using the discriminator field (e.g. `equipment` branches
   * on `categoryId` to pick HVAC / Generator / etc. field sets).
   */
  variants?: VariantConfig
}

/** Narrower definition type preserved through the registry for inference. */
export type AnyRecordDefinition = RecordDefinition<z.ZodType>

// ─── Helpers consumers (UI, markdown, sync) use to walk a definition ─────────

export function visibleIn(field: FieldDef, where: keyof FieldVisibility): boolean {
  return field.showIn?.[where] ?? true
}

/** Resolve select options whether declared statically or lazily. */
export function resolveOptions(field: FieldDef): readonly string[] {
  if (!field.options) return []
  return typeof field.options === 'function' ? field.options() : field.options
}

/** Slugify arbitrary text for safe filenames. */
export function slugify(raw: string, max = 40): string {
  return raw.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, max) || 'record'
}

/** Short id suffix used in default filenames. */
export function shortId(id: string): string {
  return id.slice(0, 8)
}

// ─── Variant + value-path resolvers ──────────────────────────────────────────

/** Resolve the matching variant for a record, or null if none applies. */
export function resolveVariant(
  def:    AnyRecordDefinition,
  record: Record<string, unknown>,
): PolymorphicVariant | null {
  if (!def.variants) return null
  const key = String(record[def.variants.discriminator] ?? '')
  return def.variants.variants[key] ?? def.variants.fallback ?? null
}

/**
 * Effective field list for a record — base fields plus the matching variant's
 * fields (deduplicated by id; later entries override earlier ones).
 */
export function resolveFields(
  def:    AnyRecordDefinition,
  record: Record<string, unknown>,
): readonly FieldDef[] {
  const variant = resolveVariant(def, record)
  if (!variant) return def.fields
  const byId = new Map<string, FieldDef>()
  for (const f of def.fields) byId.set(f.id, f)
  for (const f of variant.fields) byId.set(f.id, f)
  return [...byId.values()]
}

/** Resolve the folder name honoring a variant override. */
export function resolveFolderName(
  def:    AnyRecordDefinition,
  record: Record<string, unknown>,
): string {
  return resolveVariant(def, record)?.folderName ?? def.folderName
}

/** Resolve the display title honoring a variant override. */
export function resolveTitle(
  def:    AnyRecordDefinition,
  record: Record<string, unknown>,
): string {
  const variant = resolveVariant(def, record)
  if (variant?.title) return variant.title(record)
  return def.title(record as never)
}

/**
 * Read a field value from a record, honoring the definition's `valuePath`.
 * Falls back to the top-level field when the bag is missing.
 */
export function readFieldValue(
  def:     AnyRecordDefinition,
  record:  Record<string, unknown>,
  fieldId: string,
): unknown {
  if (!def.valuePath) return record[fieldId]
  const bag = record[def.valuePath]
  if (bag && typeof bag === 'object') {
    const value = (bag as Record<string, unknown>)[fieldId]
    if (value !== undefined) return value
  }
  return record[fieldId]
}

/**
 * Write a field value onto a (shallow-cloned) record, honoring
 * `valuePath`. Returns the new record; does not mutate the input.
 */
export function writeFieldValue<T extends Record<string, unknown>>(
  def:     AnyRecordDefinition,
  record:  T,
  fieldId: string,
  value:   unknown,
): T {
  if (!def.valuePath) return { ...record, [fieldId]: value }
  const existing = record[def.valuePath]
  const bag = (existing && typeof existing === 'object')
    ? { ...(existing as Record<string, unknown>) }
    : {}
  bag[fieldId] = value
  return { ...record, [def.valuePath]: bag }
}

/**
 * Register an equipment-style variant into a polymorphic definition.
 * Mutates the `variants.variants` map in place — the typical call site
 * is module-initialization inside each plugin file.
 */
export function registerVariant(def: AnyRecordDefinition, variant: PolymorphicVariant): void {
  if (!def.variants) {
    throw new Error(`Record definition "${def.type}" has no variants config`)
  }
  (def.variants.variants as Record<string, PolymorphicVariant>)[variant.key] = variant
}
