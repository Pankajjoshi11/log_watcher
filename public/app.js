const el = document.getElementById('log');
const btn = document.getElementById('pause');
const state = document.getElementById('state');
let paused = false;
const MAX_LINES = 1000;

btn.onclick = () => { paused = !paused; btn.textContent = paused ? 'Resume scroll' : 'Pause scroll'; };

function appendLine(text, cls = 'line') {
  const div = document.createElement('div');
  div.className = cls;
  div.textContent = text;
  el.appendChild(div);
  while (el.children.length > MAX_LINES) el.removeChild(el.firstChild);
  if (!paused) window.scrollTo(0, document.body.scrollHeight);
}

function connect() {
  const ws = new WebSocket('ws://localhost:3000/stream'); // <— force correct server
  ws.onopen = () => console.log('[ws] open');
  ws.onclose = () => { console.log('[ws] closed, reconnecting…'); setTimeout(connect, 1000); };
  ws.onerror = () => {}; // handled by onclose
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data || '{}');
    if (msg.type === 'seed') (msg.lines || []).forEach(l => appendLine(l));
    if (msg.type === 'line') appendLine(msg.text);
    if (msg.type === 'info') appendLine(`[info] ${msg.note}`, 'line muted');
  };
}
connect();
