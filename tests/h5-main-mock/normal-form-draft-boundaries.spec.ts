import { test, expect, type Page } from '@playwright/test'
import { fixture, read, enter, open } from '../support/normal-form-draft-fixture'
import { enterNormalFormWorkspace } from '../support/normal-form-workspace-entry'

test.beforeEach(({}, info) => {
  test.skip(info.config.metadata.normalFormDraftBoundaries !== true, 'Dedicated synthetic draft boundary configuration only')
})
const memo = (page: Page) => page.getByTestId('r1-normal-input-memo').getByRole('textbox')
const storedDrafts = (page: Page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage)
  .filter(key => key.startsWith('draft:')).sort().map(key => [key, localStorage.getItem(key)])))
async function assertFenced(page: Page) {
  await expect(page.getByTestId('r1-normal-draft-status')).toContainText('结果尚未核实')
  for (const id of ['r1-normal-draft-restore', 'r1-normal-draft-discard', 'r1-normal-save'])
    await expect(page.getByTestId(id)).toHaveCount(0)
}
async function freshLoginDetail(page: Page) {
  await page.reload()
  await page.goto('/#/pages/index/index')
  await page.locator('.launch-cta').click()
  await page.locator('.method-card').filter({ hasText: '快捷登录' }).click()
  await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click()
  await page.locator('.work-order-card').first().click()
  await expect(page).toHaveURL(/pages\/work-orders\/detail/)
}

for (const identity of ['user', 'role'] as const) for (const pending of [false, true])
  test(`${identity} login change preserves ${pending ? 'uncertain fence' : 'editing draft'} without granting recovery`, async ({ page, baseURL }, info) => {
    const { state } = await fixture(page, baseURL!, pending ? 'lost-ack' : 'save')
    await open(page)
    await memo(page).fill('原身份的未提交内容')
    await expect(page.getByTestId('r1-normal-draft-status')).toContainText('保存在本机')
    if (pending) {
      await page.getByTestId('r1-normal-save').click()
      await expect(page.getByTestId('r1-normal-draft-status')).toContainText('结果尚未核实')
      expect(state.writes).toEqual(['biz/extForm/upsert/e'])
    }
    const original = await storedDrafts(page), originalWrites = [...state.writes]
    expect(Object.keys(original).length).toBeGreaterThan(0)
    if (identity === 'user') state.loginUser = 'other-user'
    else state.loginRole = 'other-role'
    const beforeOtherActorReads = state.calls.length
    await freshLoginDetail(page)
    if (identity === 'role') {
      // Refusal happens before a form reader is offered, not at draft restore.
      await expect(page.getByTestId('r1-normal-form-read')).toHaveCount(0)
      expect(state.calls.slice(beforeOtherActorReads).filter(path => path.startsWith('biz/extForm/') || path === 'biz/extField/query')).toEqual([])
    } else {
      await enterNormalFormWorkspace(page)
      await read(page)
    }
    for (const id of ['r1-normal-draft-restore', 'r1-normal-save', 'r1-normal-input-memo'])
      await expect(page.getByTestId(id)).toHaveCount(0)
    expect(await storedDrafts(page)).toEqual(original)
    expect(state.writes).toEqual(originalWrites)
    await page.screenshot({ path: info.outputPath('other-identity-isolated.png'), fullPage: true })

    state.loginUser = 'u'; state.loginRole = 'r'
    await freshLoginDetail(page); await enterNormalFormWorkspace(page); await read(page)
    if (pending) {
      await assertFenced(page)
      expect(await storedDrafts(page)).toEqual(original)
    } else {
      await page.getByTestId('r1-normal-draft-restore').click()
      await expect(memo(page)).toHaveValue('原身份的未提交内容')
    }
    expect(state.writes).toEqual(originalWrites)
    expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([])
    await page.screenshot({ path: info.outputPath('original-identity-returned.png'), fullPage: true })
  })

test('acknowledged writes with failed readback remain fenced even after a successful fresh read', async ({ page, baseURL }, info) => {
  const { state, node } = await fixture(page, baseURL!, 'failed-readback')
  await open(page); await memo(page).fill('已写入但完整结果未核实')
  await page.getByTestId('r1-normal-save').click()
  await expect(page.getByTestId('r1-normal-draft-status')).toContainText('结果尚未核实')
  expect(state.writes).toEqual(['biz/extForm/upsert/e', 'workflowNode/updateExts/n'])
  const original = await storedDrafts(page)
  state.failRead = false
  await page.reload(); await enter(page); await read(page)
  await assertFenced(page)
  await expect(page.getByTestId('r1-normal-value-memo')).toHaveText('已写入但完整结果未核实')
  // A visible saved row is evidence of data, not permission to replay the transaction.
  await read(page); await assertFenced(page)
  expect(await storedDrafts(page)).toEqual(original)
  expect(state.writes).toEqual(['biz/extForm/upsert/e', 'workflowNode/updateExts/n'])
  expect(node.state).toBe(0)
  expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([])
  await page.screenshot({ path: info.outputPath('saved-row-with-unresolved-transaction.png'), fullPage: true })
})

