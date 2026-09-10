import type { LocalMedia, OperationSnapshot, UploadedMediaRef } from '@shared/types'

export interface UploadPort {
  upload(media: LocalMedia): Promise<OperationSnapshot<UploadedMediaRef>>
}
