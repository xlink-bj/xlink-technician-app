import assert from 'node:assert/strict'
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

const productionScope = (overrides = {}) => ({
  sessionRef: 'synthetic-session-a',
  userId: 'synthetic-user-a',
  roleId: 'synthetic-role-a',
  roleVersion: 'synthetic-role-version-a',
  ...overrides,
})

const catalogContext = (overrides = {}) => ({
  workOrderId: 'synthetic-work-order-a',
  serviceType: 'synthetic-service-type-a',
  sourceType: 'synthetic-source-type-a',
  ...overrides,
})

const packageRow = (id) => ({ _id: id, name: `Synthetic ${id}` })
const packageDetail = (id) => ({
  entity: {
    ...packageRow(id),
    procedureList: [],
    materialList: [],
    measureList: [],
  },
})

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

function snapshotFailure(result, category = 'authorization_denied') {
  assert.equal(result.state, 'failed_terminal')
  assert.equal(result.error?.category, category)
}

try {
  const { createQuotationCatalogReadAdapter } = await vite.ssrLoadModule('/src/adapters/api/quotation-catalog-api.ts')
  const routeMethods = [
    ['package', (catalog, context) => catalog.listPackages(context), 'biz/projPackage/queryWithRank'],
    ['procedure', (catalog, context) => catalog.listProcedures(context), 'biz/procedure/queryWithRank'],
    ['material', (catalog, context) => catalog.listMaterials(context), 'basic/material/queryWithRank'],
    ['measure', (catalog, context) => catalog.listMeasures(context), 'biz/measure/queryWithRank'],
  ]

  // Production sourceType must be complete before any transport call.
  let sourceTypeRejected = 0
  for (const [kind, read, expectedPath] of routeMethods) {
    const requests = []
    const catalog = createQuotationCatalogReadAdapter({
      async execute(request) {
        requests.push(request)
        return { data: [] }
      },
    }, () => productionScope())

    const invalidContexts = [
      { label: 'absent', value: { serviceType: 'synthetic-service-type-a' } },
      { label: 'undefined', value: catalogContext({ sourceType: undefined }) },
      { label: 'null', value: catalogContext({ sourceType: null }), include: true },
      { label: 'empty', value: catalogContext({ sourceType: '' }), include: true },
      { label: 'whitespace', value: catalogContext({ sourceType: ' \t ' }), include: true },
      { label: 'number', value: catalogContext({ sourceType: 7 }), include: true },
      { label: 'boolean', value: catalogContext({ sourceType: false }), include: true },
    ]
    for (const item of invalidContexts) {
      const result = await read(catalog, item.value)
      snapshotFailure(result)
      assert.match(result.error.message, /source type.*request was not sent/i)
      assert.equal(requests.length, 0, `${kind} ${item.label} must be rejected before transport`)
      sourceTypeRejected += 1
    }

    const valid = await read(catalog, catalogContext({ sourceType: 'synthetic-source-type-exact' }))
    assert.equal(valid.state, 'succeeded')
    assert.equal(requests.length, 1)
    assert.deepEqual(requests[0], {
      method: 'POST',
      path: expectedPath,
      body: {
        _all: '1',
        'is:state|integer#and': 1,
        'in:serviceType|array#and': 'synthetic-service-type-a',
        sourceType: 'synthetic-source-type-exact',
        sortField: 'order,_id',
        sortOrder: 'asc',
      },
    })
  }

  // Every identity dimension is security-relevant even when sessionRef is stable.
  let identityDimensionInvalidations = 0
  for (const [dimension, changedValue] of [
    ['userId', 'synthetic-user-b'],
    ['roleId', 'synthetic-role-b'],
    ['roleVersion', 'synthetic-role-version-b'],
    ['sessionRef', 'synthetic-session-b'],
  ]) {
    let scope = productionScope()
    let detailCalls = 0
    const catalog = createQuotationCatalogReadAdapter({
      async execute(request) {
        if (request.path === 'biz/projPackage/queryWithRank') return { data: [packageRow(`listed-${dimension}`)] }
        detailCalls += 1
        return packageDetail(`listed-${dimension}`)
      },
    }, () => scope)
    assert.equal((await catalog.listPackages(catalogContext())).state, 'succeeded')
    scope = productionScope({ [dimension]: changedValue })
    snapshotFailure(await catalog.getPackageDetail(`listed-${dimension}`))
    assert.equal(detailCalls, 0, `${dimension} change must reject before package detail transport`)
    identityDimensionInvalidations += 1
  }

  // Unknown identity and logout both clear a previously authorized list scope.
  for (const nextScope of [null, productionScope({ roleVersion: null }), productionScope({ roleId: null })]) {
    let scope = productionScope()
    let detailCalls = 0
    const catalog = createQuotationCatalogReadAdapter({
      async execute(request) {
        if (request.path === 'biz/projPackage/queryWithRank') return { data: [packageRow('listed-before-unknown-scope')] }
        detailCalls += 1
        return packageDetail('listed-before-unknown-scope')
      },
    }, () => scope)
    await catalog.listPackages(catalogContext())
    scope = nextScope
    snapshotFailure(await catalog.getPackageDetail('listed-before-unknown-scope'))
    assert.equal(detailCalls, 0)
  }

  // Work Order identity invalidates prior Package IDs even if provider filters match.
  {
    let detailCalls = 0
    let packageListCalls = 0
    const catalog = createQuotationCatalogReadAdapter({
      async execute(request) {
        if (request.path === 'biz/projPackage/queryWithRank') {
          return { data: [packageRow(`synthetic-package-list-${++packageListCalls}`)] }
        }
        if (request.path !== 'biz/projPackage/findById/synthetic-package-list-2') return { data: [] }
        detailCalls += 1
        const requestedId = request.path.split('/').at(-1)
        return packageDetail(requestedId)
      },
    }, () => productionScope())
    await catalog.listPackages(catalogContext())
    await catalog.listMaterials(catalogContext({ workOrderId: 'synthetic-work-order-b' }))
    snapshotFailure(await catalog.getPackageDetail('synthetic-package-list-1'))
    assert.equal(detailCalls, 0)
    await catalog.listPackages(catalogContext({ workOrderId: 'synthetic-work-order-b' }))
    assert.equal((await catalog.getPackageDetail('synthetic-package-list-2')).state, 'succeeded')
    assert.equal(detailCalls, 1)
  }

  // Package IDs from multiple successful pages remain valid within one identity/context.
  {
    let page = 0
    const catalog = createQuotationCatalogReadAdapter({
      async execute(request) {
        if (request.path === 'biz/projPackage/queryWithRank') return { data: [packageRow(`page-${++page}`)] }
        return packageDetail(request.path.split('/').at(-1))
      },
    }, () => productionScope())
    await catalog.listPackages(catalogContext())
    await catalog.listPackages(catalogContext())
    assert.equal((await catalog.getPackageDetail('page-1')).state, 'succeeded')
    assert.equal((await catalog.getPackageDetail('page-2')).state, 'succeeded')
  }

  // A list completing after an observed identity transition cannot register stale IDs.
  const staleListDeferred = deferred()
  {
    let scope = productionScope()
    let listCalls = 0
    const catalog = createQuotationCatalogReadAdapter({
      async execute(request) {
        if (request.path === 'biz/projPackage/queryWithRank') {
          listCalls += 1
          return staleListDeferred.promise
        }
        return packageDetail('stale-list-package')
      },
    }, () => scope)
    const pendingList = catalog.listPackages(catalogContext())
    await Promise.resolve()
    scope = productionScope({ roleId: 'synthetic-role-after-list' })
    snapshotFailure(await catalog.getPackageDetail('not-listed-under-new-role'))
    staleListDeferred.resolve({ data: [packageRow('stale-list-package')] })
    snapshotFailure(await pendingList)
    snapshotFailure(await catalog.getPackageDetail('stale-list-package'))
    assert.equal(listCalls, 1)
  }

  // A different catalog route can reveal that the active Work Order changed;
  // any older in-flight list result must then be discarded as stale.
  {
    const contextListDeferred = deferred()
    let packageListCalls = 0
    const catalog = createQuotationCatalogReadAdapter({
      async execute(request) {
        if (request.path === 'biz/projPackage/queryWithRank') {
          packageListCalls += 1
          return contextListDeferred.promise
        }
        return { data: [] }
      },
    }, () => productionScope())
    const pendingPackages = catalog.listPackages(catalogContext())
    await Promise.resolve()
    assert.equal((await catalog.listMaterials(catalogContext({ serviceType: 'synthetic-service-type-b' }))).state, 'succeeded')
    contextListDeferred.resolve({ data: [packageRow('stale-work-order-package')] })
    snapshotFailure(await pendingPackages)
    snapshotFailure(await catalog.getPackageDetail('stale-work-order-package'))
    assert.equal(packageListCalls, 1)
  }

  // A detail response racing an identity change is discarded, never returned as authorized.
  {
    let scope = productionScope()
    const detailDeferred = deferred()
    const catalog = createQuotationCatalogReadAdapter({
      async execute(request) {
        if (request.path === 'biz/projPackage/queryWithRank') return { data: [packageRow('detail-race-package')] }
        return detailDeferred.promise
      },
    }, () => scope)
    await catalog.listPackages(catalogContext())
    const pendingDetail = catalog.getPackageDetail('detail-race-package')
    scope = productionScope({ userId: 'synthetic-user-after-detail' })
    detailDeferred.resolve(packageDetail('detail-race-package'))
    snapshotFailure(await pendingDetail)
  }

  // A monotonic generation rejects identity A -> B -> A results even though the final fingerprint matches A.
  {
    let scope = productionScope()
    const packageListDeferred = deferred()
    let packageListCalls = 0
    let detailCalls = 0
    const catalog = createQuotationCatalogReadAdapter({
      async execute(request) {
        if (request.path === 'biz/projPackage/queryWithRank') {
          packageListCalls += 1
          return packageListDeferred.promise
        }
        if (request.path === 'biz/projPackage/findById/identity-aba-list-package') {
          detailCalls += 1
          return packageDetail('identity-aba-list-package')
        }
        return { data: [] }
      },
    }, () => scope)
    const pendingList = catalog.listPackages(catalogContext())
    await Promise.resolve()
    scope = productionScope({ roleId: 'synthetic-role-b' })
    assert.equal((await catalog.listMaterials(catalogContext())).state, 'succeeded')
    scope = productionScope()
    assert.equal((await catalog.listMaterials(catalogContext())).state, 'succeeded')
    packageListDeferred.resolve({ data: [packageRow('identity-aba-list-package')] })
    snapshotFailure(await pendingList)
    snapshotFailure(await catalog.getPackageDetail('identity-aba-list-package'))
    assert.equal(packageListCalls, 1)
    assert.equal(detailCalls, 0, 'stale identity-ABA list must not re-register its Package ID')
  }

  // An in-flight detail is discarded after identity A -> B -> A, rather than surfacing for the restored identity.
  {
    let scope = productionScope()
    const detailDeferred = deferred()
    let detailCalls = 0
    const catalog = createQuotationCatalogReadAdapter({
      async execute(request) {
        if (request.path === 'biz/projPackage/queryWithRank') return { data: [packageRow('identity-aba-detail-package')] }
        if (request.path === 'biz/projPackage/findById/identity-aba-detail-package') {
          detailCalls += 1
          return detailDeferred.promise
        }
        return { data: [] }
      },
    }, () => scope)
    assert.equal((await catalog.listPackages(catalogContext())).state, 'succeeded')
    const pendingDetail = catalog.getPackageDetail('identity-aba-detail-package')
    await Promise.resolve()
    scope = productionScope({ roleId: 'synthetic-role-b' })
    assert.equal((await catalog.listMaterials(catalogContext())).state, 'succeeded')
    scope = productionScope()
    assert.equal((await catalog.listMaterials(catalogContext())).state, 'succeeded')
    detailDeferred.resolve(packageDetail('identity-aba-detail-package'))
    snapshotFailure(await pendingDetail)
    assert.equal(detailCalls, 1)
  }

  // A Work Order context A -> B -> A transition also invalidates an in-flight Package list.
  {
    const packageListDeferred = deferred()
    let packageListCalls = 0
    let detailCalls = 0
    const catalog = createQuotationCatalogReadAdapter({
      async execute(request) {
        if (request.path === 'biz/projPackage/queryWithRank') {
          packageListCalls += 1
          return packageListDeferred.promise
        }
        if (request.path === 'biz/projPackage/findById/work-order-aba-list-package') {
          detailCalls += 1
          return packageDetail('work-order-aba-list-package')
        }
        return { data: [] }
      },
    }, () => productionScope())
    const pendingList = catalog.listPackages(catalogContext())
    await Promise.resolve()
    assert.equal((await catalog.listMaterials(catalogContext({ workOrderId: 'synthetic-work-order-b' }))).state, 'succeeded')
    assert.equal((await catalog.listMaterials(catalogContext())).state, 'succeeded')
    packageListDeferred.resolve({ data: [packageRow('work-order-aba-list-package')] })
    snapshotFailure(await pendingList)
    snapshotFailure(await catalog.getPackageDetail('work-order-aba-list-package'))
    assert.equal(packageListCalls, 1)
    assert.equal(detailCalls, 0, 'stale Work Order-ABA list must not re-register its Package ID')
  }

  // An in-flight detail is discarded after Work Order context A -> B -> A.
  {
    const detailDeferred = deferred()
    let detailCalls = 0
    const catalog = createQuotationCatalogReadAdapter({
      async execute(request) {
        if (request.path === 'biz/projPackage/queryWithRank') return { data: [packageRow('work-order-aba-detail-package')] }
        if (request.path === 'biz/projPackage/findById/work-order-aba-detail-package') {
          detailCalls += 1
          return detailDeferred.promise
        }
        return { data: [] }
      },
    }, () => productionScope())
    assert.equal((await catalog.listPackages(catalogContext())).state, 'succeeded')
    const pendingDetail = catalog.getPackageDetail('work-order-aba-detail-package')
    await Promise.resolve()
    assert.equal((await catalog.listMaterials(catalogContext({ workOrderId: 'synthetic-work-order-b' }))).state, 'succeeded')
    assert.equal((await catalog.listMaterials(catalogContext())).state, 'succeeded')
    detailDeferred.resolve(packageDetail('work-order-aba-detail-package'))
    snapshotFailure(await pendingDetail)
    assert.equal(detailCalls, 1)
  }

  console.log(JSON.stringify({
    productionBoundaryFixture: 'PASS',
    sourceTypeRejectedBeforeTransport: sourceTypeRejected,
    sourceTypeExactRequests: routeMethods.length,
    identityDimensionInvalidations,
    unknownScopeCases: 3,
    packageContextInvalidation: 'PASS',
    multiplePackageLists: 'PASS',
    staleListDiscarded: 'PASS',
    staleWorkOrderContextListDiscarded: 'PASS',
    staleDetailDiscarded: 'PASS',
    identityAbaStaleListDiscarded: 'PASS',
    identityAbaStaleDetailDiscarded: 'PASS',
    workOrderContextAbaStaleListDiscarded: 'PASS',
    workOrderContextAbaStaleDetailDiscarded: 'PASS',
    sameEpochListDetail: 'PASS',
    externalRequests: 0,
  }))
} finally {
  await vite.close()
}
