<template>
  <!-- Presentation boundary: all business state, data and validation come from
       the existing QuotationActionContent controller. -->
  <view class="q01-screen" data-testid="quotation-first-repair-part-step">
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

    <view class="q01-screen__stepper" data-testid="quotation-q01-journey" aria-label="报价步骤">
      <view class="q01-screen__step q01-screen__step--active">
        <view class="q01-screen__step-number">1</view><text>维修部位</text>
      </view>
      <view class="q01-screen__step-line" aria-hidden="true" />
      <view class="q01-screen__step">
        <view class="q01-screen__step-number">2</view><text>报价项目</text>
      </view>
      <view class="q01-screen__step-line" aria-hidden="true" />
      <view class="q01-screen__step">
        <view class="q01-screen__step-number">3</view><text>确认订单</text>
      </view>
    </view>

    <view class="q01-screen__heading">
      <text class="q01-screen__eyebrow">报价编辑 · 第一步</text>
      <text class="q01-screen__title" data-testid="q01-design-title">维修部位信息</text>
      <text class="q01-screen__subtitle">完善维修位置与现场情况，随后添加报价项目</text>
    </view>

    <view class="q01-screen__form" :data-testid="`quotation-repair-group-${group.groupId}`">
      <view class="q01-screen__field">
        <text class="q01-screen__label">防水维修部位 <text class="q01-screen__required">*</text></text>
        <view data-testid="quotation-first-step-repair-parts">
          <button
            class="q01-screen__selector"
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
          <text v-if="errors.repairParts" class="q01-screen__error" role="alert"
            data-testid="quotation-first-step-repair-parts-error">{{ errors.repairParts }}</text>
          <text v-else class="q01-screen__empty-error" data-testid="quotation-first-step-repair-parts-error"></text>
          <text v-if="group.repairParts.length" class="q01-screen__selected-path"
            data-testid="quotation-first-step-selected-path">已选择：{{ repairPartsLabel }}</text>
        </view>
      </view>

      <view class="q01-screen__field">
        <text class="q01-screen__label">维修部位描述 <text class="q01-screen__required">*</text></text>
        <textarea
          class="q01-screen__description"
          :value="group.partDescription"
          :disabled="!canEdit"
          :aria-invalid="Boolean(errors.partDescription)"
          maxlength="-1"
          placeholder="请描述具体的渗漏或维修情况"
          data-testid="quotation-first-step-description"
          @input="emit('description-input', $event)"
        />
        <text v-if="errors.partDescription" class="q01-screen__error" role="alert"
          data-testid="quotation-first-step-description-error">{{ errors.partDescription }}</text>
        <text v-else class="q01-screen__empty-error" data-testid="quotation-first-step-description-error"></text>
      </view>

      <view class="q01-screen__field">
        <text class="q01-screen__label">工程量 <text class="q01-screen__required">*</text></text>
        <input
          class="q01-screen__quantity"
          type="digit"
          :value="group.maintainAreaNum"
          :disabled="!canEdit"
          :aria-invalid="Boolean(errors.maintainAreaNum)"
          placeholder="填写工程量"
          data-testid="quotation-first-step-quantity"
          @input="emit('quantity-input', $event)"
        />
        <text class="q01-screen__hint">实际计量单位以所选产品及报价规则为准</text>
        <text v-if="errors.maintainAreaNum" class="q01-screen__error" role="alert"
          data-testid="quotation-first-step-quantity-error">{{ errors.maintainAreaNum }}</text>
        <text v-else class="q01-screen__empty-error" data-testid="quotation-first-step-quantity-error"></text>
      </view>
    </view>

    <view class="q01-screen__next" data-testid="quotation-first-step-product-action">
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

    <view class="q01-screen__cost" data-testid="quotation-cost-adjustments">
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
      <view class="q01-screen__sheet" role="dialog" aria-modal="true"
        aria-label="选择维修部位" @tap.stop>
        <view class="q01-screen__handle" aria-hidden="true" />
        <view class="q01-screen__sheet-head">
          <AppButton variant="text" size="regular"
            data-testid="quotation-repair-part-picker-cancel" @tap="pickerOpen = false">取消</AppButton>
          <text class="q01-screen__sheet-title">选择维修部位</text>
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
import { ref } from 'vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import AppButton from '@shared/ui/AppButton.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppCascadeSelector from '@shared/ui/AppCascadeSelector.vue'
import type { CodeOptionRead } from '@shared/ports'
import type { QuotationGroup } from './model'

