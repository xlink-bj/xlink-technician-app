<template>
  <AppGroupedMultiSelectField
    :visible="view.visible"
    title="渗漏原因"
    :label="view.label"
    :required="view.required"
    :selected-ids="view.selectedIds"
    :selected-labels="view.selectedLabels"
    :groups="view.groups"
    :read-only="view.readOnly"
    :can-open="view.canOpen"
    :dependency-ready="view.dependencyReady"
    :submitting="view.submitting"
    :provider-state="view.providerState"
    :load-options="view.loadOptions"
    :apply-selection="view.applySelection"
    :test-id-prefix="readOnlyMode ? 'survey-leakage-cause-read' : 'survey-leakage-cause'"
    :read-only-hint="view.hint"
    :empty-label="view.emptyLabel"
    selection-hint="按维修部位选择一个或多个渗漏原因"
    placeholder="请选择渗漏原因"
    loading-message="正在加载渗漏原因"
    failure-message="渗漏原因暂时无法加载，已保存选择不会被清除"
    dependency-message="请先选择维修部位"
    empty-options-message="当前维修部位暂无可选渗漏原因"
    group-title="维修部位"
    sheet-title="选择渗漏原因"
  >
    <template #heading>
      <AppTaskSectionHeading
        title="渗漏原因"
        icon="location"
        tone="choice"
        test-id="survey-task-section-heading"
        :required="view.required"
        :status="view.selectedIds.length > 0 ? '已选择 ' + view.selectedIds.length + ' 项' : '待选择'"
      />
    </template>
  </AppGroupedMultiSelectField>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { createOperationError } from '@shared/types'
import type { SurveyLeakageCauseReadView } from '../survey-leakage-cause-read'
import AppGroupedMultiSelectField from '@shared/ui/AppGroupedMultiSelectField.vue'
import AppTaskSectionHeading from '@shared/ui/AppTaskSectionHeading.vue'
import { useActionWorkspaceStore } from '../action-workspace'

/** R1 *source binding* only: verified select-trigger + multi-value data field.
 * The shared picker owns all interaction UI; this adapter cannot submit
 * FormData, invent options, or advance Workflow. */
const props = defineProps<{ readonly readView?: SurveyLeakageCauseReadView | null }>()
// A normal readonly host never instantiates or populates the legacy editor.
// Once selected, readonly mode cannot fall back when a view is revoked.
const readOnlyMode = ref(props.readView !== undefined)
const legacy = props.readView === undefined ? useActionWorkspaceStore() : null
watch(() => props.readView, value => { if (value !== undefined) readOnlyMode.value = true }, { flush: 'sync' })
const refused = () => ({ state: 'failed_terminal' as const,
  error: createOperationError('unsupported_capability', '仅查看已保存的选择，不能在此修改。') })
const view = computed(() => {
  if (readOnlyMode.value || !legacy) {
    const value = props.readView
    return { visible: Boolean(value?.visible), label: value?.label ?? '渗漏原因', required: value?.required ?? false,
      selectedIds: value?.selectedIds ?? [], selectedLabels: value?.selectedLabels ?? [], groups: value?.groups ?? [],
      readOnly: true, canOpen: false, dependencyReady: Boolean(value?.currentPart), submitting: false,
      providerState: value?.providerState ?? 'idle' as const, hint: value?.hint ?? '仅查看已保存的选择',
      emptyLabel: value?.emptyLabel ?? '未保存', loadOptions: async () => refused(), applySelection: refused }
  }
  return { visible: Boolean(legacy.surveyLeakageCauseExperience && legacy.surveyLeakageCauseVisible),
    label: legacy.surveyLeakageCauseExperience?.valueField.label ?? '渗漏原因',
    required: Boolean(legacy.surveyLeakageCauseExperience?.valueField.required),
    selectedIds: legacy.surveyLeakageCauseSelectedIds, selectedLabels: legacy.surveyLeakageCauseLabels,
    groups: legacy.surveyLeakageCauseOptions, readOnly: legacy.surveyLeakageCauseReadOnly,
    canOpen: legacy.surveyLeakageCauseCanOpen, dependencyReady: Boolean(legacy.surveyLeakageCauseCurrentPart),
    submitting: legacy.lifecycle === 'submitting', providerState: legacy.surveyLeakageCauseProviderState,
    hint: '仅查看已保存的选择', emptyLabel: '尚未选择渗漏原因',
    loadOptions: legacy.loadSurveyLeakageCauseOptions, applySelection: legacy.setSurveyLeakageCauseSelection }
})
</script>
