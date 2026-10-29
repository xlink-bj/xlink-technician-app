import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import { designSystemScreenshotContracts, designSystemSections } from '../../__review/design-system-gallery-fixtures'

const reviewPath = '/#/pages/design-system/index'
const screenshotDirectory = resolve(process.cwd(), '.review/design-system-uni-h5/generated')

type BrowserEvidence = {
  readonly consoleErrors: string[]
  readonly pageErrors: string[]
  readonly unexpectedRequests: string[]
}

function allowedRequest(url: string): boolean {
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) return true
  try {
    const parsed = new URL(url)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'ws:' || parsed.protocol === 'wss:')
      && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
      && (parsed.port === '' || parsed.port === '5174')
  } catch {
    return false
  }
}

function installBrowserSafetyGuards(page: Page): BrowserEvidence {
  const evidence: BrowserEvidence = { consoleErrors: [], pageErrors: [], unexpectedRequests: [] }
  page.on('console', (message) => {
    if (message.type() === 'error') evidence.consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => evidence.pageErrors.push(error.stack ?? error.message))
  page.on('request', (request) => {
    if (!allowedRequest(request.url())) evidence.unexpectedRequests.push(request.url())
  })
  void page.route('**/*', async (route) => {
    const url = route.request().url()
    if (!allowedRequest(url)) {
      evidence.unexpectedRequests.push(url)
      await route.abort('blockedbyclient')
      return
    }
    await route.continue()
  })
  return evidence
}

async function assertHealthy(page: Page, evidence: BrowserEvidence): Promise<void> {
  expect(evidence.pageErrors, 'pageerror output').toEqual([])
  expect(evidence.consoleErrors, 'console.error output').toEqual([])
  expect(evidence.unexpectedRequests, 'unexpected external requests').toEqual([])
  await expect(page.locator('body')).not.toContainText('development-only')
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    bodyWidth: document.body.scrollWidth,
  }))
  expect(overflow.documentWidth, 'document horizontal overflow').toBeLessThanOrEqual(overflow.viewportWidth)
  expect(overflow.bodyWidth, 'body horizontal overflow').toBeLessThanOrEqual(overflow.viewportWidth)
}

async function assertDisabled(control: Locator): Promise<void> {
  const disabled = await control.evaluate((element) =>
    element.getAttribute('disabled') !== null && element.getAttribute('disabled') !== 'false'
    || element.getAttribute('aria-disabled') === 'true'
    || (element as HTMLButtonElement).disabled === true,
  )
  expect(disabled, 'shared control must expose a disabled state').toBe(true)
}

async function assertEnabled(control: Locator): Promise<void> {
  const disabled = await control.evaluate((element) =>
    element.getAttribute('disabled') !== null && element.getAttribute('disabled') !== 'false'
    || element.getAttribute('aria-disabled') === 'true'
    || (element as HTMLButtonElement).disabled === true,
  )
  expect(disabled, 'shared control must not expose a disabled state').toBe(false)
}

async function openReview(page: Page, evidence: BrowserEvidence): Promise<void> {
  await page.goto(reviewPath, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('design-system-gallery')).toBeVisible()
  await expect(page.getByTestId('gallery-notice')).toContainText('不连接 API')
  await assertHealthy(page, evidence)
}

test.beforeAll(async () => {
  await mkdir(screenshotDirectory, { recursive: true })
})

test('real uni-app H5 page mounts all gallery sections without runtime or network errors', async ({ page }) => {
  const evidence = installBrowserSafetyGuards(page)
  await openReview(page, evidence)
  for (const section of designSystemSections) {
    await expect(page.getByTestId(`gallery-section-${section.id}`)).toBeVisible()
  }
  await assertNoHorizontalOverflow(page)
  await assertHealthy(page, evidence)
})

