const {contextBridge, ipcRenderer} = require('electron');
const listen = (channel, callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld('legacyDesktop', {
  syncSession: token => ipcRenderer.invoke('session', token),
  ready: () => ipcRenderer.invoke('ready'),
  onStatus: callback => listen('status', callback),
  onAlarm: callback => listen('alarm', callback),
  configure: () => ipcRenderer.invoke('configure'),
  testNotification: () => ipcRenderer.invoke('test-notification')
});
contextBridge.exposeInMainWorld('legacySetup', {
  getServer: () => ipcRenderer.invoke('get-server'),
  connect: url => ipcRenderer.invoke('connect-server', url)
});
