/**
 * Vendor record — pilot definition for the declarative schema DSL.
 *
 * Replaces the hand-written `Vendor` interface in `src/schemas/index.ts`
 * and the matching formatter in `src/lib/domainMarkdown.ts`.
 */

import { z } from 'zod'
import type { RecordDefinition } from './_framework'

export const VendorZ = z.object({
  id:          z.string(),
  name:        z.string().min(1),
  type:        z.string().default(''),
  phone:       z.string().optional(),
  email:       z.string().email().or(z.literal('')).optional(),
  license:     z.string().optional(),
  rating:      z.number().min(1).max(5).optional(),
  lastUsed:    z.string().optional(),
  notes:       z.string().optional(),
  propertyIds: z.array(z.string()).min(1),
})

export type Vendor = z.infer<typeof VendorZ>

export const vendorDef: RecordDefinition<typeof VendorZ> = {
  type:        'vendor',
  label:       'Vendor',
  pluralLabel: 'Vendors',
  folderName:  'Vendors',
  allowMultiple: true,
  schema:      VendorZ,
  version:     1,

  title:   (v) => v.name,
  summary: (v) => (v.type ? `${v.type}${v.phone ? ' · ' + v.phone : ''}` : v.phone || ''),

  fields: [
    { id: 'name',    label: 'Name',    kind: 'text',     required: true },
    { id: 'type',    label: 'Type',    kind: 'text',     placeholder: 'HVAC, plumbing, electrician…' },
    { id: 'phone',   label: 'Phone',   kind: 'text' },
    { id: 'email',   label: 'Email',   kind: 'text' },
    { id: 'license', label: 'License', kind: 'text' },
    { id: 'rating',  label: 'Rating',  kind: 'number',   unit: 'stars' },
    { id: 'lastUsed',label: 'Last Used', kind: 'date' },
    { id: 'notes',   label: 'Notes',   kind: 'textarea' },
    // Not surfaced in forms/markdown — tracked for storage only
    { id: 'propertyIds', label: 'Property IDs', kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
  ],

  ai: {
    toolName:    'get_vendors',
    description: 'Look up saved service vendors/contractors by name or type.',
    searchable:  ['name', 'type', 'notes'],
  },
}
