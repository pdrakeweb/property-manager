import type {
  Property, EquipmentRecord, MaintenanceTask, CapitalItem,
  ServiceRecord, HAStatus, AIMessage, Category,
} from '../types'

// ── Properties ──────────────────────────────────────────────────────────────

export const PROPERTIES: Property[] = [
  {
    id: 'tannerville',
    name: '2392 Tannerville Rd',
    shortName: 'Tannerville',
    type: 'residence',
    address: 'Orrville, OH 44667',
    driveRootFolderId: '14CifGAre0egOHO0qVdrVBXCQY0WXk6Wt',
    stats: { documented: 11, total: 22 },
  },
  {
    id: 'camp',
    name: 'Camp',
    shortName: 'Camp',
    type: 'camp',
    address: '',
    driveRootFolderId: '',
    stats: { documented: 3, total: 10 },
  },
]

// ── Categories ───────────────────────────────────────────────────────────────

export const CATEGORIES: Category[] = [
  { id: 'generator',      label: 'Generator',         icon: '⚡', description: 'Standby generator & transfer switch',    propertyTypes: ['residence', 'camp'], allowMultiple: false, hasAIExtraction: true,  recordCount: 1 },
  { id: 'hvac',           label: 'HVAC',              icon: '🌡', description: 'Furnace, A/C, heat pump units',          propertyTypes: ['residence'],          allowMultiple: true,  hasAIExtraction: true,  recordCount: 2 },
  { id: 'water_heater',   label: 'Water Heater',      icon: '🚿', description: 'Tank or tankless water heaters',         propertyTypes: ['residence', 'camp'], allowMultiple: false, hasAIExtraction: true,  recordCount: 1 },
  { id: 'water_treatment',label: 'Water Treatment',   icon: '💧', description: 'Softener, iron filter, UV system',       propertyTypes: ['residence', 'camp'], allowMultiple: true,  hasAIExtraction: true,  recordCount: 3 },
  { id: 'well',           label: 'Well System',       icon: '🔋', description: 'Well pump, pressure tank, controls',     propertyTypes: ['residence', 'camp'], allowMultiple: false, hasAIExtraction: false, recordCount: 0 },
  { id: 'propane',        label: 'Propane',           icon: '⛽', description: 'Tank, supplier, regulator info',         propertyTypes: ['residence', 'camp'], allowMultiple: false, hasAIExtraction: true,  recordCount: 1 },
  { id: 'septic',         label: 'Septic System',     icon: '🧹', description: 'Tank, drainfield, pump history',         propertyTypes: ['residence', 'camp'], allowMultiple: false, hasAIExtraction: false, recordCount: 0 },
  { id: 'electrical',     label: 'Electrical Panel',  icon: '🔌', description: 'Main & sub panels, circuit directory',   propertyTypes: ['residence', 'camp'], allowMultiple: true,  hasAIExtraction: false, recordCount: 1 },
  { id: 'sump_pump',      label: 'Sump Pump',         icon: '🌊', description: 'Primary & backup sump pumps',            propertyTypes: ['residence'],          allowMultiple: true,  hasAIExtraction: true,  recordCount: 0 },
  { id: 'radon',          label: 'Radon Mitigation',  icon: '🏠', description: 'Mitigation system & test results',       propertyTypes: ['residence'],          allowMultiple: false, hasAIExtraction: false, recordCount: 0 },
  { id: 'appliance',      label: 'Appliance',         icon: '🍳', description: 'Kitchen, laundry & other appliances',    propertyTypes: ['residence', 'camp'], allowMultiple: true,  hasAIExtraction: true,  recordCount: 4 },
  { id: 'roof',           label: 'Roof',              icon: '🏗', description: 'Roofing material, warranty, sections',   propertyTypes: ['residence', 'camp'], allowMultiple: true,  hasAIExtraction: false, recordCount: 1 },
  { id: 'barn',           label: 'Barn',              icon: '🏚', description: 'Structure, electrical, condition',       propertyTypes: ['residence'],          allowMultiple: false, hasAIExtraction: false, recordCount: 1 },
  { id: 'surveillance',   label: 'Surveillance',      icon: '📹', description: 'IP cameras, NVR, PoE switch',           propertyTypes: ['residence'],          allowMultiple: true,  hasAIExtraction: false, recordCount: 5 },
  { id: 'forestry_cauv',  label: 'Forestry / CAUV',   icon: '🌲', description: 'CAUV renewals, forestry activity log',  propertyTypes: ['residence'],          allowMultiple: true,  hasAIExtraction: false, recordCount: 2 },
  { id: 'service_record', label: 'Service Record',    icon: '🛠', description: 'Contractor visits, invoices, repairs',  propertyTypes: ['residence', 'camp'], allowMultiple: true,  hasAIExtraction: true,  recordCount: 8 },
]

