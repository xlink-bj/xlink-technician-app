export function currentFormDefRequestBody(extId: string, page?: number, stableOrder?: boolean): Record<string, string | number>
export function isAllowedCurrentFormDefRead(body: string, extId: string, page?: number, stableOrder?: boolean): boolean
export function verifyCurrentFormDefPage(payload: unknown, extId: string): { ok: boolean; reason?: string; fields?: number }
export function currentFormDefPageDiagnostics(payload: unknown, httpStatus: unknown): Record<string, unknown>
export function verifyCurrentFormDefPages(payloads: unknown[], extId: string): { ok: boolean; reason?: string; total?: number; complete?: boolean }
