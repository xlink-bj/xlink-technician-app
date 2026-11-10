import { defineConfig } from '@playwright/test'
import base from './forms-scalar-subset.config'
import { rootPath } from '../paths'
const server=Array.isArray(base.webServer)?base.webServer[0]:base.webServer
if(!server)throw Error('Normal App server required')
const scope={tenantId:'t',userId:'u',roleId:'r',workOrderId:'s',workflowRunId:'w',runtimeNodeId:'n',formDefinitionId:'e'}
export default defineConfig({...base,testMatch:'generic-map-edit.spec.ts',outputDir:rootPath('test-results/generic-map-edit/attachments'),
 reporter:[['list'],['json',{outputFile:rootPath('test-results/generic-map-edit/results.json')}]],
 webServer:{...server,env:{...server.env,VITE_XLINK_R1_FORMS_GRANT:JSON.stringify({version:2,scope,expiresAt:'2099-01-01T00:00:00Z',fieldIds:['memo'],operations:['edit'],recordIds:['v']})}}})
