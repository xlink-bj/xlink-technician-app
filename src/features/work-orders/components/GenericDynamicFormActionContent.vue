<template>
  <view class="dynamic-action-content" :class="{ 'dynamic-action-content--survey': isSurvey }"
    data-action-content="dynamic-form" data-testid="dynamic-form-action-content">
    <view class="dynamic-action-heading" :class="{ 'dynamic-action-heading--survey': isSurvey }">
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
        :class="{
          'dynamic-action-field--survey': isSurvey,
          'dynamic-action-field--survey-media': isSurvey && (field.type === 'image' || field.type === 'file'),
          'dynamic-action-field--survey-cascade': isSurvey && field.type === 'cascade',
          'dynamic-action-field--survey-measure': isSurvey && (field.type === 'digit' || field.type === 'number'),
        }"
        :data-testid="`dynamic-field-${field.valueKey}`"
        :label="field.label"
        :required="field.runtime.required"
      >
        <SurveyPartPicker
          v-if="isSurvey && field.type === 'cascade' && field.valueKey === 'part' && field.options?.length"
          :options="field.options"
          :model-value="arrayValue(workspace.dynamicForm?.values[field.valueKey])"
          :disabled="field.runtime.readOnly || workspace.lifecycle === 'submitting'"
          @update:model-value="setField(field.fieldId, $event)"
        />
        <AppCascadeSelector
          v-else-if="field.type === 'cascade' && field.options?.length"
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
          v-else-if="isMultilineField(field)"
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
            <view class="dynamic-action-media-header-copy">
              <text class="dynamic-action-media-title">{{ isSurvey ? '拍摄或上传' : field.type === 'image' ? '现场照片' : '现场附件' }}</text>
              <text class="dynamic-action-media-subtitle">{{ isSurvey ? '按此字段单独记录现场资料' : '按当前勘察要求补充记录' }}</text>
            </view>
            <text class="dynamic-action-media-count" :data-testid="`dynamic-media-count-${field.valueKey}`">
              {{ mediaCountFor(field.fieldId) }}<text v-if="mediaMaxFor(field) !== undefined"> / {{ mediaMaxFor(field) }}</text>
              <text class="dynamic-action-media-count-unit"> 项</text>
            </text>
          </view>

          <view class="dynamic-action-media-grid" :data-testid="`dynamic-media-preview-${field.valueKey}`">
            <view
              v-for="media in mediaPreviewsFor(field)"
              :key="media.url"
              class="dynamic-action-media-tile dynamic-action-media-tile--preview"
              role="button"
              tabindex="0"
              aria-label="查看已上传的媒体"
              @tap="previewMedia(field.fieldId, media.url)"
            >
              <image class="dynamic-action-media-thumbnail" :src="media.url" mode="aspectFill" />
            </view>
            <view
              v-if="mediaPreviewsFor(field).length === 0 && mediaTaskCountFor(field.fieldId) > 0"
              class="dynamic-action-media-tile dynamic-action-media-tile--pending"
              :data-testid="`dynamic-media-local-${field.valueKey}`"
            >
              <AppIcon name="image" :size="24" color="var(--app-color-text-secondary)" />
              <text>待处理</text>
            </view>
            <view
              v-if="mediaAddTileLabel(field)"
              class="dynamic-action-media-tile dynamic-action-media-tile--add"
              :data-testid="`dynamic-media-add-${field.valueKey}`"
              role="button"
              tabindex="0"
              @tap="pickMedia(field.fieldId)"
            >
              <AppIcon name="image" :size="22" color="var(--app-color-primary)" />
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

  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { useActionWorkspaceStore } from '@features/work-orders/action-workspace'
import type { FormFieldValue } from '@shared/ports'
import { isMediaValueRef } from '@shared/types'
import type { AppChoiceOption } from '@shared/ui/types'
import { isMultilineField } from '../form-presentation'
import { mediaPickerLabelFor, verifiedMediaMaxFor } from '../media-presentation'
import AppButton from '@shared/ui/AppButton.vue'
import AppCascadeSelector from '@shared/ui/AppCascadeSelector.vue'
import AppChoiceGroup from '@shared/ui/AppChoiceGroup.vue'
import AppField from '@shared/ui/AppField.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppInput from '@shared/ui/AppInput.vue'
import AppMultiChoiceGroup from '@shared/ui/AppMultiChoiceGroup.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import AppTextarea from '@shared/ui/AppTextarea.vue'
import SurveyPartPicker from './SurveyPartPicker.vue'

const props = withDefaults(defineProps<{
  readonly title?: string
  readonly caption?: string
  readonly excludedFieldIds?: readonly string[]
}>(), {
  title: '表单信息',
  caption: '请填写表单信息，保存后完成当前操作。',
  excludedFieldIds: () => [],
})

