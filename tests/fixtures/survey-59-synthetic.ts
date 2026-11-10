import { readFileSync } from 'node:fs'
import type referenceType from './survey-59-read-reference.json'
const reference: typeof referenceType = JSON.parse(readFileSync(new URL('./survey-59-read-reference.json', import.meta.url), 'utf8'))

type Row = Record<string, unknown>
export const survey59Fields = reference.fields.map(f => ({ ...f.row, state: 1, extId: 'e', tenantId: 't' }))
export const completeConditions = reference.fields.filter(f => f.evidence.conditionStatus === 'COMPLETE_WIRE_CONDITION_PROVIDER_NOT_READ')
export const survey59Paths: string[][] = []
for (const field of completeConditions) {
  const alternatives = ((field.row as Row).exts as Row | undefined)?.showValue
  if (Array.isArray(alternatives)) for (const value of alternatives) {
    if (Array.isArray(value) && !survey59Paths.some(path => JSON.stringify(path) === JSON.stringify(value))) survey59Paths.push([...value])
  }
}
/** Entirely synthetic values; reference metadata does not establish options,
 * calculation rules, effective write permission or production equivalence. */
export function survey59Record(part: unknown = ['1', '130']): Row {
  const data: Row = { _id: 'saved', tenantId: 't', sid: 's', nodeId: 'n', workflowId: 'w',
    extId: 'e', formDefId: 'e', state: 1, smodule: 'serviceAppointment' }
  const exts: Row = { audit: { synthetic: true } }
  for (const source of reference.fields) {
    const field = source.row as Row, key = String(field.name)
    if (['gap', 'aLink', 'data'].includes(String(field.type))) continue
    const value = field.type === 'file' ? [{ url: `https://synthetic.invalid/${key}.png`, name: `synthetic-${key}`, extname: 'png' }]
      : field.type === 'digit' ? 12.5 : field.type === 'phone' ? '00000000000'
        : field.type === 'datetime' ? '2026-11-09 10:20:00' : field.type === 'area' ? ['synthetic-area'] : `synthetic-${key}`
    ;(field.preset === 0 ? exts : data)[key] = value
  }
  data.part = part; data.squareMeter = 18.75; data.planeArea = 20.25; exts.isMoldRemoved = '0'
  return { ...data, exts }
}
export function expectedSurvey59VisibleIds(part: unknown): string[] {
  return reference.fields.filter(source => {
    const field = source.row as Row
    if (!(field.showList as unknown[]).map(String).includes('4') || ['gap', 'image', 'title'].includes(String(field.type))) return false
    // This fixture has the verified double-row binding; trigger is interaction-only.
    if (field.name === 'leakageCauseSelect') return false
    if (source.evidence.conditionStatus === 'COMPLETE_WIRE_CONDITION_PROVIDER_NOT_READ') {
      const alternatives = (field.exts as Row).showValue as unknown[]
      return alternatives.some(value => JSON.stringify(value) === JSON.stringify(part))
    }
    return true
  }).map(f => f.row._id)
}
