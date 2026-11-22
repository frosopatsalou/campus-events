import { eventService } from './eventService.mjs';
import { logger } from '../config/logger.mjs';

// Every API instance reads the same log independently: this is broadcast,
// not a competing-consumer queue that would notify only one instance.
export function createLiveFeed(service = eventService, interval = 1000) {
  const clients = new Set();
  let timer;
  let active;
  async function poll() {
    if (!clients.size) return;
    const cursor = [...clients].reduce((min, client) => BigInt(client.cursor) < BigInt(min) ? client.cursor : min, [...clients][0].cursor);
    const notifications = await service.changes(cursor);
    if (!notifications.length) {
      for (const client of clients) client.send('heartbeat', { time: Date.now() });
      return;
    }
    const snapshot = await service.snapshot();
    for (const client of clients) {
      const fresh = notifications.filter((item) => BigInt(item.id) > BigInt(client.cursor));
      if (!fresh.length) continue;
      client.send('changes', { notifications: fresh, events: snapshot.events });
      client.cursor = fresh.at(-1).id;
    }
  }
  function runOnce() {
    if (!active) active = poll().finally(() => { active = undefined; });
    return active;
  }
  return {
    async subscribe(send) {
      const snapshot = await service.snapshot();
      const client = { cursor: snapshot.cursor, send };
      send('snapshot', snapshot);
      clients.add(client);
      if (!timer) {
        timer = setInterval(() => runOnce().catch(() => logger.warn('Live feed temporarily unavailable')), interval);
        timer.unref();
      }
      return () => {
        clients.delete(client);
        if (!clients.size) { clearInterval(timer); timer = undefined; }
      };
    },
    runOnce,
    async stop() { clearInterval(timer); clients.clear(); await active; }
  };
}

export const liveFeed = createLiveFeed();
