import type { WorkflowNodeRead } from '@shared/ports'

// Fixed R1 serviceAppointment.vue, 6c0a97b, lines 2512–2563. Node names
// and the separate survey FormDef never establish appointment provenance.
export function appointmentArchiveNodes(nodes: readonly WorkflowNodeRead[] = []): readonly WorkflowNodeRead[] {
  return nodes.filter(node => node.formPurpose === 'appointment' && Boolean(node.formDefinitionId)
    && node.nodeTypeEvidence === 'runtime_node_def' && ['forms','repeat'].includes(node.sourceNodeType ?? ''))
}
export function appointmentArchiveRoute(workOrderId: string, nodeId: string, recordId?: string): string {
  return `/pages/work-orders/detail?id=${encodeURIComponent(workOrderId)}&read=appointment&node=${encodeURIComponent(nodeId)}${recordId ? `&record=${encodeURIComponent(recordId)}` : ''}`
}
