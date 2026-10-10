const {app, BrowserWindow, Tray, Menu, Notification, ipcMain, session, dialog} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {AlarmPoller, normalizeServer} = require('./alarms.cjs');
const {createNotifications} = require('./notifications.cjs');
const APP_ID = 'vn.legacylink.desktop';
let win, setup, tray, server = '', quitting = false, hiddenHint = false, pending, state = 'Cần đăng nhập';
const setupURL = pathToFileURL(path.join(__dirname, 'setup.html')).href;
const icon = path.join(__dirname, 'assets/icon.png');
let toast;
const preferences = {preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true};
const configPath = () => path.join(app.getPath('userData'), 'server.json');
function trusted(event, local = false) {
  const target = local ? setup : win;
  if (!target || target.isDestroyed() || event.sender !== target.webContents || event.senderFrame !== event.sender.mainFrame) return false;
  try {return local ? event.senderFrame.url === setupURL : new URL(event.senderFrame.url).origin === server;} catch {return false;}
}
function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}
function focus() {if (win && !win.isDestroyed()) {win.show(); win.restore(); win.focus();} else openSetup();}
function testToast() {toast('Legacy Link · THÔNG BÁO THỬ', 'Đây là thông báo thử Windows, không phải cảnh báo ESP32.', focus);}
function setStatus(value, expiredToken) {
  state = value; refreshTray(); send('status', {text: value, expiredToken});
}
const poller = new AlarmPoller({
  fetchPage: async ({from, to, cursor, token, signal}) => {
    const query = new URLSearchParams({from: String(from), to: String(to), limit: '500'});
    if (cursor) query.set('cursor', cursor);
    const r = await fetch(`${server}/api/alarms?${query}`, {headers: {Authorization: `Bearer ${token}`}, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(12000)])});
    if (!r.ok) {
      const error = new Error(`HTTP ${r.status}`); error.status = r.status;
      const retry = r.headers.get('retry-after');
      error.retryAfter = /^\d+$/.test(retry || '') ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now()) || 0;
      throw error;
    }
    if (Number(r.headers.get('content-length')) > 2000000) throw new Error('Payload quá lớn');
    const body = await r.text(); if (body.length > 2000000) throw new Error('Payload quá lớn');
    return JSON.parse(body);
  },
  status: setStatus,
  notify: (alarms, generation) => {
    const notifications = alarms.length > 3 ? [{title: `Legacy Link · ${alarms.length} cảnh báo mới`, body: 'Bấm để xem danh sách cảnh báo.', device: null}] : alarms.map(a => ({title: `Legacy Link · ${a.deviceId}`, body: `${a.severity.toUpperCase()} · ${a.code}${a.value == null ? '' : ` · ${a.value}`}`, device: a.deviceId}));
    for (const n of notifications) toast(n.title, n.body, () => {
      if (generation !== poller.generation || !poller.token) return;
      pending = {device: n.device, eventId: `${Date.now()}-${Math.random()}`}; focus(); send('alarm', pending);
    });
  }
});
function refreshTray() {
  if (!tray) return;
  tray.setToolTip(`Legacy Link · ${state}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    {label: 'Mở dashboard', click: focus}, {label: state, enabled: false}, {type: 'separator'},
    {label: 'Thử thông báo', click: testToast}, {label: 'Đổi máy chủ', click: openSetup},
    {type: 'separator'}, {label: 'Thoát', click: () => app.quit()}
  ]));
}
function secureWindow(w, allowed) {
  w.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  w.webContents.on('will-navigate', (e, url) => {if (!allowed(url)) e.preventDefault();});
  w.webContents.on('will-redirect', (e, url) => {if (!allowed(url)) e.preventDefault();});
}
function openDashboard() {
  if (win && !win.isDestroyed()) win.destroy();
  win = new BrowserWindow({width: 1320, height: 900, minWidth: 900, minHeight: 640, title: 'Legacy Link', icon, webPreferences: preferences});
  win.setMenu(Menu.buildFromTemplate([{label: 'Ứng dụng', submenu: [{label: 'Đổi máy chủ', click: openSetup}, {label: 'Thử thông báo', click: testToast}, {label: 'Thoát', click: () => app.quit()}]}]));
  secureWindow(win, url => {try {return new URL(url).origin === server;} catch {return false;}});
  win.webContents.on('did-start-navigation', (_e, _url, inPlace, isMainFrame) => {
    if (isMainFrame && !inPlace) {poller.stop(); pending = undefined; setStatus('Cần đăng nhập');}
  });
  win.webContents.on('render-process-gone', () => {poller.stop(); setStatus('Cần đăng nhập'); openSetup();});
  win.webContents.on('did-fail-load', (_e, code, _description, _url, isMainFrame) => {if (isMainFrame && code !== -3) {setStatus('Mất kết nối'); openSetup();}});
  win.on('close', e => {
    if (quitting) return;
    e.preventDefault(); win.hide();
    if (!hiddenHint) {hiddenHint = true; toast('Legacy Link đang chạy ở khay', 'Chọn Mở dashboard để quay lại, hoặc Thoát để đóng app.', focus);}
  });
  void win.loadURL(server).catch(() => {});
}
function openSetup() {
  if (setup && !setup.isDestroyed()) {setup.show(); setup.focus(); return;}
  setup = new BrowserWindow({width: 620, height: 640, resizable: false, title: 'Kết nối Legacy Link', icon, webPreferences: preferences});
  setup.removeMenu(); secureWindow(setup, url => url === setupURL);
  setup.on('closed', () => {setup = undefined;});
  void setup.loadURL(setupURL);
}
function registerIPC() {
  ipcMain.handle('get-server', e => {if (!trusted(e, true)) throw new Error('Forbidden'); return server;});
  ipcMain.handle('connect-server', async (e, input) => {
    if (!trusted(e, true)) throw new Error('Forbidden');
    try {
      if (typeof input !== 'string' || input.length > 2048) throw new Error('Địa chỉ không hợp lệ');
      const next = normalizeServer(input);
      for (const endpoint of ['/health', '/api/health/ready']) {
        const r = await fetch(next + endpoint, {redirect: 'error', signal: AbortSignal.timeout(8000)});
        await r.body?.cancel(); if (!r.ok) throw new Error('Máy chủ chưa sẵn sàng');
      }
      if (!trusted(e, true)) return {error: 'Cửa sổ cấu hình đã thay đổi'};
      fs.mkdirSync(app.getPath('userData'), {recursive: true});
      fs.writeFileSync(configPath(), JSON.stringify({server: next}));
      poller.stop(); pending = undefined; server = next; setStatus('Cần đăng nhập');
      openDashboard(); setup.close(); return {ok: true};
    } catch {return {error: 'Không thể kết nối. Kiểm tra URL web, Wi-Fi và máy chủ Linux rồi thử lại.'};}
  });
  ipcMain.handle('session', (e, token) => {
    if (!trusted(e) || typeof token !== 'string' || token.length > 512 || token && !/^[\w.-]{16,512}$/.test(token)) throw new Error('Invalid session');
    if (token !== poller.token) pending = undefined;
    poller.start(token); return {text: state};
  });
  ipcMain.handle('ready', e => {if (!trusted(e)) throw new Error('Forbidden'); send('status', {text: state}); if (pending && poller.token) {send('alarm', pending); pending = undefined;} });
  ipcMain.handle('configure', e => {if (!trusted(e)) throw new Error('Forbidden'); openSetup();});
  ipcMain.handle('test-notification', e => {if (!trusted(e)) throw new Error('Forbidden'); testToast();});
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_event, argv) => {
    const url = argv.find(arg => arg.startsWith('legacylink-notify:'));
    if (url) toast?.activateURL(url); else focus();
  });
  app.on('before-quit', () => {quitting = true; poller.stop();});
  app.on('window-all-closed', () => {});
  app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID);
    if (process.platform === 'win32' && app.isPackaged && !app.setAsDefaultProtocolClient('legacylink-notify')) throw new Error('Notification activation registration failed');
    toast = createNotifications(Notification, {icon, iconURL: pathToFileURL(icon).href, failed: () => setStatus('Windows không gửi được thông báo')});
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    try {server = normalizeServer(JSON.parse(fs.readFileSync(configPath(), 'utf8')).server);} catch {}
    registerIPC(); tray = new Tray(icon); tray.on('double-click', focus); refreshTray();
    if (server) openDashboard(); else openSetup();
  }).catch(() => {dialog.showErrorBox('Legacy Link', 'Không thể khởi động app.'); app.quit();});
}
