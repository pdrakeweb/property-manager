/**
 * All 15 capture categories with fully-specified field schemas.
 * Field definitions sourced from property-capture-tool-spec.md §6.
 */

// FolderMap was removed — driveFolderId is populated at runtime by DriveClient.resolveFolderId
const DRIVE_FOLDER_MAP: Record<string, string> = {}

// ─── Types ─────────────────────────────────────────────────────────────────────

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'textarea' | 'boolean'

export interface Field {
  id: string
  label: string
  type: FieldType
  options?: string[]
  placeholder?: string
  aiExtractHint?: string
  required?: boolean
  unit?: string
}

export interface CaptureCategory {
  id: string
  label: string
  icon: string
  driveFolderId: string
  allowMultiple: boolean
  nameplatePrompt?: string
  fields: Field[]
}

// ─── Category definitions ──────────────────────────────────────────────────────

const generator: CaptureCategory = {
  id: 'generator',
  label: 'Generator',
  icon: '⚡',
  driveFolderId: DRIVE_FOLDER_MAP.generator,
  allowMultiple: false,
  nameplatePrompt:
    'Extract generator nameplate data. Key fields: brand, model, model_number, serial_number, rated_kw, rated_kva, voltage_output, frequency_hz, fuel_type, rpm, manufacture_date.',
  fields: [
    { id: 'brand',                 label: 'Brand',                  type: 'text' },
    { id: 'model',                 label: 'Model Name',             type: 'text' },
    { id: 'model_number',          label: 'Model Number',           type: 'text' },
    { id: 'serial_number',         label: 'Serial Number',          type: 'text' },
    { id: 'kw_rating',             label: 'Output (kW)',            type: 'number', unit: 'kW' },
    { id: 'fuel_type',             label: 'Fuel Type',              type: 'select', options: ['Propane', 'Natural Gas', 'Gasoline', 'Diesel'] },
    { id: 'transfer_switch_brand', label: 'Transfer Switch Brand',  type: 'text' },
    { id: 'transfer_switch_amps',  label: 'Transfer Switch Amps',   type: 'number', unit: 'A' },
    { id: 'transfer_switch_type',  label: 'Transfer Switch Type',   type: 'select', options: ['Automatic', 'Manual', 'Load-Side', 'Service Entrance'] },
    { id: 'oil_type',              label: 'Engine Oil Type',        type: 'text', placeholder: 'e.g. 5W-30 Synthetic' },
    { id: 'oil_capacity_qt',       label: 'Oil Capacity (qt)',      type: 'number', unit: 'qt' },
    { id: 'air_filter_part',       label: 'Air Filter Part #',      type: 'text' },
    { id: 'spark_plug_part',       label: 'Spark Plug Part #',      type: 'text' },
    { id: 'last_service_date',     label: 'Last Service Date',      type: 'date' },
    { id: 'service_interval',      label: 'Service Interval',       type: 'text', placeholder: 'e.g. Annual / 200 hrs' },
    { id: 'covered_circuits',      label: 'Covered Circuits',       type: 'textarea', placeholder: 'List circuits on transfer switch' },
    { id: 'notes',                 label: 'Notes',                  type: 'textarea' },
  ],
}

