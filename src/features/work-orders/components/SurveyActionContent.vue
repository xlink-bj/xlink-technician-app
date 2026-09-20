<template>
  <GenericDynamicFormActionContent
    title="现场勘察"
    caption="按动态表单记录现场情况，完成后提交本次勘察。"
    saved-label="已保存，可完成勘察"
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
