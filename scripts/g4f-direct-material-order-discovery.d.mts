export interface DirectMaterialOrderPageInspection {
  readonly state:
    | 'UNKNOWN_INVALID_INPUT'
    | 'ORDER_ASSOCIATION_CONFLICT'
    | 'FOUND'
    | 'NO_DIRECT_MATERIAL_LINES'
  readonly orders: number
  readonly directMaterialLines: number
}

export function inspectDirectMaterialOrderPage(
  expectedWorkOrderId: string,
  page: unknown,
): DirectMaterialOrderPageInspection
