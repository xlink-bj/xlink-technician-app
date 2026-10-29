/**
 * R1 source node type is distinct from the UI's normalized category.
 *
 * ServiceAppointment R1 source:
 * - forms: saves/updateExts formList, then special workflow/process with blank IDs
 * - repeat: aggregates multiple persisted FormData IDs for workflow/process
 * - subflow/subflows: executes against a child runtime Workflow node
 *
 * A06-B does NOT implement these server contracts. The single-FormData
 * command encoder MUST fail closed instead of silently using one record ID.
 */
const specialNodeTypes = new Set(['forms', 'repeat', 'subflow', 'subflows', 'subworkflow'])

export function requiresR1SpecialWorkflowWire(sourceNodeType: string | undefined): boolean {
  return typeof sourceNodeType === 'string' && specialNodeTypes.has(sourceNodeType)
}
