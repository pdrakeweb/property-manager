/**
 * Record registry — single index of all DSL-managed record types.
 *
 * One line per type; edit this file (and run `scripts/generate-record-docs.mjs`)
 * when adding a new record type. Equipment records are not registered here;
 * they live behind the bespoke capture-flow because field sets vary by
 * subsystem category.
 */

import type { AnyRecordDefinition } from './_framework'

import { equipmentDef }           from './equipment'
// Importing the profiles file also runs `registerVariant(equipmentDef, …)`
// at module load — do not remove, even though the symbol is unused.
import './equipmentProfiles'
import { vendorDef }              from './vendor'
import { wellTestDef }            from './wellTest'
import { maintenanceTaskDef }     from './maintenanceTask'
import { completedEventDef }      from './completedEvent'
import { capitalItemDef }         from './capitalItem'
import { capitalTransactionDef }  from './capitalTransaction'
import { capitalOverrideDef }     from './capitalOverride'
import { fuelDeliveryDef }        from './fuelDelivery'
import { septicEventDef }         from './septicEvent'
import { taxAssessmentDef }       from './taxAssessment'
import { taxPaymentDef }          from './taxPayment'
import { mortgageDef }            from './mortgage'
import { mortgagePaymentDef }     from './mortgagePayment'
import { utilityAccountDef }      from './utilityAccount'
import { utilityBillDef }         from './utilityBill'
import { insuranceDef }           from './insurance'
import { permitDef }              from './permit'
import { roadDef }                from './road'
import { generatorDef }           from './generator'

export const RECORDS = {
  equipment:           equipmentDef,
  vendor:              vendorDef,
  well_test:           wellTestDef,
  task:                maintenanceTaskDef,
  completed_event:     completedEventDef,
  capital_item:        capitalItemDef,
  capital_transaction: capitalTransactionDef,
  capital_override:    capitalOverrideDef,
  fuel_delivery:       fuelDeliveryDef,
  septic_event:        septicEventDef,
  tax_assessment:      taxAssessmentDef,
  tax_payment:         taxPaymentDef,
  mortgage:            mortgageDef,
  mortgage_payment:    mortgagePaymentDef,
  utility_account:     utilityAccountDef,
  utility_bill:        utilityBillDef,
  insurance:           insuranceDef,
  permit:              permitDef,
  road:                roadDef,
  generator_log:       generatorDef,
} as const

export type RegisteredRecordType = keyof typeof RECORDS

/** True if the given record type is managed by the DSL registry. */
export function isRegistered(type: string): type is RegisteredRecordType {
  return Object.prototype.hasOwnProperty.call(RECORDS, type)
}

/** Lookup a definition by type key, or null if not registered. */
export function getDefinition(type: string): AnyRecordDefinition | null {
  return isRegistered(type) ? (RECORDS[type] as AnyRecordDefinition) : null
}

/** All registered definitions in declaration order. */
export function allDefinitions(): AnyRecordDefinition[] {
  return Object.values(RECORDS) as AnyRecordDefinition[]
}
