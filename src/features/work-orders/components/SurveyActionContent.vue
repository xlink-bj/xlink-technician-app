<template>
  <view class="survey-action-content app-surface" data-action-content="dynamic-form">
    <view class="survey-action-heading">
      <view class="survey-action-title-row">
        <view class="survey-action-icon" aria-hidden="true"><AppIcon name="task" :size="20" /></view>
        <text class="survey-action-title">现场勘察</text>
      </view>
      <text class="survey-action-caption">按动态表单记录现场情况，完成后提交本次勘察。</text>
    </view>

    <template v-for="field in workspace.dynamicFields" :key="field.fieldId">
      <AppField
        v-if="field.runtime.visible && field.runtime.capability !== 'UNSUPPORTED'"
        class="survey-action-field"
        :label="field.label"
        :required="field.runtime.required"
      >
        <AppCascadeSelector
          v-if="field.type === 'cascade' && field.options?.length"
          :options="field.options"
          :model-value="arrayValue(workspace.dynamicForm?.values[field.valueKey])"
          :disabled="field.runtime.readOnly || workspace.lifecycle === 'submitting'"
          @update:model-value="setField(field.fieldId, $event)"
        />
        <AppMultiChoiceGroup
          v-else-if="field.options?.length && isMultiChoiceField(field.type, field.multiple)"
          :options="choiceOptionsFor(field.options)"
          :model-value="arrayValue(workspace.dynamicForm?.values[field.valueKey])"
          :disabled="field.runtime.readOnly || workspace.lifecycle === 'submitting'"
          @update:model-value="setField(field.fieldId, $event)"
        />
        <AppChoiceGroup
          v-else-if="field.options?.length"
          :options="choiceOptionsFor(field.options)"
          :model-value="stringValue(workspace.dynamicForm?.values[field.valueKey])"
          :disabled="field.runtime.readOnly || workspace.lifecycle === 'submitting'"
          @update:model-value="setField(field.fieldId, $event)"
        />
        <AppTextarea
          v-else-if="field.type === 'textarea'"
          :model-value="stringValue(workspace.dynamicForm?.values[field.valueKey])"
          :disabled="field.runtime.readOnly || workspace.lifecycle === 'submitting'"
          :read-only="field.runtime.readOnly"
          placeholder="请填写现场情况"
          @update:model-value="setField(field.fieldId, $event)"
        />
        <view v-else-if="field.type === 'image' || field.type === 'file'" class="survey-action-media">
          <view class="survey-action-media-copy">
            <AppIcon name="image" :size="20" color="var(--app-color-primary)" />
            <text class="survey-action-media-label">
              {{ mediaCountFor(field.fieldId) > 0 ? `已上传 ${mediaCountFor(field.fieldId)} 项` : '上传现场照片' }}
            </text>
          </view>
          <AppButton
            v-if="!field.runtime.readOnly"
            variant="secondary"
            :disabled="!workspace.canPickDynamicMedia(field.fieldId) || workspace.lifecycle === 'submitting' || workspace.mediaInFlightField === field.fieldId"
            :loading="workspace.mediaInFlightField === field.fieldId"
            @tap="pickMedia(field.fieldId)"
          >
            {{ mediaCountFor(field.fieldId) > 0 ? '重新选择' : '选择照片' }}
          </AppButton>
          <text v-else class="survey-action-media-readonly">仅查看</text>
        </view>
        <AppInput
          v-else
          :model-value="stringValue(workspace.dynamicForm?.values[field.valueKey])"
          :disabled="field.runtime.readOnly || workspace.lifecycle === 'submitting'"
          :read-only="field.runtime.readOnly"
          @update:model-value="setField(field.fieldId, $event)"
        />
      </AppField>
    </template>

    <AppStatus
      v-if="workspace.dynamicUnsupportedFields.length > 0"
      class="survey-action-unsupported"
      :message="unsupportedMessage"
      tone="warning"
      icon="warning"
      quiet
    />

    <AppButton
      class="survey-action-save"
      variant="secondary"
      block
      :disabled="workspace.lifecycle === 'submitting' || workspace.dynamicFormSaveState === 'saving'"
      :loading="workspace.dynamicFormSaveState === 'saving'"
      @tap="save"
    >
      {{ workspace.dynamicFormSaveState === 'saved' ? '已保存，可完成勘察' : '保存表单' }}
    </AppButton>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { useActionWorkspaceStore } from '@features/work-orders/action-workspace'
