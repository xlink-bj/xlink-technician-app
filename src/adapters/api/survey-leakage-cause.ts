import type { SurveyLeakageCauseProviderPort, SurveyLeakageCauseRow } from '@shared/ports'
import type { OperationSnapshot } from '@shared/types'

import {
  AdapterMappingError,
  adapterFailure,
  succeeded,
  unknownErrorMessage,
} from '../common/operations'
import {
  asRecord,
  requiredString,
} from '../common/records'
import {
  ApiReadTransportError,
  type ApiReadTransport,
} from './technician-api'

const leakageCauseQuery = {
  method: 'POST' as const,
  path: 'biz/extForm/queryByColName/leakageCause',
  body: {
    _all: '1',
    sortField: 'partOrder,leakageCauseOrder',
    sortOrder: 'asc',
  },
}

function rowsFromResponse(raw: unknown): readonly SurveyLeakageCauseRow[] {
  const envelope = asRecord(raw, 'leakage cause response')
  if (!Array.isArray(envelope.data)) throw new AdapterMappingError('leakage cause response data must be an array')
  return envelope.data.map((item, index) => {
    const row = asRecord(item, `leakage cause row ${index + 1}`)
    return {
      part: requiredString(row, ['part'], `leakage cause row ${index + 1} part`),
      id: requiredString(row, ['leakageCause'], `leakage cause row ${index + 1} leakageCause`),
      label: requiredString(row, ['label'], `leakage cause row ${index + 1} label`),
    }
  })
}

function failure<T>(error: unknown): OperationSnapshot<T> {
  if (error instanceof AdapterMappingError) return adapterFailure('server_terminal', error.message)
  if (error instanceof ApiReadTransportError) return adapterFailure(error.category, error.message)
  return adapterFailure('network_retryable', unknownErrorMessage(error, 'Leakage cause provider failed'))
}

export function createSurveyLeakageCauseProvider(transport: ApiReadTransport): SurveyLeakageCauseProviderPort {
  return {
    async query(): Promise<OperationSnapshot<readonly SurveyLeakageCauseRow[]>> {
      try {
        return succeeded(rowsFromResponse(await transport.execute(leakageCauseQuery)))
      } catch (error) {
        return failure(error)
      }
    },
  }
}

export { leakageCauseQuery }
