import { computed, ref } from 'vue'

/**
 * Presentation-only gate for development review surfaces. It never grants
 * permissions or changes Mock/Production data sources, API or persistence.
 * The commercial presentation is the default even for synthetic data.
 */
const reviewSessionKey = 'xlink.dev-review-presentation.v1'

function sessionReviewPreference(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false
  try { return window.sessionStorage.getItem(reviewSessionKey) === '1' }
  catch { return false }
}

const explicitlyEnabled = ref(sessionReviewPreference())

export const devReviewModeEnabled = computed(() => import.meta.env.DEV && explicitlyEnabled.value)

/** Explicit DEV route opt-in (`?devReview=1`), or reset (`?devReview=0`). */
export function setDevReviewModeFromRoute(value: unknown): void {
  if (!import.meta.env.DEV) return
  if (value !== '1' && value !== '0') return
  explicitlyEnabled.value = value === '1'
  if (typeof window !== 'undefined') {
    try {
      if (explicitlyEnabled.value) window.sessionStorage.setItem(reviewSessionKey, '1')
      else window.sessionStorage.removeItem(reviewSessionKey)
    } catch { /* session storage may be blocked; in-memory mode still works */ }
  }
}
