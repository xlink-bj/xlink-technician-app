import type { InjectionKey } from 'vue'
import type { R1NodeFormsSnapshot } from './r1-node-forms-read'
import type { R1RepeatPageActions } from './r1-repeat-actions-port'
import type { R1LocalFieldValue } from './r1-local-form-fields'
import { projectR1RepeatFields } from './r1-repeat-form'
import { normalizeFieldValue } from '@runtimes/dynamic-form'

export type R1NormalDraftValues = Readonly<Record<string, R1LocalFieldValue>>
export type R1NormalDraftRead =
  | { readonly state: 'empty' }
  | { readonly state: 'recoverable'; readonly values: R1NormalDraftValues }
  | { readonly state: 'blocked' | 'uncertain' | 'failed'; readonly message: string }
export interface R1NormalDraftSession {
  read(): Promise<R1NormalDraftRead>
  save(values: Readonly<Record<string, unknown>>): Promise<void>
  markUncertain(values: Readonly<Record<string, unknown>>): Promise<void>
  discard(): Promise<void>
  complete(): Promise<void>
}
export interface R1NormalDraftProvider {
  open(snapshot: R1NodeFormsSnapshot, actions: R1RepeatPageActions | null): R1NormalDraftSession | null
}
export const r1NormalFormDraftsKey: InjectionKey<R1NormalDraftProvider> = Symbol('r1-normal-form-drafts')
const scalarTypes = new Set(['text','textarea','phone','IDNumber','number','digit','date','time','datetime','switch','rate'])
const choiceTypes = new Set(['select','radio','checkbox','cascade','bizSelect'])
const unsafe = new Set(['__proto__','prototype','constructor'])

/** Only values already accepted by the fresh normal field projection; never
 * attachments, capability objects, provider state or pending commands. This
 * validates partial drafts without requiring a complete submission. */
export function r1NormalDraftValues(snapshot: R1NodeFormsSnapshot, actions: R1RepeatPageActions,
  input: Readonly<Record<string, unknown>>, restoring = false): R1NormalDraftValues {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > 50) throw Error('草稿字段无法核实。')
  const projected = actions.projectFields?.(input) ?? projectR1RepeatFields(snapshot,input)
  if (!projected) throw Error('当前表单尚不支持安全恢复。')
  const omitted = restoring ? [] : actions.draftOmittedFieldIds?.(snapshot,input) ?? []
  const out: Record<string, R1LocalFieldValue> = Object.create(null)
  for (const [key,value] of Object.entries(input)) {
    if (unsafe.has(key)) throw Error('草稿字段无法核实。')
    const sources = snapshot.definition.fields?.filter(f => f.valueKey === key)
    if (sources?.length !== 1) throw Error('草稿字段身份不唯一。')
    const source = sources[0]!
    if (source.type === 'file' && !restoring) continue
    // Only the current controller can identify a legal wire-clear sentinel.
    // The generic recovery layer still checks identity, permission and stability.
    const hiddenClear = !restoring && value === '' && omitted.includes(source.fieldId)
      && projected.some(field => field.fieldId === source.fieldId && field.valueKey === key && !field.visible)
    const fields = projected.filter(f => f.valueKey === key && !f.readOnly
      && ((f.supported && f.visible) || (hiddenClear && !f.visible)))
    if (fields.length !== 1 || source.readOnly || snapshot.node.formFieldIdsReadOnly?.includes(source.fieldId)
      || !snapshot.fillableFieldIds?.includes(source.fieldId)
      || (!scalarTypes.has(source.type) && !choiceTypes.has(source.type))) throw Error('草稿字段权限或配置已变化。')
    if (typeof value !== 'string' && typeof value !== 'boolean' && !(typeof value === 'number' && Number.isFinite(value))
      && !(Array.isArray(value) && value.length <= 50 && value.every(v => typeof v === 'string'))) throw Error('草稿字段值无法核实。')
    // Empty optional input, false and zero are genuine draft values, not absence.
    if (value !== '' && !(Array.isArray(value) && value.length === 0)) {
      const checked = normalizeFieldValue(source.type, value, fields[0]!.options, fields[0]!.multiple)
      if (!checked.ok) throw Error('草稿字段类型或选项已变化。')
    }
    // Keep the live controller's wire sentinel out of durable recovery data.
    if (hiddenClear) continue
    out[key] = Array.isArray(value) ? [...value] : value as R1LocalFieldValue
  }
  const reprojection = actions.projectFields?.(out) ?? projectR1RepeatFields(snapshot,out)
  const state = (f: typeof projected[number]) => [f.visible,f.readOnly,f.required,f.supported,f.type,f.multiple,f.options]
  if (projected.some(field => {
    const next = reprojection.filter(f => f.fieldId === field.fieldId && f.valueKey === field.valueKey)
    return next.length !== 1 || JSON.stringify(state(field)) !== JSON.stringify(state(next[0]!))
  })) throw Error('草稿投影已变化，不能安全保存。')
  // Revalidate through the existing current capability's local transition. It
  // can reject a revoked plan/ambiguous condition; it never issues a command.
  if (actions.updateCreateDraft) for (const [key,value] of Object.entries(out)) {
    const checked = actions.updateCreateDraft(out, key, value)
    if (JSON.stringify(checked) !== JSON.stringify(out)) throw Error('草稿条件已变化，不能直接恢复。')
  }
  return out
}
