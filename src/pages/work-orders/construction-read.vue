<template>
 <view class="construction-page">
  <ConstructionReadPanel v-if="authorized" :logs="logs" :state="state" :customer="detail.detail?.customerName || ''" :number="detail.detail?.displayNumber" @retry="load" />
  <view v-else class="construction-blocked"><text>请从当前账号可见工单的施工日志入口重新进入。</text></view>
 </view>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useSessionStore } from '@shared/state';
import { useWorkOrderDetailStore } from '@features/work-orders/detail';
import { useWorkOrderListStore } from '@features/work-orders/list';
import ConstructionReadPanel from '@features/work-orders/downstream/ConstructionReadPanel.vue';
import { constructionReadRequest, parseConstructionLogs, type ConstructionLog } from '@features/work-orders/downstream/construction-read';
import { constructionMockEnabled, constructionMockReadPort, constructionMockParts } from '@adapters/api/mock/construction-read';
import { sessionAuthorizationFingerprint } from '@shared/session-authorization';
const session = useSessionStore(), detail = useWorkOrderDetailStore(), list = useWorkOrderListStore();
const id = ref(''), identity = ref(''), logs = ref<ConstructionLog[]>([]), state = ref<'idle' | 'loading' | 'ready' | 'failed'>('idle');
const currentIdentity = computed(() => { const s = session.session; return sessionAuthorizationFingerprint(s ? { sessionRef: s.sessionRef, userId: s.user.id, roleId: s.currentRole?.id, roleVersion: s.roleVersion } : null); });
const authorized = computed(() => !!session.session && !!identity.value && identity.value === currentIdentity.value && constructionMockEnabled(id.value) && detail.loadState === 'succeeded' && String(detail.detail?.id) === id.value && list.items.some(item => String(item.id) === id.value));
let generation = 0;
watch(authorized, valid => { if (!valid) {
    generation++;
    logs.value = [];
    state.value = 'idle';
} });
async function load() {
    if (!authorized.value || state.value === 'loading')
        return;
    const ticket = ++generation;
    state.value = 'loading';
    logs.value = [];
    try {
        const result = await constructionMockReadPort.execute(constructionReadRequest(id.value));
        if (ticket !== generation || !authorized.value)
            return;
        logs.value = parseConstructionLogs(result, id.value, constructionMockParts);
        state.value = 'ready';
    }
    catch {
        if (ticket === generation && authorized.value)
            state.value = 'failed';
    }
}
onLoad(options => { id.value = typeof options?.id === 'string' ? options.id : ''; identity.value = currentIdentity.value || ''; void load(); });
</script>
<style scoped lang="scss">
@import '@brand-ui/construction-read.scss';
</style>
