<script setup lang="ts">
// One compact card per character; shared by the Characters list and party member lists.
import type { AccountSummary } from '#shared/types'

const props = withDefaults(defineProps<{ account: AccountSummary, showActions?: boolean }>(), { showActions: true })
defineEmits<{ 'open-profile': [accountId: string] }>()
const { t, alertText } = useI18n()

const player = computed(() => props.account.player)
const mode = computed(() => (player.value?.activity === 'hunting' ? 'farm' : player.value?.activity === 'boss' ? 'boss' : 'idle'))
const statusDotState = computed(() => (!props.account.isConnected ? 'down' : props.account.isStale ? 'stale' : 'live'))
const clampPct = (value: number | null | undefined) => `${Math.max(0, Math.min(100, value ?? 0))}%`
const hpBarClass = computed(() => {
  const hpPct = player.value?.hpPct
  if (hpPct == null) return 'sb-hp'
  const thresholds = player.value!.activity === 'boss' ? props.account.safety.boss : props.account.safety.normal
  if (hpPct > thresholds.potionPct + 15) return 'sb-hp'
  return hpPct <= thresholds.emergencyPct ? 'sb-hp low' : 'sb-hp warn'
})
const doingLabel = computed(() => (player.value ? t(`doing_${player.value.activity || 'idle'}`) : '—'))
const hpText = computed(() => {
  if (!player.value) return '—'
  const maxHp = formatNumber(player.value.maxHp)
  return `${formatNumber(player.value.hp)} / ${player.value.isMaxHpEstimated ? '~' : ''}${maxHp}`
})
const expText = computed(() => (player.value?.expPct != null ? `${player.value.expPct}%` : formatNumber(player.value?.exp)))

// Farm = keep-farming mode (moves to better areas, restarts after interruptions).
const toggleFarm = () => accountAction(props.account.id, props.account.autoFarm ? 'stopHunt' : 'farm')
const farmLabel = computed(() => (props.account.autoFarm?.untilLevel ? `${t('farm')} → Lv${props.account.autoFarm.untilLevel}` : t('farm')))
const toggleBoss = () => accountAction(props.account.id, mode.value === 'boss' ? 'stopBoss' : 'startBoss')
const doMission = () => accountAction(props.account.id, 'completeMission')
const reconnect = () => accountAction(props.account.id, 'reconnect')

const potion = computed(() => player.value?.consumables.autoDrink)
</script>

<template>
  <div class="char-row" :class="{ dead: player?.isDead }">
    <div class="row-head">
      <span class="status-dot" :data-state="statusDotState" :title="statusDotState" />
      <span class="row-lv">Lv {{ player?.level ?? '—' }}</span>
      <button class="link-name" @click="$emit('open-profile', account.id)">{{ account.name }}</button>
      <slot name="leading" />
      <span class="row-rule" />
      <span class="row-status">{{ doingLabel }}<span v-if="account.busyLabel" class="cell-sub"> · {{ account.busyLabel }}</span></span>
      <span class="row-location" :title="player?.areaId || ''">{{ player?.areaId || '—' }}</span>
      <button class="icon-button" :class="{ urgent: !account.isConnected }" :title="t('reconnect')" :aria-label="`${t('reconnect')} ${account.name}`" @click="reconnect">⟳</button>
    </div>
    <div class="row-bars">
      <div class="row-bar">
        <div class="row-bar-track"><b>HP</b><span class="sb-track mini" :class="hpBarClass"><i :style="{ width: clampPct(player?.hpPct) }" /></span></div>
        <span class="cell-sub" :title="player?.isMaxHpEstimated ? 'Max HP estimated from the highest HP seen' : ''">{{ hpText }}</span>
      </div>
      <div class="row-bar">
        <div class="row-bar-track"><b>EXP</b><span class="sb-track mini sb-exp"><i :style="{ width: clampPct(player?.expPct) }" /></span></div>
        <span class="cell-sub">{{ expText }}</span>
      </div>
    </div>
    <div class="row-stats">
      <span class="field"><b>ATK</b> {{ formatNumber(player?.attack) }}</span>
      <span class="field"><b>摳</b> {{ formatCompact(player?.gold) }}</span>
      <span class="field"><b>EXP/m</b> {{ formatNumber(account.rates?.expPerMin) }}</span>
    </div>
    <div v-if="player" class="row-potion">
      <b>{{ t('potion') }}</b>
      <span>{{ potion?.name ?? potion?.itemId ?? '—' }}</span>
      <span :class="{ alert: (potion?.quantity ?? 0) < account.safety.restock.autoDrinkMin }">×{{ potion?.quantity ?? 0 }}</span>
      <span class="muted">/ {{ t('keep') }} {{ account.safety.restock.autoDrinkTarget }}</span>
    </div>
    <div class="row-bottom">
      <div class="row-alerts">
        <p v-for="alert in account.alerts" :key="alert.code" class="alert">{{ alertText(alert) }}</p>
      </div>
      <div class="row-actions">
        <template v-if="showActions">
          <button class="button small" :class="{ primary: account.autoFarm }" :aria-pressed="Boolean(account.autoFarm)" :disabled="!player" @click="toggleFarm">{{ farmLabel }}</button>
          <button class="button small" :class="{ primary: mode === 'boss' }" :disabled="!player" @click="toggleBoss">{{ t('boss') }}</button>
          <button class="button small" :disabled="!player" @click="doMission">{{ t('mission') }}</button>
        </template>
        <slot name="trailing" />
      </div>
    </div>
  </div>
</template>
