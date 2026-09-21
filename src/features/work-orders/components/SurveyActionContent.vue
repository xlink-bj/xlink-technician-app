<template>
  <GenericDynamicFormActionContent
    title="现场勘查"
    caption="按动态表单记录现场情况，完成后提交本次勘查。"
    saved-label="已保存，可完成勘查"
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
