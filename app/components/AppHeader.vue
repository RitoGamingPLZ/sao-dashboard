<script setup lang="ts">
defineProps<{ isFull?: boolean }>()
defineEmits<{ 'add-account': [] }>()
const { lang, t, toggleLang } = useI18n()
const { linkState } = useDashboard()
const linkLabel = computed(() => ({ connecting: 'connecting…', live: 'live', down: 'dashboard offline — retrying' })[linkState.value])

function pauseAll() {
  if (confirm('Stop every party and every hunt?')) runAndReport(() => callApi('POST', '/api/pause-all', {}), 'Everything paused')
}
</script>

<template>
  <header class="top-bar">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">⚔</span>
      <h1>Snored Art Online · Command Deck</h1>
      <span class="link-status" :data-state="linkState">{{ linkLabel }}</span>
    </div>
    <div class="top-actions">
      <button class="button small" @click="toggleLang">{{ lang === 'en' ? '中文' : 'EN' }}</button>
      <button class="button small primary" :disabled="isFull" @click="$emit('add-account')">{{ t('addAccount') }}</button>
      <button class="button small danger" title="Stop every party and every hunt" @click="pauseAll">{{ t('pauseAll') }}</button>
    </div>
  </header>
</template>
