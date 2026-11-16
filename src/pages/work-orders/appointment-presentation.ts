import type { AppActionDraftStatus, AppActionLifecycle } from '@shared/ui/types'

/** Presentation only: never grants execution or changes field/date validation. */
export function appointmentPresentation(input: {
  draftStatus: AppActionDraftStatus
  lifecycle: AppActionLifecycle
  canSubmit: boolean
  inputsValid: boolean
  transitioning: boolean
  executionEnabled: boolean
  localPreview: boolean
}) {
  const canContinue = input.canSubmit && input.inputsValid && !input.transitioning
  const reason = input.lifecycle === 'submitting' ? '正在提交预约，请勿重复操作。'
    : input.transitioning ? '正在打开下一页，请稍候。'
    : input.lifecycle === 'succeeded' ? ''
    : !input.executionEnabled ? (input.localPreview
      ? '当前为填写预览，预约确认尚未开放。'
      : '当前操作仅支持查看，不能确认预约。')
    : !input.inputsValid ? '请检查输入字段的格式，修正后继续。'
    : !input.canSubmit ? '预约信息尚未就绪，请返回工单重新进入。' : ''
  const draftCopy = input.lifecycle === 'succeeded' ? ''
    : input.draftStatus === 'restore_available' ? '已恢复本机草稿，尚未确认预约。请核对预约日期和时间。'
    : input.draftStatus === 'saved_local' ? '草稿已保存在本机，尚未确认预约。'
    : input.draftStatus === 'saving' ? '正在保存本机草稿，尚未确认预约。'
    : input.draftStatus === 'save_failed' ? '本机草稿保存失败，请保留当前页面。'
    : input.draftStatus === 'dirty' ? '当前修改尚未保存，尚未确认预约。' : ''
  return { canContinue, reason, draftCopy }
}
