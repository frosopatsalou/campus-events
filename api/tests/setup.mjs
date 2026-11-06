import { env } from '../src/config/env.mjs';

// --env-file does not override inherited hosting secrets. Force isolated settings
// before any test imports the database, so build-time tests cannot reset production.
Object.assign(env, {
  NODE_ENV: 'test', LOG_LEVEL: 'error', DB_STORAGE: ':memory:',
  DATABASE_URL: undefined, DATABASE_CA_CERT: undefined,
  SMTP_URL: undefined, RESEND_API_KEY: undefined
});
