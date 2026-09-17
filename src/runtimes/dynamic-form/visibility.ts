import type { VisibilityEvaluation, VisibilityExpression, VisibilityPath } from './types'

interface PathResult {
  readonly exists: boolean
  readonly value?: unknown
}

function pathSegments(path: VisibilityPath): readonly string[] | undefined {
  const segments: readonly string[] = typeof path === 'string' ? path.split('.') : path
  if (segments.length === 0 || segments.some((segment) => typeof segment !== 'string' || segment.length === 0)) {
    return undefined
  }
  return segments
}

function resolvePath(values: unknown, path: VisibilityPath): PathResult {
  const segments = pathSegments(path)
  if (!segments) return { exists: false }

  let current: unknown = values
  for (const segment of segments) {
    if (typeof current !== 'object' || current === null) return { exists: false }
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return { exists: false }
    current = (current as Record<string, unknown>)[segment]
  }
  return { exists: true, value: current }
}

function equalValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (Array.isArray(left) && Array.isArray(right)) {
      return left.length === right.length && left.every((value, index) => equalValue(value, right[index]))
    }
    if (Array.isArray(left)) return left.some((value) => equalValue(value, right))
    return false
  }
  if (typeof left === 'object' || typeof right === 'object') {
    return JSON.stringify(left) === JSON.stringify(right)
  }
  return left === right
}

function unsupported(reason: string): VisibilityEvaluation {
  return { state: 'unsupported', visible: false, reason }
}

function evaluateExpression(expression: unknown, values: Readonly<Record<string, unknown>>): VisibilityEvaluation {
  if (typeof expression !== 'object' || expression === null || Array.isArray(expression)) {
    return unsupported('visibility expression must be an object')
  }
  const candidate = expression as Partial<VisibilityExpression> & { readonly kind?: unknown }
  if (candidate.kind === 'all') {
    if (!Array.isArray(candidate.conditions)) return unsupported('visibility all requires conditions')
    for (const condition of candidate.conditions) {
      const result = evaluateExpression(condition, values)
      if (result.state === 'unsupported') return result
      if (!result.visible) return result
    }
    return { state: 'visible', visible: true }
  }
  if (candidate.kind !== 'equals' && candidate.kind !== 'oneOf' && candidate.kind !== 'includes' && candidate.kind !== 'exists') {
    return unsupported('visibility operator is unsupported')
  }
  if (!('path' in candidate)) return unsupported('visibility path is missing')
  const path = candidate.path
  if (typeof path !== 'string' && !Array.isArray(path)) return unsupported('visibility path is invalid')
  const resolved = resolvePath(values, path)

  if (candidate.kind === 'exists') {
    if (typeof candidate.expected !== 'boolean') return unsupported('visibility existence expectation is invalid')
    return { state: resolved.exists === candidate.expected ? 'visible' : 'hidden', visible: resolved.exists === candidate.expected }
  }
  if (candidate.kind === 'oneOf') {
    if (!Array.isArray(candidate.values)) return unsupported('visibility oneOf values are invalid')
    const visible = candidate.values.some((value) => equalValue(resolved.value, value))
    return { state: visible ? 'visible' : 'hidden', visible }
  }
  if (!('value' in candidate)) return unsupported('visibility comparison value is missing')
  if (candidate.kind === 'includes') {
    if (!resolved.exists || !Array.isArray(resolved.value)) return { state: 'hidden', visible: false }
    const visible = resolved.value.some((value) => equalValue(value, candidate.value))
    return { state: visible ? 'visible' : 'hidden', visible }
  }
  const visible = resolved.exists && equalValue(resolved.value, candidate.value)
  return { state: visible ? 'visible' : 'hidden', visible }
}

export function evaluateVisibility(
  expression: VisibilityExpression | undefined,
  values: Readonly<Record<string, unknown>>,
): VisibilityEvaluation {
  if (expression === undefined) return { state: 'visible', visible: true }
  return evaluateExpression(expression, values)
}
