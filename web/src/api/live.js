// The server sends ordered, permanent log IDs. A high-water mark deduplicates
// retries without keeping an ever-growing set of IDs in the browser.
export function connectLive(url, { snapshot, changes, reset }, {
  EventSourceClass = EventSource, now = Date.now, windowObject = window,
  documentObject = document, schedule = setInterval, cancel = clearInterval
} = {}) {
  let source;
  let generation = 0;
  let cursor;
  let lastSeen = now();
  let stopped = false;
  function connect() {
    source?.close();
    const current = ++generation;
    cursor = undefined;
    lastSeen = now();
    reset();
    source = new EventSourceClass(url);
    function receive(type, work) {
      source.addEventListener(type, (event) => {
        if (stopped || current !== generation) return;
        // A suspended laptop may receive buffered frames before its wake timer.
        if (now() - lastSeen > 15000) { connect(); return; }
        lastSeen = now();
        try { work(JSON.parse(event.data)); }
        catch { connect(); }
      });
    }
    receive('snapshot', (data) => { cursor = BigInt(data.cursor); snapshot(data.events); });
    receive('heartbeat', () => {});
    receive('changes', (data) => {
      if (cursor === undefined) return;
      const fresh = [];
      for (const item of data.notifications) {
        if (BigInt(item.id) <= cursor) continue;
        fresh.push(item);
        cursor = BigInt(item.id);
      }
      if (!fresh.length) return;
      snapshot(data.events);
      changes(fresh);
    });
    // Native reconnect requests receive a new snapshot, never a toast backlog.
    source.addEventListener('error', () => { cursor = undefined; reset(); });
  }
  const wake = () => { if (documentObject.visibilityState !== 'hidden') connect(); };
  windowObject.addEventListener('online', wake);
  windowObject.addEventListener('pageshow', wake);
  documentObject.addEventListener('visibilitychange', wake);
  const timer = schedule(() => { if (now() - lastSeen > 15000) connect(); }, 5000);
  connect();
  return () => {
    stopped = true;
    generation++;
    source.close();
    cancel(timer);
    windowObject.removeEventListener('online', wake);
    windowObject.removeEventListener('pageshow', wake);
    documentObject.removeEventListener('visibilitychange', wake);
  };
}
