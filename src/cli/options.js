export function readOptions(args, expected) {
  const flags = new Map();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (!expected.includes(key) || flags.has(key) || !value || value.startsWith('--')) {
      throw new Error(`Invalid or repeated option: ${key}`);
    }
    flags.set(key, value);
  }
  for (const key of expected) if (!flags.has(key)) throw new Error(`${key} is required`);
  return flags;
}

export function integer(value, name, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  const result = Number(value);
  if (!/^[+-]?\d+$/.test(value) || !Number.isSafeInteger(result) || result < min || result > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return result;
}
