export type ArchitectureLayer =
  | 'presentation'
  | 'application'
  | 'domain-runtime'
  | 'adapter'

export type {
  CustomerContactId,
  FormDataId,
  FormDefinitionId,
  LocalMediaRef,
  MediaUploadTaskId,
  Opaque,
  OrganizationId,
  RoleId,
  RoleRef,
  SessionRef,
  UserId,
  UserRef,
  WorkOrderId,
  WorkflowDefinitionId,
  WorkflowNodeRuntimeId,
  WorkflowRunId,
} from './identifiers'
export { asOpaqueId } from './identifiers'
export {
  isMediaValueRef,
  mediaValueRefFromUpload,
} from './media'
export type {
  DurableMediaAsset,
  LocalMedia,
  MediaEvidenceContext,
  MediaSource,
  MediaTaskScope,
  MediaUploadTask,
  MediaUploadTaskState,
  MediaValueRef,
  UploadedMediaRef,
  UploadState,
} from './media'
export {
  createOperationError,
  isRetryableCategory,
  operationStateForError,
} from './operation'
export type {
  ErrorCategory,
  OperationError,
  OperationSnapshot,
  OperationState,
} from './operation'
export {
  capabilityMetadata,
  createCapabilityResult,
  isCapabilityGranted,
} from './capability'
export type { CapabilityMetadata, CapabilityResult, CapabilityState } from './capability'

export { requiresR1SpecialWorkflowWire } from './r1-node-contract'
