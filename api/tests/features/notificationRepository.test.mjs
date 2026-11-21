import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { createTestApp, validEvent } from '../helpers/testApp.mjs';
import { eventRepository as repository } from '../../src/repositories/eventRepository.mjs';

describe('Notification database queries', () => {
  beforeEach(createTestApp);

  it('reads new notifications in order using a stable string cursor', async () => {
    assert.equal(await repository.cursor(), '0');
    await repository.transaction(async (repo) => {
      await repo.notify('event.created', { eventId: 1, title: 'Hack night' });
      await repo.notify('registration.created', { eventId: 1, title: 'Hack night', spotsLeft: 2 });
    });
    const changes = await repository.changes('0');
    assert.deepEqual(changes.map((row) => row.type), ['event.created', 'registration.created']);
    assert.equal(typeof changes[0].id, 'string');
    assert.ok(BigInt(changes[0].id) < BigInt(changes[1].id));
    assert.equal(await repository.cursor(), changes[1].id);
    assert.deepEqual(await repository.changes(changes[0].id), [changes[1]]);
    assert.deepEqual(await repository.changes(changes[1].id), []);
  });

  it('rolls back event and notification together if a transaction fails', async () => {
    await assert.rejects(repository.transaction(async (repo) => {
      const event = await repo.create(validEvent());
      await repo.notify('event.created', { eventId: event.id, title: event.title });
      throw new Error('save interrupted');
    }), /save interrupted/);
    assert.deepEqual(await repository.list(), []);
    assert.deepEqual(await repository.changes('0'), []);
    assert.equal(await repository.cursor(), '0');
    // A failed transaction must not prevent the next writer from progressing.
    await repository.transaction((repo) => repo.notify('event.created', { eventId: 2, title: 'Next event' }));
    assert.equal((await repository.changes('0')).length, 1);
  });

  it('bounds batches and continues from the last returned ID without losing entries', async () => {
    await repository.transaction(async (repo) => {
      for (let index = 0; index < 103; index++) {
        await repo.notify('event.created', { eventId: index + 1, title: 'Event ' + index });
      }
    });
    const first = await repository.changes('0');
    assert.equal(first.length, 100);
    const second = await repository.changes(first.at(-1).id);
    assert.equal(second.length, 3);
    assert.equal(new Set([...first, ...second].map((row) => row.id)).size, 103);
    assert.equal(await repository.cursor(), second.at(-1).id);
  });
});
