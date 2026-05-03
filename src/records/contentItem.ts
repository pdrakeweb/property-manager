/**
 * Content Item record — movable personal property tracked for insurance
 * documentation and household management. Distinct from `equipment`, which
 * covers fixed/structural systems (HVAC, well, septic, etc.).
 */

import { z } from 'zod'
import type { RecordDefinition } from './_framework'

export const CONTENT_CATEGORIES = [
  'furniture',
  'appliance',
  'electronics',
  'jewelry',
  'art',
  'tools',
  'clothing',
  'other',
] as const

export type ContentCategory = (typeof CONTENT_CATEGORIES)[number]

export const ContentItemZ = z.object({
  id:              z.string(),
  propertyId:      z.string(),
  name:            z.string().min(1),
  category:        z.enum(CONTENT_CATEGORIES),
  location:        z.string().default(''),
  quantity:        z.number().int().min(1).default(1),
  purchaseDate:    z.string().optional(),
  purchasePrice:   z.number().nonnegative().optional(),
  currentValue:    z.number().nonnegative().optional(),
  brand:           z.string().optional(),
  model:           z.string().optional(),
  serialNumber:    z.string().optional(),
  condition:       z.number().int().min(1).max(5).default(3),
  notes:           z.string().optional(),
  photos:          z.array(z.string()).optional(),
  receiptDriveId:  z.string().optional(),
  warrantyExpiry:  z.string().optional(),
  insuredValue:    z.number().nonnegative().optional(),
})

export type ContentItem = z.infer<typeof ContentItemZ>

const CATEGORY_LABEL: Record<ContentCategory, string> = {
  furniture:   'Furniture',
  appliance:   'Appliance',
  electronics: 'Electronics',
  jewelry:     'Jewelry',
  art:         'Art',
  tools:       'Tools',
  clothing:    'Clothing',
  other:       'Other',
}

export function contentCategoryLabel(c: ContentCategory): string {
  return CATEGORY_LABEL[c]
}

export const contentItemDef: RecordDefinition<typeof ContentItemZ> = {
  type:          'content_item',
  label:         'Content Item',
  pluralLabel:   'Content Items',
  folderName:    'Contents',
  icon:          'Package',
  allowMultiple: true,
  schema:        ContentItemZ,
  version:       1,

  title: (i) => i.name,
  summary: (i) => {
    const parts: string[] = []
    if (i.location) parts.push(i.location)
    parts.push(CATEGORY_LABEL[i.category])
    if (i.currentValue != null) parts.push(`$${i.currentValue.toLocaleString()}`)
    return parts.join(' · ')
  },

  fields: [
    { id: 'name',           label: 'Name',           kind: 'text',     required: true },
    { id: 'category',       label: 'Category',       kind: 'select',   options: CONTENT_CATEGORIES, required: true },
    { id: 'location',       label: 'Location',       kind: 'text',     placeholder: 'Living room, garage, master closet…' },
    { id: 'quantity',       label: 'Quantity',       kind: 'number' },
    { id: 'brand',          label: 'Brand',          kind: 'text' },
    { id: 'model',          label: 'Model',          kind: 'text' },
    { id: 'serialNumber',   label: 'Serial #',       kind: 'text' },
    { id: 'purchaseDate',   label: 'Purchase Date',  kind: 'date' },
    { id: 'purchasePrice',  label: 'Purchase Price', kind: 'currency' },
    { id: 'currentValue',   label: 'Current Value',  kind: 'currency' },
    { id: 'insuredValue',   label: 'Insured Value',  kind: 'currency' },
    { id: 'warrantyExpiry', label: 'Warranty Until', kind: 'date' },
    { id: 'condition',      label: 'Condition',      kind: 'number',   unit: 'stars' },
    { id: 'notes',          label: 'Notes',          kind: 'textarea' },
    { id: 'photos',         label: 'Photos',         kind: 'photo',
      showIn: { form: false, markdown: true, docs: false, ai: false } },
    { id: 'receiptDriveId', label: 'Receipt',        kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
  ],

  ai: {
    toolName:    'get_content_items',
    description: 'Look up tracked personal-property items (furniture, electronics, valuables) for insurance documentation.',
    searchable:  ['name', 'brand', 'model', 'location', 'notes'],
  },
}
