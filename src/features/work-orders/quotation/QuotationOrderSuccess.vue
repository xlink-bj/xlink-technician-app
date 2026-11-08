<template>
  <view class="app-surface" data-testid="quotation-order-success">
    <AppStatus tone="success" message="订单已提交并完成服务器核对。" />
    <text data-testid="quotation-success-order-id">订单ID：{{ order.id }}</text>
    <text data-testid="quotation-success-amount">订单金额：{{ amount }}</text>
    <text>合同与签约状态仍需单独核验。</text>
    <AppButton block data-testid="quotation-success-open-orders" @tap="$emit('open-order-records')">查看订单与签约进度</AppButton>
  </view>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import type { QuotationOrderRead } from '@shared/ports'
import AppButton from '@shared/ui/AppButton.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
const props = defineProps<{ readonly order: QuotationOrderRead }>()
defineEmits<{ (event: 'open-order-records'): void }>()
const amount = computed(() => typeof props.order.totalPrice === 'number' && Number.isFinite(props.order.totalPrice)
  ? `¥ ${props.order.totalPrice.toFixed(2)}` : '待核验')
</script>
