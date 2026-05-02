import { z } from 'zod'
import type { RecordDefinition } from './_framework'

export const PropertyZ = z.object({
  id:                z.string(),
  name:              z.string(),
  shortName:         z.string(),
  type:              z.enum(['residence', 'camp', 'land']),
  address:           z.string(),
  driveRootFolderId: z.string(),
  stats:             z.object({ documented: z.number(), total: z.number() }),
  latitude:          z.number().optional(),
  longitude:         z.number().optional(),
  acreage:           z.number().optional(),
  yearBuilt:         z.number().optional(),
})

export type PropertyDsl = z.infer<typeof PropertyZ>

export const propertyDef: RecordDefinition<typeof PropertyZ> = {
  type: 'property',
  label: 'Property',
  pluralLabel: 'Properties',
  folderName: 'Property',
  allowMultiple: false,
  schema: PropertyZ,
  version: 1,
  title: (p) => p.name,
  summary: (p) => `${p.type}${p.address ? ' · ' + p.address : ''}`,
  filename: (p) => `property_${p.id}.md`,
  fields: [
    { id: 'name',              label: 'Full name',  kind: 'text', required: true },
    { id: 'shortName',         label: 'Short name', kind: 'text' },
    { id: 'type',              label: 'Type',       kind: 'select', required: true,
      options: ['residence', 'camp', 'land'] },
    { id: 'address',           label: 'Address',    kind: 'text' },
    { id: 'latitude',          label: 'Latitude',   kind: 'number' },
    { id: 'longitude',         label: 'Longitude',  kind: 'number' },
    { id: 'acreage',           label: 'Acreage',    kind: 'number', unit: 'ac' },
    { id: 'yearBuilt',         label: 'Year built', kind: 'number' },
    { id: 'driveRootFolderId', label: 'Drive root', kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
    { id: 'stats',             label: 'Stats',      kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
  ],
  ai: {
    expose: false,
  },
}
