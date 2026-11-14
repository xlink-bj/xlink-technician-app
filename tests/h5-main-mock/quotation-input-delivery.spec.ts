import {test,expect,type Page,type Locator} from '@playwright/test'
async function enter(page:Page){
 await page.goto('/#/pages/index/index?devReview=1')
 await page.locator('.mock-action-scenario').filter({hasText:'报价草稿'}).click()
 await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
 await page.getByTestId('quotation-add-group').click()
 await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
 await page.getByRole('dialog',{name:'选择维修部位'}).locator('.app-cascade-selector__parents').getByText('屋面',{exact:true}).click()
 await page.getByTestId('quotation-repair-part-picker-done').click()
 await page.getByTestId('quotation-first-step-description').locator('textarea').fill('initial synthetic description')
 await page.getByTestId('quotation-first-step-quantity').locator('input').fill('1')
 await expect(page.locator('.quotation-content__local-status')).toContainText('已保存在本机')
}
async function addMaterial(page:Page){
 await page.getByTestId('quotation-first-step-select-products').click()
 await page.getByTestId('quotation-catalog-kind-material').click()
 await page.getByTestId('quotation-catalog-add-material-mock-catalog-material-ordinary-1').click()
 await expect(page.getByTestId('quotation-group-section-quotation-group-1-material')).toContainText('屋面防水修缮辅材')
}
async function pair(field:Locator,first:string,last:string){
 await field.evaluate(el=>{(window as any).__quoteInputTimes=[];el.addEventListener('input',()=>{(window as any).__quoteInputTimes.push({t:performance.now(),value:(el as HTMLInputElement).value})})})
 await field.fill(first);await field.fill(last)
 const times=await field.evaluate(()=>(window as any).__quoteInputTimes as Array<{t:number;value:string}>)
 expect(times.map(x=>x.value)).toEqual([first,last])
 expect(times[1].t-times[0].t).toBeLessThan(100)
}
for(const kind of ['q01-description','q01-quantity','group-description','group-quantity','row-quantity']){
 test('normal App '+kind+' rapid final value survives immediate switch',async({page,baseURL},info)=>{
  const external:string[]=[],errors:string[]=[],warnings:string[]=[];const origin=new URL(baseURL!).origin
  page.on('pageerror',e=>errors.push(e.message))
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text())})
  await page.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(u.origin===origin&&r.method()==='GET'&&!['xhr','fetch'].includes(r.resourceType())&&!/^\/(api|biz|basic|index|i|workflow)(\/|$)/.test(u.pathname))return route.continue();external.push(r.method()+' '+u.origin+u.pathname);return route.abort('blockedbyclient')})
  await page.routeWebSocket('**/*',ws=>{if(new URL(ws.url()).host===new URL(origin).host)ws.connectToServer();else{external.push('WS '+ws.url());ws.close()}})
  try{
   await enter(page)
   if(kind.startsWith('q01')){
    const description=kind.endsWith('description');const f=page.getByTestId(description?'quotation-first-step-description':'quotation-first-step-quantity').locator(description?'textarea':'input')
    await pair(f,description?'first':'1',description?'last synthetic description':'12')
    await page.getByTestId('quotation-first-step-select-products').click()
    await expect(page.getByTestId('quotation-catalog-close')).toBeVisible()
    await page.getByTestId('quotation-catalog-close').click()
    await expect(f).toHaveValue(description?'last synthetic description':'12')
   }else{
    await addMaterial(page)
    const row=kind==='row-quantity'
    if(row){
     await page.getByTestId('quotation-browse-quotation-group-1').click()
     await page.getByTestId('quotation-catalog-kind-procedure').click()
     await page.getByTestId('quotation-catalog-add-procedure-mock-catalog-procedure-seal').click()
    }
    if(!row&&!await page.getByTestId('quotation-group-context-quotation-group-1').isVisible())await page.getByTestId('quotation-group-context-toggle-quotation-group-1').click()
    const description=kind.endsWith('description')
    const f=row?page.getByTestId('quotation-selection-quantity-quotation-selection-1').locator('input'):page.getByTestId(description?'quotation-group-description-quotation-group-1':'quotation-group-quantity-quotation-group-1').locator(description?'textarea':'input')
    await pair(f,description?'first':'1',description?'last synthetic description':'12')
    // Normal back navigation flushes the existing composition draft.
    await page.locator('.uni-page-head-hd').click()
    await expect(page.getByTestId('qa-console')).toBeVisible()
    await page.locator('.mock-action-scenario').filter({hasText:'报价草稿'}).click()
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
    if(!row&&!await page.getByTestId('quotation-group-context-quotation-group-1').isVisible())await page.getByTestId('quotation-group-context-toggle-quotation-group-1').click()
    await expect(f).toHaveValue(description?'last synthetic description':'12')
    if(row){
     await expect(page.getByTestId('quotation-group-subtotal-quotation-group-1')).toContainText('531.60')
     const draft=await quotationDraft(page)
     expect(draft.groups[0].materials[0].quantity).toBe(12)
     expect(draft.groups[0].maintainAreaNum).toBe('1')
     const encoded=await encodeDraft(page,draft)
     expect(encoded.state).toBe('ready')
     expect(encoded.payload.totalPrice).toBe(531.6)
     expect(JSON.parse(encoded.payload.bjProducts).orderList[0].materials.data[0]).toMatchObject({number:12,amount:38.6,totalAmount:463.2})
     await info.attach('normal-ui-draft-encoding.json',{body:JSON.stringify({draft,encoded}),contentType:'application/json'})
    }
   }
   expect(external).toEqual([]);expect(errors).toEqual([]);expect(warnings.filter(w=>!w.includes('Attempting to hydrate existing markup but container is empty. Performing full mount instead.'))).toEqual([])
  }finally{
   await info.attach('input-evidence.json',{body:JSON.stringify(await page.evaluate(()=>({times:(window as any).__quoteInputTimes, drafts:Object.entries(localStorage).filter(([k])=>k.startsWith('draft:'))}))),contentType:'application/json'})
   await info.attach('network.json',{body:JSON.stringify({external,errors,warnings}),contentType:'application/json'})
  }
 })
}

