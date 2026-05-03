/**
 * Registry barrel — single import surface for the module framework.
 *
 *   import { moduleRegistry, useActiveModuleIds, ... } from '@/modules/_registry'
 *
 * Adds nothing beyond re-exports; keep it that way so the framework
 * files never accidentally form a cycle through the barrel.
 */

export type { ModuleId, NavGroup } from './types'

export type {
  ModuleDefinition,
  ModuleCategory,
  NavItem,
  RecordTypeRegistration,
  SettingsSection,
} from './ModuleDefinition'

export { moduleRegistry } from './ModuleRegistry'

export {
  expandWithDeps,
  getActivationOrder,
  assertNoCycles,
} from './DepResolver'

export { buildRoutes } from './RouterBuilder'

export {
  ActiveModuleProvider,
  ACTIVE_PROPERTY_CHANGED_EVENT,
  defaultPropertyModules,
  computeToggle,
  useActiveModuleIds,
  useModuleEnabled,
  useToggleModule,
  usePropertyModules,
} from './ActiveModuleContext'
export type { PropertyModulesRecord } from './ActiveModuleContext'