// ── Equipment Records ─────────────────────────────────────────────────────

export const EQUIPMENT: EquipmentRecord[] = [
  {
    id: 'gen-001',
    propertyId: 'tannerville',
    categoryId: 'generator',
    label: 'Generac 22kW Air-Cooled',
    brand: 'Generac',
    model: '7043 / 22kW',
    serialNumber: '7234891042',
    installYear: 2019,
    age: 7,
    location: 'South side of house',
    lastServiceDate: '2025-11-01',
    uploadStatus: 'uploaded',
    hasPhotos: true,
    driveFileId: 'abc123',
  },
  {
    id: 'hvac-001',
    propertyId: 'tannerville',
    categoryId: 'hvac',
    label: 'Trane XR15 — Main Floor',
    brand: 'Trane',
    model: 'XR15 / 4TTX5036E',
    serialNumber: '2194XE31T',
    installYear: 2009,
    age: 17,
    location: 'Basement — Main unit',
    lastServiceDate: '2025-10-15',
    uploadStatus: 'uploaded',
    hasPhotos: true,
  },
  {
    id: 'hvac-002',
    propertyId: 'tannerville',
    categoryId: 'hvac',
    label: 'Mitsubishi Mini-Split — Sunroom',
    brand: 'Mitsubishi',
    model: 'MSZ-GL09NA',
    serialNumber: '5B4M80991',
    installYear: 2021,
    age: 5,
    location: 'Sunroom',
    lastServiceDate: '2025-05-01',
    uploadStatus: 'uploaded',
    hasPhotos: false,
  },
  {
    id: 'wh-001',
    propertyId: 'tannerville',
    categoryId: 'water_heater',
    label: 'Rheem 50-Gal Propane',
    brand: 'Rheem',
    model: 'PROG50-38N RH67',
    serialNumber: '0908M4J12345',
    installYear: 2009,
    age: 17,
    location: 'Utility room',
    lastServiceDate: '2023-06-10',
    uploadStatus: 'uploaded',
    hasPhotos: true,
  },
  {
    id: 'prop-001',
    propertyId: 'tannerville',
    categoryId: 'propane',
    label: '500-Gal Propane Tank',
    installYear: 2006,
    age: 20,
    location: 'South yard behind generator',
    lastServiceDate: '2025-09-20',
    uploadStatus: 'uploaded',
    hasPhotos: true,
  },
  {
    id: 'wt-001',
    propertyId: 'tannerville',
    categoryId: 'water_treatment',
    label: 'Kinetico K5 Drinking Station',
    brand: 'Kinetico',
    model: 'K5 ADA',
    installYear: 2018,
    age: 8,
    location: 'Under kitchen sink',
    uploadStatus: 'uploaded',
    hasPhotos: false,
  },
]

// ── Maintenance Tasks ─────────────────────────────────────────────────────

