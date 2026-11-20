import { computed, ref, shallowRef } from 'vue'
import { createG05RefusalReview, g05Assignment, readG05AssignedRow } from '@adapters/api/mock/g05-refusal'
import type { SessionSnapshot, WorkOrderSummary } from '@shared/ports'

const mustLookup = ref(false)

/** Presents the dedicated review assignment in the existing card and dialog.
 * A later/ordinary work order with a similar label is never an action target. */
export function useG05RefusalCard(getSession: () => SessionSnapshot | null, listReady: () => boolean, listedItems: () => readonly WorkOrderSummary[]) {
  function currentRow() {
    if (!listReady()) return null
    const item = readG05AssignedRow(getSession())
    return item && !listedItems().some(listed => listed.id === item.id) ? item : null
  }
  const row = computed(currentRow)
  const review = createG05RefusalReview(getSession, () => {
    const item = currentRow()
    return item ? [item] : []
  })
  const dialog = shallowRef<ReturnType<typeof review.begin>>(null)
  const mode = ref<'closed' | 'edit' | 'lookup' | 'receipt'>('closed')
  const reason = ref('')
  const message = ref('')
  function close() {
    dialog.value?.cancel()
    dialog.value = null
    mode.value = 'closed'
    reason.value = ''
    message.value = ''
  }
  function isFixture(item: WorkOrderSummary) {
    return item === currentRow()
  }
  function read() {
    if (!currentRow()) { close(); return }
    const outcome = review.readReceipt(g05Assignment)
    if (typeof outcome === 'object') {
      mustLookup.value = false
      mode.value = 'receipt'
      message.value = outcome.reason
      return
    }
    mustLookup.value = outcome === 'unknown'
    mode.value = 'lookup'
    message.value = outcome === 'pending' ? '本次派工尚无拒单回执。' : '回执暂不可确认，请稍后从原派工再查。'
  }
  function canOffer() {
    return Boolean(currentRow()) && !mustLookup.value && review.readOutcome(g05Assignment) === 'pending'
  }
  function open(item: WorkOrderSummary) {
    close()
    if (!isFixture(item) || !currentRow()) return
    if (!canOffer()) { read(); return }
    dialog.value = review.begin(g05Assignment)
    if (dialog.value) mode.value = 'edit'
    else read()
  }
  function confirm() {
    if (mode.value !== 'edit' || !dialog.value || !currentRow()) { close(); return }
    const action = dialog.value.confirm(reason.value)
    if (action === 'reason_required') { message.value = '请填写拒单原因。'; return }
    close()
    if (action === 'check_receipt') {
      mustLookup.value = true
      mode.value = 'lookup'
      message.value = '请查询原派工回执，核对本次拒单结果。'
    }
  }
  return { row, isFixture, reservedId: g05Assignment.workOrderId, mode, reason, message, canOffer, open, close, read, confirm }
}
