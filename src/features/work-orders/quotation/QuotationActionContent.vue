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
          <text class="quotation-content__line-count">{{ composition.lines.length }} 项</text>
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

      <view v-if="composition.localState === 'invalid'" class="quotation-content__blocked" data-testid="quotation-draft-invalid">
        <text class="quotation-content__blocked-title">无法恢复这份本地草稿</text>
        <text class="quotation-content__copy">草稿格式不兼容，原记录已保留。确认不再需要后，可清除异常记录并新建。</text>
        <AppButton class="quotation-content__secondary-action" variant="secondary" block @tap="composition.discardInvalidDraft">清除异常草稿并新建</AppButton>
      </view>
      <view v-else-if="composition.localState === 'unavailable'" class="quotation-content__blocked" data-testid="quotation-draft-unavailable">
        <text class="quotation-content__blocked-title">本地草稿暂不可用</text>
        <text class="quotation-content__copy">为避免覆盖尚未确认的数据，当前报价内容已锁定。请稍后重试或返回工单。</text>
      </view>
      <view v-else>
        <view v-if="composition.lines.length === 0" class="quotation-content__empty" data-testid="quotation-draft-empty">
          <view class="quotation-content__empty-mark" aria-hidden="true">＋</view>
          <text class="quotation-content__empty-title">还没有添加报价明细</text>
          <text class="quotation-content__copy">从目录选择服务方案、工序、材料或计量项，先整理本地草稿。</text>
          <AppButton
            class="quotation-content__add-button"
            data-testid="quotation-add-item"
            block
            :disabled="!canEdit"
            @tap="composition.openCatalog()"
          >添加项目</AppButton>
        </view>

        <view v-else class="quotation-content__lines" data-testid="quotation-draft-lines">
          <view
            v-for="(line, index) in composition.lines"
            :key="line.lineId"
            class="quotation-content__line app-surface app-surface--compact"
            data-testid="quotation-composition-line"
          >
            <view class="quotation-content__line-heading">
              <view class="quotation-content__line-title-wrap">
                <text class="quotation-content__line-index">{{ String(index + 1).padStart(2, '0') }}</text>
                <text class="quotation-content__line-title">{{ line.label }}</text>
              </view>
              <text class="quotation-content__kind-tag">{{ composition.catalogKindLabels[line.kind] }}</text>
            </view>
            <view class="quotation-content__line-controls">
              <text class="quotation-content__quantity-label">数量</text>
              <view class="quotation-content__quantity-wrap" :class="{ 'quotation-content__quantity-wrap--error': composition.quantityErrorByLine[line.lineId] }">
                <input
                  class="quotation-content__quantity"
                  type="digit"
                  :value="composition.quantityTextByLine[line.lineId] ?? String(line.quantity)"
                  :disabled="!canEdit"
                  :aria-label="`${line.label}数量`"
                  :data-testid="`quotation-line-quantity-${line.lineId}`"
                  @input="onQuantityInput(line.lineId, $event)"
                />
                <text v-if="line.unit" class="quotation-content__unit">{{ line.unit }}</text>
              </view>
              <text v-if="composition.quantityErrorByLine[line.lineId]" class="quotation-content__quantity-error" role="alert">
                {{ composition.quantityErrorByLine[line.lineId] }}
              </text>
              <AppButton
                class="quotation-content__remove-button"
                variant="text"
                :disabled="!canEdit"
                :data-testid="`quotation-line-remove-${line.lineId}`"
                @tap="composition.removeLine(line.lineId)"
              >移除</AppButton>
            </view>
          </view>
          <AppButton
            class="quotation-content__add-button quotation-content__add-button--outline"
            data-testid="quotation-add-item"
            variant="secondary"
            block
            :disabled="!canEdit"
            @tap="composition.openCatalog()"
          >＋ 添加项目</AppButton>
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
            <text class="quotation-content__catalog-subtitle">选择项目加入本机草稿</text>
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

function onQuantityInput(lineId: string, event: unknown): void {
  const detail = typeof event === 'object' && event !== null
    ? (event as { detail?: { value?: unknown } }).detail
    : undefined
  composition.setQuantityText(lineId, typeof detail?.value === 'string' ? detail.value : '')
}

function selectItem(kind: QuotationLineKind, catalogId: string): void {
  const result = composition.addCatalogItem(kind, catalogId)
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
