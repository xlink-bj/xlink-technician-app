import {defineConfig} from '@playwright/test'
import base from './retained-attachment-edit.config'
import {rootPath} from '../paths'
const server=(base.webServer as {env:Record<string,string>}[])[0]
export default defineConfig({...base,testMatch:'existing-image-upload.spec.ts',
 outputDir:rootPath('test-results/existing-image-upload',process.env.XLINK_UPLOAD_RUN??'run','attachments'),
 reporter:[['list'],['json',{outputFile:rootPath('test-results/existing-image-upload',process.env.XLINK_UPLOAD_RUN??'run','results.json')}]],
 webServer:[{...server,command:'./node_modules/.bin/uni -p h5 -c config/vite/existing-image-upload-test.config.ts --host 127.0.0.1 --port 5189 --strictPort',
  env:{...server.env,UNI_OUTPUT_DIR:rootPath('unpackage/existing-image-upload-h5')}}],
})
