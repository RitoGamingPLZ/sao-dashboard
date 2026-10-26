<script setup lang="ts">
const { t } = useI18n()
const { accounts, parties } = useDashboard()

const tiles = computed(() => {
  const list = accounts.value
  const sum = (pick: (account: typeof list[number]) => number | null | undefined) => list.reduce((total, account) => total + (pick(account) ?? 0), 0)
  const alertCount = sum((account) => account.alerts.length)
  const goldPerHour = sum((account) => account.rates.goldPerHour)
  return [
    { label: t('online'), value: `${list.filter((account) => account.isConnected).length} / ${list.length}` },
    { label: t('totalGold'), value: formatCompact(sum((account) => account.player?.gold)) },
    { label: t('goldPerHour'), value: goldPerHour ? formatCompact(goldPerHour) : '—' },
    { label: t('activeParties'), value: String(parties.value.filter((party) => party.isActive).length) },
    { label: t('alerts'), value: String(alertCount), tone: alertCount ? 'warn' : '' },
  ]
})
</script>

<template>
  <section class="overview" aria-label="Totals">
    <div v-for="tile in tiles" :key="tile.label" class="stat-tile" :class="tile.tone">
      <span class="stat-label">{{ tile.label }}</span>
      <span class="stat-value">{{ tile.value }}</span>
    </div>
  </section>
</template>
