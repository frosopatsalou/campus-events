import nodemailer from 'nodemailer';
import { env } from '../config/env.mjs';
export function createMailSender({ fetch: sendRequest = globalThis.fetch } = {}) {
  const transport = env.SMTP_URL ? nodemailer.createTransport({
    url: env.SMTP_URL, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000
  }) : null;
  return {
    async send(job) {
      if (env.RESEND_API_KEY) {
        const response = await sendRequest('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json',
            'Idempotency-Key': 'campus-events-' + job.id + '-' + new Date(job.createdAt).getTime() },
          body: JSON.stringify({ from: env.MAIL_FROM, ...job.payload }),
          signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) throw new Error('Email provider returned HTTP ' + response.status);
        return;
      }
      if (!transport) throw new Error('SMTP_URL is not configured; mail remains queued');
      const result = await transport.sendMail({
        from: env.MAIL_FROM, ...job.payload,
        messageId: '<campus-registration-' + job.id + '@' + env.MAIL_FROM.split('@').pop().replace('>', '') + '>'
      });
      if (result.rejected?.length) throw new Error('SMTP rejected the recipient');
    },
    close: () => transport?.close()
  };
}
