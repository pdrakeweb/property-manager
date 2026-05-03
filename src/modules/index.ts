/**
 * Module discovery barrel.
 *
 * Importing this file once at app boot is enough to register every
 * built-in module with the registry — each module's `index.ts` calls
 * `moduleRegistry.register(...)` at module-load time, and listing them
 * here forces those evaluations.
 *
 * Phase 1 ships only the `core` module. The 22 placeholders below are
 * the modules slated for Phase 2; uncomment each line as the matching
 * `src/modules/<id>/index.{ts,tsx}` is committed.
 *
 * Conventions for new modules:
 *  - kebab-case folder name == module id;
 *  - default export = `ModuleDefinition`;
 *  - tag the module's screens / hooks / record-types under that folder
 *    so a single `git rm -rf src/modules/<id>` removes the feature.
 */

import { moduleRegistry } from './_registry'
import { CoreModule } from './core'
import { AIModule } from './ai'
import { RiskModule } from './risk'
import { ImportModule } from './import'

// Phase 1 — always-on baseline.
moduleRegistry.register(CoreModule)

// Phase 2 — AI / risk / import (optional, default-off until the user
// enables them per property).
moduleRegistry.register(AIModule)
moduleRegistry.register(RiskModule)
moduleRegistry.register(ImportModule)

// ─── Phase 2 placeholders (22 modules) ──────────────────────────────────────
//
// Capture / lifecycle / AI:
//   moduleRegistry.register(CaptureModule)        // photo capture + AI extraction
//   moduleRegistry.register(MaintenanceModule)    // recurring tasks, due/overdue
//   moduleRegistry.register(CalendarModule)       // Google Calendar integration
//   moduleRegistry.register(ChecklistsModule)     // seasonal & guided checklists
//   moduleRegistry.register(AdvisorModule)        // AI advisor (OpenRouter)
//   moduleRegistry.register(SearchModule)         // cross-record search
//   moduleRegistry.register(ImportModule)         // Drive inbox / external import
//
// Finance:
//   moduleRegistry.register(BudgetModule)         // capital plan + spend
//   moduleRegistry.register(TaxModule)            // assessments + payments
//   moduleRegistry.register(MortgageModule)       // loan + amortisation
//   moduleRegistry.register(UtilitiesModule)      // accounts + monthly bills
//   moduleRegistry.register(InsuranceModule)      // policies + renewals
//
// Property records:
//   moduleRegistry.register(ProfileModule)        // narrative property profile
//   moduleRegistry.register(HomeBookModule)       // long-form home book export
//   moduleRegistry.register(MapModule)            // geolocation / climate
//   moduleRegistry.register(RiskBriefModule)      // hazard / risk summary
//   moduleRegistry.register(InventoryModule)      // equipment inventory
//   moduleRegistry.register(ContentsModule)       // contents inventory (insurance)
//
// Property systems:
//   moduleRegistry.register(VendorsModule)        // contractor directory
//   moduleRegistry.register(PermitsModule)        // building / electrical / etc.
//   moduleRegistry.register(FuelModule)           // propane / heating-oil
//   moduleRegistry.register(GeneratorModule)      // standby generator log

export { moduleRegistry }
