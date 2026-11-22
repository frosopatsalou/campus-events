import assert from 'node:assert/strict';
import { it } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { validEvent } from '../helpers/testApp.mjs';

async function waitFor(check) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await delay(20);
  }
  throw new Error('Timed out waiting for a live update');
}
async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}
async function startApi(storage, children) {
  const port = await freePort();
  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    // Deliberately do not inherit database credentials or real SMTP settings.
    env: { NODE_ENV: 'test', PORT: String(port), DB_STORAGE: storage,
      SEED_DEMO: 'false', LOG_LEVEL: 'error' },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
  });
  children.push(child);
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  await waitFor(() => {
    if (child.exitCode !== null) throw new Error('API failed to start: ' + output);
    return output.includes('Campus Events running');
  });
  return 'http://127.0.0.1:' + port;
}
async function stream(base, controller) {
  const response = await fetch(base + '/api/live', { signal: controller.signal });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const frames = [];
  const reading = (async () => {
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const lines = frame.split('\n');
          frames.push({ type: lines[0].slice(7), data: JSON.parse(lines[1].slice(6)) });
        }
      }
    } catch (error) { if (!controller.signal.aborted) throw error; }
  })();
  await waitFor(() => frames.find((frame) => frame.type === 'snapshot'));
  return { frames, reading };
}
async function json(base, path, body) {
  const response = await fetch(base + '/api' + path, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  } : undefined);
  return { status: response.status, body: await response.json() };
}

it('broadcasts over real SSE from two API processes, refreshes remote caches and prevents overselling', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'campus-live-test-'));
  const children = [], controllers = [], streams = [];
  const notifications = (feed) => feed.frames.filter((frame) => frame.type === 'changes').flatMap((frame) => frame.data.notifications);
  try {
    const a = await startApi(join(root, 'events.sqlite'), children);
    const b = await startApi(join(root, 'events.sqlite'), children);
    for (const base of [a, b]) {
      const controller = new AbortController(); controllers.push(controller);
      streams.push(await stream(base, controller));
    }
    const event = (await json(a, '/events', validEvent({ title: 'Hack night', capacity: 1 }))).body;
    await waitFor(() => streams.every((feed) => notifications(feed).some((row) => row.type === 'event.created')));
    // Warm instance B's cache before the competing writes.
    assert.equal((await json(b, '/events/' + event.id)).body.spotsLeft, 1);
    await json(b, '/stats');
    const results = await Promise.all([a, b].map((base, index) => json(base, '/events/' + event.id + '/registrations', {
      name: 'Private participant ' + index, email: 'participant' + index + '@example.com'
    })));
    assert.deepEqual(results.map((response) => response.status).sort(), [201, 409]);
    assert.equal((await json(b, '/events/' + event.id)).body.spotsLeft, 0);
    assert.equal((await json(b, '/stats')).body[0].registered, 1);
    await waitFor(() => streams.every((feed) => notifications(feed).some((row) => row.type === 'registration.created')));
    assert.deepEqual(notifications(streams[0]), notifications(streams[1]));
    assert.equal(notifications(streams[0]).filter((row) => row.type === 'registration.created').length, 1);
    assert.doesNotMatch(JSON.stringify(streams.map((feed) => feed.frames)), /Private participant|participant[01]@/);
    const controller = new AbortController(); controllers.push(controller);
    const wake = await stream(b, controller); streams.push(wake);
    assert.equal(wake.frames[0].data.events[0].registered, 1);
    assert.equal(notifications(wake).length, 0);
  } finally {
    controllers.forEach((controller) => controller.abort());
    await Promise.all(streams.map((feed) => feed.reading));
    await Promise.all(children.map(async (child) => {
      if (child.exitCode !== null) return;
      const exited = once(child, 'exit'); child.kill(); await exited;
    }));
    // Verify the absolute deletion target stays inside this test's temp folder.
    const target = resolve(root);
    assert.ok(!relative(resolve(tmpdir()), target).startsWith('..'));
    assert.ok(target.includes('campus-live-test-'));
    await rm(target, { recursive: true, force: true });
  }
});
