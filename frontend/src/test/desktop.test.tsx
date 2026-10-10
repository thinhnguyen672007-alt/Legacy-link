import {afterEach, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {MemoryRouter, useLocation} from 'react-router-dom';
import {DesktopControls} from '../desktop';
import {SessionProvider, useSession} from '../session';
function Harness() {
 const {connect,session} = useSession(); const location=useLocation();
 return <><button onClick={()=>connect({base:'http://fixture/api',readToken:'session-token-123456',writeToken:'',user:{id:'1',username:'admin',role:'admin',disabled:false,mustChangePassword:false}})}>Login</button><DesktopControls/><p data-testid="route">{location.search}</p><p data-testid="session">{session?'yes':'no'}</p></>;
}
afterEach(()=>{delete window.legacyDesktop;});
it('browser needs no desktop bridge',()=>{
 render(<MemoryRouter><SessionProvider><Harness/></SessionProvider></MemoryRouter>);
 expect(screen.queryByText(/Windows/)).not.toBeInTheDocument();
});
it('session sync, two notification targets and matching expiry',async()=>{
 let alarm: (v:{device:string|null;eventId:string})=>void=()=>{};
 let status: (v:{text:string;expiredToken?:string})=>void=()=>{};
 const remove=vi.fn(), sync=vi.fn().mockResolvedValue({text:'Đang theo dõi'});
 window.legacyDesktop={syncSession:sync,ready:vi.fn().mockResolvedValue(undefined),onAlarm:cb=>{alarm=cb;return remove;},onStatus:cb=>{status=cb;return remove;},configure:vi.fn(),testNotification:vi.fn()};
 const r=render(<MemoryRouter><SessionProvider><Harness/></SessionProvider></MemoryRouter>);
 fireEvent.click(screen.getByText('Login'));
 await waitFor(()=>expect(sync).toHaveBeenCalledWith('session-token-123456'));
 act(()=>alarm({device:'BENCH-01',eventId:'1'}));expect(screen.getByTestId('route')).toHaveTextContent('device=BENCH-01');
 act(()=>alarm({device:'BENCH-02',eventId:'2'}));expect(screen.getByTestId('route')).toHaveTextContent('device=BENCH-02');
 act(()=>status({text:'Cần đăng nhập',expiredToken:'old-token'}));expect(screen.getByTestId('session')).toHaveTextContent('yes');
 act(()=>status({text:'Cần đăng nhập',expiredToken:'session-token-123456'}));expect(screen.getByTestId('session')).toHaveTextContent('no');
 r.unmount();expect(remove).toHaveBeenCalled();
});
