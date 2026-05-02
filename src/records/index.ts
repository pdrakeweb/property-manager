export type {
  RecordDefinition,
  AnyRecordDefinition,
  FieldDef,
  FieldKind,
  FieldVisibility,
  RecordAIConfig,
  RecordMigration,
  PolymorphicVariant,
  VariantConfig,
} from './_framework'
export {
  visibleIn, resolveOptions, slugify, shortId,
  resolveVariant, resolveFields, resolveFolderName, resolveTitle,
  readFieldValue, writeFieldValue, registerVariant,
} from './_framework'

export { RECORDS, getDefinition, isRegistered, allDefinitions } from './registry'
export type { RegisteredRecordType } from './registry'

export { EquipmentZ, equipmentDef, BASE_EQUIPMENT_FIELDS } from './equipment'
export type { EquipmentRecordDsl } from './equipment'
export {
  EQUIPMENT_PROFILES,
  getEquipmentProfile,
  listEquipmentCategories,
} from './equipmentProfiles'

export { VendorZ, vendorDef } from './vendor'
export type { Vendor } from './vendor'

export { WellTestZ, WellTestParameterZ, wellTestDef } from './wellTest'
export type { WellTest, WellTestParameter } from './wellTest'

export { MaintenanceTaskZ, maintenanceTaskDef } from './maintenanceTask'
export type { MaintenanceTaskRecord } from './maintenanceTask'

export { CompletedEventZ, completedEventDef } from './completedEvent'
export type { CompletedEventRecord } from './completedEvent'

export { CapitalTransactionZ, capitalTransactionDef } from './capitalTransaction'
export type { CapitalTransactionRecord } from './capitalTransaction'

export { CapitalOverrideZ, capitalOverrideDef } from './capitalOverride'
export type { CapitalOverrideRecord } from './capitalOverride'

export { FuelDeliveryZ, fuelDeliveryDef } from './fuelDelivery'
export type { FuelDeliveryRecord } from './fuelDelivery'

export { SepticEventZ, septicEventDef } from './septicEvent'
export type { SepticEventRecord } from './septicEvent'

export { TaxAssessmentZ, taxAssessmentDef } from './taxAssessment'
export type { TaxAssessmentRecord } from './taxAssessment'

export { TaxPaymentZ, taxPaymentDef } from './taxPayment'
export type { TaxPaymentRecord } from './taxPayment'

export { MortgageZ, mortgageDef } from './mortgage'
export type { MortgageRecord } from './mortgage'

export { MortgagePaymentZ, mortgagePaymentDef } from './mortgagePayment'
export type { MortgagePaymentRecord } from './mortgagePayment'

export { UtilityAccountZ, utilityAccountDef } from './utilityAccount'
export type { UtilityAccountRecord } from './utilityAccount'

export { UtilityBillZ, utilityBillDef } from './utilityBill'
export type { UtilityBillRecord } from './utilityBill'

export { InsurancePolicyZ, insuranceDef } from './insurance'
export type { InsurancePolicyRecord } from './insurance'

export { PermitZ, permitDef } from './permit'
export type { PermitRecord } from './permit'

export { RoadEventZ, roadDef } from './road'
export type { RoadEventRecord } from './road'

export { GeneratorZ, GeneratorRuntimeEntryZ, generatorDef } from './generator'
export type { GeneratorRecordDsl } from './generator'

export { PropertyZ, propertyDef } from './property'
export type { PropertyDsl } from './property'
