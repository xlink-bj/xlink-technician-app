<template>
  <view class="inspection-action-content app-surface" data-action-content="dynamic-form">
    <view class="inspection-action-heading">
      <view class="inspection-action-title-row">
        <view class="inspection-action-icon" aria-hidden="true"><AppIcon name="task" :size="20" /></view>
        <text class="inspection-action-title">现场勘察</text>
      </view>
      <text class="inspection-action-caption">按动态表单记录现场情况，完成后提交本次勘察。</text>
    </view>

    <template v-for="field in workspace.dynamicFields" :key="field.key">
      <AppField
        v-if="field.runtime.capability !== 'UNSUPPORTED'"
        class="inspection-action-field"
        :label="field.label"
        :required="field.runtime.required"
      >
      <AppChoiceGroup
        v-if="field.options?.length"
        :options="choiceOptionsFor(field.options)"
        :model-value="stringValue(workspace.dynamicForm?.values[field.key])"
        :disabled="field.runtime.readOnly || workspace.lifecycle === 'submitting'"
        @update:model-value="setField(field.key, $event)"
      />
      <AppTextarea
        v-else-if="field.type === 'textarea'"
        :model-value="stringValue(workspace.dynamicForm?.values[field.key])"
        :disabled="field.runtime.readOnly || workspace.lifecycle === 'submitting'"
        :read-only="field.runtime.readOnly"
        placeholder="请填写现场情况"
        @update:model-value="setField(field.key, $event)"
      />
      <view v-else-if="field.type === 'image' || field.type === 'file'" class="inspection-action-media">
        <view class="inspection-action-media-copy">
          <AppIcon name="image" :size="20" color="var(--app-color-primary)" />
          <text class="inspection-action-media-label">
            {{ mediaCountFor(field.key) > 0 ? `已上传 ${mediaCountFor(field.key)} 项` : '上传现场照片' }}
          </text>
        </view>
        <AppButton
          variant="secondary"
          :disabled="workspace.lifecycle === 'submitting' || workspace.mediaInFlightField === field.key"
          :loading="workspace.mediaInFlightField === field.key"
          @tap="pickMedia(field.key)"
        >
          {{ mediaCountFor(field.key) > 0 ? '重新选择' : '选择照片' }}
        </AppButton>
      </view>
      <AppInput
        v-else
        :model-value="stringValue(workspace.dynamicForm?.values[field.key])"
        :disabled="field.runtime.readOnly || workspace.lifecycle === 'submitting'"
        :read-only="field.runtime.readOnly"
        @update:model-value="setField(field.key, $event)"
      />
      </AppField>
    </template>

    <AppStatus
      v-for="field in workspace.dynamicUnsupportedFields"
      :key="`unsupported-${field.key}`"
      class="inspection-action-unsupported"
      message="当前表单包含暂不支持的字段，无法提交。"
      tone="warning"
      icon="warning"
      quiet
    />

    <AppButton
      class="inspection-action-save"
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
import { useActionWorkspaceStore } from '@features/work-orders/action-workspace'
import type { FormFieldValue } from '@shared/ports'
import type { AppChoiceOption } from '@shared/ui/types'
import AppButton from '@shared/ui/AppButton.vue'
import AppChoiceGroup from '@shared/ui/AppChoiceGroup.vue'
import AppField from '@shared/ui/AppField.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppInput from '@shared/ui/AppInput.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import AppTextarea from '@shared/ui/AppTextarea.vue'

const workspace = useActionWorkspaceStore()

function stringValue(value: FormFieldValue | undefined): string {
  if (Array.isArray(value)) return value.map(String).join(', ')
  return value === null || value === undefined ? '' : String(value)
}

function choiceOptionsFor(options: readonly { readonly value: string; readonly label: string }[]): readonly AppChoiceOption[] {
  return options.map(({ value, label }) => ({ value, label }))
}

function mediaCountFor(fieldKey: string): number {
  return workspace.mediaByField[fieldKey]?.length ?? (workspace.dynamicForm?.values[fieldKey] ? 1 : 0)
}

function setField(key: string, value: string): void {
  workspace.setField(key, value)
}

async function pickMedia(key: string): Promise<void> {
  await workspace.pickDynamicMedia(key)
}

async function save(): Promise<void> {
  await workspace.saveDynamicForm()
}
</script>

<style>
.inspection-action-content { margin-top: var(--app-space-md); padding: var(--app-card-padding); }
.inspection-action-heading { border-bottom: 1rpx solid var(--app-color-divider); padding-bottom: var(--app-space-lg); }
.inspection-action-title-row { align-items: center; display: flex; }
.inspection-action-icon {
  align-items: center;
  background: var(--app-color-primary-soft);
  border-radius: 10rpx;
  display: flex;
  height: 42rpx;
  justify-content: center;
  margin-right: var(--app-space-sm);
  width: 42rpx;
}
.inspection-action-title { color: var(--app-color-text-primary); font-size: var(--app-font-section-title); font-weight: 800; }
.inspection-action-caption { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-field-label); margin-top: var(--app-space-xs); }
.inspection-action-field { margin-top: var(--app-space-lg); }
.inspection-action-media {
  align-items: center;
  background: var(--app-color-control);
  border: 1rpx solid var(--app-color-border);
  border-radius: var(--app-radius-control);
  display: flex;
  justify-content: space-between;
  min-height: 86rpx;
  padding: 0 var(--app-space-sm) 0 var(--app-space-md);
}
.inspection-action-media-copy { align-items: center; display: flex; gap: var(--app-space-xs); }
.inspection-action-media-label { color: var(--app-color-text-primary); font-size: var(--app-font-body); }
.inspection-action-unsupported { margin-top: var(--app-space-sm); }
.inspection-action-save { margin-top: var(--app-space-xl); }
</style>
