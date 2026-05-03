/**
 * Home Book — print-ready HTML renderer.
 *
 * Returns a self-contained HTML document for browser print-to-PDF or
 * stand-alone download. Inline `<style>` only — no external assets, no
 * runtime JavaScript. Page breaks are handled via `@media print` so the
 * preview in the app reads as a continuous scrollable document while the
 * printed/PDF output is properly paginated.
 *
 * The renderer is split into small per-section helpers so the on-screen
 * preview can render the same body fragment without the surrounding
 * `<html>` chrome.
 */

import type {
  HomeBookData, HomeBookSectionId, HomeBookEquipmentEntry,
} from './homeBook'
import { HOME_BOOK_SECTIONS, sectionHasData } from './homeBook'
import type { ServiceRecord, MaintenanceTask, CapitalItem } from '../types'
import type { InsurancePolicy } from '../types/insurance'
import { POLICY_TYPE_LABELS } from '../types/insurance'
import type { Permit } from '../types/permits'
import { PERMIT_TYPE_LABELS, PERMIT_STATUS_LABELS } from '../types/permits'
import type { GeneratorRecord } from '../types/generator'
import type { RoadEvent } from '../types/road'
import { ROAD_MAINTENANCE_TYPES } from '../types/road'
import type {
  Mortgage, WellTest, SepticEvent, FuelDelivery,
  TaxAssessment, TaxPayment, UtilityAccount, UtilityBill,
} from '../schemas'
import { UTILITY_LABELS } from './utilityStore'
import type { Inspection } from './inspectionStore'
import type { PropertyRiskBrief } from './riskBriefStore'

// ─── Formatting helpers ──────────────────────────────────────────────────────

