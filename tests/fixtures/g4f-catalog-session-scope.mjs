import { resolve } from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
const vite = await createServer({
  configFile: false,
  root,
  mode: 'prod',
  envDir: root,
  resolve: {
    alias: {
      '@': resolve(root, 'src'),
      '@shared': resolve(root, 'src/shared'),
      '@adapters': resolve(root, 'src/adapters'),
    },
  },
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
})

try {
  const { createQuotationCatalogReadAdapter } = await vite.ssrLoadModule('/src/adapters/api/quotation-catalog-api.ts')
  let sessionScope = 'synthetic-session-a'
  let transportCalls = 0
  const catalog = createQuotationCatalogReadAdapter({
    async execute() {
      transportCalls += 1
      return { data: [{ _id: 'synthetic-package-listed-in-session-a', name: '合成套餐' }] }
    },
  }, () => sessionScope)

  const listed = await catalog.listPackages({ serviceType: 'synthetic-service-type', sourceType: 'synthetic-source-type' })
  const callsAfterList = transportCalls
  sessionScope = 'synthetic-session-b'
  const detail = await catalog.getPackageDetail('synthetic-package-listed-in-session-a')

  console.log(JSON.stringify({
    listState: listed.state,
    detailState: detail.state,
    detailError: detail.error?.category ?? null,
    transportCallsAfterList: transportCalls - callsAfterList,
  }))
} finally {
  await vite.close()
}
