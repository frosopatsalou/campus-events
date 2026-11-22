import { eventRepository as repository, checkDatabase } from '../repositories/eventRepository.mjs';
import { readCache } from '../cache/readCache.mjs';
import { AppError } from '../errors/AppError.mjs';

async function requireEvent(repo, id) {
  const event = await repo.find(id);
  if (!event) throw new AppError(404, 'NOT_FOUND', 'Event with id ' + id + ' not found');
  return event;
}
async function mutate(work) {
  const result = await repository.transaction(work);
  readCache.clear();
  return result;
}
async function registerPeople(id, people) {
  return mutate(async (repo) => {
    const event = await requireEvent(repo, id);
    let registered = await repo.count(id);
    const results = [];
    for (const data of people) {
      if (await repo.registered(id, data.email)) throw new AppError(409, 'CONFLICT', data.email + ' is already registered for this event');
      if (registered >= event.capacity) throw new AppError(409, 'CONFLICT', 'Event is full');
      results.push(await repo.register({ eventId: id, ...data }));
      await repo.enqueue({ to: data.email, subject: 'You are registered for ' + event.title,
        text: 'Hi ' + data.name + ',\n\nYour registration for ' + event.title + ' is confirmed.\nLocation: ' + event.location + '\nStarts: ' + new Date(event.startsAt).toISOString() });
      registered++;
      await repo.notify('registration.created', {
        eventId: event.id, title: event.title, registered, capacity: event.capacity,
        spotsLeft: Math.max(event.capacity - registered, 0)
      });
    }
    return results;
  });
}
export const eventService = {
  health: async () => { await checkDatabase(); return { status: 'ok' }; },
  list: () => readCache.get('events', () => repository.list()),
  detail: (id) => readCache.get('event:' + id, async () => {
    const event = await requireEvent(repository, id);
    const registered = await repository.count(id);
    return { ...event, registered, spotsLeft: Math.max(event.capacity - registered, 0) };
  }),
  create: (data) => mutate(async (repo) => {
    const event = await repo.create(data);
    await repo.notify('event.created', { eventId: event.id, title: event.title });
    return event;
  }),
  update: (id, data) => mutate(async (repo) => {
    await requireEvent(repo, id);
    return repo.update(id, data);
  }),
  remove: (id) => mutate(async (repo) => {
    await requireEvent(repo, id);
    await repo.remove(id);
  }),
  registrations: (id) => readCache.get('registrations:' + id, async () => {
    await requireEvent(repository, id);
    return repository.registrations(id);
  }),
  register: async (id, data) => (await registerPeople(id, [data]))[0],
  registerPeople,
  // Cache data, calculate the clock-dependent status on every request.
  stats: async () => {
    const rows = await readCache.get('stats', () => repository.summaries());
    return rows.map((event) => ({ id: event.id, title: event.title, registered: event.registered,
      capacity: event.capacity, occupancy: Math.round(event.registered / event.capacity * 100) + '%',
      status: event.registered >= event.capacity ? 'full' : new Date(event.startsAt) < new Date() ? 'past' : 'open' }));
  }
};
