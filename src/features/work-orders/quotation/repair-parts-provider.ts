import type { CodeOptionRead, ReadPage, TechnicianApiReadPort, WorkOrderDetail } from '@shared/ports'
import type { OperationSnapshot } from '@shared/types'

/** null means this provider does not own the context; failure must not fall back. */
export type LocalQuotationRepairPartsReader = (
  detail: WorkOrderDetail, workflowNodeId: string,
) => Promise<OperationSnapshot<ReadPage<CodeOptionRead>> | null>

export async function readQuotationRepairParts(
  read: TechnicianApiReadPort, detail: WorkOrderDetail, workflowNodeId: string,
  localRead?: LocalQuotationRepairPartsReader,
): Promise<{ source: 'local' | 'default'; result: OperationSnapshot<ReadPage<CodeOptionRead>> }> {
  const local = await localRead?.(detail, workflowNodeId)
  return local ? { source: 'local', result: local }
    : { source: 'default', result: await read.getCascadeCodeOptions({ codeType: 'repairParts' }) }
}
