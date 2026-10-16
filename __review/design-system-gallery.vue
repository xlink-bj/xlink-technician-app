<template>
  <view class="gallery-page" data-testid="design-system-gallery">
    <view class="gallery-header">
      <text class="gallery-eyebrow">APP UI DESIGN SYSTEM v1 · DS-01 Foundation</text>
      <text class="gallery-title">共享移动组件 Gallery</text>
      <text class="gallery-subtitle">H5_VISUAL_PROXY · DESIGN_SYSTEM_REVIEW · 仅使用真实共享组件与确定性展示夹具</text>
    </view>

    <view class="gallery-notice" data-testid="gallery-notice">
      <text>这是开发评审基础设施，不是产品页面；不登录、不连接 API、不使用业务数据、不执行写操作。</text>
    </view>

    <view class="gallery-sections">
      <view
        v-for="section in designSystemSections"
        :id="section.id"
        :key="section.id"
        class="gallery-section"
        :data-testid="`gallery-section-${section.id}`"
      >
        <view class="gallery-section-heading">
          <text class="gallery-section-index">{{ section.id.slice(0, 2) }}</text>
          <text class="gallery-section-title">{{ section.title }}</text>
        </view>

        <view
          v-for="example in section.examples"
          :key="example.id"
          class="gallery-example app-surface"
          :data-testid="`gallery-example-${example.id}`"
        >
          <view class="gallery-example-heading">
            <view>
              <text class="gallery-example-title">{{ example.title }}</text>
              <text class="gallery-example-state">{{ example.state }}</text>
            </view>
            <text class="gallery-example-note">{{ example.note }}</text>
          </view>

          <view class="gallery-example-render" :data-testid="`gallery-render-${example.id}`">
            <template v-if="example.kind === 'foundations'">
              <view class="foundation-grid">
                <view v-for="color in foundationColors" :key="color.name" class="foundation-color">
                  <view class="foundation-color__swatch" :style="{ background: color.value }" />
                  <text class="foundation-color__name">{{ color.name }}</text>
                  <text class="foundation-color__value">{{ color.value }}</text>
                </view>
              </view>
              <view class="foundation-spacing">
                <view v-for="space in foundationSpacing" :key="space.name" class="foundation-spacing__row">
                  <text>{{ space.name }}</text><view class="foundation-spacing__bar" :style="{ width: space.width }" /><text>{{ space.label }}</text>
                </view>
              </view>
              <view class="foundation-radii">
                <view v-for="radius in foundationRadii" :key="radius.name" class="foundation-radius">
                  <view class="foundation-radius__sample" :style="{ borderRadius: radius.value }" />
                  <text>{{ radius.name }} · {{ radius.label }}</text>
                </view>
              </view>
              <view class="foundation-type">
                <text class="gallery-major-title">页面标题</text>
                <text class="gallery-section-demo-title">区块标题</text>
                <text class="gallery-body-copy">正文与说明文字保持舒适的阅读层级。</text>
                <text class="gallery-meta-copy">辅助信息 / 状态时间</text>
              </view>
            </template>

            <template v-else-if="example.kind === 'buttons'">
              <view class="gallery-commercial-master" data-testid="ds011-button-master">
                <view class="gallery-commercial-master__heading">
                  <text class="gallery-commercial-master__eyebrow">XLINK / BUTTON VISUAL MASTER 1.1</text>
                  <text class="gallery-commercial-master__title">成熟的操作层级</text>
                  <text class="gallery-commercial-master__description">以一眼可辨的主次关系、稳定的布局和真实触控反馈构建商业级按钮。</text>
                </view>
                <view class="gallery-commercial-matrix" data-testid="ds01-button-matrix">
                  <view class="gallery-commercial-column" data-testid="ds011-primary-column">
                    <text class="gallery-commercial-column__title">Primary</text>
                    <text class="gallery-commercial-column__sub">最重要的下一步</text>
                    <AppButton data-testid="ds01-button-primary" shape="pill" block @tap="reviewTapCount += 1">确认操作</AppButton>
                    <AppButton elevated shape="pill" block>强调操作</AppButton>
                    <AppButton data-testid="ds01-button-disabled" shape="pill" block disabled @tap="reviewTapCount += 100">不可操作</AppButton>
                    <AppButton shape="pill" block pressed>按下反馈</AppButton>
                    <AppButton data-testid="ds01-button-loading" shape="pill" block loading @tap="reviewTapCount += 100">提交中…</AppButton>
                  </view>
                  <view class="gallery-commercial-column" data-testid="ds011-secondary-column">
                    <text class="gallery-commercial-column__title">Secondary</text>
                    <text class="gallery-commercial-column__sub">轻量的备选操作</text>
                    <AppButton data-testid="ds01-button-secondary" variant="secondary" shape="pill" block>返回修改</AppButton>
                    <AppButton elevated variant="secondary" shape="pill" block>查看记录</AppButton>
                    <AppButton variant="secondary" shape="pill" block disabled>暂不可用</AppButton>
                    <AppButton variant="secondary" shape="pill" block pressed>按下反馈</AppButton>
                    <AppButton variant="secondary" shape="pill" block loading>准备中…</AppButton>
                  </view>
                  <view class="gallery-commercial-column" data-testid="ds011-tertiary-column">
                    <text class="gallery-commercial-column__title">Tertiary</text>
                    <text class="gallery-commercial-column__sub">不打断流程的操作</text>
                    <AppButton data-testid="ds011-button-tertiary" variant="tertiary" shape="pill" block>+ 添加项目</AppButton>
                    <AppButton data-testid="ds01-button-text" variant="text" block>查看帮助</AppButton>
                    <AppButton variant="tertiary" block disabled>不可用</AppButton>
                    <AppButton variant="tertiary" block pressed>按下反馈</AppButton>
                    <AppButton variant="tertiary" block loading>读取中…</AppButton>
                  </view>
                  <view class="gallery-commercial-column" data-testid="ds011-ghost-column">
                    <text class="gallery-commercial-column__title">Ghost</text>
                    <text class="gallery-commercial-column__sub">浅色表面上的轮廓操作</text>
                    <AppButton data-testid="ds011-button-ghost" variant="ghost" shape="pill" block>查看详情</AppButton>
                    <AppButton variant="ghost" shape="pill" block elevated>打开选择</AppButton>
                    <AppButton variant="ghost" shape="pill" block disabled>暂不可用</AppButton>
                    <AppButton variant="ghost" shape="pill" block pressed>按下反馈</AppButton>
                    <AppButton variant="ghost" shape="pill" block loading>处理中…</AppButton>
                  </view>
                </view>
                <view class="gallery-commercial-sizes">
                  <text class="gallery-commercial-sizes__title">Size / Content resilience</text>
                  <view class="gallery-commercial-sizes__row">
                    <AppButton data-testid="ds01-button-compact" size="compact">紧凑操作</AppButton>
                    <AppButton size="regular">标准操作</AppButton>
                    <AppButton data-testid="ds01-button-large" size="large">重要操作</AppButton>
                  </view>
                  <AppButton data-testid="ds01-button-long" variant="secondary" block>这是需要完整显示的较长中文操作名称</AppButton>
                  <AppButton data-testid="ds01-button-leading" variant="ghost" aria-label="查看示例">
                    <template #leading><AppIcon name="home" :size="16" /></template>带图标操作
                  </AppButton>
                  <text data-testid="ds01-button-tap-count" class="gallery-meta-copy">{{ reviewTapCount }}</text>
                </view>
              </view>
            </template>

            <template v-else-if="example.kind === 'fields'">
              <AppField label="普通字段"><AppInput placeholder="请输入内容" /></AppField>
              <AppField label="必填字段" required><AppInput placeholder="必填内容" /></AppField>
              <AppField label="备注" optional supporting="可填写现场补充说明"><AppInput model-value="已填写内容" /></AppField>
              <AppField label="校验错误" required error="请补充该字段"><AppInput error placeholder="需要修正" /></AppField>
              <AppField label="只读字段"><AppInput model-value="只读值" read-only /></AppField>
            </template>

            <template v-else-if="example.kind === 'inputs'">
              <view class="gallery-control-stack">
                <AppInput data-testid="gallery-input-empty" placeholder="空值输入" />
                <view class="gallery-stack-gap"><AppInput model-value="已填写的单行内容" /></view>
                <view class="gallery-stack-gap"><AppInput model-value="只读内容" read-only /></view>
                <view class="gallery-stack-gap"><AppInput model-value="不可编辑内容" disabled /></view>
                <view class="gallery-stack-gap"><AppInput model-value="错误内容" error /></view>
              </view>
            </template>

            <template v-else-if="example.kind === 'textarea'">
              <view class="gallery-control-stack">
                <AppTextarea data-testid="gallery-textarea-empty" placeholder="请填写多行内容" />
                <view class="gallery-stack-gap"><AppTextarea data-testid="gallery-textarea-populated" model-value="第一行现场记录\n第二行补充说明\n第三行可继续增长" /></view>
                <view class="gallery-stack-gap"><AppTextarea model-value="只读多行内容" read-only /></view>
                <view class="gallery-stack-gap"><AppTextarea model-value="需要修正的多行内容" error /></view>
              </view>
            </template>

            <template v-else-if="example.kind === 'selection'">
              <AppField label="选择器">
                <view class="gallery-control-stack">
                  <AppSelector placeholder="请选择" />
                  <view class="gallery-stack-gap"><AppSelector selected value="已选择" /></view>
                  <view class="gallery-stack-gap"><AppSelector selected value="不可更改" disabled /></view>
                  <view class="gallery-stack-gap"><AppSelector error placeholder="请选择有效值" /></view>
                </view>
              </AppField>
              <AppField label="单选">
                <AppChoiceGroup :options="choiceOptions" model-value="" />
                <AppChoiceGroup class="gallery-selection-group" :options="choiceOptions" model-value="confirmed" />
                <AppChoiceGroup class="gallery-selection-group" :options="choiceOptions" model-value="confirmed" disabled />
              </AppField>
              <AppField label="多选">
                <AppMultiChoiceGroup :options="multiChoiceOptions" :model-value="[]" />
                <AppMultiChoiceGroup :options="multiChoiceOptions" :model-value="multiSelected" />
              </AppField>
              <AppField label="平级级联">
                <AppCascadeSelector :options="cascadeOptions" :model-value="flatCascadeValue" />
              </AppField>
              <AppField label="层级级联">
                <AppCascadeSelector :options="cascadeOptions" :model-value="hierarchicalCascadeValue" hierarchical />
              </AppField>
            </template>

            <template v-else-if="example.kind === 'feedback'">
              <view class="gallery-status-stack">
                <AppStatus message="普通提示" />
                <view class="gallery-stack-gap"><AppStatus message="操作已保存" tone="success" icon="complete" /></view>
                <view class="gallery-stack-gap"><AppStatus message="请检查输入" tone="warning" icon="warning" /></view>
                <view class="gallery-stack-gap"><AppStatus message="操作失败，请稍后重试" tone="danger" icon="warning" /></view>
                <view class="gallery-stack-gap"><AppStatus message="成功状态条" tone="success" variant="strip" icon="complete" /></view>
                <view class="gallery-stack-gap"><AppStatus message="警告状态条" tone="warning" variant="strip" icon="warning" /></view>
              </view>
              <view class="gallery-information-stack">
                <AppInformationRow data-testid="gallery-information-normal"><template #label>状态</template><template #value>已完成</template></AppInformationRow>
                <view class="gallery-stack-gap"><AppInformationRow data-testid="gallery-information-long"><template #label>长文本</template><template #value>演示区域的一段较长说明文字，用于验证中文长文本换行与信息行的视觉稳定性。</template></AppInformationRow></view>
              </view>
            </template>

            <template v-else-if="example.kind === 'patterns'">
              <view class="pattern-stack">
                <view class="pattern-block">
                  <text class="pattern-title">Media Uploader · SHARED_PATTERN</text>
                  <view class="gallery-media-pattern">
                    <view class="gallery-media-pattern__tile"><text>本地照片</text></view>
                    <view class="gallery-media-pattern__tile gallery-media-pattern__tile--active"><text>已上传</text></view>
                    <view class="gallery-media-pattern__copy"><AppStatus message="本地已保存，等待上传" /><AppButton variant="secondary">继续处理</AppButton></view>
                  </view>
                </view>
                <view class="pattern-block pattern-block--separated">
                  <text class="pattern-title">Gap / Separator · SHARED_PATTERN</text>
                  <view class="gallery-gap-pattern"><view /><text>分组分隔</text><view /></view>
                </view>
                <view class="pattern-block pattern-block--separated">
                  <text class="pattern-title">Bottom Sheet · SHARED_PATTERN</text>
                  <AppButton variant="secondary" @tap="bottomSheetOpen = true">打开通用视觉示例</AppButton>
                  <view class="gallery-sheet-preview" data-testid="gallery-bottom-sheet-preview">
                    <view class="gallery-sheet-preview__handle" />
                    <text class="pattern-title">选择一个通用选项</text>
                    <AppChoiceGroup :options="sheetOptions" model-value="" />
                  </view>
                </view>
                <view class="pattern-block pattern-block--separated">
                  <text class="pattern-title">Tree Multi Select · SHARED_PATTERN</text>
                  <AppTreeMultiChoiceGroup :options="treeOptions" :model-value="treeSelected" />
                </view>
                <view class="pattern-block pattern-block--separated">
                  <text class="pattern-title">Hierarchical Cascade · SHARED_PATTERN</text>
                  <AppCascadeSelector :options="cascadeOptions" :model-value="hierarchicalCascadeValue" hierarchical />
                </view>
              </view>
            </template>

            <template v-else-if="example.kind === 'action-bar'">
              <view class="gallery-action-stack">
                <view class="gallery-action-single">
                  <text class="pattern-title">Single action</text>
                  <AppActionBar preview label="单操作演示">
                    <AppButton data-testid="ds01-action-single" block>继续</AppButton>
                  </AppActionBar>
                </view>
                <view class="gallery-action-stack__separated">
                  <text class="pattern-title">Dual action · secondary first</text>
                  <AppActionBar layout="dual" preview label="双操作演示" data-testid="ds01-action-dual">
                    <AppButton data-testid="ds01-action-secondary" variant="secondary">返回修改</AppButton>
                    <AppButton data-testid="ds01-action-primary">确认提交</AppButton>
                  </AppActionBar>
                </view>
                <view class="gallery-action-stack__separated">
                  <text class="pattern-title">Split bar · secondary left, primary right</text>
                  <AppActionBar preview layout="split" elevated label="分布式操作演示" data-testid="ds011-action-split">
                    <AppButton data-testid="ds011-action-split-secondary" variant="ghost">返回</AppButton>
                    <AppButton data-testid="ds011-action-split-primary">确认下一步</AppButton>
                  </AppActionBar>
                </view>
                <view class="gallery-action-stack__separated">
                  <text class="pattern-title">Trailing bar · compact modal actions</text>
                  <AppActionBar preview layout="trailing" label="弹层操作演示" data-testid="ds011-action-trailing">
                    <AppButton variant="secondary">取消</AppButton>
                    <AppButton>保存修改</AppButton>
                  </AppActionBar>
                </view>
                <view class="gallery-action-stack__separated" data-testid="ds011-feedback-master">
                  <text class="pattern-title">Feedback · server-derived status only</text>
                  <view class="gallery-feedback-states">
                    <AppActionFeedback state="busy" label="提交中，请稍候" data-testid="ds011-feedback-busy" />
                    <AppActionFeedback state="success" label="已确认提交" data-testid="ds011-feedback-success" />
                    <AppActionFeedback state="error" label="提交未完成，请重试" data-testid="ds011-feedback-error" />
                  </view>
                  <text class="gallery-feedback-caution">以上均为 Gallery 演示状态。正式业务必须等待服务端确认，不自动切换至成功。</text>
                </view>
                <view data-testid="gallery-action-state-unsaved" class="gallery-action-state gallery-action-stack__separated">
                  <text class="pattern-title">Unsaved</text>
                  <ActionWorkspaceFormActions lifecycle="in_progress" save-state="not_saved" :can-submit="false" submit-label="完成勘查" />
                </view>
                <view data-testid="gallery-action-state-saving" class="gallery-action-state gallery-action-stack__separated">
                  <text class="pattern-title">Saving</text>
                  <ActionWorkspaceFormActions lifecycle="in_progress" save-state="saving" :can-submit="false" submit-label="完成勘查" />
                </view>
                <view data-testid="gallery-action-state-saved" class="gallery-action-state gallery-action-stack__separated">
                  <text class="pattern-title">Saved</text>
                  <ActionWorkspaceFormActions lifecycle="in_progress" save-state="saved" :can-submit="true" submit-label="完成勘查" />
                </view>
                <view data-testid="gallery-action-state-submitting" class="gallery-action-state gallery-action-stack__separated">
                  <text class="pattern-title">Submitting</text>
                  <ActionWorkspaceFormActions lifecycle="submitting" save-state="saved" :can-submit="true" submit-label="完成勘查" />
                </view>
              </view>
            </template>
          </view>
        </view>
      </view>
    </view>

    <view v-if="bottomSheetOpen" class="gallery-sheet-overlay" data-testid="gallery-bottom-sheet" role="dialog" aria-label="通用视觉示例">
      <view class="gallery-sheet-backdrop" @tap="bottomSheetOpen = false" />
      <view class="gallery-sheet">
        <view class="gallery-sheet__handle" />
        <text class="gallery-sheet__title">通用视觉示例</text>
        <text class="gallery-sheet__copy">只展示共享交互语法，不承载业务 Provider。</text>
        <AppChoiceGroup :options="sheetOptions" model-value="" />
        <AppButton block @tap="bottomSheetOpen = false">完成选择</AppButton>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import AppButton from '@shared/ui/AppButton.vue'
