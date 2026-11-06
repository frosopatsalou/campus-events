import express from 'express';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { routes } from './routes/index.mjs';
import { logger } from './config/logger.mjs';
import { notFound, errorHandler } from './middleware/errors.mjs';

export const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const start = performance.now();
  res.on('finish', () => logger.info('request', { method: req.method, url: req.originalUrl,
    status: res.statusCode, durationMs: Math.round(performance.now() - start) }));
  next();
});
// Server-side cache is invalidated on writes; browsers/proxies must not retain API data.
app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, routes);
app.use('/api', notFound);
const webRoot = fileURLToPath(new URL('../../web/dist/', import.meta.url));
if (existsSync(webRoot)) {
  app.use(express.static(webRoot));
  app.get('/{*path}', (_req, res) => res.sendFile(webRoot + '/index.html'));
}
app.use(notFound);
app.use(errorHandler);
