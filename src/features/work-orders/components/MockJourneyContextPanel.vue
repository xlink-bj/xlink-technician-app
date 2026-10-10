<template>
  <view class="journey-context app-surface" data-testid="mock-journey-context">
    <text class="journey-context__heading">前序信息 · 本机草稿</text>
    <text class="journey-context__notice">仅供当前演示工单核对；未提交后台，不代表业务节点已完成，也不参与报价金额计算。</text>
    <view v-for="section in context.sections" :key="section.stage" class="journey-context__section" :data-testid="`mock-journey-context-${section.stage}`">
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
  </view>
</template>

<script setup lang="ts">
import type { MockJourneyContextSummary } from '@app/mock-journey-context'
defineProps<{ readonly context: MockJourneyContextSummary }>()
</script>

<style scoped>
.journey-context { margin-bottom: 16rpx; padding: 20rpx; display: flex; flex-direction: column; gap: 12rpx; }
.journey-context__heading { font-size: 27rpx; font-weight: 700; color: var(--app-color-text-primary); }
.journey-context__notice { font-size: 21rpx; line-height: 1.5; color: var(--app-color-text-secondary); }
.journey-context__section { border-top: 1rpx solid var(--app-color-border); padding-top: 12rpx; display: flex; flex-direction: column; gap: 8rpx; }
.journey-context__row { display: flex; align-items: flex-start; justify-content: space-between; gap: 20rpx; }
.journey-context__title { color: var(--app-color-text-primary); font-weight: 600; font-size: 24rpx; }
.journey-context__status, .journey-context__label, .journey-context__empty { color: var(--app-color-text-secondary); font-size: 21rpx; }
.journey-context__value { text-align: right; font-size: 22rpx; color: var(--app-color-text-primary); max-width: 66%; overflow-wrap: anywhere; }
</style>