test('real uni-app H5 preserves shared control states and independent footer actions', async ({ page }) => {
  const evidence = installBrowserSafetyGuards(page)
  await openReview(page, evidence)

  const saved = page.getByTestId('gallery-action-state-saved')
  await expect(saved.getByTestId('dynamic-form-save')).toHaveText('已保存')
  await assertDisabled(saved.getByTestId('dynamic-form-save'))
  await assertEnabled(saved.getByTestId('action-workspace-submit'))

  const textarea = page.getByTestId('gallery-textarea-populated')
  await expect(textarea).toBeVisible()
  const textareaMetrics = await textarea.evaluate((element) => ({
    minHeight: Number.parseFloat(getComputedStyle(element).minHeight),
    height: element.getBoundingClientRect().height,
  }))
  expect(textareaMetrics.minHeight).toBeGreaterThan(40)
  expect(textareaMetrics.height).toBeGreaterThan(40)

  await expect(page.getByTestId('gallery-information-long')).toContainText('演示区域的一段较长说明文字')
  // uni H5 exposes the shared choice control as a generated uni-button
  // element, so assert the visible option text rather than a browser role.
  await expect(page.getByText('通用中文选项的较长展示文本', { exact: true }).first()).toBeVisible()
  await assertHealthy(page, evidence)
})

test('real uni-app H5 remains usable at the compact 320px width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  const evidence = installBrowserSafetyGuards(page)
  await openReview(page, evidence)
  await assertNoHorizontalOverflow(page)
  await expect(page.getByTestId('gallery-section-07-action-workspace-footer')).toBeVisible()
  await assertDisabled(page.getByTestId('gallery-action-state-saved').getByTestId('dynamic-form-save'))
  await assertHealthy(page, evidence)
})

test('captures the uni-app H5 visual review evidence without establishing baselines', async ({ page }) => {
  const evidence = installBrowserSafetyGuards(page)
  await openReview(page, evidence)
  for (const screenshot of designSystemScreenshotContracts) {
    const example = page.getByTestId(`gallery-example-${screenshot.focusExampleId}`)
    await example.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(screenshotDirectory, screenshot.filename), animations: 'disabled' })
  }

  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto(reviewPath, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('design-system-gallery')).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: join(screenshotDirectory, '09-compact-320.png'), animations: 'disabled' })
  await assertNoHorizontalOverflow(page)
  await assertHealthy(page, evidence)
})


test('DS-01 shared commercial controls: 320/375/390px, states, geometry, one tap and no overflow', async ({ page }) => {
  for (const width of [320, 375, 390]) {
    await page.setViewportSize({ width, height: 844 })
    const evidence = installBrowserSafetyGuards(page)
    await openReview(page, evidence)
    const button = page.getByTestId('ds01-button-primary')
    const compact = page.getByTestId('ds01-button-compact')
    const large = page.getByTestId('ds01-button-large')
    const disabled = page.getByTestId('ds01-button-disabled')
    const loading = page.getByTestId('ds01-button-loading')
    const long = page.getByTestId('ds01-button-long')
    const actionBar = page.getByTestId('ds01-action-dual')
    await expect(button).toBeVisible()
    await assertDisabled(disabled)
    await assertDisabled(loading)
    const metrics = await Promise.all([button, compact, large, long].map(element =>
      element.evaluate(node => ({
        width: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height,
        scrollWidth: node.scrollWidth,
        fontSize: parseFloat(getComputedStyle(node).fontSize),
      })),
    ))
    for (const metric of metrics) {
      expect(metric.height, 'button hit target >=44px').toBeGreaterThanOrEqual(43.5)
      expect(metric.width, 'button must fit mobile viewport').toBeLessThanOrEqual(width)
      expect(metric.scrollWidth, 'button text should not clip horizontally').toBeLessThanOrEqual(metric.width + 1)
    }
    expect(metrics[2].height).toBeGreaterThan(metrics[0].height)
    // WCAG AA body-size action label contrast: primary white-on-blue and
    // secondary blue-on-white >=4.5:1 in the compiled uni-app runtime.
    for (const item of [
      page.getByTestId('ds01-button-primary'),
      page.getByTestId('ds01-button-secondary'),
    ]) {
      const contrast = await item.evaluate(element => {
        const read = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
        const linear = (value: number) => {
          const fraction = value / 255
          return fraction <= .04045 ? fraction / 12.92 : ((fraction + .055) / 1.055) ** 2.4
        }
        const luminance = (rgb: number[]) =>
          .2126 * linear(rgb[0] ?? 0) + .7152 * linear(rgb[1] ?? 0) + .0722 * linear(rgb[2] ?? 0)
        const style = getComputedStyle(element)
        const fore = luminance(read(style.color))
        const back = luminance(read(style.backgroundColor))
        return (Math.max(fore, back) + .05) / (Math.min(fore, back) + .05)
      })
      expect(contrast, 'DS01 action label contrast must meet WCAG AA').toBeGreaterThanOrEqual(4.5)
    }
    await expect(actionBar).toBeVisible()
    const dual = await actionBar.getByTestId('ds01-action-primary').boundingBox()
    const secondary = await actionBar.getByTestId('ds01-action-secondary').boundingBox()
    expect(dual).not.toBeNull()
    expect(secondary).not.toBeNull()
    expect(dual!.height).toBeGreaterThanOrEqual(43.5)
    expect(secondary!.height).toBeGreaterThanOrEqual(43.5)
    expect(dual!.x).toBeGreaterThan(secondary!.x)
    expect(dual!.x + dual!.width).toBeLessThanOrEqual(width)
    const counter = page.getByTestId('ds01-button-tap-count')
    const before = Number(await counter.textContent())
    await disabled.dispatchEvent('tap')
    await loading.dispatchEvent('tap')
    await expect(counter).toHaveText(String(before))
    await button.click()
    await expect(counter).toHaveText(String(before + 1))
    await expect(button).toHaveCSS('background-color', 'rgb(29, 110, 207)')
    await assertNoHorizontalOverflow(page)
    await page.getByTestId('gallery-example-buttons').scrollIntoViewIfNeeded()
    await page.screenshot({
      path: join(screenshotDirectory, `ds01-buttons-${width}.png`),
      animations: 'disabled',
    })
    await actionBar.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: join(screenshotDirectory, `ds01-action-bar-${width}.png`),
      animations: 'disabled',
    })
    await assertHealthy(page, evidence)
  }
})


