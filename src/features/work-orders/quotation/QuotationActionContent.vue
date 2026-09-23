<template>
  <view class="quotation-content" data-testid="quotation-action-content">
    <view class="quotation-content__heading">
      <text class="quotation-content__eyebrow">报价工作区</text>
      <text class="quotation-content__title">报价方案</text>
      <text class="quotation-content__description">整理本机草稿中的服务方案与报价明细。</text>
    </view>

    <view v-if="state === 'loading'" class="quotation-content__panel app-surface" data-testid="quotation-state-loading">
      <AppLoadingState variant="inline" label="正在准备报价内容" />
    </view>

    <view v-else-if="state === 'ready'" class="quotation-content__panel app-surface" data-testid="quotation-state-ready">
      <view class="quotation-content__panel-header">
        <view>
          <text class="quotation-content__panel-title">服务方案 / 报价明细</text>
          <text class="quotation-content__line-count">{{ composition.selectionCount }} 项 · {{ composition.groups.length }} 个部位组</text>
        </view>
        <text class="quotation-content__local-tag">仅本机草稿</text>
      </view>

      <AppStatus
        v-if="composition.localStateMessage"
        class="quotation-content__local-status"
        :message="composition.localStateMessage"
        :tone="composition.localState === 'save_failed' || composition.localState === 'invalid' || composition.localState === 'unavailable' ? 'warning' : 'neutral'"
        quiet
      />
      <AppStatus
        v-else-if="composition.localState === 'saving'"
        class="quotation-content__local-status"
        message="正在保存本地草稿…"
        quiet
      />
      <AppStatus
        v-else-if="composition.localState === 'saved_local'"
        class="quotation-content__local-status"
        message="报价草稿已保存在本机。"
        tone="success"
        quiet
      />

      <view v-if="composition.localState === 'legacy_requires_action'" class="quotation-content__blocked" data-testid="quotation-draft-legacy">
        <text class="quotation-content__blocked-title">旧版平铺草稿已保留</text>
        <text class="quotation-content__copy">旧草稿没有可靠的维修部位和工程量归属，系统不会自动迁移、覆盖或清除。请先人工处理；如确认不再需要，可显式放弃并创建分组草稿。</text>
        <AppButton class="quotation-content__secondary-action" variant="secondary" block @tap="composition.discardLegacyDraft">确认放弃旧版草稿并新建</AppButton>
      </view>
      <view v-else-if="composition.localState === 'invalid'" class="quotation-content__blocked" data-testid="quotation-draft-invalid">
        <text class="quotation-content__blocked-title">无法恢复这份本地草稿</text>
        <text class="quotation-content__copy">草稿格式不兼容，原记录已保留。确认不再需要后，可清除异常记录并新建。</text>
        <AppButton class="quotation-content__secondary-action" variant="secondary" block @tap="composition.discardInvalidDraft">清除异常草稿并新建</AppButton>
      </view>
      <view v-else-if="composition.localState === 'unavailable'" class="quotation-content__blocked" data-testid="quotation-draft-unavailable">
        <text class="quotation-content__blocked-title">本地草稿暂不可用</text>
        <text class="quotation-content__copy">为避免覆盖尚未确认的数据，当前报价内容已锁定。请稍后重试或返回工单。</text>
      </view>
      <view v-else>
        <view v-if="composition.groups.length === 0" class="quotation-content__empty" data-testid="quotation-draft-empty">
          <view class="quotation-content__empty-mark" aria-hidden="true">＋</view>
          <text class="quotation-content__empty-title">还没有维修部位组</text>
          <text class="quotation-content__copy">先建立部位上下文，再在每个分组中整理服务方案、工序、材料或机措。当前内容仅保存在本机。</text>
          <AppButton
            class="quotation-content__add-group-button"
            data-testid="quotation-add-group"
            block
            :disabled="!canEdit"
            @tap="composition.createGroup()"
          >添加维修部位组</AppButton>
        </view>

        <view v-else class="quotation-content__groups" data-testid="quotation-draft-groups">
          <view
            v-for="(group, groupIndex) in composition.groups"
            :key="group.groupId"
            class="quotation-content__group app-surface app-surface--compact"
            :data-testid="`quotation-repair-group-${group.groupId}`"
          >
            <view class="quotation-content__group-heading">
              <view>
                <text class="quotation-content__group-eyebrow">维修部位组 {{ String(groupIndex + 1).padStart(2, '0') }}</text>
                <text class="quotation-content__group-title">{{ group.partDescription || '待填写部位描述' }}</text>
              </view>
              <text class="quotation-content__local-tag">本机草稿</text>
            </view>
            <view class="quotation-content__group-context" :data-testid="`quotation-group-context-${group.groupId}`">
              <text class="quotation-content__context-label">维修部位路径</text>
              <AppCascadeSelector
                :options="composition.repairPartOptions"
                :model-value="group.repairParts"
                :hierarchical="true"
                :test-id="`quotation-repair-part-selector-${group.groupId}`"
                :disabled="!canEdit || composition.repairPartOptions.length === 0"
                @update:model-value="onRepairPartChange(group.groupId, $event)"
              />
              <AppStatus
                v-if="composition.repairPartOptions.length === 0"
                message="维修部位选项暂不可用；当前组未绑定部位，不能向其中添加目录项。"
                tone="warning"
                quiet
              />
              <view class="quotation-content__group-fields">
                <label class="quotation-content__context-field">
                  <text class="quotation-content__context-label">部位描述</text>
                  <textarea
                    class="quotation-content__context-input quotation-content__context-input--multiline"
                    :value="group.partDescription"
                    :disabled="!canEdit"
                    placeholder="补充维修部位描述"
                    :data-testid="`quotation-group-description-${group.groupId}`"
                    @input="onGroupDescriptionInput(group.groupId, $event)"
                  />
                </label>
                <label class="quotation-content__context-field">
                  <text class="quotation-content__context-label">工程量</text>
                  <input
                    class="quotation-content__context-input"
                    type="digit"
                    :value="group.maintainAreaNum"
                    :disabled="!canEdit"
                    placeholder="填写工程量"
                    :data-testid="`quotation-group-quantity-${group.groupId}`"
                    @input="onGroupQuantityInput(group.groupId, $event)"
                  />
                </label>
              </view>
            </view>

            <view
              v-for="kind in catalogKinds"
              :key="kind"
              class="quotation-content__group-section"
              :data-testid="`quotation-group-section-${group.groupId}-${kind}`"
            >
              <view class="quotation-content__group-section-heading">
                <text class="quotation-content__panel-title">{{ composition.catalogKindLabels[kind] }}</text>
                <AppButton
                  class="quotation-content__add-selection"
                  variant="secondary"
                  :data-testid="`quotation-add-item-${group.groupId}-${kind}`"
                  :disabled="!canEdit || group.repairParts.length === 0"
                  @tap="composition.openCatalog(group.groupId, kind)"
                >添加</AppButton>
              </view>
              <view
                v-for="selection in composition.selectionsFor(group.groupId, kind)"
                :key="selection.selectionId"
                class="quotation-content__selection"
                data-testid="quotation-composition-selection"
              >
                <view class="quotation-content__line-heading">
                  <view class="quotation-content__line-title-wrap">
                    <text class="quotation-content__line-title">{{ selection.label }}</text>
                  </view>
                  <text class="quotation-content__kind-tag">{{ composition.catalogKindLabels[selection.kind] }}</text>
                </view>
                <view class="quotation-content__line-controls">
                  <text class="quotation-content__quantity-label">数量</text>
                  <view class="quotation-content__quantity-wrap" :class="{ 'quotation-content__quantity-wrap--error': composition.quantityErrorBySelection[selection.selectionId] }">
                    <input
                      class="quotation-content__quantity"
                      type="digit"
                      :value="composition.quantityTextBySelection[selection.selectionId] ?? String(selection.quantity)"
                      :disabled="!canEdit"
                      :aria-label="`${selection.label}数量`"
                      :data-testid="`quotation-selection-quantity-${selection.selectionId}`"
                      @input="onQuantityInput(group.groupId, selection.selectionId, $event)"
                    />
                    <text v-if="selection.unit" class="quotation-content__unit">{{ selection.unit }}</text>
                  </view>
                  <text v-if="composition.quantityErrorBySelection[selection.selectionId]" class="quotation-content__quantity-error" role="alert">
                    {{ composition.quantityErrorBySelection[selection.selectionId] }}
                  </text>
                  <AppButton
                    class="quotation-content__remove-button"
                    variant="text"
                    :disabled="!canEdit"
                    :data-testid="`quotation-selection-remove-${selection.selectionId}`"
                    @tap="composition.removeSelection(group.groupId, selection.selectionId)"
                  >移除</AppButton>
                </view>
              </view>
              <text v-if="composition.selectionsFor(group.groupId, kind).length === 0" class="quotation-content__empty-section">暂未添加</text>
            </view>
          </view>
          <AppButton
            class="quotation-content__add-group-button quotation-content__add-group-button--outline"
            data-testid="quotation-add-group"
            variant="secondary"
            block
            :disabled="!canEdit"
            @tap="composition.createGroup()"
          >＋ 添加维修部位组</AppButton>
        </view>
      </view>

      <view v-if="composition.localState === 'save_failed'" class="quotation-content__retry">
        <AppButton variant="secondary" block @tap="composition.flushDraft">重试保存本地草稿</AppButton>
      </view>
    </view>

    <view v-else-if="state === 'blocked'" class="quotation-content__panel app-surface" data-testid="quotation-state-blocked">
      <AppStatus
        message="真实报价读取尚未开放；未使用 Mock 数据替代真实报价。"
        tone="warning"
        quiet
      />
      <AppButton class="quotation-content__secondary-action" variant="secondary" block @tap="$emit('back')">返回工单详情</AppButton>
    </view>

    <view v-else-if="state === 'failed_retryable'" class="quotation-content__panel app-surface" data-testid="quotation-state-retryable">
      <AppStatus message="暂时无法准备报价内容，请检查网络后重试。" tone="warning" quiet />
      <AppButton class="quotation-content__secondary-action" variant="secondary" block @tap="$emit('retry')">重新加载</AppButton>
    </view>

    <view v-else class="quotation-content__panel app-surface" data-testid="quotation-state-terminal">
      <AppStatus message="报价内容暂不可用，请返回工单详情后再试。" tone="warning" quiet />
      <AppButton class="quotation-content__secondary-action" variant="secondary" block @tap="$emit('back')">返回工单详情</AppButton>
    </view>

    <view
      v-if="state === 'ready' && composition.catalogOpen"
      class="quotation-content__catalog-backdrop"
      data-testid="quotation-catalog-sheet"
      @tap.self="composition.closeCatalog"
    >
      <view class="quotation-content__catalog-sheet" role="dialog" aria-modal="true" aria-label="选择报价目录项">
        <view class="quotation-content__catalog-handle" aria-hidden="true" />
        <view class="quotation-content__catalog-heading">
          <view>
            <text class="quotation-content__catalog-title">添加报价项目</text>
            <text class="quotation-content__catalog-subtitle">选择项目加入当前维修部位组</text>
          </view>
          <AppButton class="quotation-content__catalog-close" variant="text" aria-label="关闭目录" @tap="composition.closeCatalog">关闭</AppButton>
        </view>
        <view class="quotation-content__category-grid" data-testid="quotation-catalog-categories">
          <AppButton
            v-for="kind in catalogKinds"
            :key="kind"
            class="quotation-content__category"
            variant="secondary"
            :pressed="composition.selectedCatalogKind === kind"
            :data-testid="`quotation-catalog-kind-${kind}`"
            @tap="composition.selectCatalogKind(kind)"
          >{{ composition.catalogKindLabels[kind] }}</AppButton>
        </view>
        <scroll-view class="quotation-content__catalog-list" scroll-y>
          <button
            v-for="item in visibleCatalogItems"
            :key="item.catalogId"
            class="quotation-content__catalog-item"
            :data-testid="`quotation-catalog-item-${item.catalogId}`"
            @tap="selectItem(item.kind, item.catalogId)"
          >
            <view class="quotation-content__catalog-item-copy">
              <text class="quotation-content__catalog-item-title">{{ item.label }}</text>
              <text class="quotation-content__catalog-item-meta">{{ item.unit ? `计量单位：${item.unit}` : '未设置单位' }}</text>
            </view>
            <text class="quotation-content__catalog-item-add" aria-hidden="true">＋</text>
          </button>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import AppButton from '@shared/ui/AppButton.vue'
