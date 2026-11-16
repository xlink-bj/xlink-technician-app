<template>
  <AppLoadingState v-if="session.status === 'unknown'" label="正在准备应用" />
  <view v-else-if="showHome" class="home-page">
    <view class="home-hero">
      <view class="home-hero-circles" aria-hidden="true">
        <view class="home-hero-circle home-hero-circle-large" />
        <view class="home-hero-circle home-hero-circle-small" />
      </view>
      <view class="home-hero-inner">
        <view class="home-brand">
          <text class="home-brand-name">{{ homeBrand.name }}</text>
          <text class="home-brand-tagline">{{ homeBrand.tagline }}</text>
        </view>
        <text class="home-greeting">{{ homeGreeting }}</text>
        <text class="home-subtitle">从当前可见的工单开始今天的工作</text>
      </view>
    </view>

    <view class="home-content">
      <view class="home-surface work-surface">
        <view class="section-heading-row">
          <view class="section-heading-copy">
            <text class="section-title">今日任务</text>
            <text class="section-description">优先处理会影响履约节奏的事项</text>
          </view>
        </view>

        <navigator class="work-orders-entry" :url="workOrdersRoute">
          <view class="work-orders-entry-content">
            <view class="entry-icon" aria-hidden="true">
              <text>工</text>
            </view>
            <view class="entry-copy">
              <text class="entry-title">进入工单</text>
              <text class="entry-subtitle">查看当前可见工单</text>
            </view>
            <text class="entry-arrow" aria-hidden="true">›</text>
          </view>
        </navigator>
      </view>

    </view>

    <view class="home-footer">
      <text class="home-account-label">账号操作</text>
      <button class="secondary" :disabled="isBusy" @tap="logout">
        {{ logoutInFlight ? '退出中…' : '退出登录' }}
      </button>
      <text v-if="feedback" class="feedback">{{ feedback }}</text>
    </view>
  </view>
  <view v-else class="login-page">
    <view v-if="loginStage === 'launch'" class="login-stage launch-stage">
      <view class="brand-lockup">
        <view class="brand-copy">
          <text class="brand-name">{{ homeBrand.name }}</text>
          <text class="brand-tagline">{{ homeBrand.tagline }}</text>
        </view>
      </view>

      <text class="launch-message">让家装服务更专业、更高效</text>

      <view class="worker-scene" aria-hidden="true">
        <view class="scene-building scene-building-left" />
        <view class="scene-building scene-building-right" />
        <view class="scene-roof scene-roof-back" />
        <view class="scene-roof scene-roof-front" />
        <view class="scene-worker">
          <view class="worker-helmet" />
          <view class="worker-head" />
          <view class="worker-body" />
          <view class="worker-shirt" />
          <view class="worker-arm worker-arm-left" />
          <view class="worker-arm worker-arm-right" />
          <view class="worker-leg worker-leg-left" />
          <view class="worker-leg worker-leg-right" />
          <view class="worker-shoe worker-shoe-left" />
          <view class="worker-shoe worker-shoe-right" />
        </view>
      </view>

      <view class="trust-row">
        <view class="trust-item">
          <text class="trust-icon">♢</text>
          <text>专业可靠</text>
        </view>
        <view class="trust-item">
          <text class="trust-icon">◴</text>
          <text>高效便捷</text>
        </view>
        <view class="trust-item">
          <text class="trust-icon">♙</text>
          <text>安全保障</text>
        </view>
      </view>

      <button class="launch-cta" aria-label="进入登录" @tap="goToMethods">
        <text class="submit-label">进入登录</text>
      </button>
    </view>

    <view v-else-if="loginStage === 'methods'" class="login-stage methods-stage">
      <view class="brand-lockup brand-lockup-compact">
        <view class="brand-copy">
          <text class="brand-name">{{ homeBrand.name }}</text>
          <text class="brand-tagline">{{ homeBrand.tagline }}</text>
        </view>
      </view>

      <text class="stage-title">选择登录方式</text>

      <view class="method-list">
        <button class="method-card method-card-active" @tap="selectMethod('verification_code')">
          <text class="method-icon method-icon-blue">▣</text>
          <view class="method-copy">
            <text class="method-title">验证码登录</text>
            <text class="method-subtitle">通过手机号验证登录</text>
          </view>
          <text class="method-badge">推荐</text>
        </button>

        <view class="method-card method-card-disabled" aria-disabled="true">
          <text class="method-icon method-icon-muted">▥</text>
          <view class="method-copy">
            <text class="method-title method-title-muted">密码登录</text>
            <text class="method-subtitle">暂未开放</text>
          </view>
        </view>

        <button
          class="method-card"
          :class="quickLoginAvailable ? 'method-card-active' : 'method-card-disabled'"
          :disabled="!quickLoginAvailable || isBusy"
          :aria-disabled="!quickLoginAvailable"
          @tap="quickLogin"
        >
          <text class="method-icon method-icon-amber">◒</text>
          <view class="method-copy">
            <text class="method-title" :class="{ 'method-title-muted': !quickLoginAvailable }">快捷登录</text>
            <text class="method-subtitle">
              {{ quickLoginSubtitle }}
            </text>
          </view>
          <text v-if="quickLoginAvailable" class="method-badge method-badge-amber">{{ quickLoginBadge }}</text>
        </button>
      </view>

      <text v-if="feedback" class="feedback method-feedback" role="alert">{{ feedback }}</text>

      <text class="policy-note">手机号登录须主动阅读并同意用户协议与隐私政策</text>
      <button class="back-link" @tap="loginStage = 'launch'">返回</button>
    </view>

    <view v-else class="login-stage form-stage">
      <button class="back-button" aria-label="返回登录方式" @tap="loginStage = 'methods'">‹</button>

      <view class="brand-lockup brand-lockup-compact">
        <view class="brand-copy">
          <text class="brand-name">{{ homeBrand.name }}</text>
          <text class="brand-tagline">{{ homeBrand.tagline }}</text>
        </view>
      </view>

      <text class="stage-title">验证码登录</text>
      <text class="form-intro">使用手机号和验证码登录</text>

      <view class="field">
        <text class="label">手机号</text>
        <input
          v-model="phoneNumber"
          data-testid="r1-manual-phone"
          class="input"
          :class="{ 'input--disabled': isBusy }"
          type="text"
          maxlength="11"
          placeholder="请输入手机号"
          :disabled="isBusy"
        />
      </view>

      <view class="field code-field">
        <text class="label">验证码</text>
        <view class="code-input-wrap" :class="{ 'code-input-wrap--disabled': isBusy }">
          <input
            v-model="verificationCode"
            data-testid="r1-manual-code"
            class="code-input"
            type="number"
            maxlength="6"
            placeholder="请输入短信验证码"
            :disabled="isBusy"
          />
          <button class="code-button" disabled>获取验证码</button>
        </view>
        <text class="field-hint">请输入已收到的验证码</text>
      </view>

      <view class="login-consent-panel" data-testid="r1-login-consent">
        <checkbox-group @change="onLoginConsentChange">
          <label class="login-consent-label">
            <checkbox value="accepted" :checked="manualConsent" :disabled="isBusy || !loginPoliciesReady" />
            <text>我已阅读并同意以下协议</text>
          </label>
        </checkbox-group>
        <view class="login-legal-links">
          <navigator v-if="loginPolicies.privacyUrl" class="login-legal-link" url="/pages/legal/legal?kind=privacy">隐私政策</navigator>
          <text v-else class="login-legal-link login-legal-link--disabled">隐私政策</text>
          <navigator v-if="loginPolicies.agreementUrl" class="login-legal-link" url="/pages/legal/legal?kind=agreement">用户协议</navigator>
          <text v-else class="login-legal-link login-legal-link--disabled">用户协议</text>
        </view>
        <text v-if="!loginPoliciesReady" class="login-consent-unavailable">登录协议尚未配置，请联系管理员</text>
      </view>

      <text v-if="feedback" class="feedback" role="alert">{{ feedback }}</text>
      <text v-if="session.status === 'authenticating'" class="in-flight">登录中，请稍候…</text>

      <button
        class="submit"
        :class="{ 'submit--disabled': isBusy }"
        aria-label="登录"
        :disabled="isBusy"
        @tap="submit"
      >
        <text class="submit-label">登录</text>
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { homeBrand } from '@brand-ui/home-brand'
import { setActionWorkspacePageTitle as setHomePageTitle } from '@app/action-page-title'
import { onLoad } from '@dcloudio/uni-app'