import AppActionBar from '@shared/ui/AppActionBar.vue'
import AppActionFeedback from '@shared/ui/AppActionFeedback.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppCascadeSelector from '@shared/ui/AppCascadeSelector.vue'
import AppChoiceGroup from '@shared/ui/AppChoiceGroup.vue'
import AppField from '@shared/ui/AppField.vue'
import AppInformationRow from '@shared/ui/AppInformationRow.vue'
import AppInput from '@shared/ui/AppInput.vue'
import AppMultiChoiceGroup from '@shared/ui/AppMultiChoiceGroup.vue'
import AppSelector from '@shared/ui/AppSelector.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import AppTextarea from '@shared/ui/AppTextarea.vue'
import AppTreeMultiChoiceGroup from '@shared/ui/AppTreeMultiChoiceGroup.vue'
import ActionWorkspaceFormActions from '@shared/ui/ActionWorkspaceFormActions.vue'
import { designSystemSections } from './design-system-gallery-fixtures'

const reviewTapCount = ref(0)

const foundationColors = [
  { name: 'primary', value: '#2878f2' },
  { name: 'page', value: '#f3f6fa' },
  { name: 'surface', value: '#ffffff' },
  { name: 'success', value: '#18ae65' },
  { name: 'warning', value: '#bf7b16' },
  { name: 'danger', value: '#f06445' },
]

