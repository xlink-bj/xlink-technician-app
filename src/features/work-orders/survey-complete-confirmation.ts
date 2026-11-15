import { ref } from 'vue'

/** Local confirmation state only; the caller retains every completion guard and command. */
export function useSurveyCompleteConfirmation(canConfirm: () => boolean, submit: () => Promise<void>) {
  const open = ref(false)
  function close(): boolean {
    if (!open.value) return false
    open.value = false
    return true
  }
  async function confirm(): Promise<void> {
    if (!open.value || !canConfirm()) return
    open.value = false
    await submit()
  }
  return { open, close, confirm }
}
