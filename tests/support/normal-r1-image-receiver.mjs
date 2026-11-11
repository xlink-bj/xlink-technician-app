import http from 'node:http'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Test-only, fixed loopback profiles. No remote target, file path, credentials,
// certificates or user-supplied output path can be configured through this API.
const profiles = { 'normal-r1-file-upload': 5332, 'normal-r1-image-recovery': 5334 }
const profile = process.argv[2]
if (process.argv.length !== 3 || !Object.hasOwn(profiles, profile)) throw Error('Select a known synthetic image receiver profile')
const port = profiles[profile], origin = 'http://127.0.0.1:5189'
const dir = resolve('test-results', profile)
mkdirSync(dir, { recursive: true })
const keyExpected = 'normal-r1-photo.png'
const imageExpected = '2ffaac765f3cbd3a27c8013e03ea3c4a3381aae43651c9584a04b555f8583c91'
const ledger = [], objects = new Map()
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
function record(value) {
  ledger.push(value)
  if (ledger.length > 256) ledger.shift()
  writeFileSync(resolve(dir, 'receiver-ledger.json'), JSON.stringify(ledger, null, 2))
}
function json(res, status, value) {
  res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value))
}
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', origin)
  if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== origin)) {
    json(res, 403, { error: 'Loopback synthetic fixture only' }); return
  }
  if (req.method === 'GET' && req.url === '/health') { res.end('ready'); return }
  if (req.method === 'GET' && req.url === '/ledger') { json(res, 200, ledger); return }
  // A fixed in-memory object, never a filesystem path or proxy target.
  if (req.method === 'GET' && req.url === '/objects/' + keyExpected) {
    const image = objects.get(keyExpected)
    if (!image) { json(res, 404, { error: 'Synthetic object not found' }); return }
    record({ method: 'GET', key: keyExpected, imageBytes: image.length, imageSha256: sha(image) })
    res.setHeader('Content-Type', 'image/png'); res.end(image); return
  }
  if (req.method !== 'POST' || req.url !== '/upload') { json(res, 404, { error: 'Unknown synthetic route' }); return }
  const boundary = /^multipart\/form-data;\s*boundary=(?:"([A-Za-z0-9'()+_,.\/:=?-]{1,70})"|([A-Za-z0-9'()+_,.\/:=?-]{1,70}))$/i.exec(String(req.headers['content-type']))
  if (!boundary) { json(res, 400, { error: 'Synthetic multipart boundary missing' }); return }
  const chunks = []; let size = 0
  try {
    for await (const chunk of req) {
      size += chunk.length
      if (size > 4 * 1024 * 1024) { json(res, 413, { error: 'Synthetic multipart too large' }); return }
      chunks.push(chunk)
    }
    const bytes = Buffer.concat(chunks), body = bytes.toString('latin1')
    const keys = [...body.matchAll(/name="key"\r\n\r\n([^\r\n]+)/g)]
    const files = [...body.matchAll(/name="file"; filename="([^"\r\n]{1,255})"\r\n(?:[^\r\n]*\r\n)*\r\n/g)]
    const key = keys.length === 1 ? keys[0][1] : undefined, marker = files.length === 1 ? files[0] : undefined
    const start = marker ? marker.index + marker[0].length : -1
    const end = start < 0 ? -1 : body.indexOf('\r\n--' + (boundary[1] ?? boundary[2]), start)
    const image = start >= 0 && end >= start ? bytes.subarray(start, end) : undefined
    record({ method: 'POST', contentType: req.headers['content-type'], key, filename: marker?.[1],
      multipartBytes: bytes.length, multipartSha256: sha(bytes), imageBytes: image?.length,
      imageSha256: image ? sha(image) : null })
    // Accept only the generated, pixel-decoded 4x4 PNG used by these two specs.
    // A local caller cannot turn the fixture into storage for a personal file.
    if (key !== keyExpected || image?.length !== 78 || sha(image) !== imageExpected) {
      json(res, 400, { error: 'Synthetic image identity missing' }); return
    }
    objects.set(key, image)
    json(res, 200, { key, hash: 'synthetic-loopback-only' })
  } catch { if (!res.writableEnded) json(res, 400, { error: 'Synthetic multipart incomplete' }) }
})
server.requestTimeout = 10_000
server.headersTimeout = 5_000
server.keepAliveTimeout = 1_000
server.listen(port, '127.0.0.1')
process.on('SIGTERM', () => server.close(() => process.exit(0)))
process.on('SIGINT', () => server.close(() => process.exit(0)))
