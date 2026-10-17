<template>
  <!-- Presentation boundary: all business state, data and validation come from
       the existing QuotationActionContent controller. -->
  <view class="q01-screen xl-craft" data-testid="quotation-first-repair-part-step">
    <AppStatus
      v-if="showDraftNotice"
      class="q01-screen__provenance"
      :message="productReviewOnly
        ? '演示数据仅保存在本机；正式报价订单提交已关闭。'
        : '当前为本机报价草稿；校验并提交后才会创建正式订单。'"
      variant="strip"
      icon="warning"
      quiet
      data-testid="quotation-first-step-draft-notice"
    />

    <view class="q01-screen__progress" data-testid="quotation-q01-journey" aria-label="报价步骤">
      <view class="xl-craft__progress-labels">
        <text class="q01-screen__progress-label">报价进度</text>
        <text class="q01-screen__progress-index">01 / 03</text>
      </view>
      <view class="xl-craft__progress-track" aria-hidden="true">
        <view class="is-active" /><view /><view />
      </view>
    </view>
    <AppCraftHeading class="q01-screen__heading" title="填写维修部位"
      subtitle="记录本次维修的现场情况，再添加报价项目">
      <template #title><text class="q01-screen__title" data-testid="q01-design-title">填写维修部位</text></template>
    </AppCraftHeading>

    <view class="q01-screen__form" :data-testid="`quotation-repair-group-${group.groupId}`">
      <view class="q01-screen__field">
        <text class="q01-screen__label xl-craft__label">防水维修部位 <text class="xl-craft__required">*</text></text>
        <view data-testid="quotation-first-step-repair-parts">
          <button
            class="q01-screen__selector xl-craft__control xl-craft__control--selector"
            type="button"
            :disabled="!canEdit || options.length === 0"
            :aria-expanded="pickerOpen"
            :aria-invalid="Boolean(errors.repairParts)"
            data-testid="quotation-first-step-repair-parts-trigger"
            @tap="pickerOpen = true"
          >
            <view class="q01-screen__selector-glyph" aria-hidden="true">
              <AppIcon name="location" :size="20" color="var(--app-color-primary-action)" />
            </view>
            <view class="q01-screen__selector-copy">
              <text class="q01-screen__selector-title">{{ repairPartsLabel || '请选择维修部位' }}</text>
              <text class="q01-screen__selector-detail">{{ group.repairParts.length ? '已选择维修部位' : '选择具体维修位置' }}</text>
            </view>
            <AppIcon name="chevron-right" :size="18" color="var(--app-content-muted-ink)" />
          </button>
          <AppStatus v-if="options.length === 0"
            class="q01-screen__state"
            message="维修部位选项暂不可用；无法安全进入商品目录。"
            tone="warning" quiet
            data-testid="quotation-first-step-options-unavailable"
          />
          <text v-if="errors.repairParts" class="xl-craft__error" role="alert"
            data-testid="quotation-first-step-repair-parts-error">{{ errors.repairParts }}</text>
          <text v-else class="q01-screen__empty-error" data-testid="quotation-first-step-repair-parts-error"></text>
          <text v-if="group.repairParts.length" class="q01-screen__selected-path"
            data-testid="quotation-first-step-selected-path">已选择：{{ repairPartsLabel }}</text>
        </view>
      </view>

      <view class="q01-screen__field">
        <text class="q01-screen__label xl-craft__label">维修部位描述 <text class="xl-craft__required">*</text></text>
        <textarea
          class="q01-screen__description xl-craft__control xl-craft__control--textarea"
          :value="group.partDescription"
          :disabled="!canEdit"
          :aria-invalid="Boolean(errors.partDescription)"
          maxlength="-1"
          placeholder="请描述具体的渗漏或维修情况"
          data-testid="quotation-first-step-description"
          @input="emit('description-input', $event)"
        />
        <text v-if="errors.partDescription" class="xl-craft__error" role="alert"
          data-testid="quotation-first-step-description-error">{{ errors.partDescription }}</text>
        <text v-else class="q01-screen__empty-error" data-testid="quotation-first-step-description-error"></text>
      </view>

      <view class="q01-screen__field">
        <text class="q01-screen__label xl-craft__label">工程量 <text class="xl-craft__required">*</text></text>
        <input
          class="q01-screen__quantity xl-craft__control xl-craft__control--input"
          type="digit"
          :value="group.maintainAreaNum"
          :disabled="!canEdit"
          :aria-invalid="Boolean(errors.maintainAreaNum)"
          placeholder="填写工程量"
          data-testid="quotation-first-step-quantity"
          @input="emit('quantity-input', $event)"
        />
        <text class="xl-craft__hint">实际计量单位以所选产品及报价规则为准</text>
        <text v-if="errors.maintainAreaNum" class="xl-craft__error" role="alert"
          data-testid="quotation-first-step-quantity-error">{{ errors.maintainAreaNum }}</text>
        <text v-else class="q01-screen__empty-error" data-testid="quotation-first-step-quantity-error"></text>
      </view>
    </view>

    <view class="q01-screen__next xl-craft__surface xl-craft__surface--flat" data-testid="quotation-first-step-product-action">
      <view class="q01-screen__next-header">
        <text class="q01-screen__next-title">报价项目</text>
        <text class="q01-screen__next-eyebrow">下一步</text>
      </view>
      <button class="q01-screen__next-tile" type="button"
        :disabled="!canEdit || options.length === 0"
        data-testid="quotation-first-step-select-products"
        @tap="emit('select-products')">
        <view class="q01-screen__next-copy">
          <text class="q01-screen__next-name">添加报价项目</text>
          <text class="q01-screen__next-detail">套餐、工序、材料、机措</text>
        </view>
        <AppIcon name="chevron-right" :size="18" color="var(--app-color-primary-action)" />
      </button>
    </view>

    <view class="q01-screen__cost xl-craft__surface xl-craft__surface--flat" data-testid="quotation-cost-adjustments">
      <text class="q01-screen__next-title">费用与优惠</text>
      <view class="q01-screen__cost-row"><text>折扣</text><text>未设置</text></view>
      <view class="q01-screen__cost-row"><text>优惠金额</text><text>报价规则待核验</text></view>
      <text class="q01-screen__cost-hint">折扣、优惠及增减项应以已验证的业务规则和服务端金额为准。</text>
    </view>
    <view class="q01-screen__disclosure">
      <text>订单说明</text>
      <text>完成业务校验并主动提交后才会创建正式订单，本机草稿不会自动提交。</text>
    </view>

    <view v-if="pickerOpen" class="q01-screen__overlay"
      data-testid="quotation-repair-part-picker" @tap="pickerOpen = false">
      <view class="q01-screen__sheet xl-craft__sheet" role="dialog" aria-modal="true"
        aria-label="选择维修部位" @tap.stop>
        <view class="q01-screen__handle" aria-hidden="true" />
        <view class="q01-screen__sheet-head">
          <AppButton variant="text" size="regular"
            data-testid="quotation-repair-part-picker-cancel" @tap="pickerOpen = false">取消</AppButton>
          <text class="q01-screen__sheet-title xl-craft__sheet-title">选择维修部位</text>
          <AppButton variant="text" size="regular"
            data-testid="quotation-repair-part-picker-done" @tap="pickerOpen = false">完成</AppButton>
        </view>
        <view class="q01-screen__sheet-content">
          <AppCascadeSelector
            :options="options"
            :model-value="group.repairParts"
            :hierarchical="true"
            :test-id="`quotation-repair-part-selector-${group.groupId}`"
            :disabled="!canEdit"
            @update:model-value="emit('repair-parts-change', $event)"
          />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import AppButton from '@shared/ui/AppButton.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppCascadeSelector from '@shared/ui/AppCascadeSelector.vue'
