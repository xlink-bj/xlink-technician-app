export const pipeScanFixtures = [
  { id: 'registered', label: '清晰编码 A' },
  { id: 'unregistered', label: '清晰编码 B' },
  { id: 'damaged', label: '残缺编码' },
] as const

export const pipePhotoFixtures = [
  { id: 'marked', label: '标记清晰样本' },
  { id: 'obscured', label: '标记遮挡样本' },
] as const

export type PipeScanFixture = typeof pipeScanFixtures[number]['id']
export type PipePhotoFixture = typeof pipePhotoFixtures[number]['id']

type PipeScanReceipt = {
  readonly fixtureId: PipeScanFixture
  readonly attempt: number
} & (
  | { readonly outcome: 'found'; readonly code: string; readonly sampleRef: string }
  | { readonly outcome: 'not-found'; readonly code: string }
  | { readonly outcome: 'unknown'; readonly reason: string }
)

export type PipePhotoReceipt = {
  readonly imageId: PipePhotoFixture
} & (
  | { readonly outcome: 'recognized'; readonly marking: string }
  | { readonly outcome: 'inconclusive'; readonly reason: string }
)

export interface PipeVerificationSnapshot {
  readonly scan?: PipeScanReceipt
  readonly photo?: PipePhotoReceipt
}

export interface PipeVerificationMock {
  available(): boolean
  read(): PipeVerificationSnapshot | null
  scan(fixtureId: PipeScanFixture): PipeVerificationSnapshot | null
  recheck(): PipeVerificationSnapshot | null
  recognize(imageId: PipePhotoFixture): PipeVerificationSnapshot | null
}
