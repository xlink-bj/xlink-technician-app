import type {
  WorkflowDefinitionRead,
  WorkflowHandlerIdentity,
  WorkflowNodeCategory,
  WorkflowNodeLifecycle,
  WorkflowNodeRead,
  WorkflowNodeVisibilityEvidence,
} from '@shared/ports'
import type { RoleId, WorkflowDefinitionId } from '@shared/types'
import { asOpaqueId } from '@shared/types'
import { AdapterMappingError } from '../../common/operations'
import {
  asRecord,
  assertMatchingWireIdentity,
  consistentWireIdentity,
  nestedRecord,
  optionalRecord,
  optionalString,
  type AdapterRecord,
} from '../../common/records'
import { appointmentFormDefinitionWireId } from '../appointment-contract'
import { readR1NodeFormList } from '../r1-node-form-list'
import { verifiedFormPurpose } from './form'
import { requiredOpaqueId, optionalOpaqueId } from './ids'

// Workflow runtime identity and visibility are mapped here, never inferred in UI.

/** R1 workflow read handlers return `data: []`; earlier mock/read paths may
 * return a nested `data.items`. Both require an explicit array, never an
 * inferred empty collection when the envelope is malformed. */
export function workflowResponseRows(raw: unknown, label: string): readonly unknown[] {
  const envelope = asRecord(raw, label)
  const data = envelope.data
  const rows = Array.isArray(data)
    ? data
    : optionalRecord(data)?.items ?? envelope.items
  if (!Array.isArray(rows)) throw new AdapterMappingError(`${label} items are missing`)
  return rows
}

export function assertUniqueRuntimeNodeIds(nodes: readonly WorkflowNodeRead[], label: string): void {
  const ids = new Set<string>()
  for (const node of nodes) {
    if (ids.has(String(node.id))) throw new AdapterMappingError(`${label} contains duplicate runtime node identities`)
    ids.add(String(node.id))
  }
}

export function workflowDefinition(raw: unknown, requestedId: WorkflowDefinitionId): WorkflowDefinitionRead {
  const envelope = asRecord(raw, 'workflow definition response')
  const entity = nestedRecord(envelope, ['entity', 'data'])
  // The requested URL is authoritative, but contradictory source identities
  // must fail instead of being masked by a successful HTTP response.
  assertMatchingWireIdentity(
    entity ?? envelope, ['id', '_id', 'defId'], String(requestedId), 'Workflow definition',
  )
  const id = entity
    ? optionalOpaqueId<'WorkflowDefinitionId'>(entity, ['id', '_id', 'defId'])
    : optionalOpaqueId<'WorkflowDefinitionId'>(envelope, ['id', '_id', 'defId'])
  return { id: id ?? requestedId }
}

function workflowNodeCategory(nodeDef: AdapterRecord | undefined): WorkflowNodeCategory {
  const nodeType = optionalString(nodeDef ?? {}, ['nodeType', 'nodeTypeOld'])
  switch (nodeType) {
    case 'forms':
      return 'forms'
    case 'repeat':
      return 'repeat'
    case 'subflows':
    case 'subflow':
    case 'subworkflow':
      return 'subworkflow'
    case 'placeOrder':
      return 'placeOrder'
    case 'user':
      return 'user'
    case 'accept':
      return 'accept'
    case 'allot':
      return 'allot'
    case 'dispatch':
      return 'dispatch'
    case 'system':
      return 'system'
    case 'sentinel':
      return 'sentinel'
    default:
      return 'unsupported'
  }
}

function workflowNodeLifecycle(record: AdapterRecord): WorkflowNodeLifecycle {
  if (record.state === 0) return 'active'
  if (record.state === 10) return 'closed'
  if (record.state === -1) return 'inactive'
  return 'unknown'
}

function workflowNodeHandlers(record: AdapterRecord): readonly WorkflowHandlerIdentity[] | undefined {
  if (!Array.isArray(record.handlerIds)) return undefined

  const handlers: WorkflowHandlerIdentity[] = []
  for (const rawValue of record.handlerIds) {
    if (typeof rawValue !== 'string' && typeof rawValue !== 'number') continue
    const value = String(rawValue).trim()
    if (!value) continue

    const separator = value.indexOf('+')
    if (separator > 0 && separator < value.length - 1 && value.indexOf('+', separator + 1) === -1) {
      handlers.push({
        kind: 'organizationRole',
        organizationId: asOpaqueId<'OrganizationId'>(value.slice(0, separator)),
        roleId: asOpaqueId<'RoleId'>(value.slice(separator + 1)),
      })
      continue
    }

    // R1 proves bare handlerIds membership checks against user, role, and
    // org-role identities, but does not provide a wire discriminator.
    handlers.push({ kind: 'unclassified', value })
  }

  return handlers.length > 0 ? handlers : undefined
}

