import { defineConfig } from '@playwright/test'
import base from './survey-regions-is-read.config'
import { rootPath } from '../paths'
const server=base.webServer as {command:string;url:string;cwd:string;reuseExistingServer:boolean;timeout:number;env:Record<string,string>}
const scope={tenantId:'t',userId:'u',roleId:'r',workOrderId:'s',workflowRunId:'w',runtimeNodeId:'n',formDefinitionId:'e'}
export default defineConfig({...base,testMatch:'forms-cascade-create.spec.ts',
 outputDir:rootPath('test-results/forms-cascade-create/attachments'),
 reporter:[['list'],['json',{outputFile:rootPath('test-results/forms-cascade-create/results.json')}]],
 webServer:{...server,env:{...server.env,UNI_OUTPUT_DIR:rootPath('unpackage/forms-cascade-create-h5'),
  VITE_XLINK_ENABLE_REAL_WRITES:'true',VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'true',VITE_XLINK_R1_FORMS_ACTIONS:'true',
  VITE_XLINK_R1_FORMS_GRANT:JSON.stringify({version:1,scope,fieldIds:['checks','multi','memo'],operations:['create'],expiresAt:'2099-01-01T00:00:00Z'})}},
})
