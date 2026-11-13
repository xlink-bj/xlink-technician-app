// Imported only by the explicit test-only Vite entry transform. The actual
// normal App, picker, durable queue, serializer and save controller are used.
// No production URL switch or HTTP receipt acceptance is introduced.
import {createUploadAdapter,RetryableUploadError} from '@adapters/upload/upload-adapter'
import {createOperationError} from '@shared/types'
import type {UploadPort} from '@shared/ports'
export function createExistingImageTestUploadPort():UploadPort{
 return {async upload(media){
  let ambiguous=false
  const adapter=createUploadAdapter({async issueToken(){
   const result=await fetch('/xlink/wm/back/super/file/upToken.do',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({fileName:media.name??''})})
   if(!result.ok)throw Error('Synthetic token unavailable')
   return result.json()
  }},{async upload({media,objectKey}){
   const bytes=await(await fetch(media.localPath!)).arrayBuffer()
   let response:Response
   try{response=await fetch('https://existing-image-bridge.invalid/upload',{method:'POST',headers:{'Content-Type':media.mimeType,'X-Test-Object-Key':objectKey??''},body:bytes})}
   catch{ambiguous=true;throw Error('Local sink response lost')}
   if(response.status===503&&response.headers.get('X-Test-Upload-Outcome')==='known-rejected')throw new RetryableUploadError('Local sink rejected before storage')
   if(!response.ok)throw Error('Local sink rejected')
   return response.json()
  }})
  const result=await adapter.upload(media)
  return ambiguous?{state:'failed_retryable',error:createOperationError('network_retryable','Upload ACK unknown',{code:'ambiguous_upload'})}:result
 }}
}
