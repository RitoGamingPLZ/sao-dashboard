<script setup lang="ts">
// One compact card per character; shared by the Characters list and party member lists.
import type { AccountSummary } from '#shared/types'

// showActions=false is the compact party-member card: no stats, potions or solo buttons.
const props = withDefaults(defineProps<{ account: AccountSummary, showActions?: boolean }>(), { showActions: true })
defineEmits<{ 'open-profile': [accountId: string] }>()
const { t, alertText, areaName } = useI18n()

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
const isInParty = computed(() => props.account.partyRole != null)
async function removeAccount() {
  if (!confirm(t('confirmRemoveAccount', { name: props.account.name }))) return
  await runAndReport(() => callApi('DELETE', `/api/accounts/${props.account.id}`), t('removedAccount', { name: props.account.name }))
}

const consumables = computed(() => player.value?.consumables)
</script>

<template>
  <div class="char-row" :class="{ dead: player?.isDead }">
    <!-- Masks (they block clicks; ⟳ and ✕ sit above them): a dead character everywhere;
         a party member in the Characters list, since its party drives it. -->
    <div v-if="player?.isDead" class="party-mask dead-mask"><span><b>{{ t('deadMask') }}</b>{{ areaName(player.areaId) }}</span></div>
    <div v-else-if="showActions && isInParty" class="party-mask"><span><b>{{ t('inParty') }}</b>{{ account.partyRole!.partyName }}</span></div>
    <div class="row-head">
      <span class="status-dot" :data-state="statusDotState" :title="statusDotState" />
      <span class="row-lv">Lv {{ player?.level ?? '—' }}</span>
      <button class="link-name" @click="$emit('open-profile', account.id)">{{ account.name }}</button>
      <slot name="leading" />
      <span class="row-rule" />
      <span class="row-status">{{ doingLabel }}<span v-if="account.busyLabel" class="cell-sub"> · {{ account.busyLabel }}</span></span>
      <span class="row-location" :title="player?.areaId || ''">{{ player ? areaName(player.areaId) : '—' }}</span>
      <button class="icon-button" :class="{ urgent: !account.isConnected }" :title="t('reconnect')" :aria-label="`${t('reconnect')} ${account.name}`" @click="reconnect">⟳</button>
      <button v-if="showActions" class="icon-button danger-icon" :title="t('removeAccount')" :aria-label="`${t('removeAccount')} ${account.name}`" @click="removeAccount">✕</button>
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
    <div v-if="showActions" class="row-stats">
      <span class="field"><b>ATK</b> {{ formatNumber(player?.attack) }}</span>
      <span class="field"><b>摳</b> {{ formatCompact(player?.gold) }}</span>
      <span class="field"><b>EXP/m</b> {{ formatNumber(account.rates?.expPerMin) }}</span>
    </div>
    <div v-if="player && showActions" class="row-potion">
      <b>{{ t('potion') }}</b>
      <span>{{ consumables?.autoDrink?.name ?? '—' }}</span>
      <span :class="{ alert: (consumables?.autoDrink?.quantity ?? 0) < account.safety.restock.autoDrinkMin }">×{{ consumables?.autoDrink?.quantity ?? 0 }}</span>
      <span class="muted">·</span>
      <span>{{ consumables?.instant.name }}</span>
      <span :class="{ alert: (consumables?.instant.quantity ?? 0) < account.safety.restock.instantMin }">×{{ consumables?.instant.quantity ?? 0 }}</span>
    </div>
    <div class="row-bottom">
      <div class="row-alerts">
        <p v-for="alert in account.alerts" :key="alert.code" class="alert">{{ alertText(alert) }}</p>
      </div>
      <div class="row-actions">
        <!-- A party member is driven by its party: its own buttons are masked. -->
        <div v-if="showActions" class="solo-actions">
          <button class="button small" :class="{ primary: account.autoFarm }" :aria-pressed="Boolean(account.autoFarm)" :disabled="!player || isInParty" @click="toggleFarm">{{ farmLabel }}</button>
          <button class="button small" :class="{ primary: mode === 'boss' }" :disabled="!player || isInParty" @click="toggleBoss">{{ t('boss') }}</button>
          <button class="button small" :disabled="!player || isInParty" @click="doMission">{{ t('mission') }}</button>
        </div>
        <slot name="trailing" />
      </div>
    </div>
  </div>
</template>