const workspace = useActionWorkspaceStore()
const isSurvey = computed(() => workspace.dynamicForm?.purpose === 'survey')
const title = computed(() => props.title)
const caption = computed(() => props.caption)
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

function mediaAddTileLabel(field: { readonly fieldId: string; readonly valueKey: string; readonly type: string; readonly readOnly: boolean }): string | undefined {
  if (field.readOnly || hasAmbiguousMedia(field.fieldId) || hasPendingMediaTask(field.fieldId) || workspace.mediaCanRetryDynamic(field.fieldId)) return undefined
  if (hasTerminalMediaTask(field.fieldId)) return '重新选择'
  if (mediaCountFor(field.fieldId) === 0) return mediaPickerLabelFor(workspace.dynamicForm?.purpose, field)
  return '继续添加'
}

function mediaRecoveryLabel(field: { readonly fieldId: string; readonly readOnly: boolean }): string | undefined {
  if (field.readOnly || hasAmbiguousMedia(field.fieldId)) return undefined
  return workspace.mediaCanRetryDynamic(field.fieldId) ? '继续处理' : undefined
}

function setField(fieldId: string, value: FormFieldValue): void {
  workspace.setField(fieldId, value)
}

function previewMedia(fieldId: string, url: string): void {
  const urls = workspace.mediaByField[fieldId]?.map((item) => item.url) ?? []
  const knownUrls = urls.length ? urls : workspace.dynamicFields
    .filter((field) => field.fieldId === fieldId)
    .flatMap((field) => mediaPreviewsFor(field).map((item) => item.url))
  if (!knownUrls.includes(url)) return
  uni.previewImage({ urls: [...knownUrls], current: url })
}

async function pickMedia(fieldId: string): Promise<void> {
  if (workspace.mediaCanRetryDynamic(fieldId)) {
    await workspace.retryDynamicMedia(fieldId)
    return
  }
  await workspace.pickDynamicMedia(fieldId)
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
/* A field-service media section, not a generic engineering upload grid.
   State, authorization and retries remain entirely owned by the media Port. */
.dynamic-action-media {
  background: var(--app-color-surface);
  border: 1rpx solid var(--app-color-border);
  border-radius: var(--app-radius-surface);
  display: block;
  padding: 20rpx;
}
.dynamic-action-media-header { align-items: center; display: flex; justify-content: space-between; gap: 16rpx; }
.dynamic-action-media-header-copy { display: flex; flex-direction: column; gap: 2rpx; min-width: 0; }
.dynamic-action-media-title { color: var(--app-color-text-primary); font-size: var(--app-font-body); font-weight: 700; }
.dynamic-action-media-subtitle { color: var(--app-color-text-secondary); font-size: var(--app-font-meta); line-height: 1.4; }
.dynamic-action-media-count { flex: none; color: var(--app-color-text-primary); background: var(--app-color-control-surface); border-radius: 10rpx; font-size: var(--app-font-body); font-weight: 700; padding: 6rpx 12rpx; }
.dynamic-action-media-count-unit { color: var(--app-color-text-secondary); font-size: var(--app-font-meta); font-weight: 400; }
.dynamic-action-media-grid { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 18rpx; }
.dynamic-action-media-tile {
  align-items: center;
  background: var(--app-color-control-surface);
  border: 1rpx solid var(--app-color-border-control);
  border-radius: 14rpx;
  box-sizing: border-box;
  display: flex;
  flex: 0 0 148rpx;
  flex-direction: column;
  gap: 5rpx;
  height: 148rpx;
  justify-content: center;
  overflow: hidden;
  width: 148rpx;
}
.dynamic-action-media-tile--pending { border-style: dashed; color: var(--app-color-text-secondary); font-size: var(--app-font-meta); padding: 12rpx; text-align: center; }
.dynamic-action-media-tile--add { background: var(--app-color-primary-soft); border-color: var(--app-color-primary-border); border-style: dashed; color: var(--app-color-primary); cursor: pointer; font-size: var(--app-font-meta); font-weight: 650; padding: 8rpx; text-align: center; }
.dynamic-action-media-tile--add:active { opacity: 0.78; }
.dynamic-action-media-thumbnail { display: block; height: 100%; object-fit: cover; width: 100%; }
.dynamic-action-media-hint { border-top: 1rpx solid var(--app-color-divider); color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); line-height: 1.5; margin-top: 16rpx; padding-top: 12rpx; }
.dynamic-action-media-actions { margin-top: 16rpx; }
.dynamic-action-media-readonly { color: var(--app-color-text-secondary); font-size: var(--app-font-meta); }
.dynamic-action-presentation-divider { align-items: center; display: flex; gap: var(--app-space-sm); margin-top: var(--app-space-lg); }
.dynamic-action-presentation-divider--gap { background: var(--app-color-page); border-radius: var(--app-radius-control); height: var(--app-space-lg); margin-left: calc(var(--app-card-padding) * -1); margin-right: calc(var(--app-card-padding) * -1); }
.dynamic-action-presentation-line { background: var(--app-color-divider); flex: 1; height: 1rpx; }
.dynamic-action-presentation-label { color: var(--app-color-text-tertiary); font-size: var(--app-font-caption); }
.dynamic-action-unsupported { margin-top: var(--app-space-sm); }
/* S01 approved commercial visual system: Survey only. Other dynamic forms
   keep their existing renderer and layout until separately reviewed. */
