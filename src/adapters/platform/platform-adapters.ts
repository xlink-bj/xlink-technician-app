import type {
  CalendarEventInput,
  CalendarEventRef,
  CalendarPort,
  LocationPort,
  LocationSnapshot,
  MediaCapturePort,
  MediaFilePickerPort,
  NavigationPort,
  PhoneDialRequest,
  PhonePort,
  ScanPort,
  ScanResult,
} from '@shared/ports'
import type { CapabilityResult, LocalMedia } from '@shared/types'
import { asOpaqueId, createCapabilityResult } from '@shared/types'

import { AdapterMappingError } from '../common/operations'
import { asRecord, optionalString, requiredString } from '../common/records'

export type PlatformDriverState =
  | 'granted'
  | 'denied'
  | 'denied_permanently_or_settings'
  | 'unavailable'
  | 'unsupported_platform'
  | 'cancelled'
  | 'error_retryable'

export interface PlatformDriverResult {
  readonly state: string
  readonly value?: unknown
  readonly reason?: string
}

export interface LocationDriver {
  capture(): Promise<PlatformDriverResult>
}

export interface MediaCaptureDriver {
  capture(): Promise<PlatformDriverResult>
}

export interface MediaFilePickerDriver {
  pick(): Promise<PlatformDriverResult>
}

export interface CalendarDriver {
  addEvent(input: CalendarEventInput): Promise<PlatformDriverResult>
}

export interface ScanDriver {
  scan(): Promise<PlatformDriverResult>
}

export interface PhoneDriver {
  dial(input: PhoneDialRequest): Promise<PlatformDriverResult>
}

export interface NavigationDriver {
  navigate(url: string): Promise<void>
  replace?(url: string): Promise<void>
  reset?(url: string): Promise<void>
  back?(): Promise<void>
}

const supportedStates = new Set<PlatformDriverState>([
  'granted',
  'denied',
  'denied_permanently_or_settings',
  'unavailable',
  'unsupported_platform',
  'cancelled',
  'error_retryable',
])

function normalizeState(state: string): PlatformDriverState {
  return supportedStates.has(state as PlatformDriverState)
    ? (state as PlatformDriverState)
    : 'error_retryable'
}

async function normalize<T>(
  capability: string,
  execute: () => Promise<PlatformDriverResult>,
  map: (value: unknown) => T,
): Promise<CapabilityResult<T>> {
  try {
    const outcome = await execute()
    const state = normalizeState(outcome.state)
    if (state !== 'granted') return createCapabilityResult<T>(capability, state, undefined, outcome.reason)
    return createCapabilityResult(capability, 'granted', map(outcome.value), outcome.reason)
  } catch (error) {
    return createCapabilityResult<T>(
      capability,
      'error_retryable',
      undefined,
      error instanceof Error ? error.message : 'Platform driver failed',
    )
  }
}

function mediaSource(value: unknown): LocalMedia['source'] {
  if (value === 'camera' || value === 'library' || value === 'file') return value
  throw new AdapterMappingError('media source is unsupported')
}

function mediaFromDriver(value: unknown): LocalMedia {
  const record = asRecord(value, 'local media')
  const ref = requiredString(record, ['ref', 'id', 'mediaRef'], 'local media reference')
  return {
    ref: asOpaqueId<'LocalMediaRef'>(ref),
    mimeType: requiredString(record, ['mimeType', 'type'], 'local media MIME type'),
    source: mediaSource(record.source),
    ...(optionalString(record, ['localPath', 'path', 'filePath'])
      ? { localPath: optionalString(record, ['localPath', 'path', 'filePath']) }
      : {}),
    ...(optionalString(record, ['name', 'fileName'])
      ? { name: optionalString(record, ['name', 'fileName']) }
      : {}),
    ...(typeof record.size === 'number' ? { size: record.size } : {}),
    ...(optionalString(record, ['capturedAt', 'createdAt'])
      ? { capturedAt: optionalString(record, ['capturedAt', 'createdAt']) }
      : {}),
  }
}

