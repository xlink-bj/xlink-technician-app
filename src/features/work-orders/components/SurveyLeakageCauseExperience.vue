<template>
  <AppGroupedMultiSelectField
    :visible="Boolean(workspace.surveyLeakageCauseExperience && workspace.surveyLeakageCauseVisible)"
    title="渗漏原因"
    :label="workspace.surveyLeakageCauseExperience?.valueField.label ?? '渗漏原因'"
    :required="Boolean(workspace.surveyLeakageCauseExperience?.valueField.required)"
    :selected-ids="workspace.surveyLeakageCauseSelectedIds"
    :selected-labels="workspace.surveyLeakageCauseLabels"
    :groups="workspace.surveyLeakageCauseOptions"
    :read-only="workspace.surveyLeakageCauseReadOnly"
    :can-open="workspace.surveyLeakageCauseCanOpen"
    :dependency-ready="Boolean(workspace.surveyLeakageCauseCurrentPart)"
    :submitting="workspace.lifecycle === 'submitting'"
    :provider-state="workspace.surveyLeakageCauseProviderState"
    :load-options="workspace.loadSurveyLeakageCauseOptions"
    :apply-selection="workspace.setSurveyLeakageCauseSelection"
    test-id-prefix="survey-leakage-cause"
    selection-hint="按维修部位选择一个或多个渗漏原因"
    placeholder="请选择渗漏原因"
    empty-label="尚未选择渗漏原因"
    loading-message="正在加载渗漏原因"
    failure-message="渗漏原因暂时无法加载，已保存选择不会被清除"
    dependency-message="请先选择维修部位"
    empty-options-message="当前维修部位暂无可选渗漏原因"
    group-title="维修部位"
    sheet-title="选择渗漏原因"
  >
    <template #heading>
      <SurveyTaskSectionHeading
        title="渗漏原因"
        icon="location"
        tone="cause"
        :required="Boolean(workspace.surveyLeakageCauseExperience?.valueField.required)"
        :status="workspace.surveyLeakageCauseSelectedIds.length > 0 ? '已选择 ' + workspace.surveyLeakageCauseSelectedIds.length + ' 项' : '待选择'"
      />
    </template>
  </AppGroupedMultiSelectField>
</template>

<script setup lang="ts">
import AppGroupedMultiSelectField from '@shared/ui/AppGroupedMultiSelectField.vue'
import SurveyTaskSectionHeading from './SurveyTaskSectionHeading.vue'
import { useActionWorkspaceStore } from '../action-workspace'

/** R1 *source binding* only: verified select-trigger + multi-value data field.
 * The shared picker owns all interaction UI; this adapter cannot submit
 * FormData, invent options, or advance Workflow. */
const workspace = useActionWorkspaceStore()
</script>
