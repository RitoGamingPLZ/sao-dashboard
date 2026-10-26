<script setup lang="ts">
import { TOP_FLOOR, WORLD_AREAS, areasOnFloor, parseArea } from '#shared/game-rules'
import type { Party, PartySummary } from '#shared/types'

const props = defineProps<{ party: PartySummary }>()
defineEmits<{ 'open-profile': [accountId: string] }>()
const { t } = useI18n()
const { accounts, takenAccountIds, accountById, patchParty } = useDashboard()

const currentGoal = parseArea(props.party.goal?.areaId)
const goalFloor = ref(currentGoal?.floor ?? 1)
const goalAreaId = ref(props.party.goal?.areaId ?? 'f1-town')
const goalAreaOptions = computed(() => areasOnFloor(goalFloor.value).filter((areaId) => !WORLD_AREAS[areaId]!.secret))
watch(goalFloor, () => { if (!goalAreaOptions.value.includes(goalAreaId.value)) goalAreaId.value = goalAreaOptions.value[0]! })
const areaLabel = (areaId: string) => {
  const area = WORLD_AREAS[areaId]!
  return area.maxLevel == null ? area.name : `${area.name} (Lv${area.minLevel ?? area.maxLevel}–${area.maxLevel}${area.aggressive ? ', aggressive' : ''})`
}
const addMemberQuery = ref('')
const isAddMemberOpen = ref(false)
const settingsDialog = ref<HTMLDialogElement>()
const floorOptions = Array.from({ length: TOP_FLOOR }, (_, i) => i + 1)

const members = computed(() => props.party.memberIds.map(accountById).filter((account) => account != null))
const filteredFreeAccounts = computed(() => {
  const query = addMemberQuery.value.trim().toLowerCase()
  return accounts.value.filter((account) => !takenAccountIds.value.has(account.id) && (!query || account.name.toLowerCase().includes(query)))
})

async function partyCall(method: string, path: string, body?: unknown, successMessage?: string) {
  const result = await runAndReport(() => callApi<{ party?: Party }>(method, path, body), successMessage)
  if (result?.party) patchParty(result.party)
  return result
}
const update = (changes: Partial<Party>) => partyCall('PUT', `/api/parties/${props.party.id}`, changes)

function selectMember(id: string) {
  update({ memberIds: [...props.party.memberIds, id] })
  addMemberQuery.value = ''
  isAddMemberOpen.value = false
}
const removeMember = (id: string) => update({ memberIds: props.party.memberIds.filter((memberId) => memberId !== id) })

function startParty(shouldHunt: boolean) {
  const areaId = goalAreaId.value
  const message = shouldHunt ? 'Party heading out' : 'Party holding'
  if (props.party.isActive) partyCall('POST', `/api/parties/${props.party.id}/goal`, { areaId, shouldHunt }, message)
  else partyCall('POST', `/api/parties/${props.party.id}/start`, { goal: { areaId, shouldHunt } }, message)
}
const stopParty = () => partyCall('POST', `/api/parties/${props.party.id}/stop`, {}, 'Party stopped')
function deleteParty() {
  if (confirm(`${t('deleteParty')} "${props.party.name}"?`)) runAndReport(() => callApi('DELETE', `/api/parties/${props.party.id}`), 'Party deleted')
}
</script>

<template>
  <article class="party-card" :class="{ active: party.isActive }">
    <div class="card-head">
      <h3>{{ party.name }}</h3>
      <span class="badge" :class="{ on: party.isActive }">{{ party.isActive ? 'ACTIVE' : 'off' }}</span>
      <span class="party-status">{{ party.status }}</span>
      <span class="head-actions">
        <button class="button small" @click="settingsDialog?.showModal()">{{ t('settings') }}</button>
        <button class="button small danger" @click="deleteParty">{{ t('deleteParty') }}</button>
      </span>
    </div>
    <!-- Where to go, and what to do there, on one row. -->
    <div class="party-goal">
      <select v-model.number="goalFloor" :aria-label="t('goalFloor')">
        <option v-for="floor in floorOptions" :key="floor" :value="floor">F{{ floor }}</option>
      </select>
      <select v-model="goalAreaId" class="goal-area" :aria-label="t('goalAreaKind')">
        <option v-for="areaId in goalAreaOptions" :key="areaId" :value="areaId">{{ areaLabel(areaId) }}</option>
      </select>
      <button class="button small primary" @click="startParty(true)">{{ party.isActive ? t('huntHere') : t('startParty') }}</button>
      <button class="button small" @click="startParty(false)">{{ t('hold') }}</button>
      <button v-if="party.isActive" class="button small danger" @click="stopParty">{{ t('stopParty') }}</button>
    </div>
    <div class="combo">
      <input
        v-model="addMemberQuery" type="text" :placeholder="t('addMember')" :aria-label="t('addMember')"
        @focus="isAddMemberOpen = true" @blur="isAddMemberOpen = false" @keydown.esc="isAddMemberOpen = false"
      >
      <ul v-if="isAddMemberOpen" class="combo-list">
        <li v-for="account in filteredFreeAccounts" :key="account.id" class="combo-option" @mousedown.prevent @click="selectMember(account.id)">{{ account.name }}</li>
        <li v-if="!filteredFreeAccounts.length" class="muted">{{ t('noFree') }}</li>
      </ul>
    </div>

    <dialog ref="settingsDialog" class="dialog">
      <h3>{{ t('settings') }} — {{ party.name }}</h3>
      <div class="stack">
        <label>{{ t('retreatLabel') }}
          <input type="number" min="10" max="90" :value="party.tankRetreatPct" @change="update({ tankRetreatPct: Number(($event.target as HTMLInputElement).value) })">
        </label>
        <label class="checkbox">
          <input type="checkbox" :checked="party.shouldSyncInGame" @change="update({ shouldSyncInGame: ($event.target as HTMLInputElement).checked })"> {{ t('syncInGame') }}
        </label>
        <div class="dialog-actions">
          <button type="button" class="button" @click="settingsDialog?.close()">{{ t('close') }}</button>
        </div>
      </div>
    </dialog>

    <div class="char-list">
      <p v-if="!members.length" class="empty">{{ t('noMembers') }}</p>
      <CharacterRow v-for="member in members" :key="member.id" :account="member" :show-actions="false" @open-profile="$emit('open-profile', $event)">
        <template #leading>
          <span v-if="member.id === party.leaderId" class="badge role-leader">{{ t('leader') }}</span>
          <span v-if="member.id === party.tankId" class="badge role-tank">{{ t('tank') }}</span>
        </template>
        <template #trailing>
          <span class="row-party-controls">
            <button v-if="member.id !== party.leaderId" class="button small" @click="update({ leaderId: member.id })">{{ t('leader') }}</button>
            <button v-if="member.id === party.tankId" class="button small" @click="update({ tankId: null })">{{ t('untank') }}</button>
            <button v-else class="button small" @click="update({ tankId: member.id })">{{ t('tank') }}</button>
            <button class="button small danger icon-button" :aria-label="`Remove ${member.name}`" @click="removeMember(member.id)">✕</button>
          </span>
        </template>
      </CharacterRow>
    </div>
  </article>
</template>
