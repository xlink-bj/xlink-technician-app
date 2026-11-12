import { readFileSync } from 'node:fs'
import type referenceType from '../fixtures/survey-59-read-reference.json'
const reference: typeof referenceType = JSON.parse(readFileSync(new URL('../fixtures/survey-59-read-reference.json', import.meta.url), 'utf8'))

/** Captured structural rows, synthetic identities/provider/values. This fixture
 * proves no production configuration, write grant or provider authorization. */
export function normalSurveyCauseReadFixture() {
  const ids = { tenant: 't', work: 's', node: 'n', run: 'w', definition: 'e', record: 'saved', user: 'u', role: 'r' }
  const choose = (id: number) => structuredClone(reference.fields[id - 1]!.row) as Record<string, unknown>
  const fields: Record<string, unknown>[] = [choose(17), choose(24), choose(57), choose(58)].map(row => ({ ...row,
    tenantId: ids.tenant, extId: ids.definition, state: 1, nameDisp: String(row.name) }))
  const ext = { _id: ids.definition, tenantId: ids.tenant, state: 1, type: '1', colName: 'survey' }
  const sa = { _id: ids.work, tenantId: ids.tenant, workflowId: ids.run, state: 1, status: 203, serviceType: '40',
    name: '合成渗漏原因只读', orderNum: 'SURVEY-CAUSE-READ', exts: { sourceType: '' } }
  const node = { _id: ids.node, tenantId: ids.tenant, workflowId: ids.run, workflowFormDataId: ids.work,
    workflowFormColName: 'serviceAppointment', state: 0, handlerIds: [ids.role], nodeDef: {
      nodeType: 'repeat', formDefId: ids.definition, name: '合成渗漏原因只读', viewableRoleIds: [ids.role],
      formFieldIdsFill: [], formFieldIdsReadOnly: fields.map(f => String(f._id)) } }
  const raw: Record<string, unknown> = { _id: ids.record, tenantId: ids.tenant, sid: ids.work, nodeId: ids.node,
    workflowId: ids.run, state: 1, part: ['1', '130'], width: 0, leakageCause: ['cause-a'], exts: { audit: { synthetic: true } } }
  const detail = { success: true, status: 1, data: { serviceAppointment: sa,
    workflow: { _id: ids.run, tenantId: ids.tenant, formDataId: ids.work, state: 0 }, workflowNode: [node] } }
  const providerRows: Record<string, unknown>[] = [{ part: '1', leakageCause: 'cause-a', label: '原因A' }]
  const tree = [{ type: fields[0]!.valueOption, children: [{ value: '1', name: '合成部位', children: [
    { value: '130', name: '合成末级部位', children: [] }] }] }]
  const calls: string[] = [], commands: string[] = [], uploads: string[] = [], processes: string[] = []
  let hook: ((path: string) => void | Promise<void>) | undefined
  async function execute(request: { path: string; body?: Readonly<Record<string, unknown>> }): Promise<unknown> {
    const { path, body } = request; calls.push(path)
    if (/upload|upToken/i.test(path)) { uploads.push(path); throw Error('No upload allowed') }
    if (/process/i.test(path)) { processes.push(path); throw Error('No Process allowed') }
    if (/upsert|updateExts|delete|remove/i.test(path)) { commands.push(path); throw Error('No business command allowed') }
    await hook?.(path)
    if (path === 'basic/serviceAppointment/queryById/' + ids.work) return structuredClone(detail)
    if (path === 'biz/ext/queryById.do') return structuredClone(ext)
    if (path === 'biz/extField/query') return { data: structuredClone(fields), total: fields.length, page: 1, size: Number(body?.rows) }
    if (path === 'i/code/selectMultistageCode.do') return structuredClone(tree)
    if (path === 'biz/extForm/query/' + ids.definition) return { data: [structuredClone(raw)], total: 1, page: 1, size: Number(body?.rows), dataCount: 1 }
    if (path === 'biz/extForm/queryByColName/leakageCause') return { data: structuredClone(providerRows) }
    throw Error('Unexpected synthetic read: ' + path)
  }
  return { ids, fields, ext, sa, node, raw, detail, providerRows, tree, calls, commands, uploads, processes, execute,
    hook: (next?: typeof hook) => { hook = next } }
}
