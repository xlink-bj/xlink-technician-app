import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useActionWorkspaceStore } from '@features/work-orders/action-workspace'

describe('Production quotation workspace read-only gate', () => {
  afterEach(() => vi.unstubAllEnvs())

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
  })

  it('keeps existing server Order edit and submit unavailable without invoking a read or command', async () => {
    const workspace = useActionWorkspaceStore()
    const orderRead = {
      getQuotationOrderById: vi.fn(),
      listTypeOneOrdersForWorkOrder: vi.fn(),
    }
    const orderCommand = {
      startOrderWorkflow: vi.fn(),
      upsertOfficialOrder: vi.fn(),
    }
    workspace.configure({
      apiRead: {} as never,
      commandApi: {} as never,
      quotationOrderRead: orderRead,
      quotationOrderCommand: orderCommand,
      draftRepository: {} as never,
      navigation: {} as never,
      getSession: () => null,
    })

    const edit = await workspace.loadQuotationOrderForEdit('synthetic-server-order')
    const submit = await workspace.submitQuotationOrder()

    expect(edit).toMatchObject({ state: 'failed_terminal', error: { category: 'unsupported_capability' } })
    expect(workspace.quotationEditState).toMatchObject({ state: 'blocked' })
    expect(workspace.quotationEditState.message).toContain('不能加载到可编辑草稿')
    expect(submit).toMatchObject({ state: 'failed_terminal', message: '生产环境仅开放报价只读查看；不会提交或修改订单。' })
    expect(workspace.canSubmitQuotation).toBe(false)
    expect(workspace.quotationComposition.localState).toBe('idle')
    expect(orderRead.getQuotationOrderById).not.toHaveBeenCalled()
    expect(orderRead.listTypeOneOrdersForWorkOrder).not.toHaveBeenCalled()
    expect(orderCommand.startOrderWorkflow).not.toHaveBeenCalled()
    expect(orderCommand.upsertOfficialOrder).not.toHaveBeenCalled()
  })
})
