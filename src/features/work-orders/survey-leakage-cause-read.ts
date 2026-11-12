import { shallowRef, watchEffect, type InjectionKey } from 'vue'
import type { FormDataRead, SurveyLeakageCauseProviderPort, SurveyLeakageCauseRow } from '@shared/ports'
import type { R1NodeFormsReader, R1NodeFormsSnapshot } from './r1-node-forms-read'
import { actionFormConditionValues } from './action-form-condition-context'
import { projectR1RecordReadFields } from './r1-record-read-fields'
import { surveyLeakageCauseExperienceFor, surveyLeakageCauseFieldStateFor, surveyLeakageCauseReadIds,
  surveyLeakageCauseLabels, surveyLeakageCauseGroups, surveyLeakageCauseCurrentPart,
  surveyLeakageCausePartLabelsFor, type SurveyLeakageCauseTreeOption } from './survey-leakage-cause'

export interface SurveyLeakageCauseReadView {
  readonly fieldId: string
  readonly label: string
  readonly required: boolean
  readonly visible: true
  readonly selectedIds: readonly string[]
  readonly selectedLabels: readonly string[]
  readonly groups: readonly SurveyLeakageCauseTreeOption[]
  readonly currentPart?: string
  readonly providerState: 'loading' | 'succeeded' | 'failed_retryable' | 'failed_terminal'
  readonly hint: string
  readonly emptyLabel: string
}
export const surveyLeakageCauseReadKey: InjectionKey<{
  readonly provider: SurveyLeakageCauseProviderPort; readonly tenantId: string
}> = Symbol('normal-survey-cause-read')

interface Source {
  readonly snapshot: R1NodeFormsSnapshot
  readonly actorScope: string
  readonly workOrderId: string
  readonly nodeId: string
}
/** Label-only adapter consumed by the existing normal host. No draft, writer,
 * grant or schema engine; use the existing domain binding and read projection. */
