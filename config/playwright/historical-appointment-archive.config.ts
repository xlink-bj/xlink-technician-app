import {existsSync} from 'node:fs'
import {defineConfig} from '@playwright/test'
import base from './main-h5-mock.config'
import {rootPath} from '../paths'
import {selectBrand} from '../vite/brand-profile'
const localChrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath=process.env.XLINK_REPEAT_APPOINTMENT_CHROMIUM??(existsSync(localChrome)?localChrome:undefined)
const brand=selectBrand(process.env.VITE_XLINK_BRAND).id
const server=base.webServer as {env:Record<string,string>}
export default defineConfig({...base,testDir:rootPath('tests/h5-appointment-archive'),testMatch:'historical-appointment-archive.spec.ts',
 outputDir:rootPath(`test-results/historical-appointment-archive-${brand}/attachments`),
 reporter:[['list'],['json',{outputFile:rootPath(`test-results/historical-appointment-archive-${brand}/results.json`)}]],
 use:{...base.use,actionTimeout:10000,viewport:{width:430,height:932},trace:'on',screenshot:'on',launchOptions:{executablePath}},
 webServer:{...base.webServer,env:{...server.env,VITE_XLINK_BRAND:brand,VITE_XLINK_R1_MP_UX_FIXTURES:'true',
  VITE_XLINK_R1_APPOINTMENT_ARCHIVE_FIXTURE:'true',VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'false',UNI_OUTPUT_DIR:rootPath(`unpackage/historical-appointment-archive-${brand}-h5`)}},
})
