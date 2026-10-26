<script setup lang="ts">
// Per-bot health & potion settings.
import type { AccountSummary, Safety } from '#shared/types'

const { t } = useI18n()
const dialog = ref<HTMLDialogElement>()
const accountId = ref('')
const accountName = ref('')
const form = ref<Safety | null>(null)
const errorText = ref('')

function open(account: AccountSummary) {
  accountId.value = account.id
  accountName.value = account.name
  form.value = structuredClone(toRaw(account.safety))
  errorText.value = ''
  dialog.value?.showModal()
}
defineExpose({ open })

const thresholdRows = [
  { key: 'potionPct', label: 'Potion', min: 0 },
  { key: 'emergencyPct', label: 'Emergency (瞬補)', min: 0 },
  { key: 'crystalPct', label: 'Crystal (≥10)', min: 10 },
] as const
const restockRows = [
  { label: 'Auto-drink item', min: 'autoDrinkMin', target: 'autoDrinkTarget' },
  { label: 'Heal crystal', min: 'crystalHealMin', target: 'crystalHealTarget' },
  { label: 'Teleport crystal', min: 'teleportMin', target: 'teleportTarget' },
] as const

async function save() {
  errorText.value = ''
  const put = (isUnsafeConfirmed: boolean) => callApi('PUT', `/api/accounts/${accountId.value}/safety`, { safety: form.value, isUnsafeConfirmed })
  try {
    await put(false)
  } catch (error) {
    if (!(error instanceof ApiError) || !error.result.needsConfirm) { errorText.value = (error as Error).message; return }
    if (!confirm(`${error.message}.\n\nLower thresholds make death more likely. Save anyway?`)) return
    try { await put(true) } catch (retryError) { errorText.value = (retryError as Error).message; return }
  }
  dialog.value?.close()
  showToast('Settings saved')
}
</script>

<template>
  <dialog ref="dialog" class="dialog">
    <form v-if="form" class="stack" @submit.prevent="save">
      <h3>{{ t('healthPotions') }} — {{ accountName }}</h3>
      <label class="checkbox"><input v-model="form.isEnabled" type="checkbox"> Safety loop on</label>
      <label>Heal mode
        <select v-model="form.healMode">
          <option value="bot">Bot drinks potions</option>
          <option value="crystal">Game auto-drink; bot only at emergency/crystal</option>
        </select>
      </label>
      <fieldset class="threshold-grid">
        <legend>Heal at HP % (normal / boss)</legend>
        <span /><span>Normal</span><span>Boss</span>
        <template v-for="row in thresholdRows" :key="row.key">
          <span>{{ row.label }}</span>
          <input v-model.number="form.normal[row.key]" type="number" :min="row.min" max="95">
          <input v-model.number="form.boss[row.key]" type="number" :min="row.min" max="95">
        </template>
      </fieldset>
      <label class="checkbox"><input v-model="form.isAutoRestockOn" type="checkbox"> Auto-restock when low</label>
      <fieldset class="threshold-grid">
        <legend>Restock (buy when below → up to)</legend>
        <span /><span>Below</span><span>Up to</span>
        <template v-for="row in restockRows" :key="row.min">
          <span>{{ row.label }}</span>
          <input v-model.number="form.restock[row.min]" type="number" min="0">
          <input v-model.number="form.restock[row.target]" type="number" min="0">
        </template>
        <span>Max spend % of gold</span><input v-model.number="form.restock.maxSpendPct" type="number" min="0" max="100"><span />
      </fieldset>
      <p class="form-error">{{ errorText }}</p>
      <div class="dialog-actions">
        <button type="button" class="button" @click="dialog?.close()">{{ t('cancel') }}</button>
        <button class="button primary">{{ t('save') }}</button>
      </div>
    </form>
  </dialog>
</template>
