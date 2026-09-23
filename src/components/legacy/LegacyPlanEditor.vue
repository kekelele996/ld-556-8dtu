<template>
  <n-modal :show="show" preset="card" :title="plan ? '编辑规划' : '查看规划'" style="width: 560px" @update:show="$emit('update:show', $event)">
    <n-form label-placement="top">
      <n-form-item label="类型">
        <n-select :value="form.type" :options="typeOptions" :disabled="readonly" @update:value="(value) => (form.type = value)" />
      </n-form-item>
      <n-form-item label="关联成员">
        <n-select :value="form.memberId" :options="memberOptions" :disabled="readonly" @update:value="(value) => (form.memberId = value)" />
      </n-form-item>
      <n-form-item label="受益人">
        <n-select :value="form.beneficiaries" multiple :options="memberOptions" :disabled="readonly" @update:value="(value: string[]) => (form.beneficiaries = value)" />
      </n-form-item>
      <n-form-item label="规划内容">
        <n-input v-model:value="form.content" type="textarea" :autosize="{ minRows: 3 }" :readonly="readonly" />
      </n-form-item>
    </n-form>
    <template #footer>
      <n-space justify="end">
        <n-button @click="$emit('update:show', false)">{{ readonly ? '关闭' : '取消' }}</n-button>
        <n-button v-if="!readonly" type="primary" @click="submit">保存</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import { NButton, NForm, NFormItem, NInput, NModal, NSelect, NSpace } from 'naive-ui'
import { LegacyType, legacyTypeLabels } from '@/constants/enums'
import type { LegacyPlan } from '@/types/legacy'
import { useFamily } from '@/hooks/useFamily'

const props = withDefaults(defineProps<{ show: boolean; plan: LegacyPlan | null; readonly?: boolean }>(), { readonly: false })
const emit = defineEmits<{
  'update:show': [value: boolean]
  save: [patch: { type: LegacyPlan['type']; memberId: string; beneficiaries: string[]; content: string }]
}>()

const { memberOptions } = useFamily()
const typeOptions = Object.entries(legacyTypeLabels).map(([value, label]) => ({ value, label }))
const form = reactive<{ type: LegacyPlan['type']; memberId: string; beneficiaries: string[]; content: string }>({
  type: LegacyType.WILL,
  memberId: '',
  beneficiaries: [],
  content: ''
})

watch(
  () => props.plan,
  (plan) => {
    if (plan) {
      form.type = plan.type
      form.memberId = plan.memberId
      form.beneficiaries = [...plan.beneficiaries]
      form.content = plan.content
    }
  },
  { immediate: true }
)

function submit() {
  if (!props.plan) return
  emit('save', { type: form.type, memberId: form.memberId, beneficiaries: form.beneficiaries, content: form.content })
  emit('update:show', false)
}
</script>
