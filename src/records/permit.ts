import { z } from 'zod'
import type { RecordDefinition } from './_framework'

export const PermitZ = z.object({
  id:             z.string(),
  propertyId:     z.string(),
  type:           z.enum(['building', 'electrical', 'plumbing', 'septic', 'well', 'zoning', 'inspection', 'certificate', 'other']),
  status:         z.enum(['open', 'approved', 'expired', 'rejected', 'pending_inspection']),
  permitNumber:   z.string(),
  description:    z.string(),
  issuedDate:     z.string().optional(),
  expiryDate:     z.string().optional(),
  inspectionDate: z.string().optional(),
  issuer:         z.string(),
  contractor:     z.string().optional(),
  cost:           z.number().optional(),
  driveFileId:    z.string().optional(),
  notes:          z.string().optional(),
})

export type PermitRecord = z.infer<typeof PermitZ>

export const permitDef: RecordDefinition<typeof PermitZ> = {
  type: 'permit',
  label: 'Permit',
  pluralLabel: 'Permits',
  folderName: 'Permits',
  allowMultiple: true,
  schema: PermitZ,
  version: 1,
  title: (p) => `Permit: ${p.type}${p.permitNumber ? ' #' + p.permitNumber : ''}`,
  summary: (p) => `${p.status}${p.expiryDate ? ' · expires ' + p.expiryDate : ''}`,
  filename: (p) => {
    const safe = p.type.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)
    return `permit_${safe}_${p.id.slice(0, 8)}.md`
  },
  fields: [
    { id: 'type',           label: 'Type',         kind: 'select', required: true,
      options: ['building', 'electrical', 'plumbing', 'septic', 'well', 'zoning', 'inspection', 'certificate', 'other'] },
    { id: 'status',         label: 'Status',       kind: 'select', required: true,
      options: ['open', 'approved', 'expired', 'rejected', 'pending_inspection'] },
    { id: 'permitNumber',   label: 'Permit #',     kind: 'text', required: true },
    { id: 'description',    label: 'Description',  kind: 'textarea', required: true },
    { id: 'issuer',         label: 'Issuer',       kind: 'text', required: true },
    { id: 'issuedDate',     label: 'Issued',       kind: 'date' },
    { id: 'expiryDate',     label: 'Expires',      kind: 'date' },
    { id: 'inspectionDate', label: 'Inspection',   kind: 'date' },
    { id: 'contractor',     label: 'Contractor',   kind: 'text' },
    { id: 'cost',           label: 'Cost',         kind: 'currency' },
    { id: 'notes',          label: 'Notes',        kind: 'textarea' },
    { id: 'propertyId',     label: 'Property',     kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
    { id: 'driveFileId',    label: 'Drive File',   kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
  ],
  ai: {
    toolName: 'get_permits',
    description: 'Building/electrical/plumbing/zoning permits with status and expiry.',
    searchable: ['type', 'permitNumber', 'description', 'issuer', 'contractor', 'notes'],
  },
}
