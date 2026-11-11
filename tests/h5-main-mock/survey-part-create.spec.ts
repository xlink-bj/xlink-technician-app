import { test, expect } from '@playwright/test'

test.skip(process.env.XLINK_H5_SURVEY_PART_CREATE !== 'true', 'Opt-in intercepted synthetic canonical Survey')
const def = '7971040108398070730'
for (const mode of ['save', 'provider-drift', 'wrong-readback'] as const) {
  test(`canonical synthetic Survey ${mode} uses normal Cascade and area input events`, async ({ page, baseURL }, info) => {
    const calls: string[] = [], writes: Record<string, unknown>[] = [], unexpected: string[] = [], errors: string[] = []
    let saved: Record<string, unknown> | null = null, drift = false
    const fields = ['part', 'length', 'width', 'planeArea', 'memo'].map(name => ({
      _id: name, tenantId: 't', extId: def, colName: 'survey', state: 1, name, nameDisp: name,
      type: name === 'part' ? 'cascade' : name === 'memo' ? 'textarea' : 'digit',
      required: name !== 'memo', readOnly: 0, preset: 1, multiple: false,
      frontEndConfig: '{}', showType: '1', showList: ['2', '4'],
      ...(name === 'part' ? { valueOption: 'parts' } : {}),
    }))
    const node = { _id: 'n', tenantId: 't', workflowId: 'w', workflowFormDataId: 's', workflowFormColName: 'serviceAppointment', state: 0, handlerIds: ['r'],
      nodeDef: { nodeType: 'repeat', formDefId: def, name: '合成窗体测量', viewableRoleIds: ['r'], formFieldIdsFill: fields.map(f => f._id), formFieldIdsReadOnly: [] } }
    const sa = { _id: 's', tenantId: 't', workflowId: 'w', state: 1, status: 203, serviceType: '40', name: '合成级联测量', orderNum: 'SYNTHETIC-PART', exts: { sourceType: '' } }
    const provider = () => [{ _id: 'parts-root', type: 'parts', children: [
      { _id: 'part-3', parentId: 'parts-root', type: 'parts', value: '3', name: drift ? 'changed' : '合成窗类', children: [
        { _id: 'part-31', parentId: 'part-3', type: 'parts', value: '31', name: '合成窗边', children: [
          { _id: 'part-311', parentId: 'part-31', type: 'parts', value: '311', name: '合成内侧', children: [] },
        ] },
      ] },
      { _id: 'part-1', parentId: 'parts-root', type: 'parts', value: '1', name: '合成其他', children: [
        { _id: 'part-11', parentId: 'part-1', type: 'parts', value: '11', name: '合成叶项', children: [] },
      ] },
    ] }]
    page.on('pageerror', e => errors.push(e.message))
    await page.routeWebSocket('**/*', socket => {
      if (new URL(socket.url()).host === new URL(baseURL!).host) socket.connectToServer()
      else { unexpected.push('external websocket'); socket.close() }
    })
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url()), path = url.pathname.slice('/xlink/wm/'.length)
      if (url.origin !== baseURL) { unexpected.push('external'); return route.abort() }
      if (!url.pathname.startsWith('/xlink/wm/')) {
        if (req.method() === 'GET' && !['xhr', 'fetch'].includes(req.resourceType())) return route.continue()
        unexpected.push(url.pathname); return route.abort()
      }
      if (req.method() !== 'POST') { unexpected.push(path); return route.abort() }
      calls.push(path)
      const body = Object.fromEntries(new URLSearchParams(req.postData() ?? ''))
      const ok = (json: unknown) => route.fulfill({ json })
      if (path === 'index/phoneLogin.do') return ok({ success: true, status: 1, data: { token: 'synthetic-part-session', user: { _id: 'u', tenantId: 't' }, currentRole: { _id: 'r' }, capabilityNames: [] } })
      if (['function/changeRole', 'function/queryTreeByRoleId'].includes(path)) return ok({ data: { functionList: [{ functionList: [{ order: 1, exts: { tabDisplay: '1' }, action: '/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=0' }] }] } })
      if (['basic/serviceAppointment/query', 'basic/serviceAppointment/querySAWorkflowNode'].includes(path)) return ok({ data: [{ ...node, data: sa }], total: 1, page: 1, rows: 20 })
      if (path === 'basic/serviceAppointment/queryById/s') return ok({ success: true, status: 1, data: { serviceAppointment: sa, workflow: { _id: 'w', tenantId: 't', formDataId: 's', state: 0 }, workflowNode: [node] } })
      if (['code/query', 'biz/action/query.do'].includes(path)) return ok({ data: [], total: 0, page: 1, rows: 20 })
      if (path === 'biz/ext/queryById.do' && body.id === def) return ok({ _id: def, tenantId: 't', state: 1, type: '1', colName: 'survey' })
      if (path === 'biz/extField/query' && body.extId === def) return ok({ data: fields, total: 5, page: 1, size: Number(body.rows) })
      if (path === 'i/code/selectMultistageCode.do') {
        expect(body).toEqual({ types: 'parts', tenantId: 't' })
        return ok(provider())
      }
      if (path === 'biz/extForm/query/' + def) {
        const row = mode === 'wrong-readback' && saved ? { ...saved, part: ['1', '11'] } : saved
        const data = row && (!body['is:_id|string#and'] || body['is:_id|string#and'] === row._id) ? [structuredClone(row)] : []
        return ok({ data, total: data.length, page: 1, size: Number(body.rows), dataCount: data.length })
      }
      if (path === 'biz/extForm/upsert/' + def) {
        expect(writes).toHaveLength(0)
        const data = JSON.parse(body.dataStr)
        expect(data).toEqual({ part: ['3', '31', '311'], length: 2.345, width: 3, planeArea: 7.04, memo: 'synthetic event calculation',
          sid: 's', smodule: 'serviceAppointment', nodeId: 'n', workflowId: 'w', state: 1 })
        writes.push(data)
        saved = { ...data, _id: 'saved', tenantId: 't' }
        return ok({ success: true, status: 1, data: { _id: 'saved' } })
      }
      unexpected.push(path); return route.abort()
    })
    const field = (name: string) => page.getByTestId('r1-normal-input-' + name)
    const input = (name: string) => field(name).locator('input,textarea').first()
    try {
      await page.goto('/#/pages/index/index')
      await page.locator('.launch-cta').click()
      await page.locator('.method-card').filter({ hasText: '快捷登录' }).click()
      await expect(page.locator('.home-page')).toBeVisible()
      await page.locator('.work-orders-entry').click()
      await page.locator('.work-order-card').click()
      const read = () => page.getByTestId('r1-normal-form-read').locator('.app-button').filter({ hasText: '读取已保存表单' }).click()
      await read()
      const save = page.getByTestId('r1-normal-save')
      await expect(save).toHaveAttribute('aria-disabled', 'true')
      await input('length').fill('2.345')
      await input('width').fill('3')
      await expect(input('planeArea')).toHaveValue('')
      await field('part').getByText('合成窗类 / 合成窗边 / 合成内侧', { exact: true }).click()
      await expect(input('planeArea')).toHaveValue('')
      await input('width').fill('0')
      await expect(input('planeArea')).toHaveValue('0')
      await input('width').fill('')
      await expect(input('planeArea')).toHaveValue('')
      await expect(save).toHaveAttribute('aria-disabled', 'true')
      await input('width').fill('3')
      await expect(input('planeArea')).toHaveValue('7.04')
      await input('memo').fill('synthetic event calculation')
      await expect(save).toHaveAttribute('aria-disabled', 'false')
      if (mode === 'provider-drift') drift = true
      await save.click()
      if (mode === 'save') {
        await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取')
        await expect(page.getByTestId('r1-normal-value-planeArea')).toHaveText('7.04')
        await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(1)
        expect(writes).toHaveLength(1)
      } else {
        await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('保存未完成或结果尚未核实')
        expect(writes).toHaveLength(mode === 'provider-drift' ? 0 : 1)
        if (mode === 'wrong-readback') {
          await read()
          await expect(page.getByTestId('r1-normal-save')).toHaveCount(0)
        }
      }
      expect(calls.filter(path => /process|updateExts|upload/.test(path))).toEqual([])
      expect(errors).toEqual([]); expect(unexpected).toEqual([])
      await page.screenshot({ path: info.outputPath('survey-part-' + mode + '.png'), fullPage: true })
    } finally {
      await info.attach('synthetic-part-ledger', { body: JSON.stringify({ mode, calls, writes, unexpected, errors }), contentType: 'application/json' })
    }
  })
}
