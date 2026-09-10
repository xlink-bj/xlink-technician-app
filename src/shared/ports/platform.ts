import type {
  CapabilityResult,
  LocalMedia,
  UserId,
} from '@shared/types'

export interface LocationSnapshot {
  readonly latitude: number
  readonly longitude: number
  readonly coordinateSystem: 'gcj02'
  readonly capturedAt: string
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
  readonly contactRef: UserId
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
