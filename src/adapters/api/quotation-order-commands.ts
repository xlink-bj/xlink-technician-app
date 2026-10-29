import type { QuotationOrderCommandPort } from '@shared/ports'
import type { OperationSnapshot } from '@shared/types'

import { adapterFailure, succeeded, unknownErrorMessage } from '../common/operations'
import { optionalRecord, requiredString } from '../common/records'
import { ApiCommandTransportError, normalizeCommandResponse } from './technician-api-commands'
import type { ApiCommandTransport } from './technician-api-commands'

function commandFailure<T>(error: unknown): OperationSnapshot<T> {
  if (error instanceof ApiCommandTransportError) {
    return adapterFailure(error.category, error.message)
  }
  return adapterFailure('network_retryable', unknownErrorMessage(error, 'Order command transport failed'))
}

function businessEnvelope(raw: unknown): Record<string, unknown> {
  normalizeCommandResponse(raw)
  const envelope = optionalRecord(raw)
  if (!envelope || envelope.status !== 1) {
    throw new ApiCommandTransportError('Order command was rejected', 'server_terminal')
  }
  return envelope
}

export class QuotationOrderCommandAdapter implements QuotationOrderCommandPort {
  constructor(private readonly transport: ApiCommandTransport) {}

  async startOrderWorkflow(input: Parameters<QuotationOrderCommandPort['startOrderWorkflow']>[0]) {
    try {
      const raw = await this.transport.execute({
        method: 'POST',
        path: `workflow/startWorkflow/order/null/${encodeURIComponent(String(input.workflowDefinitionId))}`,
        body: { saId: input.workOrderId },
      })
      const envelope = businessEnvelope(raw)
      const entity = optionalRecord(envelope.entity)
      if (!entity) throw new ApiCommandTransportError('Order workflow identity was not returned', 'network_retryable')
      return succeeded(requiredString(entity, ['_id', 'id'], 'Order workflow id'))
    } catch (error) {
      return commandFailure<string>(error)
    }
  }

  async upsertOfficialOrder(input: Parameters<QuotationOrderCommandPort['upsertOfficialOrder']>[0]) {
    if (input.order.type !== 1 || typeof input.order.serviceAppointmentId !== 'string' || !input.order.serviceAppointmentId.trim()) {
      return adapterFailure<string>('validation', 'Official type=1 Order identity is incomplete')
    }
    try {
      const raw = await this.transport.execute({
        method: 'POST',
        path: 'basic/order/upsert',
        body: { order: JSON.stringify(input.order) },
      })
      const envelope = businessEnvelope(raw)
      const data = optionalRecord(envelope.data)
      if (!data) throw new ApiCommandTransportError('Order identity was not returned', 'network_retryable')
      return succeeded(requiredString(data, ['_id', 'id'], 'Order id'))
    } catch (error) {
      return commandFailure<string>(error)
    }
  }
}

export function createQuotationOrderCommandAdapter(transport: ApiCommandTransport): QuotationOrderCommandPort {
  return new QuotationOrderCommandAdapter(transport)
}
