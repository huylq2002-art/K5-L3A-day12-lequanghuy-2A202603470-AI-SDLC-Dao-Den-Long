import { TUNING as T } from './config.ts';
import { createGame } from './game.js';
import { providesSafety } from './lanterns.js';
import { seededRandom } from './math.js';
import { moveShades, updateSafeZones } from './shades.js';

function scatter(count, random) {
  const turn = Math.PI * 2;
  const start = random() * turn;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const angle = start + i * goldenAngle + (random() - 0.5) * 0.07;
    const radius = (T.island_radius - 0.5) * Math.sqrt((i + 0.5) / count);
    return [radius * Math.cos(angle), 0, radius * Math.sin(angle)];
  });
}

export function createBenchmark(seed) {
  const random = seededRandom(seed);
  return createGame(seed, {
    random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false,
    motes: scatter(100, random),
    shades: scatter(200, random).map(pos => ({ pos, state: 'wander' })),
    lanterns: ['L1', 'L2', 'L3'].map(id => ({ id, lit: true, fuel: 100 })),
  }, 1);
}

export function stepBenchmark(state) {
  state.tick++;
  state.simTick++;
  const lamps = state.lanterns.filter(providesSafety);
  updateSafeZones(state, lamps);
  moveShades(state, lamps, true);
}

export function benchmarkCamera(seconds) {
  const angle = seconds * Math.PI * 2 / 15;
  return [30 * Math.cos(angle), 15, 30 * Math.sin(angle)];
}
