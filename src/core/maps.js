import { TUNING as T, toTicks } from './config.ts';

const polar = (radius, angle, y = 0, centerX = 0) => {
  const theta = angle * Math.PI / 180;
  return [centerX + radius * Math.cos(theta), y, radius * Math.sin(theta)];
};

const ring = (count, radius, angle = 0, y = 0, centerX = 0) =>
  Array.from({ length: count }, (_, i) => polar(radius, angle + (360 / count) * i, y, centerX));

const island = (radius, x = 0) => ({ x, z: 0, radius });
const lanterns = positions => positions.map((pos, i) => ({ id: `L${i + 1}`, pos }));
const charms = positions => positions.map((pos, i) => ({ id: `C${i + 1}`, pos }));

const cauMotes = x => [...ring(4, 10, 0, 0, x), ...ring(8, 22, 0, 0, x)];
const chuongRamps = [30, 150].map(angle => {
  const [x, , z] = polar(1, angle);
  return { x, z, width: 3, foot: 30, top: 24, height: 3 };
});

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export const NIGHTS = freeze({
  1: {
    id: 1, name: 'Đảo Bến', duration: T.night1_duration_s, start: [0, 0, 0],
    islands: [island(T.island_radius)], pads: [], charms: [],
    lanterns: lanterns([[0, 0, 25], [23.8, 0, 7.7], [14.7, 0, -20.2], [-14.7, 0, -20.2], [-23.8, 0, 7.7]]),
    motePoints: [...ring(8, 12), ...ring(16, 33)], shadePoints: ring(12, 37, 15), fogPoints: [],
    shadeInterval: toTicks(T.shade_spawn_interval_s), maxShades: T.max_shades, shadeSpeed: T.shade_speed_mps,
  },
  2: {
    id: 2, name: 'Đảo Cau', duration: T.night2_duration_s, start: [0, 0, 0],
    islands: [island(T.night2_island_radius), island(T.night2_island_radius, 70)],
    bridge: { minX: 26, maxX: 44, halfWidth: 2 },
    pads: [
      { pos: [20, 0, 18], to: [70, 0, 0], vy: T.night2_pad_vy, speed: T.night2_pad_speed },
      { pos: [50, 0, -18], to: [0, 0, 0], vy: T.night2_pad_vy, speed: T.night2_pad_speed },
    ],
    charms: charms([[35, 0, 0]]),
    lanterns: lanterns([[0, 0, 20], [17, 0, -10], [-17, 0, -10], [70, 0, 20], [87, 0, -10], [53, 0, -10]]),
    motePoints: [...cauMotes(0), ...cauMotes(70)],
    shadePoints: [...ring(8, 26, 22.5), ...ring(8, 26, 22.5, 0, 70)],
    fogPoints: [...ring(8, 30, 22.5, 1), ...ring(8, 30, 22.5, 1, 70)],
    shadeInterval: toTicks(T.night2_shade_spawn_interval_s), maxShades: T.night2_max_shades, shadeSpeed: T.shade_speed_mps,
  },
  3: {
    id: 3, name: 'Đảo Chuông', duration: T.night3_duration_s, start: [0, 6, -3.5],
    islands: [island(T.night3_island_radius)],
    terrace: { inner: 12, outer: 24, height: 3 }, summit: { radius: 8, height: 6 },
    tower: { radius: 2, base: 6, height: 8 }, ramps: chuongRamps,
    pads: [{ pos: [0, 3, 13], to: [0, 3, 0], vy: T.night3_pad_vy, speed: T.night3_pad_speed }],
    charms: charms([[30, 0, 25], [-30, 0, 25]]),
    lanterns: lanterns([[0, 6, 6], [18, 3, 10], [-18, 3, 10], [35, 0, -10], [-35, 0, -10], [20, 0, -35], [-20, 0, -35]]),
    motePoints: [...ring(18, 34), ...Array.from({ length: 8 }, (_, i) => polar(18, (i + 1) * 20, 3)), ...ring(4, 5, 45, 6)],
    shadePoints: ring(16, 43), fogPoints: ring(16, 46, 11.25, 1), wind: true,
    shadeInterval: toTicks(T.night3_shade_spawn_interval_s), maxShades: T.night3_max_shades, shadeSpeed: T.night3_shade_speed_mps,
  },
});

export function walkableBase(map, x, z) {
  const bridge = map.bridge;
  return map.islands.some(part => Math.hypot(x - part.x, z - part.z) <= part.radius)
    || Boolean(bridge && x >= bridge.minX && x <= bridge.maxX && Math.abs(z) <= bridge.halfWidth);
}

export function groundHeight(map, x, z) {
  if (!walkableBase(map, x, z)) return -Infinity;
  if (!map.summit) return 0;
  const radius = Math.hypot(x, z);
  if (radius <= map.summit.radius) return map.summit.height;
  const { inner, outer, height } = map.terrace;
  if (z > 0 && radius >= inner && radius <= outer) return height;
  for (const ramp of map.ramps) {
    const along = x * ramp.x + z * ramp.z;
    const across = -x * ramp.z + z * ramp.x;
    if (along <= ramp.foot && Math.abs(across) <= ramp.width / 2) {
      // The ramp top follows the circular terrace so there is no gap at its shoulders.
      const summit = Math.sqrt(ramp.top ** 2 - across ** 2);
      if (along >= summit) return ramp.height * (ramp.foot - along) / (ramp.foot - summit);
    }
  }
  return 0;
}

export function towerBlocks(map, from, to) {
  const tower = map.tower;
  return Boolean(tower && to[1] < tower.base + tower.height && to[1] >= tower.base - 1.5
    && Math.hypot(to[0], to[2]) < tower.radius
    && Math.hypot(to[0], to[2]) < Math.hypot(from[0], from[2]));
}
