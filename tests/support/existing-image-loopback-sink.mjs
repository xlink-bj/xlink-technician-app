import http from 'node:http'
import {createHash, randomBytes} from 'node:crypto'

// A fixed synthetic 1x1 PNG. This module never requests an R1 token or Qiniu.
export const IMAGE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64')
export const IMAGE_SHA256 = createHash('sha256').update(IMAGE).digest('hex')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

export async function createLocalImageSink() {
  const nonce = randomBytes(12).toString('hex'), authorization = 'Bearer synthetic-' + randomBytes(24).toString('hex')
  const objectKey = `synthetic-${nonce}/fixed.png`, pathname = `/objects/${objectKey}`
  const ledger = [], objects = new Map()
  let origin, nextFault
  const server = http.createServer(async (req,res) => {
    const reject = status => {req.resume();res.writeHead(status).end()}
    if (req.socket.remoteAddress !== '127.0.0.1' || req.headers.host !== new URL(origin).host) return reject(403)
    if (req.headers.authorization !== authorization) return reject(403)
    if (req.url !== pathname) return reject(404)
    if (req.method === 'GET') {
      const bytes = objects.get(objectKey)
      if (!bytes) return reject(404)
      ledger.push({method:'GET',objectKey,sha256:sha(bytes),bytes:bytes.length})
      res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'}).end(bytes);return
    }
    if (req.method !== 'PUT') return reject(405)
    if (req.headers['content-type'] !== 'image/png' || req.headers['content-length'] !== String(IMAGE.length)) return reject(415)
    const chunks=[];let size=0
    for await (const chunk of req) {
      size += chunk.length
      if (size > IMAGE.length) {res.writeHead(413).end();req.destroy();return}
      chunks.push(chunk)
    }
    const bytes=Buffer.concat(chunks)
    if (!bytes.equals(IMAGE)) return reject(422)
    const fault=nextFault;nextFault=undefined
    if(fault==='before-store') {
      ledger.push({method:'PUT',objectKey,stored:false,outcome:'known-rejected'})
      res.writeHead(503).end();return
    }
    if(objects.has(objectKey)) return reject(409) // Never silently replay/overwrite.
    objects.set(objectKey,bytes)
    ledger.push({method:'PUT',objectKey,stored:true,sha256:sha(bytes),bytes:size,outcome:fault==='lose-response'?'response-lost':'acknowledged'})
    if(fault==='lose-response'){req.socket.destroy();return}
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'})
      .end(JSON.stringify({key:objectKey,hash:IMAGE_SHA256,url:origin+pathname}))
  })
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  origin=`http://127.0.0.1:${server.address().port}`
  const url=origin+pathname
  return {
    origin,url,objectKey,
    // Ephemeral test-only credential: never serialize this getter or send it to an App/backend.
    get authorization(){return authorization},
    snapshot:()=>structuredClone(ledger),
    storedHash:()=>objects.has(objectKey)?sha(objects.get(objectKey)):null,
    failNext(mode){if(!['before-store','lose-response'].includes(mode))throw Error('Unknown test fault');nextFault=mode},
    async close(){server.closeAllConnections();await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))},
  }
}

/** Reject targets BEFORE fetch, including redirects, credentials, queries,
 * localhost aliases, traversal, another loopback port and public hosts. */
export async function sinkRequest(sink,{target=sink.url,method='PUT',bytes=IMAGE}={}) {
  const parsed=new URL(target)
  if(target!==sink.url||parsed.origin!==sink.origin||parsed.hostname!=='127.0.0.1'||parsed.protocol!=='http:'
    ||parsed.username||parsed.password||parsed.search||parsed.hash||!['GET','PUT'].includes(method))throw Error('Unapproved sink target/method')
  const response=await fetch(target,{method,redirect:'error',signal:AbortSignal.timeout(5000),headers:{Authorization:sink.authorization,
    ...(method==='PUT'?{'Content-Type':'image/png','Content-Length':String(bytes.length)}:{})},...(method==='PUT'?{body:bytes}:{})})
  if(!response.ok)throw Error(`Local sink HTTP ${response.status}`)
  return method==='GET'?Buffer.from(await response.arrayBuffer()):response.json()
}
