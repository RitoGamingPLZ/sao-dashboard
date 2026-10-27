<script setup lang="ts">
// Character profile: skills, gear, weapon goal, potions, and account management.
import { GEAR, ITEMS, SKILLS, WEAPON_TYPES, shopStock } from '#shared/game-rules'
import type { AccountSummary } from '#shared/types'

const emit = defineEmits<{ 'open-settings': [account: AccountSummary] }>()
const { t, gearName, skillName } = useI18n()
const { accountById } = useDashboard()
const dialog = ref<HTMLDialogElement>()
const equipmentDialog = ref<HTMLDialogElement>()
const skillsDialog = ref<HTMLDialogElement>()
const accountId = ref<string | null>(null)
const account = computed(() => accountById(accountId.value))
// Every slot, worn or empty, with the piece's name, enhancement and main bonuses.
const SLOTS = ['weapon', 'offhand', 'armor', 'head', 'feet', 'accessory', 'ring2', 'neck']
const gearRows = computed(() => SLOTS.map((slot) => {
  const worn = account.value?.player?.gear.find((piece) => piece.slot === slot)
  return { slot, worn, bonus: worn ? bonusText(GEAR[worn.itemId]?.bonus) : '' }
}).filter((row) => row.worn || ['weapon', 'armor', 'head', 'feet', 'accessory'].includes(row.slot) || ownedFor(row.slot).length))
const BONUS_LABELS: Record<string, string> = { atk: 'ATK', def: 'DEF', maxHp: 'HP', agi: 'AGI', crit: 'CRIT', critDmg: 'CDMG', evade: 'EVA', block: 'BLK' }
function bonusText(bonus?: Record<string, number>) {
  return Object.entries(bonus ?? {}).map(([key, value]) => `${BONUS_LABELS[key] ?? key} +${value < 1 ? `${Math.round(value * 100)}%` : value}`).join(' · ')
}
const skillRows = computed(() => (account.value?.player?.skills ?? []).map((skillId) => ({ skillId, info: SKILLS[skillId] })))
// Editors: equip from the bag (or empty a slot), and choose the active skills.
const isChangingGear = ref(false)
const chosenSkills = ref<string[]>([])
const wornRef = (slot: string) => account.value?.player?.equipment?.[slot] ?? ''
const ownedFor = (slot: string) => (account.value?.player?.ownedGear ?? [])
  .filter((piece) => piece.slot === slot || (slot === 'ring2' && piece.slot === 'accessory'))