import AppCraftHeading from '@shared/ui/AppCraftHeading.vue'
import type { CodeOptionRead } from '@shared/ports'
import type { QuotationGroup } from './model'

const props = defineProps<{
  readonly group: QuotationGroup
  readonly options: readonly CodeOptionRead[]
  readonly canEdit: boolean
  readonly showDraftNotice: boolean
  readonly productReviewOnly?: boolean
  readonly repairPartsLabel: string
  readonly errors: Readonly<{
    repairParts: string
    partDescription: string
    maintainAreaNum: string
  }>
}>()

const emit = defineEmits<{
  (event: 'repair-parts-change', path: readonly string[]): void
  (event: 'description-input', rawEvent: unknown): void
  (event: 'quantity-input', rawEvent: unknown): void
  (event: 'select-products'): void
}>()
const pickerOpen = ref(false)
watch(() => props.group.repairParts, (path) => {
  if (path.length) pickerOpen.value = false
}, { deep: true })

</script>

<style scoped>
/* Page only owns composition; typography, shape and controls are shared. */
.q01-screen { width: 100%; min-width: 0; padding-bottom: 25px; }
.q01-screen__provenance { margin: 0 0 3px; }
.q01-screen__progress { margin-top: 19px; }
.q01-screen__progress-label { color: var(--xl-secondary); font-size: 11px; font-weight: 600; }
.q01-screen__progress-index { color: var(--xl-blue); font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
.q01-screen__heading { margin-top: 20px; }
.q01-screen__form { display: flex; flex-direction: column; margin-top: 21px; }
.q01-screen__field { display: flex; flex-direction: column; min-width: 0; margin-top: 21px; }
.q01-screen__field:first-child { margin-top: 0; }
.q01-screen__label { margin-bottom: 10px; }
.q01-screen__selector { margin: 0; text-align: left; justify-content: space-between; }
.q01-screen__selector::after { border: 0; }
.q01-screen__selector-glyph { flex: 0 0 21px; display: flex; align-items: center; justify-content: center; }
.q01-screen__selector-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.q01-screen__selector-title { color: #315e9b; font-size: 14px; font-weight: 600; line-height: 22px; }
.q01-screen__selector-detail { color: var(--xl-caption); font-size: 11px; line-height: 17px; }
.q01-screen__selected-path { display: block; margin-top: 8px; color: var(--xl-secondary); font-size: 12px; line-height: 18px; }
.q01-screen__state { margin-top: 9px; }
.q01-screen__empty-error { display: none; }
.q01-screen__next, .q01-screen__cost { margin-top: 20px; padding: 16px; }
.q01-screen__next-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
.q01-screen__next-title { color: var(--xl-ink); font-size: 16px; font-weight: 600; }
.q01-screen__next-eyebrow { color: var(--xl-caption); font-size: 11px; }
.q01-screen__next-tile {
  display: flex; align-items: center; gap: 10px;
  width: 100%; min-height: 60px; padding: 12px 15px; margin: 0;
  border: 1px solid var(--xl-stroke); border-radius: var(--xl-radius-control);
  background: var(--xl-field-bg); text-align: left;
}
.q01-screen__next-tile::after { border: 0; }
.q01-screen__next-tile:disabled { opacity: .6; }
.q01-screen__next-copy { display: flex; flex: 1; flex-direction: column; gap: 3px; }
.q01-screen__next-name { color: var(--xl-blue); font-size: 14px; font-weight: 600; }
.q01-screen__next-detail { color: var(--xl-caption); font-size: 11px; }
.q01-screen__cost-row { display: flex; justify-content: space-between; gap: 12px; padding: 12px 0; border-top: 1px solid var(--xl-divider); font-size: 13px; }
.q01-screen__cost-row:first-of-type { margin-top: 9px; }
.q01-screen__cost-row text:last-child { color: var(--xl-caption); }
.q01-screen__cost-hint, .q01-screen__disclosure { display: block; color: var(--xl-caption); font-size: 11px; line-height: 17px; }
.q01-screen__disclosure { margin: 15px 3px 0; }
.q01-screen__disclosure text { display: block; }
.q01-screen__overlay { position: fixed; inset: 0; z-index: 1200; display: flex; flex-direction: column; justify-content: flex-end; background: rgba(16,31,53,.38); }
.q01-screen__sheet { display: flex; flex-direction: column; width: 100%; max-height: 78vh; overflow: hidden; padding: 8px 16px calc(24px + env(safe-area-inset-bottom)); }
.q01-screen__handle { width: 36px; height: 4px; flex: 0 0 4px; align-self: center; margin-bottom: 9px; background: var(--xl-stroke); border-radius: 100px; }
.q01-screen__sheet-head { display: flex; align-items: center; justify-content: space-between; min-height: 52px; border-bottom: 1px solid var(--xl-divider); }
.q01-screen__sheet-content { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 0 10px; }
</style>
