export const SETTINGS_KEY = 'dao-den-long-settings';

export const ACTION_LABELS = Object.freeze({
  forward: 'Tiến', back: 'Lùi', left: 'Trái', right: 'Phải', jump: 'Nhảy',
  dash: 'Lướt', interact: 'Nạp đèn', pulse: 'Tỏa sáng', pause: 'Tạm dừng',
});

const defaults = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space'], dash: ['ShiftLeft', 'ShiftRight'], interact: ['KeyE'], pulse: ['KeyF'], pause: ['Escape', 'KeyP'],
};

const validCode = code => typeof code === 'string' && /^[A-Za-z][A-Za-z0-9]{0,31}$/.test(code);
const bounded = (value, fallback, min, max) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

export function bindingKeys(bindings, action) {
  return bindings[action] ? [bindings[action]] : defaults[action];
}

export function actionFor(bindings, code) {
  return Object.keys(defaults).find(action => bindingKeys(bindings, action).includes(code));
}

function conflictFor(bindings, action, code) {
  return Object.keys(defaults).find(other => other !== action && bindingKeys(bindings, other).includes(code));
}

export function rebind(bindings, action, code) {
  if (!Object.hasOwn(defaults, action) || !validCode(code)) return { error: 'Phím này không dùng được.' };
  const conflict = conflictFor(bindings, action, code);
  if (conflict) return { conflict };
  return { bindings: { ...bindings, [action]: code } };
}

export function normalizeSettings(saved = {}, prefersReduce = false) {
  const bindings = {};
  for (const action of Object.keys(defaults)) {
    const code = saved?.bindings?.[action];
    if (validCode(code)) bindings[action] = code;
  }
  let duplicate;
  while ((duplicate = Object.keys(bindings).find(action => conflictFor(bindings, action, bindings[action])))) delete bindings[duplicate];
  return {
    volume: bounded(saved?.volume, 75, 0, 100), sensitivity: bounded(saved?.sensitivity, 100, 25, 200),
    accessiblePalette: saved?.accessiblePalette === true,
    reduceMotion: typeof saved?.reduceMotion === 'boolean' ? saved.reduceMotion : prefersReduce,
    largeText: saved?.largeText === true, bindings,
  };
}

export function keyLabel(code) {
  const labels = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', ShiftLeft: 'Shift', ShiftRight: 'Shift' };
  return labels[code] ?? code.replace(/^(Key|Digit)/, '');
}
