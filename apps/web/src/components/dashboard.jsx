import * as React from 'react';
/* Extracted from app.jsx — presentational components (dashboard). */
import { Ico, seg, typePill, pctColor, initials } from '../ui.jsx';
import { Empty } from './common.jsx';

export function Dashboard({ kpis, polRows, recent, attention, deptRows, groupRows, dashLayout, setDashLayout, onGroup, onExport, exporting, exportScope, setExportScope, onReminders, sendingReminders }) {
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', font:'500 13px/1 "IBM Plex Mono",monospace', color:'var(--c8a92a6)' }}><span style={{ width:'8px', height:'8px', borderRadius:'50%', background:'var(--c1f7a5c)' }}></span>Live data</div>
        <div style={{ display:'flex', alignItems:'center', gap:'14px' }}>
          <button onClick={onReminders} disabled={sendingReminders} title="Send acknowledgement reminder emails now" style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c41485a)', borderRadius:'10px', padding:'10px 14px', font:'600 12.5px/1 "IBM Plex Sans"', cursor:sendingReminders?'not-allowed':'pointer' }}>
            <Ico size={15} sw={1.9}><path d="M4 4h16v12H5.2L4 17.2z"/><path d="M8 9h8M8 12h5"/></Ico>{sendingReminders?'Sending…':'Send reminders'}
          </button>
          <div style={{ display:'flex', alignItems:'center', gap:'7px' }}>
            <select value={exportScope} onChange={(e)=>setExportScope(e.target.value)} style={{ border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c41485a)', borderRadius:'10px', padding:'9px 11px', font:'500 12.5px/1 "IBM Plex Sans"', cursor:'pointer', maxWidth:'190px' }}>
              <option value="all">All employees</option>
              <optgroup label="By unit">
                {deptRows.map((d)=>(<option key={'d'+d.role} value={'dept:'+d.role}>{d.role}</option>))}
              </optgroup>
              <optgroup label="By group">
                {groupRows.map((g)=>(<option key={'g'+g.id} value={'group:'+g.id}>{g.name}</option>))}
              </optgroup>
            </select>
            <button onClick={onExport} disabled={exporting} style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'none', background:'var(--c213a9e)', color:'#fff', borderRadius:'10px', padding:'10px 15px', font:'600 12.5px/1 "IBM Plex Sans"', cursor:exporting?'not-allowed':'pointer' }}>
              <Ico size={15} sw={2}><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></Ico>{exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <span style={{ font:'500 12px/1 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)' }}>LAYOUT</span>
            <div style={{ display:'flex', background:'var(--ceef0f4)', borderRadius:'10px', padding:'4px', width:'230px' }}>
              <button style={seg(dashLayout==='A')} onClick={()=>setDashLayout('A')}>Overview</button>
              <button style={seg(dashLayout==='B')} onClick={()=>setDashLayout('B')}>By unit</button>
              <button style={seg(dashLayout==='C')} onClick={()=>setDashLayout('C')}>By group</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'16px', marginBottom:'18px' }}>
        {kpis.map((k,i)=>(
          <div key={i} style={{ background:'var(--surface)', border:'1px solid var(--ce6e8ee)', borderRadius:'14px', padding:'18px 20px', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', left:0, top:0, bottom:0, width:'4px', background:k.accent }}></div>
            <div style={{ font:'500 12.5px/1.3 "IBM Plex Sans"', color:'var(--c7b8294)' }}>{k.label}</div>
            <div style={{ font:'600 32px/1.1 "IBM Plex Sans"', color:'var(--c161a26)', margin:'8px 0 4px', letterSpacing:'-.02em' }}>{k.value}</div>
            <div style={{ font:'400 12px/1.3 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {dashLayout==='A' ? (
        <div style={{ display:'grid', gridTemplateColumns:'1.7fr 1fr', gap:'18px', alignItems:'start' }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--ce6e8ee)', borderRadius:'14px', padding:'6px 4px 8px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px 12px' }}>
              <div style={{ font:'600 15px/1 "IBM Plex Sans"', color:'var(--c161a26)' }}>Compliance by policy</div>
              <div style={{ font:'500 12px/1 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)' }}>SIGNED / ASSIGNED</div>
            </div>
            {polRows.map((r)=>(
              <div key={r.id} style={{ display:'flex', alignItems:'center', gap:'14px', padding:'11px 18px', borderTop:'1px solid var(--cf0f1f6)' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'9px', marginBottom:'7px' }}><span style={typePill(r.type)}>{r.type}</span><span style={{ font:'600 13.5px/1.2 "IBM Plex Sans"', color:'var(--c23283a)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.name}</span>{r.unassigned && <span title="Assigned to no group — assign it to a group to track completion" style={{ font:'500 11px/1 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)', border:'1px solid var(--ceef1f5)', borderRadius:'6px', padding:'3px 6px', flex:'none' }}>not assigned</span>}</div>
                  <div style={{ height:'8px', background:'var(--ceef1f5)', borderRadius:'5px', overflow:'hidden' }}><div style={{ height:'100%', borderRadius:'5px', width:(r.unassigned?0:r.pct)+'%', background:pctColor(r.pct), transition:'width .4s' }}></div></div>
                </div>
                <div style={{ width:'46px', textAlign:'right', font:'600 15px/1 "IBM Plex Sans"', color:r.unassigned?'var(--c9aa1b2)':pctColor(r.pct) }} title={r.unassigned?'Not assigned to any group':undefined}>{r.unassigned?'—':r.pct+'%'}</div>
                <div style={{ width:'54px', textAlign:'right', font:'400 12.5px/1 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)' }}>{r.signed}/{r.assigned}</div>
              </div>
            ))}
            {!polRows.length && <Empty msg="No policies yet." />}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'18px' }}>
            <div style={{ background:'var(--surface)', border:'1px solid var(--ce6e8ee)', borderRadius:'14px', padding:'18px' }}>
              <div style={{ font:'600 15px/1 "IBM Plex Sans"', color:'var(--c161a26)', marginBottom:'14px' }}>Recent signatures</div>
              {recent.map((s,i)=>(
                <div key={i} style={{ display:'flex', alignItems:'center', gap:'11px', padding:'9px 0', borderTop:'1px solid var(--cf3f4f8)' }}>
                  <div style={{ width:'32px', height:'32px', flex:'none', borderRadius:'50%', background:'var(--ceef1fb)', color:'var(--c213a9e)', display:'flex', alignItems:'center', justifyContent:'center', font:'600 11.5px/1 "IBM Plex Sans"' }}>{s.initials}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ font:'600 13px/1.2 "IBM Plex Sans"', color:'var(--c23283a)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.name}</div>
                    <div style={{ font:'400 11.5px/1.3 "IBM Plex Sans"', color:'var(--c8a92a6)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.policy} · {s.version}</div>
                  </div>
                  <div style={{ font:'400 11px/1 "IBM Plex Mono",monospace', color:'var(--caab0c0)', whiteSpace:'nowrap' }}>{s.date}</div>
                </div>
              ))}
              {!recent.length && <Empty msg="No signatures yet." />}
            </div>
            <div style={{ background:'var(--surface)', border:'1px solid var(--ce6e8ee)', borderRadius:'14px', padding:'18px' }}>
              <div style={{ font:'600 15px/1 "IBM Plex Sans"', color:'var(--c161a26)', marginBottom:'6px' }}>Needs attention</div>
              <div style={{ font:'400 12px/1.3 "IBM Plex Sans"', color:'var(--c8a92a6)', marginBottom:'12px' }}>Lowest acknowledgement rates</div>
              {attention.map((a)=>(
                <div key={a.id} style={{ display:'flex', alignItems:'center', gap:'11px', padding:'9px 0', borderTop:'1px solid var(--cf3f4f8)' }}>
                  <span style={{ width:'8px', height:'8px', borderRadius:'50%', flex:'none', background:pctColor(a.pct) }}></span>
                  <div style={{ flex:1, minWidth:0, font:'500 13px/1.3 "IBM Plex Sans"', color:'var(--c23283a)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.name}</div>
                  <div style={{ font:'600 13.5px/1 "IBM Plex Sans"', color:pctColor(a.pct) }}>{a.pct}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : dashLayout==='B' ? (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'18px', alignItems:'start' }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--ce6e8ee)', borderRadius:'14px', padding:'18px' }}>
            <div style={{ font:'600 15px/1 "IBM Plex Sans"', color:'var(--c161a26)', marginBottom:'4px' }}>Compliance by department</div>
            <div style={{ font:'400 12px/1.3 "IBM Plex Sans"', color:'var(--c8a92a6)', marginBottom:'16px' }}>Acknowledgement rate per organisational unit</div>
            {deptRows.map((d,i)=>(
              <div key={i} style={{ padding:'10px 0', borderTop:'1px solid var(--cf3f4f8)' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
                  <div style={{ font:'600 13.5px/1 "IBM Plex Sans"', color:'var(--c23283a)' }}>{d.role} <span style={{ font:'400 11.5px/1 "IBM Plex Mono",monospace', color:'var(--caab0c0)' }}>· {d.count} people</span></div>
                  <div style={{ font:'600 14px/1 "IBM Plex Sans"', color:pctColor(d.pct) }}>{d.pct}%</div>
                </div>
                <div style={{ height:'9px', background:'var(--ceef1f5)', borderRadius:'5px', overflow:'hidden' }}><div style={{ height:'100%', borderRadius:'5px', width:d.pct+'%', background:pctColor(d.pct), transition:'width .4s' }}></div></div>
              </div>
            ))}
            {!deptRows.length && <Empty msg="No department data yet." />}
          </div>
          <div style={{ background:'var(--surface)', border:'1px solid var(--ce6e8ee)', borderRadius:'14px', padding:'18px' }}>
            <div style={{ font:'600 15px/1 "IBM Plex Sans"', color:'var(--c161a26)', marginBottom:'4px' }}>Compliance by policy</div>
            <div style={{ font:'400 12px/1.3 "IBM Plex Sans"', color:'var(--c8a92a6)', marginBottom:'16px' }}>Ranked by acknowledgement rate</div>
            {polRows.slice().sort((a,b)=>a.pct-b.pct).map((r)=>(
              <div key={r.id} style={{ padding:'9px 0', borderTop:'1px solid var(--cf3f4f8)', display:'flex', alignItems:'center', gap:'12px' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ font:'500 13px/1.3 "IBM Plex Sans"', color:'var(--c23283a)', marginBottom:'7px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.name}{r.unassigned && <span style={{ font:'500 10.5px/1 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)', marginLeft:'8px' }}>· not assigned</span>}</div>
                  <div style={{ height:'7px', background:'var(--ceef1f5)', borderRadius:'4px', overflow:'hidden' }}><div style={{ height:'100%', borderRadius:'4px', width:(r.unassigned?0:r.pct)+'%', background:pctColor(r.pct), transition:'width .4s' }}></div></div>
                </div>
                <div style={{ width:'42px', textAlign:'right', font:'600 13.5px/1 "IBM Plex Sans"', color:r.unassigned?'var(--c9aa1b2)':pctColor(r.pct) }} title={r.unassigned?'Not assigned to any group':undefined}>{r.unassigned?'—':r.pct+'%'}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ background:'var(--surface)', border:'1px solid var(--ce6e8ee)', borderRadius:'14px', padding:'6px 4px 8px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px 12px' }}>
            <div><div style={{ font:'600 15px/1 "IBM Plex Sans"', color:'var(--c161a26)' }}>Compliance by group</div><div style={{ font:'400 12px/1.3 "IBM Plex Sans"', color:'var(--c8a92a6)', marginTop:'4px' }}>Members × assigned policies · click a group to see who's signed</div></div>
            <div style={{ font:'500 12px/1 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)' }}>SIGNED / REQUIRED</div>
          </div>
          {groupRows.map((g)=>(
            <div key={g.id} onClick={()=>onGroup(g.raw)} style={{ display:'flex', alignItems:'center', gap:'14px', padding:'12px 18px', borderTop:'1px solid var(--cf0f1f6)', cursor:'pointer' }} onMouseEnter={(e)=>{e.currentTarget.style.background='var(--cf8f9fc)';}} onMouseLeave={(e)=>{e.currentTarget.style.background='transparent';}}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'9px', marginBottom:'7px' }}>
                  <span style={{ font:'600 13.5px/1.2 "IBM Plex Sans"', color:'var(--c23283a)' }}>{g.name}</span>
                  <span style={{ display:'inline-block', padding:'2px 7px', borderRadius:'999px', font:'600 9.5px/1.3 "IBM Plex Mono",monospace', letterSpacing:'.04em', textTransform:'uppercase', color: g.kind==='Local'?'var(--c1f7a5c)':'var(--c213a9e)', background: g.kind==='Local'?'var(--ce6f3ec)':'var(--ceef1fb)' }}>{g.kind}</span>
                  <span style={{ font:'400 11px/1 "IBM Plex Mono",monospace', color:'var(--caab0c0)' }}>{g.members} members · {g.policies} policies</span>
                </div>
                <div style={{ height:'8px', background:'var(--ceef1f5)', borderRadius:'5px', overflow:'hidden' }}><div style={{ height:'100%', borderRadius:'5px', width:g.pct+'%', background:pctColor(g.pct), transition:'width .4s' }}></div></div>
              </div>
              <div style={{ width:'46px', textAlign:'right', font:'600 15px/1 "IBM Plex Sans"', color:pctColor(g.pct) }}>{g.pct}%</div>
              <div style={{ width:'54px', textAlign:'right', font:'400 12.5px/1 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)' }}>{g.signed}/{g.assigned}</div>
              <Ico size={17} d="M9 6l6 6-6 6" />
            </div>
          ))}
          {!groupRows.length && <Empty msg="No platform or local groups yet." />}
        </div>
      )}
    </div>
  );
}

export function ManagerDashboard({ data, onReminders, reminding }) {
  if (!data) return <div style={{ padding:'60px', textAlign:'center' }}><span style={{ width:'28px', height:'28px', border:'3px solid var(--cd2d7e3)', borderTopColor:'var(--c213a9e)', borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite' }}></span></div>;
  const s = data.summary || { people:0, compliant:0, pct:0, assigned:0, signed:0 };
  const pctColor = (p) => p>=80?'var(--c1f8a5b)':p>=50?'var(--ccaa53d)':'var(--cc0143c)';
  const kpis = [
    { label:'Team members', value:s.people },
    { label:'Fully compliant', value:s.compliant + ' / ' + s.people },
    { label:'Overall completion', value:s.pct + '%', color:pctColor(s.pct) },
    { label:'Open items', value:(s.assigned - s.signed) },
  ];
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px', flexWrap:'wrap', gap:'12px' }}>
        <div style={{ font:'400 13px/1.5 "IBM Plex Sans"', color:'var(--c7b8294)', maxWidth:'520px' }}>Compliance for the people who report to you — across policies, procedures and trainings.</div>
        <button onClick={onReminders} disabled={reminding} style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'none', background:'var(--c213a9e)', color:'#fff', borderRadius:'10px', padding:'11px 16px', font:'600 12.5px/1 "IBM Plex Sans"', cursor:reminding?'not-allowed':'pointer' }}>
          <Ico size={15} sw={1.9}><path d="M4 4h16v12H5.2L4 17.2z"/><path d="M8 9h8M8 12h5"/></Ico>{reminding?'Sending…':'Remind my team'}
        </button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'16px', marginBottom:'22px' }}>
        {kpis.map((k,i)=>(
          <div key={i} style={{ background:'var(--surface)', border:'1px solid var(--ce6e8ee)', borderRadius:'14px', padding:'18px 20px' }}>
            <div style={{ font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.06em', textTransform:'uppercase', color:'var(--c9aa1b2)', marginBottom:'10px' }}>{k.label}</div>
            <div style={{ font:'700 26px/1 "IBM Plex Sans"', color:k.color||'var(--c161a26)' }}>{k.value}</div>
          </div>
        ))}
      </div>
      {!data.team.length && <Empty msg="No team members found yet. Your reports appear here once they have you set as their functional or directory manager (run a directory sync first)." />}
      {!!data.team.length && (
        <div style={{ display:'grid', gridTemplateColumns:'1.3fr 1fr', gap:'18px', alignItems:'start' }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--ce6e8ee)', borderRadius:'14px', overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--ceceef4)', font:'600 14px/1 "IBM Plex Sans"', color:'var(--c161a26)' }}>My team</div>
            {data.team.map((m)=>(
              <div key={m.oid} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 20px', borderBottom:'1px solid var(--cf3f4f8)' }}>
                <div style={{ width:'34px', height:'34px', flex:'none', borderRadius:'50%', background:'var(--ceef1fb)', color:'var(--c213a9e)', display:'flex', alignItems:'center', justifyContent:'center', font:'600 12px/1 "IBM Plex Sans"' }}>{initials(m.name)}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ font:'600 13.5px/1.2 "IBM Plex Sans"', color:'var(--c23283a)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.name}</div>
                  <div style={{ font:'400 11.5px/1.3 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)' }}>{m.department||'—'}</div>
                </div>
                <div style={{ width:'90px', height:'7px', background:'var(--ceef1f5)', borderRadius:'5px', overflow:'hidden', flex:'none' }}><div style={{ height:'100%', width:m.pct+'%', background:pctColor(m.pct) }}></div></div>
                <div style={{ width:'58px', textAlign:'right', font:'600 13px/1 "IBM Plex Sans"', color:pctColor(m.pct) }}>{m.pct}%</div>
                <div style={{ width:'48px', textAlign:'right', font:'400 11.5px/1 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)' }}>{m.signed}/{m.required}</div>
              </div>
            ))}
          </div>
          <div style={{ background:'var(--surface)', border:'1px solid var(--ce6e8ee)', borderRadius:'14px', overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--ceceef4)', font:'600 14px/1 "IBM Plex Sans"', color:'var(--c161a26)' }}>By document</div>
            {(data.items||[]).map((it)=>{ const pct = it.assigned?Math.round(it.signed/it.assigned*100):0; return (
              <div key={it.id} style={{ padding:'12px 20px', borderBottom:'1px solid var(--cf3f4f8)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'9px', marginBottom:'7px' }}>
                  <span style={{ font:'600 12.5px/1.3 "IBM Plex Sans"', color:'var(--c23283a)', flex:1, minWidth:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{it.name}</span>
                  <span style={{ font:'600 9.5px/1.3 "IBM Plex Mono",monospace', letterSpacing:'.04em', textTransform:'uppercase', color: it.docType==='Training'?'var(--c6d4bd1)':'var(--c213a9e)', background: it.docType==='Training'?'var(--cf6f3fd)':'var(--ceef1fb)', padding:'2px 7px', borderRadius:'999px' }}>{it.docType}</span>
                  <span style={{ font:'600 12px/1 "IBM Plex Sans"', color:pctColor(pct) }}>{pct}%</span>
                </div>
                <div style={{ height:'6px', background:'var(--ceef1f5)', borderRadius:'4px', overflow:'hidden' }}><div style={{ height:'100%', width:pct+'%', background:pctColor(pct) }}></div></div>
              </div>
            ); })}
            {!(data.items||[]).length && <Empty msg="No assigned documents." />}
          </div>
        </div>
      )}
    </div>
  );
}