const hvac: CaptureCategory = {
  id: 'hvac',
  label: 'HVAC',
  icon: '❄️',
  driveFolderId: DRIVE_FOLDER_MAP.hvac,
  allowMultiple: true,
  nameplatePrompt:
    'Extract HVAC equipment nameplate data. Key fields: brand, model, serial_number, btu_input, btu_output, afue_percent, tonnage, seer, refrigerant_type, voltage, amperage, manufacture_date.',
  fields: [
    { id: 'unit_type',          label: 'Unit Type',              type: 'select', options: ['Furnace', 'Air Conditioner', 'Heat Pump', 'Air Handler', 'Mini-Split'] },
    { id: 'unit_label',         label: 'Unit Label / Zone',      type: 'text', placeholder: 'e.g. Main Floor, Upstairs, Sunroom' },
    { id: 'brand',              label: 'Brand',                  type: 'text' },
    { id: 'model',              label: 'Model Number',           type: 'text' },
    { id: 'serial_number',      label: 'Serial Number',          type: 'text' },
    { id: 'install_date',       label: 'Install Date',           type: 'date' },
    { id: 'btu_input',          label: 'BTU Input',              type: 'number', unit: 'BTU/hr' },
    { id: 'btu_output',         label: 'BTU Output',             type: 'number', unit: 'BTU/hr' },
    { id: 'afue',               label: 'AFUE (%)',               type: 'number', unit: '%' },
    { id: 'tonnage',            label: 'Cooling Tonnage',        type: 'number', unit: 'tons' },
    { id: 'seer',               label: 'SEER Rating',            type: 'number' },
    { id: 'refrigerant_type',   label: 'Refrigerant Type',       type: 'select', options: ['R-410A', 'R-32', 'R-22', 'R-454B', 'Other'] },
    { id: 'filter_size',        label: 'Filter Size (LxWxD)',    type: 'text', placeholder: 'e.g. 20x25x1' },
    { id: 'filter_merv',        label: 'Filter MERV Rating',     type: 'number' },
    { id: 'filter_interval',    label: 'Filter Change Interval', type: 'text', placeholder: 'e.g. 90 days' },
    { id: 'thermostat_brand',   label: 'Thermostat Brand',       type: 'text' },
    { id: 'thermostat_model',   label: 'Thermostat Model',       type: 'text' },
    { id: 'last_service_date',  label: 'Last Service Date',      type: 'date' },
    { id: 'service_contractor', label: 'Service Contractor',     type: 'text' },
    { id: 'notes',              label: 'Notes',                  type: 'textarea' },
  ],
}

const waterHeater: CaptureCategory = {
  id: 'water_heater',
  label: 'Water Heater',
  icon: '🌡️',
  driveFolderId: DRIVE_FOLDER_MAP.water_heater,
  allowMultiple: false,
  nameplatePrompt:
    'Extract water heater nameplate data. Key fields: brand, model, serial_number, tank_gallons, btu_input, first_hour_rating, fuel_type, voltage, manufacture_date.',
  fields: [
    { id: 'brand',              label: 'Brand',                     type: 'text' },
    { id: 'model',              label: 'Model Number',              type: 'text' },
    { id: 'serial_number',      label: 'Serial Number',             type: 'text' },
    { id: 'fuel_type',          label: 'Fuel Type',                 type: 'select', options: ['Propane', 'Natural Gas', 'Electric', 'Heat Pump/Hybrid'] },
    { id: 'tank_gallons',       label: 'Tank Size (gal)',           type: 'number', unit: 'gal' },
    { id: 'btu_input',          label: 'BTU Input',                 type: 'number', unit: 'BTU/hr' },
    { id: 'first_hour_rating',  label: 'First Hour Rating',         type: 'number', unit: 'gal' },
    { id: 'install_year',       label: 'Install Year',              type: 'number' },
    { id: 'anode_last_checked', label: 'Anode Rod Last Checked',    type: 'date' },
    { id: 'expansion_tank',     label: 'Expansion Tank Present',    type: 'boolean' },
    { id: 'notes',              label: 'Notes',                     type: 'textarea' },
  ],
}

const waterTreatment: CaptureCategory = {
  id: 'water_treatment',
  label: 'Water Treatment',
  icon: '💧',
  driveFolderId: DRIVE_FOLDER_MAP.water_treatment,
  allowMultiple: true,
  nameplatePrompt:
    'Extract water treatment equipment nameplate data. Key fields: brand, model, serial_number, equipment_type, tank_size, flow_rate, voltage, manufacture_date.',
  fields: [
    { id: 'equipment_type',   label: 'Equipment Type',     type: 'select', options: ['Water Softener', 'Iron Filter', 'UV Sterilizer', 'Sediment Filter', 'Carbon Filter', 'RO System'] },
    { id: 'brand',            label: 'Brand',              type: 'text' },
    { id: 'model',            label: 'Model Number',       type: 'text' },
    { id: 'serial_number',    label: 'Serial Number',      type: 'text' },
    { id: 'install_date',     label: 'Install Date',       type: 'date' },
    { id: 'resin_tank_size',  label: 'Resin Tank Size',    type: 'text', placeholder: 'e.g. 10x54' },
    { id: 'salt_type',        label: 'Salt Type',          type: 'select', options: ['Solar', 'Evaporated', 'Rock', 'Potassium Chloride'] },
    { id: 'regen_schedule',   label: 'Regen Schedule',     type: 'text', placeholder: 'e.g. Every 7 days at 2am' },
    { id: 'media_type',       label: 'Filter Media Type',  type: 'text', placeholder: 'e.g. Birm, Greensand, KDF' },
    { id: 'uv_lamp_part',     label: 'UV Lamp Part #',     type: 'text' },
    { id: 'last_service_date',label: 'Last Service Date',  type: 'date' },
    { id: 'notes',            label: 'Notes',              type: 'textarea' },
  ],
}

