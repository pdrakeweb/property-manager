import { makeSyncedStore } from './syncedStore'
import { formatVendor, vendorFilename } from './domainMarkdown'
import type { Vendor } from '../schemas'

export const vendorStore = makeSyncedStore<Vendor>(
  'pm_vendors', 'vendor', 'vendor',
  formatVendor, vendorFilename,
  (v) => v.propertyIds[0] ?? 'tannerville',
)
