import { z } from 'zod'
import type { RecordDefinition } from './_framework'

export const FuelDeliveryZ = z.object({
  id:             z.string(),
  propertyId:     z.string(),
  date:           z.string(),
  fuelType:       z.enum(['propane', 'heating_oil', 'diesel', 'gasoline', 'other']),
  gallons:        z.number(),
  pricePerGallon: z.number(),
  totalCost:      z.number(),
  vendorId:       z.string().optional(),
  tankId:         z.string().optional(),
  notes:          z.string().optional(),
})

export type FuelDeliveryRecord = z.infer<typeof FuelDeliveryZ>

export const fuelDeliveryDef: RecordDefinition<typeof FuelDeliveryZ> = {
  type: 'fuel_delivery',
  label: 'Fuel Delivery',
  pluralLabel: 'Fuel Deliveries',
  folderName: 'Fuel Deliveries',
  allowMultiple: true,
  schema: FuelDeliveryZ,
  version: 1,
  title: (d) => `${d.fuelType} · ${d.date}`,
  summary: (d) => `${d.gallons} gal · $${d.totalCost.toLocaleString()}`,
  filename: (d) => `fuel_${d.fuelType}_${d.date}_${d.id.slice(0, 8)}.md`,
  fields: [
    { id: 'date',           label: 'Date',        kind: 'date',     required: true },
    { id: 'fuelType',       label: 'Fuel Type',   kind: 'select',   required: true,
      options: ['propane', 'heating_oil', 'diesel', 'gasoline', 'other'] },
    { id: 'gallons',        label: 'Gallons',     kind: 'number',   required: true, unit: 'gal' },
    { id: 'pricePerGallon', label: 'Price/Gal',   kind: 'currency', required: true },
    { id: 'totalCost',      label: 'Total Cost',  kind: 'currency', required: true },
    { id: 'notes',          label: 'Notes',       kind: 'textarea' },
    { id: 'propertyId',     label: 'Property',    kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
    { id: 'vendorId',       label: 'Vendor',      kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
    { id: 'tankId',         label: 'Tank',        kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
  ],
  ai: {
    toolName: 'get_fuel_deliveries',
    description: 'Propane/heating-oil/fuel deliveries with gallons and price history.',
    searchable: ['fuelType', 'notes'],
  },
}
