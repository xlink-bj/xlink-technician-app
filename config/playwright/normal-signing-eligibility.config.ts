import {defineConfig} from '@playwright/test'
import base from './repeat-appointment-edit.config'
import {rootPath} from '../paths'
const server=(base.webServer as {env:Record<string,string>}[])[0]
export default defineConfig({...base,testMatch:'normal-signing-eligibility.spec.ts',
 outputDir:rootPath('test-results/normal-signing-eligibility/attachments'),
 reporter:[['list'],['json',{outputFile:rootPath('test-results/normal-signing-eligibility/results.json')}]],
 webServer:[{...server,env:{...server.env,UNI_OUTPUT_DIR:rootPath('unpackage/normal-signing-eligibility-h5'),
 VITE_XLINK_ENABLE_REAL_WRITES:'false',VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'false',VITE_XLINK_R1_REPEAT_ACTIONS:'false',VITE_XLINK_R1_REPEAT_GRANT:''}}],
})
