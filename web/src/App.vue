<script setup>
import { RouterLink, RouterView } from 'vue-router';
import { onMounted, onUnmounted } from 'vue';
import { startLiveEvents } from './live/events.js';
import EventToasts from './components/EventToasts.vue';
let stop;
onMounted(() => { stop = startLiveEvents(); });
onUnmounted(() => stop?.());
</script>

<template>
  <header class="site-header">
    <RouterLink to="/" class="brand">Campus Events</RouterLink>
    <nav>
      <RouterLink to="/">Events</RouterLink>
      <RouterLink to="/stats">Occupancy</RouterLink>
      <RouterLink to="/events/new" class="button button--small">New event</RouterLink>
    </nav>
  </header>
  <main class="page">
    <RouterView />
  </main>
  <EventToasts />
</template>
