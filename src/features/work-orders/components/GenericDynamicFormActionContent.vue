<template>
  <view class="dynamic-action-content" :class="{ 'app-surface': !isSurvey, 'dynamic-action-content--survey': isSurvey }"
    data-action-content="dynamic-form" data-testid="dynamic-form-action-content">
    <AppActionContentHeading
      :title="isSurvey ? '勘查记录' : title"
      :caption="caption"
      icon="task"
      :variant="isSurvey ? 'survey' : 'default'"
      :required-note="isSurvey && surveyRequiredVisible"
    />

    <template v-for="block in presentationBlocks" :key="block.key">
      <view class="dynamic-action-block"
        :class="{
          'dynamic-action-block--survey': isSurvey,
          'dynamic-action-block--part': isSurvey && block.kind === 'part',
          'dynamic-action-block--measure': isSurvey && block.kind === 'measure',
          'dynamic-action-block--media': isSurvey && block.kind === 'media',
          'dynamic-action-block--field': block.kind === 'field',
        }"
        :data-testid="isSurvey && block.kind !== 'field' ? `survey-${block.kind}-section` : undefined"
      >
        <SurveyTaskSectionHeading
          v-if="isSurvey && block.kind !== 'field'"
          :icon="block.kind === 'media' ? 'image' : block.kind === 'measure' ? 'appointment' : 'location'"
          :tone="block.kind === 'part' ? 'part' : block.kind === 'measure' ? 'measure' : 'media'"
          :title="block.kind === 'part' ? '维修部位' : block.kind === 'measure' ? '现场测量' : block.fields.length === 1 ? block.fields[0].label : surveyMediaTitle(block.fields)"
          :required="(block.kind === 'part' || block.kind === 'media' && block.fields.length === 1) && block.fields.some(field => field.runtime.required)"
          :selected="block.kind === 'part' && arrayValue(workspace.dynamicForm?.values[block.fields[0].valueKey]).length > 0"
          :status="block.kind === 'part' ? (arrayValue(workspace.dynamicForm?.values[block.fields[0].valueKey]).length ? '已选择' : '待选择') : block.kind === 'measure' ? '适用字段' : '按字段上传'"
        />
        <view class="dynamic-action-block__fields"
          :class="{ 'dynamic-action-block__fields--media': isSurvey && block.kind === 'media',
            'dynamic-action-block__fields--single': isSurvey && block.kind === 'media' && block.fields.length === 1 }">
    <template v-for="field in block.fields" :key="field.fieldId">
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
        :hide-label="isSurvey && (block.kind === 'part' || (block.kind === 'media' && block.fields.length === 1))"
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
              variant="secondary"
              block
              :disabled="!workspace.canPickDynamicMedia(field.fieldId) || workspace.lifecycle === 'submitting' || workspace.mediaInFlightField === field.fieldId"
              :loading="workspace.mediaInFlightField === field.fieldId"
              @tap="pickMedia(field.fieldId)"
            >
              {{ mediaRecoveryLabel(field) }}
            </AppButton>
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
        </view>
        <text v-if="isSurvey && block.kind === 'media'" class="dynamic-action-block__helper">
          照片状态由上传结果决定，未上传不计入已完成。
        </text>
      </view>
    </template>

    <slot name="experience" />
    <view v-if="previewUrl" class="dynamic-action-photo-preview" data-testid="survey-media-lightbox"
      role="dialog" aria-modal="true">
      <view class="dynamic-action-photo-preview__header">
        <text>查看现场照片</text>
        <button class="dynamic-action-photo-preview__close" @tap="previewUrl = null" aria-label="关闭预览">×</button>
      </view>
      <image class="dynamic-action-photo-preview__image" :src="previewUrl" mode="aspectFit" />
      <button class="dynamic-action-photo-preview__done" @tap="previewUrl = null">返回表单</button>
    </view>

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
import { computed, ref } from 'vue'

import { useActionWorkspaceStore } from '@features/work-orders/action-workspace'
import type { FormFieldValue } from '@shared/ports'
import { isMediaValueRef } from '@shared/types'
import type { AppChoiceOption } from '@shared/ui/types'
import { isMultilineField } from '../form-presentation'
import { mediaPickerLabelFor, verifiedMediaMaxFor } from '../media-presentation'
import AppActionContentHeading from '@shared/ui/AppActionContentHeading.vue'
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
import SurveyTaskSectionHeading from './SurveyTaskSectionHeading.vue'

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
type RenderField = (typeof workspace.dynamicFields)[number]
type RenderKind = 'field' | 'part' | 'measure' | 'media'
interface RenderBlock {
  key: string
  kind: RenderKind
  fields: RenderField[]
}
/** Only group *adjacent, visible* same-kind fields. Presentation dividers
 * and conditions always break a group; no business field or value is moved. */
