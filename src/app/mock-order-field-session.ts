import { decodeOrderMedia } from '@features/work-orders/quotation/order-extfield-wire'
import { r1OrderAreaOptions } from '@adapters/api/reference/order-area-options'
import { withScopedDraftLock } from '@adapters/storage/scoped-draft-lock'
import { dynamicCodeOptions, cascadeCodeOptions } from '@adapters/api/read-models/code-options'
import { tryMockRead } from '@adapters/api/mock/router'
import type { StoragePort, FormFieldOptionRead } from '@shared/ports'
import type { OrderMediaSession, OrderFieldSession, OrderFieldDraft } from '@features/work-orders/quotation/order-field-session'
import type { OrderExtFieldRawRow } from '@features/work-orders/quotation/order-extfield-effective-plan'

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
export function createMockOrderFieldSession(storage: StoragePort, authorized: () => boolean, scope: string, readExisting?: () => Promise<Readonly<Record<string, unknown>> | null>, canSave?: () => Promise<boolean>, media?: OrderMediaSession): OrderFieldSession {
  let current: OrderFieldDraft | null = null
  const key = { namespace: 'draft' as const, key: `mock-order-fields:v1:${scope}` }
  return {
    media,
    freeze() { if (current) current = { ...current, readOnly: true } },
    current: () => authorized() ? current : null,
    async verifyCurrent() {
      try {
      if (!authorized() || !current) return false
      const stored = await storage.read<unknown>(key)
      if (!authorized() || stored.state !== 'succeeded') return false
      if (stored.data === null) return current.revision === 0 && (!media || await media.verify(current.input.values))
      const value = record(stored.data)
      if (media && !await media.verify(current.input.values)) return false
      return value?.version === 1 && value.serviceType === current.input.context.serviceType && value.revision === current.revision && !!record(value.values)
      } catch { return false }
    },
    async load(serviceType, stage = 'placeOrder') {
      current = null
      if (!authorized() || !serviceType) return null
      try {
        const raw = record(await tryMockRead('biz/extField/query', {
          tenantId: '__current_account_tenant__', colName: 'order', 'is:state|integer#and': '1', 'in:showList|string#and': '4',
          sortField: 'order', sortOrder: 'asc', page: 1, size: 50,
        }, { latencyMs: 0 }))
        if (!raw || !Array.isArray(raw.data) || raw.total !== raw.data.length || raw.data.length > 50) return null
        const rows: OrderExtFieldRawRow[] = []
        const labels: Record<string, string> = Object.create(null) as Record<string, string>
        const optionsByRowId: Record<string, readonly FormFieldOptionRead[]> = Object.create(null) as Record<string, readonly FormFieldOptionRead[]>
        const seen = new Set<string>()
        for (const value of raw.data) {
          if (!authorized()) return null
          const row = record(value)
          if (!row || typeof row._id !== 'string' || typeof row.name !== 'string' || typeof row.nameDisp !== 'string'
            || seen.has(row._id)) return null
          seen.add(row._id)
          rows.push({ ...row, rowId: row._id, valueKey: row.name })
          labels[row._id] = row.nameDisp
          if (row.type === 'area') {
            if (row.valueOption !== undefined && row.valueOption !== null && row.valueOption !== '') return null
            optionsByRowId[row._id] = r1OrderAreaOptions
          } else if (typeof row.valueOption === 'string' && row.valueOption) {
            const cascade = row.type === 'cascade'
            const response = await tryMockRead(cascade ? 'i/code/selectMultistageCode.do' : 'i/code/selectCode.do', cascade
              ? { types: row.valueOption, tenantId: 'synthetic-qa-tenant' }
              : { jsonPara: JSON.stringify([{ codeId: row.valueOption, eleid: row.valueOption }]), tenantId: 'synthetic-qa-tenant' }, { latencyMs: 0 })
            const options = cascade ? cascadeCodeOptions(response, row.valueOption).items : dynamicCodeOptions(response, row.valueOption).items
            if (!Array.isArray(options) || !options.length) return null
            optionsByRowId[row._id] = options as FormFieldOptionRead[]
          }
        }
        const stored = await storage.read<unknown>(key)
        if (!authorized() || stored.state !== 'succeeded') return null
        const draft = stored.data === null ? null : record(stored.data)
        if (stored.data !== null && (!draft || draft.version !== 1 || draft.serviceType !== serviceType
          || !Number.isSafeInteger(draft.revision) || Number(draft.revision) < 0 || !record(draft.values))) return null
        const restored = draft ? record(draft.values) : await readExisting?.()
        if (!authorized()) return null
        const values: Record<string, unknown> = {}
        for (const row of rows) if (typeof row.valueKey === 'string' && restored && Object.prototype.hasOwnProperty.call(restored, row.valueKey)) values[row.valueKey] = restored[row.valueKey]
        if (!draft) for (const row of rows.filter(row => row.type === 'file')) {
          const decoded = decodeOrderMedia(values[String(row.valueKey)])
          if (!decoded) return null
          values[String(row.valueKey)] = decoded
        }
        // R1 areaConfirm also updates these local form aliases. Preserve only
        // aliases actually saved by this scoped draft; never infer another
        // area's last interaction from its path or copy arbitrary Quote keys.
        if (draft && rows.some(row => row.type === 'area') && restored) {
          for (const alias of ['province', 'city', 'district']) {
            const code = restored[alias]
            if (typeof code === 'string' && /^\d{6}$/.test(code)) values[alias] = code
          }
        }
        current = { input: { rows, mediaRowIds: media ? rows.filter(row => row.type === 'file').map(row => String(row.rowId)) : [], context: { stage, serviceType, ...(typeof values.personType === 'string' ? { personType: values.personType } : {}) }, values, optionsByRowId },
          labels, readOnly: canSave ? !await canSave() : false, revision: draft ? Number(draft.revision) : 0 }
        return current
      } catch { return null }
    },
    async save(values, expectedRevision) {
      return withScopedDraftLock(key.key, async () => {
      if (!authorized() || !current || current.readOnly || current.revision !== expectedRevision || (canSave && !await canSave())) return null
      try {
        const stored = await storage.read<unknown>(key)
        const previous = record(stored.data)
        if (!authorized() || stored.state !== 'succeeded' || (previous
          ? previous.version !== 1 || previous.serviceType !== current.input.context.serviceType || !record(previous.values) || previous.revision !== expectedRevision
          : expectedRevision !== 0)) return null
        const revision = expectedRevision + 1
        const snapshot = JSON.parse(JSON.stringify(values)) as Record<string, unknown>
        const result = await storage.write(key, { version: 1, revision, serviceType: current.input.context.serviceType, values: snapshot })
        if (!authorized() || result.state !== 'succeeded') return null
        current = { ...current, revision, input: { ...current.input, values: snapshot, context: { ...current.input.context, personType: typeof snapshot.personType === 'string' ? snapshot.personType : undefined } } }
        return revision
      } catch { return null }
      })
    },
  }
}
