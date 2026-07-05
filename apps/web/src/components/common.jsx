/* Extracted from app.jsx — presentational components (common). */
import * as React from 'react';
const { useState, useEffect } = React;
import { Ico } from '../ui.jsx';

export function ConnCard({ color, title, sub, icon }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #e6e8ee', borderRadius:'14px', padding:'18px 20px', display:'flex', alignItems:'center', gap:'16px' }}>
      <div style={{ width:'46px', height:'46px', flex:'none', borderRadius:'11px', background:color+'12', color, display:'flex', alignItems:'center', justifyContent:'center' }}>{icon}</div>
      <div style={{ flex:1 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'9px' }}><span style={{ font:'600 15px/1 "IBM Plex Sans"', color:'#161a26' }}>{title}</span><span style={{ display:'inline-flex', alignItems:'center', gap:'5px', font:'600 11px/1 "IBM Plex Sans"', color:'#1f7a5c' }}><span style={{ width:'7px', height:'7px', borderRadius:'50%', background:'#1f7a5c' }}></span>Connected</span></div>
        <div style={{ font:'400 12px/1.4 "IBM Plex Mono",monospace', color:'#9aa1b2', marginTop:'5px' }}>{sub}</div>
      </div>
    </div>
  );
}

export function StatCard({ color, value, label, icon }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #e6e8ee', borderRadius:'14px', padding:'16px 20px', flex:1, display:'flex', alignItems:'center', gap:'14px' }}>
      <div style={{ width:'42px', height:'42px', borderRadius:'11px', background:color+'12', color, display:'flex', alignItems:'center', justifyContent:'center' }}>{icon}</div>
      <div><div style={{ font:'600 24px/1 "IBM Plex Sans"', color:'#161a26' }}>{value}</div><div style={{ font:'400 12.5px/1.3 "IBM Plex Sans"', color:'#7b8294' }}>{label}</div></div>
    </div>
  );
}

