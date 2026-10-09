import { spawnSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'

import { createQuotationCatalogReadAdapter } from '@adapters/api/quotation-catalog-api'
import type { ApiReadRequest } from '@adapters/api/technician-api'
import { normalizeSubmission, type FormFieldSchema } from '@runtimes/dynamic-form'
import {
  appendQuotationGroup,
  createEmptyQuotationDraft,
  createQuotationGroup,
  type QuotationDraft,
  type QuotationGroup,
  type QuotationLineKind,
  type QuotationPackageSelection,
} from '@features/work-orders/quotation/model'
import { validateQuotationDraft } from '@features/work-orders/quotation/validation'

const catalogMethods = [
  ['package', (catalog: ReturnType<typeof createQuotationCatalogReadAdapter>, context: { serviceType: string; sourceType?: string }) => catalog.listPackages(context)],
  ['procedure', (catalog: ReturnType<typeof createQuotationCatalogReadAdapter>, context: { serviceType: string; sourceType?: string }) => catalog.listProcedures(context)],
  ['material', (catalog: ReturnType<typeof createQuotationCatalogReadAdapter>, context: { serviceType: string; sourceType?: string }) => catalog.listMaterials(context)],
  ['measure', (catalog: ReturnType<typeof createQuotationCatalogReadAdapter>, context: { serviceType: string; sourceType?: string }) => catalog.listMeasures(context)],
] as const

function draftFor(
  kinds: readonly QuotationLineKind[],
  overrides: Partial<QuotationGroup> = {},
): QuotationDraft {
  const group = {
    ...createQuotationGroup('fixture-group', {
      repairParts: ['fixture-part'],
      partDescription: '合成部位描述',
      maintainAreaNum: '12',
    }),
    ...overrides,
  }
  const selections = {
    package: [...group.projPackages],
    procedure: [...group.procedures],
    material: [...group.materials],
    measure: [...group.measures],
  }

  for (const kind of kinds) {
    const selection = {
      selectionId: `fixture-${kind}`,
      kind,
      catalogId: `fixture-${kind}-catalog`,
      label: `合成${kind}`,
      quantity: 1,
      ...(kind === 'package' ? {
        configuration: {
          procedures: [],
          materials: [{
            providerReferenceId: 'fixture-package-material-ref',
            catalogId: 'fixture-material-catalog',
            label: '合成套餐材料',
            layer: 'fixture-layer',
          }],
          measures: [],
        },
      } : {}),
    }
    selections[kind].push(selection as never)
  }

  const withSelections: QuotationGroup = {
    ...group,
    projPackages: selections.package as QuotationPackageSelection[],
    procedures: selections.procedure as QuotationGroup['procedures'],
    materials: selections.material as QuotationGroup['materials'],
    measures: selections.measure as QuotationGroup['measures'],
  }
  return appendQuotationGroup(createEmptyQuotationDraft('fixture-work-order', 'fixture-node'), withSelections)
}

function issueCodes(draft: QuotationDraft): readonly string[] {
  return validateQuotationDraft(draft).issues.map((issue) => issue.code)
}

describe('G4-F P0 contract evidence fixtures (synthetic only)', () => {
  describe('Production-shape audit execution gate', () => {
    it('exits before Vite/network setup by default and rejects conflicting flags', () => {
      const defaultRun = spawnSync(process.execPath, ['scripts/audit-g4f-r1-prod-shape.mjs'], { encoding: 'utf8' })
      expect(defaultRun.status).toBe(0)
      expect(JSON.parse(defaultRun.stdout)).toMatchObject({ status: 'NO_NETWORK_DEFAULT', requests: 0 })

      const conflictingRun = spawnSync(process.execPath, [
        'scripts/audit-g4f-r1-prod-shape.mjs',
        '--preflight-only',
        '--authorize-bounded-prod-read',
      ], { encoding: 'utf8' })
      expect(conflictingRun.status).toBe(2)
      expect(JSON.parse(conflictingRun.stdout)).toMatchObject({ status: 'BLOCKED_INVALID_ARGUMENTS', requests: 0 })
    })

    it('invalidates Production package identities when the session scope changes, using an isolated synthetic child process', () => {
      const run = spawnSync(process.execPath, ['tests/fixtures/g4f-catalog-session-scope.mjs'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          VITE_XLINK_ENVIRONMENT: 'prod',
          VITE_XLINK_API_BASE_URL: 'https://xlink.fsgo365.cn/fsgo/wm',
        },
      })
      expect(run.status).toBe(0)
      expect(JSON.parse(run.stdout)).toEqual({
        listState: 'succeeded',
        detailState: 'failed_terminal',
        detailError: 'authorization_denied',
        transportCallsAfterList: 0,
      })
    })
  })

  describe('dynamic Order ExtField Runtime capability', () => {
    it('blocks a missing visible required conditional field and omits the same field when verified hidden', () => {
      const fields: readonly FormFieldSchema[] = [
        { fieldId: 'fixture-controller', valueKey: 'fixtureMode', type: 'text' },
        {
          fieldId: 'fixture-conditional-required',
          valueKey: 'fixtureConditionalValue',
          type: 'text',
          required: true,
          visibility: { kind: 'equals', path: 'fixtureMode', value: 'enabled' },
        },
      ]

      expect(normalizeSubmission({ fields, values: { fixtureMode: 'enabled' } })).toMatchObject({
        ok: false,
        reason: 'validation',
        fieldId: 'fixture-conditional-required',
      })
      expect(normalizeSubmission({ fields, values: { fixtureMode: 'disabled' } })).toEqual({
        ok: true,
        value: { values: { fixtureMode: 'disabled' } },
      })
    })

    it('records zero, explicit false, non-empty multi-value, and local-file values distinctly', () => {
      const fields: readonly FormFieldSchema[] = [
        { fieldId: 'fixture-zero', valueKey: 'fixtureZero', type: 'number', required: true },
        { fieldId: 'fixture-switch', valueKey: 'fixtureSwitch', type: 'switch', required: true },
        { fieldId: 'fixture-array', valueKey: 'fixtureArray', type: 'checkbox', required: true, valueOption: 'fixtureOptions', multiple: true },
        { fieldId: 'fixture-file', valueKey: 'fixtureFile', type: 'file', required: true },
      ]
      const result = normalizeSubmission({
        fields,
        values: {
          fixtureZero: 0,
          fixtureSwitch: false,
          fixtureArray: ['fixture-option-a'],
          fixtureFile: ['local-media://fixture-file'],
        },
      })

      expect(result).toEqual({
        ok: true,
        value: {
          values: {
            fixtureZero: 0,
            fixtureSwitch: false,
            fixtureArray: ['fixture-option-a'],
            fixtureFile: ['local-media://fixture-file'],
          },
        },
      })
      expect(normalizeSubmission({ fields, values: { fixtureZero: 0, fixtureSwitch: false, fixtureArray: [], fixtureFile: [] } }))
        .toMatchObject({ ok: false, reason: 'validation', fieldId: 'fixture-array' })
      expect(normalizeSubmission({ fields, values: { fixtureZero: 0, fixtureSwitch: undefined, fixtureArray: ['fixture-option-a'], fixtureFile: ['local-media://fixture-file'] } }))
        .toMatchObject({ ok: false, reason: 'validation', fieldId: 'fixture-switch' })
    })

    it('fails closed when a required select has no option provider', () => {
      const result = normalizeSubmission({
        fields: [{ fieldId: 'fixture-select', valueKey: 'fixtureSelect', type: 'select', required: true }],
        values: { fixtureSelect: 'fixture-choice' },
      })
      expect(result).toMatchObject({ ok: false, reason: 'unsupported_capability', fieldId: 'fixture-select' })
    })

    it('preserves supplied prior values only when hidden-value preservation is explicitly requested, then JSON-round-trips them', () => {
      const fields: readonly FormFieldSchema[] = [
        { fieldId: 'fixture-controller', valueKey: 'fixtureMode', type: 'text' },
        {
          fieldId: 'fixture-hidden-value',
          valueKey: 'fixturePriorValue',
          type: 'text',
          required: true,
          visibility: { kind: 'equals', path: 'fixtureMode', value: 'enabled' },
        },
      ]
      const values = { fixtureMode: 'disabled', fixturePriorValue: 'saved-before-hide' }
      const omittedByDefault = normalizeSubmission({ fields, values })
      const preserved = normalizeSubmission({ fields, values, preserveHiddenValues: true })

      expect(omittedByDefault).toEqual({ ok: true, value: { values: { fixtureMode: 'disabled' } } })
      expect(preserved).toEqual({
        ok: true,
        value: { values: { fixtureMode: 'disabled', fixturePriorValue: 'saved-before-hide' } },
      })
      if (preserved.ok) expect(JSON.parse(JSON.stringify(preserved.value.values))).toEqual(preserved.value.values)
    })

    it('can apply a caller-resolved dispensable condition through runtimeRequired, but the Order ExtField adapter contract is still absent', () => {
      const fields: readonly FormFieldSchema[] = [
        { fieldId: 'fixture-waived-required', valueKey: 'fixtureWaivedValue', type: 'text', required: true },
      ]
      expect(normalizeSubmission({ fields, values: {} })).toMatchObject({ ok: false, reason: 'validation' })
      expect(normalizeSubmission({
        fields,
        values: {},
        fieldContexts: { 'fixture-waived-required': { runtimeRequired: false } },
      })).toEqual({ ok: true, value: { values: {} } })
    })
  })

  describe('catalog sourceType transport shape', () => {
    it('keeps absent, concrete, and invalid-empty sourceType behavior identical across all four catalog list routes', async () => {
      const execute = vi.fn(async (_request: ApiReadRequest) => ({ data: [] }))
      const catalog = createQuotationCatalogReadAdapter({ execute })

      for (const [kind, read] of catalogMethods) {
        const start = execute.mock.calls.length
        const absent = await read(catalog, { serviceType: 'fixture-service-type' })
        expect(absent.state).toBe('succeeded')
        expect(execute.mock.calls[start]?.[0]).toMatchObject({
          path: {
            package: 'biz/projPackage/queryWithRank',
            procedure: 'biz/procedure/queryWithRank',
            material: 'basic/material/queryWithRank',
            measure: 'biz/measure/queryWithRank',
          }[kind],
        })
        expect(Object.hasOwn(execute.mock.calls[start]?.[0]?.body ?? {}, 'sourceType')).toBe(false)

        const concrete = await read(catalog, { serviceType: 'fixture-service-type', sourceType: 'fixture-source-type' })
        expect(concrete.state).toBe('succeeded')
        expect(execute.mock.calls[start + 1]?.[0]?.body?.sourceType).toBe('fixture-source-type')

        const invalid = await read(catalog, { serviceType: 'fixture-service-type', sourceType: '' })
        expect(invalid.state).toBe('failed_terminal')
        expect(execute.mock.calls).toHaveLength(start + 2)
      }
    })

  })

  describe('current quotation validator outcomes (not product approval)', () => {
    it.each([
      ['package-only', ['package'] as const, false],
      ['procedure-only', ['procedure'] as const, true],
      ['material-only', ['material'] as const, true],
      ['procedure-plus-material', ['procedure', 'material'] as const, false],
      ['measure-only', ['measure'] as const, true],
    ])('records current runtime outcome for %s', (_label, kinds, expectsDirectCompositionIssue) => {
      expect(issueCodes(draftFor(kinds)).includes('group.direct_composition_incomplete'))
        .toBe(expectsDirectCompositionIssue)
    })

    it.each([
      ['absent', ''],
      ['zero-text', '0'],
    ])('currently blocks %s maintainAreaNum', (_label, maintainAreaNum) => {
      expect(issueCodes(draftFor(['procedure', 'material'], { maintainAreaNum })))
        .toContain('group.maintain_area_invalid')
    })

    it('currently treats partDescription as unconditionally required by this quotation validator', () => {
      expect(issueCodes(draftFor(['procedure', 'material'], { partDescription: '' })))
        .toContain('group.description_required')
    })
  })
})
