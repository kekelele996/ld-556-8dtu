<template>
  <div class="receipt-panel">
    <div class="receipt-head">
      <span class="receipt-title">收到回执 · 第 {{ plan.version }} 版</span>
      <n-tag :bordered="false" size="small" :type="allConfirmed ? 'success' : 'warning'">{{ confirmedCount }}/{{ plan.beneficiaries.length }} 已确认</n-tag>
    </div>
    <ul class="receipt-list">
      <li v-for="beneficiaryId in plan.beneficiaries" :key="beneficiaryId" class="receipt-item">
        <span class="receipt-name">{{ getById(beneficiaryId)?.name || '未知成员' }}</span>
        <template v-if="receiptMap.has(beneficiaryId)">
          <n-tag size="small" type="success" :bordered="false">已确认</n-tag>
          <span class="receipt-time">{{ receiptMap.get(beneficiaryId)!.confirmedAt.slice(0, 10) }}</span>
        </template>
        <template v-else>
          <n-tag size="small" :bordered="false">待确认</n-tag>
          <n-button
            v-if="canConfirm(beneficiaryId)"
            size="tiny"
            type="primary"
            @click="$emit('confirm', beneficiaryId)"
          >确认收到</n-button>
        </template>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NTag } from 'naive-ui'
import type { LegacyPlan, LegacyReceipt } from '@/types/legacy'
import { currentReceipts } from '@/stores/legacyStore'
import { useFamily } from '@/hooks/useFamily'

const props = withDefaults(
  defineProps<{
    plan: LegacyPlan
    /** 传入成员 ID 时只渲染该受益人本人可操作的确认按钮（成员详情页视角） */
    viewerId?: string
  }>(),
  { viewerId: undefined }
)

defineEmits<{ confirm: [beneficiaryId: string] }>()

const { getById } = useFamily()

const planReceipts = computed<LegacyReceipt[]>(() => currentReceipts(props.plan))
const receiptMap = computed(() => new Map(planReceipts.value.map((receipt) => [receipt.beneficiaryId, receipt])))
const confirmedCount = computed(() => planReceipts.value.length)
const allConfirmed = computed(() => confirmedCount.value >= props.plan.beneficiaries.length)

function canConfirm(beneficiaryId: string) {
  if (props.plan.status !== 'finalized') return false
  return props.viewerId === undefined || props.viewerId === beneficiaryId
}
</script>

<style scoped>
.receipt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.receipt-title {
  font-size: 13px;
  font-weight: 600;
  color: #6f552f;
}
.receipt-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
}
.receipt-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}
.receipt-name {
  min-width: 72px;
}
.receipt-time {
  color: #9a8a6d;
  font-size: 12px;
}
</style>
