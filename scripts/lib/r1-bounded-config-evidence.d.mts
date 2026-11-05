export function createR1BoundedConfigEvidence(): {
  selected(context: unknown): void
  observeWorkflow(detail: unknown, projection: unknown): void
  fieldPage(payload: unknown, context: unknown): void
  code(payload: unknown, ids: readonly string[]): void
  cascade(payload: unknown, ids: readonly string[]): void
  snapshot(): Record<string, unknown>
}
