import { TUNING } from './config.ts';

export function distanceXZ(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

export function rotateMove(x, z, yawDeg) {
  const scale = Math.max(1, Math.abs(x), Math.abs(z));
  x /= scale;
  z /= scale;
  const length = Math.max(1 / scale, Math.hypot(x, z));
  x /= length;
  z /= length;
  const radians = yawDeg * Math.PI;
  const angle = Number.isFinite(radians) ? radians / 180 : (yawDeg / 180) * Math.PI;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [x * cos + z * sin, -x * sin + z * cos];
}

export function confineToIsland([x, y, z]) {
  const length = Math.hypot(x, z);
  if (length <= TUNING.island_radius) return [x, y, z];
  const angle = Math.atan2(z, x);
  return [Math.cos(angle) * TUNING.island_radius, y, Math.sin(angle) * TUNING.island_radius];
}

export function offsetXZ([x, y, z], angle, radius) {
  return [x + Math.cos(angle) * radius, y, z + Math.sin(angle) * radius];
}

export function seededRandom(seed) {
  const bits = BigInt(seed);
  let value = Number(BigInt.asUintN(32, bits ^ (bits >> 32n)));
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let mixed = Math.imul(value ^ (value >>> 15), value | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  };
}
