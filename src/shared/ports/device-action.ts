export type DeviceKind = 'pressure' | 'panorama'
export interface PressureReading {
  readonly startMpa: number
  readonly endMpa: number
  readonly holdMinutes: number
}

export type DeviceResult = {
  readonly kind: DeviceKind
  readonly source: 'dev_mock'
  readonly completedAt: string
  readonly dataComplete: boolean
  readonly measurement: 'unverified' | 'not_applicable'
  readonly samples?: readonly { readonly minute: number; readonly pressure: number; readonly unit: 'MPa' }[]
  /** Operator-entered DEV demo values. They carry no device sampling evidence. */
  readonly manualPressure?: PressureReading
  readonly panorama?: { readonly scene: string; readonly asset: string; readonly stitched: boolean }
}
export type DeviceEvent =
  | { readonly type: 'progress'; readonly progress: number; readonly label: string }
  | { readonly type: 'finished'; readonly result: DeviceResult }
  | { readonly type: 'disconnected' }

/** Hardware and vendor SDK mechanics end at this semantic port. */
export interface DeviceActionPort {
  connect(kind: DeviceKind): Promise<void>
  start(kind: DeviceKind, emit: (event: DeviceEvent) => void): void
  cancel(): void
}