async function changeGear(slot: string, ref: string) {
  isChangingGear.value = true
  const command = ref ? { type: 'equip', itemId: ref, slot } : { type: 'unequip', slot }
  await runAndReport(() => callApi('POST', `/api/accounts/${account.value!.id}/action`, { action: 'raw', command }), t('settingsSaved'))
  isChangingGear.value = false
}
function openSkills() {
  chosenSkills.value = [...(account.value?.player?.skillSlots ?? [])].filter((skillId) => account.value?.player?.skillChoices.includes(skillId))
  skillsDialog.value?.showModal()
}
async function saveSkills() {
  const command = { type: 'setSkillSlots', skillIds: chosenSkills.value }
  if (await runAndReport(() => callApi('POST', `/api/accounts/${account.value!.id}/action`, { action: 'raw', command }), t('settingsSaved'))) skillsDialog.value?.close()
}
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
            <option v-for="weapon in WEAPON_TYPES" :key="weapon" :value="weapon">{{ t(`weapon_${weapon}`) }}</option>
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
        <fieldset class="threshold-grid gear-grid">
          <legend>{{ t('equipment') }}</legend>
          <template v-for="row in gearRows" :key="row.slot">
            <span class="muted">{{ t(`slot_${row.slot}`) }}</span>
            <span>{{ row.worn ? gearName(row.worn.itemId) : t('emptySlot') }}<b v-if="row.worn?.plus"> +{{ row.worn.plus }}</b></span>
            <span class="muted small-text">{{ row.bonus }}</span>
          </template>
        </fieldset>
        <fieldset class="threshold-grid gear-grid">
          <legend>{{ t('skills') }}</legend>
          <template v-if="skillRows.length">
            <span class="muted" /><span class="muted">{{ t('skillPower') }}</span><span class="muted">{{ t('skillCooldown') }}</span>
            <template v-for="row in skillRows" :key="row.skillId">
              <span>{{ skillName(row.skillId) }}<b v-if="account.player?.skillSlots.includes(row.skillId)" :title="t('activeSkill')"> ★</b></span>
              <span>{{ row.info?.multiplier ? `×${row.info.multiplier}${row.info.hits > 1 ? ` · ${row.info.hits} hits` : ''}` : '—' }}</span>
              <span>{{ row.info?.cooldownMs ? `${row.info.cooldownMs / 1000} s` : '—' }}</span>
            </template>
          </template>
          <span v-else class="muted">{{ t('noData') }}</span>
        </fieldset>
        <p v-if="account.haltReason" class="alert">{{ account.haltReason }} — <button class="button small" @click="act('resume')">{{ t('resumeBot') }}</button></p>
        <div class="dialog-actions" style="justify-content:flex-start; flex-wrap:wrap;">
          <button v-if="canReconnect" type="button" class="button primary" @click="act('reconnect')">{{ t('reconnect') }}</button>
          <button type="button" class="button" @click="equipmentDialog?.showModal()">{{ t('equipment') }}</button>
          <button type="button" class="button" @click="openSkills">{{ t('skills') }}</button>
          <button type="button" class="button" @click="emit('open-settings', account)">{{ t('healthPotions') }}</button>
          <button type="button" class="button" @click="showPassword">{{ t('showPassword') }}</button>
        </div>
      </div>

      <!-- Equipment and skills open on top of the profile, like 血量與補藥. -->
      <!-- Change gear / skills, opened from the buttons below (like 血量與補藥). -->
      <dialog ref="equipmentDialog" class="dialog">
        <h3>{{ t('equipment') }} — {{ account.name }}</h3>
        <p class="hint">{{ t('equipHint') }}</p>
        <fieldset class="threshold-grid gear-grid">
          <template v-for="row in gearRows" :key="row.slot">
            <span class="muted">{{ t(`slot_${row.slot}`) }}</span>
            <select :value="row.worn ? wornRef(row.slot) : ''" :aria-label="t(`slot_${row.slot}`)" :disabled="isChangingGear" @change="changeGear(row.slot, ($event.target as HTMLSelectElement).value)">
              <option value="">{{ t('emptySlot') }}</option>
              <option v-if="row.worn" :value="wornRef(row.slot)">{{ gearName(row.worn.itemId) }}{{ row.worn.plus ? ` +${row.worn.plus}` : '' }}</option>
              <option v-for="piece in ownedFor(row.slot)" :key="piece.ref" :value="piece.ref">{{ gearName(piece.itemId) }}{{ piece.plus ? ` +${piece.plus}` : '' }} · Lv{{ GEAR[piece.itemId]?.reqLevel ?? 1 }}</option>
            </select>
            <span class="muted small-text">{{ row.bonus }}</span>
          </template>
        </fieldset>
        <div class="dialog-actions"><button type="button" class="button" @click="equipmentDialog?.close()">{{ t('close') }}</button></div>
      </dialog>
      <dialog ref="skillsDialog" class="dialog">
        <h3>{{ t('skills') }} — {{ account.name }}</h3>
        <p class="hint">{{ t('skillSlotsHint', { count: account.player?.skillSlotCount ?? 0 }) }}</p>
        <div class="stack">
          <label v-for="skillId in account.player?.skillChoices ?? []" :key="skillId" class="checkbox">
            <input v-model="chosenSkills" type="checkbox" :value="skillId" :disabled="!chosenSkills.includes(skillId) && chosenSkills.length >= (account.player?.skillSlotCount ?? 0)">
            {{ skillName(skillId) }} <span class="muted">×{{ SKILLS[skillId]?.multiplier }} · {{ (SKILLS[skillId]?.cooldownMs ?? 0) / 1000 }} s</span>
          </label>
          <p v-if="!(account.player?.skillChoices ?? []).length" class="muted">{{ t('noData') }}</p>
        </div>
        <div class="dialog-actions">
          <button type="button" class="button" @click="skillsDialog?.close()">{{ t('cancel') }}</button>
          <button type="button" class="button primary" :disabled="!chosenSkills.length" @click="saveSkills">{{ t('save') }}</button>
        </div>
      </dialog>
    </template>
    <div class="dialog-actions"><button type="button" class="button" @click="dialog?.close()">{{ t('close') }}</button></div>
  </dialog>
</template>
