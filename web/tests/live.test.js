import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectLive } from '../src/api/live.js';

class FakeSource {
  static instances = [];
  listeners = new Map();
  constructor() { FakeSource.instances.push(this); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  emit(type, data) { this.listeners.get(type)?.({ data: JSON.stringify(data) }); }
  close() { this.closed = true; }
}
function setup() {
  FakeSource.instances = [];
  let time = 0;
  let tick;
  const windowObject = new EventTarget();
  const documentObject = new EventTarget();
  documentObject.visibilityState = 'visible';
  const handlers = { snapshot: vi.fn(), changes: vi.fn(), reset: vi.fn() };
  const stop = connectLive('/api/live', handlers, {
    EventSourceClass: FakeSource, now: () => time, windowObject, documentObject,
    schedule: (callback) => { tick = callback; }, cancel: vi.fn()
  });
  return { handlers, stop, windowObject, documentObject, tick: () => tick(),
    advance: (ms) => { time += ms; }, source: () => FakeSource.instances.at(-1) };
}
const registration = { id: '11', type: 'registration.created', eventId: 1, title: 'Hack night', spotsLeft: 2 };

describe('Live updates and reconnects', () => {
  let cleanup;
  afterEach(() => cleanup?.());
  it('updates absolute seats and delivers one notification when a batch is retried', () => {
    const client = setup(); cleanup = client.stop;
    client.source().emit('snapshot', { cursor: '10', events: [{ id: 1, registered: 0 }] });
    const update = { notifications: [registration, registration], events: [{ id: 1, registered: 1, capacity: 3 }] };
    client.source().emit('changes', update);
    client.source().emit('changes', update);
    expect(client.handlers.changes).toHaveBeenCalledExactlyOnceWith([registration]);
    expect(client.handlers.snapshot).toHaveBeenLastCalledWith(update.events);
  });
  it('discards buffered messages after sleep and takes a fresh snapshot without old toasts', () => {
    const client = setup(); cleanup = client.stop;
    const beforeSleep = client.source();
    beforeSleep.emit('snapshot', { cursor: '10', events: [] });
    client.advance(60000);
    beforeSleep.emit('changes', { notifications: [registration], events: [] });
    expect(beforeSleep.closed).toBe(true);
    const current = client.source();
    current.emit('snapshot', { cursor: '11', events: [{ id: 1, registered: 1 }] });
    current.emit('changes', { notifications: [registration], events: [] });
    beforeSleep.emit('changes', { notifications: [{ ...registration, id: '99' }], events: [] });
    expect(client.handlers.changes).not.toHaveBeenCalled();
    expect(client.handlers.snapshot).toHaveBeenLastCalledWith([{ id: 1, registered: 1 }]);
    current.emit('changes', { notifications: [{ ...registration, id: '12' }], events: [{ id: 1, registered: 2 }] });
    expect(client.handlers.changes).toHaveBeenCalledTimes(1);
  });
  it('resynchronizes on wake and network restoration, removes listeners on unmount', () => {
    const client = setup(); cleanup = client.stop;
    client.documentObject.dispatchEvent(new Event('visibilitychange'));
    client.windowObject.dispatchEvent(new Event('online'));
    client.advance(16000); client.tick();
    expect(FakeSource.instances).toHaveLength(4);
    client.stop();
    client.windowObject.dispatchEvent(new Event('online'));
    expect(FakeSource.instances).toHaveLength(4);
    expect(client.source().closed).toBe(true);
  });
  it('requires a fresh baseline after native EventSource reconnect', () => {
    const client = setup(); cleanup = client.stop;
    client.source().emit('snapshot', { cursor: '10', events: [] });
    client.source().emit('error');
    client.source().emit('changes', { notifications: [registration], events: [] });
    client.source().emit('snapshot', { cursor: '11', events: [{ id: 1, registered: 1 }] });
    expect(client.handlers.changes).not.toHaveBeenCalled();
    expect(client.handlers.snapshot).toHaveBeenLastCalledWith([{ id: 1, registered: 1 }]);
  });
});
