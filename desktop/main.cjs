const {app, BrowserWindow, Tray, Menu, Notification, ipcMain, session, dialog, nativeImage} = require('electron');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {AlarmPoller} = require('./alarms.cjs');
const {createNotifications} = require('./notifications.cjs');
const APP_ID = 'vn.legacylink.desktop';
const server = 'https://vineyard-fifteen-elusive.ngrok-free.dev';
let win, tray, quitting = false, hiddenHint = false, pending, state = 'Cần đăng nhập';
const errorURL = pathToFileURL(path.join(__dirname, 'connection-error.html')).href;
const icon = path.join(__dirname, 'assets/icon.png');
let toast;
const preferences = {preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true};
function trusted(event, local = false) {
  const target = win;
  if (!target || target.isDestroyed() || event.sender !== target.webContents || event.senderFrame !== event.sender.mainFrame) return false;
  try {return local ? event.senderFrame.url === errorURL : new URL(event.senderFrame.url).origin === server;} catch {return false;}
}
function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}
function focus() {if (win && !win.isDestroyed()) {win.show(); win.restore(); win.focus();} else openDashboard();}
function testToast() {toast('Legacy Link · THÔNG BÁO THỬ', 'Đây là thông báo thử desktop, không phải cảnh báo ESP32.', focus);}
function applicationMenu() {
  const actions = [{label: 'Thử kết nối lại', click: openDashboard}, {label: 'Thử thông báo', click: testToast}];
  return Menu.buildFromTemplate(process.platform === 'darwin' ? [
    {label: app.name, submenu: [{role: 'about'}, {type: 'separator'}, ...actions, {type: 'separator'}, {role: 'hide'}, {role: 'hideOthers'}, {role: 'unhide'}, {type: 'separator'}, {role: 'quit'}]},
    {role: 'editMenu'}, {role: 'windowMenu'}
  ] : [{label: 'Ứng dụng', submenu: [...actions, {label: 'Thoát', click: () => app.quit()}]}]);
}
function setStatus(value, expiredToken) {
  state = value; refreshTray(); send('status', {text: value, expiredToken});
}
const poller = new AlarmPoller({
  fetchPage: async ({from, to, cursor, token, signal}) => {
    const query = new URLSearchParams({from: String(from), to: String(to), limit: '500'});
    if (cursor) query.set('cursor', cursor);
    const r = await fetch(`${server}/api/alarms?${query}`, {headers: {Authorization: `Bearer ${token}`, 'ngrok-skip-browser-warning': '1'}, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(12000)])});
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
    {label: 'Thử thông báo', click: testToast}, {label: 'Thử kết nối lại', click: openDashboard},
    {type: 'separator'}, {label: 'Thoát', click: () => app.quit()}
  ]));
}
function secureWindow(w, allowed) {
  w.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  w.webContents.on('will-navigate', (e, url) => {if (!allowed(url)) e.preventDefault();});
  w.webContents.on('will-redirect', (e, url) => {if (!allowed(url)) e.preventDefault();});
}
function openDashboard() {
  poller.stop(); pending = undefined; setStatus('Cần đăng nhập');
  if (win && !win.isDestroyed()) win.destroy();
  win = new BrowserWindow({width: 1320, height: 900, minWidth: 900, minHeight: 640, title: 'Legacy Link', icon, webPreferences: preferences});
  if (process.platform !== 'darwin') win.setMenu(applicationMenu());
  secureWindow(win, url => {try {return url === errorURL || new URL(url).origin === server;} catch {return false;}});
  win.webContents.on('did-start-navigation', (_e, _url, inPlace, isMainFrame) => {
    if (isMainFrame && !inPlace) {poller.stop(); pending = undefined; setStatus(_url === errorURL ? 'Mất kết nối' : 'Cần đăng nhập');}
  });
  win.webContents.on('render-process-gone', () => {poller.stop(); setStatus('Cần đăng nhập'); openDashboard();});
  win.webContents.on('did-fail-load', (_e, code, _description, _url, isMainFrame) => {if (isMainFrame && code !== -3) {showConnectionError();}});
  win.webContents.on('did-navigate', (_e, _url, httpResponseCode) => {if (httpResponseCode >= 400) showConnectionError();});
  win.on('close', e => {
    if (quitting) return;
    e.preventDefault(); win.hide();
    if (!hiddenHint) {hiddenHint = true; toast('Legacy Link đang chạy ở khay', 'Chọn Mở dashboard để quay lại, hoặc Thoát để đóng app.', focus);}
  });
  void win.loadURL(server).catch(() => {});
}
function showConnectionError() {
  poller.stop(); pending = undefined; setStatus('Mất kết nối');
  if (win && !win.isDestroyed()) void win.loadURL(errorURL).catch(() => {});
}
function registerIPC() {
  ipcMain.handle('retry-connection', e => {
    if (!trusted(e, true)) throw new Error('Forbidden');
    openDashboard();
  });
  ipcMain.handle('session', (e, token) => {
    if (!trusted(e) || typeof token !== 'string' || token.length > 512 || token && !/^[\w.-]{16,512}$/.test(token)) throw new Error('Invalid session');
    if (token !== poller.token) pending = undefined;
    poller.start(token); return {text: state};
  });
  ipcMain.handle('ready', e => {if (!trusted(e)) throw new Error('Forbidden'); send('status', {text: state}); if (pending && poller.token) {send('alarm', pending); pending = undefined;} });
  ipcMain.handle('test-notification', e => {if (!trusted(e)) throw new Error('Forbidden'); testToast();});
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_event, argv) => {
    const url = argv.find(arg => arg.startsWith('legacylink-notify:'));
    if (url) toast?.activateURL(url); else focus();
  });
  app.on('before-quit', () => {quitting = true; poller.stop();});
  app.on('activate', focus);
  app.on('window-all-closed', () => {});
  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId(APP_ID);
    if (process.platform === 'darwin') Menu.setApplicationMenu(applicationMenu());
    if (process.platform === 'win32' && app.isPackaged && !app.setAsDefaultProtocolClient('legacylink-notify')) throw new Error('Notification activation registration failed');
    toast = createNotifications(Notification, {icon, iconURL: pathToFileURL(icon).href, failed: () => setStatus('Không gửi được thông báo desktop')});
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onBeforeSendHeaders({urls: [`${server}/*`]}, (details, callback) => {
      callback({requestHeaders: {...details.requestHeaders, 'ngrok-skip-browser-warning': '1'}});
    });
    registerIPC();
    const trayIcon = process.platform === 'darwin' ? nativeImage.createFromPath(icon).resize({width: 18, height: 18}) : icon;
    tray = new Tray(trayIcon); tray.on('double-click', focus); refreshTray();
    openDashboard();
  }).catch(() => {dialog.showErrorBox('Legacy Link', 'Không thể khởi động app.'); app.quit();});
}
