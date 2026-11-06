import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { it } from 'node:test';
import { env } from '../../src/config/env.mjs';
import { createMailSender } from '../../src/mail/sender.mjs';

it('Nodemailer delivers the confirmation through a real local SMTP connection', async () => {
  let message = '';
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.write('220 localhost ESMTP\r\n');
    let buffer = '';
    let data = false;
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      while (buffer.includes('\r\n')) {
        const end = buffer.indexOf('\r\n');
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data && line !== '.') { message += line + '\n'; continue; }
        if (data) { data = false; socket.write('250 queued\r\n'); continue; }
        if (line.startsWith('DATA')) { data = true; socket.write('354 continue\r\n'); continue; }
        if (line.startsWith('QUIT')) { socket.end('221 bye\r\n'); continue; }
        socket.write('250 localhost\r\n');
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const previous = env.SMTP_URL;
  env.SMTP_URL = 'smtp://127.0.0.1:' + server.address().port;
  const sender = createMailSender();
  try {
    await sender.send({ id: 42, payload: { to: 'ada@example.com', subject: 'Registration confirmed', text: 'Your seat is saved.' } });
    assert.match(message, /To: ada@example.com/);
    assert.match(message, /Subject: Registration confirmed/);
    assert.match(message, /Your seat is saved/);
    assert.match(message, /campus-registration-42/);
  } finally {
    env.SMTP_URL = previous;
    sender.close();
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
});

it('keeps missing SMTP configuration as a delivery failure', async () => {
  const previous = env.SMTP_URL;
  env.SMTP_URL = undefined;
  try {
    await assert.rejects(createMailSender().send({}), /not configured/);
  } finally { env.SMTP_URL = previous; }
});

it('uses HTTPS delivery with a stable idempotency key and reports provider failures', async () => {
  const previous = env.RESEND_API_KEY;
  env.RESEND_API_KEY = 'test-key';
  const calls = [];
  const job = { id: 7, createdAt: '2026-11-06T12:00:00.000Z', payload: {
    to: 'ada@example.com', subject: 'Confirmed', text: 'Your seat is saved.'
  } };
  try {
    const sender = createMailSender({ fetch: async (url, options) => {
      calls.push({ url, options });
      return { ok: true };
    } });
    await sender.send(job);
    await sender.send(job);
    assert.equal(calls[0].url, 'https://api.resend.com/emails');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer test-key');
    assert.equal(calls[0].options.headers['Idempotency-Key'], calls[1].options.headers['Idempotency-Key']);
    assert.equal(JSON.parse(calls[0].options.body).to, job.payload.to);
    await assert.rejects(createMailSender({ fetch: async () => ({ ok: false, status: 503 }) }).send(job), /503/);
    await assert.rejects(createMailSender({ fetch: async () => { throw new Error('network offline'); } }).send(job), /network offline/);
  } finally { env.RESEND_API_KEY = previous; }
});
