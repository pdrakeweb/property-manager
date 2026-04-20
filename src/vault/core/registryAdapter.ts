/**
 * Bridge from the host app's DSL record registry to the vault's
 * structural `VaultRegistry`. Lives in the vault package so consumers
 * can opt into DSL-based definitions without implementing the bridge
 * themselves — but the vault core (`syncEngine`, `markdownExport`) does
 * NOT import this file, keeping the core decoupled from any concrete
 * record definition shape.
 *
 * Usage:
 *
 *   import { RECORDS } from '@/records/registry'
 *   import { CATEGORY_FOLDER_NAMES } from '@/lib/driveClient'
 *   const registry = buildRegistryFromDSL(RECORDS, CATEGORY_FOLDER_NAMES)
 */

import {
  resolveFolderName as dslResolveFolderName,
  resolveTitle      as dslResolveTitle,
  type AnyRecordDefinition,
} from '../../records/_framework'
import { renderRecordMarkdown, recordFilename } from '../../lib/dslMarkdown'
import type { VaultRegistry, VaultTypeInfo } from './types'

export interface BuildRegistryOptions {
  records: Readonly<Record<string, AnyRecordDefinition>>
  legacyFolderNames?: Readonly<Record<string, string>>
}

export function buildRegistryFromDSL(opts: BuildRegistryOptions): VaultRegistry {
  const { records, legacyFolderNames = {} } = opts

  const infoCache = new Map<string, VaultTypeInfo>()

  function getInfo(type: string): VaultTypeInfo | null {
    const cached = infoCache.get(type)
    if (cached) return cached
    const def = records[type]
    if (!def) return null
    const info: VaultTypeInfo = {
      type: def.type,
      folderName: def.folderName,
      resolveFolderName: (data) => dslResolveFolderName(def, data),
      resolveTitle: (data) => dslResolveTitle(def, data),
      renderMarkdown: (data) => renderRecordMarkdown(def, data),
      markdownFilename: (data) => recordFilename(def, data),
    }
    infoCache.set(type, info)
    return info
  }

  return {
    allTypes() { return Object.keys(records) },
    get(type)  { return getInfo(type) },
    legacyFolderNames() { return legacyFolderNames },
  }
}
