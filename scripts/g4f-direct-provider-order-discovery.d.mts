export interface DirectProviderOrderDiscoverySummary {
  readonly state: 'UNKNOWN_INVALID_INPUT' | 'ORDER_ASSOCIATION_CONFLICT' | 'NO_DIRECT_PROVIDER_LINES' | 'FOUND'
  readonly orders: number
  readonly directProcedureLines: number
  readonly directMeasureLines: number
}

export function inspectDirectProviderOrderPage(
  expectedWorkOrderId: string,
  page: {
    readonly items: readonly {
      readonly type: number
      readonly serviceAppointmentId: string
      readonly groups?: readonly {
        readonly lines?: readonly ({ readonly kind: string; readonly children?: readonly unknown[] })[]
      }[]
    }[]
  },
): Readonly<DirectProviderOrderDiscoverySummary>

export function hasRequestedDirectProviderLines(
  summary: DirectProviderOrderDiscoverySummary,
  requestedKind?: 'procedure_or_measure' | 'measure',
): boolean
