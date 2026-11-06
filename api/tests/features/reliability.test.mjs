import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createTestApp, validEvent } from '../helpers/testApp.mjs';
import { MailJob } from '../../src/models/index.mjs';
import { createMailWorker } from '../../src/services/mailWorker.mjs';
import { ReadCache } from '../../src/cache/readCache.mjs';
import { seedDemoData } from '../../src/repositories/demoRepository.mjs';

describe('Registration reliability and cache correctness', () => {
  let app;
  beforeEach(async () => { ({ app } = await createTestApp()); });
  const participant = (email = 'ada@example.com') => ({ name: 'Ada', email });
  async function event(capacity = 2) {
    return (await request(app).post('/api/events').send(validEvent({ capacity }))).body;
  }
  it('seeds registrations with actual event IDs when IDs no longer start at one', async () => {
    const created = await event();
    await request(app).delete('/api/events/' + created.id);
    await seedDemoData();
    const events = (await request(app).get('/api/events')).body;
    const welcome = events.find((row) => row.title === 'Welcome Day IXD');
    assert.notEqual(welcome.id, 1);
    assert.equal((await request(app).get('/api/events/' + welcome.id + '/registrations')).body.length, 2);
  });
  it('retains registration after SMTP failure and retries the durable job successfully', async () => {
    const created = await event();
    const response = await request(app).post('/api/events/' + created.id + '/registrations').send(participant());
    assert.equal(response.status, 201);
    await createMailWorker({ send: async () => { throw new Error('offline'); } }).runOnce();
    let job = await MailJob.findOne();
    assert.equal(job.attempts, 1);
    assert.equal(job.sentAt, null);
    assert.equal((await request(app).get('/api/events/' + created.id + '/registrations')).body.length, 1);
    await job.update({ nextAttemptAt: new Date(0) });
    const sent = [];
    await createMailWorker({ send: async (mail) => sent.push(mail.payload) }).runOnce();
    job = await MailJob.findOne();
    assert.ok(job.sentAt);
    assert.equal(sent[0].to, 'ada@example.com');
    assert.match(sent[0].subject, /Backend Bootcamp/);
    await createMailWorker({ send: async () => assert.fail('sent twice') }).runOnce();
  });
  it('rolls back registration if saving its mail job fails', async () => {
    const created = await event();
    MailJob.addHook('beforeCreate', 'simulateFailure', () => { throw new Error('disk failure'); });
    try {
      const response = await request(app).post('/api/events/' + created.id + '/registrations').send(participant());
      assert.equal(response.status, 500);
      assert.deepEqual((await request(app).get('/api/events/' + created.id + '/registrations')).body, []);
    } finally { MailJob.removeHook('beforeCreate', 'simulateFailure'); }
  });
  it('allows only one of two simultaneous requests for the final seat', async () => {
    const created = await event(1);
    const url = '/api/events/' + created.id + '/registrations';
    const results = await Promise.all(['one@example.com', 'two@example.com'].map((email) => request(app).post(url).send(participant(email))));
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    assert.equal(await MailJob.count(), 1);
  });
  it('queues only one email for concurrent duplicate registrations', async () => {
    const created = await event();
    const url = '/api/events/' + created.id + '/registrations';
    const results = await Promise.all([1, 2].map(() => request(app).post(url).send(participant())));
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    assert.equal(await MailJob.count(), 1);
  });
  it('updates time-dependent stats while their underlying data remains cached', async (context) => {
    const created = await event();
    const start = new Date(created.startsAt).getTime();
    context.mock.timers.enable({ apis: ['Date'], now: start - 1000 });
    assert.equal((await request(app).get('/api/stats')).body[0].status, 'open');
    context.mock.timers.tick(2000);
    assert.equal((await request(app).get('/api/stats')).body[0].status, 'past');
  });
  it('invalidates warmed list, detail, registrations and statistics after changes', async () => {
    assert.deepEqual((await request(app).get('/api/events')).body, []);
    assert.deepEqual((await request(app).get('/api/stats')).body, []);
    const created = await event();
    const url = '/api/events/' + created.id;
    assert.equal((await request(app).get('/api/events')).body.length, 1);
    await request(app).get(url);
    await request(app).get(url + '/registrations');
    await request(app).get('/api/stats');
    await request(app).post(url + '/registrations').send(participant());
    assert.equal((await request(app).get(url)).body.registered, 1);
    assert.equal((await request(app).get(url + '/registrations')).body.length, 1);
    assert.equal((await request(app).get('/api/stats')).body[0].registered, 1);
    await request(app).patch(url).send({ title: 'Updated title', capacity: 4 });
    assert.equal((await request(app).get(url)).body.spotsLeft, 3);
    assert.equal((await request(app).get('/api/events')).body[0].title, 'Updated title');
    assert.equal((await request(app).get('/api/stats')).body[0].occupancy, '25%');
    await request(app).delete(url);
    assert.equal((await request(app).get(url)).status, 404);
    assert.equal((await request(app).get(url + '/registrations')).status, 404);
    assert.deepEqual((await request(app).get('/api/events')).body, []);
    assert.deepEqual((await request(app).get('/api/stats')).body, []);
  });
});
describe('Read cache', () => {
  it('bounds cache size and protects stored values from callers changing them', async () => {
    const cache = new ReadCache({ maxEntries: 2 });
    const result = await cache.get('one', async () => ({ title: 'Original' }));
    result.title = 'Modified';
    assert.equal((await cache.get('one', () => assert.fail('cache miss'))).title, 'Original');
    await cache.get('two', async () => 2);
    await cache.get('three', async () => 3);
    assert.equal(cache.entries.size, 2);
    assert.equal(cache.entries.has('one'), false);
  });
  it('reuses values until expiry and does not cache failures', async () => {
    let now = 0;
    let calls = 0;
    const cache = new ReadCache({ ttl: 10, now: () => now });
    const load = async () => ++calls;
    assert.equal(await cache.get('key', load), 1);
    assert.equal(await cache.get('key', load), 1);
    now = 11;
    assert.equal(await cache.get('key', load), 2);
    await assert.rejects(cache.get('error', async () => { throw new Error('failed'); }));
    assert.equal(await cache.get('error', load), 3);
  });
  it('prevents an in-flight read restoring stale data after invalidation', async () => {
    const cache = new ReadCache();
    let finish;
    const pending = cache.get('key', () => new Promise((resolve) => { finish = resolve; }));
    cache.clear();
    finish('old');
    await pending;
    assert.equal(await cache.get('key', async () => 'new'), 'new');
  });
});
