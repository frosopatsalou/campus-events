import assert from 'node:assert/strict';
import { beforeEach, it } from 'node:test';
import { createTestApp, validEvent } from '../helpers/testApp.mjs';
import { eventService } from '../../src/services/eventService.mjs';
import { eventRepository as repository } from '../../src/repositories/eventRepository.mjs';

beforeEach(createTestApp);

it('refreshes warmed caches after another writer commits a notification', async () => {
  const event = await eventService.create(validEvent({ capacity: 2 }));
  await eventService.list();
  await eventService.detail(event.id);
  await eventService.registrations(event.id);
  await eventService.stats();
  // Bypass this service's local invalidation, as another API instance would.
  await repository.transaction(async (repo) => {
    await repo.update(event.id, { title: 'Changed elsewhere' });
    await repo.register({ eventId: event.id, name: 'Test Person', email: 'test@example.com' });
    await repo.notify('registration.created', { eventId: event.id, spotsLeft: 1 });
  });
  assert.equal((await eventService.list())[0].title, 'Changed elsewhere');
  assert.equal((await eventService.detail(event.id)).spotsLeft, 1);
  assert.equal((await eventService.registrations(event.id)).length, 1);
  assert.equal((await eventService.stats())[0].registered, 1);
});

it('records edits and deletions so other instances can detect them', async () => {
  const event = await eventService.create(validEvent());
  const before = await repository.cursor();
  await eventService.update(event.id, { title: 'Updated event' });
  await eventService.remove(event.id);
  assert.deepEqual((await repository.changes(before)).map((row) => row.type), ['event.updated', 'event.deleted']);
});
