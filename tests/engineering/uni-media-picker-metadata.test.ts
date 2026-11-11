import { createUniMediaFilePickerDriver, createUniMediaCaptureDriver } from '@adapters/platform/uni-media-drivers'
import type { PlatformDriverResult } from '@adapters/platform/platform-adapters'
import type { LocalMedia } from '@shared/types'
type ImageResult = Parameters<Parameters<NonNullable<Parameters<typeof createUniMediaFilePickerDriver>[0]>>[0]['success']>[0]
import { it as test } from 'vitest'
import assert from 'node:assert/strict'
const blob = 'blob:http://127.0.0.1:5198/15b692bc-a137-4949-9eca-53d38b2247bf'
const file = (name = 'normal-r1-photo.png', type = 'image/png', path = blob) => Object.assign(new File(['synthetic'], name, { type }), { path })
async function pick(result: ImageResult) { return createUniMediaFilePickerDriver(options => options.success(result)).pick() }
const all = (result: PlatformDriverResult): readonly LocalMedia[] => { assert.equal(result.state, 'granted'); assert.ok(Array.isArray(result.value)); return result.value as readonly LocalMedia[] }
const first = (result: PlatformDriverResult): LocalMedia => all(result)[0]!

test('H5 File preserves original PNG filename, MIME, size and unchanged blob locator', async () => {
  const input=file(), result=first(await pick({tempFilePaths:[blob],tempFiles:[input]}))
  assert.equal(result.name,input.name);assert.equal(result.mimeType,input.type)
  assert.equal(result.size,input.size);assert.equal(result.localPath,blob)
})
test('H5 WebP does not turn into JPEG',async()=>{
  const result=first(await pick({tempFilePaths:[blob],tempFiles:[file('picture.webp','image/webp')]}))
  assert.equal(result.name,'picture.webp');assert.equal(result.mimeType,'image/webp')
})
test('native PNG path metadata is not JPEG',async()=>{
  const result=first(await pick({tempFilePaths:['/tmp/capture.PNG'],tempFiles:[{path:'/tmp/capture.PNG',size:8}]}))
  assert.equal(result.name,'capture.PNG');assert.equal(result.mimeType,'image/png')
})
test('native JPEG path remains compatible',async()=>{
  const result=first(await pick({tempFilePaths:['/tmp/capture.jpg']}))
  assert.equal(result.name,'capture.jpg');assert.equal(result.mimeType,'image/jpeg')
})
test('original File.name wins over an opaque provider path',async()=>{
  const result=first(await pick({tempFiles:[file('图像 original.jpeg','image/jpeg')]}))
  assert.equal(result.name,'图像 original.jpeg');assert.equal(result.localPath,blob)
})
test('path keyed metadata stays with its file even when tempFiles order changes',async()=>{
  const other='blob:http://127.0.0.1:5198/d22ccf29-6497-4e46-a22f-fbb9c9363027'
  const result=await pick({tempFilePaths:[blob,other],tempFiles:[file('other.webp','image/webp',other),file()]})
  assert.equal(first(result).name,'normal-r1-photo.png');assert.equal(all(result)[1]!.name,'other.webp')
  assert.equal(first(result).mimeType,'image/png');assert.equal(all(result)[1]!.mimeType,'image/webp')
})
test('File objects lacking path retain index association only in equal-length API lists',async()=>{
  const input=new File(['synthetic'],'no-path.png',{type:'image/png'})
  const result=first(await pick({tempFilePaths:[blob],tempFiles:[input]}))
  assert.equal(result.name,'no-path.png');assert.equal(result.mimeType,'image/png');assert.equal(result.size,input.size)
})
test('missing metadata on an opaque path never fabricates JPEG or a file extension',async()=>{
  const result=first(await pick({tempFilePaths:[blob]}))
  assert.equal(result.mimeType,'application/octet-stream');assert.equal(result.name,undefined)
})
test('known MIME may supply a neutral filename when original name has no extension',async()=>{
  const result=first(await pick({tempFilePaths:[blob],tempFiles:[file('camera-image','image/png')]}))
  assert.equal(result.mimeType,'image/png');assert.ok(typeof result.name === 'string');assert.match(result.name,/\.png$/)
})
test('non-image MIME is retained so downstream policy can reject it, never relabelled image',async()=>{
  const result=first(await pick({tempFilePaths:[blob],tempFiles:[file('video.mp4','video/mp4')]}))
  assert.equal(result.name,'video.mp4');assert.equal(result.mimeType,'video/mp4')
})
test('empty MIME falls back to an evidenced filename suffix',async()=>{
  const result=first(await pick({tempFilePaths:[blob],tempFiles:[file('picture.png','')]}))
  assert.equal(result.mimeType,'image/png');assert.equal(result.name,'picture.png')
})
test('explicit mismatched metadata path is not attached by array position',async()=>{
  const result=first(await pick({tempFilePaths:[blob],tempFiles:[file('other.png','image/png','blob:other')]}))
  assert.equal(result.mimeType,'application/octet-stream');assert.equal(result.name,undefined)
})
test('input File metadata is not mutated',async()=>{
  const input=file('image','image/png'), before={name:input.name,type:input.type,size:input.size,path:input.path}
  await pick({tempFilePaths:[blob],tempFiles:[input]})
  assert.deepEqual({name:input.name,type:input.type,size:input.size,path:input.path},before)
})
test('camera uses the same truthful metadata without changing source semantics',async()=>{
  let options: { count: number; sourceType: readonly string[] } | undefined
  const result=await createUniMediaCaptureDriver(o=>{options=o;o.success({tempFilePaths:[blob],tempFiles:[file()]})}).capture()
  assert.equal(result.state,'granted');assert.equal((result.value as LocalMedia).name,'normal-r1-photo.png')
  assert.equal((result.value as LocalMedia).mimeType,'image/png');assert.equal((result.value as LocalMedia).source,'camera')
  assert.equal(options?.count,1);assert.deepEqual(options?.sourceType,['camera'])
})
test('library retains supported request count and source',async()=>{
  let options: { count: number; sourceType: readonly string[] } | undefined;const result=await createUniMediaFilePickerDriver(o=>{options=o;o.success({tempFilePaths:['/tmp/a.jpg']})}).pick()
  assert.equal(first(result).source,'library');assert.equal(options?.count,9);assert.deepEqual(options?.sourceType,['album'])
})
test('empty selection remains cancelled',async()=>{assert.equal((await pick({tempFilePaths:[],tempFiles:[]})).state,'cancelled')})
test('picker cancellation remains cancelled',async()=>{assert.equal((await createUniMediaFilePickerDriver(o=>o.fail({})).pick()).state,'cancelled')})
test('driver exception remains retryable',async()=>{assert.equal((await createUniMediaFilePickerDriver(()=>{throw Error('synthetic')}).pick()).state,'error_retryable')})
