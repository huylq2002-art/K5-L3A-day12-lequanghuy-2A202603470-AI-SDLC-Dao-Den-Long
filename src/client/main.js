import './style.css';
import { TICK_S } from '../core/config.ts';
import { advanceNight, createCampaign, recordResult, startNight } from '../core/campaign.js';
import { createGame, nearestUnlitLantern, stepGame } from '../core/game.js';
import { requiredLit } from '../core/lanterns.js';
import { NIGHTS } from '../core/maps.js';
import { gameAudio } from './audio.js';
import { createHud } from './hud.js';
import { createLeaderboardPanel } from './leaderboard.js';
import { createView } from './render.js';
import { ACTION_LABELS, SETTINGS_KEY, actionFor, bindingKeys, keyLabel, normalizeSettings, rebind } from './settings.js';

const DEFAULT_ORBIT = { yaw: 0, pitch: 0.43, distance: 13.8 };
const GAME_SEED = 202603470;
const CAMERA_KEYS = ['KeyQ', 'KeyR'];
const PRESS_ACTIONS = new Set(['jump', 'dash', 'interact', 'pulse', 'pause']);
const STORIES = [
  'Mây à, giữ ít nhất ba đèn sáng đến bình minh. Đèn sắp cạn dầu sẽ nhấp nháy và Bóng Mực có thể đến hút dầu.',
  'Cầu tre và bục nhảy dẫn con sang bờ bên kia. Giữ bốn đèn sáng và châm dầu khi túi còn đom đóm.',
  'Dốc và bục nhảy dẫn lên tháp chuông. Giữ năm đèn sáng đến bình minh và coi chừng khi lá bắt đầu bay.',
];
const node = id => document.getElementById(id);

