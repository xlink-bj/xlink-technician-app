/** Synthetic contents with R1 ExtField/Code wire shapes. No Production schema claim. */
export function mockOrderFieldsRead(route: string, body: Readonly<Record<string, unknown>>): unknown | undefined {
  if (route === 'biz/extField/query' && body.colName === 'order'
    && body['is:state|integer#and'] === '1' && body['in:showList|string#and'] === '4'
    && body.page === 1 && body.size === 50 && body.sortField === 'order' && body.sortOrder === 'asc' && body._all === undefined) {
    const base = { colName: 'order', state: 1, showList: [4], frontEndConfig: { showType: 'placeOrder' } }
    return { total: 9, data: [
      { ...base, _id: 'mock-order-files', name: 'mockOrderFiles', nameDisp: '报价附件', type: 'file', required: '0' },
      { ...base, _id: 'mock-submit-files', name: 'mockSubmitFiles', nameDisp: '下单附件', type: 'file', required: '0', frontEndConfig: { showType: 'submitOrder' } },
      { ...base, _id: 'mock-order-person', name: 'personType', nameDisp: '客户类型', type: 'radio', required: '1', valueOption: 'mock-order-person-code', frontEndConfig: { showType: 'submitOrder' } },
      { ...base, _id: 'mock-order-submit-note', name: 'mockSubmitNote', nameDisp: '下单确认说明', type: 'textarea', required: '1', frontEndConfig: { showType: 'submitOrder', personType: '0' } },
      { ...base, _id: 'mock-order-mode', name: 'mockOrderMode', nameDisp: '是否需要补充说明', type: 'radio', required: '1', valueOption: 'mock-order-mode-code' },
      { ...base, _id: 'mock-order-note', name: 'mockOrderNote', nameDisp: '报价补充说明', type: 'textarea', required: '1', frontEndConfig: {
        showType: 'placeOrder', showField: 'mockOrderMode', showValue: 'yes', dispensableField: 'mockOrderMode', dispensableValue: 'no',
      } },
      { ...base, _id: 'mock-order-number', name: 'mockOrderNumber', nameDisp: '工程量补充值', type: 'digit', required: '0' },
      { ...base, _id: 'mock-order-area', name: 'mockOrderArea', nameDisp: '省市区', type: 'area', required: '0' },
      { ...base, _id: 'mock-order-path', name: 'mockOrderPath', nameDisp: '施工区域', type: 'cascade', required: '0', valueOption: 'mock-order-region-code' },
    ] }
  }
  if (route === 'i/code/selectCode.do' && body.jsonPara === JSON.stringify([{ codeId: 'mock-order-person-code', eleid: 'mock-order-person-code' }])) {
    return [{ eleid: 'mock-order-person-code', options: { '0': '客户' } }]
  }
  if (route === 'i/code/selectCode.do' && body.jsonPara === JSON.stringify([{ codeId: 'mock-order-mode-code', eleid: 'mock-order-mode-code' }])) {
    return [{ eleid: 'mock-order-mode-code', options: { yes: '是', no: '否' } }]
  }
  if (route === 'i/code/selectMultistageCode.do' && body.types === 'mock-order-region-code') {
    return [{ type: 'mock-order-region-code', children: [{ value: 'mock-region', name: '示例区域', children: [{ value: 'mock-site', name: '施工现场' }] }] }]
  }
  return undefined
}
