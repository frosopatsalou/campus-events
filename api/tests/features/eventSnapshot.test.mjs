import assert from 'node:assert/strict';
import { beforeEach, it } from 'node:test';
import { createTestApp, validEvent } from '../helpers/testApp.mjs';
import { eventService } from '../../src/services/eventService.mjs';

beforeEach(createTestApp);

it('returns current counts without participant details and follows only changes after its bookmark', async () => {
  const event = await eventService.create(validEvent({ capacity: 3 }));
  await eventService.register(event.id, { name: 'Private Person', email: 'private@example.com' });
  const snapshot = await eventService.snapshot();
  assert.equal(snapshot.events[0].registered, 1);
  assert.equal(snapshot.events[0].capacity, 3);
  assert.equal(typeof snapshot.cursor, 'string');
  assert.doesNotMatch(JSON.stringify(snapshot), /Private Person|private@example/);
  assert.deepEqual(await eventService.changes(snapshot.cursor), []);
  await eventService.register(event.id, { name: 'Another Person', email: 'another@example.com' });
  const changes = await eventService.changes(snapshot.cursor);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].type, 'registration.created');
  assert.equal(changes[0].spotsLeft, 1);
  assert.equal((await eventService.snapshot()).events[0].registered, 2);
});

it('returns an empty picture and zero bookmark for an empty database', async () => {
  assert.deepEqual(await eventService.snapshot(), { cursor: '0', events: [] });
});