const presentationBlocks = computed<RenderBlock[]>(() => {
  const blocks: RenderBlock[] = []
  for (const field of workspace.dynamicFields) {
    if (!field.runtime.visible || props.excludedFieldIds.includes(field.fieldId)
      || field.runtime.capability === 'UNSUPPORTED') continue
    let kind: RenderKind = 'field'
    if (isSurvey.value && field.runtime.capability !== 'PRESENTATION_ONLY') {
      if (field.type === 'cascade' && field.valueKey === 'part') kind = 'part'
      else if (field.type === 'digit' || field.type === 'number') kind = 'measure'
      else if (field.type === 'image' || field.type === 'file') kind = 'media'
    }
    const previous = blocks[blocks.length - 1]
    if ((kind === 'measure' || kind === 'media') && previous?.kind === kind) {
      previous.fields.push(field)
    } else {
      blocks.push({ key: field.fieldId, kind, fields: [field] })
    }
  }
  return blocks
})
/** A historical file field may still be a photo picker (e.g. 大面全景).
 * Prefer explicit field labels over assuming file === document attachment. */
function surveyMediaTitle(fields: readonly RenderField[]): string {
  return fields.some(field => field.type === 'image' || /照片|全景|图片|现场图|渗漏部位|红外/.test(field.label))
    ? '现场照片' : '现场附件'
}
const surveyRequiredVisible = computed(() => workspace.dynamicFields.some(field =>
  field.runtime.visible && field.runtime.required
  && field.runtime.capability !== 'UNSUPPORTED'
  && field.runtime.capability !== 'PRESENTATION_ONLY'
  && !props.excludedFieldIds.includes(field.fieldId),
))
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

function mediaAddTileLabel(field: { readonly fieldId: string; readonly valueKey: string; readonly type: string }): string | undefined {
  // The Runtime's effective state includes Workflow instance readonly fields.
  // Raw FormDef metadata can still say editable, so never expose a dead picker.
  if (!workspace.canPickDynamicMedia(field.fieldId) || workspace.mediaInFlightField
    || hasAmbiguousMedia(field.fieldId) || hasPendingMediaTask(field.fieldId)
    || workspace.mediaCanRetryDynamic(field.fieldId)) return undefined
  if (hasTerminalMediaTask(field.fieldId)) return '重新选择'
  if (mediaCountFor(field.fieldId) === 0) return mediaPickerLabelFor(workspace.dynamicForm?.purpose, field)
  return '继续添加'
}

function mediaRecoveryLabel(field: { readonly fieldId: string }): string | undefined {
  if (!workspace.canPickDynamicMedia(field.fieldId) || workspace.mediaInFlightField
    || hasAmbiguousMedia(field.fieldId)) return undefined
  return workspace.mediaCanRetryDynamic(field.fieldId) ? '继续处理' : undefined
}

function setField(fieldId: string, value: FormFieldValue): void {
  workspace.setField(fieldId, value)
}

const previewUrl = ref<string | null>(null)
function previewMedia(fieldId: string, url: string): void {
  const urls = workspace.mediaByField[fieldId]?.map((item) => item.url) ?? []
  const knownUrls = urls.length ? urls : workspace.dynamicFields
    .filter((field) => field.fieldId === fieldId)
    .flatMap((field) => mediaPreviewsFor(field).map((item) => item.url))
  if (!knownUrls.includes(url)) return
  previewUrl.value = url
}

async function pickMedia(fieldId: string): Promise<void> {
  if (!workspace.canPickDynamicMedia(fieldId) || workspace.mediaInFlightField) return
  if (workspace.mediaCanRetryDynamic(fieldId)) {
    await workspace.retryDynamicMedia(fieldId)
    return
  }
  await workspace.pickDynamicMedia(fieldId)
}

</script>

