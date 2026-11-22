<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { liveEvents } from '../live/events.js';
import { RouterLink } from 'vue-router';
import { getEvents } from '../api/events.js';
import ErrorMessage from '../components/ErrorMessage.vue';
import EventCard from '../components/EventCard.vue';
import { isPast } from '../utils/format.js';

const events = ref([]);
const loading = ref(true);
const error = ref(null);
watch(liveEvents, (rows) => { if (rows) events.value = rows; });

const upcoming = computed(() => events.value.filter((event) => !isPast(event.startsAt)));
const past = computed(() => events.value.filter((event) => isPast(event.startsAt)));

onMounted(async () => {
  const before = liveEvents.value;
  try {
    const rows = await getEvents();
    events.value = liveEvents.value !== before ? liveEvents.value : rows;
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <h1 class="page-title">What's on at campus</h1>

  <p v-if="loading" class="muted">Loading events…</p>
  <ErrorMessage :error="error" />

  <template v-if="!loading && !error">
    <section v-if="upcoming.length" class="ticket-grid" aria-label="Upcoming events">
      <EventCard v-for="event in upcoming" :key="event.id" :event="event" />
    </section>
    <div v-else class="empty">
      <p>No upcoming events yet.</p>
      <RouterLink to="/events/new" class="button">Create the first event</RouterLink>
    </div>

    <template v-if="past.length">
      <h2 class="section-title">Earlier</h2>
      <section class="ticket-grid" aria-label="Past events">
        <EventCard v-for="event in past" :key="event.id" :event="event" />
      </section>
    </template>
  </template>
</template>
