import { defineConfig } from '@playwright/test'
import base from './survey-59-read.config'
import { rootPath } from '../paths'
const server = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer
if (!server) throw Error('Normal App server is required')
const scope={tenantId:'t',userId:'u',roleId:'r',workOrderId:'s',workflowRunId:'w',runtimeNodeId:'n',formDefinitionId:'e'}
export default defineConfig({...base,testMatch:'forms-scalar-subset.spec.ts',
 outputDir:rootPath('test-results/forms-scalar-subset/attachments'),
 reporter:[['list'],['json',{outputFile:rootPath('test-results/forms-scalar-subset/results.json')}]],
 webServer:{...server,env:{...server.env,VITE_XLINK_ENABLE_REAL_WRITES:'true',VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'true',VITE_XLINK_R1_FORMS_ACTIONS:'true',
 VITE_XLINK_R1_FORMS_GRANT:JSON.stringify({version:2,scope,expiresAt:'2099-01-01T00:00:00Z',fieldIds:['area'],operations:['create','append','edit'],recordIds:['created']})}},
})
