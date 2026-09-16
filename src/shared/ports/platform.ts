import type {
  CapabilityResult,
  CustomerContactId,
  LocalMedia,
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
