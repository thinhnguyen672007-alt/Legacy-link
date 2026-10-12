const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SERVER = 'https://vineyard-fifteen-elusive.ngrok-free.dev';
async function launch(platform, earlyEvent, notificationFailure = false) {
  const windows = [], handlers = {}, menus = [], requests = [];
  let poller, headerHook, headerFilter, tray;
  const errors = [];
  let ready = false, resolveReady;
  const readyPromise = new Promise(resolve => {resolveReady = resolve;});
  const app = Object.assign(new EventEmitter(), {
    name: 'Legacy Link', isPackaged: true,
    requestSingleInstanceLock: () => true, whenReady: () => readyPromise,
    getPath: () => {throw new Error('Must not read old server.json');},
    setAppUserModelId() {}, setAsDefaultProtocolClient: () => true,
    quit: () => assert.fail('Unexpected quit'),
  });
  class Window extends EventEmitter {
    constructor() {
      super(); assert.ok(ready, 'Window created before app ready');
      this.webContents = Object.assign(new EventEmitter(), {
        mainFrame: {url: ''}, send() {}, setWindowOpenHandler() {},
      }); this.loads = []; windows.push(this);
    }
    isDestroyed() {return Boolean(this.destroyed);}
    destroy() {this.destroyed = true;}
    loadURL(url) {this.loads.push(url); this.webContents.emit('did-start-navigation', {}, url, false, true); this.webContents.mainFrame.url = url; return Promise.resolve();}
    setMenu() {} show() {} restore() {} focus() {} hide() {this.hidden = true;}
  }
  class Poller {
    constructor(options) {this.options = options; poller = this; this.generation = 1;}
    stop() {this.token = '';}
    start(token) {this.token = token;}
  }
  class Tray extends EventEmitter {constructor() {super(); tray = this;} setToolTip(text) {this.tooltip = text;} setContextMenu() {}}
  const electron = {
    app, BrowserWindow: Window, Tray,
    Menu: {buildFromTemplate: value => {menus.push(value); return value;}, setApplicationMenu() {}},
    ipcMain: {handle: (name, callback) => {handlers[name] = callback;}},
    session: {defaultSession: {
      setPermissionRequestHandler() {}, setPermissionCheckHandler() {},
      webRequest: {onBeforeSendHeaders: (filter, hook) => {headerFilter = filter; headerHook = hook;}},
    }},
    nativeImage: {createFromPath: () => ({resize: () => ({})})},
    dialog: {showErrorBox: (title, message) => errors.push({title, message})},
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../main.cjs'), 'utf8'), {
    __dirname: path.join(__dirname, '..'), process: {platform}, URL, URLSearchParams, AbortSignal, console: {error() {}},
    fetch: async (url, options) => {requests.push({url, options}); return new Response(JSON.stringify({items: [], nextCursor: null}));},
    require: name => name === 'electron' ? electron : name === './alarms.cjs' ? {AlarmPoller: Poller} : name === './notifications.cjs' ? {createNotifications: (_Notification, options) => async () => {if (notificationFailure) options.failed('Permission denied'); return !notificationFailure;}} : require(name),
  });
  if (earlyEvent) {
    app.emit(earlyEvent, {}, []);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(windows.length, 0);
  }
  ready = true; resolveReady();
  await new Promise(resolve => setImmediate(resolve));
  const event = (win = windows.at(-1)) => ({sender: win.webContents, senderFrame: win.webContents.mainFrame});
  return {windows, handlers, menus, requests, errors, poller, headerHook, headerFilter, event, tooltip: () => tray.tooltip};
}
for (const platform of ['win32', 'darwin']) {
  for (const event of ['activate', 'second-instance']) {
    test(`${platform}: ${event} waits for startup readiness`, async () => {
      const h = await launch(platform, event);
      assert.equal(h.windows.length, 1);
      assert.deepEqual(h.windows[0].loads, [SERVER]);
    });
  }
  test(`${platform}: opens fixed server without setup or saved URL`, async () => {
    const h = await launch(platform);
    assert.equal(h.windows.length, 1);
    assert.deepEqual(h.windows[0].loads, [SERVER]);
    assert.ok(!JSON.stringify(h.menus).includes('Đổi máy chủ'));
    assert.equal(h.handlers.configure, undefined);
    assert.equal(h.handlers['connect-server'], undefined);
    assert.equal(JSON.stringify(h.headerFilter), JSON.stringify({urls: [`${SERVER}/*`]}));
    h.headerHook({requestHeaders: {Authorization: 'Bearer fixture'}}, result => {
      assert.equal(result.requestHeaders['ngrok-skip-browser-warning'], '1');
      assert.equal(result.requestHeaders.Authorization, 'Bearer fixture');
    });
  });
  test(`${platform}: network/HTTP errors show local retry; retries fixed server`, async () => {
    const h = await launch(platform);
    for (const failure of ['network', 'HTTP']) {
      const win = h.windows.at(-1);
      h.poller.start('fixture-token-123456');
      if (failure === 'network') win.webContents.emit('did-fail-load', {}, -105, 'offline', SERVER, true);
      else win.webContents.emit('did-navigate', {}, SERVER, 404, 'Not found');
      assert.ok(win.loads.at(-1).endsWith('/connection-error.html'));
      assert.equal(h.poller.token, '');
      assert.ok(h.tooltip().includes('Mất kết nối'));
      h.handlers['retry-connection'](h.event());
      assert.equal(h.windows.at(-1).loads[0], SERVER);
      assert.throws(() => h.handlers['retry-connection'](h.event()), /Forbidden/);
    }
    let prevented = false;
    h.windows.at(-1).emit('close', {preventDefault() {prevented = true;}});
    assert.ok(prevented && h.windows.at(-1).hidden);
  });
  test(`${platform}: rejects external navigation/IPC and polls only fixed API`, async () => {
    const h = await launch(platform), win = h.windows[0];
    for (const name of ['will-navigate', 'will-redirect']) {
      let blocked = false;
      win.webContents.emit(name, {preventDefault() {blocked = true;}}, 'https://other.example/');
      assert.ok(blocked);
    }
    assert.throws(() => h.handlers.session({...h.event(), senderFrame: {url: SERVER}}, 'fixture-token-123456'), /Invalid session/);
    h.handlers.session(h.event(), 'fixture-token-123456');
    await h.poller.options.fetchPage({from: 1, to: 2, token: h.poller.token, signal: new AbortController().signal});
    assert.ok(h.requests[0].url.startsWith(`${SERVER}/api/alarms?`));
    assert.equal(h.requests[0].options.headers.Authorization, 'Bearer fixture-token-123456');
    assert.equal(h.requests[0].options.redirect, 'error');
  });
}

test('notification failure stays visible across healthy polls and test shows details', async () => {
  const h = await launch('darwin', undefined, true);
  h.handlers['test-notification'](h.event());
  await new Promise(resolve => setImmediate(resolve));
  assert.match(h.errors[0].message, /Permission denied/);
  h.poller.options.status('Đang theo dõi');
  assert.match(h.tooltip(), /Không gửi được thông báo/);
  assert.match(h.handlers.session(h.event(), 'fixture-token-123456').text, /Không gửi được thông báo/);
});
