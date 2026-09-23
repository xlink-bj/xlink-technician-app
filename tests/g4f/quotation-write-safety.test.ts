import { describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'

import { createUniApiCommandTransport } from '@adapters/api/uni-api-command-transport'

describe('G4-F Phase 1I no-live-write review safety', () => {
  it.each([
    'basic/order/upsert',
    'workflow/startWorkflow/order/null/child-definition-synthetic',
  ])('keeps %s fail-closed when the real-write feature flag is off', async (path) => {
    const request = vi.fn()
    const transport = createUniApiCommandTransport({
      apiBaseUrl: 'https://synthetic.invalid',
      getSessionRef: () => 'synthetic-session' as never,
      request,
    })
    await expect(transport.execute({ method: 'POST', path, body: { synthetic: true } }))
      .rejects.toMatchObject({ category: 'unsupported_capability' })
    expect(request).not.toHaveBeenCalled()
  })

  it('pins every browser review build to real writes disabled', async () => {
    const files = [
      '../../vite.uni-h5-g4f-review.config.ts',
      '../../vite.review.config.ts',
    ]
    const contents = await Promise.all(files.map((file) => readFile(new URL(file, import.meta.url), 'utf8')))
    for (const content of contents) expect(content).toContain("import.meta.env.VITE_XLINK_ENABLE_REAL_WRITES': JSON.stringify('false')")
  })

  it('keeps the real quotation confirmation explicit and separate from workflow completion', async () => {
    const page = await readFile(new URL('../../src/pages/work-orders/action-workspace.vue', import.meta.url), 'utf8')
    const quotationWorkspace = await readFile(new URL('../../src/features/work-orders/quotation/QuotationActionWorkspace.vue', import.meta.url), 'utf8')
    const workspace = await readFile(new URL('../../src/features/work-orders/action-workspace.ts', import.meta.url), 'utf8')
    const adapter = await readFile(new URL('../../src/adapters/api/quotation-order-commands.ts', import.meta.url), 'utf8')
    expect(page).toContain('<QuotationActionWorkspace')
    expect(quotationWorkspace).toContain(':can-submit="workspace.canSubmitQuotation"')
    expect(quotationWorkspace).toContain('data-testid="quotation-order-confirmation"')
    expect(quotationWorkspace).toContain('@tap="confirmQuotationSubmit"')
    expect(workspace).toContain('expectedDraftVersion: currentDraft.draftVersion')
    expect(workspace).toContain('engine.draftVersion !== currentDraft.draftVersion')
    expect(adapter).toContain("path: 'basic/order/upsert'")
    expect(adapter).not.toContain('workflow/process')
    expect(adapter).not.toContain('completeWorkflowNode')
  })
})