function workflowNodeRoleIds(
  nodeDef: AdapterRecord | undefined,
  key: 'userChoose' | 'viewableRoleIds',
): { readonly present: boolean; readonly valid: boolean; readonly ids: readonly RoleId[] } {
  const rawValue = nodeDef?.[key]
  if (rawValue === undefined) return { present: false, valid: true, ids: [] }
  if (!Array.isArray(rawValue)) return { present: true, valid: false, ids: [] }

  const ids: RoleId[] = []
  let valid = true
  for (const rawId of rawValue) {
    if (typeof rawId !== 'string' && typeof rawId !== 'number') {
      valid = false
      continue
    }
    const value = String(rawId).trim()
    if (!value) {
      valid = false
      continue
    }
    ids.push(asOpaqueId<'RoleId'>(value))
  }
  return { present: true, valid, ids }
}

function workflowNodeHandlersAreValid(record: AdapterRecord): boolean {
  const rawValue = record.handlerIds
  if (rawValue === undefined) return true
  if (!Array.isArray(rawValue)) return false
  return rawValue.every((value) => {
    if (typeof value !== 'string' && typeof value !== 'number') return false
    return String(value).trim().length > 0
  })
}

function workflowNodeVisibilityEvidence(
  record: AdapterRecord,
  nodeDef: AdapterRecord | undefined,
): WorkflowNodeVisibilityEvidence {
  const selectableRoleIds = workflowNodeRoleIds(nodeDef, 'userChoose')
  const viewableRoleIds = workflowNodeRoleIds(nodeDef, 'viewableRoleIds')
  const handlerIdsPresent = record.handlerIds !== undefined
  const hasEvidence = selectableRoleIds.present || viewableRoleIds.present || handlerIdsPresent
  const structurallyValid =
    selectableRoleIds.valid && viewableRoleIds.valid && workflowNodeHandlersAreValid(record)

  return {
    evidenceState: !structurallyValid ? 'unknown' : hasEvidence ? 'verified' : 'missing',
    ...(selectableRoleIds.present ? { selectableRoleIds: selectableRoleIds.ids } : {}),
    ...(viewableRoleIds.present ? { viewableRoleIds: viewableRoleIds.ids } : {}),
  }
}


function workflowNodeReadOnlyFieldIds(record: AdapterRecord, nodeDef: AdapterRecord | undefined): readonly string[] | undefined {
  const rawValue = record.formFieldIdsReadOnly ?? nodeDef?.formFieldIdsReadOnly
  if (!Array.isArray(rawValue)) return undefined
  const ids = rawValue
    .map((value) => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '')
    .filter(Boolean)
  return ids.length > 0 ? ids : []
}

