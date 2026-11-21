import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createTestApp, validEvent } from '../helpers/testApp.mjs';
import { initializeDatabase } from '../../src/repositories/databaseRepository.mjs';
import { ChangeLock, Event, Registration, MailJob, Notification } from '../../src/models/index.mjs';

it('creates one startup marker and preserves existing data across repeated initialization', async () => {
  await createTestApp();
  const event = await Event.create(validEvent());
  await Registration.create({ eventId: event.id, name: 'Test Person', email: 'test@example.com' });
  await MailJob.create({ payload: { to: 'test@example.com', subject: 'Confirmation' } });
  await Notification.create({ type: 'event.created', payload: { eventId: event.id, title: event.title } });
  const tables = [Event, Registration, MailJob, Notification];
  const snapshot = () => Promise.all(tables.map(async (table) =>
    (await table.findAll({ order: [['id', 'ASC']] })).map((row) => row.toJSON())));
  const before = await snapshot();

  await initializeDatabase();
  await initializeDatabase();

  assert.equal(await ChangeLock.count(), 1);
  assert.ok(await ChangeLock.findByPk(1));
  assert.deepEqual(await snapshot(), before);
});
