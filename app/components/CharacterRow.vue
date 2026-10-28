<script setup lang="ts">
// One compact card per character; shared by the Characters list and party member lists.
import { stockLevelsFor } from '#shared/game-rules'
import type { AccountSummary } from '#shared/types'

// showActions=false is the compact party-member card: no stats, potions or solo buttons.
const props = withDefaults(defineProps<{ account: AccountSummary, showActions?: boolean }>(), { showActions: true })
defineEmits<{ 'open-profile': [accountId: string] }>()
const { t, alertText, areaName } = useI18n()

const player = computed(() => props.account.player)
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

// 練功 = level up and progress floors (moves to better areas, beats each floor boss when strong enough).
const toggleFarm = () => accountAction(props.account.id, props.account.autoFarm ? 'stopHunt' : 'farm')
// While 練功 is on, the button says what a click does: stop it.
const farmLabel = computed(() => {
  if (!props.account.autoFarm) return t('farm')
  return props.account.autoFarm.untilLevel ? `${t('stopFarm')} (→ Lv${props.account.autoFarm.untilLevel})` : t('stopFarm')
})
// The bot's current step in words, e.g. "boss: floor 6" → 王戰 · 第6層.
const busyText = computed(() => {
  const label = props.account.busyLabel
  if (!label) return ''
  const bossMatch = /^boss: floor (\d+)/.exec(label)
  if (bossMatch) return t('busy_boss', { floor: bossMatch[1]! })
  const areaMatch = /^(farm|go to|party: lead to) (\S+)/.exec(label)
  if (areaMatch) return `${t(areaMatch[1] === 'farm' ? 'busy_farm' : 'busy_goto')} ${areaName(areaMatch[2])}`
  if (label.startsWith('missions')) return t('busy_missions')
  if (label === 'restock' || label === 'refit') return t(`busy_${label}`)
  return label
})
// 王戰 = boss farming (on/off); 任務 = missions (on/off); 修整 = pause everything and refit.
const toggleBoss = () => accountAction(props.account.id, 'startBoss')
const doMission = () => accountAction(props.account.id, 'completeMission')
const reconnect = () => accountAction(props.account.id, 'reconnect')
const refit = () => accountAction(props.account.id, 'refit') // 修整: town, quests, restock, best gear, enhance
const isInParty = computed(() => props.account.partyRole != null)
async function removeAccount() {
  if (!confirm(t('confirmRemoveAccount', { name: props.account.name }))) return
  await runAndReport(() => callApi('DELETE', `/api/accounts/${props.account.id}`), t('removedAccount', { name: props.account.name }))
}

const consumables = computed(() => player.value?.consumables)
const stockNow = computed(() => stockLevelsFor(props.account.safety.restock, player.value?.level ?? 1)) // scaled by level
const formatPct = (value: number | null | undefined) => (value == null ? '—' : `${Math.round(value * 100)}%`)
const statsTitle = computed(() => (player.value?.stats?.isEstimated ? t('statsEstimated') : ''))
</script>

