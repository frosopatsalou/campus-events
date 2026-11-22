import { liveFeed } from '../services/liveFeed.mjs';

export async function liveController(req, res, next) {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store',
    Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  let closed = false;
  let unsubscribe;
  res.on('close', () => { closed = true; unsubscribe?.(); });
  try {
    unsubscribe = await liveFeed.subscribe((type, data) => {
      if (closed) return;
      // Disconnect slow clients instead of accumulating an unlimited backlog.
      if (!res.write('event: ' + type + '\ndata: ' + JSON.stringify(data) + '\n\n')) res.end();
    });
    if (closed) unsubscribe();
  } catch (error) {
    if (res.headersSent) res.end();
    else next(error);
  }
}
