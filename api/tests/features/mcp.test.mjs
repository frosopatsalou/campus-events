import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createTestApp, validEvent } from '../helpers/testApp.mjs';
import { Notification, MailJob } from '../../src/models/index.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { once } from 'node:events';

describe('MCP Streamable HTTP API', () => {
  let app;
  beforeEach(async () => { ({ app } = await createTestApp()); });
  const rpc = (method, params = {}) => request(app).post('/mcp')
    .set('Accept', 'application/json, text/event-stream')
    .send({ jsonrpc: '2.0', id: 1, method, params });
  const call = (name, args = {}) => rpc('tools/call', { name, arguments: args });
  const data = (response) => JSON.parse(response.body.result.content[0].text);
  const people = [{ name: 'First Person', email: 'first@example.com' }, { name: 'Second Person', email: 'second@example.com' }];

  it('initializes and advertises discoverable tools with registration schemas', async () => {
    const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'class-test', version: '1' } });
    assert.equal(init.status, 200);
    assert.equal(init.body.result.serverInfo.name, 'campus-events');
    const response = await rpc('tools/list');
    assert.deepEqual(response.body.result.tools.map((tool) => tool.name), ['get_upcoming_events', 'get_past_events', 'register_for_event']);
    assert.ok(response.body.result.tools[2].inputSchema.properties.people);
  });
  it('supports a real official MCP client over HTTP', async () => {
    const http = app.listen(0, '127.0.0.1');
    await once(http, 'listening');
    const client = new Client({ name: 'class-client', version: '1' });
    try {
      const endpoint = new URL('http://127.0.0.1:' + http.address().port + '/mcp');
      await client.connect(new StreamableHTTPClientTransport(endpoint));
      assert.equal((await client.listTools()).tools.length, 3);
      const response = await client.callTool({ name: 'get_upcoming_events', arguments: {} });
      assert.deepEqual(JSON.parse(response.content[0].text), []);
    } finally {
      await client.close();
      http.closeAllConnections();
      await new Promise((done) => http.close(done));
    }
  });
  it('separates upcoming and past events using the server clock', async () => {
    await request(app).post('/api/events').send(validEvent({ title: 'Future workshop' }));
    await request(app).post('/api/events').send(validEvent({ title: 'Earlier workshop', startsAt: new Date(Date.now() - 10000).toISOString() }));
    assert.deepEqual(data(await call('get_upcoming_events')).map((event) => event.title), ['Future workshop']);
    assert.deepEqual(data(await call('get_past_events')).map((event) => event.title), ['Earlier workshop']);
  });
  it('registers a group through the same service, with one private mail and public notification per person', async () => {
    const event = (await request(app).post('/api/events').send(validEvent())).body;
    const response = await call('register_for_event', { eventId: event.id, people });
    assert.equal(response.body.result.isError, undefined);
    assert.equal(data(response).registered, 2);
    assert.equal(await MailJob.count(), 2);
    const log = await Notification.findAll({ where: { type: 'registration.created' }, order: [['id', 'ASC']] });
    assert.equal(log.length, 2);
    assert.deepEqual(log.map((row) => row.payload.spotsLeft), [9, 8]);
    assert.doesNotMatch(JSON.stringify(log), /first@example|second@example|First Person|Second Person/);
    const retry = await call('register_for_event', { eventId: event.id, people });
    assert.equal(retry.body.result.isError, true);
    assert.equal(await Notification.count({ where: { type: 'registration.created' } }), 2);
  });
  it('rolls back the entire group if there are not enough seats', async () => {
    const event = (await request(app).post('/api/events').send(validEvent({ capacity: 1 }))).body;
    const response = await call('register_for_event', { eventId: event.id, people });
    assert.equal(response.body.result.isError, true);
    assert.deepEqual((await request(app).get('/api/events/' + event.id + '/registrations')).body, []);
    assert.equal(await MailJob.count(), 0);
    assert.equal(await Notification.count({ where: { type: 'registration.created' } }), 0);
  });
  it('validates tool input, unknown tools, hosts, origins and unsupported methods', async () => {
    assert.equal((await call('register_for_event', { eventId: 1, people: [{ name: 'A', email: 'bad' }] })).body.result.isError, true);
    assert.equal((await call('missing')).body.result.isError, true);
    assert.equal((await request(app).post('/mcp').set('Origin', 'https://untrusted.example').send({})).status, 403);
    assert.equal((await request(app).post('/mcp').set('Host', 'untrusted.example').send({})).status, 403);
    assert.equal((await request(app).get('/mcp')).status, 405);
  });
});
