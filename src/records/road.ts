import { z } from 'zod'
import type { RecordDefinition } from './_framework'

export const RoadEventZ = z.object({
  id:                z.string(),
  propertyId:        z.string(),
  maintenanceTypeId: z.enum(['gravel_delivery', 'culvert_cleaning', 'plowing_service', 'washout_repair', 'vegetation_control', 'gate_maintenance', 'other']),
  date:              z.string(),
  vendor:            z.string(),
  quantity:          z.number().optional(),
  unit:              z.string().optional(),
  areaDescription:   z.string().optional(),
  cost:              z.number().optional(),
  notes:             z.string().optional(),
})

export type RoadEventRecord = z.infer<typeof RoadEventZ>

export const roadDef: RecordDefinition<typeof RoadEventZ> = {
  type: 'road',
  label: 'Road Event',
  pluralLabel: 'Road Maintenance',
  folderName: 'Road Maintenance',
  allowMultiple: true,
  schema: RoadEventZ,
  version: 1,
  title: (e) => `Road · ${e.maintenanceTypeId} · ${e.date}`,
  summary: (e) => `${e.vendor}${e.cost ? ' · $' + e.cost : ''}`,
  filename: (e) => `road_${e.maintenanceTypeId}_${e.date}_${e.id.slice(0, 8)}.md`,
  fields: [
    { id: 'date',              label: 'Date',        kind: 'date', required: true },
    { id: 'maintenanceTypeId', label: 'Type',        kind: 'select', required: true,
      options: ['gravel_delivery', 'culvert_cleaning', 'plowing_service', 'washout_repair', 'vegetation_control', 'gate_maintenance', 'other'] },
    { id: 'vendor',            label: 'Vendor',      kind: 'text', required: true },
    { id: 'quantity',          label: 'Quantity',    kind: 'number' },
    { id: 'unit',               label: 'Unit',       kind: 'text', placeholder: 'tons, yards…' },
    { id: 'areaDescription',   label: 'Area',        kind: 'textarea' },
    { id: 'cost',              label: 'Cost',        kind: 'currency' },
    { id: 'notes',             label: 'Notes',       kind: 'textarea' },
    { id: 'propertyId',        label: 'Property',    kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
  ],
  ai: {
    toolName: 'get_road_events',
    description: 'Road / driveway maintenance history — gravel, plowing, culverts, washouts.',
    searchable: ['maintenanceTypeId', 'vendor', 'areaDescription', 'notes'],
  },
}
