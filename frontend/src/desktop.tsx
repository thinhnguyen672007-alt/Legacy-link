import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useSession} from './session';
type DesktopStatus = {text: string; expiredToken?: string};
type AlarmTarget = {device: string | null; eventId: string};
declare global {
  interface Window {
    legacyDesktop?: {
      syncSession(token: string): Promise<{text: string}>;
      ready(): Promise<void>;
      onStatus(callback: (value: DesktopStatus) => void): () => void;
      onAlarm(callback: (value: AlarmTarget) => void): () => void;
      configure(): Promise<void>;
      testNotification(): Promise<void>;
    };
  }
}
export function DesktopControls() {
  const {session, expire} = useSession();
  const navigate = useNavigate();
  const [status, setStatus] = useState('Cần đăng nhập');
  const desktop = window.legacyDesktop;
  const token = session?.user && !session.user.mustChangePassword ? session.readToken : '';
  useEffect(() => {
    if (!desktop) return;
    let alive = true;
    const removeStatus = desktop.onStatus(value => {
      setStatus(value.text);
      if (value.expiredToken && value.expiredToken === token) expire(value.expiredToken);
    });
    let lastEvent = '';
    const removeAlarm = desktop.onAlarm(value => {
      if (!token || lastEvent === value.eventId) return;
      lastEvent = value.eventId;
      const params = new URLSearchParams({desktopEvent: value.eventId});
      if (value.device) params.set('device', value.device);
      navigate(`/alarms?${params}`);
    });
    void desktop.syncSession(token).then(value => {if (alive) setStatus(value.text); return desktop.ready();}).catch(() => {if (alive) setStatus('Không thể theo dõi cảnh báo');});
    return () => {alive = false; removeStatus(); removeAlarm();};
  }, [desktop, token, expire, navigate]);
  if (!desktop) return null;
  return <div style={{display:'flex', gap:12, alignItems:'center', padding:'8px 20px', flexWrap:'wrap'}}>
    <span role="status">Windows · {status}</span>
    <button onClick={() => void desktop.testNotification()}>Thử thông báo</button>
    <button onClick={() => void desktop.configure()}>Đổi máy chủ</button>
  </div>;
}
