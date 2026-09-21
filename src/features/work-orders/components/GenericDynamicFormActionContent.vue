<template>
  <view class="dynamic-action-content app-surface" data-action-content="dynamic-form" data-testid="dynamic-form-action-content">
    <view class="dynamic-action-heading">
      <view class="dynamic-action-title-row">
        <view class="dynamic-action-icon" aria-hidden="true"><AppIcon name="task" :size="20" /></view>
        <text class="dynamic-action-title">{{ title }}</text>
      </view>
      <text class="dynamic-action-caption">{{ caption }}</text>
    </view>

    <template v-for="field in workspace.dynamicFields" :key="field.fieldId">
      <view
        v-if="!props.excludedFieldIds.includes(field.fieldId) && field.runtime.visible && field.runtime.capability === 'PRESENTATION_ONLY'"
        class="dynamic-action-presentation-divider"
        :class="{ 'dynamic-action-presentation-divider--gap': field.type === 'gap' }"
        :data-testid="`dynamic-form-presentation-${field.valueKey}`"
        aria-hidden="true"
      >
        <template v-if="field.type !== 'gap'">
          <view class="dynamic-action-presentation-line" />
          <text class="dynamic-action-presentation-label">{{ field.label }}</text>
          <view class="dynamic-action-presentation-line" />
        </template>
      </view>
      <AppField
        v-if="!props.excludedFieldIds.includes(field.fieldId) && field.runtime.visible && field.runtime.capability !== 'UNSUPPORTED' && field.runtime.capability !== 'PRESENTATION_ONLY'"
        class="dynamic-action-field"
        :data-testid="`dynamic-field-${field.valueKey}`"
        :label="field.label"
        :required="field.runtime.required"
      >
        <AppCascadeSelector
          v-if="field.type === 'cascade' && field.options?.length"
          :options="field.options"
          :model-value="arrayValue(workspace.dynamicForm?.values[field.valueKey])"
          :hierarchical="workspace.dynamicForm?.purpose === 'survey' && field.valueKey === 'part'"
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
          placeholder="请填写内容"
          @update:model-value="setField(field.fieldId, $event)"
        />
        <view
          v-else-if="field.type === 'image' || field.type === 'file'"
          class="dynamic-action-media"
          :data-testid="`dynamic-media-${field.valueKey}`"
        >
          <view class="dynamic-action-media-header">
            <text class="dynamic-action-media-count" :data-testid="`dynamic-media-count-${field.valueKey}`">
              已选 {{ mediaCountFor(field.fieldId) }} 项<text v-if="mediaMaxFor(field) !== undefined"> / {{ mediaMaxFor(field) }}</text>
            </text>
          </view>

          <view class="dynamic-action-media-grid" :data-testid="`dynamic-media-preview-${field.valueKey}`">
            <view
              v-for="media in mediaPreviewsFor(field)"
              :key="media.url"
              class="dynamic-action-media-tile"
              :style="mediaThumbnailStyle(media.url)"
            >
              <image class="dynamic-action-media-thumbnail" :src="media.url" mode="aspectFill" />
            </view>
            <view
              v-if="mediaPreviewsFor(field).length === 0 && mediaTaskCountFor(field.fieldId) > 0"
              class="dynamic-action-media-tile dynamic-action-media-tile--pending"
              :data-testid="`dynamic-media-local-${field.valueKey}`"
            >
              <AppIcon name="image" :size="24" color="var(--app-color-text-secondary)" />
              <text>本地媒体</text>
            </view>
            <view
              v-if="mediaAddTileLabel(field)"
              class="dynamic-action-media-tile dynamic-action-media-tile--add"
              :data-testid="`dynamic-media-add-${field.valueKey}`"
              role="button"
              tabindex="0"
              @tap="pickMedia(field.fieldId)"
            >
              <AppIcon name="image" :size="24" color="var(--app-color-primary)" />
              <text>{{ mediaAddTileLabel(field) }}</text>
            </view>
          </view>

          <text
            v-if="workspace.dynamicMediaHint(field.fieldId)"
            class="dynamic-action-media-hint"
            :data-testid="`dynamic-media-status-${field.valueKey}`"
          >
            {{ workspace.dynamicMediaHint(field.fieldId) }}
          </text>

          <view
            v-if="mediaRecoveryLabel(field)"
            class="dynamic-action-media-actions"
            :data-testid="`dynamic-media-actions-${field.valueKey}`"
          >
            <AppButton
              v-if="!field.runtime.readOnly"
              variant="secondary"
              block
              :disabled="!workspace.canPickDynamicMedia(field.fieldId) || workspace.lifecycle === 'submitting' || workspace.mediaInFlightField === field.fieldId"
              :loading="workspace.mediaInFlightField === field.fieldId"
              @tap="pickMedia(field.fieldId)"
            >
              {{ mediaRecoveryLabel(field) }}
            </AppButton>
            <text v-else class="dynamic-action-media-readonly">仅查看</text>
          </view>
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

    <slot name="experience" />

    <AppStatus
      v-if="workspace.dynamicUnsupportedFields.length > 0"
      data-testid="dynamic-form-unsupported"
      class="dynamic-action-unsupported"
      :message="unsupportedMessage"
      tone="warning"
      icon="warning"
      quiet
    />

    <AppButton
      data-testid="dynamic-form-save"
      class="dynamic-action-save"
      variant="secondary"
      block
      :disabled="workspace.lifecycle === 'submitting' || workspace.dynamicFormSaveState === 'saving'"
      :loading="workspace.dynamicFormSaveState === 'saving'"
      @tap="save"
    >
      {{ workspace.dynamicFormSaveState === 'saved' ? savedLabel : '保存表单' }}
    </AppButton>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { useActionWorkspaceStore } from '@features/work-orders/action-workspace'
