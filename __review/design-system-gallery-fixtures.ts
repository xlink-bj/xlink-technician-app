export type DesignSystemExampleKind =
  | 'foundations'
  | 'buttons'
  | 'fields'
  | 'inputs'
  | 'textarea'
  | 'selection'
  | 'feedback'
  | 'patterns'
  | 'action-bar'
  | 'records'

export interface DesignSystemExample {
  readonly id: string
  readonly title: string
  readonly state: string
  readonly note: string
  readonly kind: DesignSystemExampleKind
}

export interface DesignSystemSection {
  readonly id: string
  readonly title: string
  readonly examples: readonly DesignSystemExample[]
}

export interface DesignSystemScreenshotContract {
  readonly filename: string
  readonly focusExampleId: string
}

export const designSystemSections: readonly DesignSystemSection[] = [
  {
    id: '01-foundations',
    title: 'Foundations',
    examples: [{ id: 'foundations', title: '语义基础', state: 'tokens', note: '颜色、间距、圆角与字体层级', kind: 'foundations' }],
  },
  {
    id: '02-actions',
    title: 'Actions',
    examples: [{ id: 'buttons', title: '按钮状态', state: 'primary / secondary / text', note: 'DS-01.1 · 四级操作层级、交互矩阵及长中文母版', kind: 'buttons' }],
  },
  {
    id: '03-fields-inputs',
    title: 'Fields & Inputs',
    examples: [
      { id: 'fields', title: '字段语法', state: 'normal / required / optional / error / readonly', note: 'AppField 统一标签与辅助信息', kind: 'fields' },
      { id: 'inputs', title: '单行输入', state: 'empty / populated / disabled / readonly / error', note: 'text / number / digit 使用 AppInput', kind: 'inputs' },
      { id: 'textarea', title: '多行输入', state: 'empty / populated / auto-height', note: 'textarea / memo / remarks / description 使用 AppTextarea', kind: 'textarea' },
    ],
  },
  {
    id: '04-selection',
    title: 'Selection',
    examples: [{ id: 'selection', title: '选择控件', state: 'selector / choice / multi / cascade', note: '单选、多选与层级路径保持清晰', kind: 'selection' }],
  },
  {
    id: '05-feedback',
    title: 'Feedback',
    examples: [{ id: 'feedback', title: '状态与信息行', state: 'neutral / success / warning / danger', note: '状态、长文本与业务无关的反馈语法', kind: 'feedback' }],
  },
  {
    id: '06-complex-patterns',
    title: 'Complex Patterns',
    examples: [{ id: 'patterns', title: '已验证共享模式', state: 'presentation-only', note: '不携带 Survey 业务语义的模式示例', kind: 'patterns' }],
  },
  {
    id: '07-action-workspace-footer',
    title: 'Action Workspace Footer',
    examples: [{ id: 'action-bar', title: '底部 Action Bar', state: 'single / dual / save lifecycle', note: 'DS-01.1 · 单/双/分布式操作与服务端确认状态', kind: 'action-bar' }],
  },
  {
    id: '08-commercial-content',
    title: 'Commercial Content',
    examples: [{ id: 'records', title: '商业级卡片 / 分组 / 元标签', state: 'record / section / metadata', note: 'DS-02.B · 真实列表和详情共享的商业内容母版', kind: 'records' }],
  },
]

export const designSystemScreenshotContracts: readonly DesignSystemScreenshotContract[] = [
  { filename: '01-foundations.png', focusExampleId: 'foundations' },
  { filename: '02-buttons.png', focusExampleId: 'buttons' },
  { filename: '03-fields-inputs.png', focusExampleId: 'fields' },
  { filename: '04-textarea.png', focusExampleId: 'textarea' },
  { filename: '05-selection.png', focusExampleId: 'selection' },
  { filename: '06-status-feedback.png', focusExampleId: 'feedback' },
  { filename: '07-complex-patterns.png', focusExampleId: 'patterns' },
  { filename: '08-action-bar.png', focusExampleId: 'action-bar' },
]