export function workflowNode(raw: unknown, scope: 'default' | 'child' = 'default'): WorkflowNodeRead {
  const record = asRecord(raw, 'workflow node')
  const nodeDef = nestedRecord(record, ['nodeDef'])
  const id = requiredOpaqueId<'WorkflowNodeRuntimeId'>(record, ['id', '_id', 'workflowNodeId'], 'workflow node id')
  assertMatchingWireIdentity(record, ['id', '_id', 'workflowNodeId'], String(id), 'Workflow runtime node')
  const declaredDefinition = optionalString(record, ['definitionId', 'defId'])
  if (declaredDefinition) {
    assertMatchingWireIdentity(record, ['definitionId', 'defId'], declaredDefinition, 'Workflow node definition')
  }
  const declaredFormData = optionalString(record, ['formDataId', 'dataId'])
  if (declaredFormData) {
    assertMatchingWireIdentity(record, ['formDataId', 'dataId'], declaredFormData, 'Workflow node FormData')
  }
  const declaredFormDefinition = optionalString(nodeDef ?? {}, ['formDefId', 'formDefinitionId'])
  if (declaredFormDefinition) {
    assertMatchingWireIdentity(nodeDef ?? {}, ['formDefId', 'formDefinitionId'], declaredFormDefinition, 'Workflow node form definition')
  }
  // R1 Production child WorkflowNode records carry formDefId on the runtime
  // node itself even though their definition snapshots have only type=node
  // (no forms/repeat nodeType). Keep the reference, not a fabricated action.
  const runtimeFormDefinition = scope === 'child'
    ? consistentWireIdentity(record, ['formDefId', 'formDefinitionId'], 'Workflow runtime form definition')
    : undefined
  if (runtimeFormDefinition && declaredFormDefinition && runtimeFormDefinition !== declaredFormDefinition) {
    throw new AdapterMappingError('Workflow runtime and embedded node form definitions disagree')
  }
  consistentWireIdentity(record, ['runId', 'workflowRunId', 'workflowId'], 'Workflow node run')
  consistentWireIdentity(record, ['parentNodeId', 'parentWorkflowNodeId'], 'Workflow node predecessor')
  const definitionId = optionalOpaqueId<'WorkflowDefinitionId'>(record, ['definitionId', 'defId'])
  const runId = optionalOpaqueId<'WorkflowRunId'>(record, ['runId', 'workflowRunId', 'workflowId'])
  const parentNodeId = optionalOpaqueId<'WorkflowNodeRuntimeId'>(record, [
    'parentNodeId',
    'parentWorkflowNodeId',
  ])
  const childWorkflowDefinitionId = optionalOpaqueId<'WorkflowDefinitionId'>(nodeDef ?? {}, ['nodeTypeDef'])
  const displayName = optionalString(nodeDef ?? {}, ['name'])
  const formDefinitionId = declaredFormDefinition || runtimeFormDefinition
    ? asOpaqueId<'FormDefinitionId'>((declaredFormDefinition ?? runtimeFormDefinition)!)
    : undefined
  const formDataId = optionalOpaqueId<'FormDataId'>(record, ['formDataId', 'dataId'])
  const formPurpose =
    verifiedFormPurpose(nodeDef)
    ?? (optionalString(nodeDef ?? {}, ['formDefId', 'formDefinitionId']) === appointmentFormDefinitionWireId
      ? ('appointment' as const)
      : undefined)
  const handlers = workflowNodeHandlers(record)
  const visibility = workflowNodeVisibilityEvidence(record, nodeDef)
  const formFieldIdsReadOnly = workflowNodeReadOnlyFieldIds(record, nodeDef)
  const isSystem = record.isSystem === true
  const isSentinel = record.isSentinel === true
  const sourceNodeType = optionalString(nodeDef ?? {}, ['nodeType', 'nodeTypeOld'])
  const addFormCodeId = sourceNodeType === 'forms'
    ? optionalString(nodeDef ?? {}, ['addFormCodeId']) : undefined
  const formList = readR1NodeFormList(record, sourceNodeType)

  return {
    id,
    category: workflowNodeCategory(nodeDef),
    nodeTypeEvidence: sourceNodeType ? 'runtime_node_def' : 'unresolved',
    ...(sourceNodeType ? { sourceNodeType } : {}),
    ...(addFormCodeId ? { addFormCodeId } : {}),
    ...(formList ? { formList } : {}),
    lifecycle: workflowNodeLifecycle(record),
    visibility,
    ...(displayName ? { displayName } : {}),
    ...(formDefinitionId ? { formDefinitionId } : {}),
    ...(formDefinitionId ? { formDefinitionIdEvidence: declaredFormDefinition ? 'runtime_node_def' as const : 'runtime_node' as const } : {}),
    ...(formPurpose ? { formPurpose } : {}),
    ...(formFieldIdsReadOnly ? { formFieldIdsReadOnly } : {}),
    ...(formDataId ? { formDataId } : {}),
    ...(definitionId ? { definitionId } : {}),
    ...(runId ? { runId } : {}),
    ...(parentNodeId ? { parentNodeId } : {}),
    ...(childWorkflowDefinitionId ? { childWorkflowDefinitionId } : {}),
    ...(handlers ? { handlers } : {}),
    ...(isSystem ? { isSystem } : {}),
    ...(isSentinel ? { isSentinel } : {}),
  }
}


