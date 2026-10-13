import { createApp } from 'vue'

import './review-platform-shim'
import '../src/shared/ui/design-system.scss'
import { installReviewRpxCompatibility } from './review-platform-shim'

if (import.meta.env.PROD) {
  document.body.textContent = 'Design System Gallery is development-only.'
} else {
  const { default: DesignSystemGallery } = await import('./design-system-gallery.vue')
  installReviewRpxCompatibility()
  createApp(DesignSystemGallery).mount('#app')
}
