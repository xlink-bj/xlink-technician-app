export type ArchitectureLayer =
  | 'presentation'
  | 'application'
  | 'domain-runtime'
  | 'adapter'

export type {
  FormDataId,
  FormDefinitionId,
  LocalMediaRef,
  Opaque,
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
export type { LocalMedia, MediaSource, UploadedMediaRef, UploadState } from './media'
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
