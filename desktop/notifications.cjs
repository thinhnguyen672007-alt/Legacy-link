const {randomUUID} = require('node:crypto');
const escapeXML = value => String(value).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
function toastXML(id, title, body, iconURL) {
  return `<toast activationType="protocol" launch="legacylink-notify://notification/${escapeXML(id)}"><visual><binding template="ToastGeneric"><text>${escapeXML(title)}</text><text>${escapeXML(body)}</text><image placement="appLogoOverride" src="${escapeXML(iconURL)}"/></binding></visual></toast>`;
}
function createNotifications(Notification, {platform = process.platform, icon, iconURL, failed, timeout = 10000}) {
  const active = new Map();
  function activate(id) {
    const entry = active.get(id);
    if (!entry) return;
    active.delete(id); entry.click();
  }
  if (platform === 'win32') Notification.handleActivation(details => {
    if (details.type === 'click') activate(new URLSearchParams(details.arguments).get('tag'));
  });
  const toast = (title, body, click) => new Promise(resolve => {
    let settled = false, timer, n;
    const finish = (ok, reason) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (!ok) {active.delete(id); failed(reason);}
      resolve(ok);
    };
    const id = randomUUID();
    try {
      if (!Notification.isSupported()) {finish(false, 'Desktop notifications are not supported'); return;}
      n = new Notification({id, title, body, icon, ...(platform === 'win32' ? {toastXml: toastXML(id, title, body, iconURL)} : {})});
      // Windows may discard native instance callbacks after moving a toast to Action Center.
      active.set(id, {n, click});
      if (active.size > 100) {
        const oldest = active.keys().next().value;
        active.get(oldest).n.close(); active.delete(oldest);
      }
      n.once('click', () => activate(id));
      n.once('show', () => finish(true));
      n.once('failed', (_event, error) => finish(false, error || 'The operating system rejected the notification'));
      timer = setTimeout(() => {
        finish(false, 'No notification delivery confirmation; check notification permissions and Focus mode');
        try {n.close();} catch {}
      }, timeout);
      n.show();
    } catch (error) {finish(false, error.message);}
  });
  toast.activateURL = url => {
    const match = /^legacylink-notify:\/\/notification\/([a-f0-9-]{36})$/.exec(url);
    if (match) activate(match[1]);
  };
  return toast;
}
module.exports = {createNotifications, toastXML};
