<template>
  <view v-if="workspace.surveyLeakageCauseExperience && workspace.surveyLeakageCauseVisible" class="survey-leakage-cause">
    <AppField
      class="survey-leakage-cause__field"
      :label="workspace.surveyLeakageCauseExperience.valueField.label"
      :required="workspace.surveyLeakageCauseExperience.valueField.required"
      :supporting="workspace.surveyLeakageCauseReadOnly ? '仅查看已保存的选择' : '按维修部位选择一个或多个渗漏原因'"
    >
      <view class="survey-leakage-cause__selected">
        <text v-if="selectedLabels" class="survey-leakage-cause__selected-text">{{ selectedLabels }}</text>
        <text v-else class="survey-leakage-cause__empty">请选择渗漏原因</text>
      </view>
      <AppButton
        v-if="!workspace.surveyLeakageCauseReadOnly"
        variant="secondary"
        block
        :disabled="!workspace.surveyLeakageCauseCanOpen || workspace.lifecycle === 'submitting'"
        @tap="open"
      >
        {{ isOpen ? '收起选择' : selectedLabels ? '修改选择' : '选择渗漏原因' }}
      </AppButton>
      <text v-else class="survey-leakage-cause__readonly">仅查看</text>

      <view v-if="isOpen" class="survey-leakage-cause__panel">
        <AppStatus
          v-if="workspace.surveyLeakageCauseProviderState === 'loading'"
          message="正在加载渗漏原因"
          tone="neutral"
          quiet
        />
        <AppStatus
          v-else-if="workspace.surveyLeakageCauseProviderState === 'failed_retryable' || workspace.surveyLeakageCauseProviderState === 'failed_terminal'"
          message="渗漏原因暂时无法加载，已保存选择不会被清除"
          tone="warning"
          icon="warning"
          quiet
        />
        <AppButton
          v-if="workspace.surveyLeakageCauseProviderState === 'failed_retryable' || workspace.surveyLeakageCauseProviderState === 'failed_terminal'"
          variant="text"
          block
          @tap="retry"
        >
          重试加载
        </AppButton>
        <AppStatus
          v-else-if="!workspace.surveyLeakageCauseCurrentPart"
          message="请先选择维修部位"
          tone="neutral"
          quiet
        />
        <AppStatus
          v-else-if="workspace.surveyLeakageCauseProviderState === 'succeeded' && workspace.surveyLeakageCauseOptions.length === 0"
          message="当前维修部位暂无可选渗漏原因"
          tone="neutral"
          quiet
        />
        <AppTreeMultiChoiceGroup
          v-else-if="workspace.surveyLeakageCauseProviderState === 'succeeded'"
          :options="workspace.surveyLeakageCauseOptions"
          :model-value="workspace.surveyLeakageCauseSelectedIds"
          :disabled="workspace.lifecycle === 'submitting'"
          @update:model-value="select"
        />
        <AppButton
          v-if="workspace.surveyLeakageCauseProviderState === 'succeeded'"
          class="survey-leakage-cause__done"
          variant="secondary"
          block
          @tap="isOpen = false"
        >
          完成选择
        </AppButton>
      </view>
    </AppField>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import { useActionWorkspaceStore } from '../action-workspace'
import AppButton from '@shared/ui/AppButton.vue'
import AppField from '@shared/ui/AppField.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import AppTreeMultiChoiceGroup from '@shared/ui/AppTreeMultiChoiceGroup.vue'

const workspace = useActionWorkspaceStore()
const isOpen = ref(false)
const selectedLabels = computed(() => workspace.surveyLeakageCauseLabels.join('、'))

async function open(): Promise<void> {
  isOpen.value = true
  await workspace.loadSurveyLeakageCauseOptions()
}

async function retry(): Promise<void> {
  await workspace.loadSurveyLeakageCauseOptions()
}

function select(value: readonly string[]): void {
  workspace.setSurveyLeakageCauseSelection(value)
}
</script>

<style>
.survey-leakage-cause__field { margin-top: var(--app-space-lg); }
.survey-leakage-cause__selected {
  background: var(--app-color-control-surface);
  border: 1rpx solid var(--app-color-border-control);
  border-radius: var(--app-radius-control);
  min-height: var(--app-control-height);
  padding: var(--app-input-padding-y) var(--app-input-padding-x);
}
.survey-leakage-cause__selected-text { color: var(--app-color-text-primary); line-height: 1.5; }
.survey-leakage-cause__empty,
.survey-leakage-cause__readonly { color: var(--app-color-text-muted); line-height: 1.5; }
.survey-leakage-cause__panel { border-top: 1rpx solid var(--app-color-divider); margin-top: var(--app-space-md); padding-top: var(--app-space-sm); }
.survey-leakage-cause__done { margin-top: var(--app-space-md); }
</style>
