import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'

const virtualDbId = 'virtual:legacy-db-stub'
const resolvedVirtualDbId = '\0' + virtualDbId

const vite = await createServer({
  server: { middlewareMode: true },
  logLevel: 'error',
  plugins: [
    {
      name: 'legacy-db-stub',
      enforce: 'pre',
      resolveId(id) {
        if (id === virtualDbId) return resolvedVirtualDbId
      },
      load(id) {
        if (id !== resolvedVirtualDbId) return null
        return `
          let rows = []
          export const readLegacyPlans = async () => JSON.parse(JSON.stringify(rows))
          export const writeLegacyPlans = async (records) => { rows = JSON.parse(JSON.stringify(records)) }
          export const clearLegacyPlans = async () => { rows = [] }
          export const __seedLegacy = async (records) => { rows = JSON.parse(JSON.stringify(records)) }
        `
      },
      transform(code, id) {
        if (id.includes('/db/legacy-db.ts')) {
          return `export { readLegacyPlans, writeLegacyPlans, clearLegacyPlans, __seedLegacy } from '${virtualDbId}'`
        }
      }
    }
  ]
})

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

try {
  const { useLegacyStore, currentReceipts } = await vite.ssrLoadModule('/src/stores/legacyStore.ts')
  const { __seedLegacy } = await vite.ssrLoadModule('/src/db/legacy-db.ts')

  setActivePinia(createPinia())
  const store = useLegacyStore()

  // 1-3 定稿与逐人回执
  await store.createPlan({ memberId: 'm-father', type: 'DIGITAL_ASSET', content: 'v1 内容', beneficiaries: ['m-child', 'm-mother'] })
  const planId = store.plans[0].id
  const reload = () => store.plans.find((p) => p.id === planId)
  assert(reload().status === 'draft', '新建应为草稿')
  await store.finalizePlan(planId)
  assert(reload().status === 'finalized', '定稿后应为待回执(finalized)')

  await store.confirmReceipt(planId, 'm-child')
  assert(reload().status === 'finalized' && currentReceipts(reload()).length === 1, '一人确认后仍应为待回执，回执数 1')

  // 4 同一受益人同版本重复确认不多记
  await store.confirmReceipt(planId, 'm-child')
  assert(currentReceipts(reload()).length === 1, '重复确认不得多记')

  // 5 非受益人确认无效
  await store.confirmReceipt(planId, 'm-grandma')
  assert(currentReceipts(reload()).length === 1, '非受益人确认应被忽略')

  // 6 全部确认 -> 已交接
  await store.confirmReceipt(planId, 'm-mother')
  assert(reload().status === 'handed_over', '全部确认后应进入已交接')
  assert(currentReceipts(reload()).length === 2, '已交接时回执数应为 2')

  // 7 待办查询
  assert(store.pendingReceipts().length === 0, '已交接规划不应留在待办')
  assert(store.pendingFor('m-child').length === 0, '已确认成员不应有该待办')

  // 8 改内容 -> 版本+1、旧回执作废、回到待回执
  await store.updatePlan(planId, { content: 'v2：增加邮箱' })
  let p = reload()
  assert(p.version === 2, '改版后版本号应为 2')
  assert(p.status === 'finalized', '改版后应回到待回执')
  assert(currentReceipts(p).length === 0, '改版后当前版本回执应全部作废')
  assert(store.pendingReceipts().length === 1, '改版后规划应重新进入待办')
  assert(store.pendingFor('m-child').length === 1, '改版后已确认成员需重新确认')
  assert(p.receipts.length === 2 && p.receipts.every((r) => r.version === 1), '旧版本回执应保留留档')

  // 9 改受益人列表也作废；三人重收齐后再次交接
  await store.updatePlan(planId, { beneficiaries: ['m-child', 'm-mother', 'm-grandma'] })
  p = reload()
  assert(p.version === 3, '受益人变更后版本号应为 3')
  assert(currentReceipts(p).length === 0, '受益人变更后回执应作废')
  await store.confirmReceipt(planId, 'm-child')
  await store.confirmReceipt(planId, 'm-mother')
  assert(reload().status === 'finalized', '三人中两人确认时不应交接')
  await store.confirmReceipt(planId, 'm-grandma')
  assert(reload().status === 'handed_over', '三人全部确认后应交接')

  // 10 无关字段(type)修改不动版本/回执
  await store.updatePlan(planId, { type: 'LETTER' })
  p = reload()
  assert(p.version === 3 && currentReceipts(p).length === 3 && p.status === 'handed_over', '类型修改不应影响回执状态')

  // 11 草稿改内容不推进版本
  await store.createPlan({ memberId: 'm-father', type: 'WILL', content: '草稿', beneficiaries: ['m-child'] })
  const draftId = store.plans[0].id
  await store.updatePlan(draftId, { content: '草稿修改' })
  p = store.plans.find((x) => x.id === draftId)
  assert(p.status === 'draft' && p.version === 1, '草稿修改不应推进版本')

  // 12 旧数据：全新 store hydrate 缺字段规划，保留原 finalized 状态，补字段，进待办
  await __seedLegacy([
    { id: 'old-1', memberId: 'm-father', type: 'WILL', content: '旧规划', beneficiaries: ['m-child'], status: 'finalized', createdAt: '2020-01-01T00:00:00.000Z' }
  ])
  setActivePinia(createPinia())
  const freshStore = useLegacyStore()
  await freshStore.hydrate()
  const oldPlan = freshStore.plans.find((x) => x.id === 'old-1')
  assert(oldPlan, '旧规划应被读出')
  assert(oldPlan.status === 'finalized', '旧规划必须保留原状态，不自动交接')
  assert(oldPlan.version === 1 && oldPlan.receipts.length === 0, '旧规划补齐 version=1 与空回执')
  assert(oldPlan.updatedAt === oldPlan.createdAt, '旧规划 updatedAt 回退为 createdAt')
  assert(freshStore.pendingReceipts().some((x) => x.id === 'old-1'), '旧 finalized 规划应进待办等待确认')

  console.log('store 状态机全部断言通过 ✓')
} finally {
  await vite.close()
}