import type { FormFieldValue } from '@shared/ports'
import { isMediaValueRef } from '@shared/types'
import type { AppChoiceOption } from '@shared/ui/types'
import { verifiedMediaMaxFor } from '../media-presentation'
import AppButton from '@shared/ui/AppButton.vue'
import AppCascadeSelector from '@shared/ui/AppCascadeSelector.vue'
import AppChoiceGroup from '@shared/ui/AppChoiceGroup.vue'
import AppField from '@shared/ui/AppField.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppInput from '@shared/ui/AppInput.vue'
import AppMultiChoiceGroup from '@shared/ui/AppMultiChoiceGroup.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import AppTextarea from '@shared/ui/AppTextarea.vue'

const props = withDefaults(defineProps<{
  readonly title?: string
  readonly caption?: string
  readonly savedLabel?: string
  readonly excludedFieldIds?: readonly string[]
}>(), {
  title: '表单信息',
  caption: '请填写表单信息，保存后完成当前操作。',
  savedLabel: '已保存，可完成',
  excludedFieldIds: () => [],
})

const workspace = useActionWorkspaceStore()
const title = computed(() => props.title)
const caption = computed(() => props.caption)
const savedLabel = computed(() => props.savedLabel)
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

function mediaTaskCountFor(fieldId: string): number {
  return workspace.mediaTasksByField[fieldId]?.length ?? 0
}

function mediaPreviewsFor(field: { readonly fieldId: string; readonly valueKey: string }): readonly { readonly url: string }[] {
  const uploaded = workspace.mediaByField[field.fieldId] ?? []
  if (uploaded.length > 0) return uploaded
  const value = workspace.dynamicForm?.values[field.valueKey]
  const values = Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value]
  return values.filter(isMediaValueRef).map(({ url }) => ({ url }))
}

function mediaThumbnailStyle(url: string): Record<string, string> {
  return {
    backgroundImage: `url("${url.replace(/"/g, '%22')}")`,
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'cover',
  }
}

function mediaCountFor(fieldId: string): number {
  const field = workspace.dynamicFields.find((candidate) => candidate.fieldId === fieldId)
  const value = field ? workspace.dynamicForm?.values[field.valueKey] : undefined
  const values = Array.isArray(value) ? value.length : value === undefined || value === null || value === '' ? 0 : 1
  return Math.max(workspace.mediaByField[fieldId]?.length ?? 0, mediaTaskCountFor(fieldId), values)
}

function mediaMaxFor(field: { readonly presentation?: { readonly max?: number } }): number | undefined {
  return verifiedMediaMaxFor(field)
}

function hasAmbiguousMedia(fieldId: string): boolean {
  return (workspace.mediaTasksByField[fieldId] ?? []).some((task) => task.lastError?.code === 'ambiguous_postprocess')
}

function hasPendingMediaTask(fieldId: string): boolean {
  return (workspace.mediaTasksByField[fieldId] ?? []).some((task) =>
    ['queued', 'preprocessing', 'ready_to_upload', 'uploading', 'source_uploaded', 'postprocessing'].includes(task.state),
  )
}

function hasTerminalMediaTask(fieldId: string): boolean {
  return (workspace.mediaTasksByField[fieldId] ?? []).some((task) => task.state === 'failed_terminal')
}

