<template>
  <section class="page-grid">
    <div class="page-heading"><p>遗产规划</p><h1>数字资产、纪念品与信件交接</h1></div>

    <section class="panel todo-panel">
      <h2>待办 · 待确认回执</h2>
      <p v-if="!pendingPlans.length" class="todo-empty">没有等待确认的规划，定稿后的规划会出现在这里直到全部受益人确认。</p>
      <div v-for="plan in pendingPlans" :key="plan.id" class="todo-card">
        <div class="todo-meta">
          <n-tag size="small" :bordered="false">{{ legacyTypeLabels[plan.type] }}</n-tag>
          <strong>{{ getById(plan.memberId)?.name || '未知成员' }}</strong>
          <span class="todo-content">{{ plan.content }}</span>
        </div>
        <LegacyReceiptPanel :plan="plan" @confirm="(beneficiaryId) => confirm(plan.id, beneficiaryId)" />
      </div>
    </section>

    <n-data-table
      :columns="columns"
      :data="plans"
      :pagination="{ pageSize: 6 }"
      :row-key="(row: LegacyPlan) => row.id"
    />

    <section class="panel">
      <h2>创建规划</h2>
      <n-form :model="form" label-placement="top">
        <n-form-item label="类型"><n-select v-model:value="form.type" :options="typeOptions" /></n-form-item>
        <n-form-item label="关联成员"><n-select v-model:value="form.memberId" :options="memberOptions" /></n-form-item>
        <n-form-item label="受益人"><n-select v-model:value="form.beneficiaries" multiple :options="memberOptions" /></n-form-item>
        <n-form-item label="规划内容"><n-input v-model:value="form.content" type="textarea" placeholder="规划内容" /></n-form-item>
      </n-form>
      <n-button type="primary" @click="submit">保存草稿</n-button>
    </section>

    <LegacyPlanEditor v-model:show="editorVisible" :plan="editingPlan" @save="saveEdits" />
  </section>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue'
import { NButton, NTag, type DataTableColumns } from 'naive-ui'
import { LegacyType, legacyStatusLabels, legacyStatusTagTypes, legacyTypeLabels } from '@/constants/enums'
import type { LegacyPlan } from '@/types/legacy'
import { useLegacyStore } from '@/stores/legacyStore'
import { useFamily } from '@/hooks/useFamily'
import LegacyReceiptPanel from '@/components/legacy/LegacyReceiptPanel.vue'
import LegacyPlanEditor from '@/components/legacy/LegacyPlanEditor.vue'

const legacy = useLegacyStore()
const { hydrate, memberOptions, getById } = useFamily()
const typeOptions = Object.entries(legacyTypeLabels).map(([value, label]) => ({ value, label }))
const form = reactive({ type: LegacyType.WILL, memberId: 'm-child', beneficiaries: ['m-child'], content: '' })
const plans = computed(() => legacy.plans)
const pendingPlans = computed(() => legacy.pendingReceipts())

const editorVisible = ref(false)
const editingPlan = ref<LegacyPlan | null>(null)

const columns: DataTableColumns<LegacyPlan> = [
  { type: 'expand', expandable: (row) => row.status === 'finalized' || row.status === 'handed_over', renderExpand: (row) => h(LegacyReceiptPanel, { plan: row, onConfirm: (beneficiaryId: string) => confirm(row.id, beneficiaryId) }) },
  { title: '类型', key: 'type', render: (row) => h(NTag, { size: 'small', bordered: false }, { default: () => legacyTypeLabels[row.type] }) },
  { title: '关联成员', key: 'memberId', render: (row) => getById(row.memberId)?.name || '未知' },
  { title: '规划内容', key: 'content', ellipsis: { tooltip: true } },
  { title: '版本', key: 'version', width: 70, render: (row) => `v${row.version}` },
  { title: '状态', key: 'status', render: (row) => h(NTag, { size: 'small', bordered: false, type: legacyStatusTagTypes[row.status] }, { default: () => legacyStatusLabels[row.status] }) },
  { title: '创建时间', key: 'createdAt', render: (row) => row.createdAt.slice(0, 10) },
  {
    title: '操作',
    key: 'actions',
    render: (row) =>
      h(
        'div',
        { style: 'display:flex;gap:6px;flex-wrap:wrap' },
        row.status === 'draft'
          ? [
              h(NButton, { size: 'small', type: 'primary', onClick: () => finalize(row.id) }, { default: () => '定稿' }),
              h(NButton, { size: 'small', onClick: () => openEditor(row) }, { default: () => '编辑' })
            ]
          : row.status === 'archived'
            ? [h(NButton, { size: 'small', onClick: () => openEditor(row) }, { default: () => '查看' })]
            : [
                h(NButton, { size: 'small', onClick: () => openEditor(row) }, { default: () => '修改内容' }),
                h(NButton, { size: 'small', onClick: () => legacy.changeStatus(row.id, 'archived') }, { default: () => '归档' })
              ]
      )
  }
]

async function submit() {
  await legacy.createPlan({ memberId: form.memberId, type: form.type, content: form.content || '待补充规划内容', beneficiaries: form.beneficiaries })
  form.content = ''
}

async function finalize(id: string) {
  await legacy.finalizePlan(id)
}

async function confirm(id: string, beneficiaryId: string) {
  await legacy.confirmReceipt(id, beneficiaryId)
}

function openEditor(plan: LegacyPlan) {
  editingPlan.value = plan
  editorVisible.value = true
}

async function saveEdits(patch: { type: LegacyPlan['type']; memberId: string; beneficiaries: string[]; content: string }) {
  if (!editingPlan.value) return
  await legacy.updatePlan(editingPlan.value.id, patch)
}

onMounted(async () => {
  await Promise.all([hydrate(), legacy.hydrate()])
})
</script>

<style scoped>
.todo-panel h2 {
  margin-top: 0;
}
.todo-empty {
  margin: 0;
  color: #9a8a6d;
  font-size: 14px;
}
.todo-card {
  padding: 12px 14px;
  border: 1px dashed #d8ceba;
  border-radius: 10px;
  display: grid;
  gap: 10px;
}
.todo-card + .todo-card {
  margin-top: 10px;
}
.todo-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 14px;
}
.todo-content {
  color: #6e6351;
}
</style>
