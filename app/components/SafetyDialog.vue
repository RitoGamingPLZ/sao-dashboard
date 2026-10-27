<script setup lang="ts">
// Per-bot health & potion settings.
import type { AccountSummary, Safety } from '#shared/types'

const { t } = useI18n()
const dialog = ref<HTMLDialogElement>()
const accountId = ref('')
const accountName = ref('')
const level = ref(1)
// Stock levels are Lv30 amounts; this is the share kept at the character's level.
const stockSharePct = computed(() => Math.round((0.1 + 0.9 * Math.min(1, Math.max(0, level.value - 1) / 29)) * 100))
const form = ref<Safety | null>(null)
const errorText = ref('')

function open(account: AccountSummary) {
  accountId.value = account.id
  accountName.value = account.name
  level.value = account.player?.level ?? 1
  form.value = structuredClone(toRaw(account.safety))
  errorText.value = ''
  dialog.value?.showModal()
}
defineExpose({ open })

const thresholdRows = [
  { key: 'potionPct', label: 'thresholdPotion', min: 0 },
  { key: 'emergencyPct', label: 'thresholdEmergency', min: 0 },
  { key: 'crystalPct', label: 'thresholdCrystal', min: 10 },
] as const
const restockRows = [
  { label: 'recoveryPotion', min: 'autoDrinkMin', target: 'autoDrinkTarget' },
  { label: 'instantPotion', min: 'instantMin', target: 'instantTarget' },
  { label: 'healCrystal', min: 'crystalHealMin', target: 'crystalHealTarget' },
  { label: 'teleportCrystal', min: 'teleportMin', target: 'teleportTarget' },
] as const

async function save() {
  errorText.value = ''
  const put = (isUnsafeConfirmed: boolean) => callApi('PUT', `/api/accounts/${accountId.value}/safety`, { safety: form.value, isUnsafeConfirmed })
  try {
    await put(false)
  } catch (error) {
    if (!(error instanceof ApiError) || !error.result.needsConfirm) { errorText.value = (error as Error).message; return }
    if (!confirm(t('unsafeConfirm', { message: error.message }))) return
    try { await put(true) } catch (retryError) { errorText.value = (retryError as Error).message; return }
  }
  dialog.value?.close()
  showToast(t('settingsSaved'))
}
</script>

<template>
  <dialog ref="dialog" class="dialog">
    <form v-if="form" class="stack" @submit.prevent="save">
      <h3>{{ t('healthPotions') }} — {{ accountName }}</h3>
      <label class="checkbox"><input v-model="form.isEnabled" type="checkbox"> {{ t('safetyOn') }}</label>
      <label>{{ t('healMode') }}
        <select v-model="form.healMode">
          <option value="bot">{{ t('healModeBot') }}</option>
          <option value="crystal">{{ t('healModeCrystal') }}</option>
        </select>
      </label>
      <fieldset class="threshold-grid">
        <legend>{{ t('healAtHp') }}</legend>
        <span /><span>{{ t('normalFight') }}</span><span>{{ t('bossFight') }}</span>
        <template v-for="row in thresholdRows" :key="row.key">
          <span>{{ t(row.label) }}</span>
          <input v-model.number="form.normal[row.key]" type="number" :min="row.min" max="95">
          <input v-model.number="form.boss[row.key]" type="number" :min="row.min" max="95">
        </template>
      </fieldset>
      <label class="checkbox"><input v-model="form.isAutoRestockOn" type="checkbox"> {{ t('autoRestock') }}</label>
      <fieldset class="threshold-grid">
        <legend>{{ t('restockTitle') }}</legend>
        <p class="hint" style="grid-column: 1 / -1">{{ t('restockScaleHint', { level, pct: stockSharePct }) }}</p>
        <span /><span>{{ t('restockBelow') }}</span><span>{{ t('restockUpTo') }}</span>
        <template v-for="row in restockRows" :key="row.min">
          <span>{{ t(row.label) }}</span>
          <input v-model.number="form.restock[row.min]" type="number" min="0">
          <input v-model.number="form.restock[row.target]" type="number" min="0">
        </template>
        <span>{{ t('maxSpendPct') }}</span><input v-model.number="form.restock.maxSpendPct" type="number" min="0" max="100"><span />
      </fieldset>
      <p class="form-error">{{ errorText }}</p>
      <div class="dialog-actions">
        <button type="button" class="button" @click="dialog?.close()">{{ t('cancel') }}</button>
        <button class="button primary">{{ t('save') }}</button>
      </div>
    </form>
  </dialog>
</template>
