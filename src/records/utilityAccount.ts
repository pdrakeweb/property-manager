import { z } from 'zod'
import type { RecordDefinition } from './_framework'

export const UtilityAccountZ = z.object({
  id:            z.string(),
  propertyId:    z.string(),
  type:          z.enum(['electric', 'gas', 'water', 'sewer', 'trash', 'internet', 'phone', 'other']),
  provider:      z.string(),
  accountNumber: z.string().optional(),
  notes:         z.string().optional(),
})

export type UtilityAccountRecord = z.infer<typeof UtilityAccountZ>

export const utilityAccountDef: RecordDefinition<typeof UtilityAccountZ> = {
  type: 'utility_account',
  label: 'Utility Account',
  pluralLabel: 'Utility Accounts',
  folderName: 'Utilities',
  allowMultiple: true,
  schema: UtilityAccountZ,
  version: 1,
  title: (a) => `Utility: ${a.provider}`,
  summary: (a) => a.type,
  filename: (a) => {
    const safe = a.provider.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)
    return `utility_acct_${safe}_${a.id.slice(0, 8)}.md`
  },
  fields: [
    { id: 'type',          label: 'Type',       kind: 'select', required: true,
      options: ['electric', 'gas', 'water', 'sewer', 'trash', 'internet', 'phone', 'other'] },
    { id: 'provider',      label: 'Provider',   kind: 'text', required: true },
    { id: 'accountNumber', label: 'Account #',  kind: 'text' },
    { id: 'notes',         label: 'Notes',      kind: 'textarea' },
    { id: 'propertyId',    label: 'Property',   kind: 'custom',
      showIn: { form: false, markdown: false, docs: false, ai: false } },
  ],
  ai: {
    toolName: 'get_utility_accounts',
    description: 'Utility providers linked to the property (electric, gas, water, internet, etc.).',
    searchable: ['provider', 'type', 'notes'],
  },
}
