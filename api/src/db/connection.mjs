import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Sequelize } from 'sequelize';
import { env } from '../config/env.mjs';
if (!env.DATABASE_URL && env.DB_STORAGE !== ':memory:') mkdirSync(dirname(env.DB_STORAGE), { recursive: true });
export const sequelize = env.DATABASE_URL
  ? new Sequelize(env.DATABASE_URL, {
    dialect: 'postgres', logging: false,
    define: { schema: 'campus_events' },
    pool: { max: 3, min: 0, idle: 10000 },
    dialectOptions: { ssl: { require: true, rejectUnauthorized: true, ...(env.DATABASE_CA_CERT && { ca: env.DATABASE_CA_CERT }) } }
  })
  : new Sequelize({ dialect: 'sqlite', storage: env.DB_STORAGE, logging: false });