const wellSystem: CaptureCategory = {
  id: 'well',
  label: 'Well System',
  icon: '🪣',
  driveFolderId: DRIVE_FOLDER_MAP.well,
  allowMultiple: false,
  nameplatePrompt:
    'Extract well pump and pressure tank nameplate data. Key fields: pump_brand, pump_model, pump_hp, pump_gpm, pressure_tank_brand, pressure_tank_model, pressure_tank_gallons, cut_in_psi, cut_out_psi.',
  fields: [
    { id: 'well_depth_ft',        label: 'Well Depth (ft)',          type: 'number', unit: 'ft' },
    { id: 'pump_brand',           label: 'Pump Brand',               type: 'text' },
    { id: 'pump_model',           label: 'Pump Model',               type: 'text' },
    { id: 'pump_hp',              label: 'Pump HP',                  type: 'number', unit: 'HP' },
    { id: 'pump_gpm',             label: 'Pump GPM Rating',          type: 'number', unit: 'GPM' },
    { id: 'pump_depth_set_ft',    label: 'Pump Depth Set (ft)',      type: 'number', unit: 'ft' },
    { id: 'pressure_tank_brand',  label: 'Pressure Tank Brand',      type: 'text' },
    { id: 'pressure_tank_model',  label: 'Pressure Tank Model',      type: 'text' },
    { id: 'pressure_tank_gal',    label: 'Pressure Tank Size (gal)', type: 'number', unit: 'gal' },
    { id: 'cut_in_psi',           label: 'Cut-In PSI',               type: 'number', unit: 'PSI' },
    { id: 'cut_out_psi',          label: 'Cut-Out PSI',              type: 'number', unit: 'PSI' },
    { id: 'precharge_psi',        label: 'Tank Pre-Charge PSI',      type: 'number', unit: 'PSI' },
    { id: 'last_water_test',      label: 'Last Water Test Date',     type: 'date' },
    { id: 'notes',                label: 'Notes',                    type: 'textarea' },
  ],
}

const propane: CaptureCategory = {
  id: 'propane',
  label: 'Propane Tank',
  icon: '🔥',
  driveFolderId: DRIVE_FOLDER_MAP.propane,
  allowMultiple: false,
  nameplatePrompt:
    'Extract propane tank nameplate data. Key fields: tank_capacity_gallons, manufacturer, serial_number, manufacture_date, wc_gallons, tare_weight.',
  fields: [
    { id: 'tank_capacity_gal',    label: 'Tank Capacity (gal)',      type: 'number', unit: 'gal' },
    { id: 'ownership',            label: 'Owned or Leased',          type: 'select', options: ['Owned', 'Leased'] },
    { id: 'supplier_name',        label: 'Supplier Name',            type: 'text' },
    { id: 'account_number',       label: 'Account Number',           type: 'text' },
    { id: 'delivery_type',        label: 'Delivery Type',            type: 'select', options: ['Automatic', 'Will-Call'] },
    { id: 'supplier_phone',       label: 'Supplier Phone',           type: 'text' },
    { id: 'tank_serial',          label: 'Tank Serial Number',       type: 'text' },
    { id: 'regulator_outlet_psi', label: 'Regulator Outlet PSI',    type: 'number', unit: 'PSI' },
    { id: 'lease_terms',          label: 'Lease Terms / Buyout',     type: 'textarea' },
    { id: 'appliances_served',    label: 'Appliances Served',        type: 'textarea', placeholder: 'List all propane appliances + BTU loads' },
    { id: 'notes',                label: 'Notes',                    type: 'textarea' },
  ],
}

const septic: CaptureCategory = {
  id: 'septic',
  label: 'Septic System',
  icon: '♻️',
  driveFolderId: DRIVE_FOLDER_MAP.septic,
  allowMultiple: false,
  fields: [
    { id: 'tank_size_gal',        label: 'Tank Size (gal)',              type: 'number', unit: 'gal' },
    { id: 'tank_material',        label: 'Tank Material',                type: 'select', options: ['Concrete', 'Fiberglass', 'Polyethylene'] },
    { id: 'tank_location',        label: 'Tank Location Notes',          type: 'textarea', placeholder: 'Describe location relative to structures; reference GPS pin or sketch' },
    { id: 'access_risers',        label: 'Access Riser Locations',       type: 'textarea' },
    { id: 'drainfield_location',  label: 'Drainfield Location Notes',    type: 'textarea' },
    { id: 'last_pump_date',       label: 'Last Pump Date',               type: 'date' },
    { id: 'pump_company',         label: 'Pumping Company',              type: 'text' },
    { id: 'pump_interval',        label: 'Recommended Pump Interval',    type: 'text', placeholder: 'e.g. Every 3 years' },
    { id: 'permit_on_file',       label: 'As-Built Permit on File',      type: 'boolean' },
    { id: 'notes',                label: 'Notes',                        type: 'textarea' },
  ],
}