async function quotationDraft(page: Page) {
  return page.evaluate(() => {
    const row = Object.entries(localStorage).find(([key]) => key.startsWith('draft:') && key.includes('mock-work-order-018-quotation-foundation'))
    if (!row) throw Error('Normal quotation draft was not persisted')
    const outer = JSON.parse(row[1])
    const record = typeof outer.data === 'string' ? JSON.parse(outer.data) : outer
    return record.values.quotationDraft
  })
}

// Diagnostic PURE mapper/engine/encoder evaluation of the actual UI-produced
// persisted draft. No store mutation, submit handler, business request or ACK.
// The single selected SPU is taken from the existing source-shaped Mock catalog.
async function encodeDraft(page: Page, draft: unknown) {
  return page.evaluate(async draft => {
    const enginePath = '/src/features/work-orders/quotation/engine.ts'
    const mapperPath = '/src/adapters/api/quotation-catalog-mappers.ts'
    const fixturePath = '/src/adapters/api/mock/quotation-catalog.ts'
    const { evaluateQuotationDraft } = await import(/* @vite-ignore */ enginePath)
    const { materialItem, procedureItem } = await import(/* @vite-ignore */ mapperPath)
    const fixture = await import(/* @vite-ignore */ fixturePath)
    const item = materialItem(fixture.mockQuotationMaterialListResponse.data.find((row: { _id: string }) => row._id === 'mock-catalog-material-ordinary-1'))
    const procedure = procedureItem(fixture.mockQuotationProcedureListResponse.data[0])
    return evaluateQuotationDraft({
      draft,
      catalogContext: { serviceType: fixture.mockQuotationCatalogServiceType, sourceType: fixture.mockQuotationCatalogSourceType },
      catalogRead: { listProcedures: async () => ({ state: 'succeeded', data: { items: [procedure], page: 1, pageSize: 20, totalCount: 1 } }), listMaterials: async () => ({ state: 'succeeded', data: { items: [item], page: 1, pageSize: 20, totalCount: 1 } }) },
    })
  }, draft)
}

