const {randomUUID} = require('node:crypto');
const escapeXML = value => String(value).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
function toastXML(id, title, body, iconURL) {
  return `<toast activationType="protocol" launch="legacylink-notify://notification/${escapeXML(id)}"><visual><binding template="ToastGeneric"><text>${escapeXML(title)}</text><text>${escapeXML(body)}</text><image placement="appLogoOverride" src="${escapeXML(iconURL)}"/></binding></visual></toast>`;
}
function createNotifications(Notification, {platform = process.platform, icon, iconURL, failed}) {
  const active = new Map();
  function activate(id) {
    const entry = active.get(id);
    if (!entry) return;
    active.delete(id); entry.click();
  }
  if (platform === 'win32') Notification.handleActivation(details => {
    if (details.type === 'click') activate(new URLSearchParams(details.arguments).get('tag'));
  });
  const toast = (title, body, click) => {
    if (!Notification.isSupported()) {failed(); return;}
    const id = randomUUID();
    const n = new Notification({id, title, body, icon, ...(platform === 'win32' ? {toastXml: toastXML(id, title, body, iconURL)} : {})});
    // Windows may discard native instance callbacks after moving a toast to Action Center.
    active.set(id, {n, click});
    if (active.size > 100) {
      const oldest = active.keys().next().value;
      active.get(oldest).n.close(); active.delete(oldest);
    }
    n.once('click', () => activate(id));
    n.once('failed', () => {active.delete(id); failed();});
    n.show();
  };
  toast.activateURL = url => {
    const match = /^legacylink-notify:\/\/notification\/([a-f0-9-]{36})$/.exec(url);
    if (match) activate(match[1]);
  };
  return toast;
}
module.exports = {createNotifications, toastXML};
