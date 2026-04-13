import type { CaptureCategory } from '../data/categories'

/**
 * Renders a capture record as a Markdown document matching the Drive output
 * format specified in property-capture-tool-spec.md §5.3.
 *
 * Null/undefined/empty-string field values are omitted from the table.
 * The Notes field, if present and non-empty, gets its own section.
 * Photos are listed by filename under a Photos section.
 */
export function formatRecord(
  category: CaptureCategory,
  fields: Record<string, unknown>,
  photoFilenames: string[],
  capturedAt: Date,
): string {
  const datePart = formatDate(capturedAt)
  const timePart = formatTime(capturedAt)
  const capturedDisplay = `${datePart} ${timePart}`

  const lines: string[] = []

  // ── Header ──────────────────────────────────────────────────────────────────
  lines.push(`# ${category.label} — Equipment Record`)
  lines.push('')
  lines.push(`**Captured:** ${capturedDisplay}`)
  lines.push(`**Category:** ${category.label}`)
  lines.push('')

  // ── Specifications table ────────────────────────────────────────────────────
  const tableRows = buildTableRows(category, fields)

  if (tableRows.length > 0) {
    lines.push('## Specifications')
    lines.push('')
    lines.push('| Field | Value |')
    lines.push('|---|---|')
    for (const row of tableRows) {
      lines.push(row)
    }
    lines.push('')
  }

  // ── Notes section ───────────────────────────────────────────────────────────
  const notesField = category.fields.find((f) => f.id === 'notes')
  if (notesField) {
    const notesValue = fields['notes']
    if (notesValue !== null && notesValue !== undefined && String(notesValue).trim() !== '') {
      lines.push('## Notes')
      lines.push('')
      lines.push(String(notesValue).trim())
      lines.push('')
    }
  }

  // ── Photos section ──────────────────────────────────────────────────────────
  if (photoFilenames.length > 0) {
    lines.push('## Photos')
    lines.push('')
    for (const filename of photoFilenames) {
      lines.push(`- ${filename}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Generates the standard filename stem for a record:
 * `{categoryId}_{YYYY-MM-DD}_{HHmm}`
 */
export function formatFileStem(categoryId: string, capturedAt: Date): string {
  const datePart = formatDate(capturedAt)
  const timePart = formatTime(capturedAt).replace(':', '')
  return `${categoryId}_${datePart}_${timePart}`
}

/**
 * Generates the Markdown filename: `{stem}.md`
 */
export function formatMarkdownFilename(categoryId: string, capturedAt: Date): string {
  return `${formatFileStem(categoryId, capturedAt)}.md`
}

/**
 * Generates a photo filename: `{stem}_photo_{n}.jpg`
 */
export function formatPhotoFilename(categoryId: string, capturedAt: Date, n: number): string {
  return `${formatFileStem(categoryId, capturedAt)}_photo_${n}.jpg`
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

function buildTableRows(
  category: CaptureCategory,
  fields: Record<string, unknown>,
): string[] {
  const rows: string[] = []

  for (const fieldDef of category.fields) {
    // Notes are rendered in their own section
    if (fieldDef.id === 'notes') continue

    const raw = fields[fieldDef.id]
    if (raw === null || raw === undefined || String(raw).trim() === '') continue

    const label = escapeCell(fieldDef.unit ? `${fieldDef.label} (${fieldDef.unit})` : fieldDef.label)
    const value = escapeCell(renderFieldValue(raw, fieldDef.type))

    rows.push(`| ${label} | ${value} |`)
  }

  return rows
}

function renderFieldValue(value: unknown, type: string): string {
  if (type === 'boolean') {
    return value ? 'Yes' : 'No'
  }
  return String(value)
}

function escapeCell(text: string): string {
  // Escape pipe characters and strip literal newlines so table doesn't break
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ').replace(/\r/g, '')
}

function padTwo(n: number): string {
  return String(n).padStart(2, '0')
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${padTwo(d.getMonth() + 1)}-${padTwo(d.getDate())}`
}

function formatTime(d: Date): string {
  return `${padTwo(d.getHours())}:${padTwo(d.getMinutes())}`
}
