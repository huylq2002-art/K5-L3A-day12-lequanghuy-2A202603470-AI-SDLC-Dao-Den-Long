export function gameAudio(initialLevel) {
  let context;
  let master;
  let ambience;
  let level = initialLevel;

  function unlock() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    if (!context) {
      try {
        context = new Audio();
        master = context.createGain();
        master.gain.value = level * 0.24;
        master.connect(context.destination);
        ambience = context.createGain();
        ambience.connect(master);
      } catch {
        return;
      }
    }
    if (context.state === 'suspended') context.resume().catch(() => {});
  }

  function tone(frequency, delay = 0, length = 0.21, shape = 'sine', target = frequency, background = false) {
    if (!master || !level || context.state !== 'running') return;
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = shape;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(target, start + length);
    volume.gain.setValueAtTime(0.001, start);
    volume.gain.exponentialRampToValueAtTime(background ? 0.075 : 0.38, start + (background ? 0.26 : 0.016));
    volume.gain.exponentialRampToValueAtTime(0.001, start + length);
    oscillator.connect(volume).connect(background ? ambience : master);
    oscillator.start(start);
    oscillator.stop(start + length + 0.015);
  }

  return {
    unlock,
    setLevel(value) {
      level = value;
      if (master) master.gain.setTargetAtTime(level * 0.24, context.currentTime, 0.02);
    },
    quiet(quiet) {
      if (ambience) ambience.gain.setTargetAtTime(quiet ? 0 : 1, context.currentTime, 0.08);
    },
    music(night, part) {
      const roots = [[130.81, 110, 98, 146.83], [146.83, 123.47, 110, 130.81], [110, 87.31, 98, 130.81]][night - 1];
      const root = roots[part % roots.length];
      for (const [ratio, delay, length] of [[1, 0, 4.2], [1.5, 0.14, 3.9], [2.3784, 0.49, 2.0], [3, 1.65, 2.2]]) {
        tone(root * ratio, delay, length, 'sine', root * ratio, true);
      }
    },
    play(name, data) {
      switch (name) {
        case 'mote_picked': tone(660 + data.carried % 5 * 66, 0, 0.14); break;
        case 'deposit': tone(392, 0, 0.22, 'triangle'); break;
        case 'refuel': tone(470, 0, 0.24, 'sine', 545); break;
        case 'lantern_out': tone(210, 0, 0.35, 'triangle', 125); break;
        case 'lantern_lit': [523, 659, 784].forEach((note, i) => tone(note, i * 0.095, 0.45)); break;
        case 'pulse': tone(128, 0, 0.45, 'triangle', 55); break;
        case 'jump': tone(275, 0, 0.19, 'sine', 440); break;
        case 'dash': tone(290, 0, 0.23, 'triangle', 95); break;
        case 'charm_picked': [660, 880].forEach((note, i) => tone(note, i * 0.08, 0.32)); break;
        case 'drifter_steal': tone(315, 0, 0.28, 'triangle', 170); break;
        case 'drifter_drop': tone(880, 0, 0.22); break;
        case 'wind': tone(180, 0, 0.68, 'triangle', 92); break;
        case 'countdown': tone(data.seconds <= 3 ? 660 : 440, 0, 0.125); break;
        case 'player_hit': tone(160, 0, 0.29, 'triangle', 73); break;
        case 'shade_spawned': tone(71, 0, 0.64, 'sine', 51); break;
        case 'game_over': {
          const notes = data.result === 'won' ? [392, 523, 659, 1046] : [330, 277, 220];
          notes.forEach((note, i) => tone(note, 0.3 + i * 0.13, 0.7));
          break;
        }
      }
    },
  };
}
