<template>
  <view
    class="journey-context app-surface"
    :class="{ 'journey-context--compact': compactQuote && !expanded }"
    data-testid="mock-journey-context"
  >
    <view class="journey-context__header">
      <view class="journey-context__header-copy">
        <text class="journey-context__heading">{{ compactQuote ? '前序记录 · 本机草稿' : '前序信息 · 本机草稿' }}</text>
        <text v-if="compactQuote" class="journey-context__summary" data-testid="mock-journey-context-summary">{{ progressSummary }}</text>
      </view>
      <AppButton
        v-if="compactQuote"
        class="journey-context__toggle"
        variant="text"
        :pressed="expanded"
        data-testid="mock-journey-context-toggle"
        @tap="expanded = !expanded"
      >{{ expanded ? '收起详情' : '查看详情' }}</AppButton>
    </view>
    <template v-if="!compactQuote || expanded">
      <text class="journey-context__notice">仅供当前演示工单核对；未提交后台，不代表业务节点已完成，也不参与报价金额计算。</text>
      <view
        v-for="section in context.sections"
        :key="section.stage"
        class="journey-context__section"
        :data-testid="`mock-journey-context-${section.stage}`"
      >
        <view class="journey-context__row">
          <text class="journey-context__title">{{ section.title }}</text>
          <text class="journey-context__status">{{ section.state === 'saved_local' ? '本机已保存' : section.state === 'read_failed' ? '读取失败' : '尚无本机记录' }}</text>
        </view>
        <template v-if="section.state === 'saved_local'">
          <view v-for="line in section.lines" :key="line.label" class="journey-context__row">
            <text class="journey-context__label">{{ line.label }}</text>
            <text class="journey-context__value">{{ line.value }}</text>
          </view>
          <text v-if="section.lines.length === 0" class="journey-context__empty">草稿已保存，尚未填写可展示的关键字段</text>
        </template>
        <text v-else class="journey-context__empty">{{ section.state === 'read_failed' ? '无法核对当前阶段的本机记录' : '该阶段尚无已保存的填写内容' }}</text>
      </view>
    </template>
    <view v-if="context.suggestion" class="journey-context__suggestion" data-testid="mock-survey-quote-suggestion">
      <template v-if="suggestionFeedback">
        <text class="journey-context__title">维修部位建议 · 已处理</text>
        <text class="journey-context__value-text" data-testid="mock-survey-quote-feedback">{{ suggestionFeedback }}</text>
      </template>
      <template v-else>
        <text class="journey-context__title">勘察维修部位建议 · 待确认</text>
        <text class="journey-context__value-text">勘察：{{ context.suggestion.surveyPathLabel }}</text>
        <text class="journey-context__value-text">建议报价一级部位：{{ context.suggestion.targetRepairPartLabel }}</text>
        <text class="journey-context__notice">仅建议一级部位；二级部位、工程量、项目和金额不自动复制。</text>
        <AppButton
          v-if="canAdoptSuggestion"
          variant="secondary"
          block
          data-testid="mock-survey-quote-adopt"
          @tap="$emit('adopt-suggestion')"
        >确认采用一级维修部位</AppButton>
        <text v-else class="journey-context__empty">当前报价已有部位或目录不可用，请人工核对，不会覆盖草稿。</text>
      </template>
    </view>
    <text v-else-if="compactQuote && !expanded" class="journey-context__compact-note">仅本机记录，未提交后台 · 报价工程量须单独核对</text>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MockJourneyContextSummary } from '@app/mock-journey-context'
import AppButton from '@shared/ui/AppButton.vue'

const props = defineProps<{
  readonly context: MockJourneyContextSummary
  readonly compactQuote?: boolean
  readonly canAdoptSuggestion?: boolean
  readonly suggestionFeedback?: string
}>()
defineEmits<{ (event: 'adopt-suggestion'): void }>()

// Local disclosure only. No storage, draft mutation or implicit quote adoption.
const expanded = ref(false)
const progressSummary = computed(() => props.context.sections.map((section) => {
  const state = section.state === 'saved_local' ? '已记录'
    : section.state === 'read_failed' ? '读取失败' : '未记录'
  return `${section.title} ${state}`
}).join(' · '))
</script>

<style scoped>
.journey-context { margin-bottom: 16rpx; padding: 20rpx; display: flex; flex-direction: column; gap: 12rpx; }
.journey-context--compact { gap: 10rpx; }
.journey-context__header { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; }
.journey-context__header-copy { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 6rpx; }
.journey-context__heading { font-size: 27rpx; font-weight: 700; color: var(--app-color-text-primary); }
.journey-context__summary { font-size: 21rpx; line-height: 1.45; color: var(--app-color-text-secondary); }
.journey-context__toggle { flex-shrink: 0; }
.journey-context__notice, .journey-context__compact-note { font-size: 21rpx; line-height: 1.5; color: var(--app-color-text-secondary); }
.journey-context__section { border-top: 1rpx solid var(--app-color-border); padding-top: 12rpx; display: flex; flex-direction: column; gap: 8rpx; }
.journey-context__row { display: flex; align-items: flex-start; justify-content: space-between; gap: 20rpx; }
.journey-context__title { color: var(--app-color-text-primary); font-weight: 600; font-size: 24rpx; }
.journey-context__status, .journey-context__label, .journey-context__empty { color: var(--app-color-text-secondary); font-size: 21rpx; }
.journey-context__value { text-align: right; font-size: 22rpx; color: var(--app-color-text-primary); max-width: 66%; overflow-wrap: anywhere; }
.journey-context__suggestion { border-top: 1rpx solid var(--app-color-border); display: flex; flex-direction: column; gap: 8rpx; padding-top: 12rpx; }
.journey-context__value-text { color: var(--app-color-text-primary); font-size: 22rpx; line-height: 1.45; }
</style>
