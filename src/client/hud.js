import { TUNING as T } from '../core/config.ts';
import { nearestUnlitLantern } from '../core/game.js';

const node = id => document.getElementById(id);

function formatTime(seconds) {
  const total = Math.ceil(seconds);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function drawMap(canvas, context, state) {
  const center = canvas.width / 2;
  const scale = (center - 19) / T.island_radius;
  const project = ([x, , z]) => [center + x * scale, center - z * scale];
  const circle = (x, y, radius, color) => {
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
  };
  context.clearRect(0, 0, canvas.width, canvas.height);
  circle(center, center, center - 16, '#88705c');
  circle(center, center, center - 19, '#203b3d');
  for (const lantern of state.lanterns) {
    const [x, y] = project(lantern.pos);
    if (lantern.lit) circle(x, y, T.safe_radius * scale, '#f3ad4457');
    context.save();
    context.translate(x, y);
    context.rotate(Math.PI / 4);
    context.fillStyle = lantern.lit ? '#ffce70' : '#705552';
    context.fillRect(-7, -7, 14, 14);
    context.lineWidth = 2.4;
    context.strokeStyle = lantern.lit ? '#ffe7b7' : '#ce9a76';
    context.strokeRect(-7, -7, 14, 14);
    context.restore();
  }
  for (const shade of state.shades) circle(...project(shade.pos), 4, '#cc90e7');
  context.save();
  context.translate(...project(state.player.pos));
  context.rotate(state.player.facing);
  context.beginPath();
  context.moveTo(0, -11);
  context.lineTo(7, 8);
  context.lineTo(0, 5);
  context.lineTo(-7, 8);
  context.closePath();
  context.fillStyle = '#fff4df';
  context.fill();
  context.restore();
}

export function createHud() {
  const values = ['lit-count', 'carried', 'clock', 'score', 'interact-text'].map(node);
  const [litCount, carried, clock, score, interactText] = values;
  const written = new Map();
  const text = (element, value) => {
    if (written.get(element) === value) return;
    written.set(element, value);
    element.textContent = value;
  };
  const lampTrack = [...node('lamp-track').children];
  const flames = node('flames');
  for (let i = 0; i < T.starting_flames; i++) {
    const icon = document.createElement('i');
    icon.setAttribute('aria-hidden', 'true');
    flames.append(icon);
  }
  const interactHint = node('interact-hint');
  const announcement = node('announcement');
  const map = node('map');
  const context = map.getContext('2d');
  const dialog = node('result');
  dialog.addEventListener('cancel', event => event.preventDefault());
  let messageUntil = 0;
  let mapTick = -1;
  let oldFlames = -1;
  let oldLit = -1;

  return {
    draw(state, timestamp) {
      const lit = state.lanterns.filter(lantern => lantern.lit).length;
      text(litCount, `${lit} / ${state.lanterns.length}`);
      text(carried, state.player.carried);
      text(score, state.score);
      text(clock, formatTime(state.timeLeft));
      if (oldLit !== lit) {
        oldLit = lit;
        lampTrack.forEach((lamp, i) => lamp.classList.toggle('active', i < lit));
      }
      if (oldFlames !== state.player.flames) {
        oldFlames = state.player.flames;
        flames.setAttribute('aria-label', `${oldFlames} ngọn lửa`);
        [...flames.children].forEach((icon, i) => icon.classList.toggle('active', i < oldFlames));
      }
      const nearest = state.state === 'playing' ? nearestUnlitLantern(state) : null;
      interactHint.hidden = !nearest;
      if (nearest) {
        const progress = `${nearest.deposited}/${T.lantern_cost}`;
        text(interactText, state.player.carried ? `Nạp ánh sáng · ${progress}` : `Cần đom đóm · ${progress}`);
      }
      if (timestamp >= messageUntil) text(announcement, '');
      if (state.tick !== mapTick && (state.tick % 3 === 0 || state.state !== 'playing')) {
        mapTick = state.tick;
        drawMap(map, context, state);
      }
    },
    announce(message, timestamp) {
      text(announcement, message);
      messageUntil = timestamp + 2800;
    },
    end(state) {
      const messages = {
        all_lit: ['Đảo Bến đã sáng!', 'Mây đã thắp sáng cả năm đèn lồng trước bình minh.'],
        dawn: ['Bình minh đã đến', 'Vẫn còn đèn lồng chưa được thắp sáng.'],
        no_flames: ['Ngọn lửa đã tắt', 'Bóng Mực đã lấy đi ngọn lửa cuối cùng của Mây.'],
      };
      const [title, copy] = messages[state.reason];
      text(node('result-title'), title);
      text(node('result-copy'), copy);
      text(node('result-score'), `${state.score} điểm`);
      dialog.showModal();
      node('play-again').focus();
    },
    reset() {
      if (dialog.open) dialog.close();
      text(announcement, '');
      messageUntil = 0;
      mapTick = -1;
    },
  };
}
