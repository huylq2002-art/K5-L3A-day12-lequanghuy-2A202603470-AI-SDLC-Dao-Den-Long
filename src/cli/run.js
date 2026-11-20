import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLeaderboard } from '../server/leaderboard.js';
import { dist, serve } from '../server/http.js';
import { integer } from './options.js';

try {
  const args = process.argv.slice(2);
  if (args[0] === '--export-leaderboard' && args.length === 2 && !args[1].startsWith('--')) {
    await writeFile(args[1], `${JSON.stringify(await createLeaderboard().read(), null, 2)}\n`);
  } else {
    const port = args.length === 0 ? 5173 : args[0] === '--port' && args.length === 2 ? integer(args[1], '--port', 0, 65535) : null;
    if (port === null) throw new Error('Usage: node src/cli/run.js [--port <port> | --export-leaderboard <file>]');
    if (!existsSync(join(dist, 'index.html'))) await (await import('vite')).build();
    const { url } = await serve(port);
    console.log(`Đảo Đèn Lồng: ${url}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
