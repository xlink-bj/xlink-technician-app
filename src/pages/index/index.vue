<template>
  <view v-if="session.status === 'unknown'" class="loading-page">
    <text class="eyebrow">Technician App</text>
    <text class="title">Preparing secure session</text>
    <text class="subtitle">Checking for an existing session…</text>
  </view>
  <view v-else-if="session.status === 'authenticated'" class="landing-page">
    <text class="eyebrow">Authenticated App</text>
    <text class="title">XLink Technician</text>
    <text class="subtitle">Welcome{{ session.session?.user.displayName ? `, ${session.session.user.displayName}` : '' }}.</text>
  </view>
  <view v-else class="login-page">
    <view class="login-card">
      <text class="eyebrow">Technician App</text>
      <text class="title">Sign in</text>
      <text class="subtitle">Use your phone number and verification code.</text>

      <view class="field">
        <text class="label">Phone number</text>
        <input
          v-model="phoneNumber"
          class="input"
          type="text"
          maxlength="32"
          placeholder="Phone number"
          :disabled="isBusy"
        />
      </view>

      <view class="field">
        <text class="label">Verification code</text>
        <input
          v-model="verificationCode"
          class="input"
          type="number"
          maxlength="16"
          placeholder="Verification code"
          :disabled="isBusy"
        />
      </view>

      <button class="submit" :disabled="isBusy" @tap="submit">
        {{ isBusy ? 'Signing in…' : 'Sign in' }}
      </button>

      <text v-if="feedback" class="feedback">{{ feedback }}</text>
      <text v-if="session.status === 'authenticating'" class="feedback">Checking your session…</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import { submitLogin, type LoginSubmissionState } from '@features/session/login'
import { useSessionStore } from '@shared/state'

const session = useSessionStore()
const phoneNumber = ref('')
const verificationCode = ref('')
const message = ref('')
const submissionState = reactive<LoginSubmissionState>({ inFlight: false })
const isBusy = computed(() => submissionState.inFlight || session.status === 'authenticating')
const feedback = computed(() => message.value || session.error?.message || '')

async function submit(): Promise<void> {
  message.value = ''
  const result = await submitLogin(
    { phoneNumber: phoneNumber.value, verificationCode: verificationCode.value },
    submissionState,
    (request) => session.login(request),
  )
  if (result.state === 'succeeded') {
    verificationCode.value = ''
  } else {
    message.value = result.error?.message ?? 'Unable to sign in'
  }
}
</script>

<style>
.login-page,
.loading-page,
.landing-page {
  align-items: center;
  background: #f5f7fb;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  min-height: 100vh;
  padding: 32rpx;
}

.login-card {
  background: #ffffff;
  border-radius: 24rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  max-width: 680rpx;
  padding: 48rpx;
  width: 100%;
}

.landing-page {
  flex-direction: column;
}

.loading-page {
  flex-direction: column;
}

.eyebrow,
.label {
  color: #667085;
  font-size: 26rpx;
}

.title {
  color: #101828;
  font-size: 52rpx;
  font-weight: 700;
}

.subtitle {
  color: #667085;
  font-size: 30rpx;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.input {
  border: 1rpx solid #d0d5dd;
  border-radius: 12rpx;
  box-sizing: border-box;
  font-size: 32rpx;
  min-height: 88rpx;
  padding: 20rpx;
  width: 100%;
}

.submit {
  background: #155eef;
  border-radius: 12rpx;
  color: #ffffff;
  font-size: 32rpx;
  margin-top: 12rpx;
}

.submit[disabled] {
  opacity: 0.55;
}

.feedback {
  color: #b42318;
  font-size: 26rpx;
}
</style>
