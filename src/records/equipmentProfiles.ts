/**
 * Equipment subsystem plugins — one `PolymorphicVariant` per category.
 *
 * This file is the single source of truth for which fields each
 * subsystem captures. Adding a new subsystem = adding one `profile(...)`
 * call here and a matching folder-name entry in `driveClient.ts`.
 *
 * Consumed by:
 *   - `resolveFields` → merges the base equipment fields with the variant's
 *   - the equipment capture form (replaces the old local `CATEGORY_FIELDS`)
 *   - the AI nameplate extraction prompt (`variant.extractionPrompt`)
 *   - markdown export / filename derivation via `resolveFolderName`
 */

import type { FieldDef, PolymorphicVariant } from './_framework'
import { registerVariant } from './_framework'
import { equipmentDef } from './equipment'

/** Small helper — default nameplate extraction prompt for a category. */
function extractionPrompt(label: string, fieldIds: string[]): string {
  return (
    `This is a photo of a ${label} equipment nameplate or data tag. ` +
    `Extract the following fields: ${fieldIds.join(', ')}. ` +
    `For date fields, use YYYY-MM-DD format. ` +
    `Return confidence high/medium/low for each field. ` +
    `If a field is not visible on the nameplate, return value "" with confidence "low".`
  )
}

function profile(opts: {
  key:         string
  label:       string
  icon?:       string
  folderName:  string
  fields:      readonly FieldDef[]
  allowMultiple?: boolean
}): PolymorphicVariant {
  return {
    key:             opts.key,
    label:           opts.label,
    icon:            opts.icon,
    fields:          opts.fields,
    folderName:      opts.folderName,
    allowMultiple:   opts.allowMultiple ?? true,
    extractionPrompt: extractionPrompt(opts.label, opts.fields.map(f => f.id)),
  }
}

