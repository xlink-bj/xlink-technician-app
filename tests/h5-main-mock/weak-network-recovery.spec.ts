import { expect, test } from '@playwright/test'

test('430×932 offline editing, multi-FormDef isolation, restart recovery and explicit submission', async ({ page, context }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  const external: string[] = [], errors: string[] = []
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://localhost:5174') return route.continue()
    external.push(url.origin + url.pathname)
    return route.abort('blockedbyclient')
  })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/#/pages/index/index?devReview=1')
  await page.goto('/#/pages/work-orders/detail?id=mock-work-order-020-local-forms')
  await expect(page.getByTestId('a-stage-special-panel')).toBeVisible()
  const field = (key: string) => page.getByTestId(`a-special-field-${key}`)
  const savedDraftField = (formDefinitionId: string, fieldId: string) => page.evaluate(({ formDefinitionId, fieldId }) => {
    const record = Object.keys(localStorage).flatMap(key => {
      try { return [JSON.parse(localStorage.getItem(key) ?? 'null') as { identity?: { workOrderId?: string; workflowNodeId?: string; contentIdentity?: string }; values?: Record<string, unknown> } | null] }
      catch { return [] }
    }).find(item => item?.identity?.workOrderId === 'mock-work-order-020-local-forms'
      && item.identity.workflowNodeId === 'mock-workflow-node-020-forms'
      && item.identity.contentIdentity === JSON.stringify([formDefinitionId, null]))
    return record?.values?.[fieldId] ?? null
  }, { formDefinitionId, fieldId })
  const expectSavedDraftField = async (formDefinitionId: string, fieldId: string, value: string) => {
    await expect.poll(() => savedDraftField(formDefinitionId, fieldId)).toBe(value)
  }
  await field('inspectionSummary').locator('textarea').fill('断网前的现场记录')
  await field('inspectionResult').locator('.app-choice').filter({ hasText: '需要跟进' }).click()
  await expect(page.getByTestId('a-special-local-draft')).toContainText('已保存到本机')
  await context.setOffline(true)
  await expect(page.getByTestId('a-special-offline')).toBeVisible()
  await field('inspectionSummary').locator('textarea').fill('断网期间继续填写，重启不能丢失')
  await expectSavedDraftField('mock-form-definition-inspection', 'inspectionSummary', '断网期间继续填写，重启不能丢失')
  await page.getByTestId('a-special-save').click()
  await expect(page.getByTestId('a-special-operation-feedback')).toContainText('连接恢复后请主动保存')
  await expect(page.getByTestId('a-special-row-mock-special-form-data-forms-1')).toHaveCount(0)
  await page.getByTestId('a-special-definition-choice').locator('.app-choice').filter({ hasText: '服务备注' }).click()
  await field('note').locator('textarea').fill('另一表单的独立离线草稿')
  await expectSavedDraftField('mock-form-definition-local-note', 'note', '另一表单的独立离线草稿')
  await page.getByTestId('a-special-definition-choice').locator('.app-choice').filter({ hasText: '现场记录' }).click()
  await expect(page.getByTestId('a-special-local-draft')).toContainText('已恢复本机草稿')
  await expect(field('inspectionSummary').locator('textarea')).toHaveValue('断网期间继续填写，重启不能丢失')
  await context.setOffline(false)
  await expect(page.getByTestId('a-special-offline')).toHaveCount(0)
  // Network notification only changes feedback. It never dispatches a command.
  await expect(page.getByTestId('a-special-row-mock-special-form-data-forms-1')).toHaveCount(0)
  const url = page.url()
  // A second Work Order / node owns another draft, never a global currentDraft.
  await page.goto('/#/pages/work-orders/detail?id=mock-work-order-021-local-repeat')
  await page.reload()
  await expect(page.getByText('田女士', { exact: true }).first()).toBeVisible()
  await expect(field('inspectionSummary').locator('textarea')).toHaveValue('')
  await field('inspectionSummary').locator('textarea').fill('第二工单独立草稿')
  await expect(page.getByTestId('a-special-local-draft')).toContainText('已保存到本机')
  await page.close()
  page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 430, height: 932 })
  await page.goto(url)
  await expect(field('inspectionSummary').locator('textarea')).toHaveValue('断网期间继续填写，重启不能丢失')
  await expect(page.getByTestId('a-special-local-draft')).toContainText('已恢复本机草稿')
  await page.getByTestId('a-special-save').click()
  await expect(page.getByTestId('a-special-row-mock-special-form-data-forms-1')).toContainText('断网期间继续填写')
  await page.reload()
  await expect(field('inspectionSummary').locator('textarea')).toHaveValue('')
  await page.getByTestId('a-special-definition-choice').locator('.app-choice').filter({ hasText: '服务备注' }).click()
  await expect(field('note').locator('textarea')).toHaveValue('另一表单的独立离线草稿')
  await page.getByTestId('a-special-edit-mock-special-form-data-forms-1').click()
  await field('inspectionSummary').locator('textarea').fill('已保存记录上的未提交修改')
  await expect(page.getByTestId('a-special-local-draft')).toContainText('已保存到本机')
  await page.reload()
  await expect(field('inspectionSummary').locator('textarea')).toHaveValue('')
  await page.getByTestId('a-special-edit-mock-special-form-data-forms-1').click()
  await expect(field('inspectionSummary').locator('textarea')).toHaveValue('已保存记录上的未提交修改')
  await expect(page.getByTestId('a-special-row-mock-special-form-data-forms-1')).toContainText('断网期间继续填写')
  await page.goto('/#/pages/work-orders/detail?id=mock-work-order-021-local-repeat')
  await page.reload()
  await expect(page.getByText('田女士', { exact: true }).first()).toBeVisible()
  await expect(field('inspectionSummary').locator('textarea')).toHaveValue('第二工单独立草稿')
  expect(external).toEqual([])
  expect(errors).toEqual([])
})

