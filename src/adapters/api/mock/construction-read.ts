import { isDevMockJourneyEnabled } from './journey';
import { constructionReadRequest, type ConstructionReadRequest } from '../../../shared/construction-read-contract';
/** A fixed, offline R1-contract fixture. No network transport or mutation port. */
export const constructionMockWorkOrderId = 'mock-work-order-002';
export function constructionMockEnabled(id: string): boolean { return isDevMockJourneyEnabled() && id === constructionMockWorkOrderId; }
export const constructionMockParts = [{ type: 'parts', children: [{ value: 'mock-log-roof', name: '屋面', children: [{ value: 'mock-log-joint', name: '女儿墙根部' }, { value: 'mock-log-drain', name: '排水口' }] }] }];
export async function queryConstructionMock(request: ConstructionReadRequest): Promise<unknown> {
    const expected = constructionReadRequest(constructionMockWorkOrderId);
    if (!constructionMockEnabled(constructionMockWorkOrderId) || request.path !== expected.path || Object.keys(request.body).length !== Object.keys(expected.body).length || Object.entries(expected.body).some(([k, v]) => request.body[k] !== v))
        throw Error('Offline construction scope denied');
    return {
        data: [
            { _id: 'mock-construction-log-001', serviceAppointmentId: constructionMockWorkOrderId, orderId: 'BJ202610260001', state: 1, createTime: '2026-11-14 09:10:00', updateDateTime: '2026-11-14 11:35:00', updateUserName: '王师傅', repairParts: [['mock-log-roof', 'mock-log-joint']], data: [{ content: '清理女儿墙根部浮灰，检查基层裂缝。' }, { content: '完成节点密封加强，逐段检查收口。' }, { content: '复核接缝连续性，记录需继续观察的部位。' }] },
            { _id: 'mock-construction-log-002', serviceAppointmentId: constructionMockWorkOrderId, orderId: 'BJ202610260001', state: 1, createTime: '2026-11-14 14:20:00', updateDateTime: '2026-11-14 15:05:00', updateUserName: '李师傅', repairParts: [['mock-log-roof', 'mock-log-drain']], data: [{ content: '清理排水口周边杂物，核查排水通道。' }, { content: '复核节点处理后的外观与衔接。' }] },
        ]
    };
}
export const constructionMockReadPort = { execute: queryConstructionMock };