test('DS-01.1 commercial visual masters: four hierarchies, spinner, split layout and caller-owned feedback', async ({ page }) => {
  for (const width of [320, 375, 390]) {
    await page.setViewportSize({ width, height: 844 })
    const evidence = installBrowserSafetyGuards(page)
    await openReview(page, evidence)

    const master = page.getByTestId('ds011-button-master')
    await expect(master).toBeVisible()
    for (const name of ['primary','secondary','tertiary','ghost']) {
      await expect(page.getByTestId(`ds011-${name}-column`)).toBeVisible()
    }
    const primary = page.getByTestId('ds01-button-primary')
    const secondary = page.getByTestId('ds01-button-secondary')
    const tertiary = page.getByTestId('ds011-button-tertiary')
    const ghost = page.getByTestId('ds011-button-ghost')
    await expect(primary).toHaveClass(/app-button--shape-pill/)
    await expect(secondary).toHaveClass(/app-button--secondary/)
    await expect(tertiary).toHaveClass(/app-button--tertiary/)
    await expect(ghost).toHaveClass(/app-button--ghost/)

    for (const button of [primary, secondary, tertiary, ghost]) {
      const rect = await button.boundingBox()
      expect(rect).not.toBeNull()
      expect(rect!.height, 'mature button touch >=44px').toBeGreaterThanOrEqual(43.5)
      expect(rect!.x, 'button remains in viewport').toBeGreaterThanOrEqual(0)
      expect(rect!.x + rect!.width, 'button remains in viewport').toBeLessThanOrEqual(width + 1)
      // Two-column 320px buttons must not wrap four-character labels because
      // a hidden loading indicator consumed horizontal space.
      const label = await button.locator('.app-button__label').boundingBox()
      expect(label).not.toBeNull()
      expect(label!.height, 'short action label should stay on one line').toBeLessThanOrEqual(25)
    }

    const loading = page.getByTestId('ds01-button-loading')
    await expect(loading).toHaveAttribute('aria-busy', 'true')
    const spinner = loading.locator('.app-button__loading-slot--active')
    await expect(spinner).toBeVisible()
    // A rotating square can have a 22px screen-space bounding box at
    // 45 degrees even with a 16px CSS diameter. Measure its layout box,
    // not the transformed, animated bounding rect.
    const spinnerMetrics = await spinner.evaluate(el => ({
      height: Number.parseFloat(getComputedStyle(el).height),
      width: Number.parseFloat(getComputedStyle(el).width),
      border: getComputedStyle(el).borderTopWidth,
    }))
    expect(spinnerMetrics.height).toBeGreaterThanOrEqual(14)
    expect(spinnerMetrics.height).toBeLessThanOrEqual(20)
    expect(Number.parseFloat(spinnerMetrics.border)).toBeLessThanOrEqual(2.5)
    expect(spinnerMetrics.width).toBeGreaterThanOrEqual(14)
    expect(spinnerMetrics.width).toBeLessThanOrEqual(20)
    await expect(loading).toHaveCSS('background-color', 'rgb(29, 110, 207)')

    const split = page.getByTestId('ds011-action-split')
    const left = await split.getByTestId('ds011-action-split-secondary').boundingBox()
    const right = await split.getByTestId('ds011-action-split-primary').boundingBox()
    expect(left).not.toBeNull()
    expect(right).not.toBeNull()
    expect(left!.x + left!.width).toBeLessThan(right!.x)
    expect(right!.x + right!.width).toBeLessThanOrEqual(width + 1)
    await expect(page.getByTestId('ds011-action-trailing')).toBeVisible()

    for (const state of ['busy','success','error']) {
      const node = page.getByTestId(`ds011-feedback-${state}`)
      await expect(node).toHaveClass(new RegExp(`app-action-feedback--${state}`))
      await expect(node).toHaveAttribute('role', 'status')
      await expect(node).toHaveAttribute('aria-live', state === 'error' ? 'assertive' : 'polite')
    }
    await assertNoHorizontalOverflow(page)
    // A long element screenshot scrolls past uni-app's fixed page-head. Hide
    // only that REVIEW chrome in the capture frame so it cannot be stitched
    // through the middle of the component master. Production UI is untouched.
    await page.addStyleTag({ content: 'uni-page-head { visibility: hidden !important; }' })
    await master.screenshot({ path: join(screenshotDirectory, `ds011-button-master-${width}.png`), animations:'disabled' })
    await page.getByTestId('ds011-action-split').scrollIntoViewIfNeeded()
    await page.getByTestId('gallery-example-action-bar').screenshot({
      path: join(screenshotDirectory, `ds011-action-master-${width}.png`),
      animations:'disabled',
    })
    await assertHealthy(page, evidence)
  }
})