function locationFromDriver(value: unknown): LocationSnapshot {
  const record = asRecord(value, 'location')
  if (record.coordinateSystem !== 'gcj02' && record.coordinateSystem !== 'wgs84') {
    throw new AdapterMappingError('location coordinate system is unsupported')
  }
  if (typeof record.latitude !== 'number' || typeof record.longitude !== 'number') {
    throw new AdapterMappingError('location coordinates are missing')
  }
  return {
    latitude: record.latitude,
    longitude: record.longitude,
    coordinateSystem: record.coordinateSystem,
    capturedAt: requiredString(record, ['capturedAt', 'timestamp'], 'location timestamp'),
    ...(typeof record.accuracy === 'number' ? { accuracy: record.accuracy } : {}),
    ...(optionalString(record, ['address']) ? { address: optionalString(record, ['address']) } : {}),
  }
}

function calendarRefFromDriver(value: unknown): CalendarEventRef {
  const record = asRecord(value, 'calendar event')
  return { reference: requiredString(record, ['reference', 'id', 'eventId'], 'calendar event reference') }
}

function scanFromDriver(value: unknown): ScanResult {
  const record = asRecord(value, 'scan result')
  const format = optionalString(record, ['format', 'type'])
  return {
    rawValue: requiredString(record, ['rawValue', 'value', 'content'], 'scan value'),
    ...(format ? { format } : {}),
    scannedAt: requiredString(record, ['scannedAt', 'timestamp'], 'scan timestamp'),
  }
}

const unsupported = <T>(capability: string): Promise<CapabilityResult<T>> =>
  Promise.resolve(createCapabilityResult<T>(capability, 'unsupported_platform'))

export interface PlatformDrivers {
  readonly location?: LocationDriver
  readonly mediaCapture?: MediaCaptureDriver
  readonly mediaFilePicker?: MediaFilePickerDriver
  readonly calendar?: CalendarDriver
  readonly scan?: ScanDriver
  readonly phone?: PhoneDriver
  readonly navigation?: NavigationDriver
}

export interface PlatformAdapters {
  readonly location: LocationPort
  readonly mediaCapture: MediaCapturePort
  readonly mediaFilePicker: MediaFilePickerPort
  readonly calendar: CalendarPort
  readonly scan: ScanPort
  readonly phone: PhonePort
  readonly navigation: NavigationPort
}

export function createPlatformAdapters(drivers: PlatformDrivers = {}): PlatformAdapters {
  const location: LocationPort = {
    captureCurrentLocation: () =>
      drivers.location
        ? normalize('location', () => drivers.location!.capture(), locationFromDriver)
        : unsupported('location'),
  }
  const mediaCapture: MediaCapturePort = {
    capture: () =>
      drivers.mediaCapture
        ? normalize('media_capture', () => drivers.mediaCapture!.capture(), mediaFromDriver)
        : unsupported('media_capture'),
  }
  const mediaFilePicker: MediaFilePickerPort = {
    pick: async () => {
      if (!drivers.mediaFilePicker) return unsupported('media_file_picker')
      return normalize('media_file_picker', () => drivers.mediaFilePicker!.pick(), (value) => {
        if (!Array.isArray(value)) throw new AdapterMappingError('picked media must be an array')
        return value.map(mediaFromDriver)
      })
    },
  }
  const calendar: CalendarPort = {
    addEvent: (input) =>
      drivers.calendar
        ? normalize('calendar', () => drivers.calendar!.addEvent(input), calendarRefFromDriver)
        : unsupported('calendar'),
  }
  const scan: ScanPort = {
    scan: () =>
      drivers.scan
        ? normalize('scan', () => drivers.scan!.scan(), scanFromDriver)
        : unsupported('scan'),
  }
  const phone: PhonePort = {
    dial: (input) =>
      drivers.phone
        ? normalize('phone', () => drivers.phone!.dial(input), () => undefined)
        : unsupported('phone'),
  }

  const navigation: NavigationPort = {
    navigate: (url) => drivers.navigation
      ? drivers.navigation.navigate(url)
      : Promise.reject(new Error('Navigation is unsupported on this platform')),
    ...(drivers.navigation?.replace
      ? { replace: (url: string) => drivers.navigation!.replace!(url) }
      : {}),
    ...(drivers.navigation?.reset
      ? { reset: (url: string) => drivers.navigation!.reset!(url) }
      : {}),
    ...(drivers.navigation?.back
      ? { back: () => drivers.navigation!.back!() }
      : {}),
  }

  return { location, mediaCapture, mediaFilePicker, calendar, scan, phone, navigation }
}

export function createUnsupportedPlatformAdapters(): PlatformAdapters {
  return createPlatformAdapters()
}
