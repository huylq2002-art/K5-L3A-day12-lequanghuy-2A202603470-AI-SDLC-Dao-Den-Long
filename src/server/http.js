import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLeaderboard, leaderboardApi } from './leaderboard.js';

export const dist = fileURLToPath(new URL('../../dist/', import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml',
};

export async function serve(port = 0, root = dist) {
  const prefix = resolve(root) + sep;
  const api = leaderboardApi(createLeaderboard());
  async function staticFile(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    const file = path.startsWith(prefix) ? await stat(path).catch(() => null) : null;
    if (!file?.isFile()) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream', 'Content-Length': file.size });
    if (req.method === 'HEAD') res.end();
    else createReadStream(path).on('error', () => res.destroy()).pipe(res);
  }
  const server = createServer((req, res) => {
    api(req, res, () => staticFile(req, res).catch(() => res.writeHead(400).end('Bad request')));
  });
  await new Promise((ready, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', ready);
  });
  return { server, url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(done => server.close(done)) };
}
