<template>
  <!-- Deterministic REVIEW FIXTURE: real shared components, no app state or API. -->
  <AppVisualScope mode="craft">
    <view class="craft-review" data-testid="ds07-craft-matrix">
      <view class="craft-review__group" data-testid="ds07-craft-buttons">
        <text class="craft-review__heading">01 / Actions · 44px+</text>
        <AppButton block data-testid="ds07-craft-primary" @tap="tapCount += 1">保存并继续</AppButton>
        <view class="craft-review__row">
          <AppButton variant="secondary" data-testid="ds07-craft-secondary">取消</AppButton>
          <AppButton variant="text">查看详情</AppButton>
        </view>
        <view class="craft-review__row">
          <AppButton data-testid="ds07-craft-button-disabled" disabled>不可操作</AppButton>
          <AppButton data-testid="ds07-craft-button-loading" loading>处理中</AppButton>
        </view>
        <AppButton block pressed>按下反馈</AppButton>
        <text class="craft-review__counter" data-testid="ds07-craft-tap-count">{{ tapCount }}</text>
      </view>

      <view class="craft-review__group" data-testid="ds07-craft-fields">
        <text class="craft-review__heading">02 / Form · One visual owner</text>
        <AppField label="默认输入" required><AppInput data-testid="ds07-craft-input" placeholder="请填写维修部位" /></AppField>
        <AppField label="已填写"><AppInput model-value="屋面维修" /></AppField>
        <AppField label="只读"><AppInput model-value="已归档记录" read-only /></AppField>
        <AppField label="不可用"><AppInput model-value="无权限编辑" disabled /></AppField>
        <AppField label="校验失败" error="请检查输入" required>
          <AppInput data-testid="ds07-craft-input-error" placeholder="请检查输入" error />
        </AppField>
        <AppField label="维修说明" supporting="填写现场可验证的信息">
          <AppTextarea data-testid="ds07-craft-textarea" :auto-height="false" placeholder="填写维修情况" />
        </AppField>
      </view>

      <view class="craft-review__group" data-testid="ds07-craft-selection">
        <text class="craft-review__heading">03 / Selection · truth-owned by caller</text>
        <AppSelector data-testid="ds07-craft-selector" placeholder="选择维修部位" @tap="selectorTapCount += 1" />
        <AppSelector selected value="已选择屋面" />
        <AppSelector read-only selected value="只读选择结果" />
        <AppSelector disabled value="暂不可选" />
        <AppSelector error placeholder="必选项未填" />
        <text class="craft-review__counter" data-testid="ds07-craft-selector-taps">{{ selectorTapCount }}</text>
      </view>

      <view class="craft-review__group" data-testid="ds07-craft-status">
        <text class="craft-review__heading">04 / Status · caller-provided facts</text>
        <AppStatus message="正在等待处理" variant="strip" />
        <AppStatus message="数据已保存" tone="success" variant="strip" />
        <AppStatus message="请核对当前内容" tone="warning" variant="strip" />
        <AppStatus message="校验未通过" tone="danger" variant="strip" />
      </view>

      <view class="craft-review__group" data-testid="ds07-craft-records">
        <text class="craft-review__heading">05 / Record · shared surface material</text>
        <AppRecordCard class="craft-review__record" data-testid="ds07-craft-record">
          <text class="craft-review__record-title">示例工单</text>
          <text class="craft-review__record-meta">仅展示视觉、无业务提交</text>
        </AppRecordCard>
      </view>

      <view class="craft-review__group" data-testid="ds07-craft-actionbar-group">
        <text class="craft-review__heading">06 / Action bar · source-owned action</text>
        <AppActionBar preview layout="dual" label="共享操作栏视觉示例" data-testid="ds07-craft-actionbar">
          <AppButton variant="secondary">返回</AppButton>
          <AppButton>下一步</AppButton>
        </AppActionBar>
      </view>
    </view>
  </AppVisualScope>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import AppVisualScope from '@shared/ui/AppVisualScope.vue'
import AppButton from '@shared/ui/AppButton.vue'
import AppField from '@shared/ui/AppField.vue'
import AppInput from '@shared/ui/AppInput.vue'
import AppTextarea from '@shared/ui/AppTextarea.vue'
import AppSelector from '@shared/ui/AppSelector.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import AppRecordCard from '@shared/ui/AppRecordCard.vue'
import AppActionBar from '@shared/ui/AppActionBar.vue'

const tapCount = ref(0)
const selectorTapCount = ref(0)
</script>
<style scoped>
/* Gallery layout only. No material, brand, typography or component restyling. */
.craft-review { display: flex; flex-direction: column; gap: 24px; padding: 2px; }
.craft-review__group { display: flex; flex-direction: column; gap: 11px; min-width: 0; }
.craft-review__heading { font-size: 12px; font-weight: 600; color: var(--app-craft-secondary); }
.craft-review__row { display: flex; align-items: stretch; flex-wrap: wrap; gap: 10px; }
.craft-review__row > .app-button { flex: 1 1 125px; }
.craft-review__counter { font-size: 12px; color: var(--app-craft-caption); }
.craft-review__record { padding: 17px; display: flex; flex-direction: column; gap: 6px; }
.craft-review__record-title { font-size: 15px; color: var(--app-craft-ink); font-weight: 600; }
.craft-review__record-meta { font-size: 12px; color: var(--app-craft-caption); }
</style>
