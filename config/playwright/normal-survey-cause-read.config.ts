import { defineConfig } from '@playwright/test'
import { rootPath } from '../paths'
const origin='http://127.0.0.1:5189'
export default defineConfig({
  testDir:rootPath('tests/h5-main-mock'),testMatch:'normal-survey-cause-read.spec.ts',workers:1,fullyParallel:false,retries:0,
  timeout:45_000,expect:{timeout:10_000},
  outputDir:rootPath('test-results/normal-survey-cause-read/attachments'),
  reporter:[['list'],['json',{outputFile:rootPath('test-results/normal-survey-cause-read/results.json')}],['html',{outputFolder:rootPath('test-results/normal-survey-cause-read/html'),open:'never'}]],
  use:{baseURL:origin,viewport:{width:430,height:932},trace:'on',screenshot:'on'},
  webServer:{command:'./node_modules/.bin/uni -p h5 --host 127.0.0.1 --port 5189 --strictPort',url:origin,cwd:rootPath(),reuseExistingServer:false,timeout:120_000,
    env:{UNI_CUSTOM_CONTEXT:'{"XLINK_DEV_QA":true}',UNI_OUTPUT_DIR:rootPath('unpackage/normal-survey-cause-read-h5'),
      VITE_XLINK_ENVIRONMENT:'dev',VITE_XLINK_PLATFORM:'mp-weixin',VITE_XLINK_API_BASE_URL:origin+'/xlink/wm',VITE_XLINK_AUTH_API_BASE_URL:'',VITE_XLINK_AUTH_TENANT:'t',VITE_XLINK_AUTH_METHOD:'phone',
      VITE_XLINK_QUICK_LOGIN_PHONE:'00000000000',VITE_XLINK_QUICK_LOGIN_CODE:'000000',VITE_XLINK_MOCK:'false',VITE_XLINK_H5_MOCK_E2E:'false',VITE_XLINK_AUTH_ONLY_MOCK_BUSINESS:'false',
      VITE_XLINK_ENABLE_REAL_WRITES:'false',VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'false',VITE_XLINK_R1_NODE_FORM_READ:'true',VITE_XLINK_R1_FORMS_ACTIONS:'false',VITE_XLINK_R1_REPEAT_ACTIONS:'false',VITE_XLINK_R1_FORMS_GRANT:'',VITE_XLINK_R1_REPEAT_GRANT:'',
      VITE_XLINK_PRIVACY_POLICY_URL:'https://isolated.xlink.test/privacy',VITE_XLINK_USER_AGREEMENT_URL:'https://isolated.xlink.test/agreement'}}
})
