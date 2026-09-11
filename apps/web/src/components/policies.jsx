/* Extracted from app.jsx — presentational components (policies). */
import * as React from 'react';
import { api } from '../api.js';
import { Ico, seg, tabStyle, typePill, statusPill, pctColor, fmtDate, fmtDT } from '../ui.jsx';
import { StatCard, Empty } from './common.jsx';
import { QuizTake } from './quiz.jsx';
import { ApprovalBadge } from './approvals.jsx';

export function PolicyLibrary({ typeTabs, setActiveType, polCards, polTab, switchPolTab, archivedCards, openAddPolicy, openEdit, openReader, onArchive, onRestore, onQuiz, onHistory, onRevisions, onApprovals }) {
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'18px' }}>
        <div style={{ display:'flex', background:'var(--ceef0f4)', borderRadius:'11px', padding:'4px', width:'260px' }}>
          <button style={seg(polTab==='active')} onClick={()=>switchPolTab('active')}>Active</button>
          <button style={seg(polTab==='archived')} onClick={()=>switchPolTab('archived')}>Archived</button>
        </div>
      </div>

      {polTab==='active' ? (
      <React.Fragment>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'16px', marginBottom:'18px', flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:'9px', flexWrap:'wrap' }}>
          {typeTabs.map((t)=>(<button key={t.t} style={tabStyle(t.on)} onClick={()=>setActiveType(t.t)}>{t.t} <span style={{ opacity:.6, fontWeight:500 }}>{t.count}</span></button>))}
        </div>
        <button style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'none', background:'var(--c213a9e)', color:'#fff', borderRadius:'10px', padding:'11px 18px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={openAddPolicy}>
          <Ico size={16} sw={2.2} d="M12 5v14M5 12h14" />Add policy
        </button>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
        {polCards.map((p)=>(
          <div key={p.id} style={{ background:'var(--surface)', border:'1px solid var(--ce6e8ee)', borderRadius:'14px', padding:'20px 22px', display:'flex', gap:'24px', alignItems:'center' }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:'11px', marginBottom:'9px' }}>
                <span style={typePill(p.type)}>{p.type}</span>
                <span style={{ font:'500 11px/1 "IBM Plex Mono",monospace', color:'var(--c8a92a6)', background:'var(--cf3f4f8)', padding:'4px 8px', borderRadius:'6px' }}>{p.version}</span>
                {p.approval_state && p.approval_state!=='published' && <ApprovalBadge state={p.approval_state} />}
              </div>
              <div style={{ font:'600 16.5px/1.25 "IBM Plex Sans"', color:'var(--c161a26)', marginBottom:'8px' }}>{p.name}</div>
              <div style={{ display:'flex', alignItems:'center', gap:'16px', flexWrap:'wrap', font:'400 12.5px/1.4 "IBM Plex Sans"', color:'var(--c7b8294)' }}>
                {p.url && <a href={p.url} target="_blank" rel="noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:'6px', color:'var(--c0078c0)', textDecoration:'none', fontWeight:500 }}><Ico size={14}><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></Ico>SharePoint</a>}
                <span>Owner: {p.owner}</span>
                <span>Updated {p.updated}</span>
                <span>Assigned: {p.groupsText}</span>
                <span style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'3px 9px', borderRadius:'999px', font:'600 11px/1.3 "IBM Plex Mono",monospace', color: p.assigned>0?'var(--c1f7a5c)':'var(--c9a6712)', background: p.assigned>0?'var(--ce6f3ec)':'var(--cfbf2df)' }}>{p.assigned>0 ? ('applies to '+p.assigned+(p.assigned===1?' person':' people')) : 'reaches no one'}</span>
                {p.dueText && <span style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'3px 9px', borderRadius:'999px', font:'600 11px/1.3 "IBM Plex Mono",monospace', color: (p.due&&p.due.overdue)?'var(--cc0143c)':(p.due&&p.due.soon)?'var(--c9a6712)':'var(--c54607a)', background: (p.due&&p.due.overdue)?'var(--cfbe7ec)':(p.due&&p.due.soon)?'var(--cfbf2df)':'var(--ceef1f5)' }}>{p.dueText}</span>}
              </div>
            </div>
            <div style={{ width:'160px', flex:'none' }}>
              <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:'7px' }}><span style={{ font:'600 18px/1 "IBM Plex Sans"', color:pctColor(p.pct) }}>{p.pct}%</span><span style={{ font:'400 12px/1 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)' }}>{p.signed}/{p.assigned}</span></div>
              <div style={{ height:'7px', background:'var(--ceef1f5)', borderRadius:'4px', overflow:'hidden' }}><div style={{ height:'100%', borderRadius:'4px', width:p.pct+'%', background:pctColor(p.pct), transition:'width .4s' }}></div></div>
            </div>
            <div style={{ display:'flex', gap:'9px', flex:'none' }}>
              <button style={{ border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c41485a)', borderRadius:'9px', padding:'9px 14px', font:'600 13px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={()=>openReader(p.raw)}>Preview</button>
              <button style={{ border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c213a9e)', borderRadius:'9px', padding:'9px 14px', font:'600 13px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={()=>openEdit(p)}>Edit</button>
              <button title="Knowledge check" style={{ border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c6d4bd1)', borderRadius:'9px', padding:'9px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:'6px', font:'600 13px/1 "IBM Plex Sans"' }} onClick={()=>onQuiz(p)}><Ico size={15} sw={1.9}><path d="M9.1 9a3 3 0 1 1 4 2.8c-.8.3-1.1.9-1.1 1.7v.5"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/></Ico>Quiz</button>
              <button title="Approval workflow" style={{ border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c213a9e)', borderRadius:'9px', padding:'9px 11px', cursor:'pointer', display:'flex', alignItems:'center' }} onClick={()=>onApprovals(p)}><Ico size={16} sw={1.9}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></Ico></button>
              <button title="Version history" style={{ border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c54607a)', borderRadius:'9px', padding:'9px 11px', cursor:'pointer', display:'flex', alignItems:'center' }} onClick={()=>onHistory(p)}><Ico size={16} sw={1.9}><path d="M3 3v5h5"/><path d="M3 8a9 9 0 1 0 2.5-5.3L3 8"/><path d="M12 8v5l3 2"/></Ico></button>
              <button title="Content revisions" style={{ border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c54607a)', borderRadius:'9px', padding:'9px 11px', cursor:'pointer', display:'flex', alignItems:'center' }} onClick={()=>onRevisions(p)}><Ico size={16} sw={1.9}><path d="M12 2l7 4v6c0 4.5-3 7.3-7 8-4-.7-7-3.5-7-8V6z"/><path d="M9 12l2 2 4-4"/></Ico></button>
              <button title="Archive" style={{ border:'1px solid var(--cf0d6dd)', background:'var(--surface)', color:'var(--cc0143c)', borderRadius:'9px', padding:'9px 11px', cursor:'pointer', display:'flex', alignItems:'center' }} onClick={()=>onArchive(p)}><Ico size={16} sw={1.9}><path d="M3 7h18M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 7l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7"/></Ico></button>
            </div>
          </div>
        ))}
        {!polCards.length && <Empty msg="No policies in this view. Click “Add policy” to create one." />}
      </div>
      </React.Fragment>
      ) : (
      <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
        {archivedCards.map((p)=>(
          <div key={p.id} style={{ background:'var(--cfbfbfc)', border:'1px solid var(--ce6e8ee)', borderRadius:'14px', padding:'18px 22px', display:'flex', gap:'24px', alignItems:'center' }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:'11px', marginBottom:'8px' }}>
                <span style={typePill(p.type)}>{p.type}</span>
                <span style={{ font:'500 11px/1 "IBM Plex Mono",monospace', color:'var(--c8a92a6)', background:'var(--cf3f4f8)', padding:'4px 8px', borderRadius:'6px' }}>{p.version}</span>
                <span style={{ display:'inline-block', padding:'4px 9px', borderRadius:'999px', font:'600 10.5px/1.3 "IBM Plex Mono",monospace', letterSpacing:'.05em', textTransform:'uppercase', color:'var(--c8a92a6)', background:'var(--ceef1f5)' }}>Archived</span>
              </div>
              <div style={{ font:'600 16px/1.25 "IBM Plex Sans"', color:'var(--c5a6276)', marginBottom:'6px' }}>{p.name}</div>
              <div style={{ font:'400 12.5px/1.4 "IBM Plex Sans"', color:'var(--c9aa1b2)' }}>Owner: {p.owner} · Archived {p.archivedOn}</div>
            </div>
            <button style={{ border:'1px solid var(--ccdd5f0)', background:'var(--ceef1fb)', color:'var(--c213a9e)', borderRadius:'9px', padding:'9px 16px', font:'600 13px/1 "IBM Plex Sans"', cursor:'pointer', flex:'none', display:'inline-flex', alignItems:'center', gap:'7px' }} onClick={()=>onRestore(p)}><Ico size={15} sw={2}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></Ico>Restore</button>
          </div>
        ))}
        {!archivedCards.length && <Empty msg="No archived policies." />}
      </div>
      )}
    </div>
  );
}