.dynamic-action-content--survey { background: transparent; padding: 0; margin-top: 20rpx; }
.dynamic-action-heading--survey { padding: 0 2rpx 16rpx; border-bottom: 0; }
.dynamic-action-content--survey .dynamic-action-title-row { gap: 0; }
.dynamic-action-content--survey .dynamic-action-icon { display: none; }
.dynamic-action-content--survey .dynamic-action-title { font-size: 38rpx; line-height: 1.35; font-weight: 800; }
.dynamic-action-content--survey .dynamic-action-caption { margin-top: 6rpx; color: var(--app-color-text-secondary); font-size: var(--app-font-body); }
.dynamic-action-content--survey .dynamic-action-field--survey {
  display: block; margin: 0 0 16rpx; background: var(--app-color-surface);
  border: 1rpx solid var(--app-color-border); border-radius: var(--app-radius-card);
  padding: 22rpx 22rpx 24rpx; box-shadow: 0 5rpx 18rpx rgba(25,50,81,.035);
}
.dynamic-action-content--survey .dynamic-action-field--survey .app-field__label {
  display:block; margin:0 0 12rpx; color:var(--app-color-text-primary);
  font-size:var(--app-font-body); font-weight:750; line-height:1.4;
}
.dynamic-action-content--survey .dynamic-action-field--survey-cascade .app-field__label {
  padding-left: 54rpx; position:relative; font-size:var(--app-font-section-title);
}
.dynamic-action-content--survey .dynamic-action-field--survey-cascade .app-field__label::before {
  position:absolute; left:0; top:0; background:var(--app-color-primary-soft);
  border-radius:10rpx; width:40rpx; height:40rpx; content:'⌖';
  display:flex; align-items:center; justify-content:center;
  color:var(--app-color-primary); font-size:26rpx;
}
.dynamic-action-content--survey .dynamic-action-field--survey-media .app-field__label {
  font-size:var(--app-font-section-title); margin-bottom:12rpx;
}
.dynamic-action-content--survey .dynamic-action-field--survey-measure .app-input {
  min-height:72rpx; background:var(--app-color-control-surface);
  border-radius:12rpx; text-align:right;
}
.dynamic-action-content--survey .dynamic-action-media { border:0; padding:0; background:transparent; }
.dynamic-action-content--survey .dynamic-action-media-header { margin-bottom:5rpx; }
.dynamic-action-content--survey .dynamic-action-media-title { color:var(--app-color-text-secondary); font-size:var(--app-font-meta); font-weight:500; }
.dynamic-action-content--survey .dynamic-action-media-subtitle { display:none; }
.dynamic-action-content--survey .dynamic-action-media-count { background:var(--app-color-control-surface); font-size:var(--app-font-meta); }
.dynamic-action-content--survey .dynamic-action-media-grid { margin-top:12rpx; gap:14rpx; }
.dynamic-action-content--survey .dynamic-action-media-tile { flex-basis:174rpx; width:174rpx; height:174rpx; border-radius:14rpx; }
.dynamic-action-content--survey .dynamic-action-media-tile--add { border:2rpx dashed var(--app-color-primary-border); background:var(--app-color-primary-soft); }
.dynamic-action-content--survey .dynamic-action-media-tile--preview { cursor:pointer; }
.dynamic-action-content--survey .dynamic-action-presentation-divider:not(.dynamic-action-presentation-divider--gap) {
  margin:22rpx 0 14rpx; padding-left:6rpx;
}
.dynamic-action-content--survey .dynamic-action-presentation-label { font-size:var(--app-font-body); font-weight:750; color:var(--app-color-text-primary); }
.dynamic-action-content--survey .dynamic-action-presentation-divider--gap {
  height:12rpx; background:transparent; margin:0;
}
</style>
