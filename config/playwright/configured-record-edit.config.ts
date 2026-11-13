import { defineConfig } from '@playwright/test'
import base from './repeat-appointment-edit.config'
import { rootPath } from '../paths'
const server=(base.webServer as {env:Record<string,string>}[])[0]
export default defineConfig({...base,testMatch:'configured-record-edit.spec.ts',metadata:{configuredRecordEdit:true},
  outputDir:rootPath('test-results/configured-record-edit/attachments'),
  reporter:[['list'],['json',{outputFile:rootPath('test-results/configured-record-edit/results.json')}]],
  webServer:[{...server,env:{...server.env,UNI_OUTPUT_DIR:rootPath('unpackage/configured-record-edit-h5'),
    VITE_XLINK_R1_REPEAT_GRANT:JSON.stringify({version:6,synthetic:true,profile:'configured-record-edit',
      scope:{tenantId:'t',userId:'u',roleId:'r',workOrderId:'s',workflowRunId:'w',runtimeNodeId:'n',formDefinitionId:'configured-form'},
      expiresAt:'2099-01-01T00:00:00Z',fieldIds:['measurement','description'],operations:['edit'],recordIds:['saved-a']})}}],
})
