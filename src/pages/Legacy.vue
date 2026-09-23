<template>
  <section class="page-grid">
    <div class="page-heading"><p>遗产规划</p><h1>数字资产、纪念品与信件交接</h1></div>
    <n-data-table :columns="columns" :data="plans" :pagination="{ pageSize: 6 }" />
    <section class="panel">
      <h2>{{ editingId ? '编辑规划' : '创建规划' }}</h2>
      <n-form :model="form" label-placement="top">
        <n-form-item label="类型"><n-select v-model:value="form.type" :options="typeOptions" /></n-form-item>
        <n-form-item label="关联成员"><n-select v-model:value="form.memberId" :options="memberOptions" /></n-form-item>
        <n-form-item label="受益人"><n-select v-model:value="form.beneficiaries" multiple :options="memberOptions" /></n-form-item>
        <n-form-item label="规划内容"><n-input v-model:value="form.content" type="textarea" placeholder="规划内容" /></n-form-item>
      </n-form>
      <n-space>
        <n-button type="primary" @click="submit">{{ editingId ? '保存修改' : '保存草稿' }}</n-button>
        <n-button v-if="editingId" @click="resetForm">取消编辑</n-button>
      </n-space>
      <p v-if="editingId" class="receipt-hint">保存后规划内容版本更新，已收到的回执将作废并重新等待受益人确认。</p>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue'
import { NButton, NSpace, NTag, type DataTableColumns } from 'naive-ui'
import { LegacyStatus, LegacyType, legacyStatusLabels, legacyTypeLabels } from '@/constants/enums'
import type { LegacyPlan } from '@/types/legacy'
import { useLegacyStore } from '@/stores/legacyStore'
import { useFamily } from '@/hooks/useFamily'

const legacy = useLegacyStore()
const { hydrate, memberOptions, getById } = useFamily()
const typeOptions = Object.entries(legacyTypeLabels).map(([value, label]) => ({ value, label }))
const form = reactive<{ type: LegacyType; memberId: string; beneficiaries: string[]; content: string }>({ type: LegacyType.WILL, memberId: 'm-child', beneficiaries: ['m-child'], content: '' })
const editingId = ref('')
const plans = computed(() => legacy.plans)

const statusTagType: Record<LegacyStatus, 'default' | 'info' | 'success' | 'warning'> = {
  [LegacyStatus.DRAFT]: 'default',
  [LegacyStatus.FINALIZED]: 'info',
  [LegacyStatus.DELIVERED]: 'success',
  [LegacyStatus.ARCHIVED]: 'warning'
}

function memberName(id: string) {
  return getById(id)?.name || '未知'
}

function receiptSummary(row: LegacyPlan): string[] {
  if (row.status === LegacyStatus.DRAFT) return ['—']
  const confirmed = legacy.currentReceipts(row).length
  const total = row.beneficiaries.length
  const pending = legacy.pendingBeneficiaries(row).map(memberName)
  const lines = [`已确认 ${confirmed}/${total}`]
  if (pending.length) lines.push(`待确认：${pending.join('、')}`)
  return lines
}

const columns: DataTableColumns<LegacyPlan> = [
  { title: '类型', key: 'type', render: (row) => h(NTag, null, { default: () => legacyTypeLabels[row.type] }) },
  { title: '关联成员', key: 'memberId', render: (row) => memberName(row.memberId) },
  { title: '规划内容', key: 'content', ellipsis: { tooltip: true } },
  { title: '版本', key: 'version', render: (row) => `v${row.version}` },
  {
    title: '状态',
    key: 'status',
    render: (row) => h(NTag, { type: statusTagType[row.status] }, { default: () => legacyStatusLabels[row.status] })
  },
  {
    title: '回执进度',
    key: 'receipts',
    render: (row) => h('div', null, receiptSummary(row).map((line) => h('div', null, line)))
  },
  { title: '创建时间', key: 'createdAt', render: (row) => row.createdAt.slice(0, 10) },
  {
    title: '操作',
    key: 'actions',
    render: (row) => {
      const buttons = [h(NButton, { size: 'small', onClick: () => startEdit(row) }, { default: () => '编辑' })]
      if (row.status === LegacyStatus.DRAFT) {
        buttons.push(h(NButton, { size: 'small', type: 'primary', onClick: () => legacy.changeStatus(row.id, LegacyStatus.FINALIZED) }, { default: () => '定稿' }))
      } else if (row.status === LegacyStatus.FINALIZED || row.status === LegacyStatus.DELIVERED) {
        buttons.push(h(NButton, { size: 'small', onClick: () => legacy.changeStatus(row.id, LegacyStatus.ARCHIVED) }, { default: () => '归档' }))
      }
      return h(NSpace, { size: 'small' }, { default: () => buttons })
    }
  }
]

function startEdit(plan: LegacyPlan) {
  editingId.value = plan.id
  form.type = plan.type
  form.memberId = plan.memberId
  form.beneficiaries = [...plan.beneficiaries]
  form.content = plan.content
}

function resetForm() {
  editingId.value = ''
  form.type = LegacyType.WILL
  form.memberId = 'm-child'
  form.beneficiaries = ['m-child']
  form.content = ''
}

async function submit() {
  const existing = editingId.value ? legacy.plans.find((plan) => plan.id === editingId.value) : undefined
  await legacy.savePlan({
    id: existing?.id ?? crypto.randomUUID(),
    memberId: form.memberId,
    type: form.type,
    content: form.content || '待补充规划内容',
    beneficiaries: form.beneficiaries,
    status: existing?.status ?? LegacyStatus.DRAFT,
    version: existing?.version ?? 1,
    receipts: existing?.receipts ?? [],
    createdAt: existing?.createdAt ?? new Date().toISOString()
  })
  resetForm()
}

onMounted(async () => {
  await Promise.all([hydrate(), legacy.hydrate()])
})
</script>
