# Property Manager — Full System Specification

**Project:** Multi-Property Management Platform (PWA + Android)
**Properties:** 2392 Tannerville Rd, Orrville OH · Camp / Cabin (secondary property)
**Author:** Pete Drake
**Created:** April 2026
**Status:** Expanded Specification — Supersedes `property-capture-tool-spec.md`

---

## Table of Contents

1. [Vision & Scope](#1-vision--scope)
2. [What This Is Not](#2-what-this-is-not)
3. [Multi-Property Model](#3-multi-property-model)
4. [Feature Areas](#4-feature-areas)
5. [Architecture Overview](#5-architecture-overview)
6. [Knowledge Layer — Google Drive](#6-knowledge-layer--google-drive)
7. [Intelligence Layer — OpenRouter AI](#7-intelligence-layer--openrouter-ai)
8. [Application Layer — PWA + Android](#8-application-layer--pwa--android)
9. [Home Assistant Integration](#9-home-assistant-integration)
10. [Data Model](#10-data-model)
11. [Category Definitions](#11-category-definitions)
12. [UI Specification & Mockups](#12-ui-specification--mockups)
13. [Automation & AI Workflows](#13-automation--ai-workflows)
14. [User Walkthrough](#14-user-walkthrough)
15. [Implementation Phases](#15-implementation-phases)
16. [Open Questions & Decisions](#16-open-questions--decisions)
17. [Appendix A: Drive Folder Reference](#appendix-a-drive-folder-reference)

---

## 1. Vision & Scope

### The Problem

A property owner with one or more properties — a primary residence with mechanical systems, outbuildings, and active land management, plus a camp with a cabin and its own unique systems — faces a relentless accumulation of institutional knowledge that currently lives nowhere: appliance serial numbers on Post-It notes, service contractor phone numbers in email threads, roof warranty documents in a box, propane delivery history nowhere at all.

The **immediate problem** is capture friction: it's too hard to record what you know in the field. The **real problem** is everything that follows — no maintenance schedule reminding you the generator needs oil in October, no budget forecast showing you the furnace is 18 years old and due for replacement, no AI advisor telling you whether to repair or replace the water heater, no log of which privet beds you treated last year.

### The Solution

A **property intelligence platform** that:

1. **Captures** equipment specs, photos, service records, warranties, and invoices frictionlessly — stand in front of anything, photograph it, AI extracts the data, one tap saves it
2. **Stores** all knowledge durably in Google Drive — human-readable Markdown that works even without the app
3. **Indexes** that knowledge so AI can reason over it — asking "what maintenance is due this fall?" gets a real answer
4. **Schedules** maintenance proactively — based on manufacturer intervals, service history, and seasonal needs
5. **Budgets** for repairs and replacements — projecting capital needs 1, 3, and 10 years out
6. **Advises** on upgrade decisions — AI-assisted repair vs. replace analysis, efficiency upgrade ROI
7. **Integrates** with Home Assistant — live sensor data feeds into maintenance and alerting logic
8. **Works everywhere** — mobile in the field, desktop for planning, Android app for deep use

### Core Principle: Drive as the Source of Truth

The app is an interface. Google Drive holds the data. If the app disappeared tomorrow, all knowledge would remain in human-readable Markdown files in Drive, organized into a folder hierarchy. The app's job is to make reading and writing those files fast, intelligent, and contextual.

---

## 2. What This Is Not

- Not a property management platform for landlords or rental properties
- Not a home automation hub (Home Assistant does that; we integrate with it)
- Not a general contractor management tool
- Not a replacement for Drive — Drive remains directly useful and human-readable
- Not dependent on a backend server to function

---

## 3. Multi-Property Model

The tool manages an **estate** — a collection of properties owned by the same person. Each property has:

- Its own identity (name, address, acquisition date, purchase price)
- Its own Drive folder subtree
- Its own category/system inventory
- Its own maintenance schedule
- Its own budget
- Shared contractors and contacts

### Property Types

**Primary Residence** (`residence`)
Full range of mechanical, structural, land, and outbuilding categories. Connected to Home Assistant for monitoring. Long-term investment lens — this is the largest asset.

**Camp / Cabin** (`camp`)
Secondary property with simpler systems but unique categories:
- Cabin structure (log, timber frame, conventional)
- Off-grid or grid-tied power (generator, solar)
- Water supply (well, lake intake, hauled water, cistern)
- Waste (septic, outhouse, composting)
- Seasonal systems (winterization, spring startup)
- Recreation infrastructure (docks, ATV trails, boat storage)
- Road access / driveway (may be shared or seasonal)
- Fire safety (defensible space, fire suppression)

**Vacant Land / Parcel** (`land`) — future type
Forestry, agricultural, hunting parcels with no structures.

### Property Selector

Every screen in the app carries a property context. The top-level navigation allows switching between properties. AI queries and maintenance schedules are always scoped to the active property (or "all properties" for estate-level views).

---

## 4. Feature Areas

### 4.1 Knowledge Capture (Foundation)
*Photograph → AI extract → review → save to Drive*
- Equipment nameplates: mechanical, structural, appliances
- Service records: date, contractor, cost, work performed, parts used
- Receipts and invoices: upload PDF/photo → auto-categorize
- Warranty documents: upload → AI extracts coverage dates and terms
- Water test results: photo of lab report → AI extracts values
- Permits and as-builts: structural, electrical, septic

### 4.2 Property Knowledge Base
*Everything captured becomes queryable context*
- Drive-backed index: structured index document per property listing all records
- AI-readable summaries: auto-generated summary documents AI can load for context
- Equipment inventory: filterable list of all documented systems
- Photo gallery: all captured photos, browsable by category
- Document vault: all uploaded PDFs and receipts
- Service history timeline: chronological view of all service events

### 4.3 Maintenance Scheduler
*Proactive, not reactive*
- Auto-generated maintenance tasks based on installed equipment and manufacturer specs
- Recurring schedules: annual, quarterly, monthly, seasonal, usage-based
- Task calendar: week/month view of upcoming maintenance
- Overdue alerts: push notifications (PWA notifications API)
- Completion logging: mark done → creates service record in Drive
- AI-suggested intervals: "Based on your well depth and pump age, you should test water annually"
- Seasonal checklists: Spring Startup, Fall Winterization (especially important for camp)

### 4.4 Budget Planner & Capital Forecast
*What's coming and what it will cost*
- Equipment age tracking: install dates → age → expected remaining life
- Replacement forecasting: "Furnace (2007) — ~3–5 years remaining — est. $8,000–$12,000"
- Capital reserve suggestions: monthly set-aside recommendations
- Annual maintenance budget: sum of all scheduled recurring costs
- Historical spend tracking: totals by year, category, property
- 1-year, 3-year, 10-year capital forecast view
- Integration with service record costs captured at entry

### 4.5 AI Advisory
*Ask questions, get property-specific answers*
- Natural language Q&A over property knowledge base
- Repair vs. replace analysis: "My water heater is 14 years old and the anode rod is corroded — repair or replace?"
- Upgrade ROI analysis: "Would adding solar make sense at the camp given our generator usage?"
- Contractor recommendations: AI suggests what to look for when hiring for specific work
- Code compliance awareness: "Is my electrical panel grandfathered or does it need updating?"
- System interdependency alerts: "If you're replacing the furnace, it's worth evaluating the duct system at the same time"
- OpenRouter model selection: choose between Claude, GPT-4, Gemini for different query types

### 4.6 Project Tracker
*From "I should fix that" to "done and documented"*
- Project log: name, status, notes, linked records
- Project phases: Planning → Bidding → In Progress → Complete
- Linked bids and invoices: attach documents to projects
- Project-driven Drive organization: project folder auto-created in Drive
- Post-project checklist: warranty capture, photo documentation, permit filing

### 4.7 Contacts & Contractors
*Who does the work*
- Contractor profiles: name, company, phone, email, specialty, rating, notes
- Service history linked to contractor records
- "Who serviced my generator last?" — answerable instantly
- Vendor records: propane supplier, water softener salt supplier, etc.
- Emergency contacts: utility companies, after-hours HVAC, plumber

### 4.8 Home Assistant Integration
*Live sensor data feeds the knowledge base*
See §9 for full detail.
- Pull current readings: tank levels, temperatures, humidity, power consumption
- Trigger alerts: low propane, high sump water level, generator run time exceeded
- Maintenance trigger from usage: "Generator ran 47 hours since last oil change"
- Display Home Assistant sensors on relevant equipment records

---

## 5. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER INTERFACE LAYER                        │
│  PWA (React + Vite)                    Android App (future)     │
│  ├── Mobile browser (primary)          └── React Native / Expo  │
│  └── Desktop browser (full layout)                              │
└─────────────────┬───────────────────────────────────────────────┘
                  │ reads / writes
┌─────────────────▼───────────────────────────────────────────────┐
│                   APPLICATION LOGIC LAYER                       │
│  Client-side TypeScript (no server)                             │
│  ├── Drive Client (Google Drive API v3)                         │
│  ├── AI Client (OpenRouter API)                                 │
│  ├── Knowledge Indexer (Drive doc parser + local cache)         │
│  ├── Maintenance Engine (schedule generation + tracking)        │
│  ├── Budget Engine (capital forecast calculations)              │
│  └── HA Bridge (Home Assistant REST API / WebSocket)            │
└────┬────────────────────────┬────────────────────────┬──────────┘
     │                        │                        │
┌────▼──────────┐   ┌─────────▼──────────┐   ┌────────▼──────────┐
│ KNOWLEDGE     │   │  INTELLIGENCE      │   │  INTEGRATION      │
│ LAYER         │   │  LAYER             │   │  LAYER            │
│               │   │                   │   │                   │
│ Google Drive  │   │ OpenRouter API    │   │ Home Assistant    │
│ ├── Markdown  │   │ ├── Claude models │   │ ├── REST API      │
│ │   records   │   │ ├── GPT-4         │   │ ├── WebSocket     │
│ ├── Photos    │   │ ├── Gemini        │   │ └── Automations   │
│ ├── PDFs      │   │ └── Mistral       │   │                   │
│ ├── Index     │   │                   │   │ (local network    │
│ │   docs      │   │ Selected per      │   │  access assumed)  │
│ └── Summary   │   │ task type         │   │                   │
│     docs      │   │                   │   │                   │
└───────────────┘   └───────────────────┘   └───────────────────┘
     │
     ▼ (all human-readable, always accessible outside the app)
```

### Key Architectural Principles

**No backend required.** Google PKCE OAuth + Drive API v3 + OpenRouter API are all callable directly from the browser. The app is a static bundle deployable to GitHub Pages or Netlify.

**Drive is the database.** Each record is a `.md` file. Each property has an `_index.md` and a `_summary.md` that the AI loads for context before answering questions. No proprietary data format.

**AI is optional.** Every feature works without AI — capture is manual, maintenance is manually scheduled, AI just accelerates everything.

**Progressive enhancement.** The app works as a basic capture tool on day one. Intelligence improves as data accumulates. Home Assistant integration is optional.

---

## 6. Knowledge Layer — Google Drive

### 6.1 Folder Structure

```
Google Drive Root (personal Drive)
└── Property Manager/
    ├── _app_index.json                ← machine-readable index of all records
    ├── 2392-Tannerville/              ← primary residence
    │   ├── _property.md               ← property profile
    │   ├── _index.md                  ← AI-readable index of all records
    │   ├── _summary.md                ← AI-generated property summary
    │   ├── Mechanical/
    │   │   ├── Generator/
    │   │   ├── HVAC/
    │   │   ├── Water-Treatment/
    │   │   ├── Well/
    │   │   ├── Propane/
    │   │   ├── Sump-Pump/
    │   │   └── Radon/
    │   ├── Structural/
    │   │   ├── Roof/
    │   │   ├── Foundation/
    │   │   ├── Windows/
    │   │   └── Exterior-Doors/
    │   ├── Appliances/
    │   │   ├── Kitchen/
    │   │   ├── Laundry/
    │   │   └── Other/
    │   ├── Electrical/
    │   ├── Outbuildings/
    │   │   └── Barn/
    │   ├── Land/
    │   │   ├── Septic/
    │   │   ├── Driveway/
    │   │   ├── CAUV-Forestry/
    │   │   └── Fencing/
    │   ├── Systems/
    │   │   ├── Surveillance/
    │   │   ├── Alarm/
    │   │   └── Smart-Home/
    │   ├── Projects/
    │   ├── Invoices/
    │   └── Purchase/
    │
    └── Camp/                          ← secondary property
        ├── _property.md
        ├── _index.md
        ├── _summary.md
        ├── Cabin/
        │   ├── Structure/
        │   ├── Interior/
        │   └── Deck-Porch/
        ├── Power/
        │   ├── Generator/
        │   └── Solar/               (if applicable)
        ├── Water/
        │   ├── Well-or-Source/
        │   └── Treatment/
        ├── Waste/
        │   └── Septic/
        ├── Seasonal/
        │   ├── Winterization/
        │   └── Spring-Startup/
        ├── Recreation/
        │   ├── Dock/
        │   └── Trails/
        ├── Land/
        │   └── Access-Road/
        ├── Invoices/
        └── Projects/
```

### 6.2 The Index Document

Each property has a `_index.md` maintained by the app. It is the AI's primary context document.

```markdown
# Property Index — 2392 Tannerville Rd
**Last Updated:** 2026-04-12T14:32:00Z
**App Version:** 1.4.0

## Equipment Inventory

| System | Category | Record Date | File | Status |
|---|---|---|---|---|
| Generac 22kW | Generator | 2026-04-12 | Mechanical/Generator/generator_2026-04-12_0934.md | ✓ |
| Trane XR15 (Main) | HVAC | 2026-03-20 | Mechanical/HVAC/hvac_main_2026-03-20.md | ✓ |
| Rheem 50gal | Water Heater | 2026-03-20 | Mechanical/Water-Treatment/water_heater_2026-03-20.md | ✓ |
| ... | | | | |

## Service History (Recent)

| Date | System | Work | Contractor | Cost |
|---|---|---|---|---|
| 2025-11-01 | Generator | Annual service | Buckeye Power Sales | $180 |
| 2026-01-15 | HVAC Main | Filter change | Self | $24 |
| ... | | | | |

## Open Projects

| Project | Status | Est. Cost |
|---|---|---|
| Barn re-stain | Planning | $800–$1,200 |
| ... | | |

## Maintenance Due (Next 90 Days)

| Task | Due | System | Priority |
|---|---|---|---|
| Generator oil change | 2026-05-01 | Generator | High |
| HVAC filter (main) | 2026-05-15 | HVAC Main | Medium |
| ... | | | |
```

### 6.3 The Summary Document

The `_summary.md` is an AI-generated snapshot that the AI loads for estate-level questions.

```markdown
# Property Summary — 2392 Tannerville Rd
**Generated:** 2026-04-12

## Property Overview
Rural residential property, Orrville OH. ~XX acres. Main house (~XXXX sq ft),
detached barn, RV pad. Active CAUV forestry management. Private well, septic.
Propane for generator, HVAC, water heater, fireplace. 

## Key Systems
- **Generator:** Generac 22kW (2019), annual service, Buckeye Power Sales
- **HVAC:** Trane main floor + [other units]. Propane.
- **Water:** Private well + Kinetico softener + iron filter + UV
- ...

## Capital Watch List
| System | Age | Est. Remaining Life | Replacement Est. |
|---|---|---|---|
| Water Heater | 2009 (17yr) | 1–3 yr | $1,200–$2,000 |
| Furnace (main) | 2007 (19yr) | 0–2 yr | $4,000–$7,000 |
| ...

## Upcoming Capital (3-Year Window)
Estimated $XX,XXX in major replacements / upgrades through 2029.
```

### 6.4 How the App Loads Knowledge for AI Queries

Before answering a question, the AI client:

1. Loads `_index.md` for the active property from Drive (cached locally for 15 min)
2. Loads `_summary.md` for the active property (cached for 1 hr)
3. For equipment-specific questions, loads the relevant record `.md` file
4. Constructs a context-rich system prompt including all loaded documents
5. Sends the user question to OpenRouter

This means AI answers are always grounded in actual captured data — not hallucinated specs.

---

## 7. Intelligence Layer — OpenRouter AI

### 7.1 Why OpenRouter

OpenRouter provides a single API endpoint to access Claude, GPT-4, Gemini, Mistral, and others. This allows:
- Selecting the best model for each task type (vision vs. reasoning vs. fast/cheap)
- Cost optimization: use a fast cheap model for simple extractions, a capable model for advisory
- No lock-in to a single provider
- Easy model swapping as new models release

### 7.2 Model Selection Strategy

| Task | Default Model | Rationale |
|---|---|---|
| Nameplate photo extraction | `anthropic/claude-opus-4-5` | Best vision + JSON extraction |
| Document parsing (warranty PDFs) | `anthropic/claude-sonnet-4-6` | Good vision, lower cost |
| Maintenance recommendations | `anthropic/claude-opus-4-6` | Deep reasoning, property context |
| Budget / capital analysis | `anthropic/claude-opus-4-6` | Numerical reasoning |
| Simple Q&A / quick questions | `google/gemini-flash-1.5` | Fast, cheap, good enough |
| Advisory / detailed analysis | `anthropic/claude-opus-4-6` | Best reasoning available |

All models are user-selectable in Settings. The app ships with sensible defaults per task type.

### 7.3 OpenRouter API Client

```typescript
// src/ai/OpenRouterClient.ts

interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };  // base64 data URL or https URL
}

class OpenRouterClient {
  private readonly baseUrl = 'https://openrouter.ai/api/v1';
  private apiKey: string;
  private modelOverrides: Partial<Record<TaskType, string>>;

  async complete(
    task: TaskType,
    messages: AIMessage[],
    options?: { json?: boolean; maxTokens?: number }
  ): Promise<string> {
    const model = this.modelOverrides[task] ?? DEFAULT_MODELS[task];
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Property Manager',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: options?.maxTokens ?? 2048,
        response_format: options?.json ? { type: 'json_object' } : undefined,
      }),
    });
    const data = await response.json();
    return data.choices[0].message.content;
  }
}
```

### 7.4 Context Assembly for Advisory Queries

```typescript
// Before answering any property question, assemble context:
async function buildPropertyContext(propertyId: string): Promise<string> {
  const [index, summary] = await Promise.all([
    driveClient.readFile(`${propertyId}/_index.md`),
    driveClient.readFile(`${propertyId}/_summary.md`),
  ]);
  return `
## Property Knowledge Base

### Equipment Index
${index}

### Property Summary  
${summary}

---
Answer questions based on the above property data. If data is missing, say so rather than guessing.
`;
}
```

---

## 8. Application Layer — PWA + Android

### 8.1 Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | React 18 + Vite | PWA support, fast dev cycle |
| Language | TypeScript | Type safety for schema/records |
| Styling | Tailwind CSS + shadcn/ui | Mobile-first, accessible components |
| State | Zustand | Lightweight, no boilerplate |
| Routing | React Router v6 | SPA routing |
| PWA | vite-plugin-pwa | Manifest, service worker |
| Local persistence | IndexedDB via `idb-keyval` | Offline queue, draft cache |
| Auth | Google OAuth 2.0 PKCE | Client-side SPA, no secret needed |
| Drive | Google Drive API v3 | Direct browser upload |
| AI | OpenRouter API | Multi-model, browser-callable |
| Hosting | GitHub Pages / Netlify (free tier) | Static, no backend |
| Android (Phase 4) | Capacitor.js | Wraps existing PWA in native shell |

### 8.2 Why Capacitor for Android (Not React Native)

Capacitor wraps the existing React PWA in a native WebView shell, giving:
- A single codebase for web + Android
- Access to native Android APIs (camera with better control, file system, push notifications)
- Play Store distribution (optional — APK sideload also works)
- No rewrite — the same components, logic, and Drive integration carry over

### 8.3 PWA Offline Strategy

| Resource | Cache Strategy |
|---|---|
| App shell (HTML/CSS/JS) | Cache-first (service worker) |
| Drive file reads | Stale-while-revalidate (15 min TTL) |
| Drive uploads | Queue in IndexedDB, retry on reconnect |
| AI API calls | Network-only (no caching of AI responses) |
| Photo captures | Store in IndexedDB pending upload confirmation |
| `_index.md` | Stale-while-revalidate (5 min TTL) |

---

## 9. Home Assistant Integration

### 9.1 What Home Assistant Provides

Home Assistant (HA) runs locally and already monitors the property. The property manager integrates with HA to:

- Pull live sensor values into equipment records (propane level, generator runtime, etc.)
- Trigger maintenance reminders based on usage data (not just calendar)
- Display current status on equipment screens
- Receive webhook events from HA automations

### 9.2 Integration Architecture

```
Property Manager (browser)
        │
        │  HTTPS REST + WebSocket
        │  (local network / Nabu Casa remote access)
        ▼
Home Assistant
        ├── Propane Level Sensor    → feeds Propane screen
        ├── Generator Runtime Hours → triggers oil change reminder
        ├── Sump Pump Float         → alerts high water
        ├── HVAC Runtime Stats      → feeds HVAC maintenance
        ├── Water Pressure Sensor   → monitors well pressure
        ├── Temperature Sensors     → whole-home / cabin
        └── Power Monitoring        → circuit-level if available
```

### 9.3 Configuration

In Settings > Home Assistant:
- **HA Base URL**: `http://homeassistant.local:8123` (or Nabu Casa URL for remote)
- **Long-Lived Access Token**: generated in HA user profile
- **Entity Mapping**: user maps HA entity IDs to property systems

Example entity mapping:
```json
{
  "propane_level_pct":   "sensor.propane_tank_level",
  "generator_runtime_h": "sensor.generator_total_runtime_hours",
  "sump_water_level":    "binary_sensor.sump_pump_high_water",
  "well_pressure_psi":   "sensor.well_pressure_tank_psi",
  "main_hvac_runtime":   "sensor.hvac_main_daily_runtime_minutes"
}
```

### 9.4 Usage-Based Maintenance Triggers

Traditional maintenance is calendar-based. With HA data it becomes usage-based:

| Trigger | HA Sensor | Threshold | Action |
|---|---|---|---|
| Generator oil change | `sensor.generator_runtime_hours` | Delta +200 hrs from last oil change | Create high-priority maintenance task |
| Generator oil change | calendar | Annual (Oct 1) | Create maintenance task if runtime trigger not already fired |
| HVAC filter | `sensor.hvac_main_daily_runtime` | Cumulative 300 hrs since last filter | Suggest filter change |
| Well pressure | `sensor.well_pressure_psi` | < 30 PSI | Alert: possible pump issue |
| Propane level | `sensor.propane_tank_level` | < 25% | Alert: order propane |

### 9.5 Live Data on Equipment Screens

When viewing the Generator record, the app shows a live panel:

```
┌─────────────────────────────────────┐
│  LIVE DATA  (Home Assistant)        │
│  ─────────────────────────────────  │
│  Status:       ● Running            │
│  Runtime today:  1h 23m             │
│  Total runtime:  847 hrs            │
│  Runtime since oil change: 156 hrs  │
│  Battery voltage: 12.8V             │
└─────────────────────────────────────┘
```

### 9.6 HA Automation — Property Manager Webhooks

HA can fire webhooks into the Property Manager PWA (if open) or to a Cloudflare Worker relay (optional, still serverless):

```yaml
# Home Assistant automation: propane low alert
automation:
  - alias: "PropMgr: Propane Low Alert"
    trigger:
      - platform: numeric_state
        entity_id: sensor.propane_tank_level
        below: 25
    action:
      - service: notify.mobile_app_petes_phone
        data:
          title: "Property Manager"
          message: "Propane tank is at {{ states('sensor.propane_tank_level') }}% — schedule delivery"
          data:
            url: "https://your-app.github.io/#/property/tannerville/system/propane"
```

---

## 10. Data Model

### 10.1 Core Types (Extended)

```typescript
// Property (top-level entity)
interface Property {
  id: string;                   // 'tannerville' | 'camp'
  name: string;                 // '2392 Tannerville Rd'
  type: 'residence' | 'camp' | 'land';
  address: string;
  acquisitionDate?: string;     // ISO date
  purchasePrice?: number;
  driveRootFolderId: string;    // Drive folder ID
  haBridge?: HABridgeConfig;   // optional Home Assistant config
}

// Equipment Record (expanded from original)
interface EquipmentRecord {
  id: string;                   // uuid
  propertyId: string;
  categoryId: string;
  recordType: 'equipment' | 'service' | 'inspection' | 'warranty' | 'invoice' | 'activity';
  timestamp: string;            // ISO 8601
  fields: Record<string, FieldValue>;
  photoFilenames: string[];
  attachmentFilenames: string[]; // PDFs, docs
  driveFileId?: string;
  drivePhotoIds: string[];
  uploadStatus: 'draft' | 'pending' | 'uploaded' | 'error';
  aiExtracted?: boolean;        // was this record AI-assisted?
  tags?: string[];
}

// Service Record (linked to equipment)
interface ServiceRecord {
  id: string;
  propertyId: string;
  linkedEquipmentId?: string;   // links to EquipmentRecord.id
  categoryId: string;
  date: string;
  contractor?: string;          // links to Contractor.id
  workDescription: string;
  partsUsed?: string;
  laborCost?: number;
  partsCost?: number;
  totalCost?: number;
  nextServiceDate?: string;
  invoiceFilename?: string;
  driveFileId?: string;
  uploadStatus: 'pending' | 'uploaded' | 'error';
}

// Maintenance Task (generated or manual)
interface MaintenanceTask {
  id: string;
  propertyId: string;
  title: string;
  description?: string;
  categoryId: string;
  linkedEquipmentId?: string;
  dueDate: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  recurrence?: RecurrenceRule;
  completedDate?: string;
  completedBy?: string;
  cost?: number;
  linkedServiceRecordId?: string;
  source: 'manual' | 'ai-suggested' | 'manufacturer' | 'ha-trigger';
  status: 'upcoming' | 'due' | 'overdue' | 'completed' | 'skipped';
}

// Budget / Capital Item
interface CapitalItem {
  id: string;
  propertyId: string;
  title: string;
  categoryId: string;
  linkedEquipmentId?: string;
  type: 'repair' | 'replacement' | 'upgrade' | 'project';
  estimatedCost: { low: number; high: number };
  estimatedYear?: number;       // year the expense is expected
  probability: 'certain' | 'likely' | 'possible';
  source: 'manual' | 'ai-suggested' | 'age-based';
  notes?: string;
}

// Contractor / Contact
interface Contractor {
  id: string;
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  specialty: string[];          // ['HVAC', 'Plumbing']
  rating?: 1 | 2 | 3 | 4 | 5;
  notes?: string;
  lastUsed?: string;
}
```

### 10.2 OpenRouter Model Config

```typescript
type TaskType =
  | 'nameplate_extraction'
  | 'document_parsing'
  | 'maintenance_recommendations'
  | 'budget_analysis'
  | 'general_qa'
  | 'advisory';

const DEFAULT_MODELS: Record<TaskType, string> = {
  nameplate_extraction:       'anthropic/claude-opus-4-5',
  document_parsing:           'anthropic/claude-sonnet-4-6',
  maintenance_recommendations:'anthropic/claude-opus-4-6',
  budget_analysis:            'anthropic/claude-opus-4-6',
  general_qa:                 'google/gemini-flash-1.5',
  advisory:                   'anthropic/claude-opus-4-6',
};
```

---

## 11. Category Definitions

### 11.1 Primary Residence Categories

*(Full field schemas from original spec preserved — see property-capture-tool-spec.md §6)*

Categories added or expanded:

#### Service Record (universal — any system)
```typescript
{
  id: 'service_record',
  label: 'Service Record',
  recordType: 'service',
  allowMultiple: true,
  fields: [
    { id: 'service_date',     label: 'Date of Service',   type: 'date', required: true },
    { id: 'system_category', label: 'System / Category', type: 'select', options: [...all category labels] },
    { id: 'equipment_ref',   label: 'Equipment',         type: 'text', placeholder: 'e.g. Generac 22kW' },
    { id: 'contractor',      label: 'Contractor',        type: 'text' },
    { id: 'work_performed',  label: 'Work Performed',    type: 'textarea', required: true },
    { id: 'parts_used',      label: 'Parts Used',        type: 'textarea' },
    { id: 'labor_cost',      label: 'Labor Cost ($)',    type: 'number', unit: '$' },
    { id: 'parts_cost',      label: 'Parts Cost ($)',    type: 'number', unit: '$' },
    { id: 'next_service',    label: 'Next Service Due',  type: 'date' },
    { id: 'warranty_work',   label: 'Warranty Work',     type: 'boolean' },
    { id: 'notes',           label: 'Notes',             type: 'textarea' },
  ]
}
```

#### Sump Pump (added)
```typescript
{
  id: 'sump_pump',
  label: 'Sump Pump',
  allowMultiple: true,
  fields: [
    { id: 'pump_label',       label: 'Pump Label',          type: 'text', placeholder: 'Primary / Backup' },
    { id: 'brand',            label: 'Brand',               type: 'text' },
    { id: 'model',            label: 'Model',               type: 'text' },
    { id: 'hp',               label: 'HP Rating',           type: 'number', unit: 'HP' },
    { id: 'pump_type',        label: 'Pump Type',           type: 'select', options: ['Submersible', 'Pedestal', 'Battery Backup', 'Water-Powered Backup'] },
    { id: 'install_date',     label: 'Install Date',        type: 'date' },
    { id: 'discharge_route',  label: 'Discharge Route',     type: 'textarea', placeholder: 'Where water discharges to' },
    { id: 'ha_sensor',        label: 'HA Float Sensor',     type: 'text', placeholder: 'entity_id if monitored in HA' },
    { id: 'notes',            label: 'Notes',               type: 'textarea' },
  ]
}
```

#### Radon Mitigation (added)
```typescript
{
  id: 'radon',
  label: 'Radon Mitigation',
  fields: [
    { id: 'system_type',      label: 'System Type',         type: 'select', options: ['Sub-Slab Depressurization', 'Passive Pipe', 'None'] },
    { id: 'fan_brand',        label: 'Fan Brand',           type: 'text' },
    { id: 'fan_model',        label: 'Fan Model',           type: 'text' },
    { id: 'install_date',     label: 'Install Date',        type: 'date' },
    { id: 'install_contractor', label: 'Installer',         type: 'text' },
    { id: 'last_test_date',   label: 'Last Test Date',      type: 'date' },
    { id: 'last_test_result', label: 'Last Test Result',    type: 'number', unit: 'pCi/L' },
    { id: 'test_threshold',   label: 'Mitigation Threshold', type: 'number', unit: 'pCi/L', placeholder: '4.0 (EPA guideline)' },
    { id: 'notes',            label: 'Notes',               type: 'textarea' },
  ]
}
```

### 11.2 Camp / Cabin Categories

#### Cabin Structure
```typescript
{
  id: 'cabin_structure',
  label: 'Cabin Structure',
  propertyTypes: ['camp'],
  fields: [
    { id: 'construction_type', label: 'Construction Type',  type: 'select', options: ['Log', 'Timber Frame', 'Stick Frame', 'Modular'] },
    { id: 'footprint_sqft',    label: 'Footprint (sq ft)',  type: 'number', unit: 'sq ft' },
    { id: 'stories',           label: 'Stories',            type: 'number' },
    { id: 'foundation_type',   label: 'Foundation Type',    type: 'select', options: ['Slab', 'Pier/Post', 'Perimeter Wall', 'Full Basement'] },
    { id: 'year_built',        label: 'Year Built',         type: 'number' },
    { id: 'roof_type',         label: 'Roof Type',          type: 'text' },
    { id: 'exterior_material', label: 'Exterior',           type: 'text', placeholder: 'e.g. Cedar log, T1-11' },
    { id: 'insulation_type',   label: 'Insulation',         type: 'textarea' },
    { id: 'heating_type',      label: 'Primary Heating',    type: 'select', options: ['Wood Stove', 'Propane', 'Electric Baseboard', 'Mini-Split', 'None'] },
    { id: 'cooling',           label: 'Cooling',            type: 'text', placeholder: 'e.g. Window AC, Mini-split, None' },
    { id: 'notes',             label: 'Notes',              type: 'textarea' },
  ]
}
```

#### Seasonal — Winterization
```typescript
{
  id: 'winterization',
  label: 'Winterization',
  propertyTypes: ['camp'],
  recordType: 'activity',
  allowMultiple: true,
  fields: [
    { id: 'year',              label: 'Year',               type: 'number' },
    { id: 'date_completed',    label: 'Date Completed',     type: 'date' },
    { id: 'water_drained',     label: 'Water Lines Drained', type: 'boolean' },
    { id: 'antifreeze_used',   label: 'Antifreeze Used',    type: 'boolean' },
    { id: 'antifreeze_type',   label: 'Antifreeze Type',    type: 'text' },
    { id: 'water_heater_off',  label: 'Water Heater Off/Drained', type: 'boolean' },
    { id: 'generator_stored',  label: 'Generator Stabilized/Stored', type: 'boolean' },
    { id: 'dock_removed',      label: 'Dock Removed',       type: 'boolean' },
    { id: 'propane_shutoff',   label: 'Propane Shut Off at Tank', type: 'boolean' },
    { id: 'shutoff_checklist', label: 'Full Checklist',     type: 'textarea', placeholder: 'All items completed' },
    { id: 'notes',             label: 'Notes',              type: 'textarea' },
  ]
}
```

#### Seasonal — Spring Startup
```typescript
{
  id: 'spring_startup',
  label: 'Spring Startup',
  propertyTypes: ['camp'],
  recordType: 'activity',
  allowMultiple: true,
  fields: [
    { id: 'year',              label: 'Year',               type: 'number' },
    { id: 'date_completed',    label: 'Date Completed',     type: 'date' },
    { id: 'water_restored',    label: 'Water System Restored', type: 'boolean' },
    { id: 'leaks_found',       label: 'Leaks Found',        type: 'boolean' },
    { id: 'leak_notes',        label: 'Leak Details',       type: 'textarea' },
    { id: 'dock_installed',    label: 'Dock Installed',     type: 'boolean' },
    { id: 'rodent_damage',     label: 'Rodent Damage Found', type: 'boolean' },
    { id: 'rodent_notes',      label: 'Rodent Damage Notes', type: 'textarea' },
    { id: 'propane_on',        label: 'Propane Restored',   type: 'boolean' },
    { id: 'startup_checklist', label: 'Full Checklist',     type: 'textarea' },
    { id: 'notes',             label: 'Notes',              type: 'textarea' },
  ]
}
```

---

## 12. UI Specification & Mockups

### 12.1 Layout Breakpoints

| Mode | Breakpoint | Layout |
|---|---|---|
| Mobile browser | < 768px | Single column, bottom nav bar |
| Tablet | 768–1024px | Two-column, side nav |
| Desktop browser | > 1024px | Full sidebar + content area |
| Android app | < 768px (WebView) | Same as mobile + native status bar |

---

### 12.2 Desktop Browser Layout

```
╔══════════════════════════════════════════════════════════════════════════╗
║  Property Manager                            [2392 Tannerville ▼] [Pete] ║
╠═══════════╦══════════════════════════════════════════════════════════════╣
║           ║                                                              ║
║  NAVIGATE ║   DASHBOARD — 2392 Tannerville Rd                           ║
║  ─────────║   ──────────────────────────────────────────────────────     ║
║  🏠 Home  ║                                                              ║
║           ║   ┌─────────────────┐ ┌─────────────────┐ ┌──────────────┐ ║
║  📋 Dash  ║   │  MAINTENANCE    │ │  CAPTURE        │ │  AI ADVISOR  │ ║
║           ║   │  ─────────────  │ │  ─────────────  │ │  ──────────  │ ║
║  📷 Capt  ║   │  3 tasks due    │ │  Tap to capture │ │  Ask about   │ ║
║           ║   │  this week      │ │  equipment or   │ │  your        │ ║
║  🔧 Maint ║   │                 │ │  service record │ │  property... │ ║
║           ║   │  ⚠ Gen oil chg │ │  [+ New Record] │ │              │ ║
║  💰 Budgt ║   │  · HVAC filter │ │  [↑ Upload Doc] │ │  [Ask AI]    │ ║
║           ║   │  · Septic pump │ │  [📷 Scan]      │ │              │ ║
║  📦 Invnt ║   └─────────────────┘ └─────────────────┘ └──────────────┘ ║
║           ║                                                              ║
║  💬 AI    ║   ┌────────────────────────────────────────────────────────┐ ║
║           ║   │  CAPITAL WATCH                                         │ ║
║  🏗 Proj  ║   │  ─────────────────────────────────────                 │ ║
║           ║   │  Water Heater (2009) ●●●●● Critical  $1,200–$2,000    │ ║
║  👥 Contc ║   │  Main Furnace (2007) ●●●●○ High      $4,000–$7,000    │ ║
║           ║   │  Barn Roof (2003)    ●●●○○ Medium    $2,000–$4,000    │ ║
║  ⚙ Sett  ║   └────────────────────────────────────────────────────────┘ ║
║           ║                                                              ║
║           ║   ┌──────────────────────┐  ┌─────────────────────────────┐ ║
║           ║   │  LIVE (Home Asst.)   │  │  CHECKLIST  11 / 22 ✓       │ ║
║           ║   │  Propane:  68%  ✓    │  │  ✓ Generator  ✗ Sump Pump  │ ║
║           ║   │  Generator: Off  ✓   │  │  ✓ HVAC      ✗ Well        │ ║
║           ║   │  Sump:     Dry  ✓    │  │  ✗ Septic    ✗ Radon       │ ║
║           ║   └──────────────────────┘  └─────────────────────────────┘ ║
╚═══════════╩══════════════════════════════════════════════════════════════╝
```

---

### 12.3 Desktop — Equipment Capture Screen

```
╔══════════════════════════════════════════════════════════════════════════╗
║  ← Back    Generator — Equipment Record      [2392 Tannerville ▼]       ║
╠═══════════╦══════════════════════════════════════════════════════════════╣
║           ║                                                              ║
║  NAVIGATE ║  ┌──────────────────────────────────────────────────────┐   ║
║           ║  │  📷  PHOTOGRAPH NAMEPLATE                             │   ║
║  ...      ║  │  ─────────────────────────────────────────────────   │   ║
║           ║  │  [Open Camera]  or  [Upload from Device]             │   ║
║           ║  │                                                       │   ║
║           ║  │  AI extracts: brand, model, serial, kW rating,       │   ║
║           ║  │  fuel type, manufacture date                         │   ║
║           ║  └──────────────────────────────────────────────────────┘   ║
║           ║                                                              ║
║           ║  ┌──────────────────────────────────────────────────────┐   ║
║           ║  │  EQUIPMENT DETAILS                         [AI: Done]│   ║
║           ║  │  ─────────────────────────────────────────────────   │   ║
║           ║  │  Brand          [Generac              ]              │   ║
║           ║  │  Model Name     [22kW Air-Cooled       ]              │   ║
║           ║  │  Model Number   [7043                  ]              │   ║
║           ║  │  Serial Number  [1234567890            ]              │   ║
║           ║  │  Output (kW)    [22        ] kW                      │   ║
║           ║  │  Fuel Type      [Propane         ▼]                  │   ║
║           ║  │  Transfer Sw    [Generac              ]              │   ║
║           ║  │  Transfer Amps  [200       ] A                       │   ║
║           ║  │  ...                                                  │   ║
║           ║  │                                                       │   ║
║           ║  │  Notes          [South side of house, behind         │   ║
║           ║  │                  propane tank...]                     │   ║
║           ║  └──────────────────────────────────────────────────────┘   ║
║           ║                                                              ║
║           ║  ┌──────────────────────────────────────────────────────┐   ║
║           ║  │  LIVE STATUS (Home Assistant)                        │   ║
║           ║  │  Status: Off  │  Total Runtime: 847 hrs              │   ║
║           ║  │  Runtime since oil change: 156 hrs (oil due ~44 hrs) │   ║
║           ║  └──────────────────────────────────────────────────────┘   ║
║           ║                                                              ║
║           ║  Photos: [nameplate.jpg] [transfer_switch.jpg] [+ Add]      ║
║           ║                                                              ║
║           ║                             [Cancel]  [Save to Drive]        ║
╚═══════════╩══════════════════════════════════════════════════════════════╝
```

---

### 12.4 Desktop — AI Advisory Screen

```
╔══════════════════════════════════════════════════════════════════════════╗
║  AI Advisor                                  [2392 Tannerville ▼]       ║
╠═══════════╦══════════════════════════════════════════════════════════════╣
║           ║  ┌────────────────────────────────────────────────────────┐ ║
║  NAVIGATE ║  │  Model: [Claude Opus 4.6 ▼]  Context: ● Loaded        │ ║
║           ║  │  (Your equipment data, service history, maintenance    │ ║
║           ║  │   schedule, and capital forecast are loaded)           │ ║
║           ║  └────────────────────────────────────────────────────────┘ ║
║           ║                                                              ║
║           ║  ┌────────────────────────────────────────────────────────┐ ║
║           ║  │                                                        │ ║
║           ║  │  You: My water heater is from 2009. The plumber said   │ ║
║           ║  │  the anode rod is heavily corroded. Worth repairing    │ ║
║           ║  │  or should I replace it?                               │ ║
║           ║  │                                                        │ ║
║           ║  │  ──────────────────────────────────────────────────   │ ║
║           ║  │                                                        │ ║
║           ║  │  Advisor: Based on your records, your Rheem 50-gal    │ ║
║           ║  │  water heater (installed ~2009) is 17 years old. The  │ ║
║           ║  │  average propane tank water heater lifespan is 8–12   │ ║
║           ║  │  years, so yours is well beyond expected service life. │ ║
║           ║  │                                                        │ ║
║           ║  │  At 17 years, I'd recommend replacement rather than   │ ║
║           ║  │  anode rod service for these reasons:                 │ ║
║           ║  │  • Anode rod replacement at this age buys maybe 2–3   │ ║
║           ║  │    years, and tank failure often follows              │ ║
║           ║  │  • New unit: ~$900–$1,400 installed for a comparable  │ ║
║           ║  │    50-gal propane. A heat pump hybrid would be        │ ║
║           ║  │    $1,800–$2,400 but save ~40% on water heating cost  │ ║
║           ║  │  • Your budget forecast already flagged this at       │ ║
║           ║  │    $1,200–$2,000 this year — you're already prepared  │ ║
║           ║  │                                                        │ ║
║           ║  │  Suggested next step: Get 2 quotes. I can generate a  │ ║
║           ║  │  specification sheet to share with plumbers.          │ ║
║           ║  │                                    [Generate Spec]    │ ║
║           ║  │                                                        │ ║
║           ║  └────────────────────────────────────────────────────────┘ ║
║           ║                                                              ║
║           ║  [____________________________________] [Ask] [Suggestions]  ║
╚═══════════╩══════════════════════════════════════════════════════════════╝
```

---

### 12.5 Mobile Browser Layout — Home Screen

```
┌─────────────────────────────┐
│  ≡  Property Manager        │
│     2392 Tannerville   ▾    │
│─────────────────────────────│
│  Good morning, Pete         │
│  ─────────────────────────  │
│  ⚠  3 tasks due this week  │
│                             │
│  ┌─────────┐ ┌─────────┐   │
│  │   📷    │ │   🔧    │   │
│  │ CAPTURE │ │MAINTAIN │   │
│  └─────────┘ └─────────┘   │
│                             │
│  ┌─────────┐ ┌─────────┐   │
│  │   💰    │ │   💬    │   │
│  │ BUDGET  │ │   ASK   │   │
│  │         │ │   AI    │   │
│  └─────────┘ └─────────┘   │
│                             │
│  LIVE STATUS (HA)           │
│  ┌──────────────────────┐   │
│  │ Propane   68%   ✓    │   │
│  │ Generator  Off  ✓    │   │
│  │ Sump Pump  Dry  ✓    │   │
│  └──────────────────────┘   │
│                             │
│  CAPITAL WATCH              │
│  ┌──────────────────────┐   │
│  │ Water Heater  2009   │   │
│  │ ●●●●● Critical      │   │
│  │ $1,200–$2,000       │   │
│  └──────────────────────┘   │
│                             │
│─────────────────────────────│
│  🏠   📷   🔧   💰   ⚙    │
└─────────────────────────────┘
```

---

### 12.6 Mobile Browser — Capture Flow

```
Step 1: Category select        Step 2: Photo/Manual         Step 3: Review & Save
┌─────────────────────────┐   ┌─────────────────────────┐  ┌────────────────────────┐
│ ← Back   + New Record   │   │ ← Generator Record      │  │ ← Back        [Save]   │
│─────────────────────────│   │─────────────────────────│  │────────────────────────│
│ What are you capturing? │   │  ┌───────────────────┐  │  │ ✓ AI Extraction Done   │
│                         │   │  │                   │  │  │                        │
│  🔌  Generator          │   │  │  [CAMERA VIEW]    │  │  │ Brand                  │
│  🌡  HVAC               │   │  │                   │  │  │ [Generac             ] │
│  🚿  Water Heater       │   │  │                   │  │  │                        │
│  💧  Water Treatment    │   │  └───────────────────┘  │  │ Model                  │
│  ⛽  Propane            │   │                         │  │ [22kW Air-Cooled      ] │
│  🔋  Well System        │   │  [📷 Take Photo]        │  │                        │
│  🧹  Septic             │   │  [📁 From Library]      │  │ Serial Number          │
│  ⚡  Electrical         │   │  [✏ Enter Manually]     │  │ [1234567890          ] │
│  🍳  Appliance          │   │                         │  │                        │
│  📹  Surveillance       │   │  ─── or ───             │  │ Output (kW)            │
│  🏚  Barn               │   │                         │  │ [22          ] kW      │
│  🌲  Forestry/CAUV      │   │  [🔧 Service Record]    │  │                        │
│  🛠  Service Record     │   │                         │  │ ...                    │
│                         │   │                         │  │                        │
│─────────────────────────│   │                         │  │ Photos:                │
│  🏠   📷  🔧  💰  ⚙   │   │─────────────────────────│  │ [🖼 nameplate.jpg]     │
└─────────────────────────┘   │  🏠  📷  🔧  💰  ⚙   │  │ [+ Add Photo]          │
                              └─────────────────────────┘  │                        │
                                                           │─────────────────────── │
                                                           │  🏠  📷  🔧  💰  ⚙  │
                                                           └────────────────────────┘
```

---

### 12.7 Mobile Browser — Maintenance Screen

```
┌─────────────────────────────┐
│ ← Back   Maintenance        │
│─────────────────────────────│
│  [Due] [Upcoming] [History] │
│─────────────────────────────│
│  DUE NOW                    │
│                             │
│  ┌──────────────────────┐   │
│  │ ⚠ Generator Oil      │   │
│  │   Annual / 200 hrs   │   │
│  │   Due: 2026-05-01    │   │
│  │   Est. cost: $40     │   │
│  │ [Mark Done] [Delay]  │   │
│  └──────────────────────┘   │
│                             │
│  ┌──────────────────────┐   │
│  │ 🌡 HVAC Filter       │   │
│  │   Main floor unit    │   │
│  │   Due: 2026-05-15    │   │
│  │   20x25x4  MERV 11   │   │
│  │ [Mark Done] [Delay]  │   │
│  └──────────────────────┘   │
│                             │
│  UPCOMING (30 days)         │
│                             │
│  ┌──────────────────────┐   │
│  │ 🧹 Septic Pump-Out   │   │
│  │   Every 3 years      │   │
│  │   Due: 2026-06-01    │   │
│  │   Buckeye Septic     │   │
│  │ [Schedule] [Delay]   │   │
│  └──────────────────────┘   │
│                             │
│─────────────────────────────│
│  🏠   📷   🔧   💰   ⚙    │
└─────────────────────────────┘
```

---

### 12.8 Mobile Browser — Budget / Capital Screen

```
┌─────────────────────────────┐
│ ← Back   Capital Forecast   │
│─────────────────────────────│
│  [1-Year] [3-Year] [10-Year]│
│─────────────────────────────│
│  3-YEAR VIEW (2026–2028)    │
│  Total estimated: $28,400   │
│  ─────────────────────────  │
│  2026  ●●●●●  $12,200       │
│  ████████████████░░░░░░░    │
│  · Water Heater    $1,600   │
│  · Furnace (main)  $6,000   │
│  · Roof section    $4,600   │
│                             │
│  2027  ●●●○○  $8,500        │
│  ████████████░░░░░░░░░░░    │
│  · Barn re-stain   $1,000   │
│  · Softener resin  $800     │
│  · HVAC service    $6,700   │
│                             │
│  2028  ●●○○○  $7,700        │
│  ████████░░░░░░░░░░░░░░░    │
│  · Driveway reseal $2,200   │
│  · Well pump       $5,500   │
│                             │
│  ── RESERVE SUGGESTION ──   │
│  Set aside $710/month       │
│  to cover 3-yr forecast     │
│                             │
│  [+ Add Capital Item]       │
│  [Export to Drive]          │
│─────────────────────────────│
│  🏠   📷   🔧   💰   ⚙    │
└─────────────────────────────┘
```

---

### 12.9 Android App Mode

The Android app (Capacitor-wrapped PWA) uses the same UI components with these differences:

```
┌──────────────────────────┐
│  9:41    📶 🔋           │  ← Android status bar (native)
│──────────────────────────│
│  ←  Property Manager   ⋮ │  ← Android toolbar (native back)
│──────────────────────────│
│                          │
│  [same PWA content]      │  ← React PWA content unchanged
│                          │
│                          │
│                          │
│                          │
│                          │
│                          │
│                          │
│                          │
│──────────────────────────│
│  🏠   📷   🔧   💰   ⚙ │  ← Bottom nav (same)
│──────────────────────────│
│  ◁    ○    □             │  ← Android nav bar (native)
└──────────────────────────┘
```

**Android-specific enhancements via Capacitor:**
- Native camera API: better photo quality, HDR support
- Background sync: offline queue processes even when app is backgrounded
- Push notifications: HA-triggered maintenance alerts via FCM
- File system access: direct access to Downloads folder for receipt imports
- Biometric auth: fingerprint/face unlock for the app
- Share target: "Share to Property Manager" from Files app or camera roll

---

### 12.10 Property Switcher

Available on all screens via the header dropdown:

```
┌──────────────────────────────┐
│  Select Property             │
│  ─────────────────────────   │
│  ● 2392 Tannerville Rd       │
│    Orrville, OH              │
│    22 categories  11 docs    │
│                              │
│  ○ Camp                      │
│    [address]                 │
│    8 categories  3 docs      │
│                              │
│  [+ Add Property]            │
└──────────────────────────────┘
```

---

## 13. Automation & AI Workflows

### 13.1 Nameplate Extraction Workflow

```
User opens Generator category
        │
        ▼
[Take Photo] button tapped
        │
        ▼
Native camera opens (HTML5 capture or Capacitor Camera API)
        │
        ▼
Photo taken → resized to 1200px max (reduce API cost)
        │
        ▼
Image converted to base64
        │
        ▼
OpenRouter API called:
  Model: claude-opus-4-5 (vision)
  System: "Extract equipment nameplate data, return JSON only"
  User: [image] + "Extract: brand, model, serial, kW, fuel_type..."
        │
        ▼
JSON response parsed → matched to form field IDs
        │
        ▼
Form auto-populated → user reviews each field
        │
        ▼
[Save] → Markdown formatted → Drive upload
        │
        ▼
_index.md updated with new record entry
```

### 13.2 Invoice/Receipt Processing Workflow

```
User receives paper invoice from HVAC contractor
        │
        ▼
Opens app → [Upload Document] → [Service Invoice]
        │
        ▼
Photos invoice OR selects PDF from Files app
        │
        ▼
OpenRouter API:
  Model: claude-sonnet-4-6 (document parsing)
  "Extract: date, contractor, work performed, parts, 
   labor cost, parts cost, total, any warranty terms"
        │
        ▼
Service Record form pre-populated
User selects which system was serviced (links record)
        │
        ▼
Save → Service record Markdown + invoice PDF uploaded to Drive
_index.md service history section updated
Budget: historical spend updated
Maintenance: if service was a scheduled task, mark complete
```

### 13.3 Maintenance Schedule Generation Workflow

```
Triggered: when a new equipment record is saved
        │
        ▼
AI analyzes equipment record:
  "Based on this [Generator] record, what recurring
   maintenance tasks should be scheduled?
   Equipment: Generac 22kW, installed 2019
   Last service: 2025-11-01"
        │
        ▼
AI returns suggested tasks:
  - Annual service: every Oct 1 (matches prior service month)
  - Oil change: every 200 runtime hours OR annual
  - Air filter: annual
  - Spark plugs: every 2 years
  - Transfer switch exercise: monthly (manual)
        │
        ▼
User reviews suggested tasks, approves/modifies
        │
        ▼
Tasks added to maintenance schedule
_index.md maintenance section updated
```

### 13.4 Capital Forecast Generation Workflow

```
Triggered: weekly, or on demand from Budget screen
        │
        ▼
AI loads property _index.md (all equipment + install dates)
        │
        ▼
For each piece of equipment with a known install date:
  AI calculates age, compares to expected lifespan
  AI estimates replacement cost from:
    - Historical data in service records
    - General knowledge of replacement costs
    - Equipment category and spec
        │
        ▼
AI generates capital watch list with:
  - Priority (critical / high / medium / low)
  - Estimated year of replacement
  - Cost range (low / high)
  - Note: "This estimate is approximate; get current quotes"
        │
        ▼
User reviews, can add/edit/dismiss items
Saved to _index.md capital section
Displayed on Budget screen
```

### 13.5 Seasonal Checklist Workflow (Camp)

```
Triggered: automatically in October (winterization)
           and April (spring startup) via PWA notification
Also: manually from Camp > Seasonal
        │
        ▼
AI generates property-specific checklist:
  "For [Camp] property with [documented systems],
   generate a fall winterization checklist"
        │
        ▼
Checklist items generated and displayed
User works through items on-site, checking off each
        │
        ▼
[Complete Winterization] → creates a Winterization
activity record in Drive with all checked/noted items
        │
        ▼
Next spring startup checklist pre-populated with:
  - Items that had issues from last fall
  - Standard startup items for documented systems
```

### 13.6 Home Assistant → Maintenance Trigger Workflow

```
HA sensor: generator_runtime_hours increments each run
        │
        ▼
Property Manager (if open): polls HA every 5 min
Property Manager (if closed): HA sends push notification
        │
        ▼
On open: app checks runtime delta since last oil change
        │
        ▼
If delta ≥ 180 hours (warning threshold):
  → Yellow banner on Generator screen
  → Maintenance task "Generator oil change — runtime warning"
  → Push notification (if PWA notifications enabled)

If delta ≥ 200 hours (due threshold):
  → Red banner on Generator screen
  → Maintenance task status: "Due"
  → Push notification with urgency
```

### 13.7 AI Q&A Workflow (Ask Advisor)

```
User types: "What maintenance should I do before winter?"
        │
        ▼
Context assembled:
  - _index.md loaded (equipment + schedule + service history)
  - _summary.md loaded
  - Current date: passed to AI
  - Active property: Tannerville
        │
        ▼
OpenRouter API call:
  Model: claude-opus-4-6
  System: [property context + role: expert property advisor]
  User: "What maintenance should I do before winter?"
        │
        ▼
AI response grounded in actual property data:
  "Based on your documented systems at 2392 Tannerville:
   1. Generator: Annual service due (Oct) — call Buckeye Power Sales
   2. HVAC: Last filter change was Jan 2026, likely due
   3. Propane: Currently 68% — depending on your usage rate...
   4. Sump pump: Test operation, ensure discharge is clear
   5. Water treatment: Salt level check
   ..."
        │
        ▼
User can:
  [Create Tasks from this] → bulk-adds maintenance tasks
  [Ask follow-up]
  [Save this advice to Drive]
```

---

## 14. User Walkthrough

### Day 1: Setup & First Captures

**Morning — Initial Setup:**
1. Open app URL (or install from Play Store in future)
2. Sign in with Google → Drive access granted
3. Enter OpenRouter API key → stored in localStorage
4. Enter Home Assistant URL + token (optional but recommended)
5. Property auto-detected from Drive or manually add:
   - "2392 Tannerville Rd" → connects existing Drive folder structure
   - "Camp" → creates new folder structure

**Mid-morning — Field Capture (Generator):**
1. Tap **Capture** → select **Generator**
2. Tap **[📷 Take Photo]** → camera opens
3. Photograph the nameplate on the Generac
4. App sends to AI → 3 seconds → form fills automatically
5. Review: confirm brand, model, serial are correct; add notes
6. Attach second photo of transfer switch panel
7. Tap **[Save to Drive]** → file uploaded to Generator folder
8. Checklist updates: Generator ✓

**Afternoon — Service Record:**
1. Open paper invoice from Buckeye Power Sales (generator service)
2. Tap **Capture** → **Service Record**
3. Tap **[📷 Take Photo]** → photograph invoice
4. AI extracts: date Nov 1 2025, $180, work performed
5. Link to Generator equipment record
6. Save → invoice photo + service record Markdown saved to Drive

**Evening — Review Dashboard:**
1. Dashboard shows: 2 records added, Generator now ✓
2. Maintenance scheduler detected generator service → no oil change task created (just serviced)
3. AI suggests: "You haven't captured your HVAC or water systems yet — those are priority documentation gaps"

---

### Week 2: Maintenance Scheduling

**Capture all 5 priority systems** over several sessions.

After each capture, AI generates maintenance schedule:
- Generator: annual service Oct, oil change 200 hrs
- HVAC: filter change every 90 days, annual service
- Water heater: annual anode check, flush
- Water treatment: salt check monthly, service annual
- Well: water test annual, pressure check

Maintenance screen now populated with 15+ recurring tasks, all with due dates.

---

### Month 1: Budget Baseline

After all major systems documented:
1. Open **Budget → Capital Forecast**
2. Tap **[Generate Forecast]**
3. AI analyzes all equipment ages and generates capital watch list
4. Review and adjust: agree water heater is critical, move furnace to 2027
5. Monthly reserve recommendation: $710/month
6. Save forecast to Drive as `_capital_forecast_2026.md`

---

### Ongoing: Service Record Logging

Every time a contractor visits:
1. Receive invoice (paper or PDF)
2. Open app → **Capture → Service Record**
3. Photo or PDF of invoice → AI extracts → review → save
4. Linked maintenance task marked complete
5. Service history builds over time

After 6 months: Ask AI "How much have I spent on HVAC this year?" → AI answers from service record data.

---

### Camp Property: Seasonal Workflow

**October:**
1. Notification: "Fall Winterization Checklist ready for Camp"
2. Open Camp → Seasonal → Winterization
3. Work through checklist at the camp
4. Note: frozen pipe repair needed from last winter — add to project tracker
5. Mark complete → Winterization record saved to Drive

**April:**
1. Notification: "Spring Startup Checklist for Camp"
2. Open Camp → Seasonal → Spring Startup
3. Inspection: check for rodent damage (field: yes, mouse nest in cabinet)
4. Add project: "Camp kitchen cabinet repair + pest exclusion"
5. Mark complete → Spring record saved

---

## 15. Implementation Phases

### Phase 1 — Core Capture (MVP)
**Goal:** Replace friction of manual equipment documentation. Field-usable.
- [ ] React + Vite + TypeScript + Tailwind scaffold
- [ ] Google OAuth PKCE + Drive API client
- [ ] Drive folder structure (auto-create missing folders)
- [ ] 8 priority categories: Generator, HVAC, Water Heater, Water Treatment, Well, Propane, Septic, Electrical
- [ ] Manual form entry (no AI yet)
- [ ] Markdown formatter + Drive upload
- [ ] Basic home screen + checklist
- [ ] Deploy to GitHub Pages
- [ ] PWA manifest (installable)

**Deliverable:** Functional capture app for primary residence.

---

### Phase 2 — AI Extraction + All Categories
**Goal:** Photograph → auto-fill. All systems documented.
- [ ] OpenRouter client (replaces direct Anthropic client)
- [ ] Camera capture component
- [ ] Nameplate extraction flow with form auto-fill
- [ ] All 20+ categories for primary residence
- [ ] Document/invoice upload + AI extraction
- [ ] Service record category
- [ ] Settings: OpenRouter key + model selection per task type

**Deliverable:** AI-assisted capture for all systems.

---

### Phase 3 — Knowledge Base + Intelligence
**Goal:** Data becomes queryable. AI becomes useful.
- [ ] `_index.md` generation and maintenance
- [ ] `_summary.md` auto-generation
- [ ] AI Advisory screen (Q&A over property data)
- [ ] Maintenance schedule generation from equipment records
- [ ] Maintenance screen: due/upcoming/history
- [ ] Basic capital forecast view
- [ ] Offline queue with IndexedDB + retry
- [ ] Push notifications (PWA)

**Deliverable:** AI can answer property questions from real data.

---

### Phase 4 — Multi-Property + Camp
**Goal:** Full estate management. Camp-specific categories.
- [ ] Property switcher (multiple Drive folder roots)
- [ ] Camp categories: cabin structure, seasonal, recreation
- [ ] Seasonal checklist workflows (winterization, spring startup)
- [ ] Multi-property dashboard
- [ ] Estate-level AI queries ("compare maintenance costs across properties")

**Deliverable:** Tannerville + Camp both fully managed.

---

### Phase 5 — Budget + Project Tracker
**Goal:** Forward-looking financial management.
- [ ] Full capital forecast: 1/3/10-year views
- [ ] Monthly reserve calculator
- [ ] Project tracker: phases, linked bids/invoices
- [ ] Contractor/contact directory
- [ ] Historical spend analytics

**Deliverable:** Full investment and planning layer.

---

### Phase 6 — Home Assistant Integration
**Goal:** Live sensor data feeds the tool.
- [ ] HA REST API client
- [ ] Entity mapping UI in Settings
- [ ] Live data panels on equipment screens
- [ ] Usage-based maintenance triggers (generator runtime)
- [ ] HA alerts → PWA push notifications
- [ ] Propane level monitoring and auto-notification

**Deliverable:** Real-time property awareness.

---

### Phase 7 — Android App
**Goal:** Native mobile experience with deeper OS integration.
- [ ] Capacitor.js integration
- [ ] Native camera (better than HTML5 `<input capture>`)
- [ ] Background sync for offline queue
- [ ] Push notifications via FCM
- [ ] Share target (receive photos/PDFs from other apps)
- [ ] Optional: Play Store submission

**Deliverable:** Full Android native app from same codebase.

---

## 16. Open Questions & Decisions

### Q1: OpenRouter vs. Direct Anthropic API
| Option | Flexibility | Cost | Setup |
|---|---|---|---|
| OpenRouter | Multi-model, model selection | Slight markup (~5%) | One API key for all models |
| Direct Anthropic | Claude only | Direct pricing | Separate key per provider |

**Recommendation:** OpenRouter. The ability to use cheaper/faster models for simple tasks and switch models as the landscape evolves outweighs the small markup.

### Q2: Drive Scope
*(same question as original spec)*
**Recommendation:** `drive` scope. Checklist detection of prior uploads is worth it for a single-user personal tool.

### Q3: Multi-User (Kelly)
If the spouse should also use the tool:
- Option A: Share OpenRouter API key in the app (enter once on her device)
- Option B: Cloudflare Worker proxy (~20 min to set up, zero cost) holds API key server-side
- **Recommendation:** Option A for now. Option B if usage grows or key exposure is a concern.

### Q4: HA Connectivity Away From Home
HA REST API is on local network. For remote access:
- **Nabu Casa** ($7/mo): easiest, official cloud relay, no port forwarding
- **Tailscale**: free, VPN mesh, more technical
- **Direct port forwarding**: not recommended for security reasons
- **Recommendation:** Nabu Casa if HA integration is used heavily.

### Q5: Drive Folder Migration
The original spec uses existing folder IDs for Tannerville. The expanded structure creates a `Property Manager/` root with subdirectories. Decision: migrate existing folders into new structure, or map new app to existing IDs?
**Recommendation:** Hybrid — new records go to new structure, existing folder IDs remain supported via the folder map for backward compatibility.

---

## Appendix A: Drive Folder Reference

### 2392 Tannerville Rd — Existing Folders

| Category | Drive Folder | Folder ID |
|---|---|---|
| Root | 2392 Tannerville Rd | `14CifGAre0egOHO0qVdrVBXCQY0WXk6Wt` |
| Projects | Projects | `1f31FjL-3eGa-Xr_rxMMIWHwqaVCViu4i` |
| HVAC | HVAC | `1f7Fbetgic7wMubOKVZr4GZbbzPMJK255` |
| Kitchen | Kitchen | `1G83sNSxGb43ZcNU1AA6kuVcCKeMkzfLY` |
| Water Heater / Treatment | Water Treatment | `1b_dq5qNSF8AxrN2tXszgy98IaxHuruFh` |
| Propane | Propane Tank | `1iNccKytMpi4qrgteaxbmB4VYm3iTPMbA` |
| Generator | Generator | `1f6ceFGDaMRwQO_7OcxGHywuFolFJ5Hpg` |
| Surveillance | Surveillance | `1beJLvmhjU0vm3yBa7dnVnJ2qEwtk-nv8` |
| Roof | Roof | `1CzArWstlwApmlZcKW87PYK81167Aq0Rn` |
| Dormers | Dormers | `1egqQpspUYTF7UVAqtfOiAhkIqMuc4Qjw` |
| Basement | Basement | `1XnCnKnVsEe9DxCpxzYtcjo3gL6Vyl6lT` |
| Sunroom | Sunroom | `1YuGyat--XsqJ9I-5RJfqGfchJfBDY0dJ` |
| Fireplace | Fireplace | `1lFJ6ouJpGqG60xY4IdOKjdNpkC-nSSSW` |
| RV Parking | RV Parking | `1PtFvctXhAYPNvxJxYNQw5qTi8Hu2NyD4` |
| Patios | Patios | `1nYHC5wnBsnchr0hcIAWsSozirqvSEV0u` |
| CAUV / Forestry | CAUV | `1jlkefvZg8gkmVDkBU-gsJUYwA5mmNooU` |
| Invoices | Invoices | `1KhSADp7RI45t24CuircQIrRBQaiNZIjw` |
| Purchase | Purchase | `1ft5ut6b66wWm_7rBcXYYhJg7QZ8ri1Jh` |

### 2392 Tannerville Rd — Folders to Create

| Category | Suggested Name |
|---|---|
| Septic | Septic System |
| Well System | Well |
| Electrical | Electrical |
| Barn | Barn |
| Laundry | Laundry |
| Sump Pump | Sump Pump |
| Radon | Radon Mitigation |
| Smart Home | Smart Home |
| Alarm | Alarm System |
| App Index | `_index` (hidden/machine-readable) |

### Camp — All Folders to Create

| Category | Folder Name |
|---|---|
| Root | Camp — [Property Name] |
| Cabin | Cabin |
| Power | Power / Generator |
| Water | Water System |
| Waste | Septic |
| Seasonal | Seasonal |
| Recreation | Recreation |
| Land | Land / Access |
| Invoices | Invoices |
| Projects | Projects |

---

*This document supersedes `property-capture-tool-spec.md` as the authoritative spec. That document remains for reference on the original Phase 1 capture tool design and existing Drive folder IDs.*

*When implementation begins, this file becomes `SPEC.md` in the project repository.*