function readSettings() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
  } catch { /* Settings may be unavailable in private browsing. */ }
  return normalizeSettings(saved, matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function start(view) {
  const hud = createHud();
  const leaderboard = createLeaderboardPanel();
  const settings = readSettings();
  const audio = gameAudio(settings.volume / 100);
  const keys = new Set();
  const actions = new Set();
  const orbit = { ...DEFAULT_ORBIT };
  const screens = [...node('overlay').children];
  const menuPreview = createGame(GAME_SEED);
  let campaign = createCampaign(GAME_SEED);
  let game = menuPreview;
  let screen = 'menu';
  let settingsParent = 'menu';
  let previousTime;
  let accumulated = 0;
  let drag;
  let lastCountdown;
  let bindingAction;
  let shadeCue;
  let shakeStarted = -Infinity;
  const flash = node('screen-flash');

  function show(next) {
    screen = next;
    bindingAction = undefined;
    node('game-ui').hidden = next !== 'play';
    node('overlay').hidden = next === 'play';
    for (const panel of screens) panel.hidden = panel.id !== `${next}-screen`;
    if (next === 'play') document.activeElement?.blur();
    else node(`${next}-screen`).querySelector('button')?.focus();
    audio.quiet(next !== 'play');
  }

  function clearInput() {
    keys.clear();
    actions.clear();
    drag = undefined;
  }

  function resetView() {
    Object.assign(orbit, DEFAULT_ORBIT);
    hud.reset();
    view.reset();
    clearInput();
    previousTime = undefined;
    accumulated = 0;
    lastCountdown = undefined;
    shadeCue = undefined;
    shakeStarted = -Infinity;
    leaderboard.clear();
  }

  function menu() {
    campaign = createCampaign(GAME_SEED);
    game = menuPreview;
    resetView();
    show('menu');
  }

  function introduce() {
    const { night } = campaign;
    game = createGame(GAME_SEED, {}, night);
    resetView();
    node('intro-night').textContent = `ĐÊM ${night}`;
    node('intro-title').textContent = NIGHTS[night].name;
    node('intro-story').textContent = STORIES[night - 1];
    show('intro');
  }

  function enterNight() {
    game = startNight(campaign);
    resetView();
    audio.unlock();
    show('play');
  }

  function result() {
    recordResult(campaign);
    if (game.state === 'won' && game.night === 3) {
      node('dawn-score').textContent = `${campaign.total} điểm tổng cộng`;
      leaderboard.offer('dawn-save', campaign);
      show('dawn');
      return;
    }
    const messages = {
      dawn_survived: [`${game.map.name} đã sáng!`, 'Mây đã giữ đủ đèn sáng đến bình minh.'],
      dawn: ['Bình minh đã đến', `Cần ít nhất ${requiredLit(game.lanterns.length)} đèn sáng khi trời sáng.`],
      no_flames: ['Ngọn lửa đã tắt', 'Mây đã mất ngọn lửa cuối cùng.'],
    };
    const [title, detail] = messages[game.reason];
    node('result-night').textContent = `ĐÊM ${game.night} · ${game.map.name.toLocaleUpperCase('vi')}`;
    node('result-title').textContent = title;
    node('result-copy').textContent = detail;
    node('result-score').textContent = `${game.score} điểm đêm này · ${campaign.total} điểm tổng cộng`;
    node('result-action').textContent = game.state === 'won' ? 'Đêm kế tiếp' : 'Chơi lại đêm';
    if (game.state === 'lost') leaderboard.offer('loss-save', campaign);
    show('result');
  }

  node('start-game').onclick = () => { audio.unlock(); introduce(); };
  node('enter-night').onclick = enterNight;
  node('pause-restart').onclick = enterNight;
  node('pause-menu').onclick = menu;
  node('result-menu').onclick = menu;
  node('dawn-menu').onclick = menu;
  node('result-action').onclick = () => { if (advanceNight(campaign)) introduce(); else enterNight(); };
  node('pause').onclick = () => actions.add('pause');
  node('resume').onclick = () => actions.add('pause');
  node('menu-settings').onclick = () => { settingsParent = 'menu'; show('settings'); };
  node('pause-settings').onclick = () => { settingsParent = 'pause'; show('settings'); };
  node('settings-back').onclick = () => show(settingsParent);
  node('menu-leaderboard').onclick = () => { show('leaderboard'); leaderboard.refresh(); };
  node('leaderboard-back').onclick = menu;
  const persistSettings = () => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Storage is optional. */ }
  };
  for (const [id, name] of [['accessible-palette', 'accessiblePalette'], ['reduce-motion', 'reduceMotion'], ['large-text', 'largeText']]) {
    const toggle = node(id);
    const apply = () => { document.documentElement.dataset[name] = String(settings[name]); };
    toggle.checked = settings[name];
    toggle.onchange = () => {
      settings[name] = toggle.checked;
      apply();
      persistSettings();
      hud.reset();
    };
    apply();
  }
  for (const name of ['volume', 'sensitivity']) {
    const input = node(name);
    const output = node(`${name}-value`);
    input.value = settings[name];
    output.value = `${settings[name]}%`;
    input.oninput = () => {
      settings[name] = Number(input.value);
      output.value = `${settings[name]}%`;
      audio.setLevel(settings.volume / 100);
      persistSettings();
    };
  }

  const bindingRows = Object.entries(ACTION_LABELS).map(([action, label]) => {
    const row = document.createElement('div');
    const button = document.createElement('button');
    const name = document.createElement('span');
    name.textContent = label;
    name.id = `label-key-${action}`;
    button.id = `bind-${action}`;
    button.setAttribute('aria-labelledby', `${name.id} ${button.id}`);
    button.onclick = () => {
      bindingAction = action;
      node('binding-status').textContent = `Nhấn phím mới cho “${label}”. Dùng Tab để hủy.`;
    };
    row.append(name, button);
    node('bindings-list').append(row);
    return [action, button];
  });

  function showBindings() {
    const display = action => [...new Set(bindingKeys(settings.bindings, action).map(keyLabel))].join(' / ');
    for (const [action, button] of bindingRows) button.textContent = display(action);
    for (const label of document.querySelectorAll('[data-action-key]')) {
      label.textContent = keyLabel(bindingKeys(settings.bindings, label.dataset.actionKey)[0]);
    }
    node('move-keys').textContent = ['forward', 'left', 'back', 'right'].map(action => keyLabel(bindingKeys(settings.bindings, action)[0])).join(' · ');
    node('pause').title = `Tạm dừng (${display('pause')})`;
  }
  showBindings();
  node('settings-keys').onclick = () => { node('binding-status').textContent = ''; show('bindings'); };
  node('bindings-back').onclick = () => show('settings');
  node('reset-bindings').onclick = () => {
    settings.bindings = {};
    bindingAction = undefined;
    persistSettings();
    showBindings();
    node('binding-status').textContent = 'Đã khôi phục phím mặc định.';
  };

  window.addEventListener('keydown', event => {
    if (screen === 'bindings' && bindingAction) {
      if (event.code === 'Tab') {
        bindingAction = undefined;
        node('binding-status').textContent = 'Đã hủy đổi phím.';
        return;
      }
      event.preventDefault();
      if (event.repeat) return;
      const mapped = rebind(settings.bindings, bindingAction, event.code);
      const feedback = node('binding-status');
      if (mapped.conflict) { feedback.textContent = `Trùng phím với “${ACTION_LABELS[mapped.conflict]}”. Hãy chọn phím khác.`; return; }
      if (mapped.error) { feedback.textContent = mapped.error; return; }
      settings.bindings = mapped.bindings;
      bindingAction = undefined;
      persistSettings();
      showBindings();
      feedback.textContent = 'Đã đổi phím.';
      return;
    }
    if (screen === 'bindings' && event.code === 'Escape') { event.preventDefault(); show('settings'); return; }
    if (screen === 'settings' && event.code === 'Escape') {
      event.preventDefault();
      show(settingsParent);
      return;
    }
    const action = actionFor(settings.bindings, event.code);
    if ((!action && !CAMERA_KEYS.includes(event.code)) || (screen !== 'play' && !(screen === 'pause' && action === 'pause'))) return;
    if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    if (!event.repeat) {
      audio.unlock();
      if (PRESS_ACTIONS.has(action)) actions.add(action);
    }
    keys.add(event.code);
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', () => { previousTime = undefined; clearInput(); });
  view.canvas.addEventListener('pointerdown', event => {
    if (screen !== 'play' || !event.isPrimary || event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    view.canvas.setPointerCapture(event.pointerId);
    audio.unlock();
    document.activeElement?.blur();
  });
  view.canvas.addEventListener('pointermove', event => {
    if (screen !== 'play' || drag?.id !== event.pointerId) return;
    const ratio = settings.sensitivity / 100;
    orbit.yaw = (orbit.yaw + (event.clientX - drag.x) * 0.34 * ratio) % 360;
    orbit.pitch = Math.max(0.16, Math.min(0.93, orbit.pitch + (event.clientY - drag.y) * 0.006 * ratio));
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  view.canvas.addEventListener('lostpointercapture', () => { drag = undefined; });
  view.canvas.addEventListener('wheel', event => {
    if (screen !== 'play') return;
    event.preventDefault();
    orbit.distance = Math.max(8.4, Math.min(23, orbit.distance + Math.sign(event.deltaY) * 0.85));
  }, { passive: false });

  const held = action => Number(bindingKeys(settings.bindings, action).some(code => keys.has(code)));
  const orbitHeld = code => Number(keys.has(code) && !actionFor(settings.bindings, code));
  function playFlash(name, timestamp) {
    if (settings.reduceMotion) return;
    flash.getAnimations().forEach(animation => animation.cancel());
    flash.style.backgroundColor = name === 'pulse' ? '#ffe9b0' : '#ff5a5f';
    flash.animate([{ opacity: 0.16 }, { opacity: 0 }], 180);
    if (name === 'player_hit') shakeStarted = timestamp;
  }

  function runStep(timestamp) {
    if (screen === 'play') orbit.yaw = (orbit.yaw + (orbitHeld('KeyR') - orbitHeld('KeyQ')) * 105 * TICK_S) % 360;
    const simTick = game.simTick;
    const warning = game.wind.warning;
    const events = stepGame(game, {
      x: held('right') - held('left'),
      z: held('forward') - held('back'),
      cam_yaw_deg: orbit.yaw,
      jump: actions.delete('jump'), interact: actions.delete('interact'), pulse: actions.delete('pulse'),
      dash: !game.previousDash && actions.delete('dash'), pause: !game.previousPause && actions.delete('pause'),
    });
    for (const { name, data } of events) {
      audio.play(name, data);
      if (name === 'paused') { clearInput(); show('pause'); }
      if (name === 'resumed') { clearInput(); show('play'); }
      if (name === 'pulse') view.pulse(game.player.pos, game.simTick * TICK_S);
      if (name === 'pulse' || name === 'player_hit') playFlash(name, timestamp);
      if (name === 'shade_spawned') shadeCue = { id: data.id, until: game.simTick + 180 };
      if (name === 'lantern_lit') hud.announce(`Đèn ${data.lantern_id.slice(1)} ${data.relight ? 'đã sáng lại' : 'đã sáng'}`, timestamp);
      if (name === 'refuel') hud.announce(`Đã châm dầu đèn ${data.lantern_id.slice(1)}`, timestamp);
      if (name === 'lantern_out') hud.announce(`Đèn ${data.lantern_id.slice(1)} đã cạn dầu`, timestamp, true);
      if (name === 'charm_picked') hud.announce('Đã nhận Bùa Gió', timestamp);
      if (name === 'player_hit') hud.announce(data.by === 'fall' ? 'Mây rơi xuống biển mây' : 'Mây mất một ngọn lửa', timestamp, true);
      if (name === 'drifter_steal') hud.announce(`Gió Lạc cướp ${data.amount} đom đóm`, timestamp, true);
      if (name === 'game_over') result();
    }
    if (game.simTick === simTick || screen !== 'play') return;
    if (game.player.jumped) audio.play('jump');
    if (!warning && game.wind.warning) {
      audio.play('wind');
      hud.announce('Gió mạnh sắp đến', timestamp, true);
    }
    const seconds = Math.ceil(game.timeLeft);
    if (seconds > 0 && seconds <= 10 && seconds !== lastCountdown) {
      lastCountdown = seconds;
      audio.play('countdown', { seconds });
    }
    if ((game.simTick - 1) % 240 === 0) audio.music(game.night, Math.floor(game.simTick / 240));
  }

  function frame(timestamp) {
    const elapsed = previousTime === undefined ? 0 : (timestamp - previousTime) / 1000;
    previousTime = timestamp;
    if ((screen === 'play' || screen === 'pause') && !document.hidden) {
      accumulated += Math.min(elapsed, 0.25);
      let steps = 0;
      while (accumulated >= TICK_S && (screen === 'play' || screen === 'pause') && steps < 15) {
        runStep(timestamp);
        accumulated -= TICK_S;
        steps++;
      }
    }
    const time = screen === 'menu' ? timestamp / 1000 : game.simTick * TICK_S;
    const shakeAge = timestamp - shakeStarted;
    orbit.shake = screen === 'play' && !settings.reduceMotion && shakeAge < 320 ? Math.sin(shakeAge * 0.092) * (1 - shakeAge / 320) * 0.18 : 0;
    view.render(game, orbit, time, settings.accessiblePalette);
    if (screen === 'play') {
      const marker = view.outsideTarget(nearestUnlitLantern(game, Infinity)?.pos);
      const shade = shadeCue?.until > game.simTick ? game.shades.find(entry => entry.id === shadeCue.id) : null;
      hud.draw(game, timestamp, marker, settings.accessiblePalette, view.outsideTarget(shade?.pos, true));
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

try {
  start(createView(node('scene')));
} catch (error) {
  node('fatal').textContent = 'Không mở được cảnh 3D. Hãy kiểm tra hỗ trợ WebGL 2 của trình duyệt.';
  node('fatal').hidden = false;
  console.error(error);
}
