#!/usr/bin/env node
/**
 * Generate `planning/RECORD-TYPES.md` from the DSL record registry.
 *
 * Usage:
 *   node scripts/generate-record-docs.mjs           # write file
 *   node scripts/generate-record-docs.mjs --check   # exit 1 if file would change
 *
 * The registry is loaded through `tsx` so the runtime sees live definitions
 * rather than a frozen snapshot. Run this after editing `src/records/*.ts`.
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { register } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = resolve(__dirname, '..')
const OUT_PATH  = resolve(ROOT, 'planning/RECORD-TYPES.md')

// Register tsx loader so we can import .ts source files directly
try {
  register('tsx/esm', pathToFileURL(ROOT + '/'))
} catch (err) {
  console.error('Failed to register tsx loader — is `tsx` installed?')
  console.error(err)
  process.exit(2)
}

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

function renderDef(def) {
  const fields = def.fields.filter(f => f.showIn?.docs !== false)
  const ai = def.ai?.description ?? '—'
  return [
    `## ${def.label} (\`${def.type}\`)`,
    '',
    `**Folder:** \`${def.folderName}/\`   **Version:** ${def.version}   **Allow multiple:** ${def.allowMultiple ? 'yes' : 'no'}`,
    '',
    `**AI tool:** ${ai}`,
    '',
    '| Field | Kind | Required | Notes |',
    '|---|---|---|---|',
    ...fields.map(renderField),
    '',
  ].join('\n')
}

function renderDoc(defs) {
  const header = [
    '# Record Types',
    '',
    '*Auto-generated from `src/records/registry.ts` by `scripts/generate-record-docs.mjs`. Do not edit by hand.*',
    '',
    `${defs.length} record type${defs.length === 1 ? '' : 's'} currently managed by the DSL registry. Types defined only in the legacy stores (\`src/lib/*Store.ts\` + \`src/lib/domainMarkdown.ts\`) are not listed here — they will appear as they migrate onto the registry.`,
    '',
  ].join('\n')
  return header + '\n' + defs.map(renderDef).join('\n')
}

const output = renderDoc(allDefinitions())

if (process.argv.includes('--check')) {
  const current = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, 'utf8') : ''
  if (current !== output) {
    console.error(`RECORD-TYPES.md is stale. Run: node scripts/generate-record-docs.mjs`)
    process.exit(1)
  }
  console.log('RECORD-TYPES.md up to date.')
  process.exit(0)
}

writeFileSync(OUT_PATH, output, 'utf8')
console.log(`Wrote ${OUT_PATH}`)
