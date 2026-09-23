<template>
  <view class="quotation-content" data-testid="quotation-action-content">
    <view class="quotation-content__heading">
      <text class="quotation-content__eyebrow">报价工作区</text>
      <text class="quotation-content__title">报价方案</text>
      <text class="quotation-content__description">分组草稿保存在本机；目录内容仅供只读浏览，尚不能加入草稿。</text>
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
                  class="quotation-content__browse-catalog"
                  variant="secondary"
                  :data-testid="`quotation-browse-${kind}`"
                  @tap="catalogBrowser.open(kind)"
                >浏览目录</AppButton>
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
        message="报价单业务状态暂不可用；不会用目录数据替代已有报价状态。"
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
      v-if="state === 'ready' && catalogBrowser.isOpen"
      class="quotation-content__catalog-backdrop"
      data-testid="quotation-catalog-sheet"
      @tap.self="catalogBrowser.close"
    >
      <view class="quotation-content__catalog-sheet" role="dialog" aria-modal="true" aria-label="报价目录只读浏览">
        <view class="quotation-content__catalog-handle" aria-hidden="true" />
        <view class="quotation-content__catalog-heading">
          <view>
            <text class="quotation-content__catalog-title">报价目录浏览</text>
            <text class="quotation-content__catalog-subtitle">只读查看 · 当前阶段不会加入本机草稿</text>
          </view>
          <AppButton class="quotation-content__catalog-close" variant="text" aria-label="关闭目录" data-testid="quotation-catalog-close" @tap="catalogBrowser.close">关闭</AppButton>
        </view>

        <view v-if="!catalogBrowser.selectedPackageId" class="quotation-content__catalog-browser" data-testid="quotation-catalog-browser">
        <view class="quotation-content__category-grid" data-testid="quotation-catalog-categories">
          <AppButton
            v-for="kind in catalogKinds"
            :key="kind"
            class="quotation-content__category"
            variant="secondary"
            :pressed="catalogBrowser.selectedKind === kind"
            :data-testid="`quotation-catalog-kind-${kind}`"
            @tap="catalogBrowser.selectKind(kind)"
          >{{ composition.catalogKindLabels[kind] }}</AppButton>
        </view>
        <AppLoadingState
          v-if="catalogBrowser.catalogStatesByKind[catalogBrowser.selectedKind] === 'loading'"
          class="quotation-content__catalog-state"
          variant="inline"
          :label="`正在读取${composition.catalogKindLabels[catalogBrowser.selectedKind]}目录`"
        />
        <AppStatus
          v-else-if="catalogBrowser.catalogStatesByKind[catalogBrowser.selectedKind] === 'blocked'"
          class="quotation-content__catalog-state"
          :message="catalogBrowser.listErrorCopyByKind[catalogBrowser.selectedKind] || '当前工单缺少目录适用范围。'"
          tone="warning"
          quiet
        />
        <view
          v-else-if="catalogBrowser.catalogStatesByKind[catalogBrowser.selectedKind] === 'failed_retryable' || catalogBrowser.catalogStatesByKind[catalogBrowser.selectedKind] === 'failed_terminal'"
          class="quotation-content__catalog-state"
          data-testid="quotation-catalog-list-error"
        >
          <AppStatus
            :message="catalogBrowser.listErrorCopyByKind[catalogBrowser.selectedKind] || '目录暂不可用。'"
            tone="warning"
            quiet
          />
          <AppButton
            v-if="catalogBrowser.catalogStatesByKind[catalogBrowser.selectedKind] === 'failed_retryable'"
            variant="secondary"
            block
            data-testid="quotation-catalog-list-retry"
            @tap="catalogBrowser.retryList"
          >重试读取</AppButton>
        </view>
        <AppStatus
          v-else-if="catalogBrowser.catalogStatesByKind[catalogBrowser.selectedKind] === 'succeeded' && catalogBrowser.visibleCatalogItems.length === 0"
          class="quotation-content__catalog-state"
          message="当前适用范围暂无目录项目。"
          tone="neutral"
          quiet
        />
        <scroll-view v-else class="quotation-content__catalog-list" scroll-y data-testid="quotation-catalog-list">
          <view
            v-for="item in catalogBrowser.visibleCatalogItems"
            :key="item.id"
            class="quotation-content__catalog-item"
            :data-testid="`quotation-catalog-item-${item.kind}-${item.id}`"
          >
            <view class="quotation-content__catalog-item-copy">
              <text class="quotation-content__catalog-item-title">{{ item.name }}</text>
              <text class="quotation-content__catalog-item-meta">{{ catalogMetadata(item) }}</text>
            </view>
            <AppButton
              v-if="item.kind === 'package'"
              variant="text"
              :data-testid="`quotation-package-detail-${item.id}`"
              @tap="catalogBrowser.openPackageDetail(item.id)"
            >查看套餐</AppButton>
            <text v-else class="quotation-content__catalog-readonly">只读</text>
          </view>
        </scroll-view>
        </view>

        <scroll-view v-else class="quotation-content__package-detail" scroll-y data-testid="quotation-package-detail">
          <AppButton variant="text" data-testid="quotation-package-detail-back" @tap="catalogBrowser.backToList">返回目录</AppButton>
          <AppLoadingState
            v-if="catalogBrowser.packageDetailState === 'loading'"
            class="quotation-content__catalog-state"
            variant="inline"
            label="正在读取套餐详情"
          />
          <view v-else-if="catalogBrowser.packageDetailState === 'failed_retryable' || catalogBrowser.packageDetailState === 'failed_terminal' || catalogBrowser.packageDetailState === 'blocked'" class="quotation-content__catalog-state" data-testid="quotation-package-detail-error">
            <AppStatus :message="catalogBrowser.packageDetailErrorCopy || '套餐详情暂不可用。'" tone="warning" quiet />
            <AppButton
              v-if="catalogBrowser.packageDetailState === 'failed_retryable'"
              variant="secondary"
              block
              data-testid="quotation-package-detail-retry"
              @tap="catalogBrowser.retryPackageDetail"
            >重试读取</AppButton>
          </view>
          <view v-else-if="catalogBrowser.packageDetail" class="quotation-content__package-detail-content">
            <text class="quotation-content__package-detail-title">{{ catalogBrowser.packageDetail.package.name }}</text>
            <text class="quotation-content__package-detail-note">套餐组成（只读）</text>
            <view class="quotation-content__detail-section" data-testid="quotation-package-procedures">
              <text class="quotation-content__detail-heading">工序</text>
              <text v-if="catalogBrowser.packageDetail.procedures.length === 0" class="quotation-content__empty-section">暂无工序</text>
              <text v-for="(row, index) in catalogBrowser.packageDetail.procedures" :key="row.id || row.referenceId || index" class="quotation-content__detail-row">
                {{ row.item?.name || '工序引用暂不可解析' }}<template v-if="row.unit"> · {{ row.unit }}</template>
              </text>
            </view>
            <view class="quotation-content__detail-section" data-testid="quotation-package-materials">
              <text class="quotation-content__detail-heading">材料 · 按已提供层级</text>
              <view v-for="layer in catalogBrowser.packageMaterialLayers" :key="layer.key" class="quotation-content__layer-group" :data-testid="`quotation-material-layer-${layer.key}`">
                <text class="quotation-content__layer-heading">{{ layer.label }}</text>
                <text v-for="(row, index) in layer.materials" :key="row.id || row.referenceId || index" class="quotation-content__detail-row">
                  {{ row.item?.name || '材料引用暂不可解析' }}<template v-if="row.unit"> · {{ row.unit }}</template>
                </text>
              </view>
              <text v-if="catalogBrowser.packageDetail.materials.length === 0" class="quotation-content__empty-section">暂无材料</text>
            </view>
            <view class="quotation-content__detail-section" data-testid="quotation-package-measures">
              <text class="quotation-content__detail-heading">机措</text>
              <text v-if="catalogBrowser.packageDetail.measures.length === 0" class="quotation-content__empty-section">暂无机措</text>
              <text v-for="(row, index) in catalogBrowser.packageDetail.measures" :key="row.id || row.referenceId || index" class="quotation-content__detail-row">
                {{ row.item?.name || '机措引用暂不可解析' }}<template v-if="row.unit"> · {{ row.unit }}</template>
              </text>
            </view>
          </view>
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
import { quotationCatalogKindLabels } from './catalog'
import { useQuotationCatalogBrowserStore } from './catalog-browser-store'
import type { QuotationLineKind } from './model'
import type { QuotationCatalogItemRead } from '@shared/ports'

