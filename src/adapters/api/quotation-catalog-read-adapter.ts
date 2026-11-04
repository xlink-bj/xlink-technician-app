import type {
  QuotationCatalogContext,
  QuotationCatalogReadPort,
  QuotationMaterialRead,
  QuotationMaterialSaleFieldRead,
  QuotationMaterialSkuVariantRead,
  QuotationPackageDetailRead,
  QuotationPackageRead,
  ReadPage,
} from '@shared/ports'
import type { OperationSnapshot } from '@shared/types'
import { isProductionReadOnlyTarget } from '@shared/config'
import { sessionAuthorizationFingerprint } from '@shared/session-authorization'
import { adapterFailure, succeeded, AdapterMappingError } from '../common/operations'
import { ApiReadTransportError, type ApiReadRequest, type ApiReadTransport } from './technician-api'
import {
  MATERIAL_SALES_MAX_PAGES,
  MATERIAL_SALES_PAGE_ROWS,
  MATERIAL_SKU_MAX_PAGES,
  MATERIAL_SKU_PAGE_ROWS,
  R1_MATERIAL_CODE_TENANT,
  listRequest,
  materialItem,
  materialSaleFieldIdentities,
  materialSalesCodeOptions,
  materialSalesFieldRequest,
  materialSkuPage,
  materialSkuRequest,
  measureItem,
  packageDetail,
  packageItem,
  pageEnvelope,
  procedureItem,
  readFailure,
  type R1SaleFieldIdentity,
} from './quotation-catalog-mappers'

class QuotationCatalogReadAdapter implements AuthorizedQuotationCatalogReadPort {
  private currentReadScope: string | null = null
  private currentCatalogContextKey: string | null = null
  private authorizationContextGeneration = 0
  private readonly listedPackageIds = new Set<string>()
  private readonly listedMaterialSpuIds = new Set<string>()
  private readonly packageMaterialSpuIdsByPackage = new Map<string, ReadonlySet<string>>()
  private readonly verifiedMaterialSaleFieldNames = new Set<string>()
  private readonly activeProductionCatalogRequests = new Map<string, {
    count: number
    identity: string
    catalogContextKey: string
    generation: number
  }>()
  private currentCatalogWorkOrderId: string | null = null

  constructor(
    private readonly transport: ApiReadTransport,
    private readonly getReadAuthorizationScope?: () => QuotationCatalogReadAuthorizationScope | null,
    private readonly codeTenantId?: string,
    private readonly isWorkOrderListedForCurrentSession?: (workOrderId: string) => boolean,
  ) {}

  private isCurrentWorkOrderListed(workOrderId: string | null): boolean {
    if (!workOrderId) return false
    try { return this.isWorkOrderListedForCurrentSession?.(workOrderId) === true }
    catch { return false }
  }

  private isProductionReadOnly(): boolean {
    return isProductionReadOnlyTarget(import.meta.env.VITE_XLINK_ENVIRONMENT, import.meta.env.VITE_XLINK_API_BASE_URL)
  }

  private synchronizeProductionReadScope(): string | null {
    let identityScope: QuotationCatalogReadAuthorizationScope | null = null
    try {
      identityScope = this.getReadAuthorizationScope?.() ?? null
    } catch {
      identityScope = null
    }
    const nextScope = authorizationIdentityKey(identityScope)
    if (nextScope !== this.currentReadScope) {
      this.currentReadScope = nextScope
      this.authorizationContextGeneration += 1
      this.listedPackageIds.clear()
      this.listedMaterialSpuIds.clear()
      this.packageMaterialSpuIdsByPackage.clear()
      this.verifiedMaterialSaleFieldNames.clear()
      this.activeProductionCatalogRequests.clear()
      this.currentCatalogContextKey = null
      this.currentCatalogWorkOrderId = null
    }
    return nextScope
  }