const foundationSpacing = [
  { name: 'xs', label: '8rpx', width: '8rpx' },
  { name: 'sm', label: '12rpx', width: '12rpx' },
  { name: 'md', label: '16rpx', width: '16rpx' },
  { name: 'lg', label: '24rpx', width: '24rpx' },
  { name: 'xl', label: '32rpx', width: '32rpx' },
]
const foundationRadii = [
  { name: 'control', label: '14rpx', value: '14rpx' },
  { name: 'surface', label: '20rpx', value: '20rpx' },
  { name: 'card', label: '24rpx', value: '24rpx' },
]

const choiceOptions = [
  { value: 'confirmed', label: '已确认' },
  { value: 'pending', label: '通用中文选项的较长展示文本' },
]
const multiChoiceOptions = [
  { value: 'one', label: '选项一' },
  { value: 'two', label: '选项二' },
  { value: 'three', label: '选项三' },
]
const multiSelected = ['one', 'three']
const sheetOptions = [
  { value: 'a', label: '通用选项 A' },
  { value: 'b', label: '通用选项 B' },
]
const cascadeOptions = [
  { value: 'group-a', label: '类别 A', children: [{ value: 'a1', label: '选项 A1' }, { value: 'a2', label: '选项 A2' }] },
  { value: 'group-b', label: '类别 B', children: [{ value: 'b1', label: '选项 B1' }, { value: 'b2', label: '选项 B2' }] },
  { value: 'other', label: '其他类别' },
]
const flatCascadeValue: readonly string[] = []
const hierarchicalCascadeValue: readonly string[] = ['group-a', 'a1']
const treeOptions = [
  { value: 'group-a', label: '通用分组 A', children: [{ value: 'a1', label: '子选项 A1' }, { value: 'a2', label: '子选项 A2' }] },
  { value: 'group-b', label: '通用分组 B', children: [{ value: 'b1', label: '子选项 B1' }, { value: 'b2', label: '子选项 B2' }] },
]
const treeSelected = ['a1']
const bottomSheetOpen = ref(false)
</script>

