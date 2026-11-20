import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer, preview } from 'vite';

const builtUrl = 'http://127.0.0.1:4278/';
const fixtureUrl = 'http://127.0.0.1:4279/';
const built = await preview({ preview: { host: '127.0.0.1', port: 4278, strictPort: true } });
const fixture = await createServer({
  server: { host: '127.0.0.1', port: 4279, strictPort: true },
  plugins: [{
    name: 'phase2-browser-fixtures',
    transform(code, id) {
      if (!id.endsWith('/src/core/campaign.js')) return;
      return code.replace('createGame(campaign.seed, {}, campaign.night)', `createGame(campaign.seed, {
        random_motes: false, random_shades: false, random_drifters: false,
        time_left_s: location.search === '?dawn-test' ? 1/60 : undefined,
        player: { pos: [[0,0,23.2],[35,0,0],[0,6,6]][campaign.night-1], carried: 10 },
        lanterns: Array.from({length:campaign.night+4}, (_, i) => ({id:'L'+(i+1), lit:i>0, ...(i===0 && campaign.night===2 ? {pos:[35,0,1.5]} : {})}))
      }, campaign.night)`);
    },
  }],
});
await fixture.listen();
mkdirSync('.npm-cache', { recursive: true });
const profile = mkdtempSync(resolve('.npm-cache/phase2-browser-'));
const defaultChrome = {
  win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
}[process.platform] ?? 'google-chrome';
const switches = [
  '--headless=new', '--enable-gpu', '--enable-unsafe-swiftshader',
  '--disable-background-networking', '--no-first-run', '--disable-background-timer-throttling',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
];
if (process.env.DAO_DEN_LONG_CHROME_NO_SANDBOX === '1') switches.unshift('--no-sandbox');
const chrome = spawn(process.env.DAO_DEN_LONG_CHROME ?? defaultChrome, switches, { windowsHide: true, stdio: 'ignore' });
let chromeError;
chrome.on('error', error => { chromeError = error; });
let socket;