function mediaAddTileLabel(field: { readonly fieldId: string; readonly type: string; readonly readOnly: boolean }): string | undefined {
  if (field.readOnly || hasAmbiguousMedia(field.fieldId) || hasPendingMediaTask(field.fieldId) || workspace.mediaCanRetryDynamic(field.fieldId)) return undefined
  if (hasTerminalMediaTask(field.fieldId)) return '重新选择'
  if (mediaCountFor(field.fieldId) === 0) return field.type === 'image' ? '选择图片' : '选择文件'
  return '继续添加'
}

function mediaRecoveryLabel(field: { readonly fieldId: string; readonly readOnly: boolean }): string | undefined {
  if (field.readOnly || hasAmbiguousMedia(field.fieldId)) return undefined
  return workspace.mediaCanRetryDynamic(field.fieldId) ? '继续处理' : undefined
}

function setField(fieldId: string, value: FormFieldValue): void {
  workspace.setField(fieldId, value)
}

async function pickMedia(fieldId: string): Promise<void> {
  if (workspace.mediaCanRetryDynamic(fieldId)) {
    await workspace.retryDynamicMedia(fieldId)
    return
  }
  await workspace.pickDynamicMedia(fieldId)
}

async function save(): Promise<void> {
  await workspace.saveDynamicForm()
}
</script>

<style>
.dynamic-action-content { margin-top: var(--app-space-md); padding: var(--app-card-padding); }
.dynamic-action-heading { border-bottom: 1rpx solid var(--app-color-divider); padding-bottom: var(--app-space-lg); }
.dynamic-action-title-row { align-items: center; display: flex; }
.dynamic-action-icon {
  align-items: center;
  background: var(--app-color-primary-soft);
  border-radius: 10rpx;
  display: flex;
  height: 42rpx;
  justify-content: center;
  margin-right: var(--app-space-sm);
  width: 42rpx;
}
.dynamic-action-title { color: var(--app-color-text-primary); font-size: var(--app-font-section-title); font-weight: 800; }
.dynamic-action-caption { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-field-label); margin-top: var(--app-space-xs); }
.dynamic-action-field { margin-top: var(--app-space-lg); }
.dynamic-action-media {
  background: var(--app-color-control);
  border: 1rpx solid var(--app-color-border);
  border-radius: var(--app-radius-control);
  display: block;
  padding: var(--app-space-md);
}
.dynamic-action-media-header { align-items: center; display: flex; justify-content: flex-end; }
.dynamic-action-media-count { color: var(--app-color-text-secondary); font-size: var(--app-font-caption); }
.dynamic-action-media-grid { display: flex; flex-wrap: wrap; gap: var(--app-control-gap); margin-top: var(--app-space-md); }
.dynamic-action-media-tile {
  align-items: center;
  background: var(--app-color-control-surface);
  border: 1rpx solid var(--app-color-border-control);
  border-radius: var(--app-radius-control);
  box-sizing: border-box;
  display: flex;
  flex-basis: 17vw;
  flex-direction: column;
  flex-grow: 0;
  flex-shrink: 0;
  height: 17vw;
  justify-content: center;
  overflow: hidden;
  width: 17vw;
}
.dynamic-action-media-tile--pending { border-style: dashed; color: var(--app-color-text-secondary); gap: var(--app-space-xs); padding: var(--app-space-xs); text-align: center; }
.dynamic-action-media-tile--add { color: var(--app-color-primary); cursor: pointer; font-size: var(--app-font-caption); gap: var(--app-space-xs); }
.dynamic-action-media-tile--add:active { opacity: 0.78; }
.dynamic-action-media-thumbnail { display: block; height: 100%; object-fit: cover; width: 100%; }
.dynamic-action-media-hint { background: var(--app-color-page); color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-caption); line-height: 1.5; margin-top: var(--app-space-md); padding: var(--app-space-sm) var(--app-space-md); }
.dynamic-action-media-actions { margin-top: var(--app-space-md); }
.dynamic-action-media-readonly { color: var(--app-color-text-secondary); font-size: var(--app-font-caption); }
.dynamic-action-presentation-divider { align-items: center; display: flex; gap: var(--app-space-sm); margin-top: var(--app-space-lg); }
.dynamic-action-presentation-divider--gap { background: var(--app-color-page); border-radius: var(--app-radius-control); height: var(--app-space-lg); margin-left: calc(var(--app-card-padding) * -1); margin-right: calc(var(--app-card-padding) * -1); }
.dynamic-action-presentation-line { background: var(--app-color-divider); flex: 1; height: 1rpx; }
.dynamic-action-presentation-label { color: var(--app-color-text-tertiary); font-size: var(--app-font-caption); }
.dynamic-action-unsupported { margin-top: var(--app-space-sm); }
.dynamic-action-save { margin-top: var(--app-space-xl); }
</style>