import AppCascadeSelector from '@shared/ui/AppCascadeSelector.vue'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import { useQuotationCompositionStore } from './composition-store'
import { quotationCatalog, quotationCatalogItemsFor } from './catalog'
import type { QuotationLineKind } from './model'

defineProps<{
  readonly state: 'loading' | 'ready' | 'blocked' | 'failed_retryable' | 'failed_terminal'
}>()

defineEmits<{
  (event: 'retry'): void
  (event: 'back'): void
}>()

const composition = useQuotationCompositionStore()
const catalogKinds: readonly QuotationLineKind[] = ['package', 'procedure', 'material', 'measure']
const canEdit = computed(() => ['fresh', 'restored', 'dirty', 'saving', 'saved_local', 'save_failed'].includes(composition.localState))
const visibleCatalogItems = computed(() => quotationCatalogItemsFor(composition.selectedCatalogKind))

function eventValue(event: unknown): string {
  const detail = typeof event === 'object' && event !== null
    ? (event as { detail?: { value?: unknown } }).detail
    : undefined
  return typeof detail?.value === 'string' ? detail.value : ''
}

function onRepairPartChange(groupId: string, repairParts: readonly string[]): void {
  composition.updateGroupContext(groupId, { repairParts })
}

function onGroupDescriptionInput(groupId: string, event: unknown): void {
  composition.updateGroupContext(groupId, { partDescription: eventValue(event) })
}

