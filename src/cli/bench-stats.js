export function frameStats(times) {
  if (!times.length || times.some(time => !Number.isFinite(time) || time <= 0)) throw new Error('No valid frame intervals were recorded');
  const sorted = [...times].sort((a, b) => a - b);
  const n = sorted.length;
  const k = Math.max(1, Math.ceil(0.01 * n));
  const sum = times.reduce((total, value) => total + value, 0);
  const slowest = sorted.slice(-k).reduce((total, value) => total + value, 0);
  return { frames: n, avg_fps: 1000 * n / sum, p1_low_fps: 1000 * k / slowest, frame_ms_p95: sorted[Math.ceil(0.95 * n) - 1] };
}

export function benchmarkReport(times, { loadMs, peakRss, vsyncOff, renderer, os }) {
  return {
    contract_version: '1.3', ...frameStats(times), load_ms: loadMs, peak_mem_mb: peakRss,
    vsync_off: vsyncOff, renderer, os,
  };
}
