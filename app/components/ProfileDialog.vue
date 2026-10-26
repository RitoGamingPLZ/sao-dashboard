<script setup lang="ts">
// Character profile: skills, gear, weapon goal, and account management.
import { WEAPON_TYPES } from '#shared/game-rules'
import type { AccountSummary } from '#shared/types'

const emit = defineEmits<{ 'open-settings': [account: AccountSummary] }>()
const { t } = useI18n()
const { accountById } = useDashboard()
const dialog = ref<HTMLDialogElement>()
const accountId = ref<string | null>(null)
const account = computed(() => accountById(accountId.value))
const equipment = computed(() => Object.entries(account.value?.player?.equipment ?? {}))
const canReconnect = computed(() => account.value?.alerts.some((text) => text.includes('somewhere else') || text.includes('rejected')))

function open(id: string) {
  accountId.value = id
  dialog.value?.showModal()
}
defineExpose({ open })

const act = (action: string) => accountAction(account.value!.id, action)
const setWeapon = (weapon: string) => runAndReport(() => callApi('PUT', `/api/accounts/${account.value!.id}/weapon`, { weapon: weapon || null }))

async function showPassword() {
  const result = await runAndReport(() => callApi<{ password: string }>('POST', `/api/accounts/${account.value!.id}/password`, {}))
  if (result) prompt(`Password for ${account.value!.name} (copy it now):`, result.password)
}

function rawCommand() {
  const commandText = prompt('Command JSON, e.g. {"type":"startHunt"}')
  if (!commandText) return
  let command: unknown
  try { command = JSON.parse(commandText) } catch { return showToast('That is not valid JSON', 'error') }
  runAndReport(() => callApi('POST', `/api/accounts/${account.value!.id}/action`, { action: 'raw', command }), 'Sent')
}

async function removeAccount() {
  if (!confirm(`Remove ${account.value!.name}? The game account itself is not deleted.`)) return
  if (await runAndReport(() => callApi('DELETE', `/api/accounts/${account.value!.id}`), 'Removed')) dialog.value?.close()
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
          <button type="button" class="button" @click="rawCommand">{{ t('rawCommand') }}</button>
          <button type="button" class="button danger" @click="removeAccount">{{ t('removeAccount') }}</button>
        </div>
      </div>
    </template>
    <div class="dialog-actions"><button type="button" class="button" @click="dialog?.close()">{{ t('close') }}</button></div>
  </dialog>
</template>
