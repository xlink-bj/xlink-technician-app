export function currentFormDefRequestBody(extId: string): Record<string, string | number>
export function isAllowedCurrentFormDefRead(body: string, extId: string): boolean
export function verifyCurrentFormDefPage(payload: unknown, extId: string): { ok: boolean; reason?: string; fields?: number }
