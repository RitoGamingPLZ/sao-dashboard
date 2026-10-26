<script setup lang="ts">
import { TOP_FLOOR, WORLD_AREAS, areasOnFloor, parseArea } from '#shared/game-rules'
import type { Party, PartyMode, PartySummary } from '#shared/types'

const props = defineProps<{ party: PartySummary }>()
defineEmits<{ 'open-profile': [accountId: string] }>()
const { t, areaLabel, areaName, partyStatusText } = useI18n()
const { accountById, patchParty } = useDashboard()

// Where the party is now: its goal while active, otherwise where the leader stands.
const currentAreaId = computed(() => (props.party.isActive && props.party.goal ? props.party.goal.areaId : accountById(props.party.leaderId)?.player?.areaId) ?? null)
const currentMode = computed<PartyMode | null>(() => (props.party.isActive ? props.party.goal?.mode ?? null : null))
const goalFloor = ref(parseArea(currentAreaId.value)?.floor ?? 1)
const goalAreaId = ref(currentAreaId.value ?? 'f1-town')
// Follow the party when it moves (or a pull-back sends it to town).
watch(currentAreaId, (areaId) => { if (areaId) { goalFloor.value = parseArea(areaId)?.floor ?? goalFloor.value; goalAreaId.value = areaId } })
const isNewLocation = computed(() => goalAreaId.value !== currentAreaId.value)
const MODES: PartyMode[] = ['rest', 'standby', 'fight']
const goalAreaOptions = computed(() => areasOnFloor(goalFloor.value).filter((areaId) => !WORLD_AREAS[areaId]!.secret))
watch(goalFloor, () => { if (!goalAreaOptions.value.includes(goalAreaId.value)) goalAreaId.value = goalAreaOptions.value[0]! })

const settingsDialog = ref<HTMLDialogElement>()
const floorOptions = Array.from({ length: TOP_FLOOR }, (_, i) => i + 1)

const members = computed(() => props.party.memberIds.map(accountById).filter((account) => account != null))

async function partyCall(method: string, path: string, body?: unknown, successMessage?: string) {
  const result = await runAndReport(() => callApi<{ party?: Party }>(method, path, body), successMessage)
  if (result?.party) patchParty(result.party)
  return result
}
const update = (changes: Partial<Party>) => partyCall('PUT', `/api/parties/${props.party.id}`, changes)

const addMember = (id: string) => update({ memberIds: [...props.party.memberIds, id] })
const removeMember = (id: string) => update({ memberIds: props.party.memberIds.filter((memberId) => memberId !== id) })

const goToSelected = () => partyCall('POST', `/api/parties/${props.party.id}/goal`, { areaId: goalAreaId.value }, t('partyMoving'))
const setMode = (mode: PartyMode) => partyCall('POST', `/api/parties/${props.party.id}/goal`, { mode }, t(`partyMode_${mode}`))
function deleteParty() {
  if (confirm(`${t('deleteParty')} "${props.party.name}"?`)) runAndReport(() => callApi('DELETE', `/api/parties/${props.party.id}`), 'Party deleted')
}
</script>

<template>
  <article class="party-card" :class="{ active: party.isActive }">
    <div class="card-head">
      <h3>{{ party.name }}</h3>
      <span class="badge" :class="{ on: party.isActive }">{{ party.isActive ? 'ACTIVE' : 'off' }}</span>
      <span class="party-status"><b>{{ partyStatusText(party.status) }}</b><span v-if="party.status.params?.area" class="row-location">{{ areaName(String(party.status.params.area)) }}</span></span>
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
      <button class="button small primary" :disabled="!isNewLocation" @click="goToSelected">{{ t('goTo') }}</button>
      <span class="mode-toggle" role="group" :aria-label="t('partyState')">
        <button
          v-for="mode in MODES" :key="mode" class="button small" :class="{ primary: currentMode === mode }"
          :aria-pressed="currentMode === mode" @click="setMode(mode)"
        >{{ t(`partyMode_${mode}`) }}</button>
      </span>
    </div>
    <MemberPicker @pick="addMember" />

    <dialog ref="settingsDialog" class="dialog">
      <h3>{{ t('settings') }} — {{ party.name }}</h3>
      <div class="stack">
        <label>{{ t('retreatLabel') }}
          <input type="number" min="10" max="90" :value="party.tankRetreatPct" @change="update({ tankRetreatPct: Number(($event.target as HTMLInputElement).value) })">
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