function onGroupQuantityInput(groupId: string, event: unknown): void {
  composition.updateGroupContext(groupId, { maintainAreaNum: eventValue(event) })
}

function onQuantityInput(groupId: string, selectionId: string, event: unknown): void {
  composition.setQuantityText(groupId, selectionId, eventValue(event))
}

function selectItem(kind: QuotationLineKind, catalogId: string): void {
  const groupId = composition.selectedGroupId
  if (!groupId) return
  const result = composition.addCatalogItem(groupId, kind, catalogId)
  if (result.state === 'succeeded') composition.closeCatalog()
}
</script>

<style>
.quotation-content { margin-top: var(--app-space-md); }
.quotation-content__heading { display: flex; flex-direction: column; margin: 0 var(--app-space-xs) var(--app-space-md); }
.quotation-content__eyebrow { color: var(--app-color-text-secondary); font-size: var(--app-font-meta); }
.quotation-content__title { color: var(--app-color-text-primary); font-size: var(--app-font-section-title); font-weight: 800; margin-top: var(--app-space-xs); }
.quotation-content__description { color: var(--app-color-text-secondary); font-size: var(--app-font-body); line-height: 1.5; margin-top: var(--app-space-xs); }
.quotation-content__panel { padding: var(--app-card-padding); }
.quotation-content__panel-header { align-items: flex-start; border-bottom: 1rpx solid var(--app-color-divider); display: flex; justify-content: space-between; padding-bottom: var(--app-space-md); }
.quotation-content__panel-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-field-label); font-weight: 800; }
.quotation-content__line-count { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); margin-top: var(--app-space-xs); }
.quotation-content__local-tag, .quotation-content__kind-tag { background: var(--app-color-primary-soft); border-radius: var(--app-radius-control); color: var(--app-color-primary); flex-shrink: 0; font-size: var(--app-font-meta); padding: var(--app-space-xs) var(--app-space-sm); }
.quotation-content__local-status { margin-top: var(--app-space-sm); }
.quotation-content__empty { align-items: center; display: flex; flex-direction: column; padding: 48rpx var(--app-space-sm) 16rpx; text-align: center; }
.quotation-content__empty-mark { align-items: center; background: var(--app-color-primary-soft); border-radius: 999rpx; color: var(--app-color-primary); display: flex; font-size: 46rpx; height: 80rpx; justify-content: center; width: 80rpx; }
.quotation-content__empty-title, .quotation-content__blocked-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-value); font-weight: 800; margin-top: var(--app-space-md); }
.quotation-content__copy { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-body); line-height: 1.6; margin-top: var(--app-space-sm); }
.quotation-content__add-button { margin-top: var(--app-space-md); }
.quotation-content__add-button--outline { border-style: dashed; }
.quotation-content__add-group-button { margin-top: var(--app-space-md); }
.quotation-content__add-group-button--outline { border-style: dashed; }
.quotation-content__groups { display: flex; flex-direction: column; gap: var(--app-space-md); padding-top: var(--app-space-md); }
.quotation-content__group { padding: var(--app-card-padding); }
.quotation-content__group-heading, .quotation-content__group-section-heading { align-items: center; display: flex; justify-content: space-between; }
.quotation-content__group-heading { align-items: flex-start; border-bottom: 1rpx solid var(--app-color-divider); padding-bottom: var(--app-space-sm); }
.quotation-content__group-eyebrow { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); }
.quotation-content__group-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-field-label); font-weight: 800; margin-top: var(--app-space-xs); }
.quotation-content__group-context { display: flex; flex-direction: column; gap: var(--app-space-sm); padding: var(--app-space-md) 0; }
.quotation-content__context-label { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); font-weight: 700; }
.quotation-content__group-fields { display: grid; gap: var(--app-space-sm); grid-template-columns: 1fr; }
.quotation-content__context-field { display: flex; flex-direction: column; gap: var(--app-space-xs); min-width: 0; }
.quotation-content__context-input { background: var(--app-color-control-surface); border: 1rpx solid var(--app-color-border-control); border-radius: var(--app-radius-control); box-sizing: border-box; color: var(--app-color-text-primary); font-size: var(--app-font-body); min-height: 76rpx; padding: var(--app-space-sm); width: 100%; }
.quotation-content__context-input--multiline { min-height: 112rpx; }
.quotation-content__group-section { border-top: 1rpx solid var(--app-color-divider); padding-top: var(--app-space-md); }
.quotation-content__group-section + .quotation-content__group-section { margin-top: var(--app-space-sm); }
.quotation-content__add-selection { min-height: 40px; }
.quotation-content__selection { border-top: 1rpx solid var(--app-color-divider); margin-top: var(--app-space-sm); padding-top: var(--app-space-sm); }
.quotation-content__empty-section { color: var(--app-color-text-muted); display: block; font-size: var(--app-font-meta); padding: var(--app-space-sm) 0; }
.quotation-content__lines { display: flex; flex-direction: column; gap: var(--app-space-sm); padding-top: var(--app-space-md); }
.quotation-content__line { padding: var(--app-space-md); }
.quotation-content__line-heading { align-items: flex-start; display: flex; gap: var(--app-space-sm); justify-content: space-between; }
.quotation-content__line-title-wrap { align-items: flex-start; display: flex; flex: 1; gap: var(--app-space-sm); min-width: 0; }
.quotation-content__line-index { color: var(--app-color-text-secondary); flex-shrink: 0; font-size: var(--app-font-meta); font-weight: 800; padding-top: 3rpx; }
.quotation-content__line-title { color: var(--app-color-text-primary); flex: 1; font-size: var(--app-font-field-label); font-weight: 700; line-height: 1.4; min-width: 0; overflow-wrap: anywhere; }
.quotation-content__line-controls { align-items: center; display: grid; gap: var(--app-space-xs) var(--app-space-sm); grid-template-columns: auto minmax(100rpx, 1fr) auto; margin-top: var(--app-space-md); }
.quotation-content__quantity-label { color: var(--app-color-text-secondary); font-size: var(--app-font-meta); }
.quotation-content__quantity-wrap { align-items: center; background: var(--app-color-control-surface); border: 1rpx solid var(--app-color-border-control); border-radius: var(--app-radius-control); box-sizing: border-box; display: flex; min-height: 76rpx; min-width: 0; padding: 0 var(--app-space-sm); }
.quotation-content__quantity-wrap--error { border-color: var(--app-color-danger); }
.quotation-content__quantity { background: transparent; border: 0; box-sizing: border-box; color: var(--app-color-text-primary); flex: 1; font-size: var(--app-font-body); min-width: 0; outline: none; padding: var(--app-space-sm) 0; }
.quotation-content__quantity-error { color: var(--app-color-danger); font-size: var(--app-font-meta); grid-column: 2 / 4; line-height: 1.4; }
.quotation-content__unit { color: var(--app-color-text-secondary); flex-shrink: 0; font-size: var(--app-font-meta); padding-left: var(--app-space-xs); }
.quotation-content__remove-button { grid-column: 3; min-height: 44px; }
.quotation-content__blocked { padding-top: var(--app-space-md); }
.quotation-content__blocked-title { margin-top: 0; }
.quotation-content__secondary-action, .quotation-content__retry { margin-top: var(--app-space-md); }
.quotation-content__catalog-backdrop { align-items: flex-end; background: rgba(20, 32, 52, .42); display: flex; inset: 0; justify-content: center; position: fixed; z-index: 1000; }
.quotation-content__catalog-sheet { background: var(--app-color-page); border-radius: var(--app-radius-card) var(--app-radius-card) 0 0; box-sizing: border-box; display: flex; flex-direction: column; max-height: 82vh; max-width: 640px; padding: var(--app-space-sm) var(--app-page-gutter) var(--app-space-md); padding-bottom: calc(var(--app-space-md) + constant(safe-area-inset-bottom)); padding-bottom: calc(var(--app-space-md) + env(safe-area-inset-bottom)); width: 100%; }
.quotation-content__catalog-handle { align-self: center; background: var(--app-color-border); border-radius: 99px; height: 8rpx; margin: 0 auto var(--app-space-md); width: 72rpx; }
.quotation-content__catalog-heading { align-items: flex-start; display: flex; justify-content: space-between; }
.quotation-content__catalog-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-section-title); font-weight: 800; }
.quotation-content__catalog-subtitle { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); margin-top: var(--app-space-xs); }
.quotation-content__catalog-close { min-height: 44px; }
.quotation-content__category-grid { display: grid; gap: var(--app-space-xs); grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: var(--app-space-md); }
.quotation-content__category { min-height: 48px; padding-left: 4rpx; padding-right: 4rpx; }
.quotation-content__catalog-list { flex: 1; margin-top: var(--app-space-sm); min-height: 100rpx; }
.quotation-content__catalog-item { align-items: center; background: var(--app-color-surface); border: 1rpx solid var(--app-color-border); border-radius: var(--app-radius-control); box-sizing: border-box; color: var(--app-color-text-primary); display: flex; justify-content: space-between; margin-bottom: var(--app-space-sm); min-height: 92rpx; padding: var(--app-space-sm) var(--app-space-md); text-align: left; width: 100%; }
.quotation-content__catalog-item-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.quotation-content__catalog-item-title { font-size: var(--app-font-body); font-weight: 700; overflow-wrap: anywhere; }
.quotation-content__catalog-item-meta { color: var(--app-color-text-secondary); font-size: var(--app-font-meta); margin-top: var(--app-space-xs); }
.quotation-content__catalog-item-add { color: var(--app-color-primary); flex-shrink: 0; font-size: 36rpx; margin-left: var(--app-space-sm); }
</style>
