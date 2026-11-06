import { createLogger, format, transports } from 'winston';
import { env } from './env.mjs';
export const logger = createLogger({
  level: env.LOG_LEVEL,
  silent: env.NODE_ENV === 'test',
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()]
});
