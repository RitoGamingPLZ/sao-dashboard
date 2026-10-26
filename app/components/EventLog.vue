<script setup lang="ts">
// The event log as a conversation docked at the bottom: the bots and the game
// talk, questions carry answer buttons, and the box below sends the next step.
import { WORLD_AREAS } from '#shared/game-rules'
import type { ActionRequest, LogChoice, LogEvent } from '#shared/types'

const { t, areaLabel } = useI18n()
const { accounts, accountById, logEvents } = useDashboard()
const targetAccountId = ref('') // '' = every character
const commandText = ref('')
const isOpen = ref(true)
const sendingKeys = ref(new Set<string>()) // answers on their way, so a double click sends once
// Ticks every 5 s so questions close when they expire.
const now = ref(Date.now())
let clockTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => { clockTimer = setInterval(() => { now.value = Date.now() }, 5000) })
onUnmounted(() => clearInterval(clockTimer))
const scroller = ref<HTMLOListElement>()
const CHOICES_EXPIRE_MS = 10 * 60 * 1000

const eventKey = (event: LogEvent) => `${event.accountId}-${event.ts}-${event.detail}`
const visibleEvents = computed(() =>
  logEvents.value.filter((event) => !targetAccountId.value || event.accountId === targetAccountId.value).slice(-300))

// A choice is moot once its `until` holds for the character, e.g. Reconnect when it's back online.
function isMoot(choice: LogChoice, event: LogEvent) {
  const account = accountById(event.accountId)
  if (!account) return true
  if (choice.until === 'online') return account.isConnected
  if (choice.until === 'resumed') return !account.haltReason
  if (choice.until === 'farming') return account.autoFarm != null
  return false
}
const openChoices = (event: LogEvent) => {
  if (!event.choices?.length || event.answer || sendingKeys.value.has(eventKey(event))) return []
  if (now.value > (event.expiresAt ?? event.ts + CHOICES_EXPIRE_MS)) return []
  return event.choices.filter((choice) => !isMoot(choice, event))
}
const hasOpenChoices = (event: LogEvent) => openChoices(event).length > 0

