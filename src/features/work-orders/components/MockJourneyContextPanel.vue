<template>
  <view class="journey-context app-surface" :class="{ 'journey-context--compact': compact, 'journey-context--task-focus': taskFocus, 'journey-context--expanded': expanded }" data-testid="mock-journey-context">
    <view v-if="taskFocus && compact && !expanded" class="journey-context__task-summary" data-testid="mock-survey-quote-suggestion">
      <view class="journey-context__task-info">
        <text v-if="context.suggestion" class="journey-context__focus-suggestion">勘查 · {{ context.suggestion.surveyPathLabel }}</text>
        <text v-else class="journey-context__focus-suggestion">勘查建议未提供</text>
        <text class="journey-context__task-source">本机记录 · 未提交后台</text>
      </view>
      <button v-if="context.suggestion && canAdoptSuggestion" type="button"
        class="journey-context__task-adopt" data-testid="mock-survey-quote-adopt"
        @tap="$emit('adopt-suggestion')">采用建议</button>
      <button class="journey-context__task-detail" data-testid="mock-journey-context-toggle"
        :aria-expanded="false" @tap="expanded = true">详情</button>
    </view>
    <template v-else>
    <view class="journey-context__head">
      <view class="journey-context__head-copy">
        <text class="journey-context__heading">{{ compact ? '前序信息已保留' : '前序信息 · 本机草稿' }}</text>
        <text v-if="compact" class="journey-context__head-hint">仅本机记录 · 未提交后台</text>
      </view>
      <button v-if="compact" class="journey-context__toggle" data-testid="mock-journey-context-toggle"
        :aria-expanded="expanded" @tap="expanded = !expanded">{{ expanded ? '收起' : '查看详情' }}</button>
    </view>
    <text v-if="!compact || expanded" class="journey-context__notice">前序填写内容仅保存在本机，未提交后台。</text>
    <view v-for="section in context.sections" v-show="!compact || expanded" :key="section.stage" class="journey-context__section" :data-testid="`mock-journey-context-${section.stage}`">
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
    <view v-if="context.suggestion" class="journey-context__suggestion" data-testid="mock-survey-quote-suggestion">
      <text v-if="!taskFocus || expanded" class="journey-context__title">勘察维修部位建议 · 待确认</text>
      <text v-if="taskFocus && !expanded" class="journey-context__focus-suggestion">勘察记录 · {{ context.suggestion.surveyPathLabel }} <text class="journey-context__focus-pending">待确认</text></text>
      <text v-if="!taskFocus || expanded" class="journey-context__value-text">勘察记录：{{ context.suggestion.surveyPathLabel }}</text>
      <text v-if="!taskFocus || expanded" class="journey-context__value-text">建议报价一级部位：{{ context.suggestion.targetRepairPartLabel }}</text>
      <text v-if="!compact || expanded" class="journey-context__notice">请核对二级部位、工程量和报价项目；勘察面积不会自动带入报价。</text>
      <AppButton v-if="canAdoptSuggestion" variant="secondary" block data-testid="mock-survey-quote-adopt" @tap="$emit('adopt-suggestion')">{{ taskFocus && !expanded ? '采用建议' : '确认采用一级维修部位' }}</AppButton>
      <text v-else class="journey-context__empty">已有报价部位或目录尚不可用，请手动核对。</text>
      <text v-if="suggestionFeedback" class="journey-context__value-text" data-testid="mock-survey-quote-feedback">{{ suggestionFeedback }}</text>
    </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { MockJourneyContextSummary } from '@app/mock-journey-context'
import AppButton from '@shared/ui/AppButton.vue'
defineProps<{ readonly context: MockJourneyContextSummary; readonly compact?: boolean; readonly taskFocus?: boolean; readonly canAdoptSuggestion?: boolean; readonly suggestionFeedback?: string }>()
const expanded = ref(false)
defineEmits<{ (event: 'adopt-suggestion'): void }>()
</script>

<style scoped>
.journey-context { margin-bottom: 16rpx; padding: 20rpx; display: flex; flex-direction: column; gap: 12rpx; }
.journey-context--compact { padding: 16rpx 20rpx; gap: 8rpx; }
.journey-context__head { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; }
.journey-context__head-copy { display: flex; flex-direction: column; gap: 2rpx; min-width: 0; }
.journey-context__head-hint { color: var(--app-color-text-secondary); font-size: var(--app-font-meta); line-height: 1.4; }
.journey-context__toggle { border: 1rpx solid var(--app-color-primary-border); border-radius: var(--app-radius-control);
  background: var(--app-color-surface); color: var(--app-color-primary); font-size: var(--app-font-body);
  font-weight: 650; min-height: 64rpx; margin: 0; padding: 4rpx 18rpx; line-height: 1.4; white-space: nowrap; }
