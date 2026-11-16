import { mkdir, writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

const brand = process.env.VITE_XLINK_BRAND || 'xlink'
for (const {width, fault} of [{width:430,fault:false},{width:375,fault:false},{width:430,fault:true},{width:375,fault:true}]) test(`${brand} existing Mock quote to Order flow at ${width} ${fault?'ack-loss':'normal'}`, async ({ page, baseURL }) => {
  await page.setViewportSize({ width, height: width === 430 ? 932 : 667 })
  const remote: string[] = [], errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => new URL(route.request().url()).origin === baseURL
    ? route.continue() : (remote.push(route.request().method()), route.abort('blockedbyclient')))
  const dir = `.review/quotation-footer-read-error/${brand}/${fault?'engineering-ack-loss':'commercial'}/${width}`
  await mkdir(dir, { recursive: true })
  const geometry:unknown[]=[]
  const shot = async (name: string, targetId?: string, engineering=false) => {
    if(targetId){
      const target=page.getByTestId(targetId)
      await target.evaluate(el=>el.scrollIntoView({block:'center',inline:'nearest'}))
      const box=(await target.boundingBox())!, footer=(await page.locator('.action-workspace-footer').boundingBox())!
      expect(box.y+box.height).toBeLessThanOrEqual(footer.y+1)
    }
    const shotDir=engineering ? `.review/quotation-footer-read-error/${brand}/engineering-support/${width}` : dir
    await mkdir(shotDir,{recursive:true})
    await expect(page.locator('.app-button--pressed,.app-button__loading-slot--active')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    geometry.push(await page.evaluate(name=>{const rect=(selector:string)=>{const e=document.querySelector(selector);if(!e)return null;const r=e.getBoundingClientRect();return {y:r.y,height:r.height,bottom:r.bottom}};const failure=document.querySelector('#order-extfield-editor .app-status--danger .app-status__message');return {name,failureColor:failure?getComputedStyle(failure).color:null,scrollY,innerHeight,header:rect('.uni-page-head'),shell:rect('.quotation-workspace-shell'),footer:rect('.action-workspace-footer')}},name))
    if(await page.locator('.quotation-workspace-shell').count()){
      const layout=await page.evaluate(()=>{
        const footer=document.querySelector('.action-workspace-footer')!
        const last=document.querySelector('.quotation-workspace-handoff__hint')
        return {scrollY,innerHeight,bottom:footer.getBoundingClientRect().bottom,lastBottom:last?.getBoundingClientRect().bottom}
      })
      expect(layout.scrollY).toBe(0)
      expect(layout.bottom).toBeLessThanOrEqual(layout.innerHeight+1)
      if(layout.lastBottom!==undefined)expect(layout.lastBottom).toBeLessThanOrEqual(layout.innerHeight+1)
    }
    await page.screenshot({ path: `${shotDir}/${name}.png`, animations: 'disabled', caret: 'hide' })
  }
  // Existing DEV-only identity-scoped journey, reached by actual clicks.
  await page.goto('/#/pages/index/index?devReview=1')
  await page.getByTestId('mock-continuous-journey-entry').click()
  await page.locator('.action-content-field--note textarea').fill('预约上门核对维修范围')
  await page.getByTestId('mock-journey-advance').click()
  await page.locator('.primary-task-action').click()
  await expect(page.getByTestId('survey-part-picker-trigger')).toBeVisible()
  await expect(page.getByTestId('mock-journey-advance')).toHaveCount(0)
  // Synthetic advancement requires explicit re-entry through the isolated QA console.
  await page.goto('/#/pages/dev/qa-console', { waitUntil: 'domcontentloaded' })
  await page.getByTestId('mock-continuous-journey-entry').click()
  await expect(page.getByTestId('mock-journey-progress')).toContainText('独立测试旅程')
  await page.getByTestId('survey-part-picker-trigger').click()
  await page.getByTestId('survey-repair-part-parents').locator('.app-cascade-selector__parent').first().click()
  await page.getByTestId('survey-repair-part-children').locator('.app-cascade-selector__child').first().click()
  await page.getByTestId('survey-part-picker-confirm').click()
  await page.getByTestId('dynamic-field-squareMeter').locator('input').fill('12')
  await page.getByTestId('mock-journey-advance').click()
  await page.locator('.primary-task-action').click()
  await page.getByTestId('quotation-hub-create-unverified').click()
  await expect(page.getByTestId('a-stage-mock-order-panel')).toBeVisible()
  await page.getByTestId('quotation-add-group').click()
  await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
  await page.getByTestId('quotation-repair-part-picker').locator('.app-cascade-selector__parent').filter({ hasText: '屋面' }).click()
  await page.getByTestId('quotation-repair-part-picker-done').click()
  await page.getByTestId('quotation-first-step-description').locator('textarea').fill('落水口周边局部修缮，现场范围已核对')
  await page.getByTestId('quotation-first-step-quantity').locator('input').fill('12')
  await page.getByTestId('order-field-mock-order-mode').getByText('否', { exact: true }).click()
  await expect(page.getByTestId('order-extfield-editor')).toHaveAttribute('data-draft-status', 'saved_local')
  await page.getByTestId('quotation-first-step-select-products').click()
  await page.getByTestId('quotation-catalog-kind-material').click()
  await page.getByTestId('quotation-catalog-add-material-mock-catalog-material-ordinary-1').click()
  if (await page.getByTestId('quotation-catalog-close').isVisible()) await page.getByTestId('quotation-catalog-close').click()
  await page.getByTestId('quotation-browse-quotation-group-1').click()
  await page.getByTestId('quotation-catalog-kind-procedure').click()
  await page.getByTestId('quotation-catalog-add-procedure-mock-catalog-procedure-seal').click()
  if (await page.getByTestId('quotation-catalog-close').isVisible()) await page.getByTestId('quotation-catalog-close').click()
  const editor = page.getByTestId('order-extfield-editor')
  await page.getByTestId('order-field-mock-order-mode').getByText('是', { exact: true }).click()
  await page.getByTestId('order-field-mock-order-note').scrollIntoViewIfNeeded()
  await expect(page.getByTestId('order-field-mock-order-note')).toContainText('请填写此项')
  await shot('01-quote-fields-required')
  await page.getByTestId('order-field-mock-order-note').locator('textarea').fill('维修范围和材料用量已与客户核对')
  await page.getByTestId('order-field-mock-order-number').locator('input').fill('0')
  await expect(editor).toHaveAttribute('data-draft-status', 'saved_local')
  await expect(page.getByTestId('a-stage-order-create')).toHaveAttribute('aria-disabled','false')
  if(brand==='yuhong'){
    const layout=await page.locator('.quotation-content__selection .quotation-content__line-heading').evaluateAll(nodes=>nodes.map(el=>{
      const title=el.querySelector('.quotation-content__line-title')!,subtotal=el.querySelector('.quotation-content__line-money')!
      const box=title.getBoundingClientRect()
      return {titleHeight:box.height,lineHeight:parseFloat(getComputedStyle(title).lineHeight),titleBottom:box.bottom,subtotalTop:subtotal.getBoundingClientRect().top}
    }))
    expect(layout).toHaveLength(2)
    for(const line of layout){
      expect(line.titleHeight).toBeLessThanOrEqual(line.lineHeight*2+1)
      expect(line.subtotalTop).toBeGreaterThanOrEqual(line.titleBottom-1)
    }
  }
  await page.getByTestId('a-stage-order-create').scrollIntoViewIfNeeded()
  await shot('02-quote-fields-filled')
  await page.getByTestId('a-stage-order-create').click()
  await page.getByTestId('a-stage-order-confirm').scrollIntoViewIfNeeded()
  await shot('03-quote-confirmation','a-stage-order-confirm')
  await page.getByTestId('a-stage-mock-order-panel').locator('.app-button').filter({ hasText: '返回检查' }).click()
  await expect(page.getByTestId('order-field-mock-order-note').locator('textarea')).toHaveValue('维修范围和材料用量已与客户核对')
  await page.getByTestId('a-stage-order-create').click()
  await page.getByTestId('a-stage-order-confirm').click()
  await expect(page.getByTestId('a-stage-quote-readback')).toBeVisible()
  await page.getByTestId('a-stage-quote-readback').scrollIntoViewIfNeeded()
  await shot('04-quote-saved')
  await page.getByTestId('order-field-mock-order-person').getByText('客户', { exact: true }).click()
  await page.getByTestId('order-field-mock-order-submit-note').locator('textarea').fill('施工范围、费用与客户类型已确认')
  await expect(editor).toHaveAttribute('data-draft-status', 'saved_local')
  await page.getByTestId('order-field-mock-order-submit-note').scrollIntoViewIfNeeded()
  await shot('05-order-fields-filled')
  // Reload the same actual route to verify persisted input, not direct-entry fabrication.
  await page.reload()
  await page.getByTestId('quotation-hub-create-unverified').click()
  await expect(page.getByTestId('order-field-mock-order-submit-note').locator('textarea')).toHaveValue('施工范围、费用与客户类型已确认')
  await page.getByTestId('a-stage-order-convert').click()
  await page.getByTestId('a-stage-order-convert-confirm').scrollIntoViewIfNeeded()
  await shot('06-order-confirmation','a-stage-order-convert-confirm')
  // Existing storage-ack fault pattern; no API or external upload is involved.
  if(fault)await page.evaluate(() => {
    const runtime = (window as any).uni, write = runtime.setStorageSync.bind(runtime)
    runtime.setStorageSync = (key: string, value: unknown) => {
      write(key, value)
      if(key==='xlink.dev.mock.journey.019.official-order.v1')(window as any).__orderReviewWrites=((window as any).__orderReviewWrites||0)+1
      if (key === 'xlink.dev.mock.journey.019.official-order.v1' && !sessionStorage.getItem('review-order-lost-ack')) {
        sessionStorage.setItem('review-order-lost-ack', '1'); throw new Error('Synthetic ACK loss')
      }
    }
  })
  await page.getByTestId('a-stage-order-convert-confirm').click()
  if(fault){
    await expect(page.getByTestId('a-stage-order-uncertain')).toBeVisible()
    await page.getByTestId('a-stage-order-verify').scrollIntoViewIfNeeded()
    await shot('07-order-uncertain')
    await expect(page.getByTestId('a-stage-order-convert')).toHaveCount(0)
    await page.evaluate(()=>{
      const runtime=(window as any).uni, original=runtime.getStorageSync.bind(runtime)
      ;(window as any).__restoreOrderRead=()=>{runtime.getStorageSync=original}
      runtime.getStorageSync=(key:string)=>key==='xlink.dev.mock.journey.019.official-order.v1'?null:original(key)
    })
    await page.getByTestId('a-stage-order-verify').click()
    await expect(page.getByTestId('a-stage-order-verify-result')).toContainText('暂未确认匹配订单')
    await expect(page.getByTestId('a-stage-order-uncertain')).toBeVisible()
    await expect(page.getByTestId('a-stage-order-convert')).toHaveCount(0)
    await shot('07b-order-not-found')
    await page.evaluate(()=>(window as any).__restoreOrderRead())
    await page.getByTestId('a-stage-order-verify').click()
  }
  await expect(page.getByTestId('a-stage-order-readback')).toBeVisible()
  await page.getByTestId('a-stage-order-open-records').scrollIntoViewIfNeeded()
  if(fault){
    await expect(page.locator('.mock-quote-order__feedback')).toContainText('已按返回的订单编号核对订单及金额')
    await expect(page.getByTestId('a-stage-mock-order-panel')).not.toContainText('订单保存结果尚未确认')
    await expect(page.getByTestId('a-stage-mock-order-panel')).not.toContainText('暂未确认匹配订单')
    expect(await page.evaluate(()=>(window as any).__orderReviewWrites)).toBe(1)
  }
  await shot('08-order-verified-readonly')
  await expect(page.getByTestId('order-field-mock-order-submit-note').locator('textarea')).toBeDisabled()
  await page.getByTestId('a-stage-order-open-records').click()
  await expect(page.getByTestId('quotation-hub-records')).toBeVisible()
  await shot('09-order-records',undefined,true)
  if(fault){
    await page.evaluate(() => {
      const runtime=(window as any).uni, read=runtime.getStorage.bind(runtime)
      runtime.getStorage=(options:any)=>String(options.key).includes('mock-order-fields:v1:')
        ? options.fail?.({errMsg:'Synthetic local read unavailable'}) : read(options)
    })
    await page.getByTestId('quotation-hub-start-new').click()
    await expect(page.getByTestId('order-extfield-editor')).toContainText('报价资料暂不可用')
    await page.getByTestId('order-extfield-editor').scrollIntoViewIfNeeded()
    await shot('10-fields-read-failure')
    await expect(page.locator('[data-testid="a-stage-order-convert"][aria-disabled="false"],[data-testid="a-stage-order-create"][aria-disabled="false"]')).toHaveCount(0)
    if(brand==='yuhong'){
      await expect(page.locator('#order-extfield-editor .app-status--danger .app-status__message')).toHaveCSS('color','rgb(180, 35, 24)')
      // Legacy CSS class compatibility; `error` is not an AppStatus tone API.
      const legacyColor=await page.evaluate(()=>{
        const probe=document.createElement('span');probe.className='app-status app-status--error app-status--quiet'
        document.body.append(probe);const color=getComputedStyle(probe).color;probe.remove();return color
      })
      expect(legacyColor).toBe('rgb(180, 35, 24)')
    }
    else await expect(page.locator('#order-extfield-editor .app-status--danger')).toBeVisible()
  }
  await mkdir('test-results/quotation-footer-read-error', { recursive: true })
  await writeFile(`test-results/quotation-footer-read-error/${brand}-${width}-${fault?'fault':'normal'}-geometry.json`,JSON.stringify(geometry,null,2))
  expect(remote).toEqual([]); expect(errors).toEqual([])
})