export const MAINTENANCE_TASKS: MaintenanceTask[] = [
  {
    id: 'mt-001',
    propertyId: 'tannerville',
    title: 'Generator annual service & oil change',
    systemLabel: 'Generator',
    categoryId: 'generator',
    dueDate: '2026-05-01',
    priority: 'high',
    status: 'due',
    recurrence: 'Annual (October) or 200 hrs',
    estimatedCost: 180,
    contractor: 'Buckeye Power Sales, Wooster OH',
    notes: 'Runtime since last oil change: 156 hrs. HA-tracked.',
    source: 'ha-trigger',
  },
  {
    id: 'mt-002',
    propertyId: 'tannerville',
    title: 'HVAC filter replacement — Main floor',
    systemLabel: 'HVAC Main',
    categoryId: 'hvac',
    dueDate: '2026-05-15',
    priority: 'medium',
    status: 'due',
    recurrence: 'Every 90 days',
    estimatedCost: 24,
    notes: '20×25×4 MERV 11 — Filtrete 1500',
    source: 'manufacturer',
  },
  {
    id: 'mt-003',
    propertyId: 'tannerville',
    title: 'Septic tank pump-out',
    systemLabel: 'Septic',
    categoryId: 'septic',
    dueDate: '2026-06-01',
    priority: 'high',
    status: 'upcoming',
    recurrence: 'Every 3 years',
    estimatedCost: 350,
    contractor: 'Buckeye Septic, Wooster OH',
    source: 'manufacturer',
  },
  {
    id: 'mt-004',
    propertyId: 'tannerville',
    title: 'Annual well water test',
    systemLabel: 'Well System',
    categoryId: 'well',
    dueDate: '2026-07-01',
    priority: 'medium',
    status: 'upcoming',
    recurrence: 'Annual',
    estimatedCost: 75,
    notes: 'Test for bacteria, nitrates, hardness, iron',
    source: 'manufacturer',
  },
  {
    id: 'mt-005',
    propertyId: 'tannerville',
    title: 'Water softener salt check',
    systemLabel: 'Water Treatment',
    categoryId: 'water_treatment',
    dueDate: '2026-04-20',
    priority: 'low',
    status: 'overdue',
    recurrence: 'Monthly',
    estimatedCost: 8,
    source: 'manufacturer',
  },
  {
    id: 'mt-006',
    propertyId: 'tannerville',
    title: 'HVAC annual service — Main floor',
    systemLabel: 'HVAC Main',
    categoryId: 'hvac',
    dueDate: '2026-10-01',
    priority: 'medium',
    status: 'upcoming',
    recurrence: 'Annual (fall)',
    estimatedCost: 140,
    contractor: 'Buckeye Heating & Cooling',
    source: 'manufacturer',
  },
  {
    id: 'mt-007',
    propertyId: 'tannerville',
    title: 'Propane delivery — will-call',
    systemLabel: 'Propane',
    categoryId: 'propane',
    dueDate: '2026-10-15',
    priority: 'medium',
    status: 'upcoming',
    recurrence: 'Seasonal (pre-winter)',
    estimatedCost: 1800,
    notes: 'Tank currently at 68% — schedule before September',
    source: 'manual',
  },
  {
    id: 'mt-008',
    propertyId: 'tannerville',
    title: 'Generator transfer switch exercise',
    systemLabel: 'Generator',
    categoryId: 'generator',
    dueDate: '2026-04-30',
    priority: 'low',
    status: 'upcoming',
    recurrence: 'Monthly',
    estimatedCost: 0,
    notes: 'Run under load for 30 min; check auto-exercise timer',
    source: 'manufacturer',
  },
]

// ── Capital Items ─────────────────────────────────────────────────────────