  private catalogContextKey(context: QuotationCatalogContext): string | null {
    return typeof context?.workOrderId === 'string'
      && context.workOrderId.trim().length > 0
      && typeof context.serviceType === 'string'
      && context.serviceType.trim().length > 0
      && (context.sourceType === undefined
        || typeof context.sourceType === 'string' && context.sourceType.trim().length > 0)
      ? JSON.stringify([context.workOrderId, context.serviceType, context.sourceType ?? null])
      : null
  }

  private synchronizeCatalogContext(context: QuotationCatalogContext): string | null {
    const key = this.catalogContextKey(context)
    if (key !== this.currentCatalogContextKey) {
      this.currentCatalogContextKey = key
      this.currentCatalogWorkOrderId = key ? String(context.workOrderId) : null
      this.authorizationContextGeneration += 1
      this.listedPackageIds.clear()
      this.listedMaterialSpuIds.clear()
      this.packageMaterialSpuIdsByPackage.clear()
      this.verifiedMaterialSaleFieldNames.clear()
      this.activeProductionCatalogRequests.clear()
    }
    return key
  }

  private productionCatalogContextIsCurrent(context: QuotationCatalogContext): boolean {
    const key = this.catalogContextKey(context)
    return Boolean(key && context.sourceType?.trim()
      && key === this.currentCatalogContextKey
      && this.isCurrentWorkOrderListed(context.workOrderId ?? null))
  }

  private async list<T>(
    path: string,
    context: QuotationCatalogContext,
    map: (raw: unknown) => T,
    listedPackages?: (data: T) => readonly QuotationPackageRead[],
    page = 1,
    listedMaterials?: (data: T) => readonly QuotationMaterialRead[],
  ): Promise<OperationSnapshot<T>> {
    const productionReadOnly = this.isProductionReadOnly()
    const scopeAtStart = productionReadOnly ? this.synchronizeProductionReadScope() : null
    const catalogContextAtStart = productionReadOnly
      ? this.synchronizeCatalogContext(context)
      : null
    const generationAtStart = productionReadOnly ? this.authorizationContextGeneration : null
    // Validate the R1 request shape first, without I/O. This keeps the
    // established sourceType rejection semantics even for malformed contexts,
    // while the subsequent authorization fence still denies transport.
    let request: ApiReadRequest
    try {
      request = listRequest(path, context, productionReadOnly, page)
    } catch (error) {
      return readFailure<T>(error)
    }
    // Price-bearing catalog rows cannot be trusted after identity revocation or
    // without a WorkOrder-derived serviceType/sourceType context. The raw
    // transport may deny Production catalog routes as well; keep this fence
    // independent so enabling an authorized route cannot bypass it.
    if (productionReadOnly && (!scopeAtStart || !catalogContextAtStart
      || !this.isCurrentWorkOrderListed(context.workOrderId ?? null))) {
      return adapterFailure<T>(
        'authorization_denied',
        'Production catalog reads require the current authenticated identity and a role-listed Work Order catalog context.',
      )
    }
    const result = await this.read(request, map)
    if (!productionReadOnly) return result

    this.synchronizeProductionReadScope()
    if (this.authorizationContextGeneration !== generationAtStart
      || !this.isCurrentWorkOrderListed(context.workOrderId ?? null)) {
      return adapterFailure('authorization_denied', 'Catalog results were discarded because the authenticated identity or Work Order catalog context changed during the read. Reload the current catalog.')
    }
    if (listedPackages && scopeAtStart && catalogContextAtStart && result.state === 'succeeded' && result.data) {
      for (const item of listedPackages(result.data)) {
        if (this.listedPackageIds.size >= 200) break
        this.listedPackageIds.add(item.id)
      }
    }
    if (listedMaterials && scopeAtStart && catalogContextAtStart && result.state === 'succeeded' && result.data) {
      for (const item of listedMaterials(result.data)) {
        // R1 direct material SKU lookup uses the selected catalog row's `_id`
        // as `spuid`; never substitute an optional `spuid` field or SKU code.
        if (this.listedMaterialSpuIds.size >= 1000) break
        this.listedMaterialSpuIds.add(item.id)
      }
    }
    return result
  }

