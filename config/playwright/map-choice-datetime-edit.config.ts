import {defineConfig} from '@playwright/test'
import base from './configured-record-edit.config'
import {rootPath} from '../paths'
const server=(base.webServer as {env:Record<string,string>}[])[0]
export default defineConfig({...base,testMatch:['map-choice-datetime-edit.spec.ts','map-conditional-cascade-edit.spec.ts','map-remaining-scalars-edit.spec.ts','map-default-controls-edit.spec.ts'],metadata:{mapChoiceDatetimeEdit:true},
 outputDir:rootPath('test-results/map-choice-datetime-edit/attachments'),
 reporter:[['list'],['json',{outputFile:rootPath('test-results/map-choice-datetime-edit/results.json')}]],
 webServer:[{...server,env:{...server.env,UNI_OUTPUT_DIR:rootPath('unpackage/map-choice-datetime-edit-h5'),
  VITE_XLINK_R1_REPEAT_GRANT:JSON.stringify({version:6,synthetic:true,profile:'configured-record-edit',
   scope:{tenantId:'t',userId:'u',roleId:'r',workOrderId:'s',workflowRunId:'w',runtimeNodeId:'n',formDefinitionId:'configured-form'},
   expiresAt:'2099-01-01T00:00:00Z',fieldIds:['choice-field','time-field','note-field'],operations:['edit'],recordIds:['saved-a']})}}],
})