<style>
.dynamic-action-content { margin-top: var(--app-space-md); padding: var(--app-card-padding); }
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
.dynamic-action-presentation-divider { align-items: center; display: flex; gap: var(--app-space-sm); margin-top: var(--app-space-lg); }
.dynamic-action-presentation-divider--gap { background: var(--app-color-page); border-radius: var(--app-radius-control); height: var(--app-space-lg); margin-left: calc(var(--app-card-padding) * -1); margin-right: calc(var(--app-card-padding) * -1); }
.dynamic-action-presentation-line { background: var(--app-color-divider); flex: 1; height: 1rpx; }
.dynamic-action-presentation-label { color: var(--app-color-text-tertiary); font-size: var(--app-font-caption); }
.dynamic-action-unsupported { margin-top: var(--app-space-sm); }
/* S01 approved commercial visual system: Survey only. Other dynamic forms
   keep their existing renderer and layout until separately reviewed. */
.dynamic-action-content--survey { background: transparent; padding: 0; margin-top: 20rpx; }
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
/* Measurement stays on the S01 surface; consecutive numeric fields read
   as one compact data-entry section rather than independent debug cards. */
.dynamic-action-content--survey .dynamic-action-field--survey-measure {
  box-sizing:border-box; display:flex; align-items:center; gap:14rpx;
  min-height:94rpx; padding:14rpx 22rpx;
}
.dynamic-action-content--survey .dynamic-action-field--survey-measure .app-field__label {
  flex:1; min-width:0; margin:0; font-size:var(--app-font-body); font-weight:650;
}
.dynamic-action-content--survey .dynamic-action-field--survey-measure .app-input {
  width:44%; flex:0 0 44%; min-width:0; box-sizing:border-box; text-align:right;
  padding:0 18rpx; min-height:72rpx; font-size:var(--app-font-body);
}
.dynamic-action-content--survey .dynamic-action-field--survey-measure + .dynamic-action-field--survey-measure {
  border-top-color:var(--app-color-divider); border-top-left-radius:0;
  border-top-right-radius:0; margin-top:-17rpx; box-shadow:none;
}
/* Each `image/file` field retains its own fieldId, max, provider and
   media queue; only the visual affordance forms the paired S01 photo grid. */
.dynamic-action-content--survey .dynamic-action-field--survey-media {
  display:inline-block; box-sizing:border-box; vertical-align:top;
  width:48.3%; margin:0 1.7% 16rpx 0; padding:16rpx;
  min-height:252rpx;
}
.dynamic-action-content--survey .dynamic-action-field--survey-media .app-field__label {
  font-size:var(--app-font-meta); min-height:48rpx; line-height:1.35;
}
.dynamic-action-content--survey .dynamic-action-field--survey-media .dynamic-action-media-header-copy { display:none; }
.dynamic-action-content--survey .dynamic-action-field--survey-media .dynamic-action-media-count {
  padding:3rpx 9rpx; font-size:var(--app-font-meta); margin-bottom:6rpx;
}
.dynamic-action-content--survey .dynamic-action-field--survey-media .dynamic-action-media-grid {
  margin-top:6rpx; gap:8rpx;
}
.dynamic-action-content--survey .dynamic-action-field--survey-media .dynamic-action-media-tile {
  width:100%; height:148rpx; flex:1 1 100%; min-width:0;
}
.dynamic-action-content--survey .dynamic-action-field--survey-media .dynamic-action-media-tile--add {
  background:var(--app-color-primary-soft); border:2rpx dashed var(--app-color-primary-border);
}
.dynamic-action-content--survey .dynamic-action-field--survey-media .dynamic-action-media-hint {
  font-size:var(--app-font-meta); margin-top:10rpx; padding-top:9rpx;
}

.dynamic-action-content--survey .dynamic-action-presentation-divider:not(.dynamic-action-presentation-divider--gap) {
  margin:22rpx 0 14rpx; padding-left:6rpx;
}
.dynamic-action-content--survey .dynamic-action-presentation-label { font-size:var(--app-font-body); font-weight:750; color:var(--app-color-text-primary); }
.dynamic-action-content--survey .dynamic-action-presentation-divider--gap {
  height:12rpx; background:transparent; margin:0;
}
/* S2 visual-fidelity pass: real Runtime field order stays untouched.
   Each adjacent group is a single coherent technician task, not a fixed form schema. */
.dynamic-action-block--survey { background:var(--app-color-surface); border:1rpx solid var(--app-color-border);
  border-radius:22rpx; margin-bottom:16rpx; padding:18rpx 18rpx 20rpx;
  box-shadow:0 5rpx 18rpx rgba(25,50,81,.035); overflow:hidden; }
