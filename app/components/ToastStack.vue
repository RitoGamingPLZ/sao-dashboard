<script setup lang="ts">
const toasts = useToasts()
</script>

<template>
  <div class="toast-stack">
    <div v-for="toast in toasts" :key="toast.id" class="toast" :class="toast.tone" role="status">{{ toast.message }}</div>
  </div>
</template>
