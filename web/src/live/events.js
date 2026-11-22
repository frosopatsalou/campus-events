import { ref } from 'vue';
import { subscribeToEvents } from '../api/events.js';

export const liveEvents = ref(null);
export const toasts = ref([]);
const timers = new Map();
export function dismissToast(id) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  toasts.value = toasts.value.filter((toast) => toast.id !== id);
}
function reset() { for (const id of timers.keys()) dismissToast(id); }
export function startLiveEvents() {
  const stop = subscribeToEvents({
    snapshot: (events) => { liveEvents.value = events; },
    reset,
    changes: (notifications) => {
      for (const item of notifications) {
        let message;
        if (item.type === 'event.created') message = 'New event: ' + item.title;
        if (item.type === 'registration.created') {
          message = 'Someone registered for ' + item.title + ' — ' + item.spotsLeft + (item.spotsLeft === 1 ? ' seat left' : ' seats left');
        }
        if (!message) continue;
        toasts.value.push({ id: item.id, message });
        timers.set(item.id, setTimeout(() => dismissToast(item.id), 7000));
      }
    }
  });
  return () => { stop(); reset(); };
}
