/**
 * Generic record form — renders any RecordDefinition's fields.
 *
 * Walks `resolveFields(def, value)` (which merges the base fields with any
 * matching variant plugin, e.g. an equipment subsystem) and emits the
 * Phase A form primitive classes (`.form-field`, `.form-label`).
 *
 * Fields with `kind: 'custom' | 'array' | 'reference' | 'photo'` are
 * handed to the consumer via `renderCustom` — the escape hatch for
 * anything the default renderer doesn't cover.
 *
 * Field values are read/written through the definition's `valuePath`
 * hook so polymorphic records (e.g. equipment records that store
 * per-category fields under `record.values`) bind correctly.
 */

import type { ReactNode } from 'react'
import type { AnyRecordDefinition, FieldDef } from '../records/_framework'
import {
  visibleIn, resolveOptions, resolveFields, readFieldValue, writeFieldValue,
} from '../records/_framework'

type RecordValue = Record<string, unknown>

interface RecordFormProps<T extends RecordValue> {
  def:      AnyRecordDefinition
  value:    T
  onChange: (next: T) => void
  /** Optional renderer for `kind: 'custom' | 'array' | 'reference' | 'photo'` fields. */
  renderCustom?: (field: FieldDef, value: unknown, onFieldChange: (v: unknown) => void) => ReactNode
  /** Optional className for the outer container. */
  className?: string
}

const inputCls = 'input-surface rounded-lg px-3 py-2 w-full'

export function RecordForm<T extends RecordValue>({
  def,
  value,
  onChange,
  renderCustom,
  className,
}: RecordFormProps<T>) {
  const fields = resolveFields(def, value).filter(f => visibleIn(f, 'form'))

  function setField(id: string, next: unknown): void {
    onChange(writeFieldValue(def, value, id, next))
  }

  return (
    <div className={className ?? 'form-grid'}>
      {fields.map(field => (
        <div key={field.id} className="form-field">
          <label className={`form-label ${field.required ? 'form-label-required' : ''}`} htmlFor={`field-${def.type}-${field.id}`}>
            {field.label}
            {field.unit ? <span className="text-subtle font-normal"> ({field.unit})</span> : null}
          </label>
          {renderFieldControl(def.type, field, readFieldValue(def, value, field.id), v => setField(field.id, v), renderCustom)}
          {field.helpText ? <div className="form-help">{field.helpText}</div> : null}
        </div>
      ))}
    </div>
  )
}

function renderFieldControl(
  typeKey: string,
  field: FieldDef,
  value: unknown,
  onChange: (v: unknown) => void,
  renderCustom?: RecordFormProps<RecordValue>['renderCustom'],
): ReactNode {
  const id = `field-${typeKey}-${field.id}`
  const common = { id, name: field.id, placeholder: field.placeholder, className: inputCls }

  switch (field.kind) {
    case 'text':
      return <input type="text"  {...common} value={(value as string | undefined) ?? ''} onChange={e => onChange(e.target.value)} />

    case 'textarea':
      return <textarea {...common} rows={3} value={(value as string | undefined) ?? ''} onChange={e => onChange(e.target.value)} />

    case 'number':
    case 'currency': {
      const asNum = value == null || value === '' ? '' : String(value)
      return (
        <input
          type="number"
          {...common}
          value={asNum}
          onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      )
    }

    case 'date':
      return <input type="date" {...common} value={(value as string | undefined) ?? ''} onChange={e => onChange(e.target.value || undefined)} />

    case 'boolean':
      return (
        <input
          id={id}
          name={field.id}
          type="checkbox"
          className="h-4 w-4"
          checked={Boolean(value)}
          onChange={e => onChange(e.target.checked)}
        />
      )

    case 'select': {
      const opts = resolveOptions(field)
      return (
        <select {...common} value={(value as string | undefined) ?? ''} onChange={e => onChange(e.target.value || undefined)}>
          <option value="">—</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    }

    case 'array':
    case 'reference':
    case 'photo':
    case 'custom':
      if (renderCustom) return renderCustom(field, value, onChange)
      return <div className="form-help italic">{`<${field.kind} field — render via renderCustom prop>`}</div>
  }
}
