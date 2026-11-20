import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export function connect(url) {
  const socket = new WebSocket(url);
  let id = 0;
  const requests = new Map();
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('Chrome DevTools connection failed')), { once: true });
  });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const request = requests.get(message.id);
    if (!request) return;
    requests.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(`${request.method}: ${message.error.message}`));
    else request.resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const request of requests.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('Chrome DevTools disconnected'));
    }
    requests.clear();
  });
  return {
    ready,
    close: () => socket.close(),
    async send(method, params = {}, timeout = 10_000) {
      await ready;
      if (socket.readyState !== WebSocket.OPEN) throw new Error('Chrome DevTools disconnected');
      const requestId = ++id;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          requests.delete(requestId);
          reject(new Error(`${method} timed out`));
        }, timeout);
        requests.set(requestId, { resolve, reject, timer, method });
        socket.send(JSON.stringify({ id: requestId, method, params }));
      });
    },
    async evaluate(expression, timeout) {
      const reply = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeout);
      if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.exception?.description ?? 'JavaScript failed in Chromium');
      return reply.result.value;
    },
  };
}

export function chromePath() {
  if (process.env.DAO_DEN_LONG_CHROME) return process.env.DAO_DEN_LONG_CHROME;
  if (process.platform === 'win32') {
    return ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync) ?? 'chrome';
  }
  if (process.platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync) ?? 'chromium';
}

export async function launchChromium(flags, noSandbox = process.env.DAO_DEN_LONG_CHROME_NO_SANDBOX === '1') {
  const profile = await mkdtemp(join(tmpdir(), 'dao-den-long-chrome-'));
  const args = [
    '--headless=new', '--enable-automation', '--enable-gpu', '--enable-unsafe-swiftshader', '--no-first-run',
    '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, ...flags, 'about:blank',
  ];
  if (noSandbox) args.unshift('--no-sandbox');
  const child = spawn(chromePath(), args, { windowsHide: true, stdio: 'ignore' });
  let failure;
  const closed = new Promise(done => child.once('close', done));
  child.once('error', error => { failure = error; });
  const close = async () => {
    child.kill();
    await Promise.race([closed, delay(1500, undefined, { ref: false })]);
    await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 75 }).catch(() => {});
  };
  try {
    for (let i = 0; i < 120; i++) {
      if (failure) throw failure;
      if (child.exitCode !== null) throw new Error(`Chrome exited with code ${child.exitCode}`);
      const result = await readFile(join(profile, 'DevToolsActivePort'), 'utf8').catch(() => '');
      const port = Number(result.split('\n')[0]);
      if (port) return { origin: `http://127.0.0.1:${port}`, close };
      await delay(125);
    }
    throw new Error('Chrome DevTools startup timed out');
  } catch (error) {
    await close();
    throw error;
  }
}
