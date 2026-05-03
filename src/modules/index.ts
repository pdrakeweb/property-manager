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
import { MaintenanceModule } from './maintenance'
import { CalendarModule } from './calendar'
import { SearchModule } from './search'
import { AIModule } from './ai'
import { RiskModule } from './risk'
import { ImportModule } from './import'
import { CapitalModule } from './capital'
import { InsuranceModule } from './insurance'
import { MortgageModule } from './mortgage'
import { TaxModule } from './tax'
import { HaModule } from './ha'
import { FuelModule } from './fuel'
import { UtilityModule } from './utility'
import { MapModule } from './map'
import { VendorModule } from './vendor'
import { PermitsModule } from './permits'
import { RoadModule } from './road'
import { WellModule } from './well'
import { SepticModule } from './septic'
import { GeneratorModule } from './generator'
import { ContentsModule } from './contents'
import { HomeBookModule } from './homebook'
import { InventoryModule } from './inventory'
import { NarrativeModule } from './narrative'
import { ExpiryModule } from './expiry'

// Phase 1 — always-on baseline.
moduleRegistry.register(CoreModule)

// Phase 2 — feature modules, declared but not yet rendered.
moduleRegistry.register(MaintenanceModule)
moduleRegistry.register(CalendarModule)
moduleRegistry.register(SearchModule)
moduleRegistry.register(AIModule)
moduleRegistry.register(RiskModule)
moduleRegistry.register(ImportModule)
moduleRegistry.register(CapitalModule)
moduleRegistry.register(InsuranceModule)
moduleRegistry.register(MortgageModule)
moduleRegistry.register(TaxModule)
moduleRegistry.register(HaModule)
moduleRegistry.register(FuelModule)
moduleRegistry.register(UtilityModule)
moduleRegistry.register(MapModule)
moduleRegistry.register(VendorModule)
moduleRegistry.register(PermitsModule)
moduleRegistry.register(RoadModule)
moduleRegistry.register(WellModule)
moduleRegistry.register(SepticModule)
moduleRegistry.register(GeneratorModule)
moduleRegistry.register(ContentsModule)
moduleRegistry.register(HomeBookModule)
moduleRegistry.register(InventoryModule)
moduleRegistry.register(NarrativeModule)
moduleRegistry.register(ExpiryModule)

// ─── Phase 2 placeholders (remaining modules) ───────────────────────────────
//
// Capture / lifecycle / AI:
//   moduleRegistry.register(CaptureModule)        // photo capture + AI extraction
//   moduleRegistry.register(ChecklistsModule)     // seasonal & guided checklists
//   moduleRegistry.register(AdvisorModule)        // AI advisor (OpenRouter)
//   moduleRegistry.register(ImportModule)         // Drive inbox / external import
//
// Finance:
//   moduleRegistry.register(UtilitiesModule)      // accounts + monthly bills
//
// Property records:
//   moduleRegistry.register(ProfileModule)        // narrative property profile
//   moduleRegistry.register(MapModule)            // geolocation / climate
//   moduleRegistry.register(RiskBriefModule)      // hazard / risk summary
// (HomeBookModule, InventoryModule, ContentsModule registered above.)
//
// Property systems (remaining placeholders):
//   moduleRegistry.register(VendorsModule)        // contractor directory
//   moduleRegistry.register(FuelModule)           // propane / heating-oil

export { moduleRegistry }
