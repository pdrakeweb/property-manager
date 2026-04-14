import { makeStore } from './localStore'
import type { Vendor } from '../schemas'
export const vendorStore = makeStore<Vendor>('pm_vendors')
