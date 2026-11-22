import { Router } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.mjs';
import { env } from '../config/env.mjs';

export const mcpRoutes = Router();
mcpRoutes.use((req, res, next) => {
  const hostname = req.hostname;
  const allowed = env.MCP_ALLOWED_HOSTS.split(',').map((host) => host.trim());
  let originAllowed = true;
  try { if (req.get('origin')) originAllowed = new URL(req.get('origin')).host === req.get('host'); }
  catch { originAllowed = false; }
  if (!allowed.includes(hostname) || !originAllowed) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Host or origin is not allowed' } });
  }
  res.set('Cache-Control', 'no-store');
  next();
});
mcpRoutes.post('/', async (req, res, next) => {
  // No in-memory MCP sessions: any API instance can handle the next call.
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) { next(error); }
});
mcpRoutes.all('/', (_req, res) => res.status(405).set('Allow', 'POST').json({
  error: { code: 'METHOD_NOT_ALLOWED', message: 'Use MCP Streamable HTTP POST requests' }
}));