try {
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    if (chromeError) throw chromeError;
    try { port = Number(readFileSync(resolve(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); }
    catch { await delay(125); }
  }
  assert.ok(port, 'Chrome remote debugging port unavailable');
  const origin = `http://127.0.0.1:${port}`;
  const version = await (await fetch(`${origin}/json/version`)).json();
  console.log(`${version.Browser} | Node ${process.version} | ${process.platform}`);
  const targets = await (await fetch(`${origin}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((done, reject) => {
    socket.addEventListener('open', done, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const active = new Map();
  const errors = [];
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const pending = active.get(message.id);
    if (pending) {
      active.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.done(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description);
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(arg => arg.description ?? arg.value).join(' '));
  });
  let id = 1;
  const send = (method, params = {}) => new Promise((done, reject) => {
    active.set(id, { done, reject });
    socket.send(JSON.stringify({ id: id++, method, params }));
  });
  const evaluate = async expression => {
    const reply = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.exception?.description);
    return reply.result.value;
  };
  const waitFor = async expression => {
    for (let i = 0; i < 80; i++) {
      if (await evaluate(expression)) return;
      await delay(125);
    }
    throw new Error(`Timeout: ${expression}`);
  };
  const visible = id => `!!document.querySelector('#${id}:not([hidden])')`;
  const label = id => evaluate(`document.getElementById('${id}').textContent`);
  const click = async id => {
    const point = await evaluate(`(() => { const box = document.getElementById('${id}').getBoundingClientRect(); return [box.left + box.width/2, box.top + box.height/2]; })()`);
    const [x, y] = point;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x, y });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x, y });
  };
  const key = (code, type) => send('Input.dispatchKeyEvent', { type, code, key: (code.startsWith('Key') ? code[3].toLowerCase() : code === 'ShiftLeft' ? 'Shift' : code) });
  const press = async code => { await key(code, 'keyDown'); await key(code, 'keyUp'); };
  const screenShot = async name => {
    const result = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`.npm-cache/phase2-${name}.png`, Buffer.from(result.data, 'base64'));
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.playedNotes = 0;
    const original = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...args) { window.playedNotes++; return original.call(this, ...args); };
    if (location.port === '4279') {
      let handle, timestamp = performance.now();
      window.requestAnimationFrame = callback => { handle = callback; return 1; };
      window.advanceFrames = (count = 2, delta = 50) => { for (let i = 0; i < count; i++) handle(timestamp += delta); };
    }
  ` });
  await send('Page.navigate', { url: builtUrl });
  await waitFor("document.querySelector('#scene canvas')?.width === 1280 && document.querySelector('#menu-screen:not([hidden])')");
  assert.deepEqual(await evaluate("[document.querySelector('#scene canvas').width, document.querySelector('#scene canvas').height, Boolean(document.querySelector('#scene canvas').getContext('webgl2'))]"), [1280, 720, true]);
  console.log(await evaluate(`(() => { const gl = document.querySelector('#scene canvas').getContext('webgl2'); const ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })()`));
  await screenShot('menu');
  await click('menu-settings');
  await waitFor(visible('settings-screen'));
  await evaluate("document.querySelector('#volume').value='61'; document.querySelector('#volume').dispatchEvent(new Event('input')); document.querySelector('#sensitivity').value='135'; document.querySelector('#sensitivity').dispatchEvent(new Event('input'))");
  await send('Page.reload');
  await waitFor("document.querySelector('#scene canvas') && document.querySelector('#menu-screen:not([hidden])')");
  assert.deepEqual(await evaluate("[document.querySelector('#volume').value, document.querySelector('#sensitivity').value]"), ['61', '135']);
  await click('start-game');
  await waitFor(visible('intro-screen'));
  assert.equal(await label('intro-title'), 'Đảo Bến');
  await click('enter-night');
  await waitFor(visible('game-ui'));
  await press('ShiftLeft');
  await waitFor("document.querySelector('#dash-status').textContent.includes(' s')");
  await press('KeyP');
  await waitFor(visible('pause-screen'));
  const clock = await label('clock');
  await delay(1100);
  assert.equal(await label('clock'), clock);
  await click('pause-settings');
  await waitFor(visible('settings-screen'));
  await click('settings-back');
  await waitFor(visible('pause-screen'));
  await click('resume');
  await waitFor(visible('game-ui'));
  await press('Escape');
  await waitFor(visible('pause-screen'));
  await click('pause-restart');
  await waitFor(visible('game-ui'));
  await press('ArrowUp');
  await press('Space');
  assert.ok(await evaluate('window.playedNotes') >= 3);
  console.log('PASS Production WebGL 2, menu, intro, pause/resume, restart, audio and persisted settings');

  await delay(1200);
  const fps = await evaluate(`new Promise(done => {
    let start, count = 0;
    function measure(time) {
      start ??= time;
      if (time - start >= 4500) done(count * 1000 / (time - start));
      else { count++; requestAnimationFrame(measure); }
    }
    requestAnimationFrame(measure);
  })`);
  console.log('Production frames at 1280x720, 1x DPR over 4.5 s: ' + fps.toFixed(1) + ' FPS');
  assert.ok(fps >= 30, `production frame rate ${fps.toFixed(1)} FPS is below 30 FPS`);
  await screenShot('night1');
  await press('KeyP');
  await waitFor(visible('pause-screen'));
  await click('pause-menu');
  await waitFor(visible('menu-screen'));

  await send('Page.navigate', { url: fixtureUrl });
  await waitFor("typeof advanceFrames === 'function' && document.querySelector('#scene canvas') && document.querySelector('#menu-screen:not([hidden])')");
  await evaluate('advanceFrames()');
  await click('start-game');
  const step = (count = 2, delta = 50) => evaluate(`advanceFrames(${count},${delta})`);
  for (let night = 1; night <= 3; night++) {
    await waitFor(visible('intro-screen'));
    assert.equal(await label('intro-title'), ['Đảo Bến', 'Đảo Cau', 'Đảo Chuông'][night - 1]);
    await step();
    await click('enter-night');
    await step();
    await waitFor(visible('game-ui'));
    assert.equal(await label('lit-count'), `${night+3} / ${night+4}`);
    assert.equal(await evaluate(visible('interact-hint')), true);
    if (night === 2) assert.ok((await label('dash-status')).startsWith('Bùa'));
    if (night === 3) {
      for (let i = 0; i < 7; i++) await step(16, 250);
      assert.ok((await label('announcement')).includes('Gió mạnh'));
    }
    await screenShot(`fixture-night${night}`);
    await press('KeyE');
    await step();
    if (night < 3) {
      await waitFor(visible('result-screen'));
      assert.ok((await label('result-title')).includes('đã sáng'));
      assert.equal(await label('result-action'), 'Đêm kế tiếp');
      await click('result-action');
    }
  }
  await waitFor(visible('dawn-screen'));
  assert.match(await label('dawn-score'), /\d+ điểm tổng cộng/);
  await click('dawn-menu');
  await waitFor(visible('menu-screen'));
  await send('Page.navigate', { url: `${fixtureUrl}?dawn-test` });
  await waitFor("location.search === '?dawn-test' && typeof advanceFrames === 'function' && document.querySelector('#scene canvas')");
  await step();
  await click('start-game');
  await click('enter-night');
  await step();
  await waitFor(visible('result-screen'));
  assert.equal(await label('result-title'), 'Bình minh đã đến');
  assert.equal(await label('result-action'), 'Chơi lại đêm');
  await click('result-action');
  await step(1, 0);
  await waitFor(visible('game-ui'));
  assert.equal(await label('night-label'), 'Đêm 1 · Đảo Bến');
  assert.deepEqual(errors, []);
  console.log('PASS Scenario UI chain through the three islands, lantern hints, wind warning, Bùa Gió, the Bình Minh screen and retry after defeat');
  console.log('PASS No JavaScript or WebGL errors');
} finally {
  socket?.close();
  chrome.kill();
  await fixture.close();
  await new Promise(done => built.httpServer.close(done));
}
