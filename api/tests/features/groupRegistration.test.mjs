import assert from 'node:assert/strict';
import { beforeEach, it } from 'node:test';
import { createTestApp, validEvent } from '../helpers/testApp.mjs';
import { eventService } from '../../src/services/eventService.mjs';
import { MailJob, Notification } from '../../src/models/index.mjs';

beforeEach(createTestApp);
const people = [{ name: 'First Person', email: 'first@example.com' }, { name: 'Second Person', email: 'second@example.com' }];

it('registers a whole group and creates one email job and anonymous notification per person', async () => {
  const event = await eventService.create(validEvent({ capacity: 3 }));
  assert.equal((await eventService.registerPeople(event.id, people)).length, 2);
  assert.equal((await eventService.detail(event.id)).spotsLeft, 1);
  assert.equal(await MailJob.count(), 2);
  const rows = await Notification.findAll({ where: { type: 'registration.created' }, order: [['id', 'ASC']] });
  assert.deepEqual(rows.map((row) => row.payload.spotsLeft), [2, 1]);
  assert.doesNotMatch(JSON.stringify(rows), /First Person|Second Person|first@example|second@example/);
});

it('registers nobody when the entire group cannot fit', async () => {
  const event = await eventService.create(validEvent({ capacity: 1 }));
  await assert.rejects(eventService.registerPeople(event.id, people), /Event is full/);
  assert.deepEqual(await eventService.registrations(event.id), []);
  assert.equal(await MailJob.count(), 0);
  assert.equal(await Notification.count({ where: { type: 'registration.created' } }), 0);
});

it('rolls back the group when the same person is included twice', async () => {
  const event = await eventService.create(validEvent());
  await assert.rejects(eventService.registerPeople(event.id, [people[0], people[0]]), /already registered/);
  assert.deepEqual(await eventService.registrations(event.id), []);
  assert.equal(await MailJob.count(), 0);
  assert.equal(await Notification.count({ where: { type: 'registration.created' } }), 0);
});
