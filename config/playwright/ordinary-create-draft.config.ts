import {defineConfig} from '@playwright/test'
import base from './forms-choice-create.config'
import {rootPath} from '../paths'
const server=base.webServer as {command:string;url:string;cwd:string;reuseExistingServer:boolean;timeout:number;env:Record<string,string>}
const scope={tenantId:'t',userId:'u',roleId:'r',workOrderId:'s',workflowRunId:'w',runtimeNodeId:'n',formDefinitionId:'e'}
export default defineConfig({...base,testMatch:'ordinary-create-draft.spec.ts',
 outputDir:rootPath('test-results/ordinary-create-draft/attachments'),reporter:[['list'],['json',{outputFile:rootPath('test-results/ordinary-create-draft/results.json')}]],
 webServer:{...server,env:{...server.env,UNI_OUTPUT_DIR:rootPath('unpackage/ordinary-create-draft-h5'),VITE_XLINK_R1_FORMS_GRANT:JSON.stringify({version:1,scope,fieldIds:Array.from({length:6},(_,i)=>'field-'+i),operations:['create'],expiresAt:'2099-01-01T00:00:00Z'})}},
})
