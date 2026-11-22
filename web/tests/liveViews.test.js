import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import EventDetailView from '../src/views/EventDetailView.vue';
import EventsView from '../src/views/EventsView.vue';
import { liveEvents } from '../src/live/events.js';
import { getEvent, getEvents, getRegistrations } from '../src/api/events.js';

vi.mock('../src/api/events.js', () => ({ getEvent: vi.fn(), getEvents: vi.fn(), getRegistrations: vi.fn() }));
const event = (registered) => ({ id: 1, title: 'Hack night', location: 'Room C101',
  startsAt: '2099-12-11T18:00:00Z', capacity: 3, registered });
const linkStub = { template: '<a><slot /></a>' };
const options = { props: { id: '1' }, global: { stubs: { RouterLink: linkStub, RegistrationForm: true } } };
beforeEach(() => { vi.clearAllMocks(); liveEvents.value = null; getRegistrations.mockResolvedValue([]); });

it('keeps the result of your own registration when the last live snapshot is older', async () => {
  liveEvents.value = [event(0)];
  getEvent.mockResolvedValue(event(1));
  const wrapper = mount(EventDetailView, options);
  try {
    await flushPromises();
    expect(wrapper.find('.seat-meter').exists()).toBe(true);
    expect(wrapper.find('.seat-meter__count strong').text()).toBe('2');
    liveEvents.value = [event(2)];
    await flushPromises();
    expect(wrapper.find('.seat-meter__count strong').text()).toBe('1');
  } finally { wrapper.unmount(); }
});
it('keeps a newer stream snapshot when an older HTTP response arrives afterwards', async () => {
  let finish;
  getEvent.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const wrapper = mount(EventDetailView, options);
  try {
    liveEvents.value = [event(2)];
    await flushPromises();
    finish(event(0));
    await flushPromises();
    expect(wrapper.find('.seat-meter__count strong').text()).toBe('1');
  } finally { wrapper.unmount(); }
});
it('adds a remotely created event to the open event list without reloading', async () => {
  getEvents.mockResolvedValue([]);
  const wrapper = mount(EventsView, { global: { stubs: { RouterLink: linkStub } } });
  try {
    await flushPromises();
    expect(wrapper.text()).toContain('No upcoming events yet');
    liveEvents.value = [event(0)];
    await flushPromises();
    expect(wrapper.text()).toContain('Hack night');
  } finally { wrapper.unmount(); }
});
