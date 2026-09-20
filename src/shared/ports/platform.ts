import type {
  CapabilityResult,
  DurableMediaAsset,
  CustomerContactId,
  LocalMedia,
  MediaEvidenceContext,
  MediaUploadTask,
  MediaUploadTaskId,
  MediaTaskScope,
  OperationSnapshot,
} from '@shared/types'

export interface LocationSnapshot {
  readonly latitude: number
  readonly longitude: number
  readonly coordinateSystem: 'gcj02' | 'wgs84'
  readonly capturedAt: string
  readonly accuracy?: number
  readonly address?: string
}

export interface DurableMediaStorePort {
  persist(media: LocalMedia): Promise<OperationSnapshot<DurableMediaAsset>>
  resolve(assetId: import('@shared/types').LocalMediaRef): Promise<OperationSnapshot<DurableMediaAsset | null>>
  exists(assetId: import('@shared/types').LocalMediaRef): Promise<OperationSnapshot<boolean>>
  remove(assetId: import('@shared/types').LocalMediaRef): Promise<OperationSnapshot<void>>
}

export interface MediaPreprocessorPort {
  preprocess(input: {
    readonly media: LocalMedia
    readonly evidence?: MediaEvidenceContext
  }): Promise<OperationSnapshot<LocalMedia>>
}

/**
 * Generic post-upload stage. A business policy may require a final remote
 * representation after the source upload has been durably checkpointed.
 */
export interface MediaPostUploadProcessorPort {
  /**
   * Verifies that the post-upload policy is executable before source upload.
   * This must not perform a network mutation.
   */
  preflight(input: {
    readonly evidence?: MediaEvidenceContext
  }): Promise<OperationSnapshot<void>>
  process(input: {
    readonly source: import('@shared/types').UploadedMediaRef
    readonly evidence?: MediaEvidenceContext
  }): Promise<OperationSnapshot<import('@shared/types').UploadedMediaRef>>
}

export interface MediaQueueRepository {
  read(taskId: MediaUploadTaskId): Promise<OperationSnapshot<MediaUploadTask | null>>
  write(task: MediaUploadTask): Promise<OperationSnapshot<void>>
  remove(taskId: MediaUploadTaskId): Promise<OperationSnapshot<void>>
  list(scope: MediaTaskLookupScope): Promise<OperationSnapshot<readonly MediaUploadTask[]>>
}

/**
 * Read-side queue scope. Form/data identity is optional for pre-save tasks,
 * but when supplied it narrows recovery to the current form instance.
 */
export type MediaTaskLookupScope = Pick<MediaTaskScope, 'userId' | 'workOrderId' | 'workflowNodeId'>
  & Partial<Pick<MediaTaskScope, 'formDefinitionId' | 'formDataId' | 'fieldId' | 'valueKey'>>

export interface MediaUploadQueuePort {
  enqueue(input: {
    readonly scope: Omit<MediaTaskScope, 'localAssetId'>
    readonly media: LocalMedia
    readonly evidence?: MediaEvidenceContext
  }): Promise<OperationSnapshot<MediaUploadTask>>
  process(taskId: MediaUploadTaskId): Promise<OperationSnapshot<MediaUploadTask>>
  retry(taskId: MediaUploadTaskId): Promise<OperationSnapshot<MediaUploadTask>>
  discard(taskId: MediaUploadTaskId): Promise<OperationSnapshot<void>>
  finalizeAfterSave(taskId: MediaUploadTaskId): Promise<OperationSnapshot<void>>
  listForAction(scope: MediaTaskLookupScope): Promise<OperationSnapshot<readonly MediaUploadTask[]>>
}

export type NetworkStatus = 'online' | 'offline' | 'unknown'

export interface NetworkStatusPort {
  current(): Promise<NetworkStatus>
  subscribe(listener: (status: NetworkStatus) => void): () => void
}

export interface CalendarEventInput {
  readonly title: string
  readonly startTime: string
  readonly endTime: string
  readonly location?: string
  readonly description?: string
  readonly alarmOffset?: number
}

export interface CalendarEventRef {
  readonly reference: string
}

export interface ScanResult {
  readonly rawValue: string
  readonly format?: string
  readonly scannedAt: string
}

export interface PhoneDialRequest {
  readonly contactRef?: CustomerContactId
  readonly normalizedPhone: string
}

export interface LocationPort {
  captureCurrentLocation(): Promise<CapabilityResult<LocationSnapshot>>
}

export interface MediaCapturePort {
  capture(): Promise<CapabilityResult<LocalMedia>>
}

export interface MediaFilePickerPort {
  pick(): Promise<CapabilityResult<readonly LocalMedia[]>>
}

export interface CalendarPort {
  addEvent(input: CalendarEventInput): Promise<CapabilityResult<CalendarEventRef>>
}

export interface ScanPort {
  scan(): Promise<CapabilityResult<ScanResult>>
}

export interface PhonePort {
  dial(input: PhoneDialRequest): Promise<CapabilityResult<void>>
}

export interface NavigationPort {
  navigate(url: string): Promise<void>
  /** Replace the current page without growing the native navigation stack. */
  readonly replace?: (url: string) => Promise<void>
  /** Finish a flow with a clean root so completed action pages cannot re-open. */
  readonly reset?: (url: string) => Promise<void>
  /** Optional native page-stack back operation. */
  readonly back?: () => Promise<void>
}
