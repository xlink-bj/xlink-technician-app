import {defineConfig} from '@playwright/test'
import base from './normal-form-draft-recovery.config'
import {rootPath} from '../paths'
const server=base.webServer as {env:Record<string,string>}
/** Same bounded memo existing-edit grant as the established existing2 mode. */
export default defineConfig({...base,testMatch:'normal-form-fresh-original.spec.ts',grep:undefined,grepInvert:undefined,
 metadata:{...base.metadata,normalFormFreshOriginal:true},
 outputDir:rootPath('test-results/normal-form-fresh-original/attachments'),
 reporter:[['list'],['json',{outputFile:rootPath('test-results/normal-form-fresh-original/results.json')}]],
 webServer:{...base.webServer as object,env:{...server.env,UNI_OUTPUT_DIR:rootPath('unpackage/normal-form-fresh-original-h5'),
  VITE_XLINK_R1_FORMS_GRANT:JSON.stringify({version:2,scope:{tenantId:'t',userId:'u',roleId:'r',workOrderId:'s',workflowRunId:'w',runtimeNodeId:'n',formDefinitionId:'e'},fieldIds:['memo'],operations:['create','append','edit'],recordIds:['existing'],expiresAt:'2099-01-01T00:00:00Z'})}}})
