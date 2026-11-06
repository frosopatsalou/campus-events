import { z } from 'zod';
import { fileURLToPath } from 'node:url';

if (process.env.NODE_ENV !== 'test') {
  try { process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export const env = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.string().default('info'),
  DB_STORAGE: z.string().default(fileURLToPath(new URL('../../data/events.sqlite', import.meta.url))),
  DATABASE_URL: z.url().optional(),
  DATABASE_CA_CERT: z.string().optional(),
  SMTP_URL: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default('Campus Events <events@localhost>'),
  MAIL_POLL_MS: z.coerce.number().int().min(100).default(5000),
  CACHE_TTL_MS: z.coerce.number().int().min(1).default(30000),
  SEED_DEMO: z.enum(['true', 'false']).default('true')
}).parse(Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== '')));
