import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';

const DEFAULT_FILE = fileURLToPath(new URL('../../data/leaderboard.json', import.meta.url));

export function validResult(result) {
  return result && typeof result.name === 'string' && /^[A-Za-z0-9_]{3,12}$/.test(result.name)
    && Number.isSafeInteger(result.score) && result.score >= 0
    && Number.isInteger(result.nights_won) && result.nights_won >= 0 && result.nights_won <= 3
    && Number.isSafeInteger(result.seed);
}

export function rankEntries(entries) {
  return [...entries].sort((a, b) => b.score - a.score || Date.parse(a.achieved_at) - Date.parse(b.achieved_at)).slice(0, 10);
}

async function acquire(lock) {
  const deadline = Date.now() + 3000;
  for (;;) {
    try { return await open(lock, 'wx'); } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const age = await stat(lock).then(value => Date.now() - value.mtimeMs, () => 0);
      if (age > 60_000) {
        await unlink(lock).catch(error => { if (error.code !== 'ENOENT') throw error; });
      } else {
        if (Date.now() >= deadline) throw new Error('Leaderboard file is busy');
        await wait(25);
      }
    }
  }
}

export function createLeaderboard(file = process.env.DAO_DEN_LONG_LEADERBOARD || DEFAULT_FILE) {
  file = resolve(file);
  async function read() {
    let raw;
    try { raw = await readFile(file, 'utf8'); } catch (error) {
      if (error.code === 'ENOENT') return { entries: [] };
      throw error;
    }
    const { entries } = JSON.parse(raw);
    if (!Array.isArray(entries) || entries.some(item => !validResult(item) || typeof item.achieved_at !== 'string'
      || !/(?:Z|[+-]\d{2}:\d{2})$/.test(item.achieved_at) || !Number.isFinite(Date.parse(item.achieved_at)))) {
      throw new Error('Invalid leaderboard file');
    }
    return { entries: rankEntries(entries) };
  }

  async function add({ name, score, nights_won, seed }, now = new Date()) {
    const entry = { name, score, nights_won, achieved_at: now.toISOString(), seed };
    if (!validResult(entry)) throw new TypeError('Invalid leaderboard entry');
    await mkdir(dirname(file), { recursive: true });
    const lock = `${file}.lock`;
    const handle = await acquire(lock);
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      const previous = await read();
      const entries = rankEntries([...previous.entries, entry]);
      const saved = entries.includes(entry);
      if (saved) {
        await writeFile(temporary, `${JSON.stringify({ entries }, null, 2)}\n`, { flag: 'wx' });
        await rename(temporary, file);
      }
      return { entries, saved };
    } finally {
      await handle.close();
      await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }).finally(() => unlink(lock));
    }
  }

  return { read, add };
}

async function input(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 2048) chunks.push(chunk);
  }
  return size <= 2048 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
}

export function leaderboardApi(store) {
  const send = (res, code, data) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  };
  return async (req, res, next) => {
    if (req.url?.split('?')[0] !== '/api/leaderboard') return next();
    try {
      if (req.method === 'GET') return send(res, 200, await store.read());
      if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
      if (req.headers['content-type']?.split(';')[0] !== 'application/json') return send(res, 415, { error: 'Expected JSON' });
      const data = await input(req).catch(() => null);
      if (!validResult(data)) return send(res, 400, { error: 'Invalid score or name (3–12 characters: A–Z, a–z, 0–9, _)' });
      return send(res, 201, await store.add(data));
    } catch (error) {
      return send(res, 500, { error: 'Unable to access local leaderboard' });
    }
  };
}
