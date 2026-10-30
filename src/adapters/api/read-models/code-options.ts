import type { CodeOptionRead, ReadPage } from '@shared/ports'
import { AdapterMappingError } from '../../common/operations'
import { asRecord, nestedValue, optionalRecord, optionalString, requiredString } from '../../common/records'

// R1 code lists and dynamic/cascade option groups: transport-independent normalization.

export function codeOption(raw: unknown): CodeOptionRead {
  const record = asRecord(raw, 'code option')
  return {
    value: requiredString(record, ['value', 'code', 'valueOption'], 'code option value'),
    label: requiredString(record, ['label', 'name', 'text', 'codelabel'], 'code option label'),
  }
}

export function dynamicCodeOptions(raw: unknown, valueOption: string): ReadPage<CodeOptionRead> {
  if (!Array.isArray(raw)) throw new AdapterMappingError('dynamic code response is malformed')
  const entry = raw
    .map((value) => optionalRecord(value))
    .find((value) => value?.eleid === valueOption)
  const options = optionalRecord(entry?.options)
  if (!options) return { items: [] }

  return {
    items: Object.entries(options)
      .map(([value, label]) => {
        if (typeof label !== 'string' || label.trim().length === 0) return null
        return { value, label: label.trim() }
      })
      .filter((value): value is CodeOptionRead => Boolean(value)),
  }
}

function cascadeOption(raw: unknown): CodeOptionRead | null {
  const record = optionalRecord(raw)
  const value = optionalString(record ?? {}, ['value'])
  const label = optionalString(record ?? {}, ['name', 'label'])
  if (!value || !label) return null
  const children = record && Array.isArray(record.children)
    ? record.children
      .map(cascadeOption)
      .filter((item): item is CodeOptionRead => Boolean(item))
    : []
  return {
    value,
    label,
    ...(children.length > 0 ? { children } : {}),
  }
}

export function cascadeCodeOptions(raw: unknown, codeType: string): ReadPage<CodeOptionRead> {
  const groups = Array.isArray(raw)
    ? raw
    : (() => {
        const envelope = asRecord(raw, 'cascade code response')
        const value = nestedValue(envelope, ['data', 'items', 'records'])
        return Array.isArray(value) ? value : []
      })()
  const group = groups
    .map((value) => asRecord(value, 'cascade code group'))
    .find((value) => optionalString(value, ['type']) === codeType)

  if (!group) return { items: [] }

  const items = Array.isArray(group.children)
    ? group.children
      .map(cascadeOption)
      .filter((item): item is CodeOptionRead => Boolean(item))
    : []
  return { items }
}

export function flattenCodeOptions(options: readonly CodeOptionRead[]): readonly CodeOptionRead[] {
  const output: CodeOptionRead[] = []
  const seen = new Set<string>()
  const visit = (option: CodeOptionRead): void => {
    if (!seen.has(option.value)) {
      seen.add(option.value)
      output.push(option)
    }
    option.children?.forEach(visit)
  }
  options.forEach(visit)
  return output
}