async function isolatedNetwork(page: Page, baseURL: string) {
  const external: string[] = [], errors: string[] = []
  const origin = new URL(baseURL).origin
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin === origin && request.method() === 'GET'
      && !['xhr', 'fetch'].includes(request.resourceType())
      && !/^\/(api|biz|basic|index|i|workflow)(\/|$)/.test(url.pathname)) return route.continue()
    external.push(`${request.method()} ${url.origin}${url.pathname}`)
    return route.abort('blockedbyclient')
  })
  await page.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).host === new URL(origin).host) socket.connectToServer()
    else { external.push(`WS ${socket.url()}`); socket.close() }
  })
  return { external, errors }
}

for (const viewport of [{ width: 430, height: 932 }, { width: 375, height: 667 }]) {
  test(`group description stays inside its field above quantity at ${viewport.width}`, async ({ page, baseURL }, info) => {
    await page.setViewportSize(viewport)
    const network = await isolatedNetwork(page, baseURL!)
    try {
      await enter(page); await addMaterial(page)
      const host = page.getByTestId('quotation-group-description-quotation-group-1')
      const field = host.locator('textarea')
      const values = ['屋面防水层局部修补', '屋面女儿墙根部与落水口周边防水层破损，需清理基层、修补裂缝并复核收口。'.repeat(3)]
      for (const value of values) {
        await field.fill(value)
        await host.scrollIntoViewIfNeeded()
        const geometry = await host.evaluate(element => {
          const outer = element.getBoundingClientRect()
          const input = element.querySelector('textarea')!.getBoundingClientRect()
          const quantityLabel = document.querySelector('[data-testid="quotation-group-quantity-quotation-group-1"]')!
            .parentElement!.querySelector('.quotation-content__context-label')!.getBoundingClientRect()
          return { topInset: input.top - outer.top, bottomInset: outer.bottom - input.bottom,
            quantityGap: quantityLabel.top - input.bottom }
        })
        expect(geometry.topInset).toBeGreaterThanOrEqual(0)
        expect(geometry.bottomInset).toBeGreaterThanOrEqual(0)
        expect(geometry.quantityGap).toBeGreaterThanOrEqual(6)
        await expect(field).toHaveValue(value)
        await expect.poll(async () => (await quotationDraft(page)).groups[0].partDescription).toBe(value)
      }
      await page.locator('.uni-page-head-hd').click()
      await page.locator('.mock-action-scenario').filter({ hasText: '报价草稿' }).click()
      await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
      if (!await page.getByTestId('quotation-group-context-quotation-group-1').isVisible()) {
        await page.getByTestId('quotation-group-context-toggle-quotation-group-1').click()
      }
      await expect(field).toHaveValue(values[1])
      expect(network.external).toEqual([]); expect(network.errors).toEqual([])
    } finally {
      await info.attach('network.json', { body: JSON.stringify(network), contentType: 'application/json' })
    }
  })
}

