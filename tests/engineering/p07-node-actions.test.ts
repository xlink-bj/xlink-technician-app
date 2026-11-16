import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

/** Execute the actual SFC projection and command method; controller is the boundary. */
function setup() {
  const source = readFileSync('src/features/work-orders/R1DevMockDynamicFormTransactionPanel.vue', 'utf8').split('<script setup lang="ts">')[1]!.split('</script>')[0]!
  const ast = ts.createSourceFile('panel.ts', source, ts.ScriptTarget.Latest, true)
  const names = ['canFinish', 'hasUnsavedRecordChanges', 'finishReadiness']
  const selected = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'run'
    || ts.isVariableStatement(node) && node.declarationList.declarations.some(d => names.includes(d.name.getText(ast))))
  const body = ts.transpile(selected.map(node => node.getText(ast)).join('\n'), { target: ts.ScriptTarget.ES2022 })
  const viewState = ref<any>({ nodeActive: true, receiptPending: false, entries: [{ id: 'saved', state: 'active', editable: true, values: { note: 'saved', count: 2 } }] })
  const draftValues = ref<Record<string, unknown>>({}), editingId = ref<string | null>(null)
  const execute = vi.fn(async (_action: unknown): Promise<any> => ({ state: 'succeeded', view: { ...viewState.value, nodeActive: false } }))
  const controller = { execute, isDraftSubmissionPending: vi.fn(async () => false) }
  const cancelEdit = vi.fn(), emit = vi.fn(), waitLocalWrites = vi.fn(async () => true)
  const operationFeedback = ref(''), confirmFinish = ref(false), hasPendingMedia = ref(false)
  const context = { computed, props: { kind: 'forms' }, viewState, draftValues, editingId, controller, operationFeedback, confirmFinish, hasPendingMedia,
    inputsValid: ref(true), busy: ref(false), restoringDraft: ref(false), localSubmissionPending: ref(false), cleanupPending: ref(null),
    error: ref(''), revision: 1, waitLocalWrites, selectedFormDefinitionId: ref('form'), refresh: vi.fn(async () => {}),
    draftFeedback: ref(''), cancelEdit, confirmDeleteId: ref(null), confirmSaveFinish: ref(false), emit }
  const actual = new Function(...Object.keys(context), body + ';return {run,canFinish,hasUnsavedRecordChanges,finishReadiness};')(...Object.values(context)) as {
    run: (action: { kind: string }) => Promise<void>; canFinish: { value: boolean }; hasUnsavedRecordChanges: { value: boolean }; finishReadiness: { value: string }
  }
  return { ...context, ...actual, execute }
}
describe('P07 actual record editor completion safeguard', () => {
  it('retains the source canFinish condition for old records even with an empty new editor', async () => {
    const h = setup()
    expect(h.canFinish.value).toBe(true); expect(h.hasUnsavedRecordChanges.value).toBe(false)
    await h.run({ kind: 'finish' })
    expect(h.execute).toHaveBeenCalledWith({ kind: 'finish' }); expect(h.emit).toHaveBeenCalledWith('changed')
  })
  it('never dispatches finish or clears an unsaved new record', async () => {
    const h = setup(); h.draftValues.value = { note: 'not yet a record' }
    expect(h.canFinish.value).toBe(true)
    await h.run({ kind: 'finish' })
    expect(h.execute).not.toHaveBeenCalled(); expect(h.cancelEdit).not.toHaveBeenCalled()
    expect(h.confirmFinish.value).toBe(true); expect(h.draftValues.value.note).toBe('not yet a record')
    expect(h.operationFeedback.value).toContain('先保存本条')
  })
  it('recognizes unchanged edits despite object key order, and detects field clearing', () => {
    const h = setup(); h.editingId.value = 'saved'; h.draftValues.value = { count: 2, note: 'saved' }
    expect(h.hasUnsavedRecordChanges.value).toBe(false)
    h.draftValues.value = { count: 2 }; expect(h.hasUnsavedRecordChanges.value).toBe(true)
    h.editingId.value = 'missing'; expect(h.hasUnsavedRecordChanges.value).toBe(true)
  })
  it('blocks completion of changed existing values without changing canFinish', async () => {
    const h = setup(); h.editingId.value = 'saved'; h.draftValues.value = { note: 'modified', count: 2 }
    await h.run({ kind: 'finish' }); expect(h.execute).not.toHaveBeenCalled(); expect(h.canFinish.value).toBe(true)
    expect(h.draftValues.value).toEqual({ note: 'modified', count: 2 })
  })
  it('keeps the existing pending-media and unsafe-local-write fences', async () => {
    const h = setup(); h.hasPendingMedia.value = true
    expect(h.finishReadiness.value).toContain('附件尚未处理完成')
    await h.run({ kind: 'finish' }); expect(h.execute).not.toHaveBeenCalled()
    h.hasPendingMedia.value = false; h.waitLocalWrites.mockResolvedValue(false)
    await h.run({ kind: 'finish' }); expect(h.execute).not.toHaveBeenCalled()
    expect(h.operationFeedback.value).toContain('尚未安全保存')
  })
  it('does not clear the editor or announce completion for an unknown result', async () => {
    const h = setup(); h.execute.mockResolvedValue({ state: 'uncertain', message: '结果待核对' })
    await h.run({ kind: 'finish' })
    expect(h.operationFeedback.value).toBe('结果待核对'); expect(h.cancelEdit).not.toHaveBeenCalled(); expect(h.emit).not.toHaveBeenCalled()
  })
})
