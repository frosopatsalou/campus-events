import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createTestApp, validEvent } from '../helpers/testApp.mjs';
import { createLiveFeed } from '../../src/services/liveFeed.mjs';
import { Notification, MailJob } from '../../src/models/index.mjs';
import { createMailWorker } from '../../src/services/mailWorker.mjs';

describe('Durable public notifications', () => {
  let app;
  beforeEach(async () => { ({ app } = await createTestApp()); });
  it('broadcasts to independent instance feeds, without replaying history on reconnect', async () => {
    const a = createLiveFeed(undefined, 60000);
    const b = createLiveFeed(undefined, 60000);
    const receivedA = [], receivedB = [];
    try {
      await a.subscribe((type, data) => receivedA.push({ type, data }));
      await b.subscribe((type, data) => receivedB.push({ type, data }));
      const event = (await request(app).post('/api/events').send(validEvent())).body;
      await Promise.all([a.runOnce(), b.runOnce()]);
      await request(app).post('/api/events/' + event.id + '/registrations').send({ name: 'Secret Person', email: 'secret@example.com' });
      await Promise.all([a.runOnce(), b.runOnce()]);
      await createMailWorker({ send: async () => { throw new Error('offline'); } }).runOnce();
      await Promise.all([a.runOnce(), b.runOnce()]);
      const notifications = (rows) => rows.filter((row) => row.type === 'changes').flatMap((row) => row.data.notifications);
      assert.deepEqual(notifications(receivedA), notifications(receivedB));
      assert.deepEqual(notifications(receivedA).map((row) => row.type), ['event.created', 'registration.created']);
      assert.equal(notifications(receivedA)[1].spotsLeft, 9);
      assert.doesNotMatch(JSON.stringify(receivedA), /Secret Person|secret@example/);
      const wake = [];
      await b.subscribe((type, data) => wake.push({ type, data }));
      await b.runOnce();
      assert.equal(wake[0].type, 'snapshot');
      assert.equal(wake[0].data.events[0].registered, 1);
      assert.equal(notifications(wake).length, 0);
    } finally { await Promise.all([a.stop(), b.stop()]); }
  });
  it('rolls back an event when its notification cannot be persisted', async () => {
    Notification.addHook('beforeCreate', 'offlineLog', () => { throw new Error('cannot persist'); });
    try {
      assert.equal((await request(app).post('/api/events').send(validEvent())).status, 500);
      assert.deepEqual((await request(app).get('/api/events')).body, []);
    } finally { Notification.removeHook('beforeCreate', 'offlineLog'); }
  });
  it('rolls back registration and mail if its public notification cannot be persisted', async () => {
    const event = (await request(app).post('/api/events').send(validEvent())).body;
    Notification.addHook('beforeCreate', 'offlineLog', () => { throw new Error('cannot persist'); });
    try {
      const response = await request(app).post('/api/events/' + event.id + '/registrations')
        .send({ name: 'Private Person', email: 'private@example.com' });
      assert.equal(response.status, 500);
      assert.equal((await request(app).get('/api/events/' + event.id)).body.registered, 0);
      assert.equal(await MailJob.count(), 0);
      assert.equal(await Notification.count({ where: { type: 'registration.created' } }), 0);
    } finally { Notification.removeHook('beforeCreate', 'offlineLog'); }
  });
  it('retries the same notification ID after a delivery failure', async () => {
    const feed = createLiveFeed(undefined, 60000);
    const ids = [];
    let fail = true;
    try {
      await feed.subscribe((type, data) => {
        if (type !== 'changes') return;
        ids.push(data.notifications[0].id);
        if (fail) { fail = false; throw new Error('delivery interrupted'); }
      });
      await request(app).post('/api/events').send(validEvent());
      await assert.rejects(feed.runOnce(), /delivery interrupted/);
      await feed.runOnce();
      assert.equal(ids.length, 2);
      assert.equal(ids[0], ids[1]);
      assert.equal(await Notification.count(), 1);
    } finally { await feed.stop(); }
  });
});
