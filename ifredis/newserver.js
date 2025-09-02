const http = require('http');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

const { createWSHub } = require('./realtime/wsHub');           // your WS hub
const { FileTailer }  = require('./core/tailer');              // your offset tailer
const { readLastNLines } = require('./core/lastN');            // fallback seed
const { connectRedis, publishLine, subscribe, fetchSeed } =
  require('./realtime/redisBus');

const PORT   = process.env.PORT || 3000;
const ROOT   = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const LOG_PATH = process.env.LOG_PATH || path.join(ROOT, 'data', 'app.log');
const IS_INGEST = process.env.INGEST === '1';

// --- HTTP static ---
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/') {
    res.writeHead(200, {'Content-Type':'text/html'});
    fs.createReadStream(path.join(PUBLIC, 'index.html')).pipe(res);
  } else if (url.pathname === '/app.js') {
    res.writeHead(200, {'Content-Type':'application/javascript'});
    fs.createReadStream(path.join(PUBLIC, 'app.js')).pipe(res);
  } else if (url.pathname === '/healthz') {
    res.writeHead(200); res.end('ok');
  } else {
    res.writeHead(404); res.end('not found');
  }
});

// --- WS hub ---
const wss = createWSHub(server, '/stream');

(async () => {
  await fsp.mkdir(path.dirname(LOG_PATH), { recursive: true });
  try { await fsp.access(LOG_PATH); } catch { await fsp.writeFile(LOG_PATH, ''); }

  // 1) Redis connect
  await connectRedis();

  // 2) Subscribe ALL nodes: broadcast whatever Redis publishes
  await subscribe((msg) => {
    // msg = { id, text, ts }
    wss.broadcast({ type: 'line', id: msg.id, text: msg.text });
  });

  // 3) Optional ingester: follow the file and publish lines into Redis
  if (IS_INGEST) {
    const tailer = new FileTailer(LOG_PATH);
    tailer.on('line', async (text) => {
      try { await publishLine(text); } catch (e) { console.error('[ingest publish]', e); }
    });
    tailer.on('rotate',   () => wss.broadcast({ type: 'info', note: 'log rotated' }));
    tailer.on('truncate', () => wss.broadcast({ type: 'info', note: 'log truncated' }));
    await tailer.start();
    console.log('[ingest] tailing', LOG_PATH);
  } else {
    console.log('[viewer] no ingest here; relying on Redis stream');
  }

  // 4) Seed per connection from Redis ring; fallback to file if empty
  wss.on('connection', async (ws) => {
    try {
      const seed = await fetchSeed(10);
      if (seed.length) {
        wss.sendTo(ws, { type: 'seed', lines: seed.map(s => s.text) });
      } else {
        // cold start fallback (first run)
        const lines = await readLastNLines(LOG_PATH, 10);
        wss.sendTo(ws, { type: 'seed', lines });
      }
    } catch (e) {
      wss.sendTo(ws, { type: 'info', note: 'seed unavailable' });
    }
  });

  server.listen(PORT, () => {
    console.log(`HTTP:  http://localhost:${PORT}
WS:    ws://localhost:${PORT}/stream
Log:   ${LOG_PATH}
Role:  ${IS_INGEST ? 'INGEST (tails file)' : 'VIEWER (no tail)'}`);
  });
})();
