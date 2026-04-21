#!/usr/bin/env node
/**
 * Generate `planning/RECORD-TYPES.md` from the DSL record registry.
 *
 * Usage:
 *   npm run docs:records         # write file
 *   npm run docs:records:check   # exit 1 if file would change (CI-friendly)
 *
 * Requires `tsx` to be loaded so `.ts` source files can be imported — we
 * invoke node with `--import tsx` from the npm scripts. Running the file
 * directly (without --import tsx) will fail with an unknown-extension error.
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = resolve(__dirname, '..')
const OUT_PATH  = resolve(ROOT, 'planning/RECORD-TYPES.md')

const { allDefinitions } = await import(pathToFileURL(resolve(ROOT, 'src/records/registry.ts')).href)

function renderField(f) {
  const req = f.required ? '✓' : ''
  const notes = [
    f.unit ? `unit: ${f.unit}` : '',
    f.helpText ?? '',
    f.options ? `options: ${(typeof f.options === 'function' ? f.options() : f.options).join(', ')}` : '',
    f.of ? `of: [${f.of.map(x => x.id).join(', ')}]` : '',
  ].filter(Boolean).join(' · ')
  return `| ${f.id} | ${f.kind} | ${req} | ${notes} |`
}

/**
 * Polymorphic record types (Equipment) describe one discriminator with many
 * variants; document the base + the variants table so the generated doc
 * matches what the registry actually exposes.
 */
function renderVariantTable(def) {
  if (!def.variants) return []
  // Only show fields that aren't already on the base — variants may redeclare
  // base-field metadata (label, position) but we don't want to repeat them in
  // the "Extra fields" column.
  const baseIds = new Set(def.fields.map(f => f.id))
  const rows = Object.entries(def.variants.variants).map(([key, v]) => {
    const folder = v.folderName ? `\`${v.folderName}/\`` : '—'
    const extraFields = v.fields.filter(f => !baseIds.has(f.id)).map(f => f.id)
    const extras = extraFields.join(', ') || '—'
    return `| ${key} | ${v.label} | ${folder} | ${extras} |`
  })
  return [
    '',
    `**Variants** (discriminator: \`${def.variants.discriminator}\`) — one subsystem plugin per row:`,
    '',
    '| Key | Label | Folder | Extra fields |',
    '|---|---|---|---|',
    ...rows,
  ]
}

function renderDef(def) {
  const baseFields = def.fields.filter(f => f.showIn?.docs !== false)
  const ai         = def.ai?.description ?? '—'
  const meta = [
    `**Folder:** \`${def.folderName}/\``,
    `**Version:** ${def.version}`,
    `**Allow multiple:** ${def.allowMultiple ? 'yes' : 'no'}`,
    def.valuePath ? `**Value path:** \`${def.valuePath}\`` : '',
  ].filter(Boolean).join('   ')

  const fieldHeading = def.variants
    ? '**Base fields** (shared by every variant):'
    : null

  return [
    `## ${def.label} (\`${def.type}\`)`,
    '',
    meta,
    '',
    `**AI tool:** ${ai}`,
    '',
    ...(fieldHeading ? [fieldHeading, ''] : []),
    '| Field | Kind | Required | Notes |',
    '|---|---|---|---|',
    ...baseFields.map(renderField),
    ...renderVariantTable(def),
    '',
  ].join('\n')
}

function renderDoc(defs) {
  const polymorphicNote = defs.some(d => d.variants)
    ? ' Equipment is a polymorphic record — its per-subsystem field sets plug in via `src/records/equipmentProfiles.ts` (see the variants table under *Equipment* below).'
    : ''
  const header = [
    '# Record Types',
    '',
    '*Auto-generated from `src/records/registry.ts` by `scripts/generate-record-docs.mjs`. Do not edit by hand.*',
    '',
    `${defs.length} record type${defs.length === 1 ? '' : 's'} currently managed by the DSL registry.${polymorphicNote}`,
    '',
  ].join('\n')
  return header + '\n' + defs.map(renderDef).join('\n')
}

const output = renderDoc(allDefinitions())

if (process.argv.includes('--check')) {
  const current = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, 'utf8') : ''
  // Normalize line endings before comparing so a Windows checkout with
  // `core.autocrlf=true` (which converts the generator's \n output to \r\n
  // on disk) doesn't trigger a spurious stale-docs failure.
  const norm = (s) => s.replace(/\r\n/g, '\n')
  if (norm(current) !== norm(output)) {
    console.error('RECORD-TYPES.md is stale. Run: npm run docs:records')
    process.exit(1)
  }
  console.log('RECORD-TYPES.md up to date.')
  process.exit(0)
}

writeFileSync(OUT_PATH, output, 'utf8')
console.log(`Wrote ${OUT_PATH}`)
