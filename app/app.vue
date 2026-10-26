<script setup lang="ts">
// The whole dashboard is one page: totals, parties, characters, and the event log docked at the bottom.
import { MAX_ACCOUNTS } from '#shared/game-rules'
import AddAccountDialog from '~/components/AddAccountDialog.vue'
import CreatePartyDialog from '~/components/CreatePartyDialog.vue'
import ProfileDialog from '~/components/ProfileDialog.vue'
import SafetyDialog from '~/components/SafetyDialog.vue'

const { t } = useI18n()
const { accounts, parties, connect } = useDashboard()
const addAccountDialog = ref<InstanceType<typeof AddAccountDialog>>()
const createPartyDialog = ref<InstanceType<typeof CreatePartyDialog>>()
const profileDialog = ref<InstanceType<typeof ProfileDialog>>()
const safetyDialog = ref<InstanceType<typeof SafetyDialog>>()
const activePartiesCount = computed(() => parties.value.filter((party) => party.isActive).length)
const openProfile = (accountId: string) => profileDialog.value?.open(accountId)

onMounted(connect)
</script>

<template>
  <div>
    <AppHeader :is-full="accounts.length >= MAX_ACCOUNTS" @add-account="addAccountDialog?.open()" />
    <main>
      <OverviewTiles />
      <div class="widgets-grid">
        <section class="widget" aria-labelledby="parties-heading">
          <div class="widget-head">
            <h2 id="parties-heading">{{ t('parties') }} <span class="muted">({{ activePartiesCount }} {{ t('active') }})</span></h2>
            <button class="button small" @click="createPartyDialog?.open()">{{ t('newParty') }}</button>
          </div>
          <p v-if="!parties.length" class="empty">{{ t('noParties') }}</p>
          <PartyCard v-for="party in parties" :key="party.id" :party="party" @open-profile="openProfile" />
        </section>

        <section class="widget" aria-labelledby="accounts-heading">
          <div class="widget-head">
            <h2 id="accounts-heading">{{ t('characters') }} ({{ accounts.length }}/{{ MAX_ACCOUNTS }})</h2>
            <button class="button small" :disabled="accounts.length >= MAX_ACCOUNTS" @click="addAccountDialog?.open()">{{ t('addAccount') }}</button>
          </div>
          <p v-if="!accounts.length" class="empty">{{ t('noAccounts') }}</p>
          <div v-else class="char-list">
            <CharacterRow v-for="account in accounts" :key="account.id" :account="account" @open-profile="openProfile" />
          </div>
        </section>
      </div>
    </main>
    <EventLog />

    <AddAccountDialog ref="addAccountDialog" />
    <CreatePartyDialog ref="createPartyDialog" />
    <ProfileDialog ref="profileDialog" @open-settings="safetyDialog?.open($event)" />
    <SafetyDialog ref="safetyDialog" />
    <ToastStack />
  </div>
</template>