.dynamic-action-block--survey.dynamic-action-block--field { background:transparent; border:0; padding:0;
  box-shadow:none; overflow:visible; margin-bottom:0; }
.dynamic-action-content--survey .dynamic-action-block--part .dynamic-action-field--survey-cascade,
.dynamic-action-content--survey .dynamic-action-block--measure .dynamic-action-field--survey-measure,
.dynamic-action-content--survey .dynamic-action-block--media .dynamic-action-field--survey-media {
  margin:0; border:0; border-radius:0; box-shadow:none; padding:0; background:transparent; }
.dynamic-action-content--survey .dynamic-action-block--part .dynamic-action-field--survey-cascade .app-field__label { display:none; }
.dynamic-action-content--survey .dynamic-action-block--part .dynamic-action-field--survey-cascade .app-field__label::before { display:none; }
.dynamic-action-content--survey .dynamic-action-block--part .survey-part-picker__trigger { min-height:86rpx;
  padding:12rpx 2rpx; }
.dynamic-action-content--survey .dynamic-action-block--measure .dynamic-action-field--survey-measure {
  display:flex; align-items:center; min-height:76rpx; gap:16rpx; }
.dynamic-action-content--survey .dynamic-action-block--measure .dynamic-action-field--survey-measure + .dynamic-action-field--survey-measure {
  border-top:1rpx solid var(--app-color-divider); border-radius:0; margin-top:0; padding-top:12rpx; }
.dynamic-action-content--survey .dynamic-action-block--measure .dynamic-action-field--survey-measure .app-input {
  background:var(--app-color-control-surface); min-height:72rpx; }
.dynamic-action-block--media .dynamic-action-block__fields--media { display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr)); gap:16rpx; }
.dynamic-action-block--media .dynamic-action-block__fields--single { grid-template-columns:minmax(0,1fr); }
.dynamic-action-content--survey .dynamic-action-block--media .dynamic-action-field--survey-media {
  display:block; box-sizing:border-box; width:auto; min-width:0; min-height:0;
  margin:0; }
.dynamic-action-content--survey .dynamic-action-block--media .dynamic-action-field--survey-media .app-field__label {
  display:block; min-height:0; margin:0 0 8rpx; color:var(--app-color-text-primary);
  font-size:var(--app-font-field-label); line-height:1.45; font-weight:700; }
.dynamic-action-content--survey .dynamic-action-block--media .dynamic-action-media-header { margin-bottom:8rpx; }
.dynamic-action-content--survey .dynamic-action-block--media .dynamic-action-media-grid { margin-top:6rpx; }
.dynamic-action-content--survey .dynamic-action-block--media .dynamic-action-media-tile {
  min-height:140rpx; height:140rpx; width:100%; flex:1 1 100%; }
.dynamic-action-content--survey .dynamic-action-block--media .dynamic-action-media-count {
  padding:2rpx 8rpx; background:transparent; color:var(--app-color-text-secondary); }
.dynamic-action-block__helper { display:block; margin-top:14rpx; color:var(--app-color-text-secondary);
  font-size:21rpx; line-height:1.55; }
.dynamic-action-content--survey .dynamic-action-block--field .dynamic-action-field--survey { margin-bottom:16rpx; }
/* S04: media stays inline for capture/upload. Only tapping an existing
   verified preview invokes a larger in-app view, without platform API calls. */
.dynamic-action-photo-preview { position:fixed; z-index:160; inset:0; background:#111d30;
  display:flex; flex-direction:column; justify-content:space-between; padding:calc(24rpx + env(safe-area-inset-top)) 24rpx calc(30rpx + env(safe-area-inset-bottom)); box-sizing:border-box; }
.dynamic-action-photo-preview__header { display:flex; align-items:center; justify-content:space-between;
  color:white; font-size:var(--app-font-body); font-weight:750; }
.dynamic-action-photo-preview__close { border:0; color:white; background:transparent; margin:0; font-size:44rpx; min-height:72rpx; }
.dynamic-action-photo-preview__close::after { border:0; }
.dynamic-action-photo-preview__image { width:100%; flex:1; min-height:0; }
.dynamic-action-photo-preview__done { background:white; color:var(--app-color-text-primary);
  font-weight:750; border-radius:12rpx; min-height:86rpx; }
</style>
