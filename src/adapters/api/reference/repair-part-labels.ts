/**
 * Bounded synthetic labels used by the review fixtures.
 * Live repair-part cascade resolution remains an explicit backend dictionary concern.
 */
const syntheticRepairPartLabels: Readonly<Record<string, string>> = {
  'repair-part-code-001': '屋面',
}

export function repairPartLabelForCode(code: string): string | undefined {
  return syntheticRepairPartLabels[code]
}
