import type { WorkOrderSummary } from '@shared/ports'
export type WorkKind = 'all' | 'survey' | 'construction' | 'acceptance'
export const workKindLabels: Record<WorkKind, string> = { all: '全部工单', survey: '勘查作业', construction: '施工记录', acceptance: '验收记录' }
/** Discovery only, never action authorization. Details retain the workflow/record permission checks. */
export function matchesWorkKind(item: WorkOrderSummary, kind: WorkKind): boolean {
  if (kind === 'all') return true
  const labels = [item.taskLabel, ...(item.workflowNodes ?? []).map(node => node.displayName)].filter(Boolean).join(' ')
  if (kind === 'survey') return (item.workflowNodes ?? []).some(node => node.lifecycle === 'active'
    && (node.formPurpose === 'survey' || /勘察|勘查/.test(node.displayName ?? ''))) || /勘察|勘查/.test(item.taskLabel ?? '')
  if (kind === 'construction') return /施工|验收/.test(labels)
  return /验收/.test(labels)
}
