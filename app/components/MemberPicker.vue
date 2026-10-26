<script setup lang="ts">
// Search-as-you-type dropdown of characters not yet in any party.
// Used by the party card and the create-party dialog.
const props = withDefaults(defineProps<{ excludeIds?: string[] }>(), { excludeIds: () => [] })
const emit = defineEmits<{ pick: [accountId: string] }>()
const { t } = useI18n()
const { accounts, takenAccountIds } = useDashboard()
const query = ref('')
const isOpen = ref(false)

const choices = computed(() => {
  const text = query.value.trim().toLowerCase()
  return accounts.value.filter((account) => !takenAccountIds.value.has(account.id) && !props.excludeIds.includes(account.id)
    && (!text || account.name.toLowerCase().includes(text) || account.account.toLowerCase().includes(text)))
})

function pick(accountId: string) {
  emit('pick', accountId)
  query.value = ''
  isOpen.value = false
}
</script>

<template>
  <div class="combo">
    <input
      v-model="query" type="text" :placeholder="t('addMember')" :aria-label="t('addMember')" autocomplete="off"
      @focus="isOpen = true" @click="isOpen = true" @input="isOpen = true" @blur="isOpen = false" @keydown.esc="isOpen = false"
      @keydown.enter.prevent="choices[0] && pick(choices[0].id)"
    >
    <ul v-if="isOpen" class="combo-list">
      <li v-for="account in choices" :key="account.id" class="combo-option" @mousedown.prevent @click="pick(account.id)">
        <span class="muted">Lv {{ account.player?.level ?? '—' }}</span> {{ account.name }}
      </li>
      <li v-if="!choices.length" class="muted">{{ t('noFree') }}</li>
    </ul>
  </div>
</template>
