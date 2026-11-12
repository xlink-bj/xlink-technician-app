import { defineConfig } from '@playwright/test'
import base from './main-h5-mock.config'
import { rootPath } from '../paths'
const server=base.webServer as {command:string;url:string;env:Record<string,string>}
export default defineConfig({...base,testMatch:'dev-mock-dynamic-form-workspace.spec.ts',metadata:{devMockDynamicFormWorkspace:true},
 outputDir:rootPath('test-results/dev-mock-dynamic-form-workspace/attachments'),
 reporter:[['list'],['json',{outputFile:rootPath('test-results/dev-mock-dynamic-form-workspace/results.json')}]],
 webServer:{...server,env:{...server.env,VITE_XLINK_R1_MP_UX_FIXTURES:'true',UNI_OUTPUT_DIR:rootPath('unpackage/dev-mock-dynamic-form-workspace-h5')}},
})
