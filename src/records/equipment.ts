/**
 * Equipment record — a polymorphic record type whose field set depends on
 * the subsystem category (HVAC, Generator, Well, etc.).
 *
 * The base definition below carries the fields every equipment record has
 * (brand, model, serial, install date, notes). Per-category field sets
 * plug in via the variant system declared in `_framework.ts` — see
 * `src/records/equipmentProfiles.ts` for the concrete subsystem plugins.
 *
 * `valuePath: 'values'` reflects the legacy record shape written by the
 * capture flow: field inputs live under `record.data.values[<fieldId>]`
 * rather than at the top level.
 */

import { z } from 'zod'
import type { RecordDefinition } from './_framework'

export const EquipmentValuesZ = z.record(z.string(), z.string())

export const EquipmentZ = z.object({
  id:           z.string(),
  propertyId:   z.string(),
  categoryId:   z.string(),
  capturedAt:   z.string().optional(),
  mdContent:    z.string().optional(),
  mdFilename:   z.string().optional(),
  filename:     z.string().optional(),
  rootFolderId: z.string().optional(),
  /** Per-category field bag. See `equipmentProfiles.ts` for the schema. */
  values:       EquipmentValuesZ.default({}),
})

export type EquipmentRecordDsl = z.infer<typeof EquipmentZ>

/**
 * Base fields shared by every equipment record. Most subsystem variants
 * redeclare `brand` / `model` / `notes` with category-specific labels or
 * placeholders; those override this list when present (via the dedupe in
 * `resolveFields`).
 */
export const BASE_EQUIPMENT_FIELDS = [
  { id: 'brand',         label: 'Brand',         kind: 'text' as const },
  { id: 'model',         label: 'Model Number',  kind: 'text' as const },
  { id: 'serial_number', label: 'Serial Number', kind: 'text' as const },
  { id: 'install_date',  label: 'Install Date',  kind: 'date' as const },
  { id: 'notes',         label: 'Notes',         kind: 'textarea' as const },
]

/**
 * The registry entry. The `variants.variants` map starts empty — subsystem
 * plugins in `equipmentProfiles.ts` call `registerVariant(equipmentDef, …)`
 * at module load to populate it.
 */
export const equipmentDef: RecordDefinition<typeof EquipmentZ> = {
  type: 'equipment',
  label: 'Equipment',
  pluralLabel: 'Equipment',
  folderName: 'Equipment',
  allowMultiple: true,
  schema: EquipmentZ,
  version: 1,
  valuePath: 'values',

  title: (e) => {
    const v = (e.values ?? {}) as Record<string, string>
    const parts = [v.brand, v.model || v.model_number].filter(Boolean)
    return parts.length > 0 ? parts.join(' ') : `Equipment · ${e.categoryId}`
  },
  summary: (e) => e.categoryId,

  filename: (e) => e.filename || `equipment_${e.id}.json`,

  fields: BASE_EQUIPMENT_FIELDS,

  variants: {
    discriminator: 'categoryId',
    variants: {},
  },

  ai: {
    toolName: 'get_equipment',
    description: 'Installed equipment (HVAC, generator, well, etc.) with nameplate details.',
    searchable: ['categoryId'],
  },
}
