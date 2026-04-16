import { makeSyncedStore } from './syncedStore'
import type { Vendor } from '../schemas'

export const vendorStore = makeSyncedStore<Vendor>(
  'pm_vendors', 'vendor', 'vendor',
  (v) => v.propertyIds[0] ?? 'tannerville',
)
