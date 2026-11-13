/** Storage facts only. A copied descriptor is never a reader lease or grant. */
export interface R1FileCreateStorage {
  readonly kind: 'generic-map' | 'survey-dto'
  readonly definitionId: string
  readonly colName: string
  /** Exact condition-read slots, independent of the dependency's preset/write
   * slots. Reader-issued facts only; this descriptor never grants authority. */
  readonly conditions?: readonly {
    readonly fieldId: string
    readonly dependencyFieldId: string
    readonly valueKey: string
    readonly slot: 'root' | 'exts'
  }[]
  readonly fields: readonly {
    readonly fieldId: string
    readonly valueKey: string
    readonly type: string
    readonly max: number
    readonly slots: readonly ('root' | 'exts')[]
  }[]
}