const electricalPanel: CaptureCategory = {
  id: 'electrical',
  label: 'Electrical Panel',
  icon: '🔌',
  driveFolderId: DRIVE_FOLDER_MAP.electrical,
  allowMultiple: true,
  fields: [
    { id: 'panel_label',          label: 'Panel Label',             type: 'text', placeholder: 'e.g. Main House, Barn' },
    { id: 'brand',                label: 'Panel Brand',             type: 'text' },
    { id: 'amperage',             label: 'Main Breaker (A)',         type: 'number', unit: 'A' },
    { id: 'breaker_count',        label: 'Breaker Spaces',          type: 'number' },
    { id: 'location',             label: 'Physical Location',       type: 'text' },
    { id: 'feed_source',          label: 'Feed Source',             type: 'text', placeholder: 'e.g. Utility service entrance, or subpanel fed from main via 4/3 AWG' },
    { id: 'wire_size_to_panel',   label: 'Wire Size (subpanels)',   type: 'text', unit: 'AWG' },
    { id: 'circuit_directory',    label: 'Circuit Directory',       type: 'textarea', placeholder: 'Slot | Amps | Label' },
    { id: 'notes',                label: 'Notes',                   type: 'textarea' },
  ],
}

const appliance: CaptureCategory = {
  id: 'appliance',
  label: 'Appliance',
  icon: '🍳',
  driveFolderId: DRIVE_FOLDER_MAP.appliance,
  allowMultiple: true,
  nameplatePrompt:
    'Extract appliance nameplate data. Key fields: brand, model, serial_number, appliance_type, voltage, amperage, wattage, fuel_type, capacity, manufacture_date.',
  fields: [
    { id: 'appliance_type',  label: 'Appliance Type',         type: 'select', options: ['Refrigerator', 'Range/Oven', 'Dishwasher', 'Microwave', 'Range Hood', 'Washer', 'Dryer', 'Freezer', 'Humidifier', 'Garage Door Opener', 'Other'] },
    { id: 'location',        label: 'Location',               type: 'text', placeholder: 'e.g. Kitchen, Laundry Room, Garage' },
    { id: 'brand',           label: 'Brand',                  type: 'text' },
    { id: 'model',           label: 'Model Number',           type: 'text' },
    { id: 'serial_number',   label: 'Serial Number',          type: 'text' },
    { id: 'fuel_type',       label: 'Fuel / Power Type',      type: 'select', options: ['Electric (120V)', 'Electric (240V)', 'Propane', 'Natural Gas', 'N/A'] },
    { id: 'purchase_date',   label: 'Purchase Date',          type: 'date' },
    { id: 'filter_part',     label: 'Filter Part # (if applicable)', type: 'text' },
    { id: 'notes',           label: 'Notes',                  type: 'textarea' },
  ],
}

const roof: CaptureCategory = {
  id: 'roof',
  label: 'Roof',
  icon: '🏠',
  driveFolderId: DRIVE_FOLDER_MAP.roof,
  allowMultiple: true,
  fields: [
    { id: 'section_label',        label: 'Section Label',               type: 'text', placeholder: 'e.g. Main House Shingle, Barn Standing Seam' },
    { id: 'contractor',           label: 'Contractor',                  type: 'text' },
    { id: 'install_date',         label: 'Install Date',                type: 'date' },
    { id: 'material_type',        label: 'Material Type',               type: 'select', options: ['Asphalt Shingle', 'Standing Seam Metal', 'Corrugated Metal', 'TPO', 'EPDM', 'Wood Shake'] },
    { id: 'manufacturer',         label: 'Manufacturer',                type: 'text' },
    { id: 'product_line',         label: 'Product Line / Series',       type: 'text' },
    { id: 'color',                label: 'Color',                       type: 'text' },
    { id: 'shingle_class',        label: 'Shingle Class (impact)',       type: 'select', options: ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'N/A'] },
    { id: 'metal_gauge',          label: 'Metal Gauge',                 type: 'text', placeholder: 'e.g. 26 gauge' },
    { id: 'metal_finish',         label: 'Metal Finish',                type: 'text', placeholder: 'e.g. Kynar 500, SMP' },
    { id: 'square_footage',       label: 'Square Footage',              type: 'number', unit: 'sq ft' },
    { id: 'mfr_warranty_years',   label: 'Manufacturer Warranty (yrs)', type: 'number', unit: 'years' },
    { id: 'workmanship_warranty', label: 'Workmanship Warranty (yrs)',  type: 'number', unit: 'years' },
    { id: 'notes',                label: 'Notes',                       type: 'textarea' },
  ],
}

