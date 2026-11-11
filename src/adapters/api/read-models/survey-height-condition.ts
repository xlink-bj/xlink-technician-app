import { decodeR1ScopedJson } from '../r1-scoped-json'

/** Reject contradictions before the general mapper selects a visibility slot.
 * This is the narrow canonical typed Survey height contract, not a generic
 * interpretation of unknown R1 configuration or the original 59-field form. */
export function surveyHeightConditionIssue(record: Readonly<Record<string, unknown>>): string | undefined {
  if (record.extId !== '7971040108398070730' || record.colName !== 'survey' || record.name !== 'height') return undefined
  const object = (v: unknown): Record<string, unknown> | undefined =>
    v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined
  let config = object(record.frontEndConfig)
  if (typeof record.frontEndConfig === 'string' && record.frontEndConfig.trim()) {
    try { config = object(decodeR1ScopedJson(record.frontEndConfig)) } catch { return 'Survey height condition configuration is malformed' }
  }
  const rootExts = object(record.exts), configExts = object(config?.exts)
  if (record.exts !== undefined && record.exts !== null && !rootExts) return 'Survey height condition extensions are malformed'
  const present = (v: unknown) => v !== undefined && v !== null && v !== ''
  const conflict = (values: readonly unknown[]) => new Set(values.filter(present).map(v => JSON.stringify(v))).size > 1
  if (conflict([record.showField, config?.showField])
    || conflict([record.showValue, rootExts?.showValue, config?.showValue, configExts?.showValue])
    || conflict([record.showType, config?.showType])
    || (config?.exts !== undefined && config.exts !== null && !configExts)) return 'Survey height condition slots conflict'
  const emptyCalculation = (v: unknown) => {
    if (!present(v)) return true
    try { const parsed=typeof v === 'string' ? decodeR1ScopedJson(v) : v; const o=object(parsed); return Boolean(o && Object.keys(o).length===0) } catch { return false }
  }
  if (!emptyCalculation(record.calculateConfig) || !emptyCalculation(config?.calculateConfig)) return 'Survey height calculation configuration is unverified'
  return undefined
}
