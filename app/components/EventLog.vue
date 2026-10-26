<script setup lang="ts">
const { t } = useI18n()
const { accounts, logEvents } = useDashboard()
const filterAccountId = ref('')
const visibleEvents = computed(() =>
  logEvents.value.filter((event) => !filterAccountId.value || event.accountId === filterAccountId.value).slice(-120).reverse())
</script>

<template>
  <section class="widget" aria-labelledby="log-heading">
    <div class="widget-head">
      <h2 id="log-heading">{{ t('eventLog') }}</h2>
      <select v-model="filterAccountId" class="log-filter" :aria-label="t('filterByAccount')">
        <option value="">{{ t('allAccounts') }}</option>
        <option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.name }}</option>
      </select>
    </div>
    <ol class="event-log">
      <li v-for="(event, i) in visibleEvents" :key="`${event.ts}-${i}`" class="log-row" :class="`kind-${event.kind}`">
        <time>{{ formatTime(event.ts) }}</time>
        <span class="log-account">{{ event.account }}</span>
        <span class="log-detail">{{ event.source ? `${event.detail} (${event.source})` : event.detail }}</span>
      </li>
    </ol>
  </section>
</template>