function escapeHtml(s: string | undefined | null): string {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—'
  // Treat YYYY-MM-DD as a calendar date (no time-zone shift).
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) {
    const [, y, mo, d] = m
    const date = new Date(Number(y), Number(mo) - 1, Number(d))
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

function fmtDateLong(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

function fmtCurrency(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function fmtCurrencyExact(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

function fmtNumber(n: number | undefined | null, unit?: string): string {
  if (n == null || Number.isNaN(n)) return '—'
  const formatted = n.toLocaleString()
  return unit ? `${formatted} ${unit}` : formatted
}

function dash(s: string | undefined | null): string {
  const t = (s ?? '').toString().trim()
  return t.length > 0 ? escapeHtml(t) : '<span class="hb-dash">—</span>'
}

// ─── Section renderers (HTML fragments) ──────────────────────────────────────

function renderOverview(data: HomeBookData): string {
  const p = data.property
  const fields: Array<[string, string]> = [
    ['Address',   p.address],
    ['Type',      p.type === 'residence' ? 'Residence' : p.type === 'camp' ? 'Camp / Cabin' : 'Land'],
    ['Year built', p.yearBuilt ? String(p.yearBuilt) : '—'],
    ['Acreage',   p.acreage != null ? `${p.acreage} acres` : '—'],
    ['Coordinates', p.latitude != null && p.longitude != null
      ? `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}` : '—'],
  ]
  return `
    <table class="hb-keyval">
      <tbody>
        ${fields.map(([k, v]) => `
          <tr><th scope="row">${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>
        `).join('')}
      </tbody>
    </table>
  `
}

function renderNarrative(data: HomeBookData): string {
  if (!data.narrative.trim()) return emptyNote('No owner narrative recorded.')
  const blocks: string[] = []
  let qBuf: string | null = null
  for (const raw of data.narrative.split('\n')) {
    const line = raw.trim()
    if (!line) {
      if (qBuf) { blocks.push(`<p>${escapeHtml(qBuf)}</p>`); qBuf = null }
      continue
    }
    if (line.startsWith('Q:')) {
      if (qBuf) blocks.push(`<p>${escapeHtml(qBuf)}</p>`)
      qBuf = null
      blocks.push(`<h4 class="hb-q">${escapeHtml(line.slice(2).trim())}</h4>`)
    } else if (line.startsWith('A:')) {
      qBuf = line.slice(2).trim()
    } else if (line.startsWith('PROPERTY NARRATIVE')) {
      // skip — we have our own heading
    } else {
      qBuf = qBuf ? `${qBuf} ${line}` : line
    }
  }
  if (qBuf) blocks.push(`<p>${escapeHtml(qBuf)}</p>`)
  return blocks.join('')
}

function renderEquipment(data: HomeBookData): string {
  if (data.equipment.length === 0) return emptyNote('No equipment documented.')
  return data.equipment.map(renderEquipmentEntry).join('')
}

function renderEquipmentEntry(eq: HomeBookEquipmentEntry): string {
  const fields: Array<[string, string]> = [
    ['Brand',           eq.brand ?? '—'],
    ['Model',           eq.model ?? '—'],
    ['Serial number',   eq.serialNumber ?? '—'],
    ['Location',        eq.location ?? '—'],
    ['Installed',       eq.installYear ? String(eq.installYear) : '—'],
    ['Age',             eq.age != null ? `${eq.age} year${eq.age === 1 ? '' : 's'}` : '—'],
    ['Last serviced',   fmtDate(eq.lastServiceDate)],
    ['Category',        eq.category?.label ?? eq.categoryId ?? '—'],
  ]
  const services = eq.serviceRecords
  return `
    <div class="hb-equipment">
      <h3 class="hb-equipment-title">${escapeHtml(eq.label)}</h3>
      <table class="hb-spec">
        <tbody>
          ${fields.map(([k, v]) => `
            <tr><th scope="row">${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>
          `).join('')}
        </tbody>
      </table>
      ${services.length === 0 ? '' : `
        <h4 class="hb-subhead">Service Log</h4>
        ${renderServiceTable(services.slice(0, 10))}
      `}
    </div>
  `
}

function renderServiceTable(rows: ServiceRecord[]): string {
  if (rows.length === 0) return emptyNote('No service records on file.')
  return `
    <table class="hb-table">
      <thead>
        <tr>
          <th>Date</th><th>System</th><th>Work</th><th>Contractor</th><th class="hb-num">Cost</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${escapeHtml(fmtDate(r.date))}</td>
            <td>${dash(r.systemLabel)}</td>
            <td>${dash(r.workDescription)}</td>
            <td>${dash(r.contractor)}</td>
            <td class="hb-num">${escapeHtml(fmtCurrency(r.totalCost))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

function renderMaintenance(data: HomeBookData): string {
  const completed = renderServiceTable(data.maintenance)
  const upcoming = data.upcomingTasks.length === 0
    ? ''
    : `
      <h4 class="hb-subhead">Upcoming &amp; Open Tasks</h4>
      ${renderTaskTable(data.upcomingTasks)}
    `
  return `
    <h4 class="hb-subhead">Completed Service (Last 2 Years)</h4>
    ${completed}
    ${upcoming}
  `
}

function renderTaskTable(rows: MaintenanceTask[]): string {
  if (rows.length === 0) return emptyNote('No open tasks.')
  return `
    <table class="hb-table">
      <thead>
        <tr>
          <th>Due</th><th>Task</th><th>System</th><th>Status</th><th>Priority</th><th class="hb-num">Est. Cost</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(t => `
          <tr>
            <td>${escapeHtml(fmtDate(t.dueDate))}</td>
            <td>${dash(t.title)}</td>
            <td>${dash(t.systemLabel)}</td>
            <td>${escapeHtml(t.status)}</td>
            <td>${escapeHtml(t.priority)}</td>
            <td class="hb-num">${escapeHtml(fmtCurrency(t.estimatedCost))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

function renderInspections(data: HomeBookData): string {
  if (data.inspections.length === 0) return emptyNote('No condition assessments on record.')
  return data.inspections.slice(0, 30).map((i: Inspection) => {
    const sev = i.userOverrideSeverity ?? i.aiAssessment?.severity
    const sevLabel = i.aiAssessment?.severityLabel ?? (sev != null ? `Severity ${sev}` : '—')
    const findings = i.aiAssessment?.findings ?? []
    const action   = i.aiAssessment?.recommendedAction ?? ''
    const urgency  = i.aiAssessment?.urgency ?? ''
    return `
      <div class="hb-inspection">
        <div class="hb-inspection-head">
          <span class="hb-inspection-date">${escapeHtml(fmtDate(i.inspectedAt))}</span>
          <span class="hb-inspection-sev sev-${sev ?? 'na'}">${escapeHtml(sevLabel)}</span>
        </div>
        ${i.inspectedBy ? `<p class="hb-meta">Inspected by ${escapeHtml(i.inspectedBy)}</p>` : ''}
        ${i.aiAssessment?.summary ? `<p>${escapeHtml(i.aiAssessment.summary)}</p>` : ''}
        ${findings.length > 0 ? `
          <ul class="hb-findings">
            ${findings.map(f => `<li>${escapeHtml(f)}</li>`).join('')}
          </ul>
        ` : ''}
        ${action ? `<p><strong>Recommended action:</strong> ${escapeHtml(action)}${urgency ? ` <em>(${escapeHtml(urgency)})</em>` : ''}</p>` : ''}
      </div>
    `
  }).join('')
}

function renderCapital(data: HomeBookData): string {
  if (data.capital.length === 0) return emptyNote('No capital projects logged.')
  const sorted = [...data.capital].sort((a, b) => {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
    const diff = (order[a.priority] ?? 9) - (order[b.priority] ?? 9)
    return diff !== 0 ? diff : a.estimatedYear - b.estimatedYear
  })
  return `
    <table class="hb-table">
      <thead>
        <tr>
          <th>Project</th><th>Priority</th><th>Year</th><th class="hb-num">Cost (Low–High)</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map((c: CapitalItem) => `
          <tr>
            <td>${dash(c.title)}</td>
            <td>${escapeHtml(c.priority)}</td>
            <td>${c.estimatedYear}</td>
            <td class="hb-num">${escapeHtml(fmtCurrency(c.costLow))} – ${escapeHtml(fmtCurrency(c.costHigh))}</td>
            <td>${escapeHtml(c.status ?? 'planned')}${c.percentComplete ? ` (${c.percentComplete}%)` : ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

function renderWellTests(data: HomeBookData): string {
  if (data.wellTests.length === 0) return emptyNote('No well water tests on record.')
  return data.wellTests.slice(0, 12).map((w: WellTest) => `
    <div class="hb-welltest">
      <div class="hb-inspection-head">
        <span class="hb-inspection-date">${escapeHtml(fmtDate(w.date))}</span>
        <span class="hb-inspection-sev sev-${w.overallResult}">${escapeHtml(w.overallResult.toUpperCase())}</span>
      </div>
      <p class="hb-meta">${escapeHtml(w.lab ?? 'Lab unknown')}${w.technician ? ` — ${escapeHtml(w.technician)}` : ''}</p>
      ${w.parameters.length > 0 ? `
        <table class="hb-table">
          <thead><tr><th>Parameter</th><th>Result</th><th>Unit</th><th>Status</th></tr></thead>
          <tbody>
            ${w.parameters.map(p => `
              <tr>
                <td>${escapeHtml(p.name)}</td>
                <td>${escapeHtml(p.value)}</td>
                <td>${escapeHtml(p.unit)}</td>
                <td class="param-${p.passFail}">${escapeHtml(p.passFail)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}
      ${w.notes ? `<p class="hb-notes">${escapeHtml(w.notes)}</p>` : ''}
    </div>
  `).join('')
}

function renderSeptic(data: HomeBookData): string {
  if (data.septic.length === 0) return emptyNote('No septic events on record.')
  return `
    <table class="hb-table">
      <thead>
        <tr>
          <th>Date</th><th>Vendor / Tech</th><th class="hb-num">Gallons</th><th class="hb-num">Cost</th><th>Notes</th>
        </tr>
      </thead>
      <tbody>
        ${data.septic.map((s: SepticEvent) => `
          <tr>
            <td>${escapeHtml(fmtDate(s.date))}</td>
            <td>${dash(s.technician)}</td>
            <td class="hb-num">${escapeHtml(fmtNumber(s.gallonsPumped))}</td>
            <td class="hb-num">${escapeHtml(fmtCurrency(s.cost))}</td>
            <td>${dash(s.conditionNotes ?? s.techNotes)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

function renderInsurance(data: HomeBookData): string {
  if (data.insurance.length === 0) return emptyNote('No insurance policies on record.')
  return data.insurance.map((p: InsurancePolicy) => {
    const cov = p.coverageAmounts
    const covRows: Array<[string, number | undefined]> = [
      ['Dwelling',           cov.dwelling],
      ['Other structures',   cov.otherStructures],
      ['Personal property',  cov.personalProperty],
      ['Liability',          cov.liability],
      ['Medical payments',   cov.medicalPayments],
      ['Deductible',         cov.deductible],
    ]
    return `
      <div class="hb-policy">
        <div class="hb-policy-head">
          <h3>${escapeHtml(POLICY_TYPE_LABELS[p.type] ?? p.type)}</h3>
          <span class="hb-status status-${p.status}">${escapeHtml(p.status)}</span>
        </div>
        <table class="hb-keyval">
          <tbody>
            <tr><th scope="row">Insurer</th><td>${escapeHtml(p.insurer)}</td></tr>
            <tr><th scope="row">Policy #</th><td>${escapeHtml(p.policyNumber)}</td></tr>
            <tr><th scope="row">Effective</th><td>${escapeHtml(fmtDate(p.effectiveDate))}</td></tr>
            <tr><th scope="row">Renewal</th><td>${escapeHtml(fmtDate(p.renewalDate))}</td></tr>
            ${p.annualPremium != null ? `<tr><th scope="row">Annual premium</th><td>${escapeHtml(fmtCurrencyExact(p.annualPremium))}</td></tr>` : ''}
            ${p.agent ? `<tr><th scope="row">Agent</th><td>${escapeHtml(p.agent.name)}${p.agent.agency ? ` (${escapeHtml(p.agent.agency)})` : ''} — ${escapeHtml(p.agent.phone)}</td></tr>` : ''}
          </tbody>
        </table>
        ${covRows.some(([, v]) => v != null) ? `
          <h4 class="hb-subhead">Coverage</h4>
          <table class="hb-keyval">
            <tbody>
              ${covRows.filter(([, v]) => v != null).map(([k, v]) => `
                <tr><th scope="row">${escapeHtml(k)}</th><td>${escapeHtml(fmtCurrencyExact(v))}</td></tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}
        ${p.notes ? `<p class="hb-notes">${escapeHtml(p.notes)}</p>` : ''}
      </div>
    `
  }).join('')
}

function renderPermits(data: HomeBookData): string {
  if (data.permits.length === 0) return emptyNote('No permits on record.')
  return `
    <table class="hb-table">
      <thead>
        <tr>
          <th>Type</th><th>Permit #</th><th>Issuer</th><th>Issued</th><th>Expires</th><th>Status</th><th class="hb-num">Cost</th>
        </tr>
      </thead>
      <tbody>
        ${data.permits.map((p: Permit) => `
          <tr>
            <td>${escapeHtml(PERMIT_TYPE_LABELS[p.type] ?? p.type)}</td>
            <td>${escapeHtml(p.permitNumber)}</td>
            <td>${escapeHtml(p.issuer)}</td>
            <td>${escapeHtml(fmtDate(p.issuedDate))}</td>
            <td>${escapeHtml(fmtDate(p.expiryDate))}</td>
            <td>${escapeHtml(PERMIT_STATUS_LABELS[p.status] ?? p.status)}</td>
            <td class="hb-num">${escapeHtml(fmtCurrency(p.cost))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

function renderMortgages(data: HomeBookData): string {
  if (data.mortgages.length === 0) return emptyNote('No mortgages on record.')
  return data.mortgages.map((m: Mortgage) => `
    <div class="hb-mortgage">
      <h3 class="hb-equipment-title">${escapeHtml(m.label)} — ${escapeHtml(m.lender)}</h3>
      <table class="hb-keyval">
        <tbody>
          ${m.accountNumber ? `<tr><th scope="row">Account #</th><td>${escapeHtml(m.accountNumber)}</td></tr>` : ''}
          <tr><th scope="row">Original balance</th><td>${escapeHtml(fmtCurrencyExact(m.originalBalance))}</td></tr>
          <tr><th scope="row">Current balance</th><td>${escapeHtml(fmtCurrencyExact(m.currentBalance))}</td></tr>
          <tr><th scope="row">Interest rate</th><td>${escapeHtml(String(m.interestRate))}%</td></tr>
          <tr><th scope="row">Term</th><td>${m.termMonths} months</td></tr>
          <tr><th scope="row">Start date</th><td>${escapeHtml(fmtDate(m.startDate))}</td></tr>
          <tr><th scope="row">Monthly payment</th><td>${escapeHtml(fmtCurrencyExact(m.monthlyPayment))}</td></tr>
          ${m.escrowAmount ? `<tr><th scope="row">Escrow</th><td>${escapeHtml(fmtCurrencyExact(m.escrowAmount))}</td></tr>` : ''}
        </tbody>
      </table>
      ${m.notes ? `<p class="hb-notes">${escapeHtml(m.notes)}</p>` : ''}
    </div>
  `).join('')
}

function renderTax(data: HomeBookData): string {
  const assessments = data.taxAssessments
  const payments    = data.taxPayments
  if (assessments.length === 0 && payments.length === 0) return emptyNote('No property tax records on file.')
  return `
    ${assessments.length > 0 ? `
      <h4 class="hb-subhead">Assessments</h4>
      <table class="hb-table">
        <thead><tr>
          <th>Year</th><th class="hb-num">Land</th><th class="hb-num">Improvement</th><th class="hb-num">Total Assessed</th><th class="hb-num">Market Value</th>
        </tr></thead>
        <tbody>
          ${assessments.map((a: TaxAssessment) => `
            <tr>
              <td>${a.year}</td>
              <td class="hb-num">${escapeHtml(fmtCurrency(a.assessedLand))}</td>
              <td class="hb-num">${escapeHtml(fmtCurrency(a.assessedImprovement))}</td>
              <td class="hb-num">${escapeHtml(fmtCurrency(a.totalAssessed))}</td>
              <td class="hb-num">${escapeHtml(fmtCurrency(a.marketValue))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : ''}
    ${payments.length > 0 ? `
      <h4 class="hb-subhead">Payments</h4>
      <table class="hb-table">
        <thead><tr>
          <th>Year</th><th>Installment</th><th>Due</th><th>Paid</th><th class="hb-num">Amount</th><th class="hb-num">Penalty</th>
        </tr></thead>
        <tbody>
          ${payments.map((p: TaxPayment) => `
            <tr>
              <td>${p.year}</td>
              <td>#${p.installment}</td>
              <td>${escapeHtml(fmtDate(p.dueDate))}</td>
              <td>${escapeHtml(fmtDate(p.paidDate))}</td>
              <td class="hb-num">${escapeHtml(fmtCurrencyExact(p.amount))}</td>
              <td class="hb-num">${escapeHtml(fmtCurrency(p.penalty))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : ''}
  `
}

function renderUtilities(data: HomeBookData): string {
  const accounts = data.utilityAccounts
  const bills    = data.utilityBills.slice(0, 24)
  if (accounts.length === 0 && bills.length === 0) return emptyNote('No utility accounts on record.')
  return `
    ${accounts.length > 0 ? `
      <h4 class="hb-subhead">Accounts</h4>
      <table class="hb-table">
        <thead><tr><th>Type</th><th>Provider</th><th>Account #</th><th>Notes</th></tr></thead>
        <tbody>
          ${accounts.map((a: UtilityAccount) => `
            <tr>
              <td>${escapeHtml(UTILITY_LABELS[a.type] ?? a.type)}</td>
              <td>${escapeHtml(a.provider)}</td>
              <td>${dash(a.accountNumber)}</td>
              <td>${dash(a.notes)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : ''}
    ${bills.length > 0 ? `
      <h4 class="hb-subhead">Recent Bills</h4>
      <table class="hb-table">
        <thead><tr>
          <th>Period</th><th class="hb-num">Consumption</th><th class="hb-num">Rate</th><th class="hb-num">Total</th>
        </tr></thead>
        <tbody>
          ${bills.map((b: UtilityBill) => `
            <tr>
              <td>${escapeHtml(fmtDate(b.periodStart))} – ${escapeHtml(fmtDate(b.periodEnd))}</td>
              <td class="hb-num">${escapeHtml(fmtNumber(b.consumption, b.unit))}</td>
              <td class="hb-num">${escapeHtml(fmtCurrencyExact(b.ratePerUnit))}</td>
              <td class="hb-num">${escapeHtml(fmtCurrencyExact(b.totalCost))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : ''}
  `
}

function renderFuel(data: HomeBookData): string {
  if (data.fuelDeliveries.length === 0) return emptyNote('No fuel deliveries on record.')
  return `
    <table class="hb-table">
      <thead><tr>
        <th>Date</th><th>Fuel</th><th class="hb-num">Gallons</th><th class="hb-num">Price / gal</th><th class="hb-num">Total</th>
      </tr></thead>
      <tbody>
        ${data.fuelDeliveries.slice(0, 24).map((d: FuelDelivery) => `
          <tr>
            <td>${escapeHtml(fmtDate(d.date))}</td>
            <td>${escapeHtml(d.fuelType)}</td>
            <td class="hb-num">${escapeHtml(fmtNumber(d.gallons))}</td>
            <td class="hb-num">${escapeHtml(fmtCurrencyExact(d.pricePerGallon))}</td>
            <td class="hb-num">${escapeHtml(fmtCurrencyExact(d.totalCost))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

function renderGenerators(data: HomeBookData): string {
  if (data.generators.length === 0) return emptyNote('No generators on record.')
  return data.generators.map((g: GeneratorRecord) => `
    <div class="hb-generator">
      <h3 class="hb-equipment-title">${escapeHtml(g.name)}${g.model ? ` — ${escapeHtml(g.model)}` : ''}</h3>
      <table class="hb-keyval">
        <tbody>
          ${g.installedYear ? `<tr><th scope="row">Installed</th><td>${g.installedYear}</td></tr>` : ''}
          <tr><th scope="row">Cumulative hours</th><td>${escapeHtml(fmtNumber(g.cumulativeHours))}</td></tr>
          <tr><th scope="row">Hours since last service</th><td>${escapeHtml(fmtNumber(g.cumulativeHours - g.lastServiceHours))}</td></tr>
        </tbody>
      </table>
      ${g.entries.length > 0 ? `
        <h4 class="hb-subhead">Runtime Log (last 10 entries)</h4>
        <table class="hb-table">
          <thead><tr><th>Date</th><th class="hb-num">Hours</th><th>Reason</th></tr></thead>
          <tbody>
            ${[...g.entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10).map(e => `
              <tr>
                <td>${escapeHtml(fmtDate(e.date))}</td>
                <td class="hb-num">${escapeHtml(fmtNumber(e.hours))}</td>
                <td>${dash(e.reason)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}
      ${g.notes ? `<p class="hb-notes">${escapeHtml(g.notes)}</p>` : ''}
    </div>
  `).join('')
}

function renderRoad(data: HomeBookData): string {
  if (data.roadEvents.length === 0) return emptyNote('No road / access events on record.')
  const typeLabel = (id: string) => ROAD_MAINTENANCE_TYPES.find(t => t.id === id)?.label ?? id
  return `
    <table class="hb-table">
      <thead><tr>
        <th>Date</th><th>Type</th><th>Vendor</th><th>Area</th><th class="hb-num">Quantity</th><th class="hb-num">Cost</th>
      </tr></thead>
      <tbody>
        ${data.roadEvents.map((r: RoadEvent) => `
          <tr>
            <td>${escapeHtml(fmtDate(r.date))}</td>
            <td>${escapeHtml(typeLabel(r.maintenanceTypeId))}</td>
            <td>${dash(r.vendor)}</td>
            <td>${dash(r.areaDescription)}</td>
            <td class="hb-num">${r.quantity != null ? escapeHtml(fmtNumber(r.quantity, r.unit)) : '—'}</td>
            <td class="hb-num">${escapeHtml(fmtCurrency(r.cost))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

function renderRisk(data: HomeBookData): string {
  const brief: PropertyRiskBrief | undefined = data.riskBrief
  if (!brief || brief.risks.length === 0) return emptyNote('No risk brief generated for this property.')
  const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  const sorted = [...brief.risks].sort((a, b) => (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9))
  return `
    <p class="hb-meta">Generated ${escapeHtml(fmtDate(brief.generatedAt))} using ${escapeHtml(brief.modelUsed)}.</p>
    ${sorted.map(r => `
      <div class="hb-risk">
        <div class="hb-policy-head">
          <h3>${escapeHtml(r.title)}</h3>
          <span class="hb-status status-${r.severity}">${escapeHtml(r.severity)}</span>
        </div>
        <p>${escapeHtml(r.reasoning)}</p>
        <p><strong>Recommended action:</strong> ${escapeHtml(r.recommendedAction)}</p>
        ${r.estimatedCostLow != null || r.estimatedCostHigh != null ? `
          <p class="hb-meta">Estimated cost: ${escapeHtml(fmtCurrency(r.estimatedCostLow))} – ${escapeHtml(fmtCurrency(r.estimatedCostHigh))}</p>
        ` : ''}
      </div>
    `).join('')}
  `
}

function emptyNote(msg: string): string {
  return `<p class="hb-empty">${escapeHtml(msg)}</p>`
}

// ─── Section dispatch ────────────────────────────────────────────────────────

function renderSectionBody(id: HomeBookSectionId, data: HomeBookData): string {
  switch (id) {
    case 'overview':    return renderOverview(data)
    case 'narrative':   return renderNarrative(data)
    case 'equipment':   return renderEquipment(data)
    case 'maintenance': return renderMaintenance(data)
    case 'inspections': return renderInspections(data)
    case 'capital':     return renderCapital(data)
    case 'wellTests':   return renderWellTests(data)
    case 'septic':      return renderSeptic(data)
    case 'insurance':   return renderInsurance(data)
    case 'permits':     return renderPermits(data)
    case 'mortgages':   return renderMortgages(data)
    case 'tax':         return renderTax(data)
    case 'utilities':   return renderUtilities(data)
    case 'fuel':        return renderFuel(data)
    case 'generators':  return renderGenerators(data)
    case 'road':        return renderRoad(data)
    case 'risk':        return renderRisk(data)
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface HomeBookRenderOptions {
  /** Section IDs the user wants to include (filtered against `sectionHasData`). */
  sections?: ReadonlyArray<HomeBookSectionId>
  /** When true, sections that have no data are rendered with an "—" placeholder. */
  showEmpty?: boolean
}

interface ResolvedSection {
  id:    HomeBookSectionId
  title: string
  body:  string
}

function resolveSections(data: HomeBookData, opts: HomeBookRenderOptions): ResolvedSection[] {
  const requested = new Set<HomeBookSectionId>(
    opts.sections ?? HOME_BOOK_SECTIONS.map(s => s.id),
  )
  return HOME_BOOK_SECTIONS
    .filter(s => requested.has(s.id))
    .filter(s => opts.showEmpty || sectionHasData(data, s.id))
    .map(s => ({
      id:    s.id,
      title: s.title,
      body:  renderSectionBody(s.id, data),
    }))
}

/** Body fragment — used by the in-app preview (no `<html>` chrome). */
export function renderHomeBookBody(data: HomeBookData, opts: HomeBookRenderOptions = {}): string {
  const sections = resolveSections(data, opts)
  return `
    <article class="hb-doc">
      ${renderCover(data)}
      ${renderToc(sections)}
      ${sections.map(renderSection).join('')}
    </article>
  `
}

function renderCover(data: HomeBookData): string {
  return `
    <section class="hb-cover">
      <p class="hb-eyebrow">Property Record</p>
      <h1 class="hb-title">The Home Book</h1>
      <h2 class="hb-subtitle">${escapeHtml(data.property.name)}</h2>
      <p class="hb-address">${escapeHtml(data.property.address)}</p>
      <div class="hb-cover-meta">
        <div><span class="hb-meta-label">Generated</span><span class="hb-meta-value">${escapeHtml(fmtDateLong(data.generatedAt))}</span></div>
        <div><span class="hb-meta-label">Prepared by</span><span class="hb-meta-value">${escapeHtml(data.preparedBy)}</span></div>
      </div>
    </section>
  `
}

function renderToc(sections: ResolvedSection[]): string {
  if (sections.length === 0) return ''
  return `
    <section class="hb-toc">
      <h2 class="hb-section-title">Contents</h2>
      <ol class="hb-toc-list">
        ${sections.map(s => `<li><a href="#hb-${s.id}">${escapeHtml(s.title)}</a></li>`).join('')}
      </ol>
    </section>
  `
}

function renderSection(s: ResolvedSection): string {
  return `
    <section class="hb-section" id="hb-${s.id}">
      <h2 class="hb-section-title">${escapeHtml(s.title)}</h2>
      ${s.body}
    </section>
  `
}

/** Inline stylesheet — same in preview and printed output for fidelity. */
export const HOME_BOOK_STYLES = `
  :root {
    --hb-brand:        #16a34a;
    --hb-brand-dark:   #15803d;
    --hb-ink:          #0f172a;
    --hb-ink-soft:     #475569;
    --hb-ink-faint:    #94a3b8;
    --hb-rule:         #e2e8f0;
    --hb-rule-soft:    #f1f5f9;
    --hb-bg:           #ffffff;
    --hb-bg-cover:     #f8fafc;
    --hb-table-stripe: #f8fafc;
  }
  .hb-doc {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue",
                 Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
    color: var(--hb-ink);
    background: var(--hb-bg);
    font-size: 11pt;
    line-height: 1.45;
    max-width: 7.5in;
    margin: 0 auto;
    padding: 0.5in 0.6in 0.6in;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .hb-doc h1, .hb-doc h2, .hb-doc h3, .hb-doc h4 {
    color: var(--hb-ink);
    font-weight: 600;
    margin: 0;
    line-height: 1.25;
  }
  .hb-doc p { margin: 0 0 0.5em; }
  .hb-doc a { color: var(--hb-brand-dark); text-decoration: none; }

  /* Cover */
  .hb-cover {
    min-height: 9in;
    padding: 1.5in 0 0;
    border-bottom: 1px solid var(--hb-rule);
    margin-bottom: 0.4in;
  }
  .hb-eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 9pt;
    color: var(--hb-brand);
    font-weight: 700;
    margin: 0 0 0.5em;
  }
  .hb-title {
    font-size: 38pt;
    letter-spacing: -0.02em;
    margin: 0 0 0.25em;
    color: var(--hb-ink);
  }
  .hb-subtitle {
    font-size: 18pt;
    font-weight: 600;
    color: var(--hb-ink);
    margin: 0 0 0.15em;
  }
  .hb-address {
    font-size: 11pt;
    color: var(--hb-ink-soft);
    margin: 0 0 1.2in;
  }
  .hb-cover-meta {
    display: flex;
    gap: 0.6in;
    border-top: 4px solid var(--hb-brand);
    padding-top: 0.25in;
  }
  .hb-cover-meta > div { display: flex; flex-direction: column; gap: 2px; }
  .hb-meta-label {
    font-size: 8pt;
    color: var(--hb-ink-faint);
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
  .hb-meta-value { font-size: 11pt; color: var(--hb-ink); font-weight: 500; }

  /* TOC */
  .hb-toc { margin: 0 0 0.4in; }
  .hb-toc-list {
    columns: 2;
    column-gap: 0.4in;
    padding-left: 1.2em;
    margin: 0.2em 0 0;
  }
  .hb-toc-list li { margin-bottom: 0.3em; break-inside: avoid; }

  /* Section */
  .hb-section { margin: 0 0 0.35in; }
  .hb-doc .hb-section-title {
    font-size: 16pt;
    color: var(--hb-brand);
    border-bottom: 2px solid var(--hb-brand);
    padding-bottom: 0.2em;
    margin: 0 0 0.6em;
  }
  .hb-doc .hb-subhead {
    font-size: 11pt;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--hb-ink-soft);
    margin: 1em 0 0.4em;
  }
  .hb-doc .hb-equipment-title,
  .hb-doc .hb-policy-head h3 {
    font-size: 13pt;
    color: var(--hb-ink);
  }

  /* Tables */
  .hb-table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 0.6em;
    font-size: 10pt;
  }
  .hb-table th, .hb-table td {
    text-align: left;
    padding: 5px 8px;
    border-bottom: 1px solid var(--hb-rule);
    vertical-align: top;
  }
  .hb-table th {
    background: var(--hb-rule-soft);
    color: var(--hb-ink-soft);
    font-weight: 600;
    text-transform: uppercase;
    font-size: 8.5pt;
    letter-spacing: 0.05em;
  }
  .hb-table tbody tr:nth-child(even) { background: var(--hb-table-stripe); }
  .hb-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }

  .hb-keyval {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 0.6em;
    font-size: 10pt;
  }
  .hb-keyval th, .hb-keyval td {
    padding: 4px 8px;
    border-bottom: 1px solid var(--hb-rule-soft);
    text-align: left;
    vertical-align: top;
  }
  .hb-keyval th {
    width: 35%;
    color: var(--hb-ink-soft);
    font-weight: 500;
    background: transparent;
  }

  .hb-equipment, .hb-policy, .hb-mortgage, .hb-generator, .hb-inspection, .hb-welltest, .hb-risk {
    margin: 0 0 0.4in;
    padding-bottom: 0.15in;
  }
  .hb-equipment-title { margin: 0 0 0.4em; }
  .hb-policy-head, .hb-inspection-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1em;
    margin: 0 0 0.4em;
  }
  .hb-inspection-date { font-weight: 600; font-size: 11pt; }

  .hb-status, .hb-inspection-sev {
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--hb-rule-soft);
    color: var(--hb-ink-soft);
  }
  .status-active   { background: #dcfce7; color: #166534; }
  .status-expired  { background: #fee2e2; color: #b91c1c; }
  .status-pending  { background: #fef9c3; color: #854d0e; }
  .status-cancelled{ background: #f1f5f9; color: #475569; }
  .status-critical { background: #fee2e2; color: #b91c1c; }
  .status-high     { background: #fed7aa; color: #c2410c; }
  .status-medium   { background: #fef9c3; color: #854d0e; }
  .status-low      { background: #dcfce7; color: #166534; }

  .sev-1, .sev-pass     { background: #dcfce7; color: #166534; }
  .sev-2, .sev-advisory { background: #fef9c3; color: #854d0e; }
  .sev-3                { background: #fed7aa; color: #c2410c; }
  .sev-4, .sev-fail     { background: #fee2e2; color: #b91c1c; }
  .sev-5                { background: #fecaca; color: #991b1b; }
  .sev-na               { background: var(--hb-rule-soft); color: var(--hb-ink-soft); }

  .param-pass     { color: #166534; font-weight: 600; }
  .param-fail     { color: #b91c1c; font-weight: 600; }
  .param-advisory { color: #854d0e; font-weight: 600; }

  .hb-q { font-size: 10pt; color: var(--hb-ink-soft); margin: 0.6em 0 0.2em; font-weight: 600; }
  .hb-empty { color: var(--hb-ink-faint); font-style: italic; font-size: 10pt; }
  .hb-meta  { color: var(--hb-ink-soft); font-size: 10pt; margin: 0 0 0.4em; }
  .hb-notes { color: var(--hb-ink-soft); font-size: 10pt; margin: 0.4em 0 0; font-style: italic; }
  .hb-dash  { color: var(--hb-ink-faint); }
  .hb-findings { margin: 0.4em 0; padding-left: 1.2em; }
  .hb-findings li { margin-bottom: 0.2em; }

  /* Print: page breaks + suppress chrome */
  @media print {
    @page { size: Letter; margin: 0.6in 0.6in; }
    .hb-doc { padding: 0; max-width: none; }
    .hb-section, .hb-cover, .hb-toc { break-inside: auto; }
    .hb-cover { page-break-after: always; min-height: auto; }
    .hb-toc { page-break-after: always; }
    .hb-section { page-break-before: always; }
    .hb-section:first-of-type { page-break-before: avoid; }
    .hb-table, .hb-keyval { break-inside: auto; }
    .hb-table tr, .hb-keyval tr { break-inside: avoid; }
    .hb-equipment, .hb-policy, .hb-mortgage, .hb-generator,
    .hb-inspection, .hb-welltest, .hb-risk { break-inside: avoid-page; }
    .hb-section-title { break-after: avoid; }
    .hb-subhead { break-after: avoid; }
    a { color: inherit; }
  }
`

/** Full standalone HTML document — used for `Download HTML` and `Share to Drive`. */
export function renderHomeBookHtml(data: HomeBookData, opts: HomeBookRenderOptions = {}): string {
  const title = `Home Book — ${data.property.name}`
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  body { margin: 0; background: #f1f5f9; }
  ${HOME_BOOK_STYLES}
  @media screen {
    body { padding: 1.5rem 0; }
    .hb-doc { box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08), 0 12px 30px rgba(15, 23, 42, 0.06); background: #fff; }
  }
</style>
</head>
<body>
${renderHomeBookBody(data, opts)}
</body>
</html>`
}

/** Build a download-friendly file name for the property + date. */
export function homeBookFilename(data: HomeBookData, ext: 'html' | 'pdf' = 'html'): string {
  const date = data.generatedAt.slice(0, 10)
  const safe = data.property.shortName
    ? data.property.shortName.replace(/[^a-zA-Z0-9]+/g, '_')
    : data.property.name.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40)
  return `Home Book - ${safe} - ${date}.${ext}`
}
