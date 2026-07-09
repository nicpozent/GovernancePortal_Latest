/* Extracted from app.jsx — presentational components (people). */
import * as React from 'react';
import { Ico, seg, chipStyle, sourceStyle, fmtDate, initials } from '../ui.jsx';
import { ConnCard, Empty } from './common.jsx';

export function Employees({ empFilters, empFilter, setEmpFilter, empList, adCount, entraCount, syncing, syncNow, openAdd, onImport, onEditManager, syncInfo, formerEmps, empTab, setEmpTab }) {
  const fileRef = React.useRef(null);
  const syncDot = syncInfo ? (syncInfo.status==='success' ? 'var(--c1f7a5c)' : syncInfo.status==='error' ? 'var(--cc0143c)' : 'var(--c9a6712)') : 'var(--cc9cfdd)';
  const syncWhen = syncInfo && syncInfo.finished_at ? new Date(syncInfo.finished_at) : null;
  return (
    <div>
      <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display:'none' }} onChange={(e)=>{ const f=e.target.files&&e.target.files[0]; if(f) onImport(f); e.target.value=''; }} />
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'22px' }}>
        <ConnCard color="var(--c1f7a5c)" title="Active Directory" sub={'on-prem · '+adCount+' users'} icon={<Ico size={24} sw={1.8}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v16"/></Ico>} />
        <ConnCard color="var(--c0078c0)" title="Microsoft Entra ID" sub={'cloud · '+entraCount+' users'} icon={<Ico size={24} sw={1.8} d="M12 3l8 4v5c0 4.5-3 7.5-8 9-5-1.5-8-4.5-8-9V7z" />} />
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'14px', marginBottom:'18px', flexWrap:'wrap' }}>
        <div style={{ display:'flex', background:'var(--ceef0f4)', borderRadius:'11px', padding:'4px', width:'300px' }}>
          <button style={seg(empTab==='active')} onClick={()=>setEmpTab('active')}>Active</button>
          <button style={seg(empTab==='former')} onClick={()=>setEmpTab('former')}>Former{formerEmps&&formerEmps.length?(' ('+formerEmps.length+')'):''}</button>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'9px', font:'500 12px/1.4 "IBM Plex Mono",monospace', color:'var(--c8a92a6)' }}>
          <span style={{ width:'9px', height:'9px', borderRadius:'50%', background:syncDot, flex:'none' }}></span>
          {syncInfo ? ('Last sync: '+(syncInfo.status||'')+(syncWhen?(' · '+fmtDate(syncWhen)+' '+syncWhen.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})):'')+(syncInfo.status==='success'?(' · +'+(syncInfo.added||0)+' / ~'+(syncInfo.updated||0)):'')) : 'No sync run yet'}
          {syncInfo && syncInfo.status==='error' && syncInfo.error ? <span style={{ color:'var(--cc0143c)' }}>— {String(syncInfo.error).slice(0,60)}</span> : null}
        </div>
      </div>
      {empTab==='former' ? (
        <FormerEmployees rows={formerEmps} />
      ) : (
      <React.Fragment>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'16px', marginBottom:'16px', flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          {empFilters.map((f)=>(<button key={f} style={chipStyle(empFilter===f)} onClick={()=>setEmpFilter(f)}>{f}</button>))}
        </div>
        <div style={{ display:'flex', gap:'10px' }}>
          <button style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c41485a)', borderRadius:'10px', padding:'11px 16px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={()=>fileRef.current&&fileRef.current.click()}>
            <Ico size={16} sw={1.9}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15l3 3 3-3"/></Ico>Import CSV
          </button>
          <button style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c41485a)', borderRadius:'10px', padding:'11px 16px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={openAdd}>
            <Ico size={16} sw={2.2} d="M12 5v14M5 12h14" />Add local user
          </button>
          <button style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'none', background:'var(--c213a9e)', color:'#fff', borderRadius:'10px', padding:'11px 18px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={syncNow}>
            {syncing && <span style={{ width:'15px', height:'15px', border:'2px solid rgba(255,255,255,.4)', borderTopColor:'var(--surface)', borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite' }}></span>}
            Sync now
          </button>
        </div>
      </div>
      <div style={{ background:'var(--surface)', border:'1px solid var(--ce6e8ee)', borderRadius:'14px', overflow:'hidden' }}>
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1.2fr 1fr 1.4fr 0.9fr 40px', gap:'14px', padding:'13px 20px', background:'var(--cf8f9fc)', borderBottom:'1px solid var(--ceceef4)', font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.06em', color:'var(--c9aa1b2)', textTransform:'uppercase' }}>
          <div>Employee</div><div>Title</div><div>Department</div><div>Manager</div><div>Source</div><div></div>
        </div>
        {empList.map((e)=>(
          <div key={e.oid||e.email} style={{ display:'grid', gridTemplateColumns:'2fr 1.2fr 1fr 1.4fr 0.9fr 40px', gap:'14px', padding:'13px 20px', borderBottom:'1px solid var(--cf3f4f8)', alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'11px', minWidth:0 }}>
              <div style={{ width:'34px', height:'34px', flex:'none', borderRadius:'50%', background:'var(--ceef1fb)', color:'var(--c213a9e)', display:'flex', alignItems:'center', justifyContent:'center', font:'600 12px/1 "IBM Plex Sans"' }}>{initials(e.display_name)}</div>
              <div style={{ minWidth:0 }}><div style={{ font:'600 13.5px/1.2 "IBM Plex Sans"', color:'var(--c23283a)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{e.display_name}</div><div style={{ font:'400 11.5px/1.3 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{e.email||e.upn}</div></div>
            </div>
            <div style={{ font:'400 13px/1.3 "IBM Plex Sans"', color:'var(--c54607a)' }}>{e.job_title||'—'}</div>
            <div style={{ font:'500 13px/1.3 "IBM Plex Sans"', color:'var(--c23283a)' }}>{e.department}</div>
            <div style={{ minWidth:0 }}>
              <div style={{ font:'500 12.5px/1.3 "IBM Plex Sans"', color: e.functional_manager_name?'var(--c23283a)':'var(--caab0c0)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{e.functional_manager_name || '—'}</div>
              {e.manager_name && <div style={{ font:'400 10.5px/1.3 "IBM Plex Mono",monospace', color:'var(--caab0c0)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>AD: {e.manager_name}</div>}
            </div>
            <div><span style={sourceStyle(e.source)}>{e.source}</span></div>
            <div><button title="Set functional manager" onClick={()=>onEditManager(e)} style={{ border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c54607a)', borderRadius:'8px', width:'30px', height:'30px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><Ico size={15} sw={1.9} d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></button></div>
          </div>
        ))}
        {!empList.length && <Empty msg="No employees yet — run “Sync now” to import, or use Import CSV." />}
      </div>
      </React.Fragment>
      )}
    </div>
  );
}

export function FormerEmployees({ rows }) {
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--ce6e8ee)', borderRadius:'14px', overflow:'hidden' }}>
      <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--ceceef4)', font:'400 12.5px/1.5 "IBM Plex Sans"', color:'var(--c7b8294)' }}>Employees who left or were removed from the directory. They no longer count toward compliance, but their signature history is retained for audit.</div>
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1.3fr 1fr 1fr', gap:'14px', padding:'13px 20px', background:'var(--cf8f9fc)', borderBottom:'1px solid var(--ceceef4)', font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.06em', color:'var(--c9aa1b2)', textTransform:'uppercase' }}>
        <div>Employee</div><div>Department</div><div>Left</div><div>Signatures kept</div>
      </div>
      {(rows||[]).map((e)=>(
        <div key={e.oid} style={{ display:'grid', gridTemplateColumns:'2fr 1.3fr 1fr 1fr', gap:'14px', padding:'13px 20px', borderBottom:'1px solid var(--cf3f4f8)', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'11px', minWidth:0 }}>
            <div style={{ width:'34px', height:'34px', flex:'none', borderRadius:'50%', background:'var(--cf0f1f5)', color:'var(--c9aa1b2)', display:'flex', alignItems:'center', justifyContent:'center', font:'600 12px/1 "IBM Plex Sans"' }}>{initials(e.display_name)}</div>
            <div style={{ minWidth:0 }}><div style={{ font:'600 13.5px/1.2 "IBM Plex Sans"', color:'var(--c54607a)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{e.display_name}</div><div style={{ font:'400 11.5px/1.3 "IBM Plex Mono",monospace', color:'var(--caab0c0)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{e.email||e.upn}</div></div>
          </div>
          <div style={{ font:'500 13px/1.3 "IBM Plex Sans"', color:'var(--c54607a)' }}>{e.department}</div>
          <div style={{ font:'400 12px/1.3 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)' }}>{e.deactivated_at?fmtDate(e.deactivated_at):'—'}</div>
          <div style={{ font:'600 13px/1.3 "IBM Plex Sans"', color:'var(--c23283a)' }}>{e.signatures}</div>
        </div>
      ))}
      {!(rows||[]).length && <Empty msg="No former employees." />}
    </div>
  );
}

export function Groups({ platformCards, groupTab, switchGroupTab, archivedGroups, openAddGroup, openImport, removeMapping, onMembers, onArchive, onRestore, onDelete }) {
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'16px' }}>
        <div style={{ display:'flex', background:'var(--ceef0f4)', borderRadius:'11px', padding:'4px', width:'260px' }}>
          <button style={seg(groupTab==='active')} onClick={()=>switchGroupTab('active')}>Active</button>
          <button style={seg(groupTab==='archived')} onClick={()=>switchGroupTab('archived')}>Archived</button>
        </div>
      </div>
      {groupTab==='archived' ? (
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px' }}>
        {archivedGroups.map((g)=>(
          <div key={g.id} style={{ background:'var(--cfbfbfc)', border:'1px solid var(--ce6e8ee)', borderRadius:'14px', padding:'20px 22px', display:'flex', flexDirection:'column', gap:'12px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}><span style={{ font:'600 15px/1.2 "IBM Plex Sans"', color:'var(--c5a6276)' }}>{g.name}</span><span style={{ display:'inline-block', padding:'3px 8px', borderRadius:'999px', font:'600 10px/1.3 "IBM Plex Mono",monospace', letterSpacing:'.05em', textTransform:'uppercase', color:'var(--c8a92a6)', background:'var(--ceef1f5)' }}>Archived</span></div>
            <div style={{ font:'400 12px/1.4 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)' }}>{g.kind} · {g.member_count} members · {g.policy_count} policies</div>
            <div style={{ display:'flex', gap:'9px', marginTop:'2px' }}>
              <button style={{ flex:1, border:'1px solid var(--ccdd5f0)', background:'var(--ceef1fb)', color:'var(--c213a9e)', borderRadius:'9px', padding:'9px', font:'600 12.5px/1 "IBM Plex Sans"', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'7px' }} onClick={()=>onRestore(g)}><Ico size={15} sw={2}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></Ico>Restore</button>
              <button title="Delete permanently" style={{ border:'1px solid var(--cf0d6dd)', background:'var(--surface)', color:'var(--cc0143c)', borderRadius:'9px', padding:'9px 12px', cursor:'pointer', display:'flex', alignItems:'center' }} onClick={()=>onDelete(g)}><Ico size={16} sw={1.9}><path d="M3 7h18M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 7l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7"/></Ico></button>
            </div>
          </div>
        ))}
        {!archivedGroups.length && <Empty msg="No archived groups." />}
      </div>
      ) : (
      <React.Fragment>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'16px', marginBottom:'18px', flexWrap:'wrap' }}>
        <div style={{ font:'400 13px/1.5 "IBM Plex Sans"', color:'var(--c7b8294)', maxWidth:'560px' }}>Platform roles and local groups grant access inside the portal. Create a local group, then map on-prem Active Directory or Entra ID security groups into any group — membership rolls up automatically.</div>
        <div style={{ display:'flex', gap:'10px', flex:'none' }}>
          <button style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c41485a)', borderRadius:'10px', padding:'11px 16px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={openAddGroup}>
            <Ico size={16} sw={2.2} d="M12 5v14M5 12h14" />Create group
          </button>
          <button style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'none', background:'var(--c213a9e)', color:'#fff', borderRadius:'10px', padding:'11px 18px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={()=>openImport(null)}>
            <Ico size={16}><path d="M12 3l8 4v5c0 4.5-3 7.5-8 9-5-1.5-8-4.5-8-9V7z"/><path d="M9 11l2 2 4-4"/></Ico>Import from Active Directory
          </button>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px' }}>
        {platformCards.map((g)=>(
          <div key={g.id} style={{ background:'var(--surface)', border:'1px solid '+(g.isAdmin?'var(--ccdd5f0)':'var(--ce6e8ee)'), borderRadius:'14px', padding:'20px 22px', display:'flex', flexDirection:'column', gap:'14px' }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:'12px' }}>
              <div style={{ width:'40px', height:'40px', flex:'none', borderRadius:'10px', background:'#213a9e0f', color:'var(--c213a9e)', display:'flex', alignItems:'center', justifyContent:'center' }}><Ico size={21} sw={1.9}><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4M3 17l9 4 9-4"/></Ico></div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px' }}><span style={{ font:'600 16px/1.2 "IBM Plex Sans"', color:'var(--c161a26)' }}>{g.name}</span>{g.isAdmin ? <span style={{ display:'inline-block', padding:'3px 8px', borderRadius:'999px', font:'600 10px/1.3 "IBM Plex Mono",monospace', letterSpacing:'.05em', textTransform:'uppercase', color:'var(--cc0143c)', background:'var(--cfbe7ec)' }}>Admin role</span> : <span style={{ display:'inline-block', padding:'3px 8px', borderRadius:'999px', font:'600 10px/1.3 "IBM Plex Mono",monospace', letterSpacing:'.05em', textTransform:'uppercase', color: g.kind==='Local'?'var(--c1f7a5c)':'var(--c213a9e)', background: g.kind==='Local'?'var(--ce6f3ec)':'var(--ceef1fb)' }}>{g.kind==='Local'?'Local group':'Platform role'}</span>}</div>
                <div style={{ font:'400 12.5px/1.5 "IBM Plex Sans"', color:'var(--c7b8294)', marginTop:'5px' }}>{g.desc}</div>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'7px', font:'500 12px/1 "IBM Plex Mono",monospace', color:'var(--c8a92a6)' }}>
              <span style={{ display:'inline-flex', alignItems:'center', gap:'7px' }}><Ico size={14}><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 2.7-5 6-5s6 2 6 5"/></Ico>{g.memberCount} effective members</span>
              <button onClick={()=>onMembers(g)} style={{ border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c213a9e)', borderRadius:'8px', padding:'6px 11px', font:'600 11.5px/1 "IBM Plex Sans"', cursor:'pointer' }}>Manage members</button>
            </div>
            <div style={{ borderTop:'1px solid var(--cf0f1f6)', paddingTop:'13px', marginTop:'2px' }}>
              <div style={{ font:'600 10.5px/1 "IBM Plex Mono",monospace', letterSpacing:'.08em', textTransform:'uppercase', color:'var(--c9aa1b2)', marginBottom:'10px' }}>Mapped directory groups</div>
              {g.isEmpty && <div style={{ font:'400 12.5px/1.5 "IBM Plex Sans"', color:'var(--caab0c0)', padding:'6px 0 10px' }}>No directory groups mapped yet.</div>}
              <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                {g.mapped.map((m)=>(
                  <div key={m.id} style={{ display:'flex', alignItems:'center', gap:'10px', background:'var(--cf7f8fb)', border:'1px solid var(--ceceef4)', borderRadius:'9px', padding:'8px 10px 8px 12px' }}>
                    <span style={{ flex:1, minWidth:0, font:'600 12.5px/1.2 "IBM Plex Sans"', color:'var(--c2a3142)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.name}</span>
                    <span style={sourceStyle(m.source)}>{m.source}</span>
                    <span style={{ font:'400 11px/1 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)' }}>{m.members}</span>
                    <button style={{ border:'none', background:'transparent', cursor:'pointer', color:'var(--caab0c0)', display:'flex', padding:'2px' }} onClick={()=>removeMapping(m.id, g.id)}><Ico size={15} sw={2.2} d="M6 6l12 12M18 6L6 18" /></button>
                  </div>
                ))}
              </div>
              <button style={{ marginTop:'12px', width:'100%', border:'1px dashed var(--cc9cfdd)', background:'var(--surface)', color:'var(--c213a9e)', borderRadius:'9px', padding:'9px', font:'600 12.5px/1 "IBM Plex Sans"', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'7px' }} onClick={()=>openImport(g.id)}>
                <Ico size={14} sw={2.2} d="M12 5v14M5 12h14" />Map directory group
              </button>
            </div>
            <div style={{ borderTop:'1px solid var(--cf0f1f6)', paddingTop:'12px', display:'flex', justifyContent:'flex-end', gap:'8px' }}>
              {!g.isAdmin && <button title="Archive group" style={{ border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c9a6712)', borderRadius:'8px', padding:'7px 12px', font:'600 11.5px/1 "IBM Plex Sans"', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'6px' }} onClick={()=>onArchive(g)}><Ico size={14} sw={1.9}><path d="M3 7h18M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 7l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7"/></Ico>Archive</button>}
            </div>
          </div>
        ))}
        {!platformCards.length && <Empty msg="No platform groups yet." />}
      </div>
      </React.Fragment>
      )}
    </div>
  );
}
