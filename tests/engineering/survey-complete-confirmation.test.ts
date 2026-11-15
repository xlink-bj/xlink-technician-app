import { describe, expect, it, vi } from 'vitest'
import { useSurveyCompleteConfirmation } from '@features/work-orders/survey-complete-confirmation'

describe('platform-neutral completion confirmation', () => {
  it('keeps cancel separate from completion', async () => {
    const submit = vi.fn(async () => {})
    const confirmation = useSurveyCompleteConfirmation(() => true, submit)
    confirmation.open.value = true
    expect(confirmation.close()).toBe(true)
    expect(confirmation.close()).toBe(false)
    await confirmation.confirm()
    expect(submit).not.toHaveBeenCalled()
  })
  it('rechecks current eligibility after the confirmation has opened', async () => {
    let permitted = true
    const submit = vi.fn(async () => {})
    const confirmation = useSurveyCompleteConfirmation(() => permitted, submit)
    confirmation.open.value = true
    permitted = false
    await confirmation.confirm()
    expect(submit).not.toHaveBeenCalled()
    expect(confirmation.open.value).toBe(true)
  })
  it('closes before awaiting completion so a second confirmation cannot replay', async () => {
    let release!: () => void
    const submit = vi.fn(() => new Promise<void>(resolve => { release = resolve }))
    const confirmation = useSurveyCompleteConfirmation(() => true, submit)
    confirmation.open.value = true
    const first = confirmation.confirm()
    await confirmation.confirm()
    expect(submit).toHaveBeenCalledTimes(1)
    release(); await first
  })
})
