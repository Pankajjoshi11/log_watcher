const http = require('http');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { createWSHub } = require('./src/realTome/sse');
const { readLastNLines } = require('./src/core/lastN');
const { FileTailer } = require('./src/core/tailer');

const PORT = process.env.PORT || 3000;
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT,'log watcher', 'public');
const LOG_PATH = process.env.LOG_PATH || path.join(ROOT,'log watcher', 'data', 'app.log');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(path.join(PUBLIC, 'index.html')).pipe(res);
  } else if (url.pathname === '/app.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    fs.createReadStream(path.join(PUBLIC, 'app.js')).pipe(res);
  } else if (url.pathname === '/healthz') {
    res.writeHead(200); res.end('ok');
  } else {
    res.writeHead(404); res.end('not found');
  }
});

// WebSocket hub
const wss = createWSHub(server, '/stream');

// Tailer: broadcast new lines
const tailer = new FileTailer(LOG_PATH);
tailer.on('line', (text) => wss.broadcast({ type: 'line', text }));
tailer.on('rotate', () => wss.broadcast({ type: 'info', note: 'log rotated' }));
tailer.on('truncate', () => wss.broadcast({ type: 'info', note: 'log truncated' }));

// On each WS connection: send seed (last 10) to that client
wss.on('connection', async (ws) => {
  try {
    const seed = await readLastNLines(LOG_PATH, 10);
    wss.sendTo(ws, { type: 'seed', lines: seed });
  } catch {
    wss.sendTo(ws, { type: 'info', note: 'seed unavailable' });
  }
});

(async () => {
  await fsp.mkdir(path.dirname(LOG_PATH), { recursive: true });
  try { await fsp.access(LOG_PATH); } catch { await fsp.writeFile(LOG_PATH, ''); }
  await tailer.start();
  server.listen(PORT, () => console.log(`HTTP:  http://localhost:${PORT}\nWS:    ws://localhost:${PORT}/stream\nLog:   ${LOG_PATH}`));
})();
