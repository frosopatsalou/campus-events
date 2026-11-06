import { env } from '../config/env.mjs';

export class ReadCache {
  constructor({ ttl = env.CACHE_TTL_MS, now = Date.now, maxEntries = 500 } = {}) {
    Object.assign(this, { ttl, now, maxEntries });
    this.entries = new Map();
    this.generation = 0;
  }
  clear() { this.generation++; this.entries.clear(); }
  async get(key, load) {
    const hit = this.entries.get(key);
    if (hit && hit.expires > this.now()) return structuredClone(hit.value);
    const generation = this.generation;
    const value = await load();
    // A read started before a mutation must never repopulate the cleared cache.
    if (generation === this.generation) {
      if (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value);
      this.entries.set(key, { value: structuredClone(value), expires: this.now() + this.ttl });
    }
    return value;
  }
}
export const readCache = new ReadCache();
