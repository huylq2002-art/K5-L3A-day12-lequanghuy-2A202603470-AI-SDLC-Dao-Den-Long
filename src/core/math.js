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

export function directionXZ(from, to, fallback = [1, 0]) {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz);
  return length > 0 ? [dx / length, dz / length] : fallback;
}

export function offsetXZ([x, y, z], angle, radius) {
  return [x + Math.cos(angle) * radius, y, z + Math.sin(angle) * radius];
}

export function inReach(a, b, radius, height) {
  return Math.abs(a[1] - b[1]) <= height && distanceXZ(a, b) <= radius;
}

export function byId(a, b) {
  const first = /^([A-Z]+)(\d+)$/.exec(a.id);
  const second = /^([A-Z]+)(\d+)$/.exec(b.id);
  if (first && second && first[1] === second[1]) return Number(first[2]) - Number(second[2]);
  return a.id < b.id ? -1 : Number(a.id !== b.id);
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
