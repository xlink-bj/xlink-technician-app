import {defineConfig} from '@playwright/test'
import base from './appointment-archive.config'
import {rootPath} from '../paths'
const server=(base.webServer as {env:Record<string,string>}[])[0]
export default defineConfig({...base,
 outputDir:rootPath('test-results/appointment-archive-yuhong/attachments'),
 reporter:[['list'],['json',{outputFile:rootPath('test-results/appointment-archive-yuhong/results.json')}]],
 webServer:[{...server,env:{...server.env,VITE_XLINK_BRAND:'yuhong',UNI_OUTPUT_DIR:rootPath('unpackage/appointment-archive-yuhong-h5')}}],
})
