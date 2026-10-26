<script setup lang="ts">
import type { Party } from '#shared/types'

const { t } = useI18n()
const { accounts, takenAccountIds, patchParty } = useDashboard()
const dialog = ref<HTMLDialogElement>()
const name = ref('')
const memberIds = ref<string[]>([])
const retreatPct = ref(40)
const errorText = ref('')
const freeAccounts = computed(() => accounts.value.filter((account) => !takenAccountIds.value.has(account.id)))

function open() {
  name.value = ''
  memberIds.value = []
  retreatPct.value = 40
  errorText.value = ''
  dialog.value?.showModal()
}
defineExpose({ open })

async function submit() {
  errorText.value = ''
  let party: Party
  try {
    party = await callApi<Party>('POST', '/api/parties', { name: name.value })
  } catch (error) {
    errorText.value = (error as Error).message
    return
  }
  patchParty(party)
  if (memberIds.value.length || retreatPct.value !== 40) {
    const result = await runAndReport(() => callApi<{ party: Party }>('PUT', `/api/parties/${party.id}`, { memberIds: memberIds.value, tankRetreatPct: retreatPct.value }))
    if (result) patchParty(result.party)
  }
  dialog.value?.close()
  showToast('Party created')
}
</script>

<template>
  <dialog ref="dialog" class="dialog">
    <h3>{{ t('newParty') }}</h3>
    <form class="stack" @submit.prevent="submit">
      <label>{{ t('partyNamePlaceholder') }} <input v-model="name" required maxlength="32" autofocus></label>
      <div>
        <div class="section-title">{{ t('addMember') }}</div>
        <p v-if="!freeAccounts.length" class="muted">{{ t('noFree') }}</p>
        <label v-for="account in freeAccounts" :key="account.id" class="checkbox">
          <input v-model="memberIds" type="checkbox" :value="account.id"> {{ account.name }}
        </label>
      </div>
      <label>{{ t('retreatLabel') }} <input v-model.number="retreatPct" type="number" min="10" max="90"></label>
      <p class="form-error">{{ errorText }}</p>
      <div class="dialog-actions">
        <button type="button" class="button" @click="dialog?.close()">{{ t('close') }}</button>
        <button class="button primary">{{ t('create') }}</button>
      </div>
    </form>
  </dialog>
</template>