test('uncertain save survives a full browser restart without another dispatch', async ({ playwright, baseURL }, info) => {
  const profile = info.outputPath('synthetic-profile')
  const options = { viewport: { width: 430, height: 932 }, serviceWorkers: 'block' as const,
    ...(process.env.XLINK_DRAFT_CHROME === 'true' ? { channel: 'chrome' } : {}) }
  let context = await playwright.chromium.launchPersistentContext(profile, options)
  const ledgers: unknown[] = []
  try {
    let page = context.pages()[0] ?? await context.newPage()
    const first = await fixture(page, baseURL!, 'lost-ack'); ledgers.push(first.state)
    await open(page); await memo(page).fill('重启也不能重复提交')
    await page.getByTestId('r1-normal-save').click()
    await expect(page.getByTestId('r1-normal-draft-status')).toContainText('结果尚未核实')
    const original = await storedDrafts(page)
    expect(first.state.writes).toEqual(['biz/extForm/upsert/e'])
    await context.close()
    context = await playwright.chromium.launchPersistentContext(profile, options)
    page = context.pages()[0] ?? await context.newPage()
    const second = await fixture(page, baseURL!, 'save'); ledgers.push(second.state)
    // Preserve the independent synthetic server, never inject the local draft or a capability.
    second.state.saved = structuredClone(first.state.saved)
    second.node.exts = structuredClone(first.node.exts)
    await enter(page); await read(page); await assertFenced(page)
    expect(await storedDrafts(page)).toEqual(original)
    expect(second.state.writes).toEqual([])
    for (const state of [first.state, second.state]) {
      expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([])
    }
    await page.screenshot({ path: info.outputPath('cold-restart-fenced.png'), fullPage: true })
  } finally {
    await context.close()
    await info.attach('cold-uncertain-ledgers', { body: JSON.stringify(ledgers), contentType: 'application/json' })
  }
})

test('failure to persist the pre-dispatch fence sends no command and permits explicit recovery after reload', async ({ page, baseURL }, info) => {
  const { state } = await fixture(page, baseURL!, 'save')
  await open(page); await memo(page).fill('提交前本机保护失败')
  await expect(page.getByTestId('r1-normal-draft-status')).toContainText('保存在本机')
  const original = await storedDrafts(page)
  await page.evaluate(() => {
    const api = (window as any).uni, set = api.setStorage.bind(api)
    api.setStorage = (request: any) => request.key.startsWith('draft:') && JSON.parse(request.data).values.state === 'uncertain'
      ? request.fail?.({ errMsg: 'synthetic fence write failure' }) : set(request)
  })
  await page.getByTestId('r1-normal-save').click()
  await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('尚未提交记录')
  expect(state.writes).toEqual([]); expect(await storedDrafts(page)).toEqual(original)
  await page.screenshot({ path: info.outputPath('not-dispatched.png'), fullPage: true })
  await page.reload(); await open(page); await page.getByTestId('r1-normal-draft-restore').click()
  await expect(memo(page)).toHaveValue('提交前本机保护失败')
  expect(state.writes).toEqual([])
  await page.getByTestId('r1-normal-save').click()
  await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('当前节点尚未完成')
  expect(state.writes).toEqual(['biz/extForm/upsert/e', 'workflowNode/updateExts/n'])
  expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([])
})

for (const failure of ['tombstone', 'removal'])
  test(`verified save remains factual when local ${failure} cleanup fails; no business replay`, async ({ page, baseURL }, info) => {
    const { state, node } = await fixture(page, baseURL!, 'save')
    await open(page); await memo(page).fill('后台保存与本机清理分开')
    await expect(page.getByTestId('r1-normal-draft-status')).toContainText('保存在本机')
    await page.evaluate(failure => {
      const api = (window as any).uni, set = api.setStorage.bind(api), remove = api.removeStorage.bind(api)
      if (failure === 'tombstone') api.setStorage = (request: any) => request.key.startsWith('draft:') && JSON.parse(request.data).status === 'completed'
        ? request.fail?.({ errMsg: 'synthetic cleanup write failure' }) : set(request)
      else api.removeStorage = (request: any) => request.key.startsWith('draft:')
        ? request.fail?.({ errMsg: 'synthetic cleanup removal failure' }) : remove(request)
    }, failure)
    await page.getByTestId('r1-normal-save').click()
    await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取，当前节点尚未完成')
    await expect(page.getByTestId('r1-normal-draft-status')).toContainText('记录已保存，本地草稿清理失败')
    const writes = ['biz/extForm/upsert/e', 'workflowNode/updateExts/n']
    expect(state.writes).toEqual(writes)
    await page.screenshot({ path: info.outputPath('saved-with-local-cleanup-failure.png'), fullPage: true })
    await page.reload(); await enter(page); await read(page)
    await expect(page.getByTestId('r1-normal-value-memo')).toHaveText('后台保存与本机清理分开')
    if (failure === 'tombstone') await assertFenced(page)
    else {
      await expect(page.getByTestId('r1-normal-draft-status')).toContainText('清理尚未完成')
      await expect(page.getByTestId('r1-normal-draft-restore')).toHaveCount(0)
      await page.getByTestId('r1-normal-draft-discard').click()
      await page.getByTestId('r1-normal-draft-discard-confirm').click()
      await expect(page.getByTestId('r1-normal-draft-status')).toContainText('已丢弃')
      expect(await storedDrafts(page)).toEqual({})
    }
    expect(state.writes).toEqual(writes); expect(node.state).toBe(0)
    expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([])
  })
