import {defineConfig} from '@playwright/test'
import base from './repeat-appointment-edit.config'
import {rootPath} from '../paths'
const server=(base.webServer as {env:Record<string,string>}[])[0]
export default defineConfig({...base,testMatch:'normal-appointment-experience.spec.ts',
  metadata:{normalAppointmentExperience:true},
  outputDir:rootPath('test-results/normal-appointment-experience/attachments'),
  reporter:[['list'],['json',{outputFile:rootPath('test-results/normal-appointment-experience/results.json')}]],
  use:{...base.use,actionTimeout:10000},
  webServer:[{...server,env:{...server.env,UNI_OUTPUT_DIR:rootPath('unpackage/normal-appointment-experience-h5')}}],
})
