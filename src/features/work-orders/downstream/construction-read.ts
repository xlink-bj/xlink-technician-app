/** R1 xlink-app@6c0a97b constructionlog.vue: same-WorkOrder read only.
 * This is not an active construction-task grant or a write capability. */
export const constructionFormDefinitionId = '9190357980804726357';
export interface ConstructionLog {
    readonly id: string;
    readonly orderId?: string;
    readonly updatedAt?: string;
    readonly createdAt?: string;
    readonly author?: string;
    readonly repairParts: readonly string[];
    readonly procedures: readonly string[];
}
export type ConstructionReadRequest = {
    readonly path: string;
    readonly body: Readonly<Record<string, string | number>>;
};
export function constructionReadRequest(workOrderId: string): ConstructionReadRequest {
    if (!workOrderId.trim() || workOrderId.trim() !== workOrderId)
        throw Error('Invalid WorkOrder identity');
    return { path: `biz/extForm/query/${constructionFormDefinitionId}`, body: { sortField: 'createTime', sortOrder: 'asc', 'is:serviceAppointmentId|string#and': workOrderId, 'ne:state|integer#and': -1 } };
}
const record = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const text = (v: unknown) => typeof v === 'string' && v.trim() ? v : undefined;
/** Dictionary paths are displayed only when every code resolves. Unknown paths
 * are omitted; no guessed repair-part label is presented as authoritative. */
export function constructionPartLabels(value: unknown, dictionary: unknown): string[] {
    if (!Array.isArray(value) || !Array.isArray(dictionary))
        return [];
    const root = dictionary.map(record).find(r => r?.type === 'parts')?.children;
    return value.flatMap(path => {
        if (!Array.isArray(path) || !path.length)
            return [];
        let nodes: unknown = root;
        const labels: string[] = [];
        for (const code of path) {
            if (!Array.isArray(nodes))
                return [];
            const node = nodes.map(record).find(n => n?.value === code);
            if (!node || !text(node.name))
                return [];
            labels.push(String(node.name));
            nodes = node.children;
        }
        return [labels.join(' / ')];
    });
}
export function parseConstructionLogs(response: unknown, workOrderId: string, dictionary: unknown): ConstructionLog[] {
    const envelope = record(response), rows = envelope?.data;
    if (envelope?.success === false || !Array.isArray(rows))
        throw Error('Construction read unavailable');
    const ids = new Set<string>();
    return rows.map(value => {
        const row = record(value), id = text(row?._id);
        if (!row || !id || ids.has(id) || row.serviceAppointmentId !== workOrderId || row.state === -1 || row.state === '-1' || !Array.isArray(row.data))
            throw Error('Construction record scope or shape mismatch');
        ids.add(id);
        const procedures = row.data.map(item => { const content = text(record(item)?.content); if (!content)
            throw Error('Invalid procedure content'); return content; });
        return { id, orderId: text(row.orderId), updatedAt: text(row.updateDateTime), createdAt: text(row.createTime), author: text(row.updateUserName), repairParts: constructionPartLabels(row.repairParts, dictionary), procedures };
    });
}
