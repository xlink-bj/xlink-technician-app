import { afterEach, expect, it, vi } from 'vitest'
import { openMainRoute } from '@app/main-navigation'

afterEach(() => vi.unstubAllGlobals())

it('reports a failed root transition and leaves the entry retryable', async () => {
  const toast = vi.fn()
  let fail = true
  vi.stubGlobal('getCurrentPages', () => [{ route: 'pages/index/index' }])
  vi.stubGlobal('uni', {
    redirectTo: (options: { success: () => void; fail: () => void }) => {
      if (fail) options.fail()
      else options.success()
    },
    showToast: toast,
  })
  expect(await openMainRoute('workOrders')).toBe(false)
  expect(toast).toHaveBeenCalledWith({ title: '页面暂时无法打开，请重试', icon: 'none' })
  fail = false
  expect(await openMainRoute('workOrders')).toBe(true)
})
