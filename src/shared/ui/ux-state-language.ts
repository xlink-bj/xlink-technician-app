/** B1 display vocabulary. UI feedback does not grant capabilities or change persistence. */
export const uxStateLanguage = {
  draft: '本机报价草稿 · 未提交后台',
  draftAction: '新建报价草稿',
  draftResumeAction: '继续本机报价草稿',
  syntheticOrder: '体验数据已保存至本机 · 未提交后台',
  syntheticOrderPending: '本机记录尚未确认保存，请先核对结果。',
  syntheticNode: '本机记录已完成 · 未提交后台',
  scopedOrders: '仅显示本次可见订单（最多 3 笔）；不代表全部历史记录。',
  scopedOrdersPending: '订单记录仅可只读核对；本次读取未完成，不能判断有无订单。',
  scopedOrderReadTitle: '本次未查到可见订单',
  scopedOrderRead: '本次未查到可见订单；不代表完整历史为空。',
  verifiedOrder: '订单已核验 · 仅可查看',
  syntheticOrderVerified: '体验订单已核对 · 未提交后台',
  signingReadOnly: '当前仅可查看进度；签署、短信及合同文件操作未开放。',
  pendingReceipt: '结果待核对，请勿重复提交。',
} as const
