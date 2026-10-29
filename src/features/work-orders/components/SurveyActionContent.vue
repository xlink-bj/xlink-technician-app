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
import GenericDynamicFormActionContent from './GenericDynamicFormActionContent.vue'
import SurveyLeakageCauseExperience from './SurveyLeakageCauseExperience.vue'
import { useActionWorkspaceStore } from '../action-workspace'

const workspace = useActionWorkspaceStore()
</script>
