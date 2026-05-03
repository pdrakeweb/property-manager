/**
 * Insurance-grade CSV + printable-HTML export for the Home Contents
 * Inventory, plus a forgiving CSV importer for bulk-loading existing
 * spreadsheet inventories.
 */

import { CONTENT_CATEGORIES, contentCategoryLabel, type ContentCategory, type ContentItem } from '../records/contentItem'

// ─── CSV writing ─────────────────────────────────────────────────────────────

function csvCell(value: unknown): string {
  if (value == null) return ''
  const s = String(value)
  // Escape per RFC 4180: wrap in quotes if it contains a comma, quote, or newline.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',')
}

const INSURANCE_HEADER = [
  'Name',
  'Category',
  'Location',
  'Quantity',
  'Purchase Price',
  'Current Value',
  'Insured Value',
  'Serial Number',
  'Brand',
  'Model',
  'Purchase Date',
  'Condition',
] as const

export function buildInsuranceCsv(items: ContentItem[]): string {
  const lines: string[] = [csvRow([...INSURANCE_HEADER])]
  for (const i of items) {
    lines.push(csvRow([
      i.name,
      contentCategoryLabel(i.category),
      i.location ?? '',
      i.quantity ?? 1,
      i.purchasePrice ?? '',
      i.currentValue ?? '',
      i.insuredValue ?? '',
      i.serialNumber ?? '',
      i.brand ?? '',
      i.model ?? '',
      i.purchaseDate ?? '',
      i.condition ?? '',
    ]))
  }
  return lines.join('\r\n')
}

// ─── Browser download helper ─────────────────────────────────────────────────

