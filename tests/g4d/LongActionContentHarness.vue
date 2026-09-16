<template>
  <!-- Test-only harness: never routed or imported by production pages. -->
  <ActionWorkspaceShell
    customer-name="长内容测试工单"
    display-number="TEST-LONG"
    lifecycle="in_progress"
    draft-status="saved_local"
    :can-submit="true"
    submit-label="继续确认"
  >
    <view class="long-action-content-harness">
      <view v-for="item in longActionContentFixture" :key="item.key" class="long-action-content-harness__item">
        <text>{{ item.label }}</text>
      </view>
    </view>
  </ActionWorkspaceShell>
</template>

<script setup lang="ts">
import ActionWorkspaceShell from '../../src/shared/ui/ActionWorkspaceShell.vue'
import { longActionContentFixture } from './long-action-content.fixture'
</script>

<style>
.long-action-content-harness { background: var(--app-color-surface); padding: var(--app-space-lg); }
.long-action-content-harness__item { border-bottom: 1rpx solid var(--app-color-divider); color: var(--app-color-text-primary); font-size: var(--app-font-body); padding: var(--app-space-md) 0; }
</style>