const surveillance: CaptureCategory = {
  id: 'surveillance',
  label: 'Surveillance / Camera',
  icon: '📷',
  driveFolderId: DRIVE_FOLDER_MAP.surveillance,
  allowMultiple: true,
  fields: [
    { id: 'device_type',      label: 'Device Type',          type: 'select', options: ['IP Camera', 'NVR/DVR', 'PoE Switch', 'Doorbell Camera'] },
    { id: 'location_label',   label: 'Location Label',        type: 'text', placeholder: 'e.g. Driveway Entrance, Barn East' },
    { id: 'brand',            label: 'Brand',                 type: 'text' },
    { id: 'model',            label: 'Model Number',          type: 'text' },
    { id: 'serial_number',    label: 'Serial Number',         type: 'text' },
    { id: 'mac_address',      label: 'MAC Address',           type: 'text' },
    { id: 'ip_address',       label: 'IP Address',            type: 'text' },
    { id: 'resolution',       label: 'Resolution',            type: 'text', placeholder: 'e.g. 4MP, 4K' },
    { id: 'storage_tb',       label: 'NVR Storage (TB)',      type: 'number', unit: 'TB' },
    { id: 'retention_days',   label: 'Retention (days)',      type: 'number', unit: 'days' },
    { id: 'network_segment',  label: 'Network / VLAN',        type: 'text' },
    { id: 'notes',            label: 'Notes',                 type: 'textarea' },
  ],
}

const barn: CaptureCategory = {
  id: 'barn',
  label: 'Barn',
  icon: '🌾',
  driveFolderId: DRIVE_FOLDER_MAP.barn,
  allowMultiple: false,
  fields: [
    { id: 'dimensions',          label: 'Dimensions (L×W×H)',     type: 'text', placeholder: 'e.g. 40x60x14 eave' },
    { id: 'construction_type',   label: 'Construction Type',       type: 'select', options: ['Post-Frame', 'Timber Frame', 'Stud Frame', 'Pole Barn'] },
    { id: 'electrical_panel',    label: 'Electrical Panel Amps',   type: 'number', unit: 'A' },
    { id: 'electrical_notes',    label: 'Electrical Notes',        type: 'textarea', placeholder: 'Circuit count, outlet locations, lighting type' },
    { id: 'water_supply',        label: 'Water Supply',            type: 'boolean' },
    { id: 'water_notes',         label: 'Water Notes',             type: 'text', placeholder: 'e.g. Frost-free hydrant, connected to house well' },
    { id: 'heating',             label: 'Heating / Ventilation',   type: 'textarea' },
    { id: 'current_use',         label: 'Current Use',             type: 'text' },
    { id: 'condition_notes',     label: 'Condition Notes',         type: 'textarea' },
    { id: 'stain_last_applied',  label: 'Stain Last Applied',      type: 'date' },
    { id: 'notes',               label: 'Notes',                   type: 'textarea' },
  ],
}

const forestryLog: CaptureCategory = {
  id: 'forestry_cauv',
  label: 'Forestry / CAUV Log',
  icon: '🌲',
  driveFolderId: DRIVE_FOLDER_MAP.cauv,
  allowMultiple: true,
  fields: [
    { id: 'activity_type',   label: 'Activity Type',          type: 'select', options: ['CAUV Renewal', 'Privet Treatment', 'Tree Removal', 'Timber Harvest', 'Planting', 'Invasive Treatment', 'Forestry Inspection', 'Other'] },
    { id: 'activity_date',   label: 'Activity Date',          type: 'date' },
    { id: 'contractor',      label: 'Contractor / Contact',   type: 'text' },
    { id: 'cost',            label: 'Cost ($)',               type: 'number', unit: '$' },
    { id: 'area_affected',   label: 'Area / Location',        type: 'text' },
    { id: 'chemical_used',   label: 'Chemical / Product',     type: 'text' },
    { id: 'notes',           label: 'Notes',                  type: 'textarea' },
  ],
}

