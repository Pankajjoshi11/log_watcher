// Efficiently read the last N lines (backward block scan; no full-file read)
const fs = require('fs/promises');

async function readLastNLines(path, n = 10, block = 64 * 1024) {
  const fh = await fs.open(path, 'r').catch(() => null);
  if (!fh) return [];
  try {
    const stat = await fh.stat();
    let size = stat.size;
    if (size === 0) return [];
    let pos = size;
    let chunked = '';
    let lines = 0;

    while (pos > 0 && lines <= n) {
      const readSize = Math.min(block, pos);
      pos -= readSize;
      const { bytesRead, buffer } = await fh.read({
        buffer: Buffer.allocUnsafe(readSize),
        position: pos
      });
      chunked = buffer.toString('utf8', 0, bytesRead) + chunked;
      lines = (chunked.match(/\n/g) || []).length;
    }

    let arr = chunked.split(/\r?\n/);
    if (arr[arr.length - 1] === '') arr.pop();
    if (arr.length > n) arr = arr.slice(-n);
    return arr;
  } finally {
    await fh.close();
  }
}

module.exports = { readLastNLines };
