import { afterEach, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import EventToasts from '../src/components/EventToasts.vue';
import { startLiveEvents, toasts } from '../src/live/events.js';

const callbacks = vi.hoisted(() => ({ handlers: null }));
vi.mock('../src/api/events.js', () => ({ subscribeToEvents: (handlers) => {
  callbacks.handlers = handlers;
  return () => {};
} }));
afterEach(() => vi.useRealTimers());
it('renders anonymous creation/registration messages, supports dismissal and expires toasts', async () => {
  vi.useFakeTimers();
  const stop = startLiveEvents();
  const wrapper = mount(EventToasts);
  try {
    callbacks.handlers.changes([
      { id: '1', type: 'event.created', title: 'Hack night' },
      { id: '2', type: 'registration.created', title: 'Hack night', spotsLeft: 2, name: 'Private Name', email: 'private@example.com' }
    ]);
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('New event: Hack night');
    expect(wrapper.text()).toContain('Someone registered for Hack night — 2 seats left');
    expect(wrapper.text()).not.toMatch(/Private Name|private@example/);
    await wrapper.find('button').trigger('click');
    expect(toasts.value).toHaveLength(1);
    vi.advanceTimersByTime(7000);
    expect(toasts.value).toHaveLength(0);
  } finally { wrapper.unmount(); stop(); }
});
