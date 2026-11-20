import './style.css';
import { TICK_S } from '../core/config.ts';
import { advanceNight, createCampaign, recordResult, startNight } from '../core/campaign.js';
import { createGame, nearestUnlitLantern, stepGame } from '../core/game.js';
import { NIGHTS } from '../core/maps.js';
import { gameAudio } from './audio.js';
import { createHud } from './hud.js';
import { createView } from './render.js';

const DEFAULT_ORBIT = { yaw: 0, pitch: 0.43, distance: 13.8 };
const GAME_SEED = 202603470;
const SETTINGS_KEY = 'dao-den-long-settings';
const ACTIONS = { Space: 'jump', KeyE: 'interact', KeyF: 'pulse', ShiftLeft: 'dash', ShiftRight: 'dash', Escape: 'pause', KeyP: 'pause' };
const CONTROLS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyR', ...Object.keys(ACTIONS)]);
const STORIES = [
  'Mây à, hãy mang đom đóm đến năm chiếc đèn. Khi Bóng Mực đến, con có thể trú trong vùng sáng.',
  'Cầu tre dẫn sang bờ bên kia. Bục nhảy cũng đưa con qua biển mây. Hãy coi chừng Gió Lạc khi túi đã đầy.',
  'Hãy tìm dốc để lên vành đá và dùng bục nhảy tới tháp chuông. Khi lá bắt đầu bay, cơn gió mạnh đã gần kề.',
];
const node = id => document.getElementById(id);

function readSettings() {
  const settings = { volume: 75, sensitivity: 100 };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (Number.isFinite(saved?.volume)) settings.volume = Math.max(0, Math.min(100, saved.volume));
    if (Number.isFinite(saved?.sensitivity)) settings.sensitivity = Math.max(25, Math.min(200, saved.sensitivity));
  } catch { /* Settings may be unavailable in private browsing. */ }
  return settings;
}

function start(view) {
  const hud = createHud();
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

  function show(next) {
    screen = next;
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
      show('dawn');
      return;
    }
    const messages = {
      all_lit: [`${game.map.name} đã sáng!`, 'Tất cả đèn lồng đã được thắp sáng.'],
      dawn: ['Bình minh đã đến', 'Vẫn còn đèn lồng chưa được thắp sáng.'],
      no_flames: ['Ngọn lửa đã tắt', 'Mây đã mất ngọn lửa cuối cùng.'],
    };
    const [title, detail] = messages[game.reason];
    node('result-night').textContent = `ĐÊM ${game.night} · ${game.map.name.toLocaleUpperCase('vi')}`;
    node('result-title').textContent = title;
    node('result-copy').textContent = detail;
    node('result-score').textContent = `${game.score} điểm đêm này · ${campaign.total} điểm tổng cộng`;
    node('result-action').textContent = game.state === 'won' ? 'Đêm kế tiếp' : 'Chơi lại đêm';
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
  for (const name of ['volume', 'sensitivity']) {
    const input = node(name);
    const output = node(`${name}-value`);
    input.value = settings[name];
    output.value = `${settings[name]}%`;
    input.oninput = () => {
      settings[name] = Number(input.value);
      output.value = `${settings[name]}%`;
      audio.setLevel(settings.volume / 100);
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Storage is optional. */ }
    };
  }

  window.addEventListener('keydown', event => {
    if (screen === 'settings' && event.code === 'Escape') {
      event.preventDefault();
      show(settingsParent);
      return;
    }
    if (!CONTROLS.has(event.code) || (screen !== 'play' && !(screen === 'pause' && ACTIONS[event.code] === 'pause'))) return;
    if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    if (!event.repeat) {
      audio.unlock();
      const action = ACTIONS[event.code];
      if (action) actions.add(action);
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

  const held = (...codes) => Number(codes.some(code => keys.has(code)));
  function runStep(timestamp) {
    if (screen === 'play') orbit.yaw = (orbit.yaw + (held('KeyR') - held('KeyQ')) * 105 * TICK_S) % 360;
    const simTick = game.simTick;
    const warning = game.wind.warning;
    const events = stepGame(game, {
      x: held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft'),
      z: held('KeyW', 'ArrowUp') - held('KeyS', 'ArrowDown'),
      cam_yaw_deg: orbit.yaw,
      jump: actions.delete('jump'), interact: actions.delete('interact'), pulse: actions.delete('pulse'),
      dash: !game.previousDash && actions.delete('dash'), pause: !game.previousPause && actions.delete('pause'),
    });
    for (const { name, data } of events) {
      audio.play(name, data);
      if (name === 'paused') { clearInput(); show('pause'); }
      if (name === 'resumed') { clearInput(); show('play'); }
      if (name === 'pulse') view.pulse(game.player.pos, game.simTick * TICK_S);
      if (name === 'lantern_lit') hud.announce(`Đèn ${data.lantern_id.slice(1)} đã sáng`, timestamp);
      if (name === 'charm_picked') hud.announce('Đã nhận Bùa Gió', timestamp);
      if (name === 'player_hit') hud.announce(data.by === 'fall' ? 'Mây rơi xuống biển mây' : 'Mây mất một ngọn lửa', timestamp);
      if (name === 'drifter_steal') hud.announce(`Gió Lạc cướp ${data.amount} đom đóm`, timestamp);
      if (name === 'game_over') result();
    }
    if (game.simTick === simTick || screen !== 'play') return;
    if (game.player.jumped) audio.play('jump');
    if (!warning && game.wind.warning) {
      audio.play('wind');
      hud.announce('Gió mạnh sắp đến', timestamp);
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
    view.render(game, orbit, time);
    if (screen === 'play') {
      const marker = view.outsideTarget(nearestUnlitLantern(game, Infinity)?.pos);
      hud.draw(game, timestamp, marker);
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