import { hasAuthenticatedSession, workOrdersRoute } from '@features/home/access'
import { submitLogin, type LoginSubmissionState } from '@features/session/login'
import {
  legalLoginPolicies, manualLoginConsentIssue, manualLoginConsentMessage,
  submitR1ManualLogin,
} from '@features/session/login-consent'
import { r1ManualLoginIssue, r1ManualLoginIssueText } from '@features/session/r1-manual-login-preflight'
import { resolveQuickLoginInput } from '@features/session/quick-login'
import {
  advanceLoginStage,
  stageForLoginMethod,
  type LoginMethod,
  type LoginStage,
} from '@features/session/login-flow'
import { useSessionStore } from '@shared/state'
import type { OperationError } from '@shared/types'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
import { redirectToIsolatedQaConsole } from '@app/dev-qa-navigation'
import { confirmLogout } from '@app/logout-confirmation'

const session = useSessionStore()
const phoneNumber = ref('')
const verificationCode = ref('')
const manualConsent = ref(false)
const loginPolicies = legalLoginPolicies(import.meta.env)
const loginPoliciesReady = computed(() => Boolean(loginPolicies.privacyUrl && loginPolicies.agreementUrl))
const loginStage = ref<LoginStage>('launch')
const message = ref('')
const logoutInFlight = ref(false)
const submissionState = reactive<LoginSubmissionState>({ inFlight: false })
const homeGreeting = computed(() => {
  const displayName = session.session?.user.displayName?.trim()
  return displayName ? `您好，${displayName}` : '您好'
})
const isBusy = computed(
  () => submissionState.inFlight || logoutInFlight.value || session.status === 'authenticating',
)
const showHome = computed(() => hasAuthenticatedSession(session.status, session.session))
const quickLoginAvailable = computed(() => resolveQuickLoginInput() !== null)
const quickLoginSubtitle = computed(() => {
  if (quickLoginAvailable.value) return '使用已配置的账号继续'
  return '当前未配置快捷登录'
})
const quickLoginBadge = computed(() => '快捷')
const feedback = computed(() => message.value || userFacingLoginMessage(session.error))

