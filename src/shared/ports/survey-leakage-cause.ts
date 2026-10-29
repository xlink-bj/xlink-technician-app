import type { OperationSnapshot } from '@shared/types'

/**
 * Survey-only provider boundary. This is deliberately not part of the
 * generic Dynamic Form Runtime or the generic option-provider contract.
 */
export interface SurveyLeakageCauseRow {
  readonly part: string
  readonly id: string
  readonly label: string
}

export interface SurveyLeakageCauseProviderPort {
  query(): Promise<OperationSnapshot<readonly SurveyLeakageCauseRow[]>>
}
