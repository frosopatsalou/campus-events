import assert from 'node:assert/strict';
import { it } from 'node:test';
import request from 'supertest';
import { createTestApp, validEvent } from '../helpers/testApp.mjs';
import { Notification, MailJob } from '../../src/models/index.mjs';

it('saves anonymous notifications once and rolls back registration when notification storage fails', async () => {
  const { app } = await createTestApp();
  const event = (await request(app).post('/api/events').send(validEvent())).body;
  assert.equal(await Notification.count(), 1);
  const url = '/api/events/' + event.id + '/registrations';
  const person = { name: 'Private Person', email: 'private@example.com' };
  Notification.addHook('beforeCreate', 'failNotification', () => { throw new Error('storage failed'); });
  try {
    assert.equal((await request(app).post(url).send(person)).status, 500);
    assert.equal(await MailJob.count(), 0);
    assert.deepEqual((await request(app).get(url)).body, []);
  } finally { Notification.removeHook('beforeCreate', 'failNotification'); }
  assert.equal((await request(app).post(url).send(person)).status, 201);
  assert.equal((await request(app).post(url).send(person)).status, 409);
  const rows = await Notification.findAll({ where: { type: 'registration.created' } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].payload.spotsLeft, 9);
  assert.doesNotMatch(JSON.stringify(rows), /Private Person|private@example/);
  assert.equal(await MailJob.count(), 1);
});
