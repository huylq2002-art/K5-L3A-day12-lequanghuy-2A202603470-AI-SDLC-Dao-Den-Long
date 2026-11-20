export function gameAudio() {
  let context;
  let master;
  let enabled = true;

  function unlock() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    if (!context) {
      try {
        context = new Audio();
        master = context.createGain();
        master.gain.value = enabled ? 0.18 : 0;
        master.connect(context.destination);
      } catch {
        return;
      }
    }
    if (context.state === 'suspended') context.resume().catch(() => {});
  }

  function tone(frequency, delay = 0, length = 0.21, shape = 'sine', target = frequency) {
    if (!master || !enabled || context.state !== 'running') return;
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = shape;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(target, start + length);
    volume.gain.setValueAtTime(0.001, start);
    volume.gain.exponentialRampToValueAtTime(0.38, start + 0.016);
    volume.gain.exponentialRampToValueAtTime(0.001, start + length);
    oscillator.connect(volume).connect(master);
    oscillator.start(start);
    oscillator.stop(start + length + 0.015);
  }

  return {
    unlock,
    toggle() {
      enabled = !enabled;
      unlock();
      if (master) master.gain.setTargetAtTime(enabled ? 0.18 : 0, context.currentTime, 0.02);
      return enabled;
    },
    play(name, data) {
      switch (name) {
        case 'mote_picked': tone(660 + data.carried % 5 * 66, 0, 0.14); break;
        case 'deposit': tone(392, 0, 0.22, 'triangle'); break;
        case 'lantern_lit': [523, 659, 784].forEach((note, i) => tone(note, i * 0.095, 0.45)); break;
        case 'pulse': tone(128, 0, 0.45, 'triangle', 55); break;
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
