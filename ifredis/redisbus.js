// Minimal Redis Pub/Sub + ring buffer for seed
const { createClient } = require('redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Keys / channels
const CHANNEL  = process.env.REDIS_CHANNEL  || 'log:lines';
const RING_KEY = process.env.REDIS_RING_KEY || 'log:ring';
const RING_CAP = parseInt(process.env.RING_CAP || '200', 10);
const SEQ_KEY  = process.env.SEQ_KEY || 'log:seq';

let pub, sub;

async function connectRedis() {
  pub = createClient({ url: REDIS_URL });
  sub = pub.duplicate();
  pub.on('error', (e) => console.error('[redis pub] ', e));
  sub.on('error', (e) => console.error('[redis sub] ', e));
  await pub.connect();
  await sub.connect();
  console.log('[redis] connected', REDIS_URL);
  return { pub, sub };
}

// Publish a line: assign a monotonic id, publish, and keep in ring buffer
async function publishLine(text) {
  const id = await pub.incr(SEQ_KEY);
  const payload = JSON.stringify({ id, text, ts: Date.now() });
  // Use MULTI so push+trim are atomic
  await pub
    .multi()
    .rPush(RING_KEY, payload)
    .lTrim(RING_KEY, -RING_CAP, -1) // keep last RING_CAP items
    .exec();
  await pub.publish(CHANNEL, payload);
  return id;
}

// Subscribe handler
async function subscribe(onMessage) {
  await sub.subscribe(CHANNEL, (raw) => {
    try {
      const msg = JSON.parse(raw);
      onMessage(msg); // {id, text, ts}
    } catch (_) {}
  });
}

// Fetch last N from ring (seed)
async function fetchSeed(n = 10) {
  const raw = await pub.lRange(RING_KEY, -n, -1); // last n items
  return raw.map((r) => JSON.parse(r)); // [{id,text,ts}, ...]
}

module.exports = {
  connectRedis, publishLine, subscribe, fetchSeed,
  CHANNEL, RING_KEY, RING_CAP
};
