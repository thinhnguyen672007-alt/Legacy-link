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
  testNotification: () => ipcRenderer.invoke('test-notification')
});
contextBridge.exposeInMainWorld('legacyConnection', {
  retry: () => ipcRenderer.invoke('retry-connection')
});
