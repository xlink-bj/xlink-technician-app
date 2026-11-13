import {defineConfig} from '@playwright/test'
import base from './configured-record-edit.config'
import {rootPath} from '../paths'
const server=(base.webServer as {env:Record<string,string>}[])[0]
export default defineConfig({...base,testMatch:'retained-attachment-edit.spec.ts',metadata:{mapChoiceDatetimeEdit:true},
 outputDir:rootPath('test-results/retained-attachment-edit/attachments'),
 reporter:[['list'],['json',{outputFile:rootPath('test-results/retained-attachment-edit/results.json')}]],
 webServer:[{...server,env:{...server.env,VITE_XLINK_MEDIA_DOWNLOAD_BASE_URL:'https://files.example.invalid',UNI_OUTPUT_DIR:rootPath('unpackage/retained-attachment-edit-h5'),
  VITE_XLINK_R1_REPEAT_GRANT:JSON.stringify({version:6,synthetic:true,profile:'configured-record-edit',
   scope:{tenantId:'t',userId:'u',roleId:'r',workOrderId:'s',workflowRunId:'w',runtimeNodeId:'n',formDefinitionId:'configured-form'},
   expiresAt:'2099-01-01T00:00:00Z',fieldIds:['choice-field','time-field'],operations:['edit'],recordIds:['saved-a']})}}],
})
