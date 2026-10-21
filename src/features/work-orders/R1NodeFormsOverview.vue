<template>
  <view v-if="node?.formList" class="r1-node-forms" data-testid="r1-form-list">
    <view class="r1-node-forms__heading">
      <text class="r1-node-forms__title">{{ node.sourceNodeType === 'repeat' ? '重复提交记录' : '节点表单记录' }}</text>
      <text v-if="node.formList.evidence === 'available'" data-testid="r1-form-list-count"
        class="r1-node-forms__count">{{ countText }}</text>
    </view>
    <text v-if="node.formList.evidence === 'invalid'" class="r1-node-forms__hint" data-testid="r1-form-list-invalid">
      服务端表单列表结构异常；此处不展示不完整的数据，也不允许使用单表单命令操作。
    </text>
    <template v-else>
      <text v-if="node.formList.entries.length === 0" class="r1-node-forms__hint"
        data-testid="r1-form-list-empty">该节点返回了空表单列表。</text>
      <view v-for="(entry,index) in node.formList.entries" :key="String(entry.id)"
        class="r1-node-forms__item" data-testid="r1-form-list-entry">
        <text class="r1-node-forms__index">{{ index + 1 }}</text>
        <text class="r1-node-forms__item-title">{{ entry.title || '未命名表单' }}</text>
        <text class="r1-node-forms__state">{{ stateName(entry.state) }}</text>
      </view>
      <text v-if="node.formList.truncated" class="r1-node-forms__hint" data-testid="r1-form-list-truncated">
        仅展示前 50 条已加载记录，非全部记录数。
      </text>
      <text class="r1-node-forms__hint">当前仅支持查看已读取记录，新增、删除和完成工作流尚需验证 R1 的多表单协议。</text>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WorkflowNodeRead, R1NodeFormReference } from '@shared/ports'

const props = defineProps<{ readonly node?: WorkflowNodeRead }>()
const countText = computed(() => {
  const list = props.node?.formList
  if (!list || list.evidence !== 'available') return ''
  return list.truncated ? `已加载 ${list.entries.length}+ 条` : `已加载 ${list.entries.length} 条`
})
function stateName(state: R1NodeFormReference['state']) {
  return state === 'active' ? '已保存' : state === 'deleted' ? '已删除' : '状态待核验'
}
</script>

<style scoped>
.r1-node-forms { background: #fff; border: 1px solid #e0e7ef; border-radius: 16px; padding: 17px 16px; margin-top: 12px; }
.r1-node-forms__heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.r1-node-forms__title { font-size: 16px; font-weight: 650; color: #1d304b; }
.r1-node-forms__count { font-size: 12px; color: #68788f; }
.r1-node-forms__hint { display: block; font-size: 12px; line-height: 20px; color: #68788f; margin-top: 12px; }
.r1-node-forms__item { display: flex; align-items: center; min-height: 47px; gap: 10px; border-bottom: 1px solid #ecf0f5; }
.r1-node-forms__item:last-of-type { border-bottom: none; }
.r1-node-forms__index { width: 22px; font-size: 12px; color: #8392a5; }
.r1-node-forms__item-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; color: #263b55; }
.r1-node-forms__state { font-size: 12px; color: #68788f; }
</style>