// Legacy QA deep links are redirected to a distinct DEV surface. The Home DOM
// remains identical for the same business session, with or without query flags.
onLoad((options) => {
  setHomePageTitle(homeBrand.name)
  if (import.meta.env.DEV && options?.devReview === '1') {
    redirectToIsolatedQaConsole()
  }
})

watch(
  () => session.status,
  (status) => {
    if (status === 'unauthenticated') loginStage.value = 'launch'
  },
)


function goToMethods(): void {
  loginStage.value = advanceLoginStage(loginStage.value)
}

function selectMethod(method: LoginMethod): void {
  const nextStage = stageForLoginMethod(method)
  if (nextStage) loginStage.value = nextStage
}

async function quickLogin(): Promise<void> {
  if (isBusy.value) return
  const input = resolveQuickLoginInput()
  if (!input) {
    message.value = '快捷登录仅在本机开发运行或非生产环境配置后可用'
    return
  }

  message.value = ''
  const result = await submitLogin(input, submissionState, (request) => session.login(request))
  if (result.state !== 'succeeded') message.value = userFacingLoginMessage(result.error)
}

function onLoginConsentChange(event: Event): void {
  const values = (event as Event & { detail?: { value?: string[] } }).detail?.value ?? []
  manualConsent.value = loginPoliciesReady.value && values.includes('accepted')
}

async function submit(): Promise<void> {
  if (isBusy.value) return
  message.value = ''
  const issue = r1ManualLoginIssue({ phoneNumber: phoneNumber.value, verificationCode: verificationCode.value })
  if (issue) {
    message.value = r1ManualLoginIssueText(issue)
    return
  }
  const consentIssue = manualLoginConsentIssue(manualConsent.value, loginPolicies)
  if (consentIssue) {
    message.value = manualLoginConsentMessage(consentIssue)
    return
  }
  const result = await submitR1ManualLogin(
    { phoneNumber: phoneNumber.value, verificationCode: verificationCode.value },
    submissionState,
    manualConsent.value,
    loginPolicies,
    (request) => session.login(request),
  )
  if (result.state === 'succeeded') {
    verificationCode.value = ''
  } else {
    message.value = userFacingLoginMessage(result.error)
  }
}

async function logout(): Promise<void> {
  if (logoutInFlight.value) return
  logoutInFlight.value = true
  message.value = ''
  try {
    if (!await confirmLogout()) return
    const result = await session.endSession()
    if (result.state !== 'succeeded') {
      message.value = userFacingLoginMessage(result.error) || '退出登录失败，请稍后重试'
    }
  } finally {
    logoutInFlight.value = false
  }
}

function userFacingLoginMessage(error: OperationError | null | undefined): string {
  if (!error) return ''
  switch (error.category) {
    case 'validation':
      if (error.message.includes('Phone number')) return '请输入手机号'
      if (error.message.includes('Verification code')) return '请输入验证码'
      return '请检查输入后重试'
    case 'network_retryable':
      return '网络暂时不可用，请稍后重试'
    case 'session_invalid':
      return '登录状态已失效，请重新登录'
    case 'authorization_denied':
      return '当前账号暂无登录权限'
    case 'unsupported_capability':
      return '当前登录方式暂不可用'
    case 'cancelled':
      return '登录已取消'
    case 'server_terminal':
    default:
      return '登录失败，请稍后重试'
  }
}
</script>

<style lang="scss">
@import "@brand-ui/home.scss";
</style>
