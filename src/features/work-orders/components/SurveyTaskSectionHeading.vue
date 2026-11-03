<template>
  <AppTaskSectionHeading
    :icon="icon"
    :title="title"
    :status="status"
    :tone="tone === 'part' ? 'cascade' : tone === 'cause' ? 'choice' : tone"
    :required="required"
    :selected="selected"
    test-id="survey-task-section-heading"
  />
</template>

<script setup lang="ts">
import AppTaskSectionHeading from '@shared/ui/AppTaskSectionHeading.vue'
import type { AppIconName } from '@shared/ui/icons'

/** Deprecated API compatibility only. Historical evidence references this
 * path; active dynamic forms MUST import AppTaskSectionHeading directly.
 * No field rules, FormData, Store, or Workflow behavior belongs here. */
withDefaults(defineProps<{
  readonly icon: AppIconName
  readonly title: string
  readonly status: string
  readonly tone: 'part' | 'measure' | 'media' | 'cause'
  readonly required?: boolean
  readonly selected?: boolean
}>(), { required: false, selected: false })
</script>
