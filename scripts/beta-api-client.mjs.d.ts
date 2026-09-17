export declare class BetaApiClientError extends Error {
  readonly code: string
}

export interface BetaLoginResult {
  readonly sessionRef: string
}

export declare function assertBetaApiBaseUrl(value: string): string
export declare function normalizeBetaLoginMethod(value?: string): '1' | '2'
export declare function betaDefaults(env?: Record<string, string | undefined>): {
  readonly apiBaseUrl: string
  readonly tenantId: string
  readonly phone: string
  readonly method: '1' | '2'
  readonly code: string
  readonly password: string
  readonly timeoutMs: number
}
export declare function betaLocalDefaults(env?: Record<string, string | undefined>): ReturnType<typeof betaDefaults>
export declare function loginBeta(options: Record<string, unknown>): Promise<BetaLoginResult>
export declare function createBetaReadClient(options: Record<string, unknown>): {
  read(path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>>
}
export declare const DEFAULT_BETA_API_BASE_URL: string
export declare const DEFAULT_BETA_TENANT_ID: string