import type { FormFieldValue } from '@shared/ports'
import type { AppChoiceOption } from '@shared/ui/types'
import AppButton from '@shared/ui/AppButton.vue'
import AppCascadeSelector from '@shared/ui/AppCascadeSelector.vue'
import AppChoiceGroup from '@shared/ui/AppChoiceGroup.vue'
import AppField from '@shared/ui/AppField.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppInput from '@shared/ui/AppInput.vue'
import AppMultiChoiceGroup from '@shared/ui/AppMultiChoiceGroup.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import AppTextarea from '@shared/ui/AppTextarea.vue'

const workspace = useActionWorkspaceStore()

const unsupportedMessage = computed(() => {
  const labels = workspace.dynamicUnsupportedFields.map((field) => field.label).join('、')
  return labels
    ? `暂不支持：${labels}。补齐这些字段后才能提交。`
    : '当前表单包含暂不支持的字段，无法提交。'
})

function stringValue(value: FormFieldValue | undefined): string {
  if (Array.isArray(value)) return value.map(String).join(', ')
  return value === null || value === undefined ? '' : String(value)
}

function arrayValue(value: FormFieldValue | undefined): readonly string[] {
  if (Array.isArray(value)) return value.map(String)
  return value === undefined || value === null || value === '' ? [] : [String(value)]
}

function isMultiChoiceField(type: string, multiple: boolean | undefined): boolean {
  return Boolean(multiple) || type === 'checkbox'
}

function choiceOptionsFor(options: readonly { readonly value: string; readonly label: string }[]): readonly AppChoiceOption[] {
  return options.map(({ value, label }) => ({ value, label }))
}

function mediaCountFor(fieldId: string): number {
  const field = workspace.dynamicFields.find((candidate) => candidate.fieldId === fieldId)
  const value = field ? workspace.dynamicForm?.values[field.valueKey] : undefined
  return workspace.mediaByField[fieldId]?.length ?? (value ? 1 : 0)
}

function setField(fieldId: string, value: FormFieldValue): void {
  workspace.setField(fieldId, value)
}

async function pickMedia(fieldId: string): Promise<void> {
  await workspace.pickDynamicMedia(fieldId)
}

async function save(): Promise<void> {
  await workspace.saveDynamicForm()
}
</script>

<style>
.survey-action-content { margin-top: var(--app-space-md); padding: var(--app-card-padding); }
.survey-action-heading { border-bottom: 1rpx solid var(--app-color-divider); padding-bottom: var(--app-space-lg); }
.survey-action-title-row { align-items: center; display: flex; }
.survey-action-icon {
  align-items: center;
  background: var(--app-color-primary-soft);
  border-radius: 10rpx;
  display: flex;
  height: 42rpx;
  justify-content: center;
  margin-right: var(--app-space-sm);
  width: 42rpx;
}
.survey-action-title { color: var(--app-color-text-primary); font-size: var(--app-font-section-title); font-weight: 800; }
.survey-action-caption { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-field-label); margin-top: var(--app-space-xs); }
.survey-action-field { margin-top: var(--app-space-lg); }
.survey-action-media {
  align-items: center;
  background: var(--app-color-control);
  border: 1rpx solid var(--app-color-border);
  border-radius: var(--app-radius-control);
  display: flex;
  justify-content: space-between;
  min-height: 86rpx;
  padding: 0 var(--app-space-sm) 0 var(--app-space-md);
}
.survey-action-media-copy { align-items: center; display: flex; gap: var(--app-space-xs); }
.survey-action-media-label { color: var(--app-color-text-primary); font-size: var(--app-font-body); }
.survey-action-media-readonly { color: var(--app-color-text-secondary); font-size: var(--app-font-caption); }
.survey-action-unsupported { margin-top: var(--app-space-sm); }
.survey-action-save { margin-top: var(--app-space-xl); }
</style>
