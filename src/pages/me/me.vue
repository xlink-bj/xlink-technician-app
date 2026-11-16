<template>
  <AppLoadingState v-if="session.status === 'unknown'" label="正在准备身份信息" />
  <view v-else-if="!canAccess" class="main-guard"><text>登录后查看我的</text>
    <button @tap="openMainRoute('home')">返回登录</button></view>
  <view v-else class="main-page me-page">
    <view class="main-page-intro"><text class="main-eyebrow">当前身份</text>
      <text class="main-title">{{ session.session?.user.displayName || '技术服务人员' }}</text>
      <text class="main-subtitle">{{ session.session?.currentRole?.name || '当前角色未提供名称' }}</text></view>
    <view class="main-list">
      <navigator v-if="policies.agreementUrl" class="main-list-row" url="/pages/legal/legal?kind=agreement">
        <text class="main-row-title">用户协议</text><text class="main-row-arrow">›</text></navigator>
      <navigator v-if="policies.privacyUrl" class="main-list-row" url="/pages/legal/legal?kind=privacy">
        <text class="main-row-title">隐私政策</text><text class="main-row-arrow">›</text></navigator>
      <view class="main-list-row"><text class="main-row-title">版本</text>
        <text class="main-row-summary">0.1.0</text></view>
    </view>
    <button class="main-logout" :disabled="loggingOut" @tap="logout">
      {{ loggingOut ? '退出中…' : '退出登录' }}</button>
    <text v-if="feedback" class="main-error" role="alert">{{ feedback }}</text>
  </view>
  <AppMainNavigation v-if="canAccess" active="me" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { openMainRoute } from '@app/main-navigation'
import { confirmLogout } from '@app/logout-confirmation'
import { hasAuthenticatedSession } from '@features/home/access'
import { legalLoginPolicies } from '@features/session/login-consent'
import { useSessionStore } from '@shared/state'
import AppMainNavigation from '@app/components/AppMainNavigation.vue'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
const session = useSessionStore()
const policies = legalLoginPolicies(import.meta.env)
const canAccess = computed(() => hasAuthenticatedSession(session.status, session.session))
const loggingOut = ref(false)
const feedback = ref('')
async function logout(): Promise<void> {
  if (loggingOut.value) return
  loggingOut.value = true
  feedback.value = ''
  try {
    if (!await confirmLogout()) return
    const result = await session.endSession()
    if (result.state === 'succeeded') await openMainRoute('home')
    else feedback.value = '退出登录失败，请稍后重试'
  } finally { loggingOut.value = false }
}
</script>
<style lang="scss">@import '@brand-ui/main-pages.scss';</style>