// Stay pinned to the newest line unless the user scrolled up to read.
watch(() => visibleEvents.value.length, async () => {
  const list = scroller.value
  const isNearBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 80
  await nextTick()
  if (isNearBottom && scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
})

async function send(accountId: string, request: ActionRequest) {
  return runAndReport(() => callApi('POST', `/api/accounts/${accountId}/action`, request))
}

async function answer(event: LogEvent, choice: LogChoice) {
  sendingKeys.value.add(eventKey(event))
  await send(event.accountId, { ...choice.request, answering: event.ts, answerLabel: choice.label })
  sendingKeys.value.delete(eventKey(event)) // the server's 'answered' message closes it for every tab
}

// Typed-command suggestions, shown above the input as you type.
const COMMANDS = [
  { text: 'farm ', hint: 'keep farming; farm 10 = until Lv10' },
  { text: 'stop', hint: 'stop hunting and keep-farming' },
  { text: 'hunt', hint: 'hunt once in a safe area' },
  { text: 'boss', hint: 'challenge the floor boss' },
  { text: 'quests', hint: 'turn in finished quests' },
  { text: 'town', hint: 'teleport crystal to town' },
  { text: 'goto ', hint: 'walk to an area' },
  { text: 'restock', hint: 'buy potions now' },
  { text: 'resume', hint: 'resume a halted bot' },
  { text: 'reconnect', hint: 'take the session back' },
  { text: 'awake', hint: 'answer the idle warning' },
  { text: 'rise', hint: 'get up after falling in battle' },
  { text: 'join ', hint: 'accept a party invite: join <name>' },
]
const highlightedIndex = ref(0)
const isSuggestOpen = ref(false)
const suggestions = computed(() => {
  const text = commandText.value.trimStart().toLowerCase()
  if (!text || text.startsWith('{')) return []
  const gotoMatch = /^goto\s+(.*)$/.exec(text)
  if (gotoMatch) {
    const query = gotoMatch[1]!.trim()
    return Object.entries(WORLD_AREAS)
      .filter(([areaId, area]) => !area.secret && [areaId, area.name.toLowerCase(), area.nameZh ?? ''].some((text) => text.includes(query)))
      .slice(0, 8)
      .map(([areaId]) => ({ text: `goto ${areaId}`, hint: areaLabel(areaId) }))
  }
  return COMMANDS.filter((command) => command.text.trim().startsWith(text.split(/\s/)[0]!) && command.text.trim() !== text.trim())
})
watch(suggestions, () => { highlightedIndex.value = 0 })

function acceptSuggestion(index = highlightedIndex.value) {
  const suggestion = suggestions.value[index]
  if (!suggestion) return false
  commandText.value = suggestion.text
  isSuggestOpen.value = true
  return true
}

function onComposerKey(event: KeyboardEvent) {
  const isShowing = isSuggestOpen.value && suggestions.value.length > 0
  if (event.key === 'Escape') { isSuggestOpen.value = false; return }
  if (!isShowing) return
  const count = suggestions.value.length
  if (event.key === 'ArrowDown') { event.preventDefault(); highlightedIndex.value = (highlightedIndex.value + 1) % count }
  else if (event.key === 'ArrowUp') { event.preventDefault(); highlightedIndex.value = (highlightedIndex.value - 1 + count) % count }
  else if (event.key === 'Tab' || (event.key === 'Enter' && suggestions.value[highlightedIndex.value]!.text.endsWith(' '))) {
    event.preventDefault()
    acceptSuggestion()
  }
}

// "farm 10", "stop", "goto f1-west", or a raw game command as JSON.
function parseCommand(text: string): ActionRequest | string {
  if (text.startsWith('{')) {
    try { return { action: 'raw', command: JSON.parse(text) } } catch { return 'Not valid JSON' }
  }
  const [word = '', argument] = text.split(/\s+/)
  switch (word.toLowerCase()) {
    case 'farm': return { action: 'farm', untilLevel: argument ? Number(argument) : null }
    case 'hunt': return { action: 'startHunt' }
    case 'stop': return { action: 'stopHunt' }
    case 'boss': return { action: 'startBoss' }
    case 'quests': return { action: 'completeMission' }
    case 'town': return { action: 'town' }
    case 'goto': return argument ? { action: 'goto', areaId: argument } : 'goto needs an area, like goto f1-west'
    case 'restock': return { action: 'restock' }
    case 'resume': return { action: 'resume' }
    case 'reconnect': return { action: 'reconnect' }
    case 'awake': return { action: 'awake' }
    case 'rise': return { action: 'raw', command: { type: 'rise' } }
    case 'join': return argument ? { action: 'partyAccept', name: argument } : 'join needs a name'
    default: return `Unknown command "${word}" — ${t('logHelp')}`
  }
}

async function submit() {
  const text = commandText.value.trim()
  if (!text) return
  const request = parseCommand(text)
  if (typeof request === 'string') return showToast(request, 'error')
  const targetIds = targetAccountId.value ? [targetAccountId.value] : accounts.value.map((account) => account.id)
  const results = await Promise.all(targetIds.map((accountId) => send(accountId, request)))
  if (results.some(Boolean)) { commandText.value = ''; isSuggestOpen.value = false }
}
</script>

<template>
  <section class="chat-log" :class="{ closed: !isOpen }" aria-labelledby="log-heading">
    <div class="chat-head">
      <h2 id="log-heading">{{ t('eventLog') }}</h2>
      <button class="button small" :aria-expanded="isOpen" @click="isOpen = !isOpen">{{ isOpen ? t('hideLog') : t('showLog') }}</button>
    </div>
    <template v-if="isOpen">
      <ol ref="scroller" class="chat-lines" aria-live="polite">
        <li v-for="event in visibleEvents" :key="eventKey(event)" class="chat-line" :class="[`kind-${event.kind}`, { asking: hasOpenChoices(event) }]">
          <time>{{ formatTime(event.ts) }}</time>
          <span class="log-account">{{ event.account }}</span>
          <span class="log-detail">
            {{ event.source ? `${event.detail} (${event.source})` : event.detail }}
            <span v-if="hasOpenChoices(event)" class="chat-choices">
              <button v-for="choice in openChoices(event)" :key="choice.label" class="button small primary" @click="answer(event, choice)">{{ choice.label }}</button>
            </span>
            <span v-else-if="event.answer" class="muted"> ✓ {{ event.answer }}</span>
          </span>
        </li>
      </ol>
      <form class="chat-composer" @submit.prevent="submit">
        <select v-model="targetAccountId" :aria-label="t('filterByAccount')">
          <option value="">{{ t('allAccounts') }}</option>
          <option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.name }}</option>
        </select>
        <div class="chat-input">
          <ul v-if="isSuggestOpen && suggestions.length" id="chat-suggestions" class="chat-suggest" role="listbox">
            <li
              v-for="(suggestion, index) in suggestions" :id="`chat-suggestion-${index}`" :key="suggestion.text"
              class="combo-option" role="option" :aria-selected="index === highlightedIndex"
              @mousedown.prevent @click="acceptSuggestion(index)"
            >
              <b>{{ suggestion.text.trim() }}</b> <span class="muted">{{ suggestion.hint }}</span>
            </li>
          </ul>
          <input
            v-model="commandText" type="text" :placeholder="t('logHelp')" :aria-label="t('logPlaceholder')" autocomplete="off"
            role="combobox" aria-controls="chat-suggestions" :aria-expanded="isSuggestOpen && suggestions.length > 0"
            :aria-activedescendant="isSuggestOpen && suggestions.length ? `chat-suggestion-${highlightedIndex}` : undefined"
            @input="isSuggestOpen = true" @focus="isSuggestOpen = true" @blur="isSuggestOpen = false" @keydown="onComposerKey"
          >
        </div>
        <button class="button primary">{{ t('send') }}</button>
      </form>
    </template>
  </section>
</template>
