export const pipeSubjects = [
  { value: 'mock-pipe-artisan-shop', label: '体验管道安装服务点' },
  { value: 'mock-pipe-unassigned-shop', label: '未分配的演示服务点' },
] as const

export const pipeOrderFixture = {
  id: 'mock-pipe-no-card-order-001',
  number: 'MOCK-GD-001',
  nodeId: 'mock-pipe-no-card-create-001',
  subjectId: pipeSubjects[0].value,
} as const

export type PipeOrder = {
  readonly schema: 1
  readonly id: typeof pipeOrderFixture.id
  readonly subjectId: typeof pipeOrderFixture.subjectId
  readonly service: 'pipe-installation'
  readonly card: 'none'
  readonly note: string
}

function validNote(note: unknown): note is string {
  return typeof note === 'string' && note === note.trim() && note.length > 0 && note.length <= 80
}

export function createNoCardOrder(subjectId: string, note: string): PipeOrder | null {
  const clean = note.trim()
  if (subjectId !== pipeOrderFixture.subjectId || !validNote(clean)) return null
  return {
    schema: 1,
    id: pipeOrderFixture.id,
    subjectId,
    service: 'pipe-installation',
    card: 'none',
    note: clean,
  }
}

export function parseNoCardOrder(value: unknown): PipeOrder | null {
  const row = value as Partial<PipeOrder> | null
  if (!row || row.schema !== 1 || row.id !== pipeOrderFixture.id || row.subjectId !== pipeOrderFixture.subjectId
    || row.service !== 'pipe-installation' || row.card !== 'none' || !validNote(row.note)) return null
  return createNoCardOrder(row.subjectId, row.note)
}
