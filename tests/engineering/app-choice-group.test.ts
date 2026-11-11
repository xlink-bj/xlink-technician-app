import { readFileSync } from 'node:fs'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as Vue from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { AppChoiceOption } from '@shared/ui/types'

const filename = 'src/shared/ui/AppChoiceGroup.vue'
const { descriptor } = parse(readFileSync(filename, 'utf8'), { filename })
const script = compileScript(descriptor, { id: 'choice-group-test', inlineTemplate: true })
const { outputText } = ts.transpileModule(script.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
})
type ChoiceProps = {
  options: readonly AppChoiceOption[]
  modelValue: string
  disabled?: boolean
}
const module = {
  exports: {} as {
    default: {
      setup: (props: ChoiceProps) => (ctx: ChoiceProps & { $emit: (event: string, value: string) => void }) => Vue.VNode
    }
  },
}
new Function('require', 'module', 'exports', outputText)(
  (name: string) => {
    if (name === 'vue') return Vue
    throw new Error(`Unexpected import: ${name}`)
  },
  module,
  module.exports,
)

function choices(disabled = false) {
  const props: ChoiceProps = {
    options: [
      { value: '6', label: '客户拒绝上门' },
      { value: 'other', label: '其他（需要填写完整说明）', disabled: true },
    ],
    modelValue: 'other',
    disabled,
  }
  const emit = vi.fn()
  const root = module.exports.default.setup(props)({ ...props, $emit: emit })
  const [fragment] = root.children as Vue.VNode[]
  return { buttons: fragment!.children as Vue.VNode[], emit }
}

describe('AppChoiceGroup button semantics', () => {
  it('keeps the full accessible label, selected state and original choice value', () => {
    const { buttons: [reason, other], emit } = choices()
    expect(other?.children).toBe('其他（需要填写完整说明）')
    expect(other?.props).toMatchObject({ 'aria-pressed': true, disabled: true })
    expect(other?.props?.class).toContain('app-choice--selected')
    expect(other?.props?.class).toContain('app-choice--disabled')
    expect(reason?.props?.disabled).toBeFalsy()
    expect(reason?.props?.['aria-pressed']).toBe(false)
    reason?.props?.onTap()
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith('update:modelValue', '6')
  })

  it('sets the native disabled attribute on every option when the group is disabled', () => {
    const { buttons } = choices(true)
    expect(buttons.map(button => button.props?.disabled)).toEqual([true, true])
  })
})