export function createNormalSurveyCauseRead(input: {
  readonly reader: R1NodeFormsReader
  readonly provider: SurveyLeakageCauseProviderPort
  readonly tenantId: string
  readonly source: () => Source | null
}) {
  type Binding = { source: Source; seal: string; identity: { isSameActor(): boolean }; epoch: number; tenantId: string }
  const state = shallowRef<{ status: SurveyLeakageCauseReadView['providerState']; rows: readonly SurveyLeakageCauseRow[] }>({ status: 'loading', rows: [] })
  const revoked = new WeakSet<R1NodeFormsSnapshot>()
  let active: Binding | null = null, epoch = 0, disposed = false
  function live(binding: Binding): boolean {
    try {
      const s = input.source(), old = binding.source
      const valid = !disposed && active === binding && binding.epoch === epoch && input.tenantId === binding.tenantId && !revoked.has(old.snapshot)
        && s?.snapshot === old.snapshot && s.actorScope === old.actorScope && s.workOrderId === old.workOrderId && s.nodeId === old.nodeId
        && input.reader.isCurrent(old.snapshot) && binding.identity.isSameActor()
        && JSON.stringify(old.snapshot) === binding.seal
      if (!valid) revoked.add(old.snapshot)
      return valid
    } catch { revoked.add(binding.source.snapshot); return false }
  }
  function recordBinding(snapshot: R1NodeFormsSnapshot, record: FormDataRead) {
    if (!snapshot.records.includes(record) || record.definitionId !== snapshot.definition.id) return null
    const fields = snapshot.definition.fields ?? []
    const experience = surveyLeakageCauseExperienceFor({ purpose: snapshot.definition.purpose, fields })
    // The captured pair is a root preset binding. Other storage protocols do
    // not inherit it merely from the same field names or mapped array shape.
    if (!experience || experience.triggerField.preset !== true || experience.valueField.preset !== true) return null
    const original = input.reader.currentFormOriginal?.(snapshot, String(record.id))
    if (!original || original.tenantId !== input.tenantId || original._id !== record.id) return null
    const key = experience.valueField.valueKey, ext = original.exts
    if (ext != null && (typeof ext !== 'object' || Array.isArray(ext))) return null
    if (ext && Object.hasOwn(ext, key)) return null
    const values = record.values ?? {}, own = Object.hasOwn(original, key)
    if (own !== Object.hasOwn(values, key) || JSON.stringify(original[key]) !== JSON.stringify(values[key])) return null
    const selected = values[key], ids = selected == null ? [] : surveyLeakageCauseReadIds(selected)
    if (!ids) return null
    const form = { purpose: snapshot.definition.purpose, fields, definitionId: snapshot.definition.id, dataId: record.id,
      values: actionFormConditionValues({ definitionId: snapshot.definition.id, dataId: record.id, values }),
      workflowReadOnlyFieldIds: snapshot.node.formFieldIdsReadOnly }
    const effective = surveyLeakageCauseFieldStateFor(form, experience.valueField)
    const projected = projectR1RecordReadFields(snapshot.definition, record).find(field => field.fieldId === experience.valueField.fieldId)
    if (!effective?.visible || effective.capability === 'UNSUPPORTED' || !projected || projected.unavailable) return null
    return { experience, form, ids, projected }
  }
  const stop = watchEffect(() => {
    let source: Source | null = null
    try { source = input.source() } catch { /* A lost host is not an experience source. */ }
    if (active && source?.snapshot === active.source.snapshot && source.actorScope === active.source.actorScope
      && source.workOrderId === active.source.workOrderId && source.nodeId === active.source.nodeId && live(active)) return
    if (active) revoked.add(active.source.snapshot)
    active = null; epoch++
    state.value = { status: 'loading', rows: [] }
    if (disposed || !source || !source.actorScope || !input.tenantId || revoked.has(source.snapshot)) return
    const snapshot = source.snapshot
    if (snapshot.workOrderId !== source.workOrderId || String(snapshot.node.id) !== source.nodeId || !input.reader.isCurrent(snapshot)) {
      revoked.add(snapshot); return
    }
    const identity = input.reader.retainReadIdentity?.(snapshot)
    if (!identity || !snapshot.records.some(record => recordBinding(snapshot, record))) return
    const binding: Binding = { source, identity, seal: JSON.stringify(snapshot), epoch, tenantId: input.tenantId }
    active = binding
    void input.provider.query().then(result => {
      if (!live(binding)) return
      state.value = result.state === 'succeeded' && result.data
        ? { status: 'succeeded', rows: result.data }
        : { status: result.state === 'failed_retryable' ? 'failed_retryable' : 'failed_terminal', rows: [] }
    }).catch(() => { if (live(binding)) state.value = { status: 'failed_retryable', rows: [] } })
  }, { flush: 'sync' })
  return {
    forRecord(snapshot: R1NodeFormsSnapshot, record: FormDataRead): SurveyLeakageCauseReadView | null {
      const binding = active
      if (!binding || binding.source.snapshot !== snapshot || !live(binding)) return null
      const match = recordBinding(snapshot, record)
      if (!match) return null
      const current = state.value
      // Ambiguous provider IDs remain unresolved rather than acquiring the
      // last label from a Map. This does not change the legacy editing codec.
      const rows = current.rows.filter(row => typeof row.id === 'string' && row.id.trim() === row.id && row.id.length > 0
        && typeof row.label === 'string' && row.label.trim().length > 0 && typeof row.part === 'string'
        && current.rows.filter(other => other.id === row.id).length === 1)
      const currentPart = surveyLeakageCauseCurrentPart(match.form.values.part)
      if (!live(binding)) return null
      return Object.freeze({ fieldId: match.experience.valueField.fieldId, label: match.experience.valueField.label,
        required: false, visible: true, selectedIds: Object.freeze([...match.ids]),
        selectedLabels: Object.freeze([...surveyLeakageCauseLabels(match.ids, rows)]),
        groups: surveyLeakageCauseGroups(rows, currentPart, surveyLeakageCausePartLabelsFor(match.form)), currentPart,
        providerState: current.status, emptyLabel: match.projected.text,
        hint: current.status === 'loading' ? '正在核对已保存选择' : current.status === 'succeeded' ? '仅查看已保存的选择' : '选项暂时无法核实，保留已保存标识' })
    },
    dispose() { disposed = true; epoch++; if (active) revoked.add(active.source.snapshot); active = null; stop() },
  }
}