<style>
html, body, #app { background: var(--app-color-page); margin: 0; min-height: 100%; }
body { color: var(--app-color-text-primary); font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
view, scroll-view { display: block; }
text { display: inline; }
/* Review typography only; do NOT override uni-icons' embedded icon font. */
.gallery-page { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", Arial, sans-serif; }
.gallery-title, .gallery-section-title, .gallery-example-title, .pattern-title,
.gallery-eyebrow, .gallery-example-state, .gallery-example-note {
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
}
.gallery-page { box-sizing: border-box; margin: 0 auto; max-width: 960rpx; min-height: 100vh; overflow-x: hidden; padding: 24rpx 24rpx 64rpx; width: 100%; }
.gallery-header { padding: 12rpx 4rpx 24rpx; }
.gallery-eyebrow { color: var(--app-color-primary); display: block; font-size: var(--app-font-meta); font-weight: 800; letter-spacing: 1rpx; }
.gallery-title { color: var(--app-color-text-primary); display: block; font-size: 40rpx; font-weight: 800; margin-top: 8rpx; }
.gallery-subtitle { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); line-height: 1.5; margin-top: 8rpx; }
.gallery-notice { background: var(--app-color-primary-soft); border: 1rpx solid var(--app-color-primary-border); border-radius: var(--app-radius-control); color: var(--app-color-primary); font-size: var(--app-font-meta); line-height: 1.6; padding: 16rpx 20rpx; }
.gallery-section { margin-top: 36rpx; }
.gallery-section-heading { align-items: center; display: flex; gap: 12rpx; margin-bottom: 14rpx; }
.gallery-section-index { align-items: center; background: var(--app-color-primary); border-radius: 999rpx; color: var(--app-color-surface); display: inline-flex; font-size: var(--app-font-meta); font-weight: 800; height: 40rpx; justify-content: center; width: 40rpx; }
.gallery-section-title { color: var(--app-color-text-primary); font-size: var(--app-font-section-title); font-weight: 800; }
.gallery-example { margin-top: 14rpx; overflow: hidden; padding: 24rpx; }
.gallery-example-heading { border-bottom: 1rpx solid var(--app-color-divider); padding-bottom: 16rpx; }
.gallery-example-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-body); font-weight: 800; }
.gallery-example-state, .gallery-example-note { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); line-height: 1.5; margin-top: 6rpx; }
.gallery-example-note { color: var(--app-color-text-body); }
.gallery-example-render { min-width: 0; padding-top: 4rpx; }
.foundation-grid { display: grid; gap: 12rpx; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 20rpx; }
.foundation-color { min-width: 0; }
.foundation-color__swatch { border: 1rpx solid var(--app-color-border); border-radius: var(--app-radius-control); height: 56rpx; }
.foundation-color__name, .foundation-color__value { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); margin-top: 6rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.foundation-color__value { color: var(--app-color-text-muted); font-size: 18rpx; }
.foundation-spacing { border-top: 1rpx solid var(--app-color-divider); margin-top: 20rpx; padding-top: 16rpx; }
.foundation-spacing__row { align-items: center; color: var(--app-color-text-secondary); display: flex; font-size: var(--app-font-meta); gap: 12rpx; margin-top: 10rpx; }
.foundation-spacing__row text:first-child { width: 44rpx; }
.foundation-spacing__row text:last-child { width: 64rpx; }
.foundation-spacing__bar { background: var(--app-color-primary); border-radius: 999rpx; height: 14rpx; }
.foundation-radii { border-top: 1rpx solid var(--app-color-divider); display: grid; gap: 12rpx; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 20rpx; padding-top: 16rpx; }
.foundation-radius { color: var(--app-color-text-secondary); font-size: var(--app-font-meta); min-width: 0; }
.foundation-radius__sample { background: var(--app-color-primary-soft); border: 1rpx solid var(--app-color-primary-border); height: 48rpx; margin-bottom: 6rpx; width: 100%; }
.foundation-type { border-top: 1rpx solid var(--app-color-divider); margin-top: 20rpx; padding-top: 18rpx; }
.gallery-major-title, .gallery-section-demo-title, .gallery-body-copy, .gallery-meta-copy { display: block; }
.gallery-major-title { font-size: var(--app-font-major-title); font-weight: 800; }
.gallery-section-demo-title { font-size: var(--app-font-section-title); font-weight: 800; margin-top: 12rpx; }
.gallery-body-copy { color: var(--app-color-text-body); font-size: var(--app-font-body); line-height: 1.6; margin-top: 10rpx; }
.gallery-meta-copy { color: var(--app-color-text-muted); font-size: var(--app-font-meta); margin-top: 8rpx; }
.gallery-button-grid { display: grid; gap: 12rpx; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 20rpx; }
.gallery-button-grid .app-button:last-child { grid-column: span 2; }
.gallery-stack-gap { display: block; margin-top: 16rpx; }
.gallery-selection-group { margin-top: 16rpx; }
.gallery-status-stack { margin-top: 16rpx; }
.gallery-information-stack { border-top: 1rpx solid var(--app-color-divider); margin-top: 20rpx; padding-top: 8rpx; }
.pattern-block--separated { border-top: 1rpx solid var(--app-color-divider); margin-top: 24rpx; padding-top: 24rpx; }
.pattern-title { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); font-weight: 700; line-height: 1.5; margin-bottom: 12rpx; }
.gallery-media-pattern { align-items: center; display: flex; gap: 16rpx; min-width: 0; }
.gallery-media-pattern__tile { align-items: center; background: var(--app-color-control-surface); border: 1rpx dashed var(--app-color-border-control); border-radius: var(--app-radius-control); color: var(--app-color-text-secondary); display: flex; flex: 0 0 120rpx; height: 120rpx; justify-content: center; text-align: center; }
.gallery-media-pattern__tile--active { background: var(--app-color-primary-soft); border-style: solid; border-color: var(--app-color-primary); color: var(--app-color-primary); }
.gallery-media-pattern__copy { flex: 1; min-width: 0; }
.gallery-media-pattern__copy .app-button { margin-top: 12rpx; }
.gallery-gap-pattern { align-items: center; display: flex; gap: 12rpx; }
.gallery-gap-pattern view { background: var(--app-color-divider); flex: 1; height: 1rpx; }
.gallery-gap-pattern text { color: var(--app-color-text-tertiary); flex: 0 0 auto; font-size: var(--app-font-meta); }
.gallery-sheet-preview { background: var(--app-color-page); border-radius: var(--app-radius-control) var(--app-radius-control) 0 0; margin-top: 16rpx; padding: 20rpx 16rpx 16rpx; }
.gallery-sheet-preview__handle, .gallery-sheet__handle { background: var(--app-color-border-control); border-radius: 999rpx; height: 8rpx; margin: 0 auto 16rpx; width: 72rpx; }
.gallery-action-stack__separated { border-top: 1rpx solid var(--app-color-divider); margin-top: 24rpx; padding-top: 24rpx; }
.gallery-action-state { min-width: 0; }
.gallery-action-state .action-workspace-form-actions { margin-top: 12rpx; }
.gallery-sheet-overlay { bottom: 0; left: 0; position: fixed; right: 0; top: 0; z-index: 100; }
.gallery-sheet-backdrop { background: rgba(16, 31, 53, 0.42); bottom: 0; left: 0; position: absolute; right: 0; top: 0; }
.gallery-sheet { background: var(--app-color-surface); border-radius: var(--app-radius-large) var(--app-radius-large) 0 0; bottom: 0; box-sizing: border-box; left: 0; padding: 24rpx var(--app-page-gutter) calc(24rpx + env(safe-area-inset-bottom)); position: absolute; right: 0; }
.gallery-sheet__title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-section-title); font-weight: 800; }
.gallery-sheet__copy { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); line-height: 1.5; margin: 8rpx 0 16rpx; }
@media (min-width: 640px) {
  .gallery-page { padding-left: 32rpx; padding-right: 32rpx; }
  .gallery-example-render { padding-left: 8rpx; padding-right: 8rpx; }
}