export const EQUIPMENT_PROFILES: PolymorphicVariant[] = [
  profile({
    key: 'generator', label: 'Generator', icon: '⚡', folderName: 'Generator',
    allowMultiple: false,
    fields: [
      { id: 'brand',                 label: 'Brand',                  kind: 'text' },
      { id: 'model',                 label: 'Model Name',             kind: 'text' },
      { id: 'model_number',          label: 'Model Number',           kind: 'text' },
      { id: 'serial_number',         label: 'Serial Number',          kind: 'text' },
      { id: 'kw_rating',             label: 'Output',                 kind: 'number', unit: 'kW' },
      { id: 'fuel_type',             label: 'Fuel Type',              kind: 'select',
        options: ['Propane', 'Natural Gas', 'Gasoline', 'Diesel'] },
      { id: 'transfer_switch_brand', label: 'Transfer Switch Brand',  kind: 'text' },
      { id: 'transfer_switch_amps',  label: 'Transfer Switch Amps',   kind: 'number', unit: 'A' },
      { id: 'oil_type',              label: 'Engine Oil Type',        kind: 'text', placeholder: 'e.g. 5W-30 Synthetic' },
      { id: 'oil_capacity_qt',       label: 'Oil Capacity',           kind: 'number', unit: 'qt' },
      { id: 'air_filter_part',       label: 'Air Filter Part #',      kind: 'text' },
      { id: 'last_service_date',     label: 'Last Service Date',      kind: 'date' },
      { id: 'notes',                 label: 'Notes',                  kind: 'textarea' },
    ],
  }),

  profile({
    key: 'hvac', label: 'HVAC', icon: '🌡', folderName: 'HVAC',
    fields: [
      { id: 'unit_type',        label: 'Unit Type',       kind: 'select',
        options: ['Furnace', 'Air Conditioner', 'Heat Pump', 'Air Handler', 'Mini-Split'] },
      { id: 'unit_label',       label: 'Zone / Label',    kind: 'text', placeholder: 'e.g. Main Floor, Sunroom' },
      { id: 'brand',            label: 'Brand',           kind: 'text' },
      { id: 'model',            label: 'Model Number',    kind: 'text' },
      { id: 'serial_number',    label: 'Serial Number',   kind: 'text' },
      { id: 'install_date',     label: 'Install Date',    kind: 'date' },
      { id: 'tonnage',          label: 'Cooling Tonnage', kind: 'number', unit: 'tons' },
      { id: 'seer',             label: 'SEER Rating',     kind: 'number' },
      { id: 'refrigerant_type', label: 'Refrigerant',     kind: 'select',
        options: ['R-410A', 'R-32', 'R-22', 'R-454B'] },
      { id: 'filter_size',      label: 'Filter Size',     kind: 'text', placeholder: 'e.g. 20×25×4' },
      { id: 'notes',            label: 'Notes',           kind: 'textarea' },
    ],
  }),

  profile({
    key: 'water_heater', label: 'Water Heater', icon: '🚿', folderName: 'Water Heater',
    allowMultiple: false,
    fields: [
      { id: 'brand',         label: 'Brand',         kind: 'text' },
      { id: 'model',         label: 'Model Number',  kind: 'text' },
      { id: 'serial_number', label: 'Serial Number', kind: 'text' },
      { id: 'fuel_type',     label: 'Fuel Type',     kind: 'select',
        options: ['Natural Gas', 'Propane', 'Electric', 'Heat Pump', 'Tankless Gas'] },
      { id: 'tank_gallons',  label: 'Tank Capacity', kind: 'number', unit: 'gal' },
      { id: 'btu_input',     label: 'BTU Input',     kind: 'number', unit: 'BTU' },
      { id: 'install_date',  label: 'Install Date',  kind: 'date' },
      { id: 'notes',         label: 'Notes',         kind: 'textarea' },
    ],
  }),

  profile({
    key: 'water_treatment', label: 'Water Treatment', icon: '💧', folderName: 'Water Treatment',
    fields: [
      { id: 'system_type',   label: 'System Type',   kind: 'select',
        options: ['Water Softener', 'Iron Filter', 'UV Disinfection', 'RO System', 'Whole House Filter'] },
      { id: 'brand',         label: 'Brand',         kind: 'text' },
      { id: 'model',         label: 'Model Number',  kind: 'text' },
      { id: 'serial_number', label: 'Serial Number', kind: 'text' },
      { id: 'install_date',  label: 'Install Date',  kind: 'date' },
      { id: 'location',      label: 'Location',      kind: 'text', placeholder: 'e.g. Utility room' },
      { id: 'notes',         label: 'Notes',         kind: 'textarea' },
    ],
  }),

  profile({
    key: 'appliance', label: 'Appliance', icon: '🍳', folderName: 'Appliances',
    fields: [
      { id: 'appliance_type', label: 'Appliance Type', kind: 'select',
        options: ['Refrigerator', 'Dishwasher', 'Range/Oven', 'Microwave', 'Washer', 'Dryer', 'Freezer', 'Garbage Disposal', 'Garage Door Opener', 'Other'] },
      { id: 'brand',          label: 'Brand',          kind: 'text' },
      { id: 'model',          label: 'Model Number',   kind: 'text' },
      { id: 'serial_number',  label: 'Serial Number',  kind: 'text' },
      { id: 'install_date',   label: 'Purchase / Install Date', kind: 'date' },
      { id: 'location',       label: 'Location',       kind: 'text', placeholder: 'e.g. Kitchen, Garage' },
      { id: 'notes',          label: 'Notes',          kind: 'textarea' },
    ],
  }),

  profile({
    key: 'propane', label: 'Propane', icon: '⛽', folderName: 'Propane',
    allowMultiple: false,
    fields: [
      { id: 'supplier',       label: 'Supplier',        kind: 'text', placeholder: 'e.g. Ferrellgas' },
      { id: 'tank_gallons',   label: 'Tank Capacity',   kind: 'number', unit: 'gal' },
      { id: 'ownership',      label: 'Tank Ownership',  kind: 'select', options: ['Owned', 'Rented/Leased'] },
      { id: 'tank_age_year',  label: 'Tank Year',       kind: 'number', placeholder: 'e.g. 2006' },
      { id: 'location',       label: 'Location',        kind: 'text',   placeholder: 'e.g. South yard' },
      { id: 'account_number', label: 'Account Number',  kind: 'text' },
      { id: 'notes',          label: 'Notes',           kind: 'textarea' },
    ],
  }),

  profile({
    key: 'well', label: 'Well System', icon: '🔋', folderName: 'Well System',
    allowMultiple: false,
    fields: [
      { id: 'pump_brand',    label: 'Pump Brand',          kind: 'text' },
      { id: 'pump_model',    label: 'Pump Model',          kind: 'text' },
      { id: 'pump_hp',       label: 'Pump HP',             kind: 'number', unit: 'HP' },
      { id: 'well_depth_ft', label: 'Well Depth',          kind: 'number', unit: 'ft' },
      { id: 'tank_brand',    label: 'Pressure Tank Brand', kind: 'text' },
      { id: 'tank_gallons',  label: 'Tank Capacity',       kind: 'number', unit: 'gal' },
      { id: 'install_date',  label: 'Install Date',        kind: 'date' },
      { id: 'notes',         label: 'Notes',               kind: 'textarea' },
    ],
  }),

  profile({
    key: 'septic', label: 'Septic System', icon: '🧹', folderName: 'Septic System',
    allowMultiple: false,
    fields: [
      { id: 'tank_gallons',    label: 'Tank Capacity',  kind: 'number', unit: 'gal' },
      { id: 'tank_material',   label: 'Tank Material',  kind: 'select', options: ['Concrete', 'Fiberglass', 'Plastic'] },
      { id: 'last_pumped',     label: 'Last Pumped',    kind: 'date' },
      { id: 'pump_company',    label: 'Pump Company',   kind: 'text' },
      { id: 'drainfield_info', label: 'Drainfield Info', kind: 'textarea' },
      { id: 'notes',           label: 'Notes',          kind: 'textarea' },
    ],
  }),

  profile({
    key: 'electrical', label: 'Electrical Panel', icon: '🔌', folderName: 'Electrical Panel',
    fields: [
      { id: 'panel_type',    label: 'Panel Type',   kind: 'select', options: ['Main Panel', 'Sub Panel'] },
      { id: 'brand',         label: 'Brand',        kind: 'text', placeholder: 'e.g. Square D, Eaton' },
      { id: 'amps',          label: 'Amperage',     kind: 'number', unit: 'A' },
      { id: 'circuits',      label: 'Circuit Count', kind: 'number' },
      { id: 'location',      label: 'Location',     kind: 'text', placeholder: 'e.g. Basement utility room' },
      { id: 'install_date',  label: 'Install Date', kind: 'date' },
      { id: 'notes',         label: 'Notes / Circuit Directory', kind: 'textarea' },
    ],
  }),

  profile({
    key: 'roof', label: 'Roof', icon: '🏠', folderName: 'Roof',
    fields: [
      { id: 'section',        label: 'Section / Area', kind: 'text', placeholder: 'e.g. Main House, Barn, Addition' },
      { id: 'material',       label: 'Material',       kind: 'select',
        options: ['Asphalt Shingle', 'Metal Standing Seam', 'Metal Corrugated', 'EPDM Rubber', 'TPO', 'Cedar Shake', 'Slate', 'Other'] },
      { id: 'install_date',   label: 'Install Date',   kind: 'date' },
      { id: 'contractor',     label: 'Contractor',     kind: 'text' },
      { id: 'warranty_years', label: 'Warranty Years', kind: 'number', unit: 'yr' },
      { id: 'color',          label: 'Color / Style',  kind: 'text' },
      { id: 'notes',          label: 'Notes',          kind: 'textarea' },
    ],
  }),

  profile({
    key: 'sump_pump', label: 'Sump Pump', icon: '🌊', folderName: 'Sump Pump',
    fields: [
      { id: 'pump_type',    label: 'Pump Type',  kind: 'select',
        options: ['Primary Electric', 'Battery Backup', 'Water-Powered Backup'] },
      { id: 'brand',        label: 'Brand',        kind: 'text' },
      { id: 'model',        label: 'Model',        kind: 'text' },
      { id: 'hp',           label: 'HP Rating',    kind: 'number', unit: 'HP' },
      { id: 'install_date', label: 'Install Date', kind: 'date' },
      { id: 'location',     label: 'Pit Location', kind: 'text' },
      { id: 'notes',        label: 'Notes',        kind: 'textarea' },
    ],
  }),

  profile({
    key: 'radon', label: 'Radon Mitigation', icon: '☢', folderName: 'Radon Mitigation',
    allowMultiple: false,
    fields: [
      { id: 'contractor',      label: 'Installer',       kind: 'text' },
      { id: 'install_date',    label: 'Install Date',    kind: 'date' },
      { id: 'fan_brand',       label: 'Fan Brand/Model', kind: 'text' },
      { id: 'last_test_level', label: 'Last Test Level', kind: 'number', unit: 'pCi/L' },
      { id: 'last_test_date',  label: 'Last Test Date',  kind: 'date' },
      { id: 'notes',           label: 'Notes',           kind: 'textarea' },
    ],
  }),

  profile({
    key: 'barn', label: 'Barn', icon: '🏚', folderName: 'Barn',
    fields: [
      { id: 'structure_year', label: 'Built / Estimated Year', kind: 'number' },
      { id: 'size_sqft',      label: 'Square Footage',         kind: 'number', unit: 'sq ft' },
      { id: 'electrical',     label: 'Electrical',             kind: 'text', placeholder: 'e.g. 100A sub-panel, 4 circuits' },
      { id: 'roof_material',  label: 'Roof Material',          kind: 'text' },
      { id: 'condition',      label: 'Overall Condition',      kind: 'select',
        options: ['Good', 'Fair', 'Poor', 'Needs Attention'] },
      { id: 'notes',          label: 'Notes',                  kind: 'textarea' },
    ],
  }),

  profile({
    key: 'surveillance', label: 'Surveillance', icon: '📷', folderName: 'Surveillance',
    fields: [
      { id: 'camera_brand', label: 'Camera Brand',    kind: 'text', placeholder: 'e.g. Reolink, Hikvision' },
      { id: 'camera_model', label: 'Camera Model',    kind: 'text' },
      { id: 'location',     label: 'Camera Location', kind: 'text', placeholder: 'e.g. Driveway, Back door' },
      { id: 'resolution',   label: 'Resolution',      kind: 'select', options: ['1080p', '4MP', '4K/8MP', 'Other'] },
      { id: 'nvr_brand',    label: 'NVR/DVR Brand',   kind: 'text' },
      { id: 'ip_address',   label: 'IP Address',      kind: 'text', placeholder: 'e.g. 192.168.1.x' },
      { id: 'notes',        label: 'Notes',           kind: 'textarea' },
    ],
  }),

  profile({
    key: 'forestry_cauv', label: 'Forestry CAUV', icon: '🌲', folderName: 'Forestry CAUV',
    fields: [
      { id: 'record_type', label: 'Record Type',         kind: 'select',
        options: ['CAUV Renewal', 'Timber Harvest', 'Tree Planting', 'Forest Management Plan', 'Boundary Survey', 'Other'] },
      { id: 'date',        label: 'Activity Date',       kind: 'date' },
      { id: 'acres',       label: 'Acres Affected',      kind: 'number', unit: 'ac' },
      { id: 'contractor',  label: 'Contractor / Agency', kind: 'text' },
      { id: 'notes',       label: 'Notes',               kind: 'textarea' },
    ],
  }),

  profile({
    key: 'service_record', label: 'Service Record', icon: '🛠', folderName: 'Service Records',
    fields: [
      { id: 'system',      label: 'System / Area',     kind: 'text', placeholder: 'e.g. Generator, HVAC, Well' },
      { id: 'date',        label: 'Service Date',      kind: 'date' },
      { id: 'contractor',  label: 'Contractor',        kind: 'text' },
      { id: 'work_done',   label: 'Work Performed',    kind: 'textarea', placeholder: 'Describe what was done' },
      { id: 'cost',        label: 'Total Cost',        kind: 'currency' },
      { id: 'invoice_ref', label: 'Invoice Reference', kind: 'text' },
      { id: 'notes',       label: 'Notes',             kind: 'textarea' },
    ],
  }),
]

// Register every profile into the equipment definition's variant map
for (const p of EQUIPMENT_PROFILES) registerVariant(equipmentDef, p)

/** Lookup helper — returns the profile for a category id, or null. */
export function getEquipmentProfile(categoryId: string): PolymorphicVariant | null {
  return EQUIPMENT_PROFILES.find(p => p.key === categoryId) ?? null
}

/** All registered category ids, in declaration order. */
export function listEquipmentCategories(): string[] {
  return EQUIPMENT_PROFILES.map(p => p.key)
}
