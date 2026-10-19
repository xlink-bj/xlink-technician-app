<template>
  <view class="legal-page">
    <web-view v-if="selectedUrl" :src="selectedUrl" />
    <view v-else class="legal-unavailable" role="alert">协议尚未配置，无法展示</view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { legalLoginPolicies } from '@features/session/login-consent'

const policies = legalLoginPolicies(import.meta.env)
const kind = ref<'privacy' | 'agreement' | null>(null)
const selectedUrl = computed(() =>
  kind.value === 'privacy' ? policies.privacyUrl :
    kind.value === 'agreement' ? policies.agreementUrl : null,
)
onLoad((query) => {
  kind.value = query?.kind === 'privacy' || query?.kind === 'agreement' ? query.kind : null
})
</script>

<style scoped>
.legal-page { min-height: 100vh; background: #fff; }
.legal-unavailable { padding: 48rpx; font-size: 28rpx; color: #b42318; }
</style>