  private async read<T>(
    request: ApiReadRequest | (() => ApiReadRequest),
    map: (raw: unknown) => T,
  ): Promise<OperationSnapshot<T>> {
    try {
      const resolvedRequest = typeof request === 'function' ? request() : request
      return succeeded(map(await this.transport.execute(resolvedRequest)))
    } catch (error) {
      return readFailure<T>(error)
    }
  }

  private productionRequestKey(request: ApiReadRequest): string {
    return JSON.stringify([request.method, request.path, request.body ?? null, request.query ?? null])
  }

  /** Mint a short-lived permit for one exact Production request. Generic
   * direct transport calls cannot obtain this permit. */
  private async readProduction<T>(
    request: ApiReadRequest,
    map: (raw: unknown) => T,
  ): Promise<OperationSnapshot<T>> {
    const identity = this.synchronizeProductionReadScope()
    const catalogContextKey = this.currentCatalogContextKey
    const workOrderId = this.currentCatalogWorkOrderId
    if (!identity || !catalogContextKey || !workOrderId
      || !this.isCurrentWorkOrderListed(workOrderId)) {
      return adapterFailure('authorization_denied', 'Production catalog request requires the current role-listed WorkOrder context.')
    }
    const key = this.productionRequestKey(request)
    const active = this.activeProductionCatalogRequests.get(key)
    if (active) active.count += 1
    else this.activeProductionCatalogRequests.set(key, {
      count: 1,
      identity,
      catalogContextKey,
      generation: this.authorizationContextGeneration,
    })
    try {
      return await this.read(request, map)
    } finally {
      const current = this.activeProductionCatalogRequests.get(key)
      if (current && current.count > 1) current.count -= 1
      else this.activeProductionCatalogRequests.delete(key)
    }
  }

  isProductionReadRequestAuthorized(request: ApiReadRequest): boolean {
    if (!this.isProductionReadOnly()) return false
    const permit = this.activeProductionCatalogRequests.get(this.productionRequestKey(request))
    if (!permit) return false
    const identity = this.synchronizeProductionReadScope()
    return identity === permit.identity
      && this.authorizationContextGeneration === permit.generation
      && this.currentCatalogContextKey === permit.catalogContextKey
      && this.isCurrentWorkOrderListed(this.currentCatalogWorkOrderId)
  }

  listPackages(context: QuotationCatalogContext, page = 1) {
    return this.list(
      'biz/projPackage/queryWithRank',
      context,
      (raw) => pageEnvelope(raw, packageItem),
      (result) => result.items,
      page,
    )
  }