test('430×932 failed submit / lost Mock commit ACK preserves draft and never replays on restart', async ({ page, context }) => {
  const external: string[] = []
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://localhost:5174') return route.continue()
    external.push(url.origin + url.pathname)
    return route.abort('blockedbyclient')
  })
  await page.setViewportSize({ width: 430, height: 932 })
  await page.goto('/#/pages/index/index?devReview=1')
  await page.goto('/#/pages/work-orders/detail?id=mock-work-order-020-local-forms')
  await page.getByTestId('a-special-field-inspectionSummary').locator('textarea').fill('回执丢失也必须保留的草稿')
  await page.getByTestId('a-special-field-inspectionResult').locator('.app-choice').filter({ hasText: '需要跟进' }).click()
  await expect(page.getByTestId('a-special-local-draft')).toContainText('已保存到本机')
  // The existing local Mock server commits, then its acknowledgement is lost.
  // Inject at the browser persistence boundary; no product fault toggle/API.
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      original.call(this, key, value)
      if (key === 'xlink.dev.mock.r1-special.020-021.v1') {
        Storage.prototype.setItem = original
        throw new Error('Synthetic lost commit acknowledgement')
      }
    }
  })
  await page.getByTestId('a-special-save').click()
  await expect(page.getByTestId('a-special-error')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('a-special-receipt-pending')).toBeVisible()
  await expect(page.getByTestId('a-special-unresolved')).toBeVisible()
  await expect(page.getByTestId('a-special-local-draft')).toContainText('已恢复本机草稿')
  // FormData may exist while EXTS never acknowledged it: do not fabricate a saved UI row.
  await expect(page.getByTestId('a-special-row-mock-special-form-data-forms-1')).toHaveCount(0)
  await expect(page.getByTestId('a-special-row-mock-special-form-data-forms-2')).toHaveCount(0)
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem(
    'xlink.dev.mock.r1-special.020-021.v1')!).rows).filter(id => id.startsWith('mock-special-form-data-forms-')).length)).toBe(1)
  await expect(page.getByTestId('a-special-save')).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('a-special-receipt-pending')).toBeVisible()
  await expect(page.getByTestId('a-special-local-draft')).toContainText('已恢复本机草稿')
  await expect(page.getByTestId('a-special-row-mock-special-form-data-forms-2')).toHaveCount(0)
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem(
    'xlink.dev.mock.r1-special.020-021.v1')!).rows).filter(id => id.startsWith('mock-special-form-data-forms-')).length)).toBe(1)
  expect(external).toEqual([])
})

test('430×932 storage quota denial never acknowledges an unsaved draft; explicit retry recovers', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  await page.goto('/#/pages/index/index?devReview=1')
  await page.goto('/#/pages/work-orders/detail?id=mock-work-order-020-local-forms')
  const input = page.getByTestId('a-special-field-inspectionSummary').locator('textarea')
  await input.fill('容量故障前已经安全保存的内容')
  await expect(page.getByTestId('a-special-local-draft')).toContainText('已保存到本机')

  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    let rejected = false
    Storage.prototype.setItem = function (key, value) {
      if (!rejected && key.includes('draft:') && key.includes('action-workspace')) {
        rejected = true
        // Quota pressure must not be disguised as a successful local autosave.
        throw new DOMException('QuotaExceededError', 'QuotaExceededError')
      }
      return original.call(this, key, value)
    }
  })
  await input.fill('容量不足时尚未保存的修改')
  await expect(page.getByTestId('a-special-local-draft')).toContainText('本机保存失败')
  await page.reload()
  await expect(input).toHaveValue('容量故障前已经安全保存的内容')

  await input.fill('清理容量后主动重新填写并保存')
  await expect(page.getByTestId('a-special-local-draft')).toContainText('已保存到本机')
  await page.reload()
  await expect(input).toHaveValue('清理容量后主动重新填写并保存')
})

test('430×932 competing saved revision is not silently overwritten by a stale editor', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  await page.goto('/#/pages/index/index?devReview=1')
  await page.goto('/#/pages/work-orders/detail?id=mock-work-order-020-local-forms')
  const input = page.getByTestId('a-special-field-inspectionSummary').locator('textarea')
  await input.fill('当前会话最初保存的草稿')
  await expect(page.getByTestId('a-special-local-draft')).toContainText('已保存到本机')

  // Simulate a second editor updating the same identity between the first
  // editor's saves. The repository must preserve the newer stored revision.
  await page.evaluate(() => {
    const matches = Object.keys(localStorage).filter(key => key.startsWith('draft:action-workspace:3:'))
    if (matches.length !== 1) throw new Error('Expected one role-scoped form draft')
    const key = matches[0]!
    const original = localStorage.getItem(key)
    if (!original) throw new Error('Saved draft not found')
    const newer = JSON.parse(original)
    newer.updatedAt = '2099-01-01T00:00:00.000Z'
    newer.values.inspectionSummary = '并行会话已保存的新草稿'
    localStorage.setItem(key, JSON.stringify(newer))
  })
  await input.fill('旧会话晚到的修改不能覆盖')
  await expect(page.getByTestId('a-special-local-draft')).toContainText('本机保存失败')
  await page.reload()
  await expect(input).toHaveValue('并行会话已保存的新草稿')
})
