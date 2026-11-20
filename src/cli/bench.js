import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { release, type } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { dist, serve } from '../server/http.js';
import { benchmarkReport } from './bench-stats.js';
import { connect, launchChromium } from './chromium.js';
import { integer, readOptions } from './options.js';

const exec = promisify(execFile);
const unlock = ['--disable-frame-rate-limit', '--disable-gpu-vsync'];

async function sampleMemory(browser) {
  const { processInfo } = await browser.send('SystemInfo.getProcessInfo');
  const ids = [...new Set(processInfo.map(info => info.id).filter(id => Number.isSafeInteger(id) && id > 0))].join(',');
  if (!ids) return null;
  if (process.platform === 'win32') {
    const query = `(Get-Process -Id ${ids} -ErrorAction SilentlyContinue | Measure-Object -Property WorkingSet64 -Sum).Sum`;
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', query], { windowsHide: true, timeout: 2500 });
    const bytes = Number(stdout.trim());
    return bytes > 0 ? bytes / 2 ** 20 : null;
  }
  const { stdout } = await exec('ps', ['-o', 'rss=', '-p', ids], { timeout: 2500 });
  const kib = stdout.trim().split(/\s+/).reduce((sum, value) => sum + Number(value), 0);
  return kib > 0 ? kib / 1024 : null;
}

function monitorMemory(browser) {
  let pending;
  let peak = null;
  const sample = () => {
    if (pending) return;
    pending = sampleMemory(browser).then(rss => { if (rss !== null) peak = Math.max(peak ?? 0, rss); }, () => {}).finally(() => { pending = null; });
  };
  sample();
  const timer = setInterval(sample, 1000);
  return async () => {
    clearInterval(timer);
    await pending;
    return peak;
  };
}

async function measure(web, seed, duration, noSandbox) {
  let chrome;
  let browser;
  let page;
  let stopMonitor;
  let measuring = false;
  try {
    chrome = await launchChromium(['--window-size=1280,720', ...unlock], noSandbox);
    const [version, targets] = await Promise.all(['version', 'list'].map(async key => (await fetch(`${chrome.origin}/json/${key}`, { signal: AbortSignal.timeout(5000) })).json()));
    browser = connect(version.webSocketDebuggerUrl);
    page = connect(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    const { arguments: command } = await browser.send('Browser.getBrowserCommandLine').catch(() => ({ arguments: [] }));
    const vsync = unlock.every(flag => command.includes(flag));
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await page.send('Page.navigate', { url: `${web.url}bench.html?${new URLSearchParams({ seed, duration })}` });
    let ready = false;
    for (let i = 0; i < 100 && !ready; i++) {
      const status = await page.evaluate("[Boolean(window.benchStarted), window.benchError ?? null]");
      if (status[1]) throw new Error(status[1]);
      ready = status[0];
      if (!ready) await delay(100);
    }
    if (!ready) throw new Error('Benchmark page did not initialize');
    await page.evaluate('window.benchStarted', 30_000);
    measuring = true;
    stopMonitor = monitorMemory(browser);
    const measured = await page.evaluate('window.benchResult', 30_000 + duration * 1000);
    const peak = await stopMonitor();
    stopMonitor = null;
    if (measured.width !== 1280 || measured.height !== 720) throw new Error('Unexpected benchmark resolution');
    return benchmarkReport(measured.frames, {
      loadMs: Math.max(0, measured.firstFrameEpoch - performance.timeOrigin), peakRss: peak,
      vsyncOff: vsync, renderer: `${measured.renderer} · ${version.Browser}`, os: `${type()} ${release()}`,
    });
  } catch (error) {
    error.browserStartup = !measuring && /Chrome DevTools|Chrome exited/.test(error.message);
    throw error;
  } finally {
    await stopMonitor?.();
    page?.close();
    browser?.close();
    await chrome?.close();
  }
}

async function run(args) {
  const flags = readOptions(args, ['--seed', '--duration', '--out']);
  const seed = integer(flags.get('--seed'), '--seed');
  const duration = Number(flags.get('--duration'));
  if (!Number.isFinite(duration) || duration <= 0 || duration * 1000 + 30_000 >= 2 ** 31) throw new Error('--duration must be a positive number of seconds');
  if (!existsSync(join(dist, 'bench.html'))) await (await import('vite')).build();
  const web = await serve();
  try {
    let summary;
    try { summary = await measure(web, seed, duration); } catch (error) {
      if (!error.browserStartup || process.platform !== 'win32' || process.env.DAO_DEN_LONG_CHROME_NO_SANDBOX) throw error;
      console.error('Chromium startup failed in its Windows sandbox. Retrying the loopback benchmark in a disposable profile.');
      summary = await measure(web, seed, duration, true);
    }
    await writeFile(flags.get('--out'), `${JSON.stringify(summary, null, 2)}\n`);
    if (summary.peak_mem_mb === null) console.error('Chromium RSS could not be sampled through the host process interface.');
  } finally {
    await web.close();
  }
}

try { await run(process.argv.slice(2)); }
catch (error) { console.error(error.message); process.exitCode = 2; }
