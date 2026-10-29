/** B1 display vocabulary. UI feedback does not grant capabilities or change persistence. */
export const uxStateLanguage = {
  draft: '报价草稿',
  draftAction: '新建报价草稿',
  draftResumeAction: '继续编辑报价草稿',
  syntheticOrder: '报价记录已保存，可继续核对详情。',
  syntheticOrderPending: '报价记录尚未确认保存，请先核对结果。',
  syntheticNode: '现场记录已完成',
  scopedOrders: '仅显示本次可见订单（最多 3 笔）；不代表全部历史记录。',
  scopedOrdersPending: '订单记录仅可只读核对；本次读取未完成，不能判断有无订单。',
  scopedOrderReadTitle: '本次未查到可见订单',
  scopedOrderRead: '本次未查到可见订单；不代表完整历史为空。',
  verifiedOrder: '订单已核验 · 仅可查看',
  syntheticOrderVerified: '订单状态已核对',
  signingReadOnly: '当前仅可查看进度；签署、短信及合同文件操作未开放。',
  pendingReceipt: '结果待核对，请勿重复提交。',
} as const
