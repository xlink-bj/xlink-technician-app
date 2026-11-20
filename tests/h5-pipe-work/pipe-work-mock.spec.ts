import { expect, test, type Page, type TestInfo } from '@playwright/test'

const entryRoute = '/#/pages/index/index?devReview=1'
const workRoute = '/#/pages/work-orders/pipe-work-mock'
const orderKeyPart = 'vpipe-no-card-order-v1'
const pressureJobId = 'mock-pipe-pressure-job-002'
const pressureKeyPart = 'vpipe-pressure-draft-v1'
const pressureHistoryKeyPart = 'vdevice-action-content-v1'

async function guardNetwork(page: Page, baseURL: string, info: TestInfo) {
  const blocked: string[] = []
  const errors: string[] = []
  const origin = new URL(baseURL).origin
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === origin && request.method() === 'GET'
      && !['xhr', 'fetch'].includes(request.resourceType())) return route.continue()
    blocked.push(`${request.method()} ${url.origin}${url.pathname}`)
    return route.abort('blockedbyclient')
  })
  await page.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).host === new URL(origin).host) return socket.connectToServer()
    blocked.push('external WebSocket')
    socket.close()
  })
  return async () => {
    await info.attach('network-ledger', { body: JSON.stringify({ blocked, errors }), contentType: 'application/json' })
    expect(blocked).toEqual([])
    expect(errors).toEqual([])
  }
}

async function openPipeHome(page: Page) {
  await page.goto(entryRoute)
  await expect(page.getByTestId('qa-console')).toBeVisible()
  await page.getByTestId('pipe-work-mock-entry').click()
  await expect(page.getByTestId('pipe-home')).toBeVisible()
}

