/* Extracted from app.jsx — presentational components (modals). */
import * as React from 'react';
const { useState } = React;
import { escapeHtml } from '../format.js';
import { Ico, chipStyle, sourceStyle, fmtDate, initials } from '../ui.jsx';
import { Empty } from './common.jsx';

export function ConfirmArchive({ policy, onCancel, onConfirm }) {
  const stop = (e) => e.stopPropagation();
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(20,26,48,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:'36px', zIndex:58, animation:'ovIn .18s ease' }} onClick={onCancel}>
      <div style={{ width:'440px', maxWidth:'100%', background:'#fff', borderRadius:'16px', overflow:'hidden', boxShadow:'0 24px 60px rgba(10,16,40,.34)', animation:'cardUp .22s ease' }} onClick={stop}>
        <div style={{ padding:'26px 28px 22px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'13px', marginBottom:'14px' }}>
            <div style={{ width:'42px', height:'42px', flex:'none', borderRadius:'11px', background:'#fbf2df', color:'#9a6712', display:'flex', alignItems:'center', justifyContent:'center' }}><Ico size={22}><path d="M3 7h18M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 7l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7"/></Ico></div>
            <div style={{ font:'600 18px/1.3 "IBM Plex Sans"', color:'#161a26' }}>Archive this policy?</div>
          </div>
          <div style={{ font:'400 13.5px/1.6 "IBM Plex Sans"', color:'#54607a' }}>
            <strong style={{ color:'#23283a' }}>{policy.name}</strong> will be removed from the active library and from employees’ lists. The SharePoint document is not touched, and all existing signatures are kept. You can restore it anytime from the Archived tab.
          </div>
        </div>
        <div style={{ borderTop:'1px solid #eceef4', background:'#fafbfd', padding:'16px 28px', display:'flex', gap:'12px', justifyContent:'flex-end' }}>
          <button style={{ border:'1px solid #e6e8ee', background:'#fff', color:'#54607a', borderRadius:'10px', padding:'11px 20px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={onCancel}>Cancel</button>
          <button style={{ border:'none', background:'#c0143c', color:'#fff', borderRadius:'10px', padding:'11px 22px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={onConfirm}>Archive policy</button>
        </div>
      </div>
    </div>
  );
}

/* ============================ screens ============================ */

export function ImportModal({ onClose, platformGroups, impTarget, setImpTarget, impSearch, setImpSearch, importList, impSel, setImpSel, impTargetName, doImport }) {
  const stop = (e) => e.stopPropagation();
  const toggle = (id) => setImpSel((s)=> s.includes(id) ? s.filter((x)=>x!==id) : [...s, id]);
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(20,26,48,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:'36px', zIndex:54, animation:'ovIn .18s ease' }} onClick={onClose}>
      <div style={{ width:'680px', maxWidth:'100%', maxHeight:'88vh', background:'#fff', borderRadius:'16px', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 24px 60px rgba(10,16,40,.34)', animation:'cardUp .22s ease' }} onClick={stop}>
        <div style={{ flex:'none', padding:'22px 26px', borderBottom:'1px solid #eceef4' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ font:'600 18px/1.2 "IBM Plex Sans"', color:'#161a26' }}>Import groups from directory</div>
            <button style={{ border:'none', background:'#f3f4f8', width:'34px', height:'34px', borderRadius:'9px', cursor:'pointer', color:'#54607a', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}><Ico size={17} sw={2.2} d="M6 6l12 12M18 6L6 18" /></button>
          </div>
          <div style={{ font:'400 12.5px/1.4 "IBM Plex Sans"', color:'#7b8294', marginTop:'6px' }}>Select Active Directory / Entra ID security groups, then map them to a platform group.</div>
        </div>
        <div style={{ flex:'none', padding:'16px 26px 12px', borderBottom:'1px solid #f3f4f8' }}>
          <div style={{ font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.05em', textTransform:'uppercase', color:'#9aa1b2', marginBottom:'9px' }}>Map into group</div>
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
            {platformGroups.map((pg)=>(<button key={pg.id} style={chipStyle(impTarget===pg.id)} onClick={()=>setImpTarget(pg.id)}>{pg.name}</button>))}
          </div>
        </div>
        <div style={{ flex:'none', padding:'14px 26px 6px' }}>
          <input value={impSearch} onChange={(e)=>setImpSearch(e.target.value)} placeholder="Search directory groups…" style={{ width:'100%', border:'1px solid #d8dce6', borderRadius:'9px', padding:'10px 13px', font:'400 13.5px/1 "IBM Plex Sans"', outline:'none' }} />
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'8px 26px 16px', display:'flex', flexDirection:'column', gap:'8px' }}>
          {importList.map((a)=>{ const sel = impSel.includes(a.id); return (
            <div key={a.id} onClick={()=>toggle(a.id)} style={{ display:'flex', alignItems:'center', gap:'13px', padding:'12px 14px', borderRadius:'10px', cursor:'pointer', border:'1px solid '+(sel?'#213a9e':'#eceef4'), background:sel?'#eef1fb':'#fff' }}>
              <input type="checkbox" checked={sel} readOnly style={{ width:'17px', height:'17px', accentColor:'#213a9e', pointerEvents:'none', flex:'none' }} />
              <span style={{ flex:1, minWidth:0, font:'600 13.5px/1.2 "IBM Plex Sans"', color:'#23283a', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.name}</span>
              <span style={sourceStyle(a.source)}>{a.source}</span>
              <span style={{ font:'400 11.5px/1 "IBM Plex Mono",monospace', color:'#9aa1b2', whiteSpace:'nowrap' }}>{a.members} members</span>
            </div>
          ); })}
          {!importList.length && <Empty msg="No directory groups available — run a sync first." />}
        </div>
        <div style={{ flex:'none', borderTop:'1px solid #eceef4', background:'#fafbfd', padding:'16px 26px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ font:'500 12.5px/1 "IBM Plex Mono",monospace', color:'#8a92a6' }}>{impSel.length} selected → {impTargetName}</div>
          <div style={{ display:'flex', gap:'12px' }}>
            <button style={{ border:'1px solid #e6e8ee', background:'#fff', color:'#54607a', borderRadius:'10px', padding:'11px 20px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={onClose}>Cancel</button>
            <button style={{ border:'none', background:'#213a9e', color:'#fff', borderRadius:'10px', padding:'11px 22px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={doImport}>Import &amp; map</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SharePointPicker({ pkLevel, pkDrive, pkDriveName, pkPath, pkItems, pkLoading, pkErr, onNav, onPick, onClose }) {
  const stop = (e) => e.stopPropagation();
  const parts = pkPath ? pkPath.split('/') : [];
  const crumbs = [{ label:'Libraries', drive:'', path:'' }];
  if (pkLevel === 'folder' && pkDrive) {
    crumbs.push({ label: pkDriveName || 'Library', drive: pkDrive, path:'' });
    parts.forEach((seg,i)=> crumbs.push({ label:seg, drive:pkDrive, path:parts.slice(0,i+1).join('/') }));
  }
  const openItem = (it) => {
    if (it.isLibrary) onNav(it.driveId, '', it.name);
    else if (it.isFolder) onNav(pkDrive, (pkPath ? pkPath + '/' : '') + it.name, pkDriveName);
    else onPick(it);
  };
  const kb = (n) => n >= 1048576 ? (n/1048576).toFixed(1)+' MB' : n >= 1024 ? Math.round(n/1024)+' KB' : (n||0)+' B';
  const sub = (it) => it.isLibrary ? 'Document library' : it.isFolder ? (it.childCount+' item'+(it.childCount===1?'':'s')) : (kb(it.size)+'  ·  '+fmtDate(it.modified));
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(20,26,48,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:'36px', zIndex:56, animation:'ovIn .18s ease' }} onClick={onClose}>
      <div style={{ width:'700px', maxWidth:'100%', maxHeight:'88vh', background:'#fff', borderRadius:'16px', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 24px 60px rgba(10,16,40,.34)', animation:'cardUp .22s ease' }} onClick={stop}>
        <div style={{ flex:'none', padding:'22px 26px 16px', borderBottom:'1px solid #eceef4' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'11px' }}>
              <div style={{ width:'34px', height:'34px', borderRadius:'8px', background:'#0078c012', color:'#0078c0', display:'flex', alignItems:'center', justifyContent:'center', flex:'none' }}><Ico size={18}><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4"/></Ico></div>
              <div><div style={{ font:'600 18px/1.2 "IBM Plex Sans"', color:'#161a26' }}>Select a policy document</div><div style={{ font:'400 12px/1.3 "IBM Plex Sans"', color:'#7b8294', marginTop:'3px' }}>Browse the Global IT SharePoint libraries</div></div>
            </div>
            <button style={{ border:'none', background:'#f3f4f8', width:'34px', height:'34px', borderRadius:'9px', cursor:'pointer', color:'#54607a', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}><Ico size={17} sw={2.2} d="M6 6l12 12M18 6L6 18" /></button>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'5px', flexWrap:'wrap', marginTop:'15px', font:'500 12.5px/1 "IBM Plex Sans"' }}>
            {crumbs.map((c,i)=>(
              <React.Fragment key={i}>
                {i>0 && <span style={{ color:'#c2c7d3' }}>/</span>}
                <button onClick={()=>onNav(c.drive, c.path, c.drive ? (pkDriveName||c.label) : '')} style={{ border:'none', background:'transparent', cursor:'pointer', padding:'3px 5px', borderRadius:'6px', font:'500 12.5px/1 "IBM Plex Sans"', color:i===crumbs.length-1?'#161a26':'#213a9e' }}>{c.label}</button>
              </React.Fragment>
            ))}
          </div>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'10px 18px 14px', minHeight:'240px' }}>
          {pkLoading && <div style={{ height:'200px', display:'flex', alignItems:'center', justifyContent:'center' }}><span style={{ width:'26px', height:'26px', border:'3px solid #d2d7e3', borderTopColor:'#213a9e', borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite' }}></span></div>}
          {!pkLoading && pkErr && <div style={{ padding:'30px 18px', textAlign:'center', font:'400 13px/1.6 "IBM Plex Sans"', color:'#c0143c' }}>Couldn’t load:<br/><span style={{ font:'400 12px/1.5 "IBM Plex Mono",monospace' }}>{pkErr}</span></div>}
          {!pkLoading && !pkErr && pkItems.map((it)=>(
            <div key={it.itemId} onClick={()=>openItem(it)} style={{ display:'flex', alignItems:'center', gap:'13px', padding:'11px 14px', borderRadius:'10px', cursor:'pointer', border:'1px solid transparent' }} onMouseEnter={(e)=>{e.currentTarget.style.background='#f6f8fb';e.currentTarget.style.borderColor='#eceef4';}} onMouseLeave={(e)=>{e.currentTarget.style.background='transparent';e.currentTarget.style.borderColor='transparent';}}>
              <span style={{ flex:'none', color: it.isLibrary?'#0078c0':it.isFolder?'#b7791f':'#0078c0', display:'flex' }}>
                {it.isLibrary
                  ? <Ico size={20} sw={1.8}><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4M3 17l9 4 9-4"/></Ico>
                  : it.isFolder
                    ? <Ico size={20} sw={1.8}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></Ico>
                    : <Ico size={20} sw={1.8}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></Ico>}
              </span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ font:'600 13.5px/1.3 "IBM Plex Sans"', color:'#23283a', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{it.name}</div>
                <div style={{ font:'400 11px/1.3 "IBM Plex Mono",monospace', color:'#9aa1b2' }}>{sub(it)}</div>
              </div>
              {(it.isLibrary || it.isFolder)
                ? <Ico size={17} d="M9 6l6 6-6 6" />
                : <span style={{ font:'600 11.5px/1 "IBM Plex Sans"', color:'#213a9e', flex:'none' }}>Select</span>}
            </div>
          ))}
          {!pkLoading && !pkErr && !pkItems.length && <Empty msg="This folder is empty." />}
        </div>
        <div style={{ flex:'none', borderTop:'1px solid #eceef4', background:'#fafbfd', padding:'14px 26px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ font:'400 11.5px/1.4 "IBM Plex Mono",monospace', color:'#9aa1b2' }}>Click a file to select it · click a library/folder to open it</div>
          <button style={{ border:'1px solid #e6e8ee', background:'#fff', color:'#54607a', borderRadius:'10px', padding:'10px 20px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export function MembersModal({ group, emps, memberIds, onToggle, onClose }) {
  const stop = (e) => e.stopPropagation();
  const [q, setQ] = useState('');
  const list = (emps || []).filter((e)=>!q || (e.display_name||'').toLowerCase().includes(q.toLowerCase()) || (e.email||e.upn||'').toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(20,26,48,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:'36px', zIndex:57, animation:'ovIn .18s ease' }} onClick={onClose}>
      <div style={{ width:'620px', maxWidth:'100%', maxHeight:'86vh', background:'#fff', borderRadius:'16px', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 24px 60px rgba(10,16,40,.34)', animation:'cardUp .22s ease' }} onClick={stop}>
        <div style={{ flex:'none', padding:'22px 26px 16px', borderBottom:'1px solid #eceef4' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div><div style={{ font:'600 18px/1.2 "IBM Plex Sans"', color:'#161a26' }}>Members of {group && group.name}</div><div style={{ font:'400 12px/1.3 "IBM Plex Sans"', color:'#7b8294', marginTop:'3px' }}>{memberIds.size} selected · directly added to this group</div></div>
            <button style={{ border:'none', background:'#f3f4f8', width:'34px', height:'34px', borderRadius:'9px', cursor:'pointer', color:'#54607a', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}><Ico size={17} sw={2.2} d="M6 6l12 12M18 6L6 18" /></button>
          </div>
          <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search employees…" style={{ marginTop:'14px', width:'100%', border:'1px solid #d8dce6', borderRadius:'9px', padding:'10px 13px', font:'400 13.5px/1 "IBM Plex Sans"', outline:'none' }} />
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'8px 18px 14px' }}>
          {list.map((e)=>{ const on = memberIds.has(e.oid); return (
            <div key={e.oid} onClick={()=>onToggle(e.oid)} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'10px 12px', borderRadius:'10px', cursor:'pointer', border:'1px solid '+(on?'#cdd5f0':'transparent'), background:on?'#eef1fb':'transparent' }}>
              <input type="checkbox" checked={on} readOnly style={{ width:'17px', height:'17px', accentColor:'#213a9e', pointerEvents:'none', flex:'none' }} />
              <div style={{ width:'32px', height:'32px', flex:'none', borderRadius:'50%', background:'#eef1fb', color:'#213a9e', display:'flex', alignItems:'center', justifyContent:'center', font:'600 11.5px/1 "IBM Plex Sans"' }}>{initials(e.display_name)}</div>
              <div style={{ flex:1, minWidth:0 }}><div style={{ font:'600 13.5px/1.2 "IBM Plex Sans"', color:'#23283a' }}>{e.display_name}</div><div style={{ font:'400 11.5px/1.3 "IBM Plex Mono",monospace', color:'#9aa1b2', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{e.email||e.upn} · {e.department}</div></div>
              {on && <span style={{ font:'600 11.5px/1 "IBM Plex Sans"', color:'#1f7a5c', flex:'none' }}>Member</span>}
            </div>
          ); })}
          {!list.length && <Empty msg="No employees match." />}
        </div>
        <div style={{ flex:'none', borderTop:'1px solid #eceef4', background:'#fafbfd', padding:'14px 26px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ font:'400 11.5px/1.4 "IBM Plex Mono",monospace', color:'#9aa1b2' }}>Click to add / remove · changes save immediately</div>
          <button style={{ border:'none', background:'#213a9e', color:'#fff', borderRadius:'10px', padding:'10px 20px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

export function GroupComplianceModal({ detail, onClose }) {
  const stop = (e) => e.stopPropagation();
  const g = detail.group; const rows = detail.rows;
  const ready = Array.isArray(rows);
  const done = ready ? rows.filter((r)=>r.required>0 && r.signed>=r.required).length : 0;
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(20,26,48,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:'36px', zIndex:57, animation:'ovIn .18s ease' }} onClick={onClose}>
      <div style={{ width:'660px', maxWidth:'100%', maxHeight:'86vh', background:'#fff', borderRadius:'16px', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 24px 60px rgba(10,16,40,.34)', animation:'cardUp .22s ease' }} onClick={stop}>
        <div style={{ flex:'none', padding:'22px 26px 18px', borderBottom:'1px solid #eceef4', display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
          <div>
            <div style={{ font:'600 18px/1.2 "IBM Plex Sans"', color:'#161a26' }}>{g.name} — completion</div>
            <div style={{ font:'400 12.5px/1.4 "IBM Plex Sans"', color:'#7b8294', marginTop:'4px' }}>{ready ? (done + ' of ' + rows.length + ' members fully compliant across this group’s policies') : 'Loading…'}</div>
          </div>
          <button style={{ border:'none', background:'#f3f4f8', width:'34px', height:'34px', borderRadius:'9px', cursor:'pointer', color:'#54607a', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}><Ico size={17} sw={2.2} d="M6 6l12 12M18 6L6 18" /></button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'8px 18px 14px', minHeight:'180px' }}>
          {!ready && <div style={{ height:'160px', display:'flex', alignItems:'center', justifyContent:'center' }}><span style={{ width:'26px', height:'26px', border:'3px solid #d2d7e3', borderTopColor:'#213a9e', borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite' }}></span></div>}
          {ready && rows.map((r)=>{ const complete = r.required>0 && r.signed>=r.required; const none = r.signed===0; return (
            <div key={r.oid} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'11px 12px', borderBottom:'1px solid #f3f4f8' }}>
              <div style={{ width:'32px', height:'32px', flex:'none', borderRadius:'50%', background:'#eef1fb', color:'#213a9e', display:'flex', alignItems:'center', justifyContent:'center', font:'600 11.5px/1 "IBM Plex Sans"' }}>{initials(r.display_name)}</div>
              <div style={{ flex:1, minWidth:0 }}><div style={{ font:'600 13.5px/1.2 "IBM Plex Sans"', color:'#23283a' }}>{r.display_name}</div><div style={{ font:'400 11.5px/1.3 "IBM Plex Mono",monospace', color:'#9aa1b2', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.email||r.upn} · {r.department}</div></div>
              <div style={{ font:'400 12px/1 "IBM Plex Mono",monospace', color:'#9aa1b2', width:'54px', textAlign:'right' }}>{r.signed}/{r.required}</div>
              <span style={{ flex:'none', display:'inline-flex', alignItems:'center', gap:'6px', padding:'5px 11px', borderRadius:'999px', font:'600 11.5px/1 "IBM Plex Sans"', color: complete?'#1f7a5c':none?'#c0143c':'#9a6712', background: complete?'#e6f3ec':none?'#fbe7ec':'#fbf2df', width:'112px', justifyContent:'center' }}>
                {complete ? 'Complete' : none ? 'Not started' : 'In progress'}
              </span>
            </div>
          ); })}
          {ready && !rows.length && <Empty msg="This group has no active members." />}
        </div>
      </div>
    </div>
  );
}

export function ConfirmDeleteGroup({ group, onCancel, onConfirm }) {
  const stop = (e) => e.stopPropagation();
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(20,26,48,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:'36px', zIndex:58, animation:'ovIn .18s ease' }} onClick={onCancel}>
      <div style={{ width:'440px', maxWidth:'100%', background:'#fff', borderRadius:'16px', overflow:'hidden', boxShadow:'0 24px 60px rgba(10,16,40,.34)', animation:'cardUp .22s ease' }} onClick={stop}>
        <div style={{ padding:'26px 28px 22px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'13px', marginBottom:'14px' }}>
            <div style={{ width:'42px', height:'42px', flex:'none', borderRadius:'11px', background:'#fbe7ec', color:'#c0143c', display:'flex', alignItems:'center', justifyContent:'center' }}><Ico size={22}><path d="M3 7h18M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 7l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7"/></Ico></div>
            <div style={{ font:'600 18px/1.3 "IBM Plex Sans"', color:'#161a26' }}>Delete this group permanently?</div>
          </div>
          <div style={{ font:'400 13.5px/1.6 "IBM Plex Sans"', color:'#54607a' }}>
            <strong style={{ color:'#23283a' }}>{group.name}</strong> will be permanently removed. This can't be undone. Signatures and employees are not affected. If the group still has policy assignments or directory mappings, deletion is blocked — archive it instead.
          </div>
        </div>
        <div style={{ borderTop:'1px solid #eceef4', background:'#fafbfd', padding:'16px 28px', display:'flex', gap:'12px', justifyContent:'flex-end' }}>
          <button style={{ border:'1px solid #e6e8ee', background:'#fff', color:'#54607a', borderRadius:'10px', padding:'11px 20px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={onCancel}>Cancel</button>
          <button style={{ border:'none', background:'#c0143c', color:'#fff', borderRadius:'10px', padding:'11px 22px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={onConfirm}>Delete permanently</button>
        </div>
      </div>
    </div>
  );
}

export function ManagerEditModal({ employee, emps, onSave, onClose }) {
  const stop = (e) => e.stopPropagation();
  const [sel, setSel] = useState(employee.functional_manager_oid || '');
  const [q, setQ] = useState('');
  const candidates = (emps || []).filter((e)=>e.oid !== employee.oid).filter((e)=>!q || (e.display_name||'').toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(20,26,48,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:'36px', zIndex:58, animation:'ovIn .18s ease' }} onClick={onClose}>
      <div style={{ width:'480px', maxWidth:'100%', maxHeight:'82vh', background:'#fff', borderRadius:'16px', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 24px 60px rgba(10,16,40,.34)', animation:'cardUp .22s ease' }} onClick={stop}>
        <div style={{ flex:'none', padding:'22px 26px 16px', borderBottom:'1px solid #eceef4' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div><div style={{ font:'600 17px/1.2 "IBM Plex Sans"', color:'#161a26' }}>Functional manager</div><div style={{ font:'400 12px/1.4 "IBM Plex Sans"', color:'#7b8294', marginTop:'3px' }}>for {employee.display_name}{employee.manager_name ? ' · legal manager (AD): ' + employee.manager_name : ''}</div></div>
            <button style={{ border:'none', background:'#f3f4f8', width:'34px', height:'34px', borderRadius:'9px', cursor:'pointer', color:'#54607a', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}><Ico size={17} sw={2.2} d="M6 6l12 12M18 6L6 18" /></button>
          </div>
          <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search people…" style={{ marginTop:'13px', width:'100%', border:'1px solid #d8dce6', borderRadius:'9px', padding:'10px 13px', font:'400 13.5px/1 "IBM Plex Sans"', outline:'none' }} />
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'8px 18px' }}>
          <div onClick={()=>setSel('')} style={{ display:'flex', alignItems:'center', gap:'11px', padding:'10px 12px', borderRadius:'10px', cursor:'pointer', border:'1px solid '+(sel===''?'#cdd5f0':'transparent'), background:sel===''?'#eef1fb':'transparent' }}>
            <div style={{ width:'32px', height:'32px', flex:'none', borderRadius:'50%', background:'#f3f4f8', color:'#9aa1b2', display:'flex', alignItems:'center', justifyContent:'center' }}><Ico size={16} sw={2.2} d="M6 6l12 12M18 6L6 18" /></div>
            <div style={{ font:'500 13.5px/1.2 "IBM Plex Sans"', color:'#54607a' }}>No functional manager</div>
          </div>
          {candidates.map((e)=>(
            <div key={e.oid} onClick={()=>setSel(e.oid)} style={{ display:'flex', alignItems:'center', gap:'11px', padding:'10px 12px', borderRadius:'10px', cursor:'pointer', border:'1px solid '+(sel===e.oid?'#cdd5f0':'transparent'), background:sel===e.oid?'#eef1fb':'transparent' }}>
              <div style={{ width:'32px', height:'32px', flex:'none', borderRadius:'50%', background:'#eef1fb', color:'#213a9e', display:'flex', alignItems:'center', justifyContent:'center', font:'600 11.5px/1 "IBM Plex Sans"' }}>{initials(e.display_name)}</div>
              <div style={{ flex:1, minWidth:0 }}><div style={{ font:'600 13.5px/1.2 "IBM Plex Sans"', color:'#23283a' }}>{e.display_name}</div><div style={{ font:'400 11.5px/1.3 "IBM Plex Mono",monospace', color:'#9aa1b2' }}>{e.department}</div></div>
              {sel===e.oid && <Ico size={17} sw={2.4} d="M20 6L9 17l-5-5" />}
            </div>
          ))}
        </div>
        <div style={{ flex:'none', borderTop:'1px solid #eceef4', background:'#fafbfd', padding:'16px 26px', display:'flex', gap:'12px', justifyContent:'flex-end' }}>
          <button style={{ border:'1px solid #e6e8ee', background:'#fff', color:'#54607a', borderRadius:'10px', padding:'11px 20px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={onClose}>Cancel</button>
          <button style={{ border:'none', background:'#213a9e', color:'#fff', borderRadius:'10px', padding:'11px 22px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={()=>onSave(sel)}>Save</button>
        </div>
      </div>
    </div>
  );
}

export function ReceiptModal({ receipt, onClose }) {
  const stop = (e) => e.stopPropagation();
  const dateStr = receipt.at.toLocaleDateString(undefined, { year:'numeric', month:'long', day:'numeric' });
  const timeStr = receipt.at.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' });
  const ref = 'BG-' + receipt.at.getTime().toString(36).toUpperCase();
  const printIt = () => {
    const w = window.open('', '_blank', 'noopener,noreferrer,width=720,height=900');
    if (!w) return;
    try { w.opener = null; } catch (_) {}
    const esc = escapeHtml;
    w.document.write(`<!doctype html><html><head><title>Acknowledgement — ${esc(receipt.policy)}</title>
      <style>
        *{box-sizing:border-box} body{font-family:Segoe UI,Arial,sans-serif;color:#23283a;margin:0;padding:48px}
        .card{max-width:600px;margin:0 auto;border:1px solid #e6e8ee;border-radius:14px;padding:40px}
        .badge{width:54px;height:54px;border-radius:50%;background:#e6f3ec;color:#1f7a5c;display:flex;align-items:center;justify-content:center;font-size:30px;margin-bottom:20px}
        h1{font-size:21px;margin:0 0 4px} .sub{color:#7b8294;font-size:13px;margin:0 0 26px}
        .row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #f0f1f6;font-size:14px}
        .row span:first-child{color:#8a92a6} .row span:last-child{font-weight:600;text-align:right}
        .foot{margin-top:26px;font-size:11px;color:#aab0c0;line-height:1.6}
      </style></head><body><div class="card">
      <div class="badge">✓</div>
      <h1>Certificate of Acknowledgement</h1>
      <p class="sub">Birgma Governance Portal</p>
      <div class="row"><span>Employee</span><span>${esc(receipt.name)}</span></div>
      <div class="row"><span>Document</span><span>${esc(receipt.policy)}</span></div>
      <div class="row"><span>Type</span><span>${esc(receipt.type||'Policy')}</span></div>
      <div class="row"><span>Version acknowledged</span><span>${esc(receipt.version||'—')}</span></div>
      ${receipt.quizPct!=null?`<div class="row"><span>Knowledge check</span><span>Passed — ${esc(receipt.quizPct)}%</span></div>`:''}
      <div class="row"><span>Date &amp; time</span><span>${esc(dateStr)}, ${esc(timeStr)}</span></div>
      <div class="row"><span>Reference</span><span>${esc(ref)}</span></div>
      <p class="foot">This certificate confirms the named employee read and acknowledged the document version shown above on the date and time recorded. Generated automatically by the Birgma Governance Portal; the authoritative record is held in the portal's append-only signature ledger.</p>
      </div><script>window.onload=function(){window.print()}</scr`+`ipt></body></html>`);
    w.document.close();
  };
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(20,26,48,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:'36px', zIndex:60, animation:'ovIn .18s ease' }} onClick={onClose}>
      <div style={{ width:'460px', maxWidth:'100%', background:'#fff', borderRadius:'16px', overflow:'hidden', boxShadow:'0 24px 60px rgba(10,16,40,.34)', animation:'cardUp .22s ease' }} onClick={stop}>
        <div style={{ padding:'30px 30px 24px', textAlign:'center' }}>
          <div style={{ width:'58px', height:'58px', borderRadius:'50%', background:'#e6f3ec', color:'#1f7a5c', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}><Ico size={30} sw={2.4} d="M20 6L9 17l-5-5" /></div>
          <div style={{ font:'700 19px/1.2 "IBM Plex Sans"', color:'#161a26', marginBottom:'5px' }}>Successfully acknowledged</div>
          <div style={{ font:'400 13px/1.5 "IBM Plex Sans"', color:'#7b8294' }}>Your acknowledgement has been recorded.</div>
        </div>
        <div style={{ padding:'0 30px 8px' }}>
          {[['Employee', receipt.name], ['Document', receipt.policy], ['Version', receipt.version||'—'], ...(receipt.quizPct!=null?[['Knowledge check', 'Passed — '+receipt.quizPct+'%']]:[]), ['Date', dateStr+', '+timeStr], ['Reference', ref]].map(([k,v],i)=>(
            <div key={i} style={{ display:'flex', justifyContent:'space-between', gap:'14px', padding:'11px 0', borderBottom:'1px solid #f0f1f6' }}>
              <span style={{ font:'400 13px/1.4 "IBM Plex Sans"', color:'#8a92a6' }}>{k}</span>
              <span style={{ font:'600 13px/1.4 "IBM Plex Sans"', color:'#23283a', textAlign:'right' }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ padding:'18px 30px 24px', display:'flex', gap:'12px' }}>
          <button onClick={printIt} style={{ flex:1, border:'none', background:'#213a9e', color:'#fff', borderRadius:'10px', padding:'12px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'8px' }}><Ico size={16} sw={1.9}><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/></Ico>Print / Save as PDF</button>
          <button onClick={onClose} style={{ border:'1px solid #e6e8ee', background:'#fff', color:'#54607a', borderRadius:'10px', padding:'12px 20px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }}>Done</button>
        </div>
      </div>
    </div>
  );
}

export function PolicyHistoryModal({ detail, onClose }) {
  const stop = (e) => e.stopPropagation();
  const rows = detail.rows;
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(20,26,48,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:'36px', zIndex:58, animation:'ovIn .18s ease' }} onClick={onClose}>
      <div style={{ width:'540px', maxWidth:'100%', maxHeight:'82vh', background:'#fff', borderRadius:'16px', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 24px 60px rgba(10,16,40,.34)', animation:'cardUp .22s ease' }} onClick={stop}>
        <div style={{ flex:'none', padding:'22px 26px 16px', borderBottom:'1px solid #eceef4', display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
          <div><div style={{ font:'600 17px/1.2 "IBM Plex Sans"', color:'#161a26' }}>Version history</div><div style={{ font:'400 12px/1.3 "IBM Plex Sans"', color:'#7b8294', marginTop:'3px' }}>{detail.policy.name}</div></div>
          <button style={{ border:'none', background:'#f3f4f8', width:'34px', height:'34px', borderRadius:'9px', cursor:'pointer', color:'#54607a', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}><Ico size={17} sw={2.2} d="M6 6l12 12M18 6L6 18" /></button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'18px 26px' }}>
          {!rows && <div style={{ height:'120px', display:'flex', alignItems:'center', justifyContent:'center' }}><span style={{ width:'24px', height:'24px', border:'3px solid #d2d7e3', borderTopColor:'#213a9e', borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite' }}></span></div>}
          {rows && rows.map((v,i)=>(
            <div key={i} style={{ display:'flex', gap:'14px', paddingBottom:'18px' }}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flex:'none' }}>
                <div style={{ width:'11px', height:'11px', borderRadius:'50%', background:i===0?'#213a9e':'#c9cfdd', marginTop:'4px' }}></div>
                {i<rows.length-1 && <div style={{ width:'2px', flex:1, background:'#eceef4', marginTop:'4px' }}></div>}
              </div>
              <div style={{ flex:1, paddingBottom:'2px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'9px' }}>
                  <span style={{ font:'600 14px/1.2 "IBM Plex Sans"', color:'#23283a' }}>{v.version}</span>
                  {i===0 && <span style={{ font:'600 9.5px/1.3 "IBM Plex Mono",monospace', letterSpacing:'.05em', textTransform:'uppercase', color:'#213a9e', background:'#eef1fb', padding:'2px 7px', borderRadius:'999px' }}>Current</span>}
                </div>
                {v.note && <div style={{ font:'400 13px/1.5 "IBM Plex Sans"', color:'#54607a', marginTop:'3px' }}>{v.note}</div>}
                <div style={{ font:'400 11px/1.3 "IBM Plex Mono",monospace', color:'#aab0c0', marginTop:'4px' }}>{v.changed_by||'—'} · {fmtDate(v.changed_at)}</div>
              </div>
            </div>
          ))}
          {rows && !rows.length && <Empty msg="No version history recorded yet." />}
        </div>
      </div>
    </div>
  );
}
