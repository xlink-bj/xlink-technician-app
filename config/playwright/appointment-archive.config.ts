import {existsSync} from 'node:fs'
import {defineConfig} from '@playwright/test'
import base from './repeat-appointment-edit.config'
import {rootPath} from '../paths'
import {selectBrand} from '../vite/brand-profile'
const server=(base.webServer as {env:Record<string,string>}[])[0]
const localChrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath=process.env.XLINK_REPEAT_APPOINTMENT_CHROMIUM??(existsSync(localChrome)?localChrome:undefined)
const brand=selectBrand(process.env.VITE_XLINK_BRAND).id
const width=process.env.XLINK_APPOINTMENT_WIDTH==='375'?375:process.env.XLINK_APPOINTMENT_WIDTH==='390'?390:430
const height=width===375?667:width===390?844:932
const directory=`test-results/appointment-archive-${brand}-${width}`
export default defineConfig({...base,testDir:rootPath('tests/h5-appointment-archive'),testMatch:'appointment-archive.spec.ts',workers:1,
  outputDir:rootPath(`${directory}/attachments`),
  reporter:[['list'],['json',{outputFile:rootPath(`${directory}/results.json`)}]],
  use:{...base.use,viewport:{width,height},launchOptions:{executablePath}},
  webServer:[{...server,env:{...server.env,VITE_XLINK_BRAND:brand,UNI_OUTPUT_DIR:rootPath(`unpackage/appointment-archive-${brand}-h5`)}}],
})