export function IdleWarning({ onStay }) {
  const [secs, setSecs] = useState(60);
  useEffect(() => { const t = setInterval(()=>setSecs((s)=>s>0?s-1:0), 1000); return ()=>clearInterval(t); }, []);
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(20,26,48,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:'36px', zIndex:62, animation:'ovIn .18s ease' }}>
      <div style={{ width:'400px', maxWidth:'100%', background:'#fff', borderRadius:'16px', overflow:'hidden', boxShadow:'0 24px 60px rgba(10,16,40,.34)', animation:'cardUp .22s ease', textAlign:'center', padding:'30px 30px 26px' }}>
        <div style={{ width:'48px', height:'48px', borderRadius:'12px', background:'#fbf2df', color:'#9a6712', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}><Ico size={24}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Ico></div>
        <div style={{ font:'600 18px/1.3 "IBM Plex Sans"', color:'#161a26', marginBottom:'8px' }}>Still there?</div>
        <div style={{ font:'400 13.5px/1.6 "IBM Plex Sans"', color:'#54607a', marginBottom:'22px' }}>You'll be signed out in <strong style={{ color:'#c0143c' }}>{secs}s</strong> due to inactivity. Move the mouse or click below to stay signed in.</div>
        <button style={{ width:'100%', border:'none', background:'#213a9e', color:'#fff', borderRadius:'11px', padding:'13px', font:'600 14px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={onStay}>Stay signed in</button>
      </div>
    </div>
  );
}

export function Empty({ msg }) { return <div style={{ padding:'26px 18px', textAlign:'center', font:'400 13px/1.5 "IBM Plex Sans"', color:'#aab0c0' }}>{msg}</div>; }

export function Toast({ msg, err }) {
  return (
    <div style={{ position:'fixed', bottom:'26px', left:'50%', transform:'translateX(-50%)', background:'#161a26', color:'#fff', padding:'13px 22px', borderRadius:'11px', font:'500 13.5px/1 "IBM Plex Sans"', display:'flex', alignItems:'center', gap:'11px', boxShadow:'0 12px 32px rgba(10,16,40,.3)', zIndex:60, animation:'toastIn .25s ease' }}>
      <span style={{ width:'20px', height:'20px', borderRadius:'50%', background:err?'#c0143c':'#1f7a5c', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">{err?<path d="M18 6L6 18M6 6l12 12"/>:<path d="M20 6L9 17l-5-5"/>}</svg>
      </span>
      {msg}
    </div>
  );
}

export function Splash() {
  return (
    <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center', background:'#eef1f5' }}>
      <span style={{ width:'34px', height:'34px', border:'3px solid #d2d7e3', borderTopColor:'#213a9e', borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite' }}></span>
    </div>
  );
}

export function SignIn({ onSignIn, configOk, fatal, idle }) {
  return (
    <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center', backgroundImage:'linear-gradient(180deg, rgba(12,22,48,.55), rgba(12,22,48,.68)), url(assets/biltema-building.png)', backgroundSize:'cover', backgroundPosition:'center' }}>
      <div style={{ width:'420px', maxWidth:'90%', background:'rgba(255,255,255,.97)', border:'1px solid rgba(255,255,255,.6)', borderRadius:'18px', padding:'40px 38px', boxShadow:'0 30px 70px rgba(8,14,36,.45)', textAlign:'center', backdropFilter:'blur(2px)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'14px', marginBottom:'26px' }}>
          <img src="assets/birgma-logo.png" alt="Birgma" style={{ height:'30px', width:'auto' }} />
          <span style={{ width:'1px', height:'34px', background:'#e1e4ec' }}></span>
          <img src="assets/biltema-logo.png" alt="Biltema" style={{ height:'14px', width:'auto' }} />
        </div>
        <div style={{ font:'600 22px/1.25 "IBM Plex Sans"', color:'#161a26', marginBottom:'8px' }}>Governance Portal</div>
        <div style={{ font:'400 13.5px/1.6 "IBM Plex Sans"', color:'#7b8294', marginBottom:'28px' }}>Sign in with your Birgma / Biltema account to read and acknowledge governance policies.</div>
        {idle && <div style={{ display:'flex', alignItems:'center', gap:'9px', textAlign:'left', background:'#fbf2df', border:'1px solid #f0e0bd', borderRadius:'10px', padding:'11px 13px', marginBottom:'20px', font:'500 12.5px/1.5 "IBM Plex Sans"', color:'#9a6712' }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flex:'none'}}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>You were signed out after 15 minutes of inactivity. Please sign in again.</div>}
        <button onClick={onSignIn} disabled={!configOk} style={{ width:'100%', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'11px', border:'none', background:configOk?'#213a9e':'#bcc3d6', color:'#fff', borderRadius:'11px', padding:'14px', font:'600 14.5px/1 "IBM Plex Sans"', cursor:configOk?'pointer':'not-allowed' }}>
          <svg width="18" height="18" viewBox="0 0 23 23"><rect x="1" y="1" width="10" height="10" fill="#fff" opacity=".95"/><rect x="12" y="1" width="10" height="10" fill="#fff" opacity=".7"/><rect x="1" y="12" width="10" height="10" fill="#fff" opacity=".7"/><rect x="12" y="12" width="10" height="10" fill="#fff" opacity=".5"/></svg>
          Sign in with Microsoft
        </button>
        {!configOk && <div style={{ marginTop:'18px', font:'400 12px/1.5 "IBM Plex Mono",monospace', color:'#c0143c' }}>Auth not configured. Set TENANT_ID / SPA_CLIENT_ID / API_CLIENT_ID in the container env (config.js).</div>}
        {fatal && <div style={{ marginTop:'18px', font:'400 12px/1.5 "IBM Plex Mono",monospace', color:'#c0143c' }}>{fatal}</div>}
        <div style={{ marginTop:'26px', font:'400 11px/1.4 "IBM Plex Mono",monospace', color:'#aab0c0' }}>Secured by Microsoft Entra ID</div>
      </div>
    </div>
  );
}
