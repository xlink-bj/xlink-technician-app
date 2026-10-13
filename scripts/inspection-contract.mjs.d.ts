export declare class ContractDiscoveryError extends Error {
  readonly code: string
}

export interface InspectionContractSnapshot {
  readonly environment: 'beta'
  readonly contractKind: 'inspection-form'
  readonly form: { readonly id: string; readonly fieldCount: number }
  readonly fields: readonly Readonly<Record<string, unknown>>[]
  readonly providers: readonly Readonly<Record<string, unknown>>[]
  readonly workflowContextShape: Readonly<Record<string, unknown>>
  readonly formDataShape: Readonly<Record<string, unknown>>
  readonly fingerprint: string
}

export declare function contractFingerprint(snapshot: unknown): string
export declare function validateContractSnapshot(snapshot: unknown): true
export declare function discoverInspectionContract(options: Record<string, unknown>): Promise<InspectionContractSnapshot>
export declare function runInspectionContractCli(argv?: readonly string[]): Promise<InspectionContractSnapshot>
export declare function runContractCheck(snapshotFile: string, options?: Record<string, unknown>): Promise<Readonly<Record<string, unknown>>>