const sumpPump: CaptureCategory = {
  id: 'sump_pump',
  label: 'Sump Pump',
  icon: '🚿',
  driveFolderId: DRIVE_FOLDER_MAP.sump_pump,
  allowMultiple: true,
  nameplatePrompt:
    'Extract sump pump nameplate data. Key fields: brand, model, serial_number, horsepower, voltage, amperage, max_head_ft, flow_gph.',
  fields: [
    { id: 'location',          label: 'Location',              type: 'select', options: ['Main Basement', 'Secondary Pit', 'Crawlspace', 'Other'] },
    { id: 'brand',             label: 'Brand',                 type: 'text' },
    { id: 'model',             label: 'Model Number',          type: 'text' },
    { id: 'serial_number',     label: 'Serial Number',         type: 'text' },
    { id: 'horsepower',        label: 'Motor HP',              type: 'number', unit: 'HP' },
    { id: 'pump_type',         label: 'Pump Type',             type: 'select', options: ['Submersible', 'Pedestal'] },
    { id: 'backup_type',       label: 'Backup Type',           type: 'select', options: ['Battery Backup', 'Water-Powered', 'None'] },
    { id: 'backup_brand',      label: 'Backup Unit Brand',     type: 'text' },
    { id: 'backup_model',      label: 'Backup Unit Model',     type: 'text' },
    { id: 'install_date',      label: 'Install Date',          type: 'date' },
    { id: 'discharge_location',label: 'Discharge Location',    type: 'text', placeholder: 'e.g. East side yard, 15ft from foundation' },
    { id: 'float_type',        label: 'Float Switch Type',     type: 'select', options: ['Tethered', 'Vertical', 'Electronic'] },
    { id: 'last_test_date',    label: 'Last Test Date',        type: 'date' },
    { id: 'notes',             label: 'Notes',                 type: 'textarea' },
  ],
}

const radonMitigation: CaptureCategory = {
  id: 'radon',
  label: 'Radon Mitigation',
  icon: '☢️',
  driveFolderId: DRIVE_FOLDER_MAP.radon,
  allowMultiple: false,
  fields: [
    { id: 'system_type',          label: 'System Type',                   type: 'select', options: ['Sub-Slab Depressurization', 'Sub-Membrane Depressurization', 'Drain Tile Depressurization', 'Block Wall Depressurization'] },
    { id: 'fan_brand',            label: 'Fan Brand',                     type: 'text' },
    { id: 'fan_model',            label: 'Fan Model',                     type: 'text' },
    { id: 'fan_location',         label: 'Fan Location',                  type: 'text', placeholder: 'e.g. Exterior south wall, attic' },
    { id: 'contractor',           label: 'Installation Contractor',       type: 'text' },
    { id: 'install_date',         label: 'Install Date',                  type: 'date' },
    { id: 'pre_mitigation_pci',   label: 'Pre-Mitigation Level (pCi/L)',  type: 'number', unit: 'pCi/L' },
    { id: 'post_mitigation_pci',  label: 'Post-Mitigation Level (pCi/L)', type: 'number', unit: 'pCi/L' },
    { id: 'last_test_date',       label: 'Last Radon Test Date',          type: 'date' },
    { id: 'manometer_reading',    label: 'Manometer Reading',             type: 'text', placeholder: 'e.g. -0.8 inWC' },
    { id: 'pipe_diameter',        label: 'Pipe Diameter',                 type: 'text', placeholder: 'e.g. 3-inch, 4-inch' },
    { id: 'notes',                label: 'Notes',                         type: 'textarea' },
  ],
}

// ─── Exports ───────────────────────────────────────────────────────────────────

export const CATEGORIES: CaptureCategory[] = [
  generator,
  hvac,
  waterHeater,
  waterTreatment,
  wellSystem,
  propane,
  septic,
  electricalPanel,
  appliance,
  roof,
  surveillance,
  barn,
  forestryLog,
  sumpPump,
  radonMitigation,
]

export const CATEGORY_MAP: Record<string, CaptureCategory> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
)

export function getCategoryById(id: string): CaptureCategory | undefined {
  return CATEGORY_MAP[id]
}
