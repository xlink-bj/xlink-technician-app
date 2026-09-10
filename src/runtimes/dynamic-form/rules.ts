import { isCompatibilityEntryActive } from '@shared/config'

import type { AreaMeasurementRule, AreaRuleResult } from './types'

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || value.trim().length === 0) return undefined
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) ? parsed : undefined
}

export function applyAreaMeasurementRule(
  values: Readonly<Record<string, unknown>>,
  rule: AreaMeasurementRule,
): AreaRuleResult {
  if (!isCompatibilityEntryActive(rule.entry)) return { applied: false, values }
  const length = numberValue(values[rule.lengthField])
  const width = numberValue(values[rule.widthField])
  const area = length === undefined || width === undefined ? '' : Math.round(length * width * 100) / 100
  return { applied: true, values: { ...values, [rule.areaField]: area } }
}
