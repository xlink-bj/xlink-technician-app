// Test-port injection only: the product entry and default HTTPS upload driver
// remain unchanged. No real provider or business API may be forwarded by tests.
import base from './app.config'
import {rootPath} from '../paths'
import type {ConfigEnv,UserConfig} from 'vite'
export default (env:ConfigEnv):UserConfig=>{
 const config=typeof base==='function'?base(env):base
 return {...config,plugins:[{name:'existing-image-upload-test-port',enforce:'pre',transform(code,id){
  if(id.split('?')[0]!==rootPath('src/main.ts'))return
  if(!code.includes('const application = initialize()'))throw Error('Normal App bootstrap changed')
  return `import {createExistingImageTestUploadPort} from '/tests/support/existing-image-upload-test-port.ts'\n`+code.replace('const application = initialize()','const application = initialize({upload:createExistingImageTestUploadPort()})')
 }},...(config.plugins??[])]}
}
