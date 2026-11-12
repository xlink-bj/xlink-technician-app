import {defineConfig} from '@playwright/test'
import base from './forms-mixed-create.config'
import {rootPath} from '../paths'
const server=base.webServer as {command:string;url:string;cwd:string;reuseExistingServer:boolean;timeout:number;env:Record<string,string>}
export default defineConfig({...base,testMatch:'ordinary-create-plan.spec.ts',
 outputDir:rootPath('test-results/ordinary-create-plan/attachments'),reporter:[['list'],['json',{outputFile:rootPath('test-results/ordinary-create-plan/results.json')}]],
 webServer:[{command:'node tests/support/normal-r1-image-receiver.mjs forms-unified-create',url:'http://127.0.0.1:5338/health',cwd:rootPath(),reuseExistingServer:false,timeout:15000},
 {...server,env:{...server.env,UNI_OUTPUT_DIR:rootPath('unpackage/ordinary-create-plan-h5'),VITE_XLINK_MEDIA_DOWNLOAD_BASE_URL:'https://synthetic-normal-r1-file.invalid/objects'}}],
})
