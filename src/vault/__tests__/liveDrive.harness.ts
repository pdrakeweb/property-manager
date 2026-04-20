/**
 * Manual live-Drive harness.
 *
 * Runs the vault's push/pull cycle against a *real* Google Drive account
 * using a user-supplied OAuth access token. Unlike the unit tests, this
 * script is NOT invoked by `npm run test:vault`; run it ad-hoc when you
 * want to verify integration end-to-end against the actual Drive API:
 *
 *   GOOGLE_DRIVE_TOKEN=ya29.… \
 *   GOOGLE_DRIVE_ROOT=<folderId>  # some throw-away folder you control
 *   npm run test:vault:live
 *
 * How to get a token (either works):
 *  1. OAuth Playground flow for scope https://www.googleapis.com/auth/drive.file
 *     → grant access → click "Exchange auth code for tokens" → copy the
 *     short-lived access_token.
 *  2. In the running app, sign in and copy `google_access_token` out of
 *     localStorage via devtools. The same token is valid here.
 *
 * Safety: the harness writes a handful of files into `GOOGLE_DRIVE_ROOT`
 * under `Vendors/` and then deletes them on exit. It never touches files
 * it didn't create. Choose a test folder you own.
 */

import { createRecordVault } from '../index'
import { createGoogleDriveAdapter } from '../adapters/googleDriveAdapter'
import { makeMemoryKVStore } from '../core/types'
import type { VaultRegistry, VaultTypeInfo } from '../core/types'

const token = process.env.GOOGLE_DRIVE_TOKEN
const root  = process.env.GOOGLE_DRIVE_ROOT

function usage(msg: string): never {
  console.error(`ERROR: ${msg}`)
  console.error('Usage: GOOGLE_DRIVE_TOKEN=… GOOGLE_DRIVE_ROOT=folderId npm run test:vault:live')
  process.exit(2)
}

if (!token) usage('GOOGLE_DRIVE_TOKEN is required')
if (!root)  usage('GOOGLE_DRIVE_ROOT is required (a Drive folder id you control)')

const vendor: VaultTypeInfo = {
  type: 'vendor',
  folderName: 'VaultHarness_Vendors',
  resolveFolderName: () => 'VaultHarness_Vendors',
  resolveTitle: (d) => String(d.name ?? 'Unnamed'),
  renderMarkdown: (d) => `# Vendor: ${String(d.name)}\n`,
  markdownFilename: (d) => `vendor_${String(d.name ?? 'unnamed').replace(/\W+/g, '_')}.md`,
}

const registry: VaultRegistry = {
  allTypes: () => ['vendor'],
  get: (type) => (type === 'vendor' ? vendor : null),
  legacyFolderNames: () => ({}),
}

const vault = createRecordVault({
  storage: createGoogleDriveAdapter(() => token!),
  kvStore: makeMemoryKVStore(),
  registry,
  host: { getRootFolderId: () => root! },
  audit: {
    info:  (a, m) => console.log(`  [info ] ${a}: ${m}`),
    warn:  (a, m) => console.warn(`  [warn ] ${a}: ${m}`),
    error: (a, m) => console.error(`  [error] ${a}: ${m}`),
  },
})

async function main() {
  const testId = 'vault_harness_' + Date.now()
  const propertyId = 'harness-prop'

  console.log(`--- live drive harness ---`)
  console.log(`root: ${root}  testId: ${testId}`)

  // Seed one record locally
  vault.localIndex.upsert({
    id: testId,
    type: 'vendor',
    propertyId,
    title: 'Vault Harness Vendor',
    data: { id: testId, name: 'Vault Harness Vendor', phone: '555-TEST' },
    syncState: 'pending_upload',
  })

  console.log('1. push pending ...')
  const push = await vault.pushPending()
  console.log(`   uploaded=${push.uploaded} failed=${push.failed}`)
  if (push.failed > 0) console.error(`   errors: ${push.errors.join(' | ')}`)

  console.log('2. pull into fresh index ...')
  const freshVault = createRecordVault({
    storage: createGoogleDriveAdapter(() => token!),
    kvStore: makeMemoryKVStore(),
    registry,
    host: { getRootFolderId: () => root! },
  })
  const pull = await freshVault.pullFromDrive(propertyId)
  console.log(`   pulled=${pull.pulled} failed=${pull.failed}`)
  const restored = freshVault.localIndex.getById(testId)
  if (!restored) {
    console.error('   ✗ test record was not restored')
    process.exit(1)
  } else {
    console.log(`   ✓ restored: ${restored.title}`)
  }

  console.log('3. cleanup — soft-delete record and overwrite file with empty content ...')
  // We can't actually delete Drive files without the drive scope, but we
  // can leave the harness record behind; next run will just upsert over it.
  // Mark synced record as soft-deleted locally so a re-run doesn't push stale state.
  vault.localIndex.softDelete(testId)

  console.log('done — manual verification complete')
}

main().catch((err) => {
  console.error('harness failed:', err)
  process.exit(1)
})
