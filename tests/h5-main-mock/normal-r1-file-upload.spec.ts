import { isWorkOrderInformationRead } from '../support/work-order-information-fixture'
import { enterNormalFormWorkspace } from '../support/normal-form-workspace-entry'
import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'

test.skip(process.env.XLINK_H5_NORMAL_R1_FILE_UPLOAD !== 'true', 'Explicit fully intercepted normal-App file flow only')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR4nGOUq7j0nwEJMDGgAcICAJ0wAm/4ZvM3AAAAAElFTkSuQmCC', 'base64')
const imageSha256 = createHash('sha256').update(png).digest('hex')
const receiver = 'http://127.0.0.1:5332'
const thumbnailOrigin = 'https://synthetic-normal-r1-file.invalid'
const objectKey = 'normal-r1-photo.png'

test('normal R1 forms picker sends actual multipart then saves and exactly rereads the HTTPS file reference', async ({ page, request, baseURL }, info) => {
  const calls: { path: string; body: Record<string, string> }[] = [], unexpected: string[] = [], errors: string[] = []
  let providerRequests = 0, pickerEvents = 0, status = 'NOT_VERIFIED'
  let saved: Record<string, unknown> | null = null
  const writes: { path: string; data: unknown }[] = [], recordReads: { id: string; photo: unknown }[] = []
  const actor = 'synthetic-media-user', role = 'synthetic-media-role', tenant = 'synthetic-media-tenant'
  const sa = { _id: 'synthetic-media-work', tenantId: tenant, orderNum: 'SYNTHETIC-MEDIA-UI', workflowId: 'synthetic-media-run',
    state: 1, status: 105, serviceType: '40', name: '合成图片表单入口核验', exts: { sourceType: '' } }
  const node = { _id: 'synthetic-media-node', tenantId: tenant, workflowId: sa.workflowId,
    workflowFormDataId: sa._id, workflowFormColName: 'serviceAppointment', state: 0, handlerIds: [role],
    exts: { formList: [] as Record<string, unknown>[], unknownMetadata: { retained: ['file-scope'] } },
    nodeDef: { nodeType: 'forms', name: '合成图片表单', formDefId: 'synthetic-media-def',
      viewableRoleIds: [role], formFieldIdsFill: ['photo'], formFieldIdsReadOnly: [] } }
  const read = () => page.getByTestId('r1-normal-form-read').locator('.app-button').filter({ hasText: '读取已保存表单' })
  page.on('pageerror', e => errors.push(e.message))
  page.on('filechooser', () => { pickerEvents++ })
  await page.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).host === new URL(baseURL!).host) socket.connectToServer()
    else { unexpected.push('WS ' + socket.url()); socket.close() }
  })
  await page.route('**/*', async route => {
    if (isWorkOrderInformationRead(route.request(), baseURL!)) return route.fulfill({ status: 503, json: { success: false, message: 'Synthetic information configuration unavailable' } })
    const req = route.request(), url = new URL(req.url())
    if (url.origin === 'https://up-z1.qiniup.com' && req.method() === 'POST') {
      providerRequests++
      // Preserve the browser-produced multipart body/boundary. Change only the
      // destination; no request reaches Qiniu or any remote business endpoint.
      const response = await route.fetch({ url: receiver + '/upload', maxRedirects: 0 })
      return route.fulfill({ response })
    }
    if (url.origin === thumbnailOrigin && url.pathname === '/objects/' + objectKey && req.method() === 'GET') {
      const response = await route.fetch({ url: receiver + url.pathname, maxRedirects: 0 })
      return route.fulfill({ response })
    }
    if (url.origin !== baseURL) { unexpected.push(req.method() + ' ' + url.origin + url.pathname); return route.abort('blockedbyclient') }
    if (!url.pathname.startsWith('/xlink/wm/')) {
      if (req.method() === 'GET' && !['fetch', 'xhr'].includes(req.resourceType())) return route.continue()
      unexpected.push(req.method() + ' ' + url.pathname); return route.abort('blockedbyclient')
    }
    if (req.method() !== 'POST') { unexpected.push(req.method() + ' ' + url.pathname); return route.abort('blockedbyclient') }
    const path = url.pathname.slice('/xlink/wm/'.length), body = Object.fromEntries(new URLSearchParams(req.postData() ?? ''))
    calls.push({ path, body })
    const ok = (json: unknown) => route.fulfill({ json })
    if (path === 'index/phoneLogin.do') return ok({ success: true, status: 1, data: { token: 'synthetic-local-session', user: { _id: actor, name: '合成媒体技师' }, currentRole: { _id: role, name: '合成角色' }, capabilityNames: [] } })
    if (['function/changeRole', 'function/queryTreeByRoleId'].includes(path)) return ok({ data: { functionList: [{ functionList: [{ order: 1, exts: { tabDisplay: '1' }, action: '/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=0' }] }] } })
    if (['basic/serviceAppointment/query', 'basic/serviceAppointment/querySAWorkflowNode'].includes(path)) return ok({ data: [{ ...node, data: sa }], total: 1, page: 1, rows: 20 })
    if (path === 'basic/serviceAppointment/queryById/' + sa._id) return ok({ success: true, status: 1, data: { serviceAppointment: sa, workflow: { _id: sa.workflowId, tenantId: tenant, formDataId: sa._id, state: 0 }, workflowNode: [node] } })
    if (['code/query', 'biz/action/query.do'].includes(path)) return ok({ data: [], total: 0, page: Number(body.page) || 1, rows: Number(body.rows) || 20, dataCount: 0 })
    if (path === 'biz/ext/queryById.do' && body.id === node.nodeDef.formDefId) return ok({ _id: node.nodeDef.formDefId, tenantId: tenant, type: '0', state: 1, colName: 'syntheticMedia' })
    if (path === 'biz/extField/query' && body.extId === node.nodeDef.formDefId) return ok({ data: [{ _id: 'photo', tenantId: tenant, extId: node.nodeDef.formDefId, state: 1, name: 'photo', nameDisp: '合成图片', type: 'file', required: 0, readOnly: 0, preset: 0, colName: 'syntheticMedia' }], total: 1, page: 1, size: Number(body.rows) || 50, dataCount: 1 })
    if (path === 'back/super/file/upToken.do') { expect(body.fileName).toMatch(/^[a-zA-Z0-9._-]+$/); // Uni H5 names blob paths by UUID; multipart SHA proves selected bytes.
       return ok({ token: 'synthetic-token-with-no-remote-authority', key: objectKey }) }
    if (path === 'biz/extForm/upsert/' + node.nodeDef.formDefId) {
      const data = JSON.parse(body.dataStr ?? 'null') as Record<string, unknown>
      expect(data).toMatchObject({ sid: sa._id, smodule: 'serviceAppointment', nodeId: node._id, workflowId: sa.workflowId, state: 1 })
      expect(data).not.toHaveProperty('_id'); expect(saved).toBeNull()
      writes.push({ path, data })
      saved = { ...data, _id: 'synthetic-normal-photo-record', tenantId: tenant }
      return ok({ success: true, status: 1, data: structuredClone(saved) })
    }
    if (path === 'workflowNode/updateExts/' + node._id && req.headers()['content-type']?.startsWith('application/json')) {
      const data = req.postDataJSON() as typeof node.exts
      expect(saved).not.toBeNull(); expect(data.unknownMetadata).toEqual(node.exts.unknownMetadata)
      expect(data.formList).toEqual([{ _id: saved!._id, formDefId: node.nodeDef.formDefId, formTitle: node.nodeDef.name, state: 1 }])
      writes.push({ path, data }); node.exts = structuredClone(data)
      return ok({ success: true, status: 1 })
    }
    if (path === 'biz/extForm/query/' + node.nodeDef.formDefId) {
      expect(body['is:_id|string#and']).toBe(saved?._id)
      if (saved) recordReads.push({ id: String(saved._id), photo: structuredClone(saved.photo) })
      return ok({ data: saved ? [saved] : [], total: saved ? 1 : 0, page: 1, size: Number(body.rows), dataCount: saved ? 1 : 0 })
    }
    unexpected.push(path); return route.abort('blockedbyclient')
  })
  try {
    await page.goto('/#/pages/index/index')
    await page.locator('.launch-cta').click()
    await page.locator('.method-card').filter({ hasText: '快捷登录' }).click()
    await expect(page.locator('.home-page')).toBeVisible()
    await page.locator('.work-orders-entry').click(); await page.locator('.work-order-card').click();
    await expect(page.getByTestId('task-focus-title')).toHaveText('合成图片表单')
    await enterNormalFormWorkspace(page)
    await read().click()
    await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('已从后台读取 0 条')
    await expect(page.getByTestId('r1-normal-file-add-photo')).toBeVisible({ timeout: 6000 })
    // Observe the real API without changing options/results or replacing its driver.
    await page.evaluate(() => {
      const target = globalThis as unknown as { uni?: { chooseImage?: (...args: unknown[]) => unknown }; __normalFilePickerObservation?: unknown[] }
      const api = target.uni, original = api?.chooseImage
      if (!api || typeof original !== 'function') throw Error('Global uni.chooseImage observation unavailable')
      target.__normalFilePickerObservation = []
      api.chooseImage = function (...args: unknown[]) {
        const options = args[0] as Record<string, unknown>, success = options.success
        const observed = { ...options, success: function (this: unknown, result: unknown) {
          const value = result as { tempFilePaths?: unknown; tempFiles?: unknown[] }
          target.__normalFilePickerObservation!.push({
            tempFilePathCount: Array.isArray(value.tempFilePaths) ? value.tempFilePaths.length : 0,
            tempFiles: value.tempFiles?.map(raw => {
              const file = raw as Record<string, unknown>
              return { keys: Object.keys(file), name: file.name, type: file.type, size: file.size, pathPresent: typeof file.path === 'string' && file.path.length > 0,
                isNativeFile: typeof File !== 'undefined' && raw instanceof File,
                nativeFileName: typeof File !== 'undefined' && raw instanceof File ? raw.name : undefined,
                nestedFileName: file.file instanceof File ? file.file.name : undefined }
            }),
          })
          if (typeof success === 'function') return success.call(this, result)
        } }
        return original.apply(this, [observed, ...args.slice(1)])
      }
    })
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('r1-normal-file-add-photo').click()])
    await chooser.setFiles({ name: 'synthetic-normal-photo.png', mimeType: 'image/png', buffer: png })
    await expect.poll(() => providerRequests).toBe(1)
    await expect(page.getByTestId('r1-normal-file-preview-photo')).toBeVisible()
    await expect.poll(async () => {
      const ledger = await (await request.get(receiver + '/ledger')).json() as { method: string }[]
      return ledger.filter(row => row.method === 'GET').length
    }).toBeGreaterThan(0)
    const received = await (await request.get(receiver + '/ledger')).json() as { method: string; key: string; imageSha256: string; imageBytes: number }[]
    expect(received.filter(r => r.method === 'POST')).toMatchObject([{ key: objectKey, imageSha256, imageBytes: png.length }])
    await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled', 'false')
    await page.getByTestId('r1-normal-save').click()
    await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取')
    const file = structuredClone((saved!.photo as Record<string, unknown>[])[0]!)
    expect(file).toMatchObject({ url: thumbnailOrigin + '/objects/' + objectKey, name: objectKey, extname: 'png' })
    expect(writes.map(w => w.path)).toEqual(['biz/extForm/upsert/' + node.nodeDef.formDefId, 'workflowNode/updateExts/' + node._id])
    const readsBeforeReentry = recordReads.length
    await page.goto('/#/pages/work-orders/work-orders'); await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page)
    await read().click()
    await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(1)
    await expect(page.getByTestId('r1-normal-file-preview-photo')).toBeVisible()
    expect((saved!.photo as Record<string, unknown>[])[0]).toEqual(file)
    expect(recordReads.length).toBeGreaterThan(readsBeforeReentry)
    expect(recordReads.slice(readsBeforeReentry).every(row => row.id === 'synthetic-normal-photo-record' && JSON.stringify(row.photo) === JSON.stringify([file]))).toBe(true)
    expect(writes).toHaveLength(2); expect(pickerEvents).toBe(1); expect(providerRequests).toBe(1)
    expect(calls.filter(c => c.path === 'back/super/file/upToken.do')).toHaveLength(1)
    expect(calls.filter(c => c.path.includes('queryById/')).every(c => Object.keys(c.body).length === 0)).toBe(true)
    expect(calls.some(c => /workflow\/process|remove|delete/.test(c.path))).toBe(false)
    expect(unexpected).toEqual([]); expect(errors).toEqual([])
    status = 'PASS_NORMAL_FILE_PICK_UPLOAD_SAVE_EXACT_READ_SYNTHETIC_HTTP'
    await page.screenshot({ path: info.outputPath('normal-file-saved-reentered.png'), fullPage: true })
  } finally {
    let pickerMetadata: unknown
    try { pickerMetadata = await page.evaluate(() => (globalThis as unknown as { __normalFilePickerObservation?: unknown[] }).__normalFilePickerObservation) }
    catch (error) { pickerMetadata = { unavailable: String(error) } }
    let actualReceiver: unknown
    try { actualReceiver = await (await request.get(receiver + '/ledger')).json() }
    catch (error) { actualReceiver = { unavailable: String(error) } }
    await info.attach('normal-file-request-ledger', { body: JSON.stringify({ status, calls, writes, recordReads, unexpected, errors,
      pickerEvents, pickerMetadata, providerRequests, imageSha256, actualReceiver,
      businessMock: false, rawNodeType: 'forms', specialPreview: false, uploadPortReplaced: false,
      realBackend: 'NOT_RUN', realExternalUpload: 'NOT_RUN' }, null, 2), contentType: 'application/json' })
  }
})
