import type { FormDataRead, FormDefinitionRead, FormFieldRead } from '../ports'
import type { R1FileCreateStorage } from './r1-file-create-storage'
import { isR1NormalImageWireArray } from './r1-normal-image-contract'

type State = 'absent' | 'files' | 'null' | 'unavailable'
const reads = new WeakMap<object, { definition: FormDefinitionRead; seal: string; current: () => boolean; fields: ReadonlyMap<string, { key: string; state: State }> }>()
const revoked = new WeakSet<object>()
const seal = (definition: FormDefinitionRead, record: FormDataRead) => JSON.stringify([definition, record])

/** Display provenance only, after the reader validated raw canonical slots.
 * No command/grant code consumes this evidence. Copies cannot acquire it. */
export function bindR1ConfiguredFileReadDisplay(definition: FormDefinitionRead, record: FormDataRead,
  storage: R1FileCreateStorage, original: Readonly<Record<string, unknown>>, current: () => boolean, legacy = false): void {
  if (reads.has(record) || revoked.has(record)) throw Error('Read display evidence cannot be rebound')
  const ext = original.exts as Readonly<Record<string, unknown>> | undefined
  const fields = new Map<string, { key: string; state: State }>()
  for (const f of storage.fields.filter(f => f.type === 'file')) {
    if (!definition.fields?.some(row => row.fieldId === f.fieldId && row.valueKey === f.valueKey && row.type === 'file')) throw Error('Read display schema differs from storage')
    const present = f.slots.some(slot => Object.hasOwn(slot === 'root' ? original : ext ?? {}, f.valueKey))
    const value = record.values?.[f.valueKey]
    if (!legacy && (present ? !isR1NormalImageWireArray(value) : Object.hasOwn(record.values ?? {}, f.valueKey))) throw Error('Read display differs from original slots')
    let state: State = present ? 'files' : 'absent'
    if (legacy) {
      const rootOwn = Object.hasOwn(original, f.valueKey), extOwn = Object.hasOwn(ext ?? {}, f.valueKey)
      const root = original[f.valueKey], extension = ext?.[f.valueKey]
      // Legacy codecs validated their values; do not promote conflicting slots
      // or historical extra-key arrays to a current preview contract.
      const slotsAgree = (!rootOwn || f.slots.includes('root')) && (!extOwn || f.slots.includes('exts'))
        && (f.slots.length !== 2 || rootOwn === extOwn && JSON.stringify(root) === JSON.stringify(extension))
      state = !slotsAgree ? 'unavailable' : !present ? 'absent' : value === null ? 'null'
        : isR1NormalImageWireArray(value) ? 'files' : 'unavailable'
    }
    fields.set(f.fieldId, { key: f.valueKey, state })
  }
  reads.set(record, { definition, seal: seal(definition, record), current, fields })
}

export function r1ConfiguredFileReadDisplay(definition: FormDefinitionRead, record: FormDataRead, field: FormFieldRead): State | null {
  const proof = reads.get(record)
  if (!proof || revoked.has(record)) return null
  try {
    if (!proof.current() || proof.seal !== seal(proof.definition, record)) {
      revoked.add(record)
      return null
    }
    const entry = proof.fields.get(field.fieldId)
    return proof.definition === definition && entry?.key === field.valueKey ? entry.state : null
  } catch { revoked.add(record); return null }
}
