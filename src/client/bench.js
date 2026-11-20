import { REVISION } from 'three';
import { benchmarkCamera, createBenchmark, stepBenchmark } from '../core/benchmark.js';
import { TUNING as T } from '../core/config.ts';
import { createView } from './render.js';

const query = new URLSearchParams(location.search);
const duration = Number(query.get('duration') ?? 30) * 1000;
const seed = Number(query.get('seed') ?? 42);

try {
  const state = createBenchmark(seed);
  const view = createView(document.getElementById('scene'));
  const gl = view.canvas.getContext('webgl2');
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const engine = gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER);
  const frames = [];
  const orbit = { position: null, yaw: 0 };
  let origin;
  let firstFrameEpoch;
  let startMeasure;
  let previous;
  let ready;
  let finish;
  window.benchStarted = new Promise(resolve => { ready = resolve; });
  window.benchResult = new Promise(resolve => { finish = resolve; });

  function frame() {
    const now = performance.now();
    origin ??= now;
    if (now >= startMeasure + duration) {
      finish({ frames, firstFrameEpoch, renderer: `Three.js r${REVISION} WebGL 2 (${engine})`, width: view.canvas.width, height: view.canvas.height });
      return;
    }
    const seconds = (now - origin) / 1000;
    const ticks = Math.floor(seconds * T.tick_hz);
    while (state.simTick < ticks) stepBenchmark(state);
    orbit.position = benchmarkCamera(seconds);
    view.render(state, orbit, seconds);
    const completed = performance.now();
    if (firstFrameEpoch === undefined) {
      firstFrameEpoch = performance.timeOrigin + completed;
      startMeasure = completed + 3000;
    }
    if (completed >= startMeasure && completed < startMeasure + duration) {
      if (previous >= startMeasure && previous < completed) frames.push(completed - previous);
      ready();
    }
    previous = completed;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
} catch (error) {
  window.benchError = error.message;
  console.error(error);
}