defineProps<{
  readonly state: 'loading' | 'ready' | 'blocked' | 'failed_retryable' | 'failed_terminal'
}>()

defineEmits<{
  (event: 'retry'): void
  (event: 'back'): void
}>()

const composition = useQuotationCompositionStore()
const catalogBrowser = useQuotationCatalogBrowserStore()
const catalogKinds: readonly QuotationLineKind[] = ['package', 'procedure', 'material', 'measure']
const canEdit = computed(() => ['fresh', 'restored', 'dirty', 'saving', 'saved_local', 'save_failed'].includes(composition.localState))
const kindLabels = quotationCatalogKindLabels

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

function catalogMetadata(item: QuotationCatalogItemRead): string {
  const parts: string[] = []
  if ((item.kind === 'package' || item.kind === 'material') && item.code) parts.push(`编码：${item.code}`)
  if (item.specification) parts.push(`规格：${item.specification}`)
  if (item.unit) parts.push(`单位：${item.unit}`)
  return parts.length ? parts.join(' · ') : kindLabels[item.kind]
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
.quotation-content__browse-catalog { min-height: 40px; }
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
.quotation-content__catalog-browser { display: flex; flex: 1; flex-direction: column; min-height: 0; }
.quotation-content__catalog-state { margin-top: var(--app-space-md); }
.quotation-content__catalog-list, .quotation-content__package-detail { flex: 1; margin-top: var(--app-space-sm); min-height: 100rpx; }
.quotation-content__package-detail { box-sizing: border-box; }
.quotation-content__catalog-item { align-items: center; background: var(--app-color-surface); border: 1rpx solid var(--app-color-border); border-radius: var(--app-radius-control); box-sizing: border-box; display: flex; justify-content: space-between; margin-bottom: var(--app-space-sm); min-height: 92rpx; padding: var(--app-space-sm) var(--app-space-md); width: 100%; }
.quotation-content__catalog-item-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.quotation-content__catalog-item-title { font-size: var(--app-font-body); font-weight: 700; overflow-wrap: anywhere; }
.quotation-content__catalog-item-meta { color: var(--app-color-text-secondary); font-size: var(--app-font-meta); margin-top: var(--app-space-xs); }
.quotation-content__catalog-readonly { color: var(--app-color-text-muted); flex-shrink: 0; font-size: var(--app-font-meta); margin-left: var(--app-space-sm); }
.quotation-content__package-detail-content { padding: var(--app-space-sm) 0 var(--app-space-lg); }
.quotation-content__package-detail-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-value); font-weight: 800; margin-top: var(--app-space-sm); }
.quotation-content__package-detail-note { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); margin-top: var(--app-space-xs); }
.quotation-content__detail-section { border-top: 1rpx solid var(--app-color-divider); margin-top: var(--app-space-md); padding-top: var(--app-space-md); }
.quotation-content__detail-heading { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-field-label); font-weight: 800; }
.quotation-content__detail-row { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-body); line-height: 1.5; margin-top: var(--app-space-sm); }
.quotation-content__layer-group { background: var(--app-color-surface); border-radius: var(--app-radius-control); margin-top: var(--app-space-sm); padding: var(--app-space-sm); }
.quotation-content__layer-heading { color: var(--app-color-primary); display: block; font-size: var(--app-font-meta); font-weight: 800; }
</style>