async function capture(page: Page, info: TestInfo, name: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await info.attach(name, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' })
}

async function installWriteFault(page: Page, keyPart: string, appliesWrite: boolean) {
  await page.evaluate(({ keyPart, appliesWrite }) => {
    type Options = { key: string; success?: (result: unknown) => void; fail?: (result: unknown) => void }
    const runtime = (window as unknown as { uni: { setStorage: (options: Options) => void } }).uni
    const original = runtime.setStorage.bind(runtime)
    runtime.setStorage = options => {
      if (!options.key.includes(keyPart)) return original(options)
      runtime.setStorage = original
      const fail = () => options.fail?.({ errMsg: 'Synthetic local storage receipt lost' })
      if (appliesWrite) original({ ...options, success: fail })
      else fail()
    }
  }, { keyPart, appliesWrite })
}

async function countLocalRows(page: Page, keyPart: string) {
  return page.evaluate(part => Object.keys(localStorage).filter(key => key.includes(part)).length, keyPart)
}

async function openPressure(page: Page) {
  await openPipeHome(page)
  await page.getByTestId('pipe-open-pressure').click()
  await expect(page).toHaveURL(new RegExp(pressureJobId + '$'))
  await expect(page.getByTestId('pipe-pressure-editor')).toBeVisible()
  await expect(page.getByTestId('pipe-pressure-status')).toBeVisible()
}

async function localRows(page: Page, keyPart: string): Promise<readonly [string, string | null][]> {
  return page.evaluate(part => Object.keys(localStorage).filter(key => key.includes(part))
    .sort().map(key => [key, localStorage.getItem(key)]), keyPart)
}

async function replaceFixtureSchema(page: Page, keyPart: string) {
  // Synthetic future-schema fixture. Preserve every other stored byte/record.
  return page.evaluate(part => {
    const key = Object.keys(localStorage).find(name => name.includes(part))
    if (!key) throw Error('Expected one synthetic record')
    const raw = localStorage.getItem(key)!
    const changed = raw.replace(/(pipeWork.{0,80}?schema.{1,4}:)1/, (_, prefix: string) => prefix + '2')
    if (changed === raw) throw Error('Expected a versioned local record')
    localStorage.setItem(key, changed)
    return changed
  }, keyPart)
}

async function createExistingPressureHistory(page: Page) {
  await page.goto(entryRoute)
  await page.getByTestId('device-action-mock-entry').click()
  await page.getByTestId('device-connect').click()
  await page.getByTestId('device-start').click()
  await expect(page.getByTestId('device-result')).toBeVisible()
  await page.getByTestId('device-save').click()
  await expect(page.getByTestId('device-result')).toContainText(/本机保存\s*已核对/)
  expect(await countLocalRows(page, pressureHistoryKeyPart)).toBe(1)
}

test.describe('opted-in pipe work', () => {
  test.skip(process.env.XLINK_PIPE_WORK_DISABLED === 'true', 'requires the dedicated DEV opt-in')

  test('G11 creates one no-card order and reopens the same authorized record after reload', async ({ page, baseURL }, info) => {
    const assertLocal = await guardNetwork(page, baseURL!, info)
    await openPipeHome(page)
    await page.getByTestId('pipe-open-order').click()
    await expect(page.getByTestId('pipe-order-missing')).toBeVisible()
    await page.getByTestId('pipe-back-home').click()
    await page.getByTestId('pipe-open-create').click()
    const form = page.getByTestId('pipe-order-note').locator('input')
    const save = page.getByTestId('pipe-order-save')
    await form.fill('合成房间管道安装')
    await page.getByTestId('pipe-subject-options').getByText('未分配的演示服务点', { exact: true }).click()
    await expect(page.getByTestId('pipe-subject-denied')).toBeVisible()
    await expect(save).toHaveAttribute('aria-disabled', 'true')
    expect(await countLocalRows(page, orderKeyPart)).toBe(0)
    await page.getByTestId('pipe-subject-options').getByText('体验管道安装服务点', { exact: true }).click()
    await expect(save).toBeEnabled()
    await capture(page, info, 'G11-无卡建单')
    await save.click()
    await expect(page.getByTestId('pipe-order-number')).toHaveText('MOCK-GD-001')
    await expect(page.getByTestId('pipe-order-reopened')).toContainText('尚未提交业务')
    await expect(page.getByTestId('pipe-order-read-note')).toHaveText('合成房间管道安装')
    expect(await countLocalRows(page, orderKeyPart)).toBe(1)

    await page.getByTestId('pipe-back-home').click()
    await page.getByTestId('pipe-open-order').click()
    await expect(page).toHaveURL(/id=mock-pipe-no-card-order-001/)
    await page.reload()
    await expect(page.getByTestId('pipe-order-number')).toHaveText('MOCK-GD-001')
    await expect(page.getByTestId('pipe-order-read-note')).toHaveText('合成房间管道安装')
    await expect(page.getByTestId('pipe-order-save')).toHaveCount(0)
    expect(await countLocalRows(page, orderKeyPart)).toBe(1)
    await capture(page, info, 'G11-同单重开')

    const incompatible = await replaceFixtureSchema(page, orderKeyPart)
    await page.reload()
    await expect(page.getByTestId('pipe-order-read-failed')).toBeVisible()
    await expect(page.getByTestId('pipe-order-save')).toHaveCount(0)
    await page.getByTestId('pipe-order-reread').click()
    await expect(page.getByTestId('pipe-order-read-failed')).toBeVisible()
    expect((await localRows(page, orderKeyPart))[0][1]).toBe(incompatible)

    await page.goto(workRoute + '?view=order&id=mock-order-other')
    await expect(page.getByTestId('pipe-blocked')).toBeVisible()
    await expect(page.getByTestId('pipe-order-number')).toHaveCount(0)
    await assertLocal()
  })

  for (const appliesWrite of [false, true]) {
    test(`G11 unknown local write is reconciled without replay, applied=${appliesWrite}`, async ({ page, baseURL }, info) => {
      const assertLocal = await guardNetwork(page, baseURL!, info)
      await openPipeHome(page)
      await page.getByTestId('pipe-open-create').click()
      await page.getByTestId('pipe-order-note').locator('input').fill('合成建单核对')
      await installWriteFault(page, orderKeyPart, appliesWrite)
      await page.getByTestId('pipe-order-save').click()
      await expect(page.getByTestId('pipe-order-unknown')).toBeVisible()
      await expect(page.getByTestId('pipe-order-save')).toHaveCount(0)
      await capture(page, info, 'G11-建单待核对')
      await page.getByTestId('pipe-order-reread').click()
      expect(await countLocalRows(page, orderKeyPart)).toBe(appliesWrite ? 1 : 0)
      if (appliesWrite) {
        await expect(page.getByTestId('pipe-order-read-note')).toHaveText('合成建单核对')
        await expect(page.getByTestId('pipe-order-save')).toHaveCount(0)
      } else {
        await expect(page.getByTestId('pipe-order-note').locator('input')).toHaveValue('合成建单核对')
        await expect(page.getByTestId('pipe-order-save')).toBeVisible()
      }
      await assertLocal()
    })
  }
  test('G19 restores partial unsubmitted fields under the same job without changing prior results', async ({ page, baseURL }, info) => {
    const assertLocal = await guardNetwork(page, baseURL!, info)
    await createExistingPressureHistory(page)
    const originalHistory = await localRows(page, pressureHistoryKeyPart)
    await openPressure(page)
    const jobUrl = page.url()
    const start = page.getByTestId('pipe-pressure-start').locator('input')
    const end = page.getByTestId('pipe-pressure-end').locator('input')
    const hold = page.getByTestId('pipe-pressure-minutes').locator('input')
    const status = page.getByTestId('pipe-pressure-status')
    const history = page.getByTestId('pipe-pressure-history')
    await expect(history).toContainText('第 1 轮')
    await page.getByTestId('pipe-pressure-history-0').click()
    await expect(page.getByTestId('pipe-pressure-history-detail')).toContainText('0.81 MPa')
    await expect(start).toHaveValue('')
    await expect(end).toHaveValue('')
    expect(await countLocalRows(page, pressureKeyPart)).toBe(0)

    await start.fill('0.90')
    await hold.fill('8')
    await expect(status).toContainText('本机草稿已保存，尚未提交')
    await expect(end).toHaveValue('')
    expect(await countLocalRows(page, pressureKeyPart)).toBe(1)
    expect(await localRows(page, pressureHistoryKeyPart)).toEqual(originalHistory)
    await capture(page, info, 'G19-未提交草稿')

    await page.getByTestId('pipe-back-home').click()
    await expect(page.getByTestId('pipe-home')).toBeVisible()
    await page.getByTestId('pipe-open-pressure').click()
    await expect(page).toHaveURL(jobUrl)
    await expect(status).toContainText('已恢复该作业')
    await expect(start).toHaveValue('0.90')
    await expect(hold).toHaveValue('8')
    await expect(end).toHaveValue('')
    await page.reload()
    await expect(status).toContainText('已恢复该作业')
    await expect(start).toHaveValue('0.90')
    await expect(hold).toHaveValue('8')
    await expect(end).toHaveValue('')
    await expect(history).toContainText('第 1 轮')
    await expect(history).not.toContainText('第 2 轮')
    await capture(page, info, 'G19-同任务恢复')
    for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      await expect(status).toBeInViewport()
      await capture(page, info, `G19-同任务恢复-${viewport.width}`)
    }
    expect(await localRows(page, pressureHistoryKeyPart)).toEqual(originalHistory)

    await page.goto(workRoute + '?view=pressure&id=mock-pressure-other-job')
    await expect(page.getByTestId('pipe-blocked')).toBeVisible()
    await expect(page.getByTestId('pipe-pressure-editor')).toHaveCount(0)
    await expect(page.getByTestId('pipe-pressure-history')).toHaveCount(0)
    await assertLocal()
  })

  test('G19 does not retry an ambiguous draft write automatically', async ({ page, baseURL }, info) => {
    const assertLocal = await guardNetwork(page, baseURL!, info)
    await openPressure(page)
    const start = page.getByTestId('pipe-pressure-start').locator('input')
    const status = page.getByTestId('pipe-pressure-status')
    await installWriteFault(page, pressureKeyPart, false)
    await start.fill('0.91')
    await expect(status).toContainText('本机保存结果待核对')
    await expect(start).toHaveValue('0.91')
    await expect(page.getByTestId('pipe-back-home')).toHaveCount(0)
    expect(await countLocalRows(page, pressureKeyPart)).toBe(0)
    await capture(page, info, 'G19-草稿待核对')
    await page.getByTestId('pipe-pressure-reread').click()
    await expect(status).toContainText('当前改动尚未保存')
    expect(await countLocalRows(page, pressureKeyPart)).toBe(0)
    await expect(start).toHaveValue('0.91')
    await page.getByTestId('pipe-pressure-save').click()
    await expect(status).toContainText('本机草稿已保存')
    await expect(page.getByTestId('pipe-back-home')).toBeVisible()
    expect(await countLocalRows(page, pressureKeyPart)).toBe(1)
    await assertLocal()
  })

  test('G19 an applied draft with a lost receipt is read back once, and losing the role hides it', async ({ page, baseURL }, info) => {
    const assertLocal = await guardNetwork(page, baseURL!, info)
    await openPressure(page)
    const start = page.getByTestId('pipe-pressure-start').locator('input')
    const status = page.getByTestId('pipe-pressure-status')
    await installWriteFault(page, pressureKeyPart, true)
    await start.fill('0.92')
    await expect(status).toContainText('本机保存结果待核对')
    const applied = await localRows(page, pressureKeyPart)
    expect(applied).toHaveLength(1)
    await page.getByTestId('pipe-pressure-reread').click()
    await expect(status).toContainText('已恢复该作业')
    await expect(start).toHaveValue('0.92')
    expect(await localRows(page, pressureKeyPart)).toEqual(applied)

    await page.evaluate(async () => {
      const statePath = '/src/shared/state/index.ts'
      const { useSessionStore } = await import(/* @vite-ignore */ statePath)
      const store = useSessionStore()
      const actor = store.session
      if (!actor?.currentRole) throw Error('Expected synthetic role in this fixture')
      store.session = { ...actor, currentRole: { ...actor.currentRole, id: 'other-role' } }
    })
    await expect(page.getByTestId('pipe-blocked')).toBeVisible()
    await expect(page.getByTestId('pipe-pressure-editor')).toHaveCount(0)
    await expect(page.getByTestId('pipe-pressure-history')).toHaveCount(0)
    expect(await localRows(page, pressureKeyPart)).toEqual(applied)
    await assertLocal()
  })

  test('G19 refuses an incompatible draft schema without rewriting the stored data', async ({ page, baseURL }, info) => {
    const assertLocal = await guardNetwork(page, baseURL!, info)
    await openPressure(page)
    await page.getByTestId('pipe-pressure-start').locator('input').fill('0.93')
    await expect(page.getByTestId('pipe-pressure-status')).toContainText('本机草稿已保存')
    const incompatible = await replaceFixtureSchema(page, pressureKeyPart)
    await page.reload()
    await expect(page.getByTestId('pipe-pressure-status')).toContainText('无法读取或核对本机草稿')
    await expect(page.getByTestId('pipe-pressure-start').locator('input')).toBeDisabled()
    await expect(page.getByTestId('pipe-pressure-save')).toHaveCount(0)
    await page.getByTestId('pipe-pressure-reread').click()
    await expect(page.getByTestId('pipe-pressure-status')).toContainText('无法读取或核对本机草稿')
    const rows = await localRows(page, pressureKeyPart)
    expect(rows).toHaveLength(1)
    expect(rows[0][1]).toBe(incompatible)
    await assertLocal()
  })
  test('G19 concurrent open copies preserve the newer local draft', async ({ page, context, baseURL }, info) => {
    const assertFirstLocal = await guardNetwork(page, baseURL!, info)
    await openPressure(page)
    const second = await context.newPage()
    const assertSecondLocal = await guardNetwork(second, baseURL!, info)
    await openPressure(second)
    const start = page.getByTestId('pipe-pressure-start').locator('input')
    const secondEnd = second.getByTestId('pipe-pressure-end').locator('input')
    await start.fill('0.94')
    await expect(page.getByTestId('pipe-pressure-status')).toContainText('本机草稿已保存')
    const firstStored = await localRows(page, pressureKeyPart)

    await secondEnd.fill('0.84')
    const secondStatus = second.getByTestId('pipe-pressure-status')
    await expect(secondStatus).toContainText('本机草稿已变化')
    await expect(secondEnd).toHaveValue('0.84')
    expect(await localRows(second, pressureKeyPart)).toEqual(firstStored)
    await second.getByTestId('pipe-pressure-reread').click()
    await expect(second.getByTestId('pipe-pressure-use-local')).toBeVisible()
    await second.getByTestId('pipe-pressure-use-local').click()
    await expect(secondStatus).toContainText('已恢复该作业')
    await expect(second.getByTestId('pipe-pressure-start').locator('input')).toHaveValue('0.94')
    await expect(secondEnd).toHaveValue('')
    expect(await localRows(second, pressureKeyPart)).toEqual(firstStored)
    await assertFirstLocal()
    await assertSecondLocal()
  })

})

test('disabled pipe-work opt-in hides entry and blocks the direct route', async ({ page, baseURL }, info) => {
  test.skip(process.env.XLINK_PIPE_WORK_DISABLED !== 'true', 'requires the opt-in disabled profile')
  const assertLocal = await guardNetwork(page, baseURL!, info)
  await page.goto(entryRoute)
  await expect(page.getByTestId('qa-console')).toBeVisible()
  await expect(page.getByTestId('pipe-work-mock-entry')).toHaveCount(0)
  await page.goto(workRoute + '?view=order')
  await expect(page.getByTestId('pipe-blocked')).toBeVisible()
  await expect(page.getByTestId('pipe-order-note')).toHaveCount(0)
  await assertLocal()
})