defineProps<{
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
</script>

<style scoped>
.q01-screen {
  --q01-ink: var(--app-text-strong);
  --q01-muted: var(--app-content-muted-ink);
  --q01-blue: var(--app-color-primary-action);
  --q01-line: var(--app-outline-control);
  --q01-subtle: var(--app-outline-subtle);
  --q01-white: var(--app-surface-raised);
  --q01-soft: var(--app-surface-muted);
  box-sizing: border-box; width: 100%; min-width: 0; padding-bottom: 28px;
  color: var(--q01-ink);
}
.q01-screen__provenance { margin: 1px 0 5px; }
.q01-screen__stepper {
  box-sizing: border-box; width: 100%; display: flex;
  align-items: flex-start; padding: 19px 16px 20px;
}
.q01-screen__step {
  color: var(--q01-muted); display: flex; flex-direction: column; align-items: center;
  justify-content: flex-start; flex: 0 0 77px; gap: 8px;
  font-size: 12px; font-weight: 580; white-space: nowrap;
}
.q01-screen__step--active { color: var(--q01-blue); font-weight: 730; }
.q01-screen__step-number {
  box-sizing: border-box; width: 31px; height: 31px;
  display: flex; justify-content: center; align-items: center;
  border: 1px solid var(--q01-line); border-radius: 50%;
  background: var(--q01-white); color: var(--q01-muted);
  font-size: 13px; font-weight: 700; line-height: 1;
}
.q01-screen__step--active .q01-screen__step-number {
  background: var(--q01-blue); border-color: var(--q01-blue); color: white;
}
.q01-screen__step-line {
  flex: 1 1 0; min-width: 6px; height: 1px; margin-top: 15px;
  background: var(--q01-line);
}
.q01-screen__heading {
  display: flex; flex-direction: column; gap: 6px;
  padding: 13px 3px 18px;
}
.q01-screen__eyebrow {
  color: var(--q01-muted); font-size: 12px; font-weight: 610; line-height: 1.5;
}
.q01-screen__title {
  color: var(--q01-ink); font-size: 25px; font-weight: 780;
  letter-spacing: -.45px; line-height: 1.25;
}
.q01-screen__subtitle {
  color: var(--q01-muted); font-size: 13px; line-height: 1.5;
}
.q01-screen__form {
  display: flex; flex-direction: column; box-sizing: border-box;
  width: 100%; padding: 7px 17px 22px;
  background: var(--q01-white); border: 1px solid var(--q01-subtle);
  border-radius: 19px; box-shadow: var(--app-content-card-elevation);
}
.q01-screen__field { display: flex; flex-direction: column; min-width: 0; padding-top: 19px; }
.q01-screen__label {
  font-size: 15px; color: var(--q01-ink); font-weight: 720;
  line-height: 1.4; margin-bottom: 11px;
}
.q01-screen__required { color: var(--app-color-danger); }
.q01-screen__selector {
  width: 100%; min-height: 68px; margin: 0;
  border: 1px solid var(--q01-line); border-radius: 13px;
  padding: 10px 14px; display: flex; align-items: center;
  gap: 10px; background: var(--q01-soft); text-align: left; box-sizing: border-box;
}
.q01-screen__selector::after { border: 0; }
.q01-screen__selector:disabled, .q01-screen__next-tile:disabled { opacity: .6; }
.q01-screen__selector-glyph {
  background: var(--q01-white); border-radius: 11px;
  width: 42px; height: 42px; display: flex;
  justify-content: center; align-items: center; flex: 0 0 42px;
}
.q01-screen__selector-copy { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.q01-screen__selector-title {
  font-size: 15px; color: var(--q01-blue); font-weight: 710;
  overflow-wrap: anywhere; line-height: 1.35;
}
.q01-screen__selector-detail { font-size: 12px; color: var(--q01-muted); line-height: 1.3; }
.q01-screen__selected-path, .q01-screen__hint {
  display: block; margin-top: 7px; font-size: 12px;
  color: var(--q01-muted); line-height: 1.5;
}
.q01-screen__state { margin-top: 9px; }
.q01-screen__description, .q01-screen__quantity {
  box-sizing: border-box; width: 100%; min-width: 0;
  border: 1px solid var(--q01-line); border-radius: 13px;
  background: var(--q01-white); color: var(--q01-ink);
  padding: 13px 15px; margin: 0;
  font-size: 16px; line-height: 1.5; outline: 0;
}
.q01-screen__description { height: 103px; min-height: 103px; }
.q01-screen__quantity { height: 56px; min-height: 56px; font-weight: 590; }
.q01-screen__description:focus, .q01-screen__quantity:focus {
  border-color: var(--q01-blue);
}
.q01-screen__description[aria-invalid="true"], .q01-screen__quantity[aria-invalid="true"],
.q01-screen__selector[aria-invalid="true"] { border-color: var(--app-color-danger); }
.q01-screen__error {
  color: var(--app-color-danger); font-size: 12px; line-height: 1.5; margin-top: 8px;
}
.q01-screen__empty-error { display: none; }
.q01-screen__next, .q01-screen__cost {
  box-sizing: border-box; width: 100%; background: var(--q01-white);
  border: 1px solid var(--q01-subtle); border-radius: 17px;
  margin-top: 14px; padding: 17px;
}
.q01-screen__next-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; }
.q01-screen__next-title { font-size: 17px; font-weight: 740; color: var(--q01-ink); }
.q01-screen__next-eyebrow { font-size: 12px; color: var(--q01-muted); }
.q01-screen__next-tile {
  min-height: 68px; display: flex; align-items: center;
  background: var(--q01-soft); border: 1px solid var(--q01-line);
  border-radius: 13px; padding: 12px 15px; width: 100%; text-align: left;
}
.q01-screen__next-tile::after { border: 0; }
.q01-screen__next-copy { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.q01-screen__next-name { font-size: 15px; font-weight: 690; color: var(--q01-blue); }
.q01-screen__next-detail { font-size: 12px; color: var(--q01-muted); }
.q01-screen__cost-row {
  display: flex; justify-content: space-between; align-items: center;
  border-top: 1px solid var(--q01-subtle); padding: 12px 0;
  gap: 12px; font-size: 13px;
}
.q01-screen__cost-row:first-of-type { margin-top: 10px; }
.q01-screen__cost-row text:last-child { color: var(--q01-muted); }
.q01-screen__cost-hint, .q01-screen__disclosure {
  color: var(--q01-muted); line-height: 1.6; font-size: 12px;
}
.q01-screen__cost-hint { display: block; margin-top: 4px; }
.q01-screen__disclosure { display: flex; flex-direction: column; gap: 4px; margin: 16px 4px 0; }
.q01-screen__disclosure text:first-child { color: var(--q01-ink); font-weight: 650; }
.q01-screen__overlay {
  position: fixed; inset: 0; z-index: 1200; display: flex;
  flex-direction: column; justify-content: flex-end;
  background: rgba(16, 31, 53, .38);
}
.q01-screen__sheet {
  display: flex; flex-direction: column; width: 100%; max-height: 78vh;
  overflow: hidden; background: var(--q01-white);
  border-radius: 22px 22px 0 0;
  padding: 8px 16px calc(24px + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.q01-screen__handle {
  width: 36px; height: 4px; flex: 0 0 4px;
  align-self: center; border-radius: 100px; margin-bottom: 9px;
  background: var(--q01-line);
}
.q01-screen__sheet-head {
  display: flex; align-items: center; justify-content: space-between;
  min-height: 52px; border-bottom: 1px solid var(--q01-subtle);
}
.q01-screen__sheet-title { font-size: 16px; color: var(--q01-ink); font-weight: 730; }
.q01-screen__sheet-content {
  flex: 1; min-height: 0; overflow-y: auto; padding: 12px 0 10px;
}
@media (max-width: 360px) {
  .q01-screen__stepper { padding-left: 7px; padding-right: 7px; }
  .q01-screen__step { flex-basis: 73px; font-size: 11px; }
  .q01-screen__heading { padding-left: 1px; padding-right: 1px; }
  .q01-screen__form { padding-left: 14px; padding-right: 14px; }
  .q01-screen__title { font-size: 23px; }
}
</style>