/* DS-01.1 visual master — Gallery only. Never redefine .app-button here. */
.gallery-commercial-master {
  background:#ffffff; border:1px solid #e4eaf3; border-radius:17px;
  padding:18px 14px; box-shadow:0 2px 12px rgba(19,42,70,.035);
}
.gallery-commercial-master__heading { padding:0 4px 14px; border-bottom:1px solid #eaf0f7; }
.gallery-commercial-master__eyebrow {
  display:block; color:#426b9d; font-size:10px; font-weight:720; letter-spacing:1.1px;
}
.gallery-commercial-master__title { display:block; margin-top:6px; font-size:20px; font-weight:730; color:#1c2a40; }
.gallery-commercial-master__description { display:block; margin-top:6px; font-size:12px; line-height:1.55; color:#75849a; }
.gallery-commercial-matrix {
  display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px 12px;
  margin-top:17px;
}
.gallery-commercial-column { min-width:0; display:flex; flex-direction:column; gap:11px; }
.gallery-commercial-column__title { font-size:15px; font-weight:730; color:#1b2d46; }
.gallery-commercial-column__sub { font-size:10.5px; color:#8190a5; min-height:22px; line-height:1.4; }
.gallery-commercial-column > .app-button { flex:0 0 auto; width:100%; }
.gallery-commercial-sizes { margin-top:19px; border-top:1px solid #eaf0f7; padding-top:15px; display:flex; flex-direction:column; gap:11px; }
.gallery-commercial-sizes__title { font-size:12px; font-weight:720; color:#344765; }
.gallery-commercial-sizes__row { display:flex; flex-wrap:wrap; gap:7px; align-items:center; }
.gallery-commercial-sizes__row > .app-button { max-width:100%; }
.gallery-feedback-states { display:flex; flex-wrap:wrap; gap:8px; }
.gallery-feedback-states > .app-action-feedback { flex:1 1 140px; min-width:0; }
.gallery-feedback-caution { color:#7c8da4; font-size:11px; line-height:1.6; display:block; margin-top:10px; }
@media (min-width: 680px) {
  .gallery-commercial-matrix { grid-template-columns:repeat(4,minmax(0,1fr)); }
}

</style>
