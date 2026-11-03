/**
 * Shared Dynamic Form media policy. Survey, inspection, acceptance and other
 * FormDefs use the same picker/queue/draft/value lifecycle. Field-level
 * policy may restrict sources, number of items or persisted value shape;
 * it never grants upload, FormData write or Workflow permissions.
 *
 * The multiple flag describes a UI field convention, NOT the backend's media
 * wire representation. A source-backed form codec owns that decision.
 */
export type MediaSelectionSource = 'camera' | 'library'
export type MediaFieldSelectionMode = 'camera_or_album' | 'album_only' | 'camera_only' | 'special_tool'
export type MediaFieldPersistedShape = 'media_object_list'

export interface DynamicMediaFieldPolicy {
  readonly selectionMode?: MediaFieldSelectionMode
  readonly maxCount?: number
  readonly persistedShape?: MediaFieldPersistedShape
  readonly blocker?: string
}

export function mediaPersistedCount(value: unknown): number {
  return Array.isArray(value)
    ? value.length
    : value === null || value === undefined || value === '' ? 0 : 1
}

/** Max count is aggregate: saved objects plus the next selection. An
 * unspecified maxCount means UNKNOWN, not infinity promised by the API. */
export function mediaCapacityError(
  policy: Pick<DynamicMediaFieldPolicy, 'maxCount'> | undefined,
  persisted: unknown,
  selectedCount: number,
): string | undefined {
  const max = policy?.maxCount
  if (max === undefined) return undefined
  const existing = mediaPersistedCount(persisted)
  if (!Number.isSafeInteger(max) || max < 0 || !Number.isSafeInteger(selectedCount)
    || selectedCount < 0 || existing + selectedCount > max) {
    return `该媒体字段最多选择 ${max} 项（当前已有 ${existing} 项）`
  }
  return undefined
}

/** Source restrictions are policy, enforced BEFORE platform picker/upload.
 * Permissions and session-scoped queue execution remain Store/Port-owned. */
export function mediaSelectionError(
  policy: Pick<DynamicMediaFieldPolicy, 'selectionMode' | 'blocker'> | undefined,
  source: MediaSelectionSource,
): string | undefined {
  if (policy?.selectionMode === 'special_tool') {
    return policy.blocker ?? '该字段需要专用媒体工具'
  }
  if (policy?.selectionMode === 'album_only' && source !== 'library') {
    return '此字段仅支持从相册选择'
  }
  if (policy?.selectionMode === 'camera_only' && source !== 'camera') {
    return '此字段仅支持使用相机'
  }
  return undefined
}