test('normal SPU decimal, zero/empty/negative input and refresh preserve existing quantity rules', async ({ page, baseURL }, info) => {
  const network = await isolatedNetwork(page, baseURL!)
  try {
    await enter(page); await addMaterial(page)
    await page.getByTestId('quotation-browse-quotation-group-1').click()
    await page.getByTestId('quotation-catalog-kind-procedure').click()
    await page.getByTestId('quotation-catalog-add-procedure-mock-catalog-procedure-seal').click()
    const field = page.getByTestId('quotation-selection-quantity-quotation-selection-1').locator('input')
    await pair(field, '1', '12.5')
    await expect(page.getByTestId('quotation-group-subtotal-quotation-group-1')).toContainText('550.90')
    await expect.poll(async () => (await quotationDraft(page)).groups[0].materials[0].quantity).toBe(12.5)
    for (const invalid of ['0', '', '-1']) {
      await field.fill(invalid)
      await expect(page.locator('.quotation-content__quantity-error')).toContainText('请输入大于 0 的数量')
      expect((await quotationDraft(page)).groups[0].materials[0].quantity).toBe(12.5)
      await expect(page.getByTestId('quotation-group-subtotal-quotation-group-1')).toContainText('550.90')
    }
    // The native digit control rejects alphabetic characters; no alternate
    // product parser is introduced to force unsupported browser text through.
    await field.fill(''); await field.pressSequentially('abc')
    await expect(field).toHaveValue('')
    await field.fill('12.5')
    await expect(page.locator('.quotation-content__quantity-error')).toHaveCount(0)
    // Existing group engineering quantity is context only, never a live row multiplier.
    if (!await page.getByTestId('quotation-group-context-quotation-group-1').isVisible()) {
      await page.getByTestId('quotation-group-context-toggle-quotation-group-1').click()
    }
    await page.getByTestId('quotation-group-quantity-quotation-group-1').locator('input').fill('99')
    await expect.poll(async () => (await quotationDraft(page)).groups[0].maintainAreaNum).toBe('99')
    const before = await quotationDraft(page)
    expect(before.groups[0].materials[0].quantity).toBe(12.5)
    const encoded = await encodeDraft(page, before)
    expect(encoded.state).toBe('ready')
    expect(encoded.payload.totalPrice).toBe(550.9)
    expect(JSON.parse(encoded.payload.bjProducts).orderList[0]).toMatchObject({
      maintainAreaNum: '99', materials: { data: [{ number: 12.5, amount: 38.6, totalAmount: 482.5 }] },
    })
    await info.attach('decimal-validation-encoding.json', { body: JSON.stringify({ before, encoded }), contentType: 'application/json' })
    await page.reload()
    await expect(field).toHaveValue('12.5')
    expect((await quotationDraft(page)).groups[0].maintainAreaNum).toBe('99')
    expect(network.external).toEqual([]); expect(network.errors).toEqual([])
  } finally {
    await info.attach('network.json', { body: JSON.stringify(network), contentType: 'application/json' })
  }
})

test('normal Q01 commits IME final text before immediate Next and survives a full reload', async ({ page, baseURL }, info) => {
  const network = await isolatedNetwork(page, baseURL!)
  try {
    await enter(page)
    const field = page.getByTestId('quotation-first-step-description').locator('textarea')
    await field.evaluate(element => {
      const field = element as HTMLTextAreaElement
      field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      field.value = 'weixiu'
      field.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, data: 'weixiu' }))
    })
    expect((await quotationDraft(page)).groups[0].partDescription).toBe('initial synthetic description')
    await field.evaluate(element => {
      const field = element as HTMLTextAreaElement
      field.value = '最终维修描述\n第二行'
      field.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: field.value }))
      field.dispatchEvent(new InputEvent('input', { bubbles: true, data: field.value }))
    })
    await page.getByTestId('quotation-first-step-select-products').click()
    await page.getByTestId('quotation-catalog-close').click()
    await expect(field).toHaveValue('最终维修描述\n第二行')
    await expect.poll(async () => (await quotationDraft(page)).groups[0].partDescription).toBe('最终维修描述\n第二行')
    await page.reload()
    await expect(field).toHaveValue('最终维修描述\n第二行')
    expect(network.external).toEqual([]); expect(network.errors).toEqual([])
  } finally {
    await info.attach('network.json', { body: JSON.stringify(network), contentType: 'application/json' })
  }
})