.journey-context__toggle::after { border: 0; }
.journey-context--compact .journey-context__suggestion { padding-top: 10rpx; gap: 7rpx; }
.journey-context--compact .journey-context__value-text { font-size: var(--app-font-body); }
.journey-context__heading { font-size: 27rpx; font-weight: 700; color: var(--app-color-text-primary); }
.journey-context__notice { font-size: 21rpx; line-height: 1.5; color: var(--app-color-text-secondary); }
.journey-context__section { border-top: 1rpx solid var(--app-color-border); padding-top: 12rpx; display: flex; flex-direction: column; gap: 8rpx; }
.journey-context__row { display: flex; align-items: flex-start; justify-content: space-between; gap: 20rpx; }
.journey-context__title { color: var(--app-color-text-primary); font-weight: 600; font-size: 24rpx; }
.journey-context__status, .journey-context__label, .journey-context__empty { color: var(--app-color-text-secondary); font-size: 21rpx; }
.journey-context__value { text-align: right; font-size: 22rpx; color: var(--app-color-text-primary); max-width: 66%; overflow-wrap: anywhere; }
 .journey-context__suggestion { border-top: 1rpx solid var(--app-color-border); display: flex; flex-direction: column; gap: 9rpx; padding-top: 12rpx; }
.journey-context__value-text { color: var(--app-color-text-primary); font-size: 22rpx; line-height: 1.45; }
/* Only the Quotation task-focus variant is compacted; Survey's accepted panel stays unchanged. */
.journey-context--task-focus { padding: 14rpx 18rpx; gap: 8rpx; border-color: var(--app-color-border); }
.journey-context--task-focus .journey-context__heading { font-size: 23rpx; }
.journey-context--task-focus .journey-context__head-hint { font-size: 20rpx; }
.journey-context--task-focus .journey-context__toggle { min-height: 56rpx; font-size: 23rpx; padding: 3rpx 14rpx; }
.journey-context--task-focus .journey-context__suggestion { padding-top: 10rpx; gap: 8rpx; }
.journey-context__focus-suggestion { color: var(--app-color-text-primary); font-size: 24rpx; font-weight: 750; line-height: 1.4; }
.journey-context__focus-pending { color: var(--app-color-text-secondary); font-weight: 500; font-size: 20rpx; margin-left: 8rpx; }
.journey-context--task-focus .journey-context__suggestion .app-button { min-height: 76rpx; }

/* Quote-only compact source suggestion. The earlier full-width adopt button
 * consumed >120px of the first viewport. Keep the complete survey path,
 * local-only provenance and expand action, but let the actual Q01 form lead. */
.journey-context--task-focus { padding:11px 13px; gap:5px; margin-bottom:9px; border-radius:13px; }
.journey-context--task-focus .journey-context__heading { font-size:13px; line-height:1.35; }
.journey-context--task-focus .journey-context__head-hint { font-size:11px; line-height:1.4; }
.journey-context--task-focus .journey-context__toggle { min-height:44px; font-size:12px; border-radius:9px; padding:3px 10px; }
.journey-context--task-focus:not(.journey-context--expanded) .journey-context__suggestion {
  display:grid; grid-template-columns:minmax(0,1fr) 104px; align-items:center;
  gap:7px; padding-top:8px;
}
.journey-context--task-focus .journey-context__focus-suggestion { font-size:13px; line-height:1.5; }
.journey-context--task-focus .journey-context__focus-pending { font-size:11px; margin-left:5px; }
.journey-context--task-focus:not(.journey-context--expanded) .journey-context__suggestion .app-button {
  min-height:44px; font-size:12px; line-height:1.25; width:104px;
  margin:0; padding:5px; border-radius:9px;
}

/* A genuine task-specific collapsed variant. It replaces the full panel's
   DOM while collapsed instead of hiding important text with grid overflow.
   Expanded Survey provenance and the original S01/S02 UI are unchanged. */
.journey-context--task-focus:not(.journey-context--expanded) {
  padding:9px 11px; margin-bottom:9px; min-height:64px;
  border-radius:12px; box-sizing:border-box;
}
.journey-context__task-summary { display:flex; gap:8px; align-items:center; min-width:0; }
.journey-context__task-info {
  display:flex; flex:1 1 0; flex-direction:column; gap:4px; min-width:0;
}
.journey-context--task-focus .journey-context__task-info .journey-context__focus-suggestion {
  font-size:12.5px; font-weight:730; color:#1c3454; line-height:1.3;
  display:block; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;
}
.journey-context__task-source { font-size:11px; color:#7c8da5; line-height:1.3; }
.journey-context--task-focus .journey-context__task-adopt {
  box-sizing:border-box; width:83px; flex:0 0 83px; height:44px; min-height:44px;
  display:flex; align-items:center; justify-content:center; white-space:nowrap;
  padding:0 5px; margin:0; background:#fff; color:#1677f4; font-weight:700;
  border:1px solid #b5d2ff; border-radius:9px; font-size:12px; line-height:1;
}
.journey-context--task-focus .journey-context__task-adopt::after { border:0; }
.journey-context__task-detail {
  border:0; background:transparent; margin:0; padding:5px 2px;
  color:#1677f4; font-size:12px; font-weight:700;
  flex:0 0 44px; min-height:44px;
}
.journey-context__task-detail::after { border:0; }
</style>
