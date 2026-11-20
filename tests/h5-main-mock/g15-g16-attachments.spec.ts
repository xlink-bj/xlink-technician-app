import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function pendingRows(page: Page) {
  const rows = page.getByTestId('g16-file-row').filter({ hasText: '未发送' })
  await expect(rows).toHaveCount(2)
  const snapshots: { id: string | null; name: string; bytes: string }[] = []
  for (let index = 0; index < 2; index += 1) {
    const file = rows.nth(index)
    await file.getByTestId('g16-file-open').click()
    const raw = (await file.getByTestId('g16-file-content').textContent()) ?? ''
    const bytes = Buffer.from(raw, 'utf8').toString('base64')
    expect(raw).toContain('Unsent attachment')
    snapshots.push({
      id: await file.getAttribute('data-task-id'),
      name: await file.getByTestId('g16-file-name').innerText(),
      bytes,
    })
  }
  expect(snapshots.every(item => item.id && item.bytes)).toBe(true)
  expect(new Set(snapshots.map(item => item.id)).size).toBe(2)
  return snapshots
}

test('G15/G16 actual App DEV H5 photo outcomes, cold reopen and scope denial', async ({ page, baseURL }, testInfo) => {
  const origin = new URL(baseURL!).origin
  const outbound: string[] = []
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.route('**/*', route => {
    const request = route.request()
    const url = new URL(request.url())
    if (['data:', 'blob:'].includes(url.protocol)) return route.continue()
    if (url.origin === origin && request.method() === 'GET'
      && !['fetch', 'xhr'].includes(request.resourceType())) return route.continue()
    outbound.push(request.url())
    return route.abort('blockedbyclient')
  })
  await page.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).host === new URL(origin).host) socket.connectToServer()
    else { outbound.push(socket.url()); socket.close() }
  })

  await page.goto('/#/pages/index/index?devReview=1')
  await expect(page.getByTestId('qa-console')).toBeVisible()
  await page.getByTestId('g15-g16-attachments-entry').click()
  await expect(page.getByTestId('g15-g16-ready')).toBeVisible()
  const correctUrl = new URL(page.url())
  const photo = page.getByTestId('g15-photo-state')
  await page.getByTestId('g15-quality-case').click()
  await expect(photo).toHaveText('质量未通过，未上传原图')
  await expect(page.getByTestId('g15-original')).toHaveCount(0)
  await expect(page.getByTestId('g15-result')).toHaveCount(0)
  await page.getByTestId('g15-confirmed-case').click()
  await expect(photo).toHaveText('成图已确认，可以回填')
  await expect(page.getByTestId('g15-original')).toBeVisible()
  await expect(page.getByTestId('g15-result')).toBeVisible()
  const imageUrl = (node: HTMLElement) => {
    const image = node instanceof HTMLImageElement ? node : node.querySelector('img')
    return image?.getAttribute('src') ?? node.querySelector('div')?.style.backgroundImage ?? ''
  }
  const srcOriginal = await page.getByTestId('g15-original').evaluate(imageUrl)
  const srcFinal = await page.getByTestId('g15-result').evaluate(imageUrl)
  expect(srcOriginal).toContain('data:image/jpeg')
  expect(srcFinal).toContain('data:image/jpeg')
  expect(srcFinal).not.toEqual(srcOriginal)
  await page.getByTestId('g15-watermark-case').click()
  await expect(photo).toHaveText('水印未通过，保留原图回执')
  await expect(page.getByTestId('g15-original')).toBeVisible()
  await expect(page.getByTestId('g15-result')).toHaveCount(0)
  await page.getByTestId('g15-unknown-case').click()
  await expect(photo).toHaveText('水印结果待核对，禁止重复派发')

  await page.getByTestId('g16-seed').click()
  const before = await pendingRows(page)
  await expect(page.getByTestId('g16-file-row')).toHaveCount(3)
  const dispatch = page.getByTestId('g16-dispatch-count')
  await expect(dispatch).toHaveText('合成附件派发 1 次')

  // Real document destruction and App boot, not the controller-reset button.
  await page.reload()
  await expect(page.getByTestId('g15-g16-ready')).toBeVisible()
  await expect(photo).toHaveText('水印结果待核对，禁止重复派发')
  const after = await pendingRows(page)
  expect(after).toEqual(before)
  await page.getByTestId('g16-seed').click()
  expect(await pendingRows(page)).toEqual(before)
  await expect(dispatch).toHaveText('合成附件派发 1 次')
  const acknowledged = page.getByTestId('g16-file-row').filter({ hasText: '已确认记录.txt' })
  await acknowledged.getByTestId('g16-file-ack').click()
  await expect(acknowledged).toHaveAttribute('data-state', 'uploaded')
  await expect(dispatch).toHaveText('合成附件派发 1 次')

  for (const [key, real, value] of [
    ['org', 'mock-g16-acting-org-01', 'mock-alternate-org'],
    ['record', 'mock-g15-g16-saved-record-019', 'mock-other-record'],
    ['editScope', 'saved-record-edit', 'read-only'],
  ]) {
    const denied = new URL(correctUrl)
    denied.searchParams.set('reopen', key)
    denied.hash = denied.hash.replace(key + '=' + real, key + '=' + value)
    await page.goto(denied.href)
    await expect(page.getByTestId('g15-g16-denied')).toBeVisible()
    await expect(page.getByTestId('g16-file-row')).toHaveCount(0)
    await expect(page.getByTestId('g16-seed')).toHaveCount(0)
  }
  await page.goto(correctUrl.href)
  await expect(page.getByTestId('g15-g16-ready')).toBeVisible()
  expect(await pendingRows(page)).toEqual(before)
  await expect(dispatch).toHaveText('合成附件派发 1 次')
  expect(pageErrors).toEqual([])
  expect(outbound).toEqual([])
  await testInfo.attach('g15-g16-actual-app-evidence', {
    body: JSON.stringify({
      photo: ['quality failure', 'distinct original and final', 'watermark failure', 'unknown after cold reopen'],
      before, after, mismatchDenied: ['acting organization', 'record identity', 'edit scope'],
      acknowledgedDispatches: 1, pageErrors, outbound,
    }, null, 2),
    contentType: 'application/json',
  })
})
