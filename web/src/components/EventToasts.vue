<script setup>
import { toasts, dismissToast } from '../live/events.js';
</script>

<template>
  <aside class="event-toasts" role="status" aria-live="polite" aria-label="Live event notifications">
    <div v-for="toast in toasts" :key="toast.id" class="event-toast">
      <span>{{ toast.message }}</span>
      <button type="button" aria-label="Dismiss notification" @click="dismissToast(toast.id)">×</button>
    </div>
  </aside>
</template>

<style scoped>
.event-toasts { position: fixed; right: 1rem; bottom: 1rem; z-index: 100; display: grid; gap: .75rem; max-width: min(26rem, calc(100vw - 2rem)); }
.event-toast { display: flex; align-items: center; gap: 1rem; padding: 1rem; border: 1px solid #a5b4fc; border-radius: .75rem; background: #fff; color: #172554; box-shadow: 0 4px 18px #0002; }
.event-toast button { background: transparent; border: 0; color: inherit; cursor: pointer; font-size: 1.4rem; }
</style>
