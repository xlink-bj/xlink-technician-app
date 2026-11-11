/** Storage facts only. A copied descriptor is never a reader lease or grant. */
export interface R1FileCreateStorage {
  readonly kind: 'generic-map' | 'survey-dto'
  readonly definitionId: string
  readonly colName: string
  readonly fields: readonly {
    readonly fieldId: string
    readonly valueKey: string
    readonly type: string
    readonly max: number
    readonly slots: readonly ('root' | 'exts')[]
  }[]
}
