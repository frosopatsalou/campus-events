import { AppError } from '../errors/AppError.mjs';
import { logger } from '../config/logger.mjs';
export function notFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route ' + req.method + ' ' + req.originalUrl + ' not found' } });
}
export function errorHandler(err, _req, res, _next) {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
  if (err instanceof AppError) return res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.details && { details: err.details }) } });
  logger.error(err.message, { stack: err.stack });
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
}