  async getPackageDetail(packageId: string) {
    const productionReadOnly = this.isProductionReadOnly()
    const scopeAtStart = productionReadOnly ? this.synchronizeProductionReadScope() : null
    const catalogContextAtStart = productionReadOnly ? this.currentCatalogContextKey : null
    const generationAtStart = productionReadOnly ? this.authorizationContextGeneration : null
    if (productionReadOnly) {
      if (!scopeAtStart || !catalogContextAtStart || !this.listedPackageIds.has(packageId)
        || !this.isCurrentWorkOrderListed(this.currentCatalogWorkOrderId)) {
        return adapterFailure<QuotationPackageDetailRead>(
          'authorization_denied',
          'Production package detail requires a complete current user/role identity and an ID from its successful package list.',
        )
      }
    }
    const result = await this.read(
      () => {
        if (!packageId.trim()) throw new AdapterMappingError('quotation package identity is required')
        return { method: 'POST', path: `biz/projPackage/findById/${encodeURIComponent(packageId)}` }
      },
      (raw) => packageDetail(raw, packageId),
    )
    if (productionReadOnly) this.synchronizeProductionReadScope()
    if (productionReadOnly && (this.authorizationContextGeneration !== generationAtStart
      || !this.isCurrentWorkOrderListed(this.currentCatalogWorkOrderId))) {
      return adapterFailure<QuotationPackageDetailRead>(
        'authorization_denied',
        'Package detail was discarded because the authenticated identity or Work Order catalog context changed during the read. Reload it under the current context.',
      )
    }
    if (productionReadOnly && result.state === 'succeeded' && result.data
      && result.data.package.id === packageId) {
      const materialSpuIds = new Set(result.data.materials
        .map(material => material.referenceId)
        .filter((id): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id)))
      this.packageMaterialSpuIdsByPackage.set(packageId, materialSpuIds)
    }
    return result
  }

  listProcedures(context: QuotationCatalogContext, page = 1) {
    return this.list('biz/procedure/queryWithRank', context, (raw) => pageEnvelope(raw, procedureItem), undefined, page)
  }

  listMaterials(context: QuotationCatalogContext, page = 1) {
    return this.list(
      'basic/material/queryWithRank', context, (raw) => pageEnvelope(raw, materialItem),
      undefined, page, (result) => result.items,
    )
  }

  listMeasures(context: QuotationCatalogContext, page = 1) {
    return this.list('biz/measure/queryWithRank', context, (raw) => pageEnvelope(raw, measureItem), undefined, page)
  }

  /** R1 material selector: active material sales ExtFields, then their exact
   * R1 Code dictionaries. Production uses bounded pages and a current listed
   * WorkOrder fence; the fixed R1 Code tenant is never substituted.
   */
  async listMaterialSalesFields(context: QuotationCatalogContext): Promise<OperationSnapshot<ReadPage<QuotationMaterialSaleFieldRead>>> {
    const productionReadOnly = this.isProductionReadOnly()
    let firstIdentity: string | null = null
    let generationAtStart: number | null = null
    if (productionReadOnly) {
      firstIdentity = this.synchronizeProductionReadScope()
      const key = this.synchronizeCatalogContext(context)
      generationAtStart = this.authorizationContextGeneration
      if (!firstIdentity || !key || !this.productionCatalogContextIsCurrent(context)) {
        return adapterFailure('authorization_denied', 'Production material sales options require a current role-listed WorkOrder catalog context.')
      }
    }
    // A later failed refresh must never leave old field names authorized for
    // projecting raw SKU ExtField values.
    this.verifiedMaterialSaleFieldNames.clear()
    try {
      if (!context?.workOrderId || !String(context.workOrderId).trim()
        || typeof context.serviceType !== 'string' || !context.serviceType.trim()
        || productionReadOnly && (typeof context.sourceType !== 'string' || !context.sourceType.trim())) {
        throw new AdapterMappingError('current WorkOrder material sales scope is missing')
      }
      // R1 hardcodes this tenant for i/code/selectCode.do; do not silently
      // substitute arbitrary login-tenant IDs when they do not match R1.
      if (this.codeTenantId !== R1_MATERIAL_CODE_TENANT) {
        throw new ApiReadTransportError('R1 material Code tenant does not match the current configured tenant.', 'authorization_denied')
      }
      if (!firstIdentity) {
        try { firstIdentity = authorizationIdentityKey(this.getReadAuthorizationScope?.() ?? null) }
        catch { firstIdentity = null }
      }
      if (!firstIdentity) {
        throw new ApiReadTransportError('Current authenticated user and role are required for material sale options.', 'authorization_denied')
      }
      const sameIdentityAndContext = (): boolean => {
        let identity: string | null = null
        try { identity = authorizationIdentityKey(this.getReadAuthorizationScope?.() ?? null) }
        catch { identity = null }
        if (identity !== firstIdentity) return false
        if (!productionReadOnly) return true
        this.synchronizeProductionReadScope()
        return this.authorizationContextGeneration === generationAtStart
          && this.productionCatalogContextIsCurrent(context)
      }
      let fields: readonly R1SaleFieldIdentity[]
      if (productionReadOnly) {
        const rawRows: unknown[] = []
        let expectedTotal: number | undefined
        let complete = false
        for (let pageNumber = 1; pageNumber <= MATERIAL_SALES_MAX_PAGES; pageNumber += 1) {
          if (!sameIdentityAndContext()) {
            throw new ApiReadTransportError('Role or WorkOrder context changed during material sales field read.', 'authorization_denied')
          }
          const pageResult = await this.readProduction<ReadPage<unknown>>(
            materialSalesFieldRequest(pageNumber),
            raw => pageEnvelope(raw, row => row),
          )
          if (pageResult.state !== 'succeeded') {
            return adapterFailure(pageResult.error?.category ?? 'server_terminal', pageResult.error?.message ?? 'material sales field read failed')
          }
          if (!pageResult.data) return adapterFailure('server_terminal', 'material sales field page is missing')
          const page = pageResult.data
          if ((page.page !== undefined && page.page !== pageNumber)
            || (page.pageSize !== undefined && page.pageSize !== MATERIAL_SALES_PAGE_ROWS)
            || page.items.length > MATERIAL_SALES_PAGE_ROWS) {
            throw new AdapterMappingError('material sales field page metadata is incomplete or inconsistent')
          }
          if (page.totalCount !== undefined) {
            if (expectedTotal !== undefined && expectedTotal !== page.totalCount) {
              throw new AdapterMappingError('material sales field total changed during pagination')
            }
            expectedTotal = page.totalCount
          }
          rawRows.push(...page.items)
          if (expectedTotal !== undefined) {
            if (rawRows.length > expectedTotal) throw new AdapterMappingError('material sales field rows exceed the reported total')
            if (rawRows.length === expectedTotal) {
              complete = true
              break
            }
            if (!page.items.length || pageNumber * MATERIAL_SALES_PAGE_ROWS >= expectedTotal) {
              throw new AdapterMappingError('material sales field pagination did not reach the reported total')
            }
          } else if (page.items.length < MATERIAL_SALES_PAGE_ROWS) {
            complete = true
            break
          }
        }
        if (!complete) throw new AdapterMappingError('material sales field count exceeds the bounded page limit')
        fields = materialSaleFieldIdentities({ data: rawRows })
      } else {
        const fieldResult = await this.read({
          method: 'POST', path: 'biz/extField/query',
          body: {
            sortField: 'order', colName: 'material', _all: '1',
            'is:state|integer#and': 1, sortOrder: 'asc',
          },
        }, materialSaleFieldIdentities)
        if (fieldResult.state !== 'succeeded') {
          return adapterFailure(fieldResult.error?.category ?? 'server_terminal', fieldResult.error?.message ?? 'material sales field read failed')
        }
        if (!fieldResult.data) return adapterFailure('server_terminal', 'material sales field definitions are missing')
        fields = fieldResult.data
      }
      if (!sameIdentityAndContext()) throw new ApiReadTransportError('Role changed during material sales field read.', 'authorization_denied')
      if (!fields.length) return succeeded({ items: [] })
      const identifiers = [...new Set(fields.map(field => field.valueOption))]
      const codeRequest: ApiReadRequest = {
        method: 'POST', path: 'i/code/selectCode.do',
        body: {
          jsonPara: JSON.stringify(identifiers.map(id => ({ codeId: id, eleid: id }))),
          tenantId: R1_MATERIAL_CODE_TENANT,
        },
      }
      const codeResult = productionReadOnly
        ? await this.readProduction(codeRequest, raw => materialSalesCodeOptions(raw, fields))
        : await this.read(codeRequest, raw => materialSalesCodeOptions(raw, fields))
      if (codeResult.state !== 'succeeded' || !codeResult.data) return codeResult
      if (!sameIdentityAndContext()) throw new ApiReadTransportError('Role changed during material Code options read.', 'authorization_denied')
      for (const field of fields) this.verifiedMaterialSaleFieldNames.add(field.name)
      return codeResult
    } catch (error) {
      return readFailure<ReadPage<QuotationMaterialSaleFieldRead>>(error)
    }
  }

  /** R1 SKU identity and unit-price inputs for an exact selected quotation SKU.
   * Production calls remain limited to exact Material/Package SPUs already
   * obtained under the current role-listed WorkOrder catalog context.
   */
  async listMaterialSkuVariants(
    context: QuotationCatalogContext,
    route: 'direct_material' | 'package_materials',
    spuIds: readonly string[],
    saleFieldNames: readonly string[] = [],
  ): Promise<OperationSnapshot<ReadPage<QuotationMaterialSkuVariantRead>>> {
    const productionReadOnly = this.isProductionReadOnly()
    let scopeAtStart: string | null = null
    let generationAtStart: number | null = null
    let catalogContextKeyAtStart: string | null = null
    if (productionReadOnly) {
      scopeAtStart = this.synchronizeProductionReadScope()
      catalogContextKeyAtStart = this.synchronizeCatalogContext(context)
      generationAtStart = this.authorizationContextGeneration
      if (!scopeAtStart || !catalogContextKeyAtStart || !this.productionCatalogContextIsCurrent(context)) {
        return adapterFailure('authorization_denied', 'Production SKU reads require a current role-listed WorkOrder catalog context.')
      }
    }
    if (this.getReadAuthorizationScope) {
      let identity: string | null = null
      try { identity = authorizationIdentityKey(this.getReadAuthorizationScope()) }
      catch { scopeAtStart = null }
      if (!identity || scopeAtStart && identity !== scopeAtStart) {
        return adapterFailure<ReadPage<QuotationMaterialSkuVariantRead>>('authorization_denied', 'A current authenticated role is required for material SKU reads.')
      }
      scopeAtStart = identity
    }
    if (!Array.isArray(saleFieldNames) || saleFieldNames.length > 30
      || saleFieldNames.some(name => typeof name !== 'string' || !name.trim() || name.length > 100
        || ['__proto__', 'constructor', 'prototype'].includes(name))
      || new Set(saleFieldNames).size !== saleFieldNames.length) {
      return adapterFailure('server_terminal', 'Material sales field names are not a verified bounded list.')
    }
    if (productionReadOnly) {
      if (saleFieldNames.some(name => !this.verifiedMaterialSaleFieldNames.has(name))) {
        return adapterFailure('authorization_denied', 'Production SKU projection requires fields from the current R1 sales dictionary read.')
      }
      const idsAllowed = route === 'direct_material'
        ? spuIds.length === 1 && this.listedMaterialSpuIds.has(spuIds[0] ?? '')
        : [...this.packageMaterialSpuIdsByPackage.values()]
          .some(packageIds => spuIds.length > 0 && spuIds.every(id => packageIds.has(id)))
      if (!idsAllowed) {
        return adapterFailure('authorization_denied', 'Production SKU IDs must come from the current material list or one successful package detail.')
      }
    }

    const sameIdentityAndContext = (): boolean => {
      if (!this.getReadAuthorizationScope) return !productionReadOnly
      let identity: string | null = null
      try { identity = authorizationIdentityKey(this.getReadAuthorizationScope?.() ?? null) }
      catch { identity = null }
      if (!identity || identity !== scopeAtStart) return false
      if (!productionReadOnly) return true
      this.synchronizeProductionReadScope()
      return this.authorizationContextGeneration === generationAtStart
        && this.currentCatalogContextKey === catalogContextKeyAtStart
        && this.productionCatalogContextIsCurrent(context)
    }

    if (!productionReadOnly) {
      const result = await this.read(
        () => materialSkuRequest(context, route, spuIds, 1, false),
        raw => materialSkuPage(raw, spuIds, saleFieldNames),
      )
      if (!sameIdentityAndContext()) {
        return adapterFailure('authorization_denied', 'Material SKU result discarded because the authenticated role changed during the read.')
      }
      return result
    }

    const items: QuotationMaterialSkuVariantRead[] = []
    const seenSkuIds = new Set<string>()
    let expectedTotal: number | undefined
    let complete = false
    for (let pageNumber = 1; pageNumber <= MATERIAL_SKU_MAX_PAGES; pageNumber += 1) {
      if (!sameIdentityAndContext()) {
        return adapterFailure('authorization_denied', 'Material SKU result discarded after login, role or WorkOrder context changed.')
      }
      const pageResult = await this.readProduction(
        materialSkuRequest(context, route, spuIds, pageNumber, true),
        raw => materialSkuPage(raw, spuIds, saleFieldNames),
      )
      if (pageResult.state !== 'succeeded') return pageResult
      if (!pageResult.data) return adapterFailure('server_terminal', 'Material SKU page is missing.')
      const page = pageResult.data
      if ((page.page !== undefined && page.page !== pageNumber)
        || (page.pageSize !== undefined && page.pageSize !== MATERIAL_SKU_PAGE_ROWS)
        || page.items.length > MATERIAL_SKU_PAGE_ROWS) {
        return adapterFailure('server_terminal', 'Material SKU page metadata is incomplete or inconsistent.')
      }
      if (page.totalCount !== undefined) {
        if (expectedTotal !== undefined && expectedTotal !== page.totalCount) {
          return adapterFailure('server_terminal', 'Material SKU total changed during pagination.')
        }
        expectedTotal = page.totalCount
      }
      for (const item of page.items) {
        if (seenSkuIds.has(item.id)) return adapterFailure('server_terminal', 'Duplicate material SKU identity across pages.')
        seenSkuIds.add(item.id)
        items.push(item)
      }
      if (expectedTotal !== undefined) {
        if (items.length > expectedTotal) return adapterFailure('server_terminal', 'Material SKU rows exceed the reported total.')
        if (items.length === expectedTotal) {
          complete = true
          break
        }
        if (!page.items.length || pageNumber * MATERIAL_SKU_PAGE_ROWS >= expectedTotal) {
          return adapterFailure('server_terminal', 'Material SKU pagination did not reach the reported total.')
        }
      } else if (page.items.length < MATERIAL_SKU_PAGE_ROWS) {
        complete = true
        expectedTotal = items.length
        break
      }
    }
    if (!complete) return adapterFailure('server_terminal', 'Material SKU count exceeds the bounded page limit.')
    if (!sameIdentityAndContext()) {
      return adapterFailure('authorization_denied', 'Material SKU result discarded after login, role or WorkOrder context changed.')
    }
    return succeeded({
      items,
      page: 1,
      pageSize: MATERIAL_SKU_PAGE_ROWS,
      totalCount: expectedTotal,
    })
  }
}

function authorizationIdentityKey(scope: QuotationCatalogReadAuthorizationScope | null): string | null {
  return sessionAuthorizationFingerprint(scope)
}

export interface QuotationCatalogReadAuthorizationScope {
  readonly sessionRef: string | null
  readonly userId: string | null
  readonly roleId: string | null
  readonly roleVersion: string | null
}

/** Internal Production transport hook; only the adapter can issue a live
 * request permit after its WorkOrder and catalog provenance checks pass. */
export interface QuotationCatalogProductionReadAuthorization {
  isProductionReadRequestAuthorized(request: ApiReadRequest): boolean
}

export type AuthorizedQuotationCatalogReadPort = QuotationCatalogReadPort & QuotationCatalogProductionReadAuthorization

export function createQuotationCatalogReadAdapter(
  transport: ApiReadTransport,
  getReadAuthorizationScope?: () => QuotationCatalogReadAuthorizationScope | null,
  codeTenantId?: string,
  isWorkOrderListedForCurrentSession?: (workOrderId: string) => boolean,
): AuthorizedQuotationCatalogReadPort {
  return new QuotationCatalogReadAdapter(transport, getReadAuthorizationScope, codeTenantId, isWorkOrderListedForCurrentSession)
}
