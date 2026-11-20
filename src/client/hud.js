import { TUNING as T } from '../core/config.ts';
import { nearestUnlitLantern } from '../core/game.js';

const node = id => document.getElementById(id);

function formatTime(seconds) {
  const total = Math.ceil(seconds);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function drawMap(canvas, context, state) {
  const { islands, bridge, terrace, summit } = state.map;
  const minX = islands[0].x - islands[0].radius;
  const last = islands.at(-1);
  const maxX = last.x + last.radius;
  const scale = Math.min((canvas.width - 20) / (maxX - minX), (canvas.height - 15) / (2 * Math.max(...islands.map(part => part.radius))));
  const project = ([x, , z]) => [(x - (minX + maxX) / 2) * scale + canvas.width / 2, canvas.height / 2 - z * scale];
  const circle = (x, y, radius, color) => {
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
  };
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (const { x, z, radius } of islands) {
    const center = project([x, 0, z]);
    circle(...center, radius * scale, '#c9b48a');
    circle(...center, radius * scale - 2, '#2f5d50');
  }
  if (bridge) {
    const [x, y] = project([bridge.minX, 0, bridge.halfWidth]);
    context.fillStyle = '#9a7750';
    context.fillRect(x, y, (bridge.maxX - bridge.minX) * scale, bridge.halfWidth * 2 * scale);
  }
  if (terrace) {
    const [x, y] = project([0, 0, 0]);
    context.beginPath();
    context.arc(x, y, terrace.outer * scale, Math.PI, 0);
    context.arc(x, y, terrace.inner * scale, 0, Math.PI, true);
    context.fillStyle = '#699481';
    context.fill();
    circle(x, y, summit.radius * scale, '#c9b48a');
  }
  for (const lamp of state.lanterns) {
    const [x, y] = project(lamp.pos);
    if (lamp.lit) circle(x, y, T.safe_radius * scale, '#f2c14e55');
    context.save();
    context.translate(x, y);
    context.rotate(Math.PI / 4);
    context.fillStyle = lamp.lit ? '#ffb347' : '#5b5f6e';
    context.fillRect(-5, -5, 10, 10);
    context.strokeStyle = '#ffe9b0';
    context.lineWidth = 1.6;
    context.strokeRect(-5, -5, 10, 10);
    context.restore();
  }
  for (const shade of state.shades) circle(...project(shade.pos), 3, '#7a3cff');
  if (state.player.falling) return;
  context.save();
  context.translate(...project(state.player.pos));
  context.rotate(state.player.facing);
  context.beginPath();
  context.moveTo(0, -9);
  context.lineTo(6, 7);
  context.lineTo(0, 4);
  context.lineTo(-6, 7);
  context.closePath();
  context.fillStyle = '#f5f1e6';
  context.fill();
  context.restore();
}

export function createHud() {
  const [litCount, carried, clock, score, interactText, dash, pulse, chapter] =
    ['lit-count', 'carried', 'clock', 'score', 'interact-text', 'dash-status', 'pulse-status', 'night-label'].map(node);
  const written = new Map();
  const text = (element, value) => {
    if (written.get(element) === value) return;
    written.set(element, value);
    element.textContent = value;
  };
  function icons(root, length) {
    return Array.from({ length }, () => {
      const icon = document.createElement('i');
      icon.setAttribute('aria-hidden', 'true');
      root.append(icon);
      return icon;
    });
  }
  const flames = node('flames');
  const flameIcons = icons(flames, T.starting_flames);
  const moteIcons = icons(node('mote-track'), T.max_carried);
  const interactHint = node('interact-hint');
  const announcement = node('announcement');
  const map = node('map');
  const timer = node('timer');
  const context = map.getContext('2d');
  const arrow = node('target-arrow');
  const arrowIcon = arrow.firstElementChild;
  let messageUntil = 0;
  let mapTick = -1;
  let oldFlames = -1;
  let oldCarried = -1;

  const status = (element, remaining, availableLabel, ready) => {
    text(element, remaining ? `${(remaining / T.tick_hz).toFixed(1)} s` : availableLabel);
    if (element.dataset.ready !== String(ready)) element.dataset.ready = String(ready);
  };

  return {
    draw(state, timestamp, marker) {
      const { player } = state;
      const lit = state.lanterns.filter(lamp => lamp.lit).length;
      text(chapter, `Đêm ${state.night} · ${state.map.name}`);
      text(litCount, `${lit} / ${state.lanterns.length}`);
      text(carried, `${player.carried} / ${T.max_carried}`);
      text(score, state.score);
      text(clock, formatTime(state.timeLeft));
      timer.classList.toggle('urgent', state.timeLeft <= 30);
      if (oldCarried !== player.carried) {
        oldCarried = player.carried;
        moteIcons.forEach((icon, i) => icon.classList.toggle('active', i < oldCarried));
      }
      if (oldFlames !== player.flames) {
        oldFlames = player.flames;
        flames.setAttribute('aria-label', `${oldFlames} ngọn lửa`);
        flameIcons.forEach((icon, i) => icon.classList.toggle('active', i < oldFlames));
      }
      const dashCd = player.charm ? 0 : player.dashCd;
      status(dash, dashCd, player.charm ? `Bùa ${(player.charm / T.tick_hz).toFixed(1)} s` : 'Sẵn sàng', !dashCd);
      status(pulse, player.pulseCd, player.carried < T.pulse_cost ? 'Cần 3 đom đóm' : 'Sẵn sàng', !player.pulseCd && player.carried >= T.pulse_cost);
      const nearest = state.state === 'playing' && !player.falling ? nearestUnlitLantern(state) : null;
      interactHint.hidden = !nearest;
      if (nearest) text(interactText, `Nạp ánh sáng (${nearest.deposited}/${T.lantern_cost})`);
      if (timestamp >= messageUntil) text(announcement, '');
      arrow.hidden = !marker;
      if (marker) {
        arrow.style.left = `${marker.x}%`;
        arrow.style.top = `${marker.y}%`;
        arrowIcon.style.transform = `rotate(${marker.angle}rad)`;
      }
      if (state.simTick !== mapTick && (state.simTick % 3 === 0 || state.state !== 'playing')) {
        mapTick = state.simTick;
        drawMap(map, context, state);
      }
    },
    announce(message, timestamp) {
      text(announcement, message);
      messageUntil = timestamp + 2800;
    },
    reset() {
      text(announcement, '');
      messageUntil = 0;
      mapTick = -1;
    },
  };
}
