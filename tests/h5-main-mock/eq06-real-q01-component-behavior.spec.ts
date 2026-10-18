import { expect, test, type Page } from '@playwright/test'

/**
 * Actual compiled Vue/uni H5 components, real events, no source-string tests.
 * Browser outbound network is intercepted and rejected BEFORE navigation.
 */
async function offlineMainApp(page: Page) {
  const externalRequests: string[] = []
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/*', async route => {
    const target = new URL(route.request().url())
    if (target.origin === 'http://localhost:5174') {
      await route.continue()
      return
    }
    externalRequests.push(route.request().method()+' '+target.origin+target.pathname)
    await route.abort('blockedbyclient')
  })
  return {
    assertSafe: () => {
      expect(externalRequests, 'external network attempts remain forbidden').toEqual([])
      expect(errors, 'component interaction must not throw').toEqual([])
    },
  }
}

function intervalUnionBytes(ranges: readonly { start: number; end: number }[]) {
  const sorted = [...ranges].sort((a,b)=>a.start-b.start || a.end-b.end)
  let start=-1, end=-1, total=0
  for (const x of sorted) {
    if (x.end<=x.start) continue
    if (start===-1) {start=x.start;end=x.end;continue}
    if (x.start<=end) end=Math.max(end,x.end)
    else {total+=end-start;start=x.start;end=x.end}
  }
  return total+(start===-1?0:end-start)
}

for (const width of [375,390]) {
  test('EQ06 real Q01 UI field validation, corrective edit, catalog navigation at '+width, async ({page},info) => {
    await page.setViewportSize({ width, height: 844 })
    const safe = await offlineMainApp(page)
    await page.coverage.startJSCoverage({ resetOnNavigation:false })
    await page.goto('/#/pages/index/index', { waitUntil:'domcontentloaded' })
    await expect(page.locator('.mock-source-indicator')).toContainText('Mock')
    await page.locator('.mock-action-scenario').filter({ hasText:'报价草稿' }).click()
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
    await page.getByTestId('quotation-add-group').click()
    await expect(page.getByTestId('quotation-first-repair-part-step')).toBeVisible()

    // Force a real Vue validation pass, not a static snapshot or source scan.
    await page.getByTestId('quotation-first-step-select-products').click()
    await expect(page.getByTestId('quotation-first-step-repair-parts-error')).not.toBeEmpty()
    await expect(page.getByTestId('quotation-first-step-description-error')).not.toBeEmpty()
    await expect(page.getByTestId('quotation-first-step-quantity-error')).not.toBeEmpty()
    await expect(page.getByTestId('quotation-catalog-page')).toHaveCount(0)

    // Correct each field in the real rendered component.
    await page.getByTestId('quotation-first-step-description').locator('textarea')
      .fill('EQ06 synthetic roof waterproofing description')
    await page.getByTestId('quotation-first-step-quantity').locator('input').fill('2')
    await page.getByTestId('quotation-first-step-select-products').click()
    await expect(page.getByTestId('quotation-first-step-repair-parts-error')).not.toBeEmpty()
    await expect(page.getByTestId('quotation-first-step-description-error')).toBeEmpty()
    await expect(page.getByTestId('quotation-first-step-quantity-error')).toBeEmpty()
    await expect(page.getByTestId('quotation-catalog-page')).toHaveCount(0)

    await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
    await page.getByTestId('survey-repair-part-parents').getByText('屋面', {exact:true}).click()
    await expect(page.getByTestId('quotation-first-step-selected-path')).toContainText('屋面')
    await page.getByTestId('quotation-first-step-select-products').click()
    await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
    await page.getByTestId('quotation-catalog-kind-material').click()
    await expect(page.getByTestId('quotation-catalog-item-material-mock-catalog-material-ordinary-1')).toBeVisible()
    await page.getByTestId('quotation-catalog-add-material-mock-catalog-material-ordinary-1').click()
    await expect(page.getByTestId('quotation-group-section-quotation-group-1-material'))
      .toContainText('普通防水辅材')
    await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)

    // Chromium V8 raw JS byte coverage is diagnostic ONLY: not TS source
    // branch/statement coverage, and never used as a release percentage.
    const coverage = await page.coverage.stopJSCoverage()
    const appScripts = coverage.filter(row => row.url.startsWith('http://localhost:5174')
      && !row.url.includes('node_modules') && !row.url.includes('/@vite/'))
    const scripts = appScripts.map(row => ({
      path: new URL(row.url).pathname,
      bytes: row.text.length,
      usedBytes: intervalUnionBytes(row.functions.flatMap(fn =>
        fn.ranges.filter(r=>r.count>0).map(r=>({start:r.startOffset,end:r.endOffset})))),
    }))
    expect(scripts.length).toBeGreaterThan(0)
    await info.attach('eq06-runtime-js-byte-sample-'+width,{
      body: Buffer.from(JSON.stringify({
        kind:'V8 Chromium executed Javascript bytes; NOT TS branch/statement coverage',
        width,
        scripts,
        totals: {
          bytes:scripts.reduce((t,s)=>t+s.bytes,0),
          usedBytes:scripts.reduce((t,s)=>t+s.usedBytes,0),
        },
      },null,2)),
      contentType:'application/json',
    })
    safe.assertSafe()
  })
}
