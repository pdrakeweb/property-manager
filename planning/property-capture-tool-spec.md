# Property Capture Tool — Business Requirements & Technical Specification

**Project:** Mobile PWA for property knowledge capture → Google Drive  
**Property:** 2392 Tannerville Rd, Orrville, OH 44667  
**Author:** Pete Drake  
**Created:** April 2026  
**Status:** Spec Review — Pending Implementation Approval

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Solution Overview](#2-solution-overview)
3. [Business Requirements](#3-business-requirements)
4. [Technical Architecture](#4-technical-architecture)
5. [Data Model](#5-data-model)
6. [Category Definitions](#6-category-definitions)
7. [User Flows](#7-user-flows)
8. [UI Structure](#8-ui-structure)
9. [Google Drive Integration](#9-google-drive-integration)
10. [Anthropic Vision Integration](#10-anthropic-vision-integration)
11. [PWA Configuration](#11-pwa-configuration)
12. [Deployment](#12-deployment)
13. [Implementation Phases](#13-implementation-phases)
14. [Open Questions](#14-open-questions)

---

## 1. Problem Statement

A rural residential property with multiple structures, mechanical systems, appliances, and active land management generates ongoing documentation needs. The gap between *capturing* equipment specs, photos, and service records in the field and *filing* them in the correct Google Drive folder is where institutional knowledge is lost.

Current state:
- Equipment make/model/serial for generator, HVAC, water treatment, propane, well pump, and others are undocumented
- No mobile-friendly tool for field capture → structured storage
- Manual filing workflow has too much friction to be sustainable

Target state:
- Stand in front of any piece of equipment, open the app, photograph the nameplate → AI extracts specs → one tap saves a structured record to the correct Drive folder
- Checklist view shows completion status across all property areas
- No backend to maintain; no app store required

---

## 2. Solution Overview

A mobile-installable Progressive Web App (PWA). No App Store submission, no backend server, no recurring infrastructure cost. Runs in Safari/Chrome on iOS or Android, installs to the home screen, accesses the device camera, and communicates directly with the Google Drive API and Anthropic Messages API from the browser.

**Core capability:** Photograph an equipment nameplate → Anthropic Vision extracts make/model/serial/specs into a JSON payload → auto-fills a category-specific form → user reviews and taps Save → structured Markdown record and photo(s) uploaded to the correct Google Drive folder.

---

## 3. Business Requirements

### BR-1: Category Coverage
The tool must support data capture for all major property systems and areas:
- Mechanical: Generator, HVAC (per unit), Water Heater, Water Treatment/Softener, Well System, Propane Tank, Sump Pump(s), Radon Mitigation
- Appliances: Kitchen appliances (per appliance), Laundry, Other (freezer, humidifier, garage openers)
- Structural: Roof, Dormers, Windows, Exterior Doors, Foundation
- Barn: Electrical, Mechanical, Structural
- Land: Septic System, Driveway, Fencing, RV Pad, Outdoor Water
- Systems: Electrical Panel, Surveillance Cameras, Alarm System, Smart Home / IoT
- Forestry/CAUV: Activity log, renewal tracking

### BR-2: Nameplate Extraction
Users must be able to photograph an equipment nameplate and have the app automatically populate form fields using AI-assisted extraction. The form must be reviewable and correctable before saving.

### BR-3: Direct Drive Integration
Records must be saved directly to the existing Google Drive folder structure at `14CifGAre0egOHO0qVdrVBXCQY0WXk6Wt` (root). Each category maps to a known folder ID. No intermediate storage, no email-to-Drive workarounds.

### BR-4: Document/Receipt Upload
Users must be able to select existing files from the camera roll or file system (PDFs, photos) and upload them to a chosen category folder with an optional description.

### BR-5: Completion Checklist
The app must show a checklist view indicating which categories have at least one saved record, giving a clear picture of documentation gaps.

### BR-6: Mobile-First, No-Friction UX
The app must be usable one-handed while holding a flashlight. Large touch targets, minimal navigation depth, no hover-dependent interactions. Works on iOS Safari and Android Chrome.

### BR-7: No Backend / Self-Hostable
All logic runs client-side. No server to maintain, no database, no recurring cost beyond static hosting (free tier). A private GitHub repository + GitHub Pages satisfies all hosting requirements.

### BR-8: Offline Tolerance
Form fills and photo captures must survive a connectivity interruption. Pending uploads queue locally (IndexedDB) and sync when connection is restored.

### BR-9: API Key Security (Personal Device)
The Anthropic API key is entered once and stored in localStorage. This is acceptable for a single-user personal tool on a trusted device. If multi-user support is ever needed, this decision must be revisited (see §14, Open Questions).

---

## 4. Technical Architecture

### 4.1 Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | React 18 + Vite | Fast dev cycle, good PWA support via vite-plugin-pwa |
| Language | TypeScript | Schema type safety for category/field definitions |
| Hosting | GitHub Pages or Netlify (free tier) | Static only; no backend required |
| Auth | Google OAuth 2.0 with PKCE | Client-side SPA safe; no client secret needed |
| Cloud Storage | Google Drive API v3 | Direct browser-to-Drive upload |
| AI Extraction | Anthropic Messages API (claude-sonnet-4-5) | Vision model; nameplate photo → structured JSON |
| Local Persistence | IndexedDB via `idb-keyval` | Draft state and offline queue |
| Styling | Tailwind CSS | Mobile-first utility classes, no custom CSS needed |
| Build/Deploy | GitHub Actions | Auto-deploy to `gh-pages` branch on push to `main` |

### 4.2 Key Architectural Decisions

**No backend.** Google's PKCE OAuth flow is designed for SPAs. The Anthropic API key is held in the user's browser localStorage. Drive uploads go browser → Drive API directly. This eliminates a maintenance surface.

**Client-side only means no server-side token refresh.** The Google OAuth access token expires in 1 hour. The app must detect 401 responses and trigger a silent re-auth using the stored refresh token via `prompt=none`. This is handled transparently in the Drive API client wrapper.

**Drive scope choice is a fork.** `drive.file` allows writing files the app created but cannot read pre-existing files (so checklist "already uploaded" detection won't work). `drive` scope allows full read/write. See §14 for the decision point.

**Output is Markdown, not a database.** Each saved record generates a `.md` file in the target Drive folder. Human-readable, portable, pasteable into the property reference doc, and searchable in Drive. Photos are uploaded as separate JPEGs, referenced in the Markdown by filename.

### 4.3 Component Architecture (High Level)

```
src/
├── main.tsx                    # App entry, PWA registration
├── App.tsx                     # Router, auth context
├── auth/
│   ├── GoogleAuth.ts           # PKCE OAuth implementation
│   └── AuthContext.tsx         # React context for auth state
├── drive/
│   ├── DriveClient.ts          # Drive API v3 wrapper (upload, list)
│   └── FolderMap.ts            # Category ID → Drive folder ID mapping
├── ai/
│   └── NameplateExtractor.ts   # Anthropic Vision API call + response parser
├── schema/
│   ├── types.ts                # Category, Field, Record interfaces
│   └── categories/             # One file per category, exports Category object
│       ├── generator.ts
│       ├── hvac.ts
│       ├── waterTreatment.ts
│       └── ... (15+ categories)
├── components/
│   ├── HomeScreen.tsx
│   ├── CategoryScreen.tsx      # Dynamic form from schema
│   ├── ChecklistScreen.tsx
│   ├── CameraCapture.tsx       # Camera API + preview
│   ├── PhotoAttachments.tsx    # Multi-photo management
│   ├── DynamicForm.tsx         # Field renderer from schema
│   └── SettingsScreen.tsx
├── hooks/
│   ├── useOfflineQueue.ts      # IndexedDB queue for pending uploads
│   └── useDriveUpload.ts       # Upload orchestration with retry
└── utils/
    ├── markdownFormatter.ts    # Record → .md string
    └── fileNaming.ts           # Consistent filename generation
```

---

## 5. Data Model

### 5.1 Type Definitions

```typescript
type FieldType = 'text' | 'number' | 'date' | 'select' | 'textarea' | 'boolean';

interface Field {
  id: string;
  label: string;
  type: FieldType;
  options?: string[];          // for select fields
  placeholder?: string;
  aiExtractHint?: string;      // mapped key name for AI extraction prompt
  required?: boolean;
  unit?: string;               // display unit (gal, BTU, kW, etc.)
}

interface Category {
  id: string;
  label: string;
  icon: string;                // emoji or icon name
  driveFolderId: string;       // Google Drive folder ID
  fields: Field[];
  nameplatePrompt?: string;    // system prompt fragment for AI extraction
  allowMultiple?: boolean;     // true if multiple records make sense (e.g., HVAC units)
}

interface CaptureRecord {
  id: string;                  // uuid
  categoryId: string;
  timestamp: string;           // ISO 8601
  fields: Record<string, string | number | boolean | null>;
  photoFilenames: string[];    // correlates to uploaded photo files
  driveFileId?: string;        // set after successful upload
  uploadStatus: 'pending' | 'uploaded' | 'error';
}
```

### 5.2 Drive Folder Map

```typescript
export const DRIVE_FOLDER_MAP: Record<string, string> = {
  root:            '14CifGAre0egOHO0qVdrVBXCQY0WXk6Wt',
  projects:        '1f31FjL-3eGa-Xr_rxMMIWHwqaVCViu4i',
  hvac:            '1f7Fbetgic7wMubOKVZr4GZbbzPMJK255',
  kitchen:         '1G83sNSxGb43ZcNU1AA6kuVcCKeMkzfLY',
  waterTreatment:  '1b_dq5qNSF8AxrN2tXszgy98IaxHuruFh',
  fireplace:       '1lFJ6ouJpGqG60xY4IdOKjdNpkC-nSSSW',
  rvParking:       '1PtFvctXhAYPNvxJxYNQw5qTi8Hu2NyD4',
  patios:          '1nYHC5wnBsnchr0hcIAWsSozirqvSEV0u',
  propane:         '1iNccKytMpi4qrgteaxbmB4VYm3iTPMbA',
  roof:            '1CzArWstlwApmlZcKW87PYK81167Aq0Rn',
  dormers:         '1egqQpspUYTF7UVAqtfOiAhkIqMuc4Qjw',
  basement:        '1XnCnKnVsEe9DxCpxzYtcjo3gL6Vyl6lT',
  sunroom:         '1YuGyat--XsqJ9I-5RJfqGfchJfBDY0dJ',
  generator:       '1f6ceFGDaMRwQO_7OcxGHywuFolFJ5Hpg',
  surveillance:    '1beJLvmhjU0vm3yBa7dnVnJ2qEwtk-nv8',
  cauv:            '1jlkefvZg8gkmVDkBU-gsJUYwA5mmNooU',
  purchase:        '1ft5ut6b66wWm_7rBcXYYhJg7QZ8ri1Jh',
  invoices:        '1KhSADp7RI45t24CuircQIrRBQaiNZIjw',
  // To be created in Drive as needed:
  // septic, well, electrical, laundry, barn, appliances
};
```

### 5.3 Output File Format

Each saved record produces:

**`{category}_{YYYY-MM-DD}_{HHmm}.md`**
```markdown
# Generator — Equipment Record
**Captured:** 2026-04-12 09:34
**Category:** Generator
**Drive Folder:** Generator

## Specifications
| Field | Value |
|---|---|
| Brand | Generac |
| Model | 22kW Air-Cooled (7043) |
| Serial Number | 1234567890 |
| Output (kW) | 22 |
| Fuel Type | Propane |
| Transfer Switch Brand | Generac |
| Transfer Switch Amps | 200 |
| Oil Type | 5W-30 Synthetic |
| Oil Capacity (qt) | 1.7 |
| Air Filter Part # | 0G8442 |
| Last Service Date | 2025-11-01 |
| Service Interval | Annual / 200 hrs |

## Notes
Located on south side of house, behind propane tank. Annual service by
Buckeye Power Sales, Wooster OH.

## Photos
- generator_2026-04-12_0934_photo_1.jpg (nameplate)
- generator_2026-04-12_0934_photo_2.jpg (transfer switch panel)
```

**`{category}_{YYYY-MM-DD}_{HHmm}_photo_{n}.jpg`** — each attached photo, uploaded separately, referenced by filename in the Markdown.

---

## 6. Category Definitions

Full field schemas for all categories. Each maps to a Drive folder ID and defines the form rendered in the app.

### Generator
```typescript
{
  id: 'generator',
  label: 'Generator',
  driveFolderId: DRIVE_FOLDER_MAP.generator,
  allowMultiple: false,
  nameplatePrompt: 'Extract generator nameplate data. Key fields: brand, model, model_number, serial_number, rated_kw, rated_kva, voltage_output, frequency_hz, fuel_type, rpm, manufacture_date.',
  fields: [
    { id: 'brand',                  label: 'Brand',                   type: 'text' },
    { id: 'model',                  label: 'Model Name',              type: 'text' },
    { id: 'model_number',           label: 'Model Number',            type: 'text' },
    { id: 'serial_number',          label: 'Serial Number',           type: 'text' },
    { id: 'kw_rating',              label: 'Output (kW)',             type: 'number', unit: 'kW' },
    { id: 'fuel_type',              label: 'Fuel Type',               type: 'select', options: ['Propane', 'Natural Gas', 'Gasoline', 'Diesel'] },
    { id: 'transfer_switch_brand',  label: 'Transfer Switch Brand',   type: 'text' },
    { id: 'transfer_switch_amps',   label: 'Transfer Switch Amps',    type: 'number', unit: 'A' },
    { id: 'transfer_switch_type',   label: 'Transfer Switch Type',    type: 'select', options: ['Automatic', 'Manual', 'Load-Side', 'Service Entrance'] },
    { id: 'oil_type',               label: 'Engine Oil Type',         type: 'text', placeholder: 'e.g. 5W-30 Synthetic' },
    { id: 'oil_capacity_qt',        label: 'Oil Capacity (qt)',       type: 'number', unit: 'qt' },
    { id: 'air_filter_part',        label: 'Air Filter Part #',       type: 'text' },
    { id: 'spark_plug_part',        label: 'Spark Plug Part #',       type: 'text' },
    { id: 'last_service_date',      label: 'Last Service Date',       type: 'date' },
    { id: 'service_interval',       label: 'Service Interval',        type: 'text', placeholder: 'e.g. Annual / 200 hrs' },
    { id: 'covered_circuits',       label: 'Covered Circuits',        type: 'textarea', placeholder: 'List circuits on transfer switch' },
    { id: 'notes',                  label: 'Notes',                   type: 'textarea' },
  ]
}
```

### HVAC (allowMultiple: true — one record per unit)
```typescript
{
  id: 'hvac',
  label: 'HVAC',
  driveFolderId: DRIVE_FOLDER_MAP.hvac,
  allowMultiple: true,
  nameplatePrompt: 'Extract HVAC equipment nameplate data. Key fields: brand, model, serial_number, btu_input, btu_output, afue_percent, tonnage, seer, refrigerant_type, voltage, amperage, manufacture_date.',
  fields: [
    { id: 'unit_type',          label: 'Unit Type',             type: 'select', options: ['Furnace', 'Air Conditioner', 'Heat Pump', 'Air Handler', 'Mini-Split'] },
    { id: 'unit_label',         label: 'Unit Label / Zone',     type: 'text', placeholder: 'e.g. Main Floor, Upstairs, Sunroom' },
    { id: 'brand',              label: 'Brand',                 type: 'text' },
    { id: 'model',              label: 'Model Number',          type: 'text' },
    { id: 'serial_number',      label: 'Serial Number',         type: 'text' },
    { id: 'install_date',       label: 'Install Date',          type: 'date' },
    { id: 'btu_input',          label: 'BTU Input',             type: 'number', unit: 'BTU/hr' },
    { id: 'btu_output',         label: 'BTU Output',            type: 'number', unit: 'BTU/hr' },
    { id: 'afue',               label: 'AFUE (%)',              type: 'number', unit: '%' },
    { id: 'tonnage',            label: 'Cooling Tonnage',       type: 'number', unit: 'tons' },
    { id: 'seer',               label: 'SEER Rating',           type: 'number' },
    { id: 'refrigerant_type',   label: 'Refrigerant Type',      type: 'select', options: ['R-410A', 'R-32', 'R-22', 'R-454B', 'Other'] },
    { id: 'filter_size',        label: 'Filter Size (LxWxD)',   type: 'text', placeholder: 'e.g. 20x25x1' },
    { id: 'filter_merv',        label: 'Filter MERV Rating',    type: 'number' },
    { id: 'filter_interval',    label: 'Filter Change Interval',type: 'text', placeholder: 'e.g. 90 days' },
    { id: 'thermostat_brand',   label: 'Thermostat Brand',      type: 'text' },
    { id: 'thermostat_model',   label: 'Thermostat Model',      type: 'text' },
    { id: 'last_service_date',  label: 'Last Service Date',     type: 'date' },
    { id: 'service_contractor', label: 'Service Contractor',    type: 'text' },
    { id: 'notes',              label: 'Notes',                 type: 'textarea' },
  ]
}
```

### Water Heater
```typescript
{
  id: 'water_heater',
  label: 'Water Heater',
  driveFolderId: DRIVE_FOLDER_MAP.waterTreatment,
  nameplatePrompt: 'Extract water heater nameplate data. Key fields: brand, model, serial_number, tank_gallons, btu_input, first_hour_rating, fuel_type, voltage, manufacture_date.',
  fields: [
    { id: 'brand',              label: 'Brand',               type: 'text' },
    { id: 'model',              label: 'Model Number',        type: 'text' },
    { id: 'serial_number',      label: 'Serial Number',       type: 'text' },
    { id: 'fuel_type',          label: 'Fuel Type',           type: 'select', options: ['Propane', 'Natural Gas', 'Electric', 'Heat Pump/Hybrid'] },
    { id: 'tank_gallons',       label: 'Tank Size (gal)',      type: 'number', unit: 'gal' },
    { id: 'btu_input',          label: 'BTU Input',           type: 'number', unit: 'BTU/hr' },
    { id: 'first_hour_rating',  label: 'First Hour Rating',   type: 'number', unit: 'gal' },
    { id: 'install_year',       label: 'Install Year',        type: 'number' },
    { id: 'anode_last_checked', label: 'Anode Rod Last Checked', type: 'date' },
    { id: 'expansion_tank',     label: 'Expansion Tank Present', type: 'boolean' },
    { id: 'notes',              label: 'Notes',               type: 'textarea' },
  ]
}
```

### Water Treatment (allowMultiple: true — one record per device)
```typescript
{
  id: 'water_treatment',
  label: 'Water Treatment',
  driveFolderId: DRIVE_FOLDER_MAP.waterTreatment,
  allowMultiple: true,
  nameplatePrompt: 'Extract water treatment equipment nameplate data. Key fields: brand, model, serial_number, equipment_type, tank_size, flow_rate, voltage, manufacture_date.',
  fields: [
    { id: 'equipment_type',     label: 'Equipment Type',      type: 'select', options: ['Water Softener', 'Iron Filter', 'UV Sterilizer', 'Sediment Filter', 'Carbon Filter', 'RO System'] },
    { id: 'brand',              label: 'Brand',               type: 'text' },
    { id: 'model',              label: 'Model Number',        type: 'text' },
    { id: 'serial_number',      label: 'Serial Number',       type: 'text' },
    { id: 'install_date',       label: 'Install Date',        type: 'date' },
    { id: 'resin_tank_size',    label: 'Resin Tank Size',     type: 'text', placeholder: 'e.g. 10x54' },
    { id: 'salt_type',          label: 'Salt Type',           type: 'select', options: ['Solar', 'Evaporated', 'Rock', 'Potassium Chloride'] },
    { id: 'regen_schedule',     label: 'Regen Schedule',      type: 'text', placeholder: 'e.g. Every 7 days at 2am' },
    { id: 'media_type',         label: 'Filter Media Type',   type: 'text', placeholder: 'e.g. Birm, Greensand, KDF' },
    { id: 'uv_lamp_part',       label: 'UV Lamp Part #',      type: 'text' },
    { id: 'last_service_date',  label: 'Last Service Date',   type: 'date' },
    { id: 'notes',              label: 'Notes',               type: 'textarea' },
  ]
}
```

### Well System
```typescript
{
  id: 'well',
  label: 'Well System',
  driveFolderId: DRIVE_FOLDER_MAP.waterTreatment, // or dedicated folder
  fields: [
    { id: 'well_depth_ft',       label: 'Well Depth (ft)',           type: 'number', unit: 'ft' },
    { id: 'pump_brand',          label: 'Pump Brand',                type: 'text' },
    { id: 'pump_model',          label: 'Pump Model',                type: 'text' },
    { id: 'pump_hp',             label: 'Pump HP',                   type: 'number', unit: 'HP' },
    { id: 'pump_gpm',            label: 'Pump GPM Rating',           type: 'number', unit: 'GPM' },
    { id: 'pump_depth_set_ft',   label: 'Pump Depth Set (ft)',       type: 'number', unit: 'ft' },
    { id: 'pressure_tank_brand', label: 'Pressure Tank Brand',       type: 'text' },
    { id: 'pressure_tank_model', label: 'Pressure Tank Model',       type: 'text' },
    { id: 'pressure_tank_gal',   label: 'Pressure Tank Size (gal)', type: 'number', unit: 'gal' },
    { id: 'cut_in_psi',          label: 'Cut-In PSI',                type: 'number', unit: 'PSI' },
    { id: 'cut_out_psi',         label: 'Cut-Out PSI',               type: 'number', unit: 'PSI' },
    { id: 'precharge_psi',       label: 'Tank Pre-Charge PSI',       type: 'number', unit: 'PSI' },
    { id: 'last_water_test',     label: 'Last Water Test Date',      type: 'date' },
    { id: 'notes',               label: 'Notes',                     type: 'textarea' },
  ]
}
```

### Propane
```typescript
{
  id: 'propane',
  label: 'Propane Tank',
  driveFolderId: DRIVE_FOLDER_MAP.propane,
  nameplatePrompt: 'Extract propane tank nameplate data. Key fields: tank_capacity_gallons, manufacturer, serial_number, manufacture_date, wc_gallons, tare_weight.',
  fields: [
    { id: 'tank_capacity_gal',  label: 'Tank Capacity (gal)',         type: 'number', unit: 'gal' },
    { id: 'ownership',          label: 'Owned or Leased',             type: 'select', options: ['Owned', 'Leased'] },
    { id: 'supplier_name',      label: 'Supplier Name',               type: 'text' },
    { id: 'account_number',     label: 'Account Number',              type: 'text' },
    { id: 'delivery_type',      label: 'Delivery Type',               type: 'select', options: ['Automatic', 'Will-Call'] },
    { id: 'supplier_phone',     label: 'Supplier Phone',              type: 'text' },
    { id: 'tank_serial',        label: 'Tank Serial Number',          type: 'text' },
    { id: 'regulator_outlet_psi', label: 'Regulator Outlet PSI',     type: 'number', unit: 'PSI' },
    { id: 'lease_terms',        label: 'Lease Terms / Buyout',        type: 'textarea' },
    { id: 'appliances_served',  label: 'Appliances Served',           type: 'textarea', placeholder: 'List all propane appliances + BTU loads' },
    { id: 'notes',              label: 'Notes',                       type: 'textarea' },
  ]
}
```

### Septic System
```typescript
{
  id: 'septic',
  label: 'Septic System',
  driveFolderId: DRIVE_FOLDER_MAP.root, // no dedicated folder yet — uploads to root or create new
  fields: [
    { id: 'tank_size_gal',      label: 'Tank Size (gal)',     type: 'number', unit: 'gal' },
    { id: 'tank_material',      label: 'Tank Material',       type: 'select', options: ['Concrete', 'Fiberglass', 'Polyethylene'] },
    { id: 'tank_location',      label: 'Tank Location Notes', type: 'textarea', placeholder: 'Describe location relative to structures; reference GPS pin or sketch' },
    { id: 'access_risers',      label: 'Access Riser Locations', type: 'textarea' },
    { id: 'drainfield_location', label: 'Drainfield Location Notes', type: 'textarea' },
    { id: 'last_pump_date',     label: 'Last Pump Date',      type: 'date' },
    { id: 'pump_company',       label: 'Pumping Company',     type: 'text' },
    { id: 'pump_interval',      label: 'Recommended Pump Interval', type: 'text', placeholder: 'e.g. Every 3 years' },
    { id: 'permit_on_file',     label: 'As-Built Permit on File', type: 'boolean' },
    { id: 'notes',              label: 'Notes',               type: 'textarea' },
  ]
}
```

### Electrical Panel (allowMultiple: true — one record per panel)
```typescript
{
  id: 'electrical',
  label: 'Electrical Panel',
  driveFolderId: DRIVE_FOLDER_MAP.projects, // or create Electrical subfolder
  allowMultiple: true,
  fields: [
    { id: 'panel_label',        label: 'Panel Label',         type: 'text', placeholder: 'e.g. Main House, Barn' },
    { id: 'brand',              label: 'Panel Brand',         type: 'text' },
    { id: 'amperage',           label: 'Main Breaker (A)',     type: 'number', unit: 'A' },
    { id: 'breaker_count',      label: 'Breaker Spaces',      type: 'number' },
    { id: 'location',           label: 'Physical Location',   type: 'text' },
    { id: 'feed_source',        label: 'Feed Source',         type: 'text', placeholder: 'e.g. Utility service entrance, or subpanel fed from main via 4/3 AWG' },
    { id: 'wire_size_to_panel', label: 'Wire Size (subpanels)', type: 'text', unit: 'AWG' },
    { id: 'circuit_directory',  label: 'Circuit Directory',   type: 'textarea', placeholder: 'Slot | Amps | Label' },
    { id: 'notes',              label: 'Notes',               type: 'textarea' },
  ]
}
```

### Appliance (allowMultiple: true — one record per appliance)
```typescript
{
  id: 'appliance',
  label: 'Appliance',
  driveFolderId: DRIVE_FOLDER_MAP.kitchen, // or per-appliance routing logic
  allowMultiple: true,
  nameplatePrompt: 'Extract appliance nameplate data. Key fields: brand, model, serial_number, appliance_type, voltage, amperage, wattage, fuel_type, capacity, manufacture_date.',
  fields: [
    { id: 'appliance_type',    label: 'Appliance Type',       type: 'select', options: ['Refrigerator', 'Range/Oven', 'Dishwasher', 'Microwave', 'Range Hood', 'Washer', 'Dryer', 'Freezer', 'Humidifier', 'Garage Door Opener', 'Other'] },
    { id: 'location',          label: 'Location',             type: 'text', placeholder: 'e.g. Kitchen, Laundry Room, Garage' },
    { id: 'brand',             label: 'Brand',                type: 'text' },
    { id: 'model',             label: 'Model Number',         type: 'text' },
    { id: 'serial_number',     label: 'Serial Number',        type: 'text' },
    { id: 'fuel_type',         label: 'Fuel / Power Type',    type: 'select', options: ['Electric (120V)', 'Electric (240V)', 'Propane', 'Natural Gas', 'N/A'] },
    { id: 'purchase_date',     label: 'Purchase Date',        type: 'date' },
    { id: 'filter_part',       label: 'Filter Part # (if applicable)', type: 'text' },
    { id: 'notes',             label: 'Notes',                type: 'textarea' },
  ]
}
```

### Roof
```typescript
{
  id: 'roof',
  label: 'Roof',
  driveFolderId: DRIVE_FOLDER_MAP.roof,
  allowMultiple: true, // one record per section (shingle, standing seam)
  fields: [
    { id: 'section_label',        label: 'Section Label',              type: 'text', placeholder: 'e.g. Main House Shingle, Barn Standing Seam' },
    { id: 'contractor',           label: 'Contractor',                 type: 'text' },
    { id: 'install_date',         label: 'Install Date',               type: 'date' },
    { id: 'material_type',        label: 'Material Type',              type: 'select', options: ['Asphalt Shingle', 'Standing Seam Metal', 'Corrugated Metal', 'TPO', 'EPDM', 'Wood Shake'] },
    { id: 'manufacturer',         label: 'Manufacturer',               type: 'text' },
    { id: 'product_line',         label: 'Product Line / Series',      type: 'text' },
    { id: 'color',                label: 'Color',                      type: 'text' },
    { id: 'shingle_class',        label: 'Shingle Class (impact)',      type: 'select', options: ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'N/A'] },
    { id: 'metal_gauge',          label: 'Metal Gauge',                type: 'text', placeholder: 'e.g. 26 gauge' },
    { id: 'metal_finish',         label: 'Metal Finish',               type: 'text', placeholder: 'e.g. Kynar 500, SMP' },
    { id: 'square_footage',       label: 'Square Footage',             type: 'number', unit: 'sq ft' },
    { id: 'mfr_warranty_years',   label: 'Manufacturer Warranty (yrs)', type: 'number', unit: 'years' },
    { id: 'workmanship_warranty', label: 'Workmanship Warranty (yrs)', type: 'number', unit: 'years' },
    { id: 'notes',                label: 'Notes',                      type: 'textarea' },
  ]
}
```

### Surveillance (allowMultiple: true — one record per camera)
```typescript
{
  id: 'surveillance',
  label: 'Surveillance / Camera',
  driveFolderId: DRIVE_FOLDER_MAP.surveillance,
  allowMultiple: true,
  fields: [
    { id: 'device_type',       label: 'Device Type',          type: 'select', options: ['IP Camera', 'NVR/DVR', 'PoE Switch', 'Doorbell Camera'] },
    { id: 'location_label',    label: 'Location Label',        type: 'text', placeholder: 'e.g. Driveway Entrance, Barn East' },
    { id: 'brand',             label: 'Brand',                 type: 'text' },
    { id: 'model',             label: 'Model Number',          type: 'text' },
    { id: 'serial_number',     label: 'Serial Number',         type: 'text' },
    { id: 'mac_address',       label: 'MAC Address',           type: 'text' },
    { id: 'ip_address',        label: 'IP Address',            type: 'text' },
    { id: 'resolution',        label: 'Resolution',            type: 'text', placeholder: 'e.g. 4MP, 4K' },
    { id: 'storage_tb',        label: 'NVR Storage (TB)',      type: 'number', unit: 'TB' },
    { id: 'retention_days',    label: 'Retention (days)',      type: 'number', unit: 'days' },
    { id: 'network_segment',   label: 'Network / VLAN',        type: 'text' },
    { id: 'notes',             label: 'Notes',                 type: 'textarea' },
  ]
}
```

### Barn
```typescript
{
  id: 'barn',
  label: 'Barn',
  driveFolderId: DRIVE_FOLDER_MAP.root, // create Barn subfolder
  fields: [
    { id: 'dimensions',         label: 'Dimensions (L×W×H)',   type: 'text', placeholder: 'e.g. 40x60x14 eave' },
    { id: 'construction_type',  label: 'Construction Type',    type: 'select', options: ['Post-Frame', 'Timber Frame', 'Stud Frame', 'Pole Barn'] },
    { id: 'electrical_panel',   label: 'Electrical Panel Amps', type: 'number', unit: 'A' },
    { id: 'electrical_notes',   label: 'Electrical Notes',     type: 'textarea', placeholder: 'Circuit count, outlet locations, lighting type' },
    { id: 'water_supply',       label: 'Water Supply',         type: 'boolean' },
    { id: 'water_notes',        label: 'Water Notes',          type: 'text', placeholder: 'e.g. Frost-free hydrant, connected to house well' },
    { id: 'heating',            label: 'Heating / Ventilation', type: 'textarea' },
    { id: 'current_use',        label: 'Current Use',          type: 'text' },
    { id: 'condition_notes',    label: 'Condition Notes',      type: 'textarea' },
    { id: 'stain_last_applied', label: 'Stain Last Applied',   type: 'date' },
    { id: 'notes',              label: 'Notes',                type: 'textarea' },
  ]
}
```

### Forestry / CAUV Activity Log (allowMultiple: true — one record per activity)
```typescript
{
  id: 'forestry_log',
  label: 'Forestry / CAUV Log',
  driveFolderId: DRIVE_FOLDER_MAP.cauv,
  allowMultiple: true,
  fields: [
    { id: 'activity_type',   label: 'Activity Type',      type: 'select', options: ['CAUV Renewal', 'Privet Treatment', 'Tree Removal', 'Timber Harvest', 'Planting', 'Invasive Treatment', 'Forestry Inspection', 'Other'] },
    { id: 'activity_date',   label: 'Activity Date',      type: 'date' },
    { id: 'contractor',      label: 'Contractor / Contact', type: 'text' },
    { id: 'cost',            label: 'Cost ($)',            type: 'number', unit: '$' },
    { id: 'area_affected',   label: 'Area / Location',    type: 'text' },
    { id: 'chemical_used',   label: 'Chemical / Product', type: 'text' },
    { id: 'notes',           label: 'Notes',              type: 'textarea' },
  ]
}
```

---

## 7. User Flows

### 7.1 Nameplate Capture (Primary Flow)

```
Home
  └─→ Tap category (e.g., "Generator")
        └─→ CategoryScreen loads
              └─→ Tap [Camera] button
                    └─→ Native camera opens (HTML5 capture API)
                          └─→ Photo taken
                                └─→ Photo sent to Anthropic Vision API
                                      with category-specific extraction prompt
                                            └─→ JSON response parsed
                                                  └─→ Form fields auto-filled
                                                        └─→ User reviews, corrects, adds notes
                                                              └─→ Tap [Save]
                                                                    └─→ Markdown generated
                                                                    └─→ MD file + photos
                                                                          uploaded to Drive
                                                                    └─→ Success screen
                                                                          with Drive link
```

**Error handling:**
- If Anthropic call fails: present empty form with error toast; do not block entry
- If Drive upload fails: save record to IndexedDB offline queue; retry on next foreground + connectivity

### 7.2 Manual Entry

```
Home → Select category → Fill form manually → Add photos (optional)
  → [Save] → Drive upload → Success
```

### 7.3 Document / Receipt Upload

```
Home → [Upload Document] → Select category
  → Choose file from camera roll or Files app (PDF, JPEG, PNG)
  → Optional: add description text field
  → [Upload] → Uploads directly to category's Drive folder
  → Success with Drive link
```

### 7.4 Checklist View

```
Home → [Checklist] → List of all categories
  → Each shows: icon, label, status badge (Complete / Incomplete)
  → "Complete" = at least one CaptureRecord with uploadStatus='uploaded' exists
  → Tap incomplete → opens entry flow for that category
  → Shows overall completion: "11 / 20 categories documented"
```

### 7.5 First Launch / Settings

```
First launch:
  → Welcome screen
  → [Sign in with Google] → PKCE OAuth → Drive authorized
  → [Enter Anthropic API Key] → stored in localStorage
  → Ready screen → Home

Subsequent launches:
  → Auth check → if valid token, go to Home
  → If expired → silent re-auth attempt → if fails, show Sign In
```

---

## 8. UI Structure

### Screen Map

```
App
├── SplashScreen (first launch only)
│   ├── GoogleSignInButton
│   └── AnthropicKeyInput
│
├── HomeScreen
│   ├── CategoryGrid
│   │   └── CategoryCard × N (icon, label, completion dot)
│   ├── ChecklistButton (shows "X/Y complete")
│   └── UploadDocumentButton
│
├── CategoryScreen
│   ├── Header (category name, back button)
│   ├── CameraButton → triggers nameplate extraction
│   ├── AIStatusIndicator (idle / extracting / done / error)
│   ├── DynamicForm
│   │   └── FieldRenderer × N (text, number, date, select, textarea, boolean)
│   ├── PhotoAttachments (thumbnails, add, remove)
│   └── SaveButton
│
├── ChecklistScreen
│   ├── ProgressBar ("X / Y categories")
│   └── CategoryList (sorted: incomplete first)
│       └── CategoryRow (icon, label, status, tap → CategoryScreen)
│
├── UploadScreen
│   ├── CategoryPicker (select)
│   ├── FilePicker (native file input)
│   ├── DescriptionInput
│   └── UploadButton
│
└── SettingsScreen
    ├── GoogleAccountStatus (email, sign out)
    ├── AnthropicKeyField (masked, editable)
    ├── OfflineQueueStatus (N pending uploads, [Retry Now])
    └── AboutSection (version, Drive root folder ID)
```

### Mobile UX Constraints
- All interactive elements minimum 44×44pt touch target
- No hover states for primary interactions
- Form labels above inputs (not placeholders as labels — bad for mobile)
- Camera button prominent — it's the primary action
- Keyboard-aware: form scrolls above keyboard on iOS
- Dark mode support via Tailwind's `dark:` prefix

---

## 9. Google Drive Integration

### 9.1 OAuth 2.0 PKCE Flow

```typescript
// PKCE implementation (no client secret required)
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const REDIRECT_URI = window.location.origin;
const SCOPES = [
  'https://www.googleapis.com/auth/drive',  // or drive.file — see §14
  'openid', 'email'
];

// Step 1: Generate code verifier and challenge
const generatePKCE = async () => {
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return { verifier, challenge };
};

// Step 2: Redirect to Google
const initiateAuth = async () => {
  const { verifier, challenge } = await generatePKCE();
  localStorage.setItem('pkce_verifier', verifier);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
};

// Step 3: Exchange code for tokens (on redirect back)
// Step 4: Store tokens in localStorage, handle refresh
```

**Important:** Google requires the OAuth client ID to be registered as a "Web application" type with the exact redirect URI in Google Cloud Console. The client ID is safe to expose in client-side code (it's a public identifier, not a secret).

### 9.2 File Upload

```typescript
// Multipart upload for files under 5MB
const uploadToDrive = async (
  accessToken: string,
  folderId: string,
  filename: string,
  content: string | Blob,
  mimeType: string
): Promise<string> => {  // returns new file ID
  const metadata = { name: filename, parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', content instanceof Blob ? content : new Blob([content], { type: mimeType }));

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }
  );
  const { id } = await response.json();
  return id;
};
```

### 9.3 Folder Routing Logic

For categories like `appliance` that serve multiple physical rooms, the `driveFolderId` can be determined at save time based on the `location` field value:

```typescript
const resolveFolderId = (categoryId: string, fields: Record<string, string>): string => {
  if (categoryId === 'appliance') {
    const location = fields.location?.toLowerCase() ?? '';
    if (location.includes('kitchen')) return DRIVE_FOLDER_MAP.kitchen;
    if (location.includes('laundry')) return DRIVE_FOLDER_MAP.laundry ?? DRIVE_FOLDER_MAP.projects;
    return DRIVE_FOLDER_MAP.projects;
  }
  return DRIVE_FOLDER_MAP[categoryId] ?? DRIVE_FOLDER_MAP.root;
};
```

---

## 10. Anthropic Vision Integration

### 10.1 API Call

```typescript
const extractNameplate = async (
  apiKey: string,
  imageBase64: string,
  category: Category
): Promise<Record<string, string | null>> => {
  const fieldList = category.fields
    .filter(f => f.aiExtractHint || f.id)
    .map(f => f.aiExtractHint ?? f.id)
    .join(', ');

  const systemPrompt = `You are an equipment specification extractor for a property management system.
Extract data from equipment nameplate photos and return ONLY a valid JSON object.
No preamble, no markdown, no explanation — only the JSON object.
Use null for any field not legible or not present on the nameplate.`;

  const userPrompt = `Extract all visible specifications from this ${category.label} nameplate photo.

Return a JSON object with these keys: ${fieldList}

Additional extraction rules:
${category.nameplatePrompt ?? ''}

Common manufacturer date encoding in serial numbers:
- Generac: positions 2-3 = year, 4-5 = week
- Carrier/Bryant: positions 5-6 = year, 7-8 = week
- Rheem/Ruud: positions 2-5 = year+week (YYWW)
- A.O. Smith: positions 2-5 = year+week

Return only the JSON object.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 },
          },
          { type: 'text', text: userPrompt },
        ],
      }],
    }),
  });

  const data = await response.json();
  const text = data.content[0]?.text ?? '{}';
  return JSON.parse(text);
};
```

### 10.2 Form Auto-Fill Strategy

- AI response keys are matched to field IDs by exact match first, then fuzzy match
- Mismatched or extra keys are silently ignored
- User always sees the filled form before saving — AI output is never written to Drive without review
- If JSON parse fails, catch and present empty form with toast: "Extraction failed — please fill manually"

---

## 11. PWA Configuration

### manifest.json
```json
{
  "name": "Property Capture",
  "short_name": "PropertyCap",
  "description": "Field capture tool for 2392 Tannerville Rd",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1e3a5f",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### iOS Additions (index.html head)
```html
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="PropertyCap" />
<link rel="apple-touch-icon" href="/icon-180.png" />
```

### Service Worker Strategy
- App shell (HTML, CSS, JS): cache-first
- Anthropic API calls: network-only (no caching sensitive responses)
- Drive uploads: network with offline queue fallback (store in IndexedDB, retry on reconnect)
- Camera captures: stored in IndexedDB as base64 pending upload confirmation

---

## 12. Deployment

### GitHub Pages (Recommended)

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  build-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run build
        env:
          VITE_GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID }}
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

**Required GitHub secrets:** `GOOGLE_CLIENT_ID`  
**No server-side secret required** — PKCE eliminates the need for a `CLIENT_SECRET`.

### Google Cloud Console Setup
1. Create project → Enable Google Drive API
2. OAuth consent screen: External, scopes: `drive` (or `drive.file`)
3. OAuth client: Web application type, authorized redirect URI: `https://{username}.github.io/{repo-name}/`
4. Copy client ID → GitHub secret `GOOGLE_CLIENT_ID`

### Netlify Alternative
```bash
netlify init  # connect to GitHub repo
# Set env var VITE_GOOGLE_CLIENT_ID in Netlify dashboard
# Add site URL to Google OAuth authorized redirect URIs
```

---

## 13. Implementation Phases

### Phase 1 — Functional MVP (4–6 hours)
- [ ] Vite + React + TypeScript + Tailwind scaffold
- [ ] Google OAuth PKCE implementation
- [ ] Drive API upload wrapper
- [ ] 5 priority categories: Generator, HVAC, Water Treatment, Propane, Well
- [ ] Manual entry forms (no AI yet)
- [ ] Markdown formatter
- [ ] Basic home screen + category screen
- [ ] Deploy to GitHub Pages

**Deliverable:** Functional app that can capture and upload structured records for 5 categories.

### Phase 2 — AI Extraction (3–4 hours)
- [ ] Camera capture component (HTML5 `<input type="file" capture="environment">`)
- [ ] Anthropic Vision API integration
- [ ] Form auto-fill from AI response
- [ ] API key management in Settings
- [ ] All 15+ categories defined and wired
- [ ] Error handling (API failures, parse failures)

**Deliverable:** Full nameplate-capture → form auto-fill → Drive upload flow working.

### Phase 3 — Polish & Completeness (3–4 hours)
- [ ] PWA manifest + service worker
- [ ] Offline queue (IndexedDB) with retry
- [ ] iOS home screen install support
- [ ] Document upload flow
- [ ] Checklist view with completion tracking
- [ ] Success screen with Drive link deeplink
- [ ] Settings screen: account status, offline queue status

**Deliverable:** Production-ready PWA installable on iOS and Android.

---

## 14. Open Questions (Requires Decision Before Build)

### Q1: Google Drive Scope
| Option | Scope | Can read pre-existing files | Checklist reflects prior uploads | Risk |
|---|---|---|---|---|
| A (Narrow) | `drive.file` | No | No | Low |
| B (Full) | `drive` | Yes | Yes | Moderate — full Drive access from browser |

Recommendation: Start with `drive` scope. This is a personal device, personal account tool. The checklist is more useful if it can detect files you've already uploaded. Can downgrade to `drive.file` if you want to minimize scope.

### Q2: Multi-User Support
If Kelly should also be able to use the app, the Anthropic API key approach breaks — she'd need to enter your key. Solution: a Cloudflare Worker as an API proxy (~20 lines) that holds the key server-side and rate-limits to your Google account. Adds ~30 min of work and zero ongoing cost (Cloudflare free tier). Worth it?

### Q3: New Drive Folders
Several categories (Septic, Barn, Well, Electrical, Laundry) don't have existing Drive folders. Options:
- A: Create the folders manually in Drive before building, add IDs to `FolderMap.ts`
- B: App creates missing folders automatically on first use via Drive API (`files.create` with `mimeType: application/vnd.google-apps.folder`)

Recommendation: Option B (auto-create). Less setup friction; folders are cheap.

### Q4: Category Count at Launch
Full spec defines 15+ categories. Phase 1 targets 5. Confirm priority order or extend Phase 1 scope.

Priority order suggested:
1. Generator
2. HVAC
3. Water Heater
4. Water Treatment / Softener
5. Well System
6. Propane
7. Septic
8. Electrical Panel
9. Appliances (kitchen)
10. Surveillance / Cameras
11. Barn
12. Roof
13. Forestry / CAUV Log
14. Smart Home / IoT
15. Appliances (laundry, other)

---

## Appendix A: Drive Folder Reference

| Category | Drive Folder | Folder ID |
|---|---|---|
| Root | 2392 Tannerville Rd | `14CifGAre0egOHO0qVdrVBXCQY0WXk6Wt` |
| Projects | Projects | `1f31FjL-3eGa-Xr_rxMMIWHwqaVCViu4i` |
| HVAC | HVAC | `1f7Fbetgic7wMubOKVZr4GZbbzPMJK255` |
| Kitchen appliances | Kitchen | `1G83sNSxGb43ZcNU1AA6kuVcCKeMkzfLY` |
| Water Heater / Treatment | Water Treatment / Water Heater | `1b_dq5qNSF8AxrN2tXszgy98IaxHuruFh` |
| Propane | Propane Tank | `1iNccKytMpi4qrgteaxbmB4VYm3iTPMbA` |
| Generator | Generator | `1f6ceFGDaMRwQO_7OcxGHywuFolFJ5Hpg` |
| Surveillance | Surveillance | `1beJLvmhjU0vm3yBa7dnVnJ2qEwtk-nv8` |
| Roof | Roof | `1CzArWstlwApmlZcKW87PYK81167Aq0Rn` |
| Dormers | Dormers | `1egqQpspUYTF7UVAqtfOiAhkIqMuc4Qjw` |
| Basement | Basement | `1XnCnKnVsEe9DxCpxzYtcjo3gL6Vyl6lT` |
| Sunroom | Sunroom | `1YuGyat--XsqJ9I-5RJfqGfchJfBDY0dJ` |
| CAUV / Forestry | CAUV | `1jlkefvZg8gkmVDkBU-gsJUYwA5mmNooU` |
| Invoices | Invoices | `1KhSADp7RI45t24CuircQIrRBQaiNZIjw` |
| Septic | *(to be created)* | TBD |
| Barn | *(to be created)* | TBD |
| Well | *(to be created)* | TBD |
| Electrical | *(to be created)* | TBD |
| Laundry | *(to be created)* | TBD |

---

*This document is the authoritative spec for the Property Capture PWA. Update before starting each implementation phase. When implementation begins, this file moves into the project repo as `SPEC.md`.*