test('DS-02.B actual shared content Gallery stays legible at 320/375/390', async ({ page }) => {
  for (const width of [320, 375, 390]) {
    await page.setViewportSize({ width, height: 844 })
    const evidence = installBrowserSafetyGuards(page)
    await openReview(page, evidence)
    const master = page.getByTestId('ds02b-content-master')
    await expect(master).toBeVisible()
    await expect(page.getByTestId('ds02b-gallery-record')).toHaveClass(/app-record-card/)
    await expect(master.locator('.app-section-heading')).toBeVisible()
    await expect(master.locator('.app-meta-tag').first()).toBeVisible()
    await assertNoHorizontalOverflow(page)
    await page.addStyleTag({ content: 'uni-page-head { visibility: hidden !important; }' })
    await master.screenshot({
      path: join(screenshotDirectory, `ds02b-content-master-${width}.png`),
      animations: 'disabled',
    })
    await assertHealthy(page, evidence)
  }
})


test('DS-07.B shared Craft mode: real App components, full state matrix and unchanged legacy skin', async ({ page }) => {
  for (const width of [320, 375, 390]) {
    await page.setViewportSize({ width, height: 844 })
    const evidence = installBrowserSafetyGuards(page)
    await openReview(page, evidence)
    const master = page.getByTestId('ds07-craft-matrix')
    await expect(master).toBeVisible()
    for (const family of ['buttons', 'fields', 'selection', 'status', 'records', 'actionbar']) {
      await expect(page.getByTestId(family === "actionbar" ? "ds07-craft-actionbar-group" : `ds07-craft-${family}`)).toBeVisible()
    }
    const button = page.getByTestId('ds07-craft-primary')
    const input = page.getByTestId('ds07-craft-input')
    const error = page.getByTestId('ds07-craft-input-error')
    const card = page.getByTestId('ds07-craft-record')
    const actionBar = page.getByTestId('ds07-craft-actionbar')
    const buttonSize = await button.boundingBox()
    expect(buttonSize).not.toBeNull()
    expect(buttonSize!.height).toBeGreaterThanOrEqual(44)
    await expect(button).toHaveCSS('background-color', 'rgb(23, 105, 220)')
    await expect(input).toHaveCSS('background-color', 'rgb(241, 245, 250)')
    await expect(input).toHaveCSS('border-top-left-radius', '12px')
    await expect(error).toHaveCSS('border-top-color', 'rgb(212, 78, 90)')
    await expect(card).toHaveCSS('border-top-left-radius', '16px')
    const redRecord = page.getByTestId('ds07-craft-record-red')
    const greenRecord = page.getByTestId('ds07-craft-record-green')
    await expect(redRecord.locator('.app-record-card__accent')).toHaveCSS('background-color', 'rgb(198, 93, 75)')
    await expect(greenRecord.locator('.app-record-card__accent')).toHaveCSS('background-color', 'rgb(33, 137, 94)')
    await expect(redRecord.locator('.app-record-mark')).toHaveCSS('background-color', 'rgb(255, 241, 237)')
    await expect(greenRecord.locator('.app-record-mark')).toHaveCSS('background-color', 'rgb(234, 249, 241)')
    await expect(actionBar).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await assertDisabled(page.getByTestId('ds07-craft-button-disabled'))
    await assertDisabled(page.getByTestId('ds07-craft-button-loading'))
    const tapCounter = page.getByTestId('ds07-craft-tap-count')
    const buttonCount = Number(await tapCounter.textContent())
    await button.click()
    await expect(tapCounter).toHaveText(String(buttonCount + 1))
    const selector = page.getByTestId('ds07-craft-selector')
    const selectorCounter = page.getByTestId('ds07-craft-selector-taps')
    const selectorCount = Number(await selectorCounter.textContent())
    await selector.click()
    await expect(selectorCounter).toHaveText(String(selectorCount + 1))
    await input.click()
    await expect(input).toHaveClass(/app-input--focused/)
    await expect(input).toHaveCSS('border-top-color', 'rgb(23, 105, 220)')

    // Old AppButton consumer outside the opt-in scope retains its frozen material.
    await expect(page.getByTestId('ds01-button-primary')).toHaveCSS('background-color', 'rgb(29, 110, 207)')
    await assertNoHorizontalOverflow(page)
    await page.addStyleTag({ content: 'uni-page-head { visibility: hidden !important; }' })
    await master.screenshot({
      path: join(screenshotDirectory, `ds07b-shared-craft-${width}.png`),
      animations: 'disabled',
    })
    await assertHealthy(page, evidence)
  }
})