export const CAPITAL_ITEMS: CapitalItem[] = [
  {
    id: 'cap-001',
    propertyId: 'tannerville',
    title: 'Water Heater replacement',
    categoryId: 'water_heater',
    installYear: 2009,
    ageYears: 17,
    priority: 'critical',
    estimatedYear: 2026,
    costLow: 1200,
    costHigh: 2000,
    notes: 'Rheem propane, 17 yrs old. Consider heat-pump hybrid upgrade ($1,800–$2,400).',
    source: 'age-based',
  },
  {
    id: 'cap-002',
    propertyId: 'tannerville',
    title: 'Main floor HVAC replacement',
    categoryId: 'hvac',
    installYear: 2009,
    ageYears: 17,
    priority: 'high',
    estimatedYear: 2026,
    costLow: 4000,
    costHigh: 7000,
    notes: 'Trane XR15 — 17 yrs. Average furnace lifespan 15–20 yrs. Monitor closely.',
    source: 'age-based',
  },
  {
    id: 'cap-003',
    propertyId: 'tannerville',
    title: 'Barn roof replacement',
    categoryId: 'roof',
    installYear: 2003,
    ageYears: 23,
    priority: 'medium',
    estimatedYear: 2027,
    costLow: 2000,
    costHigh: 4500,
    notes: 'Standing seam section showing surface rust at ridge. Get inspection.',
    source: 'manual',
  },
  {
    id: 'cap-004',
    propertyId: 'tannerville',
    title: 'Well pump replacement',
    categoryId: 'well',
    installYear: 2008,
    ageYears: 18,
    priority: 'medium',
    estimatedYear: 2027,
    costLow: 3500,
    costHigh: 6000,
    notes: 'Pump age unknown but likely original with house. Budget for potential failure.',
    source: 'age-based',
  },
  {
    id: 'cap-005',
    propertyId: 'tannerville',
    title: 'Driveway reseal & crack fill',
    categoryId: 'septic',
    priority: 'low',
    estimatedYear: 2027,
    costLow: 1800,
    costHigh: 2800,
    notes: 'Last sealed 2020. Visible cracking at apron.',
    source: 'manual',
  },
  {
    id: 'cap-006',
    propertyId: 'tannerville',
    title: 'Sunroom mini-split replacement',
    categoryId: 'hvac',
    installYear: 2021,
    ageYears: 5,
    priority: 'low',
    estimatedYear: 2031,
    costLow: 2500,
    costHigh: 4000,
    notes: 'Current unit in good shape. Project 10-yr horizon.',
    source: 'age-based',
  },
]

// ── Service History ───────────────────────────────────────────────────────

export const SERVICE_RECORDS: ServiceRecord[] = [
  {
    id: 'svc-001',
    propertyId: 'tannerville',
    date: '2025-11-01',
    systemLabel: 'Generator',
    contractor: 'Buckeye Power Sales',
    workDescription: 'Annual service: oil change, air filter, spark plugs, load test',
    totalCost: 180,
  },
  {
    id: 'svc-002',
    propertyId: 'tannerville',
    date: '2026-01-15',
    systemLabel: 'HVAC Main',
    contractor: 'Self',
    workDescription: 'HVAC filter replacement — 20×25×4 MERV 11',
    totalCost: 24,
  },
  {
    id: 'svc-003',
    propertyId: 'tannerville',
    date: '2025-10-15',
    systemLabel: 'HVAC Main',
    contractor: 'Buckeye Heating & Cooling',
    workDescription: 'Fall service: cleaned heat exchanger, checked pressure, tested ignition',
    totalCost: 140,
  },
  {
    id: 'svc-004',
    propertyId: 'tannerville',
    date: '2025-09-20',
    systemLabel: 'Propane',
    contractor: 'Ferrellgas',
    workDescription: 'Delivery — 210 gallons',
    totalCost: 588,
  },
  {
    id: 'svc-005',
    propertyId: 'tannerville',
    date: '2025-04-10',
    systemLabel: 'Water Treatment',
    contractor: 'Kinetico of Wooster',
    workDescription: 'Annual softener service: resin check, valve rebuild, brine tank clean',
    totalCost: 210,
  },
]

