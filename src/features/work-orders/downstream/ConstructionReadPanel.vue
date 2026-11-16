<template>
 <view class="construction-reader" data-testid="construction-reader">
  <view class="construction-heading"><text class="construction-title">{{ selected ? '日志详情' : '施工日志' }}</text><text class="construction-meta">只读记录</text></view>
  <text class="construction-context">{{ customer }}{{ number ? ` · ${number}` : '' }}</text>
  <text class="construction-notice">仅查看当前工单关联日志，不代表当前施工任务或整单完工状态。</text>
  <view v-if="state==='idle' || state==='loading'" class="construction-state"><text>{{ state==='loading'?'正在读取施工日志…':'施工日志尚未读取' }}</text><AppButton v-if="state==='idle'" variant="secondary" @tap="$emit('retry')">读取施工日志</AppButton></view>
  <view v-else-if="state==='failed'" class="construction-state"><text class="construction-error" data-testid="construction-error">施工日志读取失败，请重试。</text><AppButton variant="secondary" data-testid="construction-retry" @tap="$emit('retry')">重新读取</AppButton></view>
  <view v-else-if="!logs.length" class="construction-state" data-testid="construction-empty"><text class="construction-subtitle">暂无施工日志</text><text class="construction-meta">当前工单尚无可查看的日志记录。</text></view>
  <template v-else>
   <AppButton v-if="selected" variant="text" data-testid="construction-back-list" @tap="selectedId=''">返回日志列表</AppButton>
   <view v-for="log in visibleLogs" :key="log.id" class="app-record-card construction-card" data-testid="construction-log">
    <view class="construction-record-heading"><text class="construction-subtitle">{{ log.repairParts.join('、') || '施工记录' }}</text><text class="construction-meta">{{ log.author }}</text></view>
    <text v-if="log.updatedAt" class="construction-meta">更新于 {{ log.updatedAt }}</text>
    <text v-if="log.orderId" class="construction-order">订单编号 {{ log.orderId }}</text>
    <text v-if="log.createdAt" class="construction-meta">创建于 {{ log.createdAt }}</text>
    <view class="construction-procedures"><text class="construction-label">工序记录</text><view v-for="(content,index) in (selected ? log.procedures : log.procedures.slice(0,1))" :key="index" class="construction-procedure"><text class="construction-index">{{ index+1 }}</text><text>{{ content }}</text></view></view>
    <AppButton v-if="!selected" variant="text" data-testid="construction-open-log" @tap="selectedId=log.id">查看全部 {{ log.procedures.length }} 项工序 ›</AppButton>
   </view>
  </template>
 </view>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { AppButton } from '@shared/ui';
import type { ConstructionLog } from '@shared/construction-read-contract';
const props = defineProps<{
    logs: readonly ConstructionLog[];
    state: 'idle' | 'loading' | 'ready' | 'failed';
    customer: string;
    number?: string;
}>();
defineEmits<{
    retry: [
    ];
}>();
const selectedId = ref(''), selected = computed(() => props.logs.find(log => log.id === selectedId.value));
const visibleLogs = computed(() => selected.value ? [selected.value] : props.logs);
watch(() => props.logs, () => { selectedId.value = ''; });
</script>
<style scoped lang="scss">
@import '@brand-ui/construction-read.scss';
</style>
