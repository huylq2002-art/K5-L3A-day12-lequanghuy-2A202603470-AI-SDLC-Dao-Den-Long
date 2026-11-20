import './style.css';
import { TICK_S, TUNING as T } from '../core/config.ts';
import { createGame, stepGame } from '../core/game.js';
import { gameAudio } from './audio.js';
import { createHud } from './hud.js';
import { createView } from './render.js';

const DEFAULT_ORBIT = { yaw: 0, pitch: 0.43, distance: 13.8 };
const GAME_SEED = 202603470;
const ACTIONS = { Space: 'jump', KeyE: 'interact', KeyF: 'pulse' };
const CONTROLS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyR', ...Object.keys(ACTIONS)]);

function start(view) {
  const hud = createHud();
  const audio = gameAudio();
  const keys = new Set();
  const actions = new Set();
  const orbit = { ...DEFAULT_ORBIT };
  let state = createGame(GAME_SEED);
  let previousTime;
  let accumulated = 0;
  let drag;

  function clearInput() {
    keys.clear();
    actions.clear();
    drag = undefined;
  }

  function restart() {
    state = createGame(GAME_SEED);
    Object.assign(orbit, DEFAULT_ORBIT);
    hud.reset();
    view.reset();
    clearInput();
    previousTime = undefined;
    accumulated = 0;
    audio.unlock();
    document.activeElement?.blur();
  }

  window.addEventListener('keydown', event => {
    if (!CONTROLS.has(event.code) || state.state !== 'playing') return;
    if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    if (!keys.has(event.code)) {
      audio.unlock();
      const action = ACTIONS[event.code];
      if (action) actions.add(action);
    }
    keys.add(event.code);
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', () => {
    previousTime = undefined;
    clearInput();
  });
  view.canvas.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    view.canvas.setPointerCapture(event.pointerId);
    audio.unlock();
    document.activeElement?.blur();
  });
  view.canvas.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    orbit.yaw = (orbit.yaw + (event.clientX - drag.x) * 0.34) % 360;
    orbit.pitch = Math.max(0.16, Math.min(0.93, orbit.pitch + (event.clientY - drag.y) * 0.006));
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  view.canvas.addEventListener('lostpointercapture', () => { drag = undefined; });
  view.canvas.addEventListener('wheel', event => {
    event.preventDefault();
    orbit.distance = Math.max(8.4, Math.min(23, orbit.distance + Math.sign(event.deltaY) * 0.85));
  }, { passive: false });
  document.getElementById('restart').addEventListener('click', restart);
  document.getElementById('play-again').addEventListener('click', restart);
  document.getElementById('sound').addEventListener('click', event => {
    event.currentTarget.setAttribute('aria-pressed', String(audio.toggle()));
  });

  const held = (...codes) => Number(codes.some(code => keys.has(code)));
  function runStep(timestamp) {
    orbit.yaw = (orbit.yaw + (held('KeyR') - held('KeyQ')) * 105 * TICK_S) % 360;
    const input = {
      x: held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft'),
      z: held('KeyW', 'ArrowUp') - held('KeyS', 'ArrowDown'),
      cam_yaw_deg: orbit.yaw,
      jump: actions.delete('jump'),
      interact: actions.delete('interact'),
      pulse: actions.delete('pulse'),
    };
    const events = stepGame(state, input);
    if (input.pulse && !events.some(event => event.name === 'pulse') && state.state === 'playing') {
      const seconds = Math.ceil((state.player.pulseReadyTick - state.tick) / T.tick_hz);
      hud.announce(seconds > 0 ? `Tỏa sáng hồi lại sau ${seconds} giây` : `Tỏa sáng cần ${T.pulse_cost} ánh sáng`, timestamp);
    }
    for (const { name, data } of events) {
      audio.play(name, data);
      if (name === 'pulse') view.pulse(state.player.pos, timestamp / 1000);
      if (name === 'lantern_lit') hud.announce(`Đèn lồng ${data.lantern_id.slice(1)} đã sáng`, timestamp);
      if (name === 'player_hit') hud.announce(`Mây mất một ngọn lửa${data.dropped ? ` và rơi ${data.dropped} đom đóm` : ''}`, timestamp);
      if (name === 'shade_spawned') hud.announce('Bóng Mực đã xuất hiện trong sương', timestamp);
      if (name === 'game_over') hud.end(state);
    }
  }

  function frame(timestamp) {
    const elapsed = previousTime === undefined ? 0 : (timestamp - previousTime) / 1000;
    previousTime = timestamp;
    if (state.state === 'playing' && !document.hidden) {
      accumulated += elapsed;
      let steps = 0;
      while (accumulated >= TICK_S && state.state === 'playing' && steps < 15) {
        runStep(timestamp);
        accumulated -= TICK_S;
        steps++;
      }
    }
    view.render(state, orbit, timestamp / 1000, Math.min(elapsed, 0.1));
    hud.draw(state, timestamp);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

try {
  start(createView(document.getElementById('scene')));
} catch (error) {
  const message = document.getElementById('fatal');
  message.textContent = 'Không mở được cảnh 3D. Hãy kiểm tra hỗ trợ WebGL 2 của trình duyệt.';
  message.hidden = false;
  console.error(error);
}