<template>
  <div class="char-row" :class="{ dead: player?.isDead }">
    <!-- Masks (they block clicks; ⟳ and ✕ sit above them): dead or refitting, everywhere;
         a party member in the Characters list, since its party drives it. -->
    <div v-if="player?.isDead" class="party-mask dead-mask"><span><b>{{ t('deadMask') }}</b>{{ areaName(player.areaId) }}</span></div>
    <div v-else-if="account.busyLabel === 'refit'" class="party-mask"><span><b>{{ t('refitting') }} <i class="spinner" aria-hidden="true" /></b>{{ areaName(player?.areaId) }}</span></div>
    <div v-else-if="showActions && isInParty" class="party-mask"><span><b>{{ t('inParty') }}</b>{{ account.partyRole!.partyName }}</span></div>
    <div class="row-head">
      <span class="status-dot" :data-state="statusDotState" :title="statusDotState" />
      <span class="row-lv">Lv {{ player?.level ?? '—' }}</span>
      <button class="link-name" @click="$emit('open-profile', account.id)">{{ account.name }}</button>
      <slot name="leading" />
      <span class="row-rule" />
      <span class="row-status" :title="busyText ? doingLabel : ''">{{ busyText || doingLabel }}</span>
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
      <span class="field" :title="statsTitle"><b>ATK</b> {{ formatNumber(player?.attack) }}</span>
      <span class="field" :title="statsTitle"><b>DEF</b> {{ formatNumber(player?.stats?.def) }}</span>
      <span class="field" :title="t('speedHint')"><b>SPD</b> {{ formatNumber(player?.stats?.speed) }}</span>
      <span class="field"><b>摳</b> {{ formatCompact(player?.gold) }}</span>
      <span class="field" :title="statsTitle"><b>CRIT</b> {{ formatPct(player?.stats?.crit) }}</span>
      <span class="field" :title="t('critDmgHint')"><b>CDMG</b> {{ formatPct(player?.stats?.critDmg) }}</span>
      <span class="field"><b>EXP/m</b> {{ formatNumber(account.rates?.expPerMin) }}</span>
      <span class="field" :title="t('topFloorHint')"><b>{{ t('topFloor') }}</b> {{ player?.frontierFloor ?? '—' }}</span>
    </div>
    <div v-if="player?.nextBoss && showActions" class="row-potion" :title="t('bossNeedHint')">
      <b>{{ t('nextBoss', { floor: player.nextBoss.floor }) }}</b>
      <span v-if="player.nextBoss.hpNeeded != null" :class="{ 'form-error': player.nextBoss.hp! < player.nextBoss.hpNeeded }">
        {{ t('bossNeed', { need: formatNumber(player.nextBoss.hpNeeded), hp: formatNumber(player.nextBoss.hp) }) }}
      </span>
      <span v-if="player.nextBoss.hpBars != null" :class="{ 'form-error': player.nextBoss.hpBars > 4 }">
        {{ t('bossCost', { seconds: player.nextBoss.fightSeconds ?? '?', bars: player.nextBoss.hpBars }) }}
      </span>
      <span v-if="player.nextBoss.hpNeeded == null" :class="(player.level ?? 0) < (player.nextBoss.needLevel ?? 0) ? 'form-error' : 'muted'">{{ t('bossUnknown', { level: player.nextBoss.needLevel ?? '?' }) }}</span>
    </div>
    <div v-if="player && showActions" class="row-potion">
      <b>{{ t('potion') }}</b>
      <span>{{ consumables?.autoDrink?.name ?? '—' }}</span>
      <span :class="{ alert: (consumables?.autoDrink?.quantity ?? 0) < stockNow.autoDrinkMin }">×{{ consumables?.autoDrink?.quantity ?? 0 }}</span>
      <span class="muted">·</span>
      <span>{{ consumables?.instant.name }}</span>
      <span :class="{ alert: (consumables?.instant.quantity ?? 0) < stockNow.instantMin }">×{{ consumables?.instant.quantity ?? 0 }}</span>
    </div>
    <div class="row-bottom">
      <div class="row-alerts">
        <p v-for="alert in account.alerts.slice(0, 3)" :key="alert.code" class="alert" :title="alertText(alert)">{{ alertText(alert) }}</p>
      </div>
      <div class="row-actions">
        <!-- A party member is driven by its party: its own buttons are masked. -->
        <div v-if="showActions" class="solo-actions">
          <button class="button small" :class="{ primary: account.autoFarm }" :aria-pressed="Boolean(account.autoFarm)" :disabled="!player || isInParty" @click="toggleFarm">{{ farmLabel }}</button>
          <button class="button small" :class="{ primary: account.isBossFarming }" :aria-pressed="account.isBossFarming" :disabled="!player || isInParty" @click="toggleBoss">{{ account.isBossFarming ? t('stopBossFarm') : t('boss') }}</button>
          <button class="button small" :class="{ primary: account.isOnMission }" :aria-pressed="account.isOnMission" :disabled="!player || isInParty" @click="doMission">{{ account.isOnMission ? t('stopMission') : t('mission') }}</button>
          <button class="button small" :disabled="!player || isInParty || account.busyLabel === 'refit'" @click="refit">{{ t('partyMode_rest') }}</button>
        </div>
        <slot name="trailing" />
      </div>
    </div>
  </div>
</template>
