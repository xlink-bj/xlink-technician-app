import { describe, expect, it } from 'vitest'
import { appointmentPresentation } from '../../src/pages/work-orders/appointment-presentation'

const base = { draftStatus: 'saved_local', lifecycle: 'draft_local', canSubmit: false, inputsValid: true,
  transitioning: false, executionEnabled: false, localPreview: true } as const

describe('appointment local draft and execution feedback', () => {
  it('does not turn a saved or restored local draft into permission to confirm', () => {
    for (const draftStatus of ['saved_local', 'restore_available', 'dirty', 'saving', 'save_failed'] as const) {
      const result = appointmentPresentation({ ...base, draftStatus })
      expect(result.canContinue).toBe(false)
      expect(result.reason).toBe('当前为填写预览，预约确认尚未开放。')
      expect(result.draftCopy).not.toMatch(/可继续|已完成|预约成功/)
    }
    expect(appointmentPresentation({ ...base, draftStatus: 'restore_available' }).draftCopy).toContain('请核对预约日期和时间')
  })
  it('does not mask a read-only restriction with invalid-input guidance', () => {
    expect(appointmentPresentation({ ...base, localPreview: false, inputsValid: false }).reason)
      .toBe('当前操作仅支持查看，不能确认预约。')
    expect(appointmentPresentation({ ...base, executionEnabled: true, inputsValid: false }).reason).toContain('字段的格式')
    expect(appointmentPresentation({ ...base, executionEnabled: true }).reason).toContain('尚未就绪')
  })
  it('projects the original command/field/navigation gates without adding date policy', () => {
    for (const canSubmit of [true, false]) for (const inputsValid of [true, false]) for (const transitioning of [true, false]) {
      expect(appointmentPresentation({ ...base, executionEnabled: true, canSubmit, inputsValid, transitioning }).canContinue)
        .toBe(canSubmit && inputsValid && !transitioning)
    }
    expect(appointmentPresentation({ ...base, canSubmit: true, executionEnabled: true }).reason).toBe('')
    expect(appointmentPresentation({ ...base, lifecycle: 'submitting' }).reason).toContain('请勿重复')
    expect(appointmentPresentation({ ...base, lifecycle: 'succeeded' }).draftCopy).toBe('')
  })
})