export function MyPolicies({ myTypeTabs, activeType, setActiveType, myList, myPending, mySignedN, openReader }) {
  return (
    <div>
      <div style={{ display:'flex', gap:'14px', marginBottom:'20px' }}>
        <StatCard color="var(--c9a6712)" value={myPending} label="Awaiting your signature" icon={<Ico size={22}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Ico>} />
        <StatCard color="var(--c1f7a5c)" value={mySignedN} label="Signed and up to date" icon={<Ico size={22} d="M20 6L9 17l-5-5" />} />
      </div>
      <div style={{ display:'flex', gap:'9px', flexWrap:'wrap', marginBottom:'18px' }}>
        {myTypeTabs.map((t)=>(<button key={t} style={tabStyle(activeType===t)} onClick={()=>setActiveType(t)}>{t}</button>))}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
        {myList.map((p)=>(
          <div key={p.id} style={{ background:'var(--surface)', border:'1px solid var(--ce6e8ee)', borderRadius:'14px', padding:'20px 22px', display:'flex', gap:'22px', alignItems:'center' }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:'11px', marginBottom:'9px' }}>
                <span style={typePill(p.type)}>{p.type}</span>
                <span style={{ font:'500 11px/1 "IBM Plex Mono",monospace', color:'var(--c8a92a6)', background:'var(--cf3f4f8)', padding:'4px 8px', borderRadius:'6px' }}>{p.version}</span>
                <span style={statusPill(p.status)}>{p.label}</span>
                {p.hasQuiz && <span style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'4px 9px', borderRadius:'999px', font:'600 10.5px/1.3 "IBM Plex Mono",monospace', letterSpacing:'.04em', textTransform:'uppercase', color: p.quizPassed?'var(--c1f7a5c)':'var(--c6d4bd1)', background: p.quizPassed?'var(--ce6f3ec)':'var(--cf6f3fd)' }}>{p.quizPassed ? ('Quiz '+(p.quizBest!=null?p.quizBest+'%':'passed')) : 'Quiz required'}</span>}
              </div>
              <div style={{ font:'600 16.5px/1.25 "IBM Plex Sans"', color:'var(--c161a26)', marginBottom:'6px' }}>{p.name}</div>
              <div style={{ font:'400 13px/1.5 "IBM Plex Sans"', color:'var(--c7b8294)' }}>Owner: {p.owner} · Updated {p.updated}{p.due ? ' · ' : ''}{p.due && <span style={{ fontWeight:600, color: p.due.overdue?'var(--cc0143c)':p.due.soon?'var(--c9a6712)':'var(--c54607a)' }}>Due {p.due.text}{p.due.overdue?' (overdue)':''}</span>}</div>
              {p.signed && (
                <div style={{ display:'inline-flex', alignItems:'center', gap:'8px', marginTop:'12px', background:'var(--cf3f8f5)', border:'1px solid var(--cdcebe3)', borderRadius:'9px', padding:'8px 13px', font:'500 12.5px/1 "IBM Plex Sans"', color:'var(--c1f7a5c)' }}>
                  <Ico size={15} sw={2.4} d="M20 6L9 17l-5-5" />Signed by {p.signedLine}
                </div>
              )}
              {p.outdatedNote && <div style={{ marginTop:'10px', font:'500 12px/1.3 "IBM Plex Mono",monospace', color:'var(--cc0143c)' }}>{p.outdatedNote}</div>}
            </div>
            <div style={{ flex:'none' }}>
              <button style={{ border:'none', borderRadius:'10px', padding:'13px 22px', font:'600 14px/1 "IBM Plex Sans"', cursor:'pointer', color:'#fff', background:'var(--c213a9e)' }} onClick={()=>openReader(p.raw)}>{p.cta}</button>
            </div>
          </div>
        ))}
        {!myList.length && <Empty msg="Nothing to acknowledge right now." />}
      </div>
    </div>
  );
}

