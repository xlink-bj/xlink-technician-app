import {defineConfig} from '@playwright/test'
import base from './configured-record-edit.config'
import {rootPath} from '../paths'
const server=(base.webServer as {env:Record<string,string>}[])[0]
export default defineConfig({...base,testMatch:'map-bizselect-scalar-edit.spec.ts',
 outputDir:rootPath('test-results/map-bizselect-scalar-edit',process.env.XLINK_BIZSELECT_RUN??'run','attachments'),
 reporter:[['list'],['json',{outputFile:rootPath('test-results/map-bizselect-scalar-edit',process.env.XLINK_BIZSELECT_RUN??'run','results.json')}]],
 webServer:[{...server,env:{...server.env,UNI_OUTPUT_DIR:rootPath('unpackage/map-bizselect-scalar-edit-h5')}}],
})