// ── Home Assistant Live Status ────────────────────────────────────────────

export const HA_STATUS: HAStatus[] = [
  { entityId: 'sensor.propane_tank_level',     label: 'Propane Tank',     value: '68',    unit: '%',   status: 'ok'      },
  { entityId: 'sensor.generator_status',       label: 'Generator',        value: 'Off',               status: 'off'     },
  { entityId: 'binary_sensor.sump_high_water', label: 'Sump Pump',        value: 'Dry',               status: 'ok'      },
  { entityId: 'sensor.well_pressure_psi',      label: 'Well Pressure',    value: '52',    unit: 'PSI', status: 'ok'      },
  { entityId: 'sensor.gen_runtime_since_svc',  label: 'Gen Oil (since svc)', value: '156', unit: 'hrs', status: 'warning' },
]

// ── Sample AI Conversation ────────────────────────────────────────────────

export const SAMPLE_AI_MESSAGES: AIMessage[] = [
  {
    id: 'msg-001',
    role: 'user',
    content: 'My water heater is from 2009 and the plumber said the anode rod is heavily corroded. Worth repairing or should I replace it?',
    timestamp: '2026-04-11T10:14:00Z',
  },
  {
    id: 'msg-002',
    role: 'assistant',
    content: `Based on your records, your **Rheem 50-gal propane water heater** (installed ~2009) is now **17 years old**. The average propane tank water heater lifespan is 8–12 years, so yours is well past expected service life.

**My recommendation: replace rather than repair.** Here's why:

1. **Anode rod replacement at this age** typically buys 2–3 more years at best, and tank failure (usually a slow or sudden leak) often follows
2. **Replacement cost** is in your capital forecast already — $1,200–$2,000 installed for a comparable 50-gal propane unit
3. **Upgrade opportunity:** A heat-pump hybrid unit ($1,800–$2,400 installed) would cut your water heating energy cost by ~40%

**Suggested next step:** Get 2 quotes — one for a like-for-like replacement, one including the heat-pump option. I can generate a spec sheet to share with plumbers if that would help.

*Note: I've flagged this in your capital forecast as Critical for 2026.*`,
    timestamp: '2026-04-11T10:14:08Z',
  },
  {
    id: 'msg-003',
    role: 'user',
    content: 'Yes, generate the spec sheet.',
    timestamp: '2026-04-11T10:15:30Z',
  },
  {
    id: 'msg-004',
    role: 'assistant',
    content: `I've drafted a **Water Heater Replacement Specification** based on your documented system. Here's a summary:

**Existing unit:** Rheem PROG50-38N RH67, 50-gal propane, ~38,000 BTU, installed 2008, utility room

**Replacement requirements:**
- Minimum 50-gal capacity
- Propane-compatible (existing ¾" gas line)
- Fits utility room footprint (~21" diameter tank)
- 240V circuit available if hybrid heat-pump considered
- Connect to existing ¾" supply/return lines

**Option A — Like-for-like:** Rheem Performance Plus 50-gal propane (~$900–$1,100 unit + $200–$400 labor)
**Option B — Heat Pump Hybrid:** A.O. Smith HPTU-50 or Rheem ProTerra 50-gal (~$1,200–$1,600 unit + $300–$500 labor; requires adequate clearance for air intake)

The full spec has been saved to your Drive under **Water Treatment / water_heater_spec_2026-04-11.md**.`,
    timestamp: '2026-04-11T10:15:38Z',
  },
]

// ── Suggested AI Prompts ──────────────────────────────────────────────────

export const SUGGESTED_PROMPTS: string[] = [
  'What maintenance should I do before winter?',
  'Which systems are most at risk this year?',
  'How much have I spent on HVAC over the past 2 years?',
  'Should I replace or repair the main floor furnace?',
  'Generate a fall winterization checklist for the camp.',
  'What contractor should I call for the septic pump-out?',
]
