/**
 * Pure picker behavior: form identity, persistence, provider and dependency
 * evaluation are deliberately outside this UI helper. The caller passes
 * complete, verified groups; a default group must never filter the list.
 */
export interface GroupedChoiceGroup {
  readonly value: string
  readonly label: string
  readonly children: readonly { readonly value: string; readonly label: string }[]
}
export function countGroupedChoices(
  groups: readonly GroupedChoiceGroup[], groupValue: string, selected: readonly string[],
): number {
  const group = groups.find(item => item.value === groupValue)
  const chosen = new Set(selected)
  return group?.children.filter(item => chosen.has(item.value)).length ?? 0
}
export function toggleGroupedChoice(
  groups: readonly GroupedChoiceGroup[], selected: readonly string[], value: string,
): readonly string[] {
  const ordered = groups.flatMap(group => group.children.map(option => option.value))
  // A stale / forged ID must never be added to a field value.
  if (!ordered.includes(value)) return [...selected]
  const next = new Set(selected)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return ordered.filter(option => next.has(option))
}
