import { enterNormalFormWorkspace } from '../support/normal-form-workspace-entry'
import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'

test.skip(process.env.XLINK_H5_NORMAL_R1_IMAGE_RECOVERY !== 'true', 'Explicit fully intercepted normal-App file flow only')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR4nGOUq7j0nwEJMDGgAcICAJ0wAm/4ZvM3AAAAAElFTkSuQmCC', 'base64')
const imageSha256 = createHash('sha256').update(png).digest('hex')
const receiver = 'http://127.0.0.1:5334'
const thumbnailOrigin = 'https://synthetic-normal-r1-file.invalid'
const objectKey = 'normal-r1-photo.png'
const signedURL = thumbnailOrigin + '/objects/' + objectKey + '?Expires=1893456000&Signature=a%2Fb%2B%3D&x=1'

for (const mode of ['bad-mime', 'video-mime', 'mismatch-mime', 'bad-url', 'signed-save', 'cancel-first', 'refresh-foreign', 'pending-cancel'] as const) {
test(`normal image recovery ${mode}`,  async ({ page, request, baseURL }, info) => {
  const calls: { path: string; body: Record<string, string> }[] = [], unexpected: string[] = [], errors: string[] = []
  let providerRequests = 0, pickerEvents = 0, status = 'NOT_VERIFIED'
  let releaseProvider: () => void = () => {}
  const providerBarrier = new Promise<void>(resolve => { releaseProvider = resolve })
  const receiverStart = (await (await request.get(receiver + '/ledger')).json() as unknown[]).length
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
    const req = route.request(), url = new URL(req.url())
    if (url.origin === 'https://up-z1.qiniup.com' && req.method() === 'POST') {
      providerRequests++
      // Preserve the browser-produced multipart body/boundary. Change only the
      // destination; no request reaches Qiniu or any remote business endpoint.
      const response = await route.fetch({ url: receiver + '/upload', maxRedirects: 0 })
      if (mode === 'pending-cancel') await providerBarrier
      if (mode === 'signed-save') return route.fulfill({ json: { key: objectKey, hash: 'synthetic-loopback-only', url: signedURL } })
      if (mode === 'bad-url') return route.fulfill({ json: { key: objectKey, hash: 'synthetic-loopback-only', url: 'https://' } })
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
    await chooser.setFiles(mode === 'bad-mime'
      ? { name: 'synthetic-document.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nsynthetic-only\n%%EOF') }
      : mode === 'video-mime' ? { name: 'synthetic-video.mp4', mimeType: 'video/mp4', buffer: Buffer.from('synthetic-video-metadata-only') }
      : mode === 'mismatch-mime' ? { name: 'synthetic-mismatch.png', mimeType: 'image/jpeg', buffer: png }
      : { name: 'synthetic-normal-photo.png', mimeType: 'image/png', buffer: png })
    if (mode === 'bad-mime' || mode === 'video-mime' || mode === 'mismatch-mime') {
      // Await an actual settled rejection rendered by the real field control.
      await expect(page.getByTestId('r1-normal-file-status-photo')).toContainText('所选附件身份或格式尚未核实。', { timeout: 6000 })
      await expect(page.getByTestId('r1-normal-file-add-photo')).toHaveAttribute('aria-disabled', 'false')
      expect(calls.filter(c => c.path === 'back/super/file/upToken.do')).toHaveLength(0)
      expect(providerRequests).toBe(0); expect(writes).toHaveLength(0)
      status = 'PASS_BAD_MIME_REJECTED_BEFORE_TOKEN'
      return
    }
    if (mode === 'pending-cancel') {
      await expect.poll(() => providerRequests).toBe(1)
      await expect(page.getByTestId('r1-normal-edit-cancel')).toBeVisible()
      await page.getByTestId('r1-normal-edit-cancel').click()
      await expect(page.getByTestId('r1-normal-create')).toBeVisible()
      await expect(page.getByTestId('r1-normal-append')).toHaveCount(0)
      await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled', 'true')
      await expect(page.getByTestId('r1-normal-file-preview-photo')).toHaveCount(0)
      expect(writes).toHaveLength(0); expect(providerRequests).toBe(1)
      releaseProvider()
      await expect(page.getByTestId('r1-normal-create')).toHaveCount(0)
      await expect(page.getByTestId('r1-normal-append')).toBeVisible()
      await page.getByTestId('r1-normal-append').click()
      await expect(page.getByTestId('r1-normal-file-add-photo')).toHaveAttribute('aria-disabled', 'false')
      await expect(page.getByTestId('r1-normal-file-preview-photo')).toHaveCount(0)
      const received = (await (await request.get(receiver + '/ledger')).json() as { method: string; imageSha256: string }[]).slice(receiverStart)
      expect(received.filter(r => r.method === 'POST')).toMatchObject([{ imageSha256 }])
      expect(writes).toHaveLength(0); expect(providerRequests).toBe(1)
      status = 'PASS_PENDING_CANCEL_REVOKES_LATE_RECEIPT_THEN_CLEANS_OWNED_QUEUE'
      return
    }
    if (mode === 'bad-url') {
      await expect.poll(() => providerRequests).toBe(1)
      await expect(page.getByTestId('r1-normal-file-status-photo')).not.toContainText('正在处理图片')
      await expect(page.locator('.r1-file-name')).toHaveCount(0)
      await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled', 'true')
      expect(writes).toHaveLength(0)
      await page.getByTestId('r1-normal-edit-cancel').click()
      await expect(page.getByTestId('r1-normal-create')).toBeVisible()
      await expect(page.getByTestId('r1-normal-append')).toHaveCount(0)
      await expect(page.getByTestId('r1-normal-form-read-message')).not.toHaveText('')
      await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled', 'true')
      expect(providerRequests).toBe(1); expect(writes).toHaveLength(0)
      status = 'PASS_BAD_RECEIPT_NO_DRAFT_SAVE_AND_AMBIGUOUS_CANCEL_BLOCKED'
      return
    }
    await expect.poll(() => providerRequests).toBe(1)
    await expect(page.getByTestId('r1-normal-file-preview-photo')).toBeVisible()
    if (mode === 'refresh-foreign') {
      await page.reload(); await page.goto('/#/pages/index/index'); await page.locator('.launch-cta').click()
      await page.locator('.method-card').filter({ hasText: '快捷登录' }).click(); await expect(page.locator('.home-page')).toBeVisible()
      await page.locator('.work-orders-entry').click(); await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page); await read().click()
      await expect(page.getByTestId('r1-normal-file-status-photo')).toBeVisible()
      await expect(page.getByTestId('r1-normal-file-add-photo')).toHaveAttribute('aria-disabled', 'true')
      await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled', 'true')
      await expect(page.getByTestId('r1-normal-file-preview-photo')).toHaveCount(0)
      expect(providerRequests).toBe(1); expect(writes).toHaveLength(0)
      status = 'PASS_REFRESH_FOREIGN_TASK_BLOCKED_WITHOUT_ADOPTION_OR_REUPLOAD'
      return
    }
    if (mode === 'cancel-first') {
      await expect(page.getByTestId('r1-normal-edit-cancel')).toBeVisible({ timeout: 6000 })
      await page.getByTestId('r1-normal-edit-cancel').click()
      await expect(page.getByTestId('r1-normal-create')).toHaveCount(0)
      await expect(page.getByTestId('r1-normal-append')).toBeVisible()
      await page.getByTestId('r1-normal-append').click()
      await expect(page.getByTestId('r1-normal-file-add-photo')).toHaveAttribute('aria-disabled', 'false')
      await expect(page.getByTestId('r1-normal-file-preview-photo')).toHaveCount(0)
      expect(writes).toHaveLength(0); expect(providerRequests).toBe(1)
      const [again] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('r1-normal-file-add-photo').click()])
      await again.setFiles({ name: 'synthetic-normal-photo.png', mimeType: 'image/png', buffer: png })
      await expect.poll(() => providerRequests).toBe(2)
      await expect(page.getByTestId('r1-normal-file-preview-photo')).toBeVisible()
    }
    await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled', 'false')
    await page.getByTestId('r1-normal-save').click()
    await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取')
    const file = structuredClone((saved!.photo as Record<string, unknown>[])[0]!)
    expect(file).toEqual({ url: mode === 'signed-save' ? signedURL : thumbnailOrigin + '/objects/' + objectKey, name: objectKey, extname: 'png' })
    expect(writes.map(w => w.path)).toEqual(['biz/extForm/upsert/' + node.nodeDef.formDefId, 'workflowNode/updateExts/' + node._id])
    const readsBefore = recordReads.length
    await page.goto('/#/pages/work-orders/work-orders'); await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page); await read().click()
    await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(1)
    await expect(page.getByTestId('r1-normal-file-preview-photo')).toBeVisible()
    expect(recordReads.length).toBeGreaterThan(readsBefore)
    expect(recordReads.slice(readsBefore).every(row => row.id === 'synthetic-normal-photo-record' && JSON.stringify(row.photo) === JSON.stringify([file]))).toBe(true)
    expect(writes).toHaveLength(2); expect(providerRequests).toBe(mode === 'cancel-first' ? 2 : 1)
    expect(calls.some(c => /workflow\/process|remove|delete/.test(c.path))).toBe(false)
    status = mode === 'cancel-first' ? 'PASS_CANCEL_REOPEN_RESELECT_SAVE_REENTRY' : 'PASS_SIGNED_URL_BYTES_SAVE_REENTRY'
    await page.screenshot({ path: info.outputPath('image-recovery-saved-reentered.png'), fullPage: true })

  } finally {
    releaseProvider()
    let pickerMetadata: unknown
    try { pickerMetadata = await page.evaluate(() => (globalThis as unknown as { __normalFilePickerObservation?: unknown[] }).__normalFilePickerObservation) }
    catch (error) { pickerMetadata = { unavailable: String(error) } }
    let actualReceiver: unknown
    try { actualReceiver = (await (await request.get(receiver + '/ledger')).json() as unknown[]).slice(receiverStart) }
    catch (error) { actualReceiver = { unavailable: String(error) } }
    await info.attach('normal-file-request-ledger', { body: JSON.stringify({ mode, status, calls, writes, recordReads, unexpected, errors,
      pickerEvents, pickerMetadata, providerRequests, imageSha256, actualReceiver,
      businessMock: false, rawNodeType: 'forms', specialPreview: false, uploadPortReplaced: false,
      realBackend: 'NOT_RUN', realExternalUpload: 'NOT_RUN' }, null, 2), contentType: 'application/json' })
    if (status.startsWith('PASS')) { expect(errors).toEqual([]); expect(unexpected).toEqual([]) }
  }
})
}
