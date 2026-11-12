import { defineConfig } from '@playwright/test'
import base from './repeat-appointment-edit.config'
import { rootPath } from '../paths'
const server=(Array.isArray(base.webServer)?base.webServer[0]:base.webServer) as {command:string;url:string;cwd:string;reuseExistingServer:boolean;timeout:number;env:Record<string,string>}
export default defineConfig({...base,testMatch:'normal-repeat-workspace.spec.ts',metadata:{normalRepeatWorkspace:true},
 outputDir:rootPath('test-results/normal-repeat-workspace/attachments'),
 reporter:[['list'],['json',{outputFile:rootPath('test-results/normal-repeat-workspace/results.json')}]],
 webServer:{...server,env:{...server.env,UNI_OUTPUT_DIR:rootPath('unpackage/normal-repeat-workspace-h5'),
  VITE_XLINK_R1_REPEAT_GRANT:JSON.stringify({version:1,scope:{tenantId:'t',userId:'u',roleId:'r',workOrderId:'s',workflowRunId:'w',runtimeNodeId:'n',formDefinitionId:'e'},fieldIds:['memo','zero'],operations:['create','complete'],expiresAt:'2099-01-01T00:00:00Z'})}},
})
