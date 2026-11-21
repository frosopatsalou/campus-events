import { sequelize } from '../db/connection.mjs';
import { ChangeLock } from '../models/index.mjs';

export async function initializeDatabase() {
  // Keep student names/emails outside the public schema exposed by Supabase.
  if (sequelize.getDialect() === 'postgres') await sequelize.query('CREATE SCHEMA IF NOT EXISTS "campus_events"');
  await sequelize.sync();
  await ChangeLock.findOrCreate({ where: { id: 1 } });
}
