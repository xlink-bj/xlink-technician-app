<template>
  <!-- Presentation boundary: all business state, data and validation come from
       the existing QuotationActionContent controller. -->
  <view class="q01-screen xl-craft" data-testid="quotation-first-repair-part-step">
    <AppStatus
      v-if="showDraftNotice"
      class="q01-screen__provenance xl-craft__notice"
      message="报价内容为草稿，通过业务校验并确认提交后才会形成正式订单。"
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
      <view class="q01-screen__field q01-screen__field--first">
        <text class="q01-screen__label xl-craft__label">防水维修部位 <text class="xl-craft__required">*</text></text>
        <view data-testid="quotation-first-step-repair-parts">
          <button
            class="q01-screen__selector xl-craft__control xl-craft__control--selector"
            :class="{ 'q01-screen__control--disabled': !canEdit || options.length === 0, 'q01-screen__control--invalid': Boolean(errors.repairParts) }"
            type="button"
            :disabled="!canEdit || options.length === 0"
            :aria-expanded="pickerOpen"
            :aria-invalid="Boolean(errors.repairParts)"
            data-testid="quotation-first-step-repair-parts-trigger"
            @tap="openPicker"
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
        <QuotationTextField
          multiline
          :is-current="isInputCurrent"
          class="q01-screen__description xl-craft__control xl-craft__control--textarea"
          :class="{ 'q01-screen__control--disabled': !canEdit, 'q01-screen__control--invalid': Boolean(errors.partDescription) }"
          :value="group.partDescription"
          :disabled="!canEdit"
          :aria-invalid="Boolean(errors.partDescription)"
          :maxlength="-1"
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
        <QuotationTextField
          :is-current="isInputCurrent"
          class="q01-screen__quantity xl-craft__control xl-craft__control--input"
          :class="{ 'q01-screen__control--disabled': !canEdit, 'q01-screen__control--invalid': Boolean(errors.maintainAreaNum) }"
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
      <button class="q01-screen__next-tile" :class="{ 'q01-screen__next-tile--disabled': !canEdit || options.length === 0 }" type="button"
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
      <view class="q01-screen__cost-row q01-screen__cost-row--first"><text>折扣</text><text class="q01-screen__cost-value">未设置</text></view>
      <view class="q01-screen__cost-row"><text>优惠金额</text><text class="q01-screen__cost-value">报价规则待核验</text></view>
      <text class="q01-screen__cost-hint">折扣、优惠及增减项应以已验证的业务规则和服务端金额为准。</text>
    </view>
    <view v-if="!props.draftBoundaryProvided" class="q01-screen__disclosure">
      <text class="q01-screen__disclosure-line">订单说明</text>
      <text class="q01-screen__disclosure-line">完成业务校验并主动确认提交后才会创建正式订单，草稿不会自动提交。</text>
    </view>

    <view v-if="pickerOpen" class="q01-screen__overlay"
      data-testid="quotation-repair-part-picker" @tap="cancelPicker">
      <view class="q01-screen__sheet xl-craft__sheet" role="dialog" aria-modal="true"
        aria-label="选择维修部位" @tap.stop>
        <view class="q01-screen__handle" aria-hidden="true" />
        <view class="q01-screen__sheet-head">
          <AppButton variant="text" size="regular"
            data-testid="quotation-repair-part-picker-cancel" @tap="cancelPicker">取消</AppButton>
          <text class="q01-screen__sheet-title xl-craft__sheet-title">选择维修部位</text>
          <AppButton variant="text" size="regular"
            data-testid="quotation-repair-part-picker-done" @tap="confirmPicker">完成</AppButton>
        </view>
        <view class="q01-screen__sheet-content">
          <AppCascadeSelector
            :options="options"
            :model-value="pendingRepairParts"
            :hierarchical="true"
            :test-id="`quotation-repair-part-selector-${group.groupId}`"
            :disabled="!canEdit"
            @update:model-value="pendingRepairParts = [...$event]"
          />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import QuotationTextField from './QuotationTextField.vue'
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
  readonly isInputCurrent?: () => boolean
  readonly showDraftNotice: boolean
  /** The parent workspace renders the same static draft explanation. */
  readonly draftBoundaryProvided?: boolean
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
const pendingRepairParts = ref<readonly string[]>([])

function openPicker(): void {
  if (!props.canEdit || !props.options.length) return
  pendingRepairParts.value = [...props.group.repairParts]
  pickerOpen.value = true
}

function cancelPicker(): void {
  pickerOpen.value = false
  pendingRepairParts.value = []
}

function confirmPicker(): void {
  if (!pickerOpen.value) return
  if (!props.canEdit) return cancelPicker()
  const next = [...pendingRepairParts.value]
  const changed = next.length !== props.group.repairParts.length
    || next.some((part, index) => part !== props.group.repairParts[index])
  // Close before notifying the parent: native MP may deliver the same tap twice.
  // The second delivery must never clear a value committed by the first.
  cancelPicker()
  if (changed) emit('repair-parts-change', [...next])
}

// Never commit a selection prepared for a different quotation group.
watch(() => props.group.groupId, cancelPicker)

</script>

<style lang="scss" scoped>
@use "@brand-ui/quotation-entry";
</style>