export function Reader({ reader, onClose, signFirst, signLast, signAgreed, setSignFirst, setSignLast, setSignAgreed, submitSign, quizState, setQuizAnswer, submitQuizAttempt, retryQuiz }) {
  const p = reader.policy; const doc = reader.doc;
  const version = (doc && doc.version) || p.version;
  const url = (doc && doc.webUrl) || p.sharepoint_url;
  const needsQuiz = !!(quizState && !quizState.passed && (quizState.questions || []).length);
  const enable = signAgreed && signFirst.trim() && signLast.trim() && !needsQuiz;
  const [big, setBig] = React.useState(false);
  const stop = (e) => e.stopPropagation();
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(20,26,48,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:'36px', zIndex:50, animation:'ovIn .18s ease' }} onClick={onClose}>
      <div style={{ width:'920px', maxWidth:'100%', maxHeight:'90vh', background:'var(--surface)', borderRadius:'16px', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 24px 60px rgba(10,16,40,.34)', animation:'cardUp .22s ease' }} onClick={stop}>
        <div style={{ flex:'none', padding:'22px 26px', borderBottom:'1px solid var(--ceceef4)', display:'flex', alignItems:'flex-start', gap:'16px' }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'11px', marginBottom:'10px' }}><span style={typePill(p.doc_type)}>{p.doc_type}</span><span style={{ font:'500 11px/1 "IBM Plex Mono",monospace', color:'var(--c8a92a6)', background:'var(--cf3f4f8)', padding:'4px 8px', borderRadius:'6px' }}>{version}</span></div>
            <div style={{ font:'600 21px/1.2 "IBM Plex Sans"', color:'var(--c161a26)' }}>{p.name}</div>
            <div style={{ font:'400 12.5px/1.3 "IBM Plex Sans"', color:'var(--c8a92a6)', marginTop:'6px' }}>Owner: {p.owner||'—'} · Updated {fmtDate(p.updated_at)}</div>
          </div>
          <button style={{ border:'none', background:'var(--cf3f4f8)', width:'36px', height:'36px', borderRadius:'9px', cursor:'pointer', color:'var(--c54607a)', display:'flex', alignItems:'center', justifyContent:'center', flex:'none' }} onClick={onClose}><Ico size={18} sw={2.2} d="M6 6l12 12M18 6L6 18" /></button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'26px 30px' }}>
          {doc && doc.training
            ? (doc.error
                ? <div style={{ marginBottom:'22px', font:'400 13px/1.5 "IBM Plex Sans"', color:'var(--cc0143c)' }}>Could not load the training file. Please try again.</div>
                : !doc.fileUrl
                  ? <div style={{ marginBottom:'22px', display:'flex', alignItems:'center', justifyContent:'center', height:'120px' }}><span style={{ width:'24px', height:'24px', border:'3px solid var(--cd2d7e3)', borderTopColor:'var(--c213a9e)', borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite' }}></span></div>
                  : <div style={{ marginBottom:'22px' }}>
                      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:'8px' }}>
                        <button onClick={()=>setBig(true)} style={{ display:'inline-flex', alignItems:'center', gap:'7px', border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c213a9e)', borderRadius:'8px', padding:'7px 13px', font:'600 12px/1 "IBM Plex Sans"', cursor:'pointer' }}><Ico size={14} sw={2}><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></Ico>Enlarge</button>
                      </div>
                      {(doc.mime||'').startsWith('video')
                        ? <video src={doc.fileUrl} controls style={{ width:'100%', maxHeight:'440px', borderRadius:'11px', background:'#000' }}></video>
                        : (doc.mime||'').startsWith('image')
                          ? <img src={doc.fileUrl} alt={doc.name} style={{ width:'100%', borderRadius:'11px', border:'1px solid var(--ce6e9f1)' }} />
                          : (doc.mime||'').includes('pdf')
                            ? <iframe src={doc.fileUrl} title="Training" style={{ width:'100%', height:'440px', border:'1px solid var(--ce6e9f1)', borderRadius:'11px' }}></iframe>
                            : <a href={doc.fileUrl} download={doc.name} style={{ display:'flex', alignItems:'center', gap:'13px', background:'var(--cf6f8fb)', border:'1px solid var(--ce6e9f1)', borderRadius:'11px', padding:'13px 16px', textDecoration:'none' }}><div style={{ width:'34px', height:'34px', borderRadius:'8px', background:'#213a9e12', color:'var(--c213a9e)', display:'flex', alignItems:'center', justifyContent:'center', flex:'none' }}><Ico size={18}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></Ico></div><div style={{ flex:1 }}><div style={{ font:'600 13px/1.2 "IBM Plex Sans"', color:'var(--c23283a)' }}>Download training material</div><div style={{ font:'400 11.5px/1.3 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)' }}>{doc.name}</div></div><Ico size={17}><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></Ico></a>}
                      <div style={{ marginTop:'10px', textAlign:'right' }}><a href={doc.fileUrl} download={doc.name} style={{ font:'600 12px/1 "IBM Plex Sans"', color:'var(--c213a9e)', textDecoration:'none' }}>Download a copy</a></div>
                    </div>)
            : <div style={{ marginBottom:'22px' }}>
                {doc && doc.previewUrl && (
                  doc.previewMime.includes('pdf')
                    ? <iframe src={doc.previewUrl} title={p.name} style={{ width:'100%', height:'440px', border:'1px solid var(--ce6e9f1)', borderRadius:'11px', marginBottom:'12px' }}></iframe>
                    : doc.previewMime.startsWith('image')
                      ? <img src={doc.previewUrl} alt={p.name} style={{ width:'100%', borderRadius:'11px', border:'1px solid var(--ce6e9f1)', marginBottom:'12px' }} />
                      : doc.previewMime.startsWith('video')
                        ? <video src={doc.previewUrl} controls style={{ width:'100%', maxHeight:'440px', borderRadius:'11px', background:'#000', marginBottom:'12px' }}></video>
                        : null
                )}
                {url
                  ? <a href={url} target="_blank" rel="noreferrer" style={{ display:'flex', alignItems:'center', gap:'13px', background:'var(--cf6f8fb)', border:'1px solid var(--ce6e9f1)', borderRadius:'11px', padding:'13px 16px', textDecoration:'none' }}>
                      <div style={{ width:'34px', height:'34px', borderRadius:'8px', background:'#0078c012', color:'var(--c0078c0)', display:'flex', alignItems:'center', justifyContent:'center', flex:'none' }}><Ico size={18}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></Ico></div>
                      <div style={{ flex:1, minWidth:0 }}><div style={{ font:'600 13px/1.2 "IBM Plex Sans"', color:'var(--c23283a)' }}>{doc && doc.previewUrl ? 'Open in SharePoint' : 'Open source document in SharePoint'}</div><div style={{ font:'400 11.5px/1.3 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{url}</div></div>
                      <Ico size={17}><path d="M7 17L17 7M9 7h8v8"/></Ico>
                    </a>
                  : !(doc && doc.previewUrl) && <div style={{ font:'400 13px/1.5 "IBM Plex Sans"', color:'var(--c8a92a6)' }}>No SharePoint link on file for this document.</div>}
              </div>}
          {!(doc && doc.training) && <div style={{ padding:'14px 16px', border:'1px dashed var(--cd2d7e3)', borderRadius:'10px', background:'repeating-linear-gradient(135deg,var(--cfafbfd),var(--cfafbfd) 9px,var(--cf3f5f9) 9px,var(--cf3f5f9) 18px)', font:'400 11.5px/1.5 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)', textAlign:'center' }}>The authoritative document is stored in SharePoint. Open it above, then acknowledge below. The version you sign is captured automatically ({version}).</div>}
          {quizState && <QuizTake quizState={quizState} alreadyPassed={quizState.passed && !quizState.result} bestPct={p.quiz_best_pct} onAnswer={setQuizAnswer} onSubmit={submitQuizAttempt} onRetry={retryQuiz} />}
        </div>
        <div style={{ flex:'none', borderTop:'1px solid var(--ceceef4)', background:'var(--cfafbfd)', padding:'20px 26px' }}>
          <label style={{ display:'flex', alignItems:'flex-start', gap:'11px', cursor:'pointer', marginBottom:'16px' }}>
            <input type="checkbox" checked={signAgreed} onChange={(e)=>setSignAgreed(e.target.checked)} style={{ width:'19px', height:'19px', marginTop:'1px', accentColor:'var(--c213a9e)', flex:'none', cursor:'pointer' }} />
            <span style={{ font:'500 13.5px/1.5 "IBM Plex Sans"', color:'var(--c2a3142)' }}>I have read and understood the {p.name} ({version})</span>
          </label>
          {needsQuiz && <div style={{ font:'500 12px/1.4 "IBM Plex Sans"', color:'var(--c9a6712)', marginBottom:'14px', marginTop:'-6px' }}>Pass the knowledge check above to enable signing.</div>}
          <div style={{ display:'flex', gap:'14px', alignItems:'flex-end', flexWrap:'wrap' }}>
            <div style={{ flex:1, minWidth:'130px' }}>
              <div style={{ font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.05em', color:'var(--c9aa1b2)', textTransform:'uppercase', marginBottom:'7px' }}>First name</div>
              <input value={signFirst} onChange={(e)=>setSignFirst(e.target.value)} placeholder="First name" style={{ width:'100%', border:'1px solid var(--cd8dce6)', borderRadius:'9px', padding:'11px 13px', font:'400 14px/1 "IBM Plex Sans"', color:'var(--c23283a)', outline:'none' }} />
            </div>
            <div style={{ flex:1, minWidth:'130px' }}>
              <div style={{ font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.05em', color:'var(--c9aa1b2)', textTransform:'uppercase', marginBottom:'7px' }}>Last name</div>
              <input value={signLast} onChange={(e)=>setSignLast(e.target.value)} placeholder="Last name" style={{ width:'100%', border:'1px solid var(--cd8dce6)', borderRadius:'9px', padding:'11px 13px', font:'400 14px/1 "IBM Plex Sans"', color:'var(--c23283a)', outline:'none' }} />
            </div>
            <button disabled={!enable} style={{ border:'none', borderRadius:'10px', padding:'13px 22px', font:'600 14px/1 "IBM Plex Sans"', cursor:enable?'pointer':'not-allowed', color:'#fff', background:enable?'var(--c213a9e)':'var(--cbcc3d6)' }} onClick={submitSign}>Sign &amp; acknowledge</button>
          </div>
          <div style={{ display:'flex', gap:'22px', marginTop:'14px', font:'400 11.5px/1.4 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)', flexWrap:'wrap' }}>
            <span>signing as: {(signFirst+' '+signLast).trim()||'—'}</span>
            <span>timestamp: {fmtDT(new Date())}</span>
            <span>version: {version}</span>
          </div>
        </div>
      </div>
      {big && doc && doc.training && doc.fileUrl && (
        <div style={{ position:'fixed', inset:0, background:'rgba(8,11,24,.92)', display:'flex', flexDirection:'column', zIndex:70, animation:'ovIn .18s ease' }} onClick={()=>setBig(false)}>
          <div style={{ flex:'none', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 22px' }}>
            <span style={{ font:'600 14px/1 "IBM Plex Sans"', color:'#fff' }}>{p.name}</span>
            <button onClick={()=>setBig(false)} style={{ border:'none', background:'rgba(255,255,255,.15)', color:'#fff', borderRadius:'9px', padding:'9px 15px', font:'600 13px/1 "IBM Plex Sans"', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'8px' }}><Ico size={15} sw={2.2} d="M6 6l12 12M18 6L6 18" />Close</button>
          </div>
          <div style={{ flex:1, minHeight:0, padding:'0 22px 22px', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={stop}>
            {(doc.mime||'').startsWith('video')
              ? <video src={doc.fileUrl} controls autoPlay style={{ maxWidth:'100%', maxHeight:'100%', borderRadius:'8px', background:'#000' }}></video>
              : (doc.mime||'').startsWith('image')
                ? <img src={doc.fileUrl} alt={doc.name} style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain', borderRadius:'8px' }} />
                : <iframe src={doc.fileUrl} title="Training (enlarged)" style={{ width:'100%', height:'100%', border:'none', borderRadius:'8px', background:'var(--surface)' }}></iframe>}
          </div>
        </div>
      )}
    </div>
  );
}

export function ReachLine({ groupIds }) {
  const [n, setN] = React.useState(null);
  const key = (groupIds || []).slice().sort().join(',');
  React.useEffect(() => {
    let live = true;
    if (!key) { setN(0); return; }
    setN(null);
    api.groupReach(groupIds).then((r) => { if (live) setN(r.count); }).catch(() => { if (live) setN(null); });
    return () => { live = false; };
  }, [key]);
  const none = n === 0;
  return (
    <div style={{ marginTop:'10px', display:'inline-flex', alignItems:'center', gap:'7px', padding:'6px 11px', borderRadius:'8px', font:'600 12px/1 "IBM Plex Sans"', color: none?'var(--c9a6712)':'var(--c1f7a5c)', background: none?'var(--cfbf2df)':'var(--ce6f3ec)' }}>
      <Ico size={14} sw={1.9}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></Ico>
      {n === null ? 'Calculating reach\u2026' : none ? 'Reaches no one \u2014 assign a group with members' : ('Reaches ' + n + (n === 1 ? ' person' : ' people'))}
    </div>
  );
}

export function Drawer({ drawer, form, setF, grps, emps, toggleGroupId, roleOpts, onClose, onSave, onBrowse }) {
  const stop = (e) => e.stopPropagation();
  const title = drawer.type==='policy' ? (drawer.mode==='edit'?'Edit policy':'New policy') : drawer.type==='group' ? 'Create platform group' : 'Add local user';
  const lbl = { font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.05em', color:'var(--c9aa1b2)', textTransform:'uppercase', marginBottom:'8px' };
  const inp = { width:'100%', border:'1px solid var(--cd8dce6)', borderRadius:'9px', padding:'11px 13px', font:'400 14px/1 "IBM Plex Sans"', outline:'none' };
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(20,26,48,.4)', display:'flex', justifyContent:'flex-end', zIndex:55, animation:'ovIn .16s ease' }} onClick={onClose}>
      <div style={{ width:'480px', maxWidth:'100%', height:'100%', background:'var(--surface)', display:'flex', flexDirection:'column', boxShadow:'-12px 0 40px rgba(10,16,40,.2)', animation:'drawerIn .22s ease' }} onClick={stop}>
        <div style={{ flex:'none', padding:'22px 26px', borderBottom:'1px solid var(--ceceef4)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ font:'600 18px/1 "IBM Plex Sans"', color:'var(--c161a26)' }}>{title}</div>
          <button style={{ border:'none', background:'var(--cf3f4f8)', width:'34px', height:'34px', borderRadius:'9px', cursor:'pointer', color:'var(--c54607a)', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}><Ico size={17} sw={2.2} d="M6 6l12 12M18 6L6 18" /></button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'24px 26px', display:'flex', flexDirection:'column', gap:'20px' }}>
          {drawer.type==='policy' && (
            <React.Fragment>
              <div><div style={lbl}>Policy name</div><input value={form.name} onChange={setF('name')} placeholder="e.g. Information Security Policy" style={inp} /></div>
              <div style={{ display:'flex', gap:'14px' }}>
                <div style={{ flex:1 }}><div style={lbl}>Type</div>
                  <select value={form.type} onChange={setF('type')} style={{ ...inp, background:'var(--surface)' }}>
                    {['Policy','Process','Procedure','Standard','Guideline'].map((o)=>(<option key={o} value={o}>{o}</option>))}
                  </select>
                </div>
                <div style={{ width:'120px' }}><div style={lbl}>Version</div><input value={form.version} onChange={setF('version')} placeholder="v1.0" style={inp} /></div>
              </div>
              <div>
                <div style={lbl}>Signature deadline <span style={{ textTransform:'none', color:'var(--caab0c0)', fontWeight:400 }}>(optional)</span></div>
                <select value={form.dueMode||'none'} onChange={setF('dueMode')} style={{ ...inp, background:'var(--surface)' }}>
                  <option value="none">No deadline</option>
                  <option value="rolling">Within N days of assignment (fair to new joiners)</option>
                  <option value="fixed">Fixed calendar date</option>
                </select>
                {form.dueMode==='rolling' && <div style={{ display:'flex', alignItems:'center', gap:'9px', marginTop:'10px' }}><span style={{ font:'500 13px/1 "IBM Plex Sans"', color:'var(--c54607a)' }}>Sign within</span><input type="number" min="1" value={form.dueDays||''} onChange={setF('dueDays')} style={{ ...inp, width:'90px' }} /><span style={{ font:'500 13px/1 "IBM Plex Sans"', color:'var(--c54607a)' }}>days of becoming required</span></div>}
                {form.dueMode==='fixed' && <input type="date" value={form.dueDate||''} onChange={setF('dueDate')} style={{ ...inp, marginTop:'10px' }} />}
              </div>
              <div>
                <div style={lbl}>Review by <span style={{ textTransform:'none', color:'var(--caab0c0)', fontWeight:400 }}>(optional — reminds the owner to revisit)</span></div>
                <input type="date" value={form.reviewDate||''} onChange={setF('reviewDate')} style={inp} />
              </div>
              {drawer.mode==='edit' && <div>
                <div style={lbl}>Version note <span style={{ textTransform:'none', color:'var(--caab0c0)', fontWeight:400 }}>(optional — recorded in version history)</span></div>
                <input value={form.versionNote||''} onChange={setF('versionNote')} placeholder="What changed in this version?" style={inp} />
              </div>}
              <div>
                <div style={lbl}>Owner <span style={{ textTransform:'none', color:'var(--caab0c0)', fontWeight:400 }}>(receives review reminders)</span></div>
                <select value={form.ownerOid||''} onChange={setF('ownerOid')} style={{ ...inp, background:'var(--surface)' }}>
                  <option value="">— Unassigned —</option>
                  {(emps||[]).map((e)=>(<option key={e.oid} value={e.oid}>{e.display_name}{e.department?(' · '+e.department):''}</option>))}
                </select>
              </div>
              <div>
                <div style={lbl}>Policy document</div>
                <button type="button" onClick={onBrowse} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:'9px', border:'1px solid var(--c213a9e)', background:'var(--ceef1fb)', color:'var(--c213a9e)', borderRadius:'9px', padding:'11px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4"/></svg>
                  {form.itemId ? 'Change document' : 'Browse SharePoint'}
                </button>
                {form.url
                  ? <div style={{ marginTop:'10px', display:'flex', alignItems:'center', gap:'9px', background:'var(--cf3f8f5)', border:'1px solid var(--cdcebe3)', borderRadius:'9px', padding:'9px 12px' }}>
                      <span style={{ color:'var(--c1f7a5c)', display:'flex', flex:'none' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M20 6L9 17l-5-5"/></svg></span>
                      <a href={form.url} target="_blank" rel="noreferrer" style={{ flex:1, minWidth:0, font:'500 12px/1.3 "IBM Plex Mono",monospace', color:'var(--c1f7a5c)', textDecoration:'none', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{form.url}</a>
                    </div>
                  : <div style={{ marginTop:'8px', font:'400 11.5px/1.4 "IBM Plex Mono",monospace', color:'var(--caab0c0)' }}>No document selected yet.</div>}
                <details style={{ marginTop:'10px' }}>
                  <summary style={{ font:'500 11.5px/1 "IBM Plex Sans"', color:'var(--c8a92a6)', cursor:'pointer' }}>Or paste a link manually</summary>
                  <input value={form.url} onChange={setF('url')} placeholder="https://birgmabiltema.sharepoint.com/..." style={{ ...inp, marginTop:'8px', font:'400 13px/1 "IBM Plex Mono",monospace' }} />
                </details>
              </div>
              <div>
                <div style={lbl}>Assign to groups</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'9px' }}>
                  {grps.map((g)=>{ const on = (form.groupIds||[]).includes(g.id); return (
                    <div key={g.id} onClick={()=>toggleGroupId(g.id)} style={{ display:'flex', alignItems:'center', gap:'9px', padding:'9px 12px', borderRadius:'9px', cursor:'pointer', border:'1px solid '+(on?'var(--c213a9e)':'var(--ce6e8ee)'), background:on?'var(--ceef1fb)':'#fff', font:'500 13px/1 "IBM Plex Sans"', color:'var(--c2a3142)' }}>
                      <input type="checkbox" checked={on} readOnly style={{ width:'16px', height:'16px', accentColor:'var(--c213a9e)', pointerEvents:'none' }} />{g.name}
                    </div>
                  ); })}
                  {!grps.length && <div style={{ gridColumn:'1 / -1', font:'400 12.5px/1.5 "IBM Plex Sans"', color:'var(--caab0c0)' }}>No groups yet — create one under Groups &amp; access.</div>}
                </div>
                <ReachLine groupIds={form.groupIds} />
              </div>
            </React.Fragment>
          )}
          {drawer.type==='employee' && (
            <React.Fragment>
              <div style={{ display:'flex', gap:'14px' }}>
                <div style={{ flex:1 }}><div style={lbl}>First name</div><input value={form.first} onChange={setF('first')} style={inp} /></div>
                <div style={{ flex:1 }}><div style={lbl}>Last name</div><input value={form.last} onChange={setF('last')} style={inp} /></div>
              </div>
              <div><div style={lbl}>Email</div><input value={form.email} onChange={setF('email')} placeholder="name@birgma.com" style={inp} /></div>
              <div style={{ display:'flex', gap:'14px' }}>
                <div style={{ flex:1 }}><div style={lbl}>Department</div>
                  <select value={form.role} onChange={setF('role')} style={{ ...inp, background:'var(--surface)' }}>
                    {['Unassigned', ...roleOpts.filter((r)=>r!=='Unassigned')].map((r)=>(<option key={r} value={r}>{r}</option>))}
                  </select>
                </div>
                <div style={{ flex:1 }}><div style={lbl}>Title</div><input value={form.title} onChange={setF('title')} style={inp} /></div>
              </div>
              <div style={{ font:'400 12px/1.5 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)', background:'var(--cf6f8fb)', borderRadius:'9px', padding:'12px 14px' }}>Local users are stored in the portal and counted alongside synced directory accounts.</div>
            </React.Fragment>
          )}
          {drawer.type==='group' && (
            <React.Fragment>
              <div><div style={lbl}>Group name</div><input value={form.name} onChange={setF('name')} placeholder="e.g. All Staff" style={inp} /></div>
              <div><div style={lbl}>Description</div><input value={form.description} onChange={setF('description')} placeholder="What this group is for" style={inp} /></div>
              <div><div style={lbl}>Group type</div>
                <select value={form.kind} onChange={setF('kind')} style={{ ...inp, background:'var(--surface)' }}>
                  <option value="Local">Local group — map AD / Entra groups into it</option>
                  <option value="Platform">Platform role — internal authorization role</option>
                </select>
              </div>
              <div style={{ font:'400 12px/1.5 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)', background:'var(--cf6f8fb)', borderRadius:'9px', padding:'12px 14px' }}>After creating, use “Import from Active Directory” to map on-prem AD or Entra ID security groups into it — members roll up automatically.</div>
            </React.Fragment>
          )}
        </div>
        <div style={{ flex:'none', borderTop:'1px solid var(--ceceef4)', padding:'18px 26px', display:'flex', gap:'12px', justifyContent:'flex-end' }}>
          <button style={{ border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c54607a)', borderRadius:'10px', padding:'11px 20px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={onClose}>Cancel</button>
          <button style={{ border:'none', background:'var(--c213a9e)', color:'#fff', borderRadius:'10px', padding:'11px 22px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={onSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
