import { describe, expect, it, vi } from 'vitest'
import {
  createQuotationCatalogSelectionBridge,
  type QuotationCatalogBridgeState,
} from '@features/work-orders/quotation/catalog-selection-bridge'
import type { useQuotationCatalogBrowserStore } from '@features/work-orders/quotation/catalog-browser-store'
import type { useQuotationCompositionStore } from '@features/work-orders/quotation/composition-store'

const enabled = {
  loadState: 'succeeded',
  descriptor: { actionIntent: 'place_order', contentKind: 'quotation', execution: 'enabled' },
  businessResult: 'not_started',
} as QuotationCatalogBridgeState
const catalogItem = { kind: 'material', id: 'synthetic-material-001', name: 'Synthetic Material' }
const packageRow = { kind: 'package', id: 'synthetic-package-001', name: 'Synthetic Package' }
const packageDetail = { package: packageRow, layers: [] }

function fixture() {
  let currentState: QuotationCatalogBridgeState = enabled
  const selectedCatalogItemFor = vi.fn(() => catalogItem)
  const packageCandidateFor = vi.fn(() => packageRow)
  const successfulPackageDetailFor = vi.fn(() => packageDetail)
  const isGroupEditable = vi.fn(() => true)
  const addCatalogReadItem = vi.fn(() => ({ state: 'succeeded' as const, data: undefined }))
  const validatePackageReadItem = vi.fn(() => ({ state: 'succeeded' as const, data: undefined }))
  const configurePackageReadItem = vi.fn(() => ({ state: 'succeeded' as const, data: undefined }))
  const bridge = createQuotationCatalogSelectionBridge({
    getWorkspaceState: () => currentState,
    quotationCatalogBrowser: {
      selectedCatalogItemFor, packageCandidateFor, successfulPackageDetailFor,
    } as unknown as ReturnType<typeof useQuotationCatalogBrowserStore>,
    quotationComposition: {
      isGroupEditable, addCatalogReadItem, validatePackageReadItem, configurePackageReadItem,
    } as unknown as ReturnType<typeof useQuotationCompositionStore>,
  })
  return {
    bridge,
    setState: (next: QuotationCatalogBridgeState) => { currentState = next },
    selectedCatalogItemFor, packageCandidateFor, successfulPackageDetailFor,
    isGroupEditable, addCatalogReadItem, validatePackageReadItem, configurePackageReadItem,
  }
}

describe('EQ04 current-Action quotation catalog bridge — behavior and provenance', () => {
  it.each([
    ['unloaded', { ...enabled, loadState: 'loading' }],
    ['read-only', { ...enabled, descriptor: { ...enabled.descriptor!, execution: 'read_only' } }],
    ['wrong action', { ...enabled, descriptor: { ...enabled.descriptor!, actionIntent: 'set_appointment' } }],
    ['wrong content', { ...enabled, descriptor: { ...enabled.descriptor!, contentKind: 'dynamic_form' } }],
    ['already succeeded', { ...enabled, businessResult: 'succeeded' }],
    ['missing descriptor', { ...enabled, descriptor: null }],
  ] as const)('denies %s before catalog and package data access', (_label, state) => {
    const f = fixture()
    f.setState(state as QuotationCatalogBridgeState)
    expect(f.bridge.addQuotationCatalogSelection('group', 'material', 'id')).toMatchObject({
      state: 'failed_terminal', error: { category: 'unsupported_capability' },
    })
    expect(f.bridge.validateQuotationPackageConfiguration('group','id',[])).toMatchObject({
      state: 'failed_terminal', error: { category: 'unsupported_capability' },
    })
    expect(f.selectedCatalogItemFor).not.toHaveBeenCalled()
    expect(f.packageCandidateFor).not.toHaveBeenCalled()
    expect(f.addCatalogReadItem).not.toHaveBeenCalled()
  })

  it('direct selection accepts only a current successfully-read allowed kind and preserves provider item identity', () => {
    const f = fixture()
    expect(f.bridge.addQuotationCatalogSelection('group', 'package','id')).toMatchObject({
      state: 'failed_terminal', error: { category: 'unsupported_capability' },
    })
    expect(f.selectedCatalogItemFor).not.toHaveBeenCalled()
    expect(f.bridge.addQuotationCatalogSelection('group','material','synthetic-material-001').state).toBe('succeeded')
    expect(f.selectedCatalogItemFor).toHaveBeenCalledWith('material','synthetic-material-001')
    expect(f.addCatalogReadItem).toHaveBeenCalledWith('group',catalogItem)
    f.selectedCatalogItemFor.mockImplementationOnce(() => null as never)
    expect(f.bridge.addQuotationCatalogSelection('group','material','id')).toMatchObject({
      state: 'failed_terminal', error: { category: 'validation' },
    })
    expect(f.addCatalogReadItem).toHaveBeenCalledTimes(1)
  })

  it('rejects missing repair group, unknown package, and missing matching detail without an edit', () => {
    const f = fixture()
    f.isGroupEditable.mockReturnValueOnce(false)
    expect(f.bridge.configureQuotationPackageSelection('group', 'id', [])).toMatchObject({
      state:'failed_terminal', error: { category:'validation' },
    })
    expect(f.packageCandidateFor).not.toHaveBeenCalled()
    f.packageCandidateFor.mockImplementationOnce(() => null as never)
    expect(f.bridge.configureQuotationPackageSelection('group','id',[]).state).toBe('failed_terminal')
    expect(f.successfulPackageDetailFor).not.toHaveBeenCalled()
    f.successfulPackageDetailFor.mockImplementationOnce(() => null as never)
    expect(f.bridge.configureQuotationPackageSelection('group','id',[]).state).toBe('failed_terminal')
    expect(f.configurePackageReadItem).not.toHaveBeenCalled()
  })

  it('uses exact current package list and detail for validation and configuration', () => {
    const f = fixture()
    const choices = [{ layer: 'synthetic-layer', materialId: 'synthetic-material' }] as never
    expect(f.bridge.validateQuotationPackageConfiguration('group','id',choices).state).toBe('succeeded')
    expect(f.validatePackageReadItem).toHaveBeenCalledWith('group',packageRow,packageDetail,choices)
    expect(f.bridge.configureQuotationPackageSelection('group','id',choices).state).toBe('succeeded')
    expect(f.configurePackageReadItem).toHaveBeenCalledWith('group',packageRow,packageDetail,choices)
  })

  it('reevaluates the current Action on every call rather than caching authorization at construction', () => {
    const f = fixture()
    expect(f.bridge.addQuotationCatalogSelection('group','material','id').state).toBe('succeeded')
    f.setState({ ...enabled, businessResult:'succeeded' } as QuotationCatalogBridgeState)
    expect(f.bridge.configureQuotationPackageSelection('group','id',[]).state).toBe('failed_terminal')
    expect(f.bridge.addQuotationCatalogSelection('group','material','id').state).toBe('failed_terminal')
    expect(f.addCatalogReadItem).toHaveBeenCalledTimes(1)
    expect(f.configurePackageReadItem).not.toHaveBeenCalled()
  })
})
