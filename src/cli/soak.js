import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createGame, stepGame } from '../core/game.js';
import { seededRandom } from '../core/math.js';
import { TUNING as T } from '../core/config.ts';
import { integer, readOptions } from './options.js';

const rssMb = () => process.memoryUsage.rss() / 2 ** 20;

function simulate(game, seed) {
  const random = seededRandom(BigInt(seed) ^ 0x2995c7acn);
  const input = {};
  const limit = Math.round(game.duration * T.tick_hz);
  while (game.tick < limit && game.state === 'playing') {
    if (game.tick % 30 === 0) {
      const angle = random() * Math.PI * 2;
      input.x = Math.cos(angle);
      input.z = Math.sin(angle);
    }
    input.jump = random() < 0.05;
    input.dash = random() < 0.03;
    input.pulse = random() < 0.02;
    input.interact = random() < 0.10;
    stepGame(game, input);
  }
  return { night: game.night, seed, ticks: game.tick, state: game.state, reason: game.reason, score: game.score };
}

function run(args) {
  const flags = readOptions(args, ['--seed', '--nights', '--out']);
  const nights = integer(flags.get('--nights'), '--nights', 1);
  const seed = integer(flags.get('--seed'), '--seed', Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - (nights - 1));
  const started = performance.now();
  const results = [];
  let memStart = null;
  let crashes = 0;
  for (let i = 0; i < nights; i++) {
    const night = i % 3 + 1;
    const nightSeed = seed + i;
    let game;
    try {
      game = createGame(nightSeed, {}, night);
      memStart ??= rssMb();
      results.push(simulate(game, nightSeed));
    } catch (error) {
      crashes++;
      results.push({ night, seed: nightSeed, state: 'crashed', error: error.message });
    } finally {
      game = null;
      globalThis.gc?.();
    }
  }
  const memEnd = rssMb();
  const result = { nights, crashes, results, mem_start_mb: memStart, mem_end_mb: memEnd, duration_s: (performance.now() - started) / 1000 };
  writeFileSync(flags.get('--out'), `${JSON.stringify(result, null, 2)}\n`);
  if (crashes || memStart === null || memEnd > 1.2 * memStart) {
    console.error('Soak failed the crash or RSS budget. See the JSON report.');
    process.exitCode = 1;
  }
}

try { run(process.argv.slice(2)); }
catch (error) { console.error(error.message); process.exitCode = 2; }