test('DS-07.C3: shared search, retry, no-result, empty and loading components across list/detail', async ({ page }) => {
  for (const width of [320, 375, 390]) {
    await page.setViewportSize({ width, height: 844 })
    const evidence = installBrowserSafetyGuards(page)
    await openReview(page, evidence)
    const matrix = page.getByTestId('ds07c3-state-gallery')
    await expect(matrix).toBeVisible()

    const search = page.getByTestId('app-search-bar').first()
    await expect(search).toBeVisible()
    await expect(search.locator('.search-input-shell')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    const searchCount = page.getByTestId('ds07c3-search-count')
    const beforeSearch = Number(await searchCount.textContent())
    await search.locator('.search-button').click()
    await expect(searchCount).toHaveText(String(beforeSearch + 1))
    await assertDisabled(page.getByTestId('app-search-bar').nth(1).locator('.search-button'))

    const feedback = page.getByTestId('app-feedback-state')
    await expect(feedback).toHaveCount(4)
    await expect(feedback.nth(0)).toContainText('暂时无法加载工单')
    await expect(feedback.nth(1)).toContainText('没有找到匹配工单')
    await expect(feedback.nth(2)).toContainText('暂时无法加载详情')
    await expect(feedback.nth(3)).toContainText('工单待接单')
    const retryCount = page.getByTestId('ds07c3-retry-count')
    const beforeRetry = Number(await retryCount.textContent())
    await feedback.nth(0).locator('.app-feedback-state__action').click()
    await expect(retryCount).toHaveText(String(beforeRetry + 1))

    const empty = page.getByTestId('work-order-empty-state')
    const emptyAction = page.getByTestId('ds07c3-empty-action-count')
    const beforeEmpty = Number(await emptyAction.textContent())
    await expect(empty).toContainText('当前暂无工单')
    await empty.locator('.empty-state-action').click()
    await expect(emptyAction).toHaveText(String(beforeEmpty + 1))
    await expect(page.getByTestId('work-order-skeleton-list').locator('.skeleton-card')).toHaveCount(3)
    await expect(page.getByTestId('work-order-skeleton-detail').locator('.skeleton-surface')).toHaveCount(3)
    await assertNoHorizontalOverflow(page)
    await page.addStyleTag({ content: 'uni-page-head { visibility: hidden !important; }' })
    await matrix.screenshot({
      path: join(screenshotDirectory, `ds07c3-workorder-states-${width}.png`),
      animations: 'disabled',
    })
    await assertHealthy(page, evidence)
  }
})