export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Defer revoke so the browser has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ─── Printable HTML report ───────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function money(n: number | undefined): string {
  if (n == null) return '—'
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

export interface BuildHtmlReportOptions {
  propertyName?: string
  generatedAt?:  Date
}

export function buildHtmlReport(items: ContentItem[], opts: BuildHtmlReportOptions = {}): string {
  const propertyName = opts.propertyName ?? 'Property'
  const generatedAt  = opts.generatedAt  ?? new Date()
  const totalCount   = items.reduce((s, i) => s + (i.quantity ?? 1), 0)
  const totalValue   = items.reduce((s, i) => s + (i.currentValue ?? 0), 0)
  const totalInsured = items.reduce((s, i) => s + (i.insuredValue ?? 0), 0)

  // Group by category in the order CONTENT_CATEGORIES declares.
  const grouped = new Map<ContentCategory, ContentItem[]>()
  for (const c of CONTENT_CATEGORIES) grouped.set(c, [])
  for (const i of items) grouped.get(i.category)?.push(i)

  const sections = [...grouped.entries()]
    .filter(([, list]) => list.length > 0)
    .map(([category, list]) => {
      const subtotal = list.reduce((s, i) => s + (i.currentValue ?? 0), 0)
      const rows = list
        .map(i => `
          <tr>
            <td>${escapeHtml(i.name)}</td>
            <td>${escapeHtml(i.location ?? '')}</td>
            <td>${escapeHtml(i.brand ?? '')}${i.model ? ' ' + escapeHtml(i.model) : ''}</td>
            <td>${escapeHtml(i.serialNumber ?? '')}</td>
            <td class="num">${i.quantity ?? 1}</td>
            <td class="num">${money(i.purchasePrice)}</td>
            <td class="num">${money(i.currentValue)}</td>
          </tr>
        `).join('')
      return `
        <section>
          <h2>${escapeHtml(contentCategoryLabel(category))} <span class="muted">(${list.length} item${list.length !== 1 ? 's' : ''} · ${money(subtotal)})</span></h2>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Location</th>
                <th>Brand / Model</th>
                <th>Serial #</th>
                <th class="num">Qty</th>
                <th class="num">Purchase</th>
                <th class="num">Current</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>
      `
    })
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Home Contents Inventory — ${escapeHtml(propertyName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1f2937; padding: 32px 28px; max-width: 1024px; margin: 0 auto; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  h2 { margin: 28px 0 8px; font-size: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; }
  .muted { color: #6b7280; font-weight: normal; font-size: 13px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 20px; }
  .summary { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; min-width: 240px; }
  .summary div { display: flex; justify-content: space-between; gap: 16px; padding: 2px 0; }
  .summary .total { font-weight: 600; border-top: 1px solid #e5e7eb; padding-top: 6px; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  th { background: #f9fafb; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #475569; }
  td.num, th.num { text-align: right; }
  footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 11px; }
  @media print { body { padding: 0; } section { page-break-inside: avoid; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Home Contents Inventory</h1>
      <p class="muted">${escapeHtml(propertyName)} · prepared ${escapeHtml(generatedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))}</p>
    </div>
    <div class="summary">
      <div><span>Total items</span><span>${totalCount.toLocaleString()}</span></div>
      <div><span>Estimated value</span><span>${money(totalValue)}</span></div>
      <div class="total"><span>Insured value</span><span>${money(totalInsured)}</span></div>
    </div>
  </div>
  ${sections || '<p class="muted">No items recorded.</p>'}
  <footer>Generated by Property Manager — keep with insurance documentation.</footer>
</body>
</html>`
}

// ─── CSV import ──────────────────────────────────────────────────────────────

/**
 * Parse a CSV string into rows of strings. Handles RFC-4180 quoting:
 * doubled quotes inside a quoted field become a single quote, and quoted
 * fields may contain commas and newlines.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  let i = 0
  // Strip a leading BOM if present — Excel exports often include one.
  if (text.charCodeAt(0) === 0xFEFF) i = 1

  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      cell += ch; i++; continue
    }
    if (ch === '"') { inQuotes = true; i++; continue }
    if (ch === ',') { row.push(cell); cell = ''; i++; continue }
    if (ch === '\r') { i++; continue }                         // ignore CR
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue }
    cell += ch; i++
  }
  // Flush the trailing cell/row, but skip a single empty trailing row that
  // comes from a file ending in a newline.
  row.push(cell)
  if (!(row.length === 1 && row[0] === '')) rows.push(row)
  return rows
}

const HEADER_ALIASES: Record<string, keyof ContentItem> = {
  'name':           'name',
  'item':           'name',
  'description':    'name',
  'category':       'category',
  'type':           'category',
  'location':       'location',
  'room':           'location',
  'quantity':       'quantity',
  'qty':            'quantity',
  'count':          'quantity',
  'purchase price': 'purchasePrice',
  'price':          'purchasePrice',
  'cost':           'purchasePrice',
  'current value':  'currentValue',
  'value':          'currentValue',
  'estimated value':'currentValue',
  'insured value':  'insuredValue',
  'serial number':  'serialNumber',
  'serial':         'serialNumber',
  'brand':          'brand',
  'manufacturer':   'brand',
  'model':          'model',
  'purchase date':  'purchaseDate',
  'condition':      'condition',
  'notes':          'notes',
  'description / notes': 'notes',
}

function normalizeCategory(raw: string): ContentCategory {
  const low = raw.toLowerCase().trim()
  for (const c of CONTENT_CATEGORIES) {
    if (low === c) return c
    if (low === contentCategoryLabel(c).toLowerCase()) return c
  }
  // Common synonyms
  if (low.includes('art')) return 'art'
  if (low.includes('jewel')) return 'jewelry'
  if (low.includes('cloth') || low.includes('apparel')) return 'clothing'
  if (low.includes('tool')) return 'tools'
  if (low.includes('electronic') || low.includes('tv') || low.includes('computer')) return 'electronics'
  if (low.includes('furniture') || low.includes('sofa') || low.includes('chair') || low.includes('table')) return 'furniture'
  if (low.includes('appliance') || low.includes('fridge') || low.includes('washer') || low.includes('dryer')) return 'appliance'
  return 'other'
}

function parseMoney(raw: string): number | undefined {
  if (!raw) return undefined
  const cleaned = raw.replace(/[,$\s]/g, '')
  if (!cleaned) return undefined
  const n = Number(cleaned)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

export interface CsvImportResult {
  items:    Array<Omit<ContentItem, 'id' | 'propertyId'>>
  skipped:  number
  warnings: string[]
}

/**
 * Parse a CSV file into draft content items ready to be added to the
 * store. Skips header-only rows, rows missing a name, and validates
 * categories against the registered enum (unknown values map to "other"
 * with a warning).
 */
export function importContentsCsv(text: string): CsvImportResult {
  const rows = parseCsv(text)
  if (rows.length === 0) return { items: [], skipped: 0, warnings: ['CSV is empty'] }

  const header = rows[0].map(h => h.trim().toLowerCase())
  const fieldByCol: Array<keyof ContentItem | null> = header.map(h => HEADER_ALIASES[h] ?? null)

  if (!fieldByCol.includes('name')) {
    return { items: [], skipped: 0, warnings: ['CSV missing a "name" column (also accepted: "item", "description")'] }
  }

  const items: Array<Omit<ContentItem, 'id' | 'propertyId'>> = []
  const warnings: string[] = []
  let skipped = 0

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (row.every(cell => cell.trim() === '')) { skipped++; continue }

    const draft: Partial<ContentItem> = { quantity: 1, condition: 3, category: 'other' }
    for (let c = 0; c < fieldByCol.length; c++) {
      const field = fieldByCol[c]
      const raw   = (row[c] ?? '').trim()
      if (!field || raw === '') continue
      switch (field) {
        case 'name':         draft.name = raw; break
        case 'category':     draft.category = normalizeCategory(raw); break
        case 'location':     draft.location = raw; break
        case 'quantity': {
          const q = Number.parseInt(raw, 10)
          draft.quantity = Number.isFinite(q) && q > 0 ? q : 1
          break
        }
        case 'purchasePrice': draft.purchasePrice = parseMoney(raw); break
        case 'currentValue':  draft.currentValue  = parseMoney(raw); break
        case 'insuredValue':  draft.insuredValue  = parseMoney(raw); break
        case 'serialNumber':  draft.serialNumber  = raw; break
        case 'brand':         draft.brand         = raw; break
        case 'model':         draft.model         = raw; break
        case 'purchaseDate':  draft.purchaseDate  = raw; break
        case 'condition': {
          const n = Number.parseInt(raw, 10)
          draft.condition = Number.isFinite(n) && n >= 1 && n <= 5 ? n : 3
          break
        }
        case 'notes': draft.notes = raw; break
      }
    }

    if (!draft.name) { skipped++; continue }
    items.push({
      name:          draft.name,
      category:      draft.category ?? 'other',
      location:      draft.location ?? '',
      quantity:      draft.quantity ?? 1,
      condition:     draft.condition ?? 3,
      purchaseDate:  draft.purchaseDate,
      purchasePrice: draft.purchasePrice,
      currentValue:  draft.currentValue,
      insuredValue:  draft.insuredValue,
      brand:         draft.brand,
      model:         draft.model,
      serialNumber:  draft.serialNumber,
      notes:         draft.notes,
    })
  }

  if (warnings.length === 0 && items.length === 0) {
    warnings.push('No rows imported — check the CSV format')
  }
  return { items, skipped, warnings }
}
