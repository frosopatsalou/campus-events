import { app } from '../../src/app.mjs';
import { Event, Registration } from '../../src/models/index.mjs';
import { sequelize } from '../../src/db/connection.mjs';
import { readCache } from '../../src/cache/readCache.mjs';

// Imports initialize the application and its database connection.
// .env.test sets DB_STORAGE=:memory:, so the tests never touch your real data.
// Every call empties all tables: tests never share state.
export async function createTestApp() {
  readCache.clear();
  await sequelize.sync({ force: true });
  return { app, db: { sequelize, Event, Registration } };
}

export const validEvent = (overrides = {}) => ({
  title: 'Backend Bootcamp',
  location: 'Room C101',
  startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  capacity: 10,
  ...overrides
});
