<script setup lang="ts">
// Character profile: skills, gear, weapon goal, potions, and account management.
import { ITEMS, WEAPON_TYPES, shopStock } from '#shared/game-rules'
import type { AccountSummary } from '#shared/types'

const emit = defineEmits<{ 'open-settings': [account: AccountSummary] }>()
const { t } = useI18n()
const { accountById } = useDashboard()
const dialog = ref<HTMLDialogElement>()
const accountId = ref<string | null>(null)
const account = computed(() => accountById(accountId.value))
const equipment = computed(() => Object.entries(account.value?.player?.equipment ?? {}))
const canReconnect = computed(() => account.value?.alerts.some((alert) => alert.code.startsWith('ended_')))

function open(id: string) {
  accountId.value = id
  dialog.value?.showModal()
}
defineExpose({ open })

const act = (action: string) => accountAction(account.value!.id, action)
const setWeapon = (weapon: string) => runAndReport(() => callApi('PUT', `/api/accounts/${account.value!.id}/weapon`, { weapon: weapon || null }))

// Potions: the recovery potion is the game's own auto-drink setting; the instant
// potion (瞬補) is the one the dashboard keeps stocked. Choices: sold on unlocked floors.
const consumables = computed(() => account.value?.player?.consumables)
const choicesOf = (kind: 'potion' | 'instant', currentItemId?: string) => {
  const unlockedFloors = Array.from({ length: account.value?.player?.frontierFloor ?? 1 }, (_, i) => i + 1)
  const itemIds = new Set([...unlockedFloors.flatMap(shopStock), currentItemId ?? ''])
  return [...itemIds].filter((itemId) => ITEMS[itemId]?.kind === kind)
}
const setRecoveryPotion = (itemId: string) =>
  accountAction(account.value!.id, 'raw', { command: { type: 'updateSettings', settings: { potionItem: itemId } } })
const setInstantPotion = (itemId: string) =>
  runAndReport(() => callApi('PUT', `/api/accounts/${account.value!.id}/safety`, { safety: { instantItem: itemId } }), t('settingsSaved'))

async function showPassword() {
  const result = await runAndReport(() => callApi<{ password: string }>('POST', `/api/accounts/${account.value!.id}/password`, {}))
  if (result) prompt(`Password for ${account.value!.name} (copy it now):`, result.password)
}

async function removeAccount() {
  if (!confirm(t('confirmRemoveAccount', { name: account.value!.name }))) return
  if (await runAndReport(() => callApi('DELETE', `/api/accounts/${account.value!.id}`), t('removedAccount', { name: account.value!.name }))) dialog.value?.close()
}
</script>

<template>
  <dialog ref="dialog" class="dialog">
    <template v-if="account">
      <h3>{{ account.name }} <span class="level">Lv {{ account.player?.level ?? '—' }}</span> <span class="muted">({{ account.account }})</span></h3>
      <div class="stack">
        <div>
          <div class="section-title">{{ t('weaponGoal') }}</div>
          <select :value="account.preferredWeapon || ''" @change="setWeapon(($event.target as HTMLSelectElement).value)">
            <option value="">{{ t('none') }}</option>
            <option v-for="weapon in WEAPON_TYPES" :key="weapon" :value="weapon">{{ weapon }}</option>
          </select>
        </div>
        <div v-if="account.player">
          <div class="section-title">{{ t('potion') }}</div>
          <p class="hint">{{ t('potionHint') }}</p>
          <div class="potion-grid">
            <span>{{ t('recoveryPotion') }}</span>
            <select :value="consumables?.autoDrink?.itemId" :aria-label="t('recoveryPotion')" @change="setRecoveryPotion(($event.target as HTMLSelectElement).value)">
              <option v-for="itemId in choicesOf('potion', consumables?.autoDrink?.itemId)" :key="itemId" :value="itemId">{{ ITEMS[itemId]!.name }}</option>
            </select>
            <span>×{{ consumables?.autoDrink?.quantity ?? 0 }}</span>
            <span>{{ t('instantPotion') }}</span>
            <select :value="consumables?.instant.itemId" :aria-label="t('instantPotion')" @change="setInstantPotion(($event.target as HTMLSelectElement).value)">
              <option v-for="itemId in choicesOf('instant', consumables?.instant.itemId)" :key="itemId" :value="itemId">{{ ITEMS[itemId]!.name }}</option>
            </select>
            <span>×{{ consumables?.instant.quantity ?? 0 }}</span>
          </div>
        </div>
        <div>
          <div class="section-title">{{ t('skills') }}</div>
          <ul v-if="account.player?.skills?.length" class="plain-list">
            <li v-for="skill in account.player.skills" :key="skill">{{ skill }}</li>
          </ul>
          <p v-else class="muted">{{ t('noData') }}</p>
        </div>
        <div>
          <div class="section-title">{{ t('equipment') }}</div>
          <ul v-if="equipment.length" class="plain-list">
            <li v-for="[slot, item] in equipment" :key="slot"><b>{{ slot }}:</b> {{ item }}</li>
          </ul>
          <p v-else class="muted">{{ t('noData') }}</p>
        </div>
        <p v-if="account.haltReason" class="alert">{{ account.haltReason }} — <button class="button small" @click="act('resume')">{{ t('resumeBot') }}</button></p>
        <div class="dialog-actions" style="justify-content:flex-start; flex-wrap:wrap;">
          <button v-if="canReconnect" type="button" class="button primary" @click="act('reconnect')">{{ t('reconnect') }}</button>
          <button type="button" class="button" @click="emit('open-settings', account)">{{ t('healthPotions') }}</button>
          <button type="button" class="button" @click="showPassword">{{ t('showPassword') }}</button>
          <button type="button" class="button danger" @click="removeAccount">{{ t('removeAccount') }}</button>
        </div>
      </div>
    </template>
    <div class="dialog-actions"><button type="button" class="button" @click="dialog?.close()">{{ t('close') }}</button></div>
  </dialog>
</template>
