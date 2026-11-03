<template>
  <GenericDynamicFormActionContent
    title="现场勘查"
    caption="依据现场情况填写"
    :excluded-field-ids="workspace.surveyLeakageCauseFieldIds"
  >
    <template #experience>
      <SurveyLeakageCauseExperience />
    </template>
  </GenericDynamicFormActionContent>
</template>

<script setup lang="ts">
/** Presentation-only compatibility wrapper for the approved S01 heading.
 * All editable fields remain owned by GenericDynamicFormActionContent;
 * R1's dual-field binding is never a second form engine. */
import GenericDynamicFormActionContent from './GenericDynamicFormActionContent.vue'
import SurveyLeakageCauseExperience from './SurveyLeakageCauseExperience.vue'
import { useActionWorkspaceStore } from '../action-workspace'

const workspace = useActionWorkspaceStore()
</script>
