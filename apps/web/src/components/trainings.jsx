/* Extracted from app.jsx — presentational components (trainings). */
import * as React from 'react';
const { useState } = React;
import { Ico } from '../ui.jsx';
import { Empty } from './common.jsx';

export function Trainings({ trainings, onNew, onEdit, onArchive, onQuiz, onHistory, onToggleConfidential }) {
  const fmtPct = (s, a) => a ? Math.round(s/a*100) : 0;
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'16px', marginBottom:'18px', flexWrap:'wrap' }}>
        <div style={{ font:'400 13px/1.5 "IBM Plex Sans"', color:'var(--c7b8294)', maxWidth:'560px' }}>Upload your own documents — trainings, policies, procedures, guidelines — from your computer, attach a knowledge check, and assign to groups. Completion is tracked like everything else.</div>
        <button onClick={onNew} style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'none', background:'var(--c213a9e)', color:'#fff', borderRadius:'10px', padding:'11px 18px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer', flex:'none' }}>
          <Ico size={16} sw={2.2} d="M12 5v14M5 12h14" />New document
        </button>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
        {trainings.map((t)=>{ const assigned=Number(t.assigned)||0, signed=Number(t.signed)||0, pct=fmtPct(signed,assigned); return (
          <div key={t.id} style={{ background:'var(--surface)', border:'1px solid var(--ce6e8ee)', borderRadius:'14px', padding:'20px 22px' }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:'16px' }}>
              <div style={{ width:'42px', height:'42px', flex:'none', borderRadius:'10px', background:'var(--ceef1fb)', color:'var(--c213a9e)', display:'flex', alignItems:'center', justifyContent:'center' }}><Ico size={22} sw={1.8}><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1 2.7 2 6 2s6-1 6-2v-5"/></Ico></div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'9px', flexWrap:'wrap' }}>
                  <span style={{ font:'600 16px/1.2 "IBM Plex Sans"', color:'var(--c161a26)' }}>{t.name}</span>
                  <span style={{ font:'600 10px/1.3 "IBM Plex Mono",monospace', letterSpacing:'.04em', textTransform:'uppercase', color: t.doc_type==='Training'?'var(--c6d4bd1)':'var(--c213a9e)', background: t.doc_type==='Training'?'var(--cf6f3fd)':'var(--ceef1fb)', padding:'2px 8px', borderRadius:'999px' }}>{t.doc_type}</span>
                  <span style={{ font:'400 12px/1 "IBM Plex Mono",monospace', color:'var(--caab0c0)' }}>{t.version}</span>
                  {t.confidential && <span title="Confidential — sharing with new groups needs the owner's approval" style={{ display:'inline-flex', alignItems:'center', gap:'4px', font:'600 10px/1.3 "IBM Plex Mono",monospace', letterSpacing:'.04em', textTransform:'uppercase', color:'var(--cc0143c)', background:'var(--cfdf0f3)', padding:'2px 8px', borderRadius:'999px' }}><Ico size={11} sw={2}><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></Ico>Confidential</span>}
                </div>
                <div style={{ font:'400 12.5px/1.5 "IBM Plex Sans"', color:'var(--c7b8294)', marginTop:'5px' }}>
                  {t.upload_name ? t.upload_name : 'No file'} · Assigned: {(t.groups&&t.groups.length)?t.groups.join(', '):'—'}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:'12px', marginTop:'12px' }}>
                  <div style={{ flex:1, maxWidth:'320px', height:'8px', background:'var(--ceef1f5)', borderRadius:'5px', overflow:'hidden' }}><div style={{ height:'100%', borderRadius:'5px', width:pct+'%', background:pct>=70?'var(--c1f8a5b)':pct>=40?'var(--ccaa53d)':'var(--cc0143c)' }}></div></div>
                  <span style={{ font:'600 13px/1 "IBM Plex Sans"', color:'var(--c23283a)' }}>{pct}%</span>
                  <span style={{ font:'400 12px/1 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)' }}>{signed}/{assigned} signed</span>
                </div>
              </div>
              <div style={{ display:'flex', gap:'8px', flex:'none' }}>
                <button style={{ border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c213a9e)', borderRadius:'9px', padding:'9px 14px', font:'600 13px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={()=>onEdit(t)}>Edit</button>
                <button title="Knowledge check" style={{ border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c6d4bd1)', borderRadius:'9px', padding:'9px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:'6px', font:'600 13px/1 "IBM Plex Sans"' }} onClick={()=>onQuiz(t)}><Ico size={15} sw={1.9}><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 1 1 4 2.8c-.8.3-1.1.9-1.1 1.7v.5"/><path d="M12 17h.01"/></Ico>Quiz</button>
                <button title="Version history" style={{ border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c54607a)', borderRadius:'9px', padding:'9px 11px', cursor:'pointer', display:'flex', alignItems:'center' }} onClick={()=>onHistory(t)}><Ico size={16} sw={1.9}><path d="M3 3v5h5"/><path d="M3 8a9 9 0 1 0 2.5-5.3L3 8"/><path d="M12 8v5l3 2"/></Ico></button>
                <button title={t.confidential ? 'Remove confidential mark' : 'Mark confidential (gate who it’s shared with)'} style={{ border:'1px solid var(--ce6e8ee)', background: t.confidential?'var(--cfdf0f3)':'var(--surface)', color: t.confidential?'var(--cc0143c)':'var(--c54607a)', borderRadius:'9px', padding:'9px 11px', cursor:'pointer', display:'flex', alignItems:'center' }} onClick={()=>onToggleConfidential(t)}><Ico size={16} sw={1.9}>{t.confidential ? <><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></> : <><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></>}</Ico></button>
                <button title="Archive" style={{ border:'1px solid var(--cf0d6dd)', background:'var(--surface)', color:'var(--cc0143c)', borderRadius:'9px', padding:'9px 11px', cursor:'pointer', display:'flex', alignItems:'center' }} onClick={()=>onArchive(t)}><Ico size={16} sw={1.9}><path d="M3 7h18M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 7l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7"/></Ico></button>
              </div>
            </div>
          </div>
        ); })}
        {!trainings.length && <Empty msg="Nothing here yet — click “New document” to upload your first." />}
      </div>
    </div>
  );
}

export function TrainingEditor({ state, groups, onClose, onSave }) {
  const stop = (e) => e.stopPropagation();
  const d = state.data || {};
  const [name, setName] = useState(d.name || '');
  const [docType, setDocType] = useState(d.doc_type || 'Training');
  const [version, setVersion] = useState(d.version || 'v1.0');
  const [dueMode, setDueMode] = useState(d.due_date ? 'fixed' : (d.due_days!=null ? 'rolling' : 'none'));
  const [dueDate, setDueDate] = useState(d.due_date ? String(d.due_date).slice(0,10) : '');
  const [dueDays, setDueDays] = useState(d.due_days!=null ? String(d.due_days) : '30');
  const [reviewDate, setReviewDate] = useState(d.review_date ? String(d.review_date).slice(0,10) : '');
  const [gids, setGids] = useState((d.group_ids || []).slice());
  const [file, setFile] = useState(null);
  const [versionNote, setVersionNote] = useState('');
  const fileRef = React.useRef(null);
  const toggle = (id) => setGids((a) => a.includes(id) ? a.filter((x)=>x!==id) : [...a, id]);
  const lbl = { font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.05em', color:'var(--c9aa1b2)', textTransform:'uppercase', marginBottom:'7px' };
  const inp = { width:'100%', border:'1px solid var(--cd8dce6)', borderRadius:'9px', padding:'10px 12px', font:'400 13.5px/1.3 "IBM Plex Sans"', outline:'none', boxSizing:'border-box' };
  const canSave = name.trim() && (state.mode==='edit' || file);
  const submit = () => {
    const fields = { name:name.trim(), docType, version, groupIds:gids, reviewDate:reviewDate||'', versionNote };
    fields.dueDate = dueMode==='fixed' ? (dueDate||'') : '';
    fields.dueDays = dueMode==='rolling' ? (dueDays||'') : '';
    if (state.mode==='edit') fields.id = d.id;
    onSave(fields, file);
  };
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(20,26,48,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:'36px', zIndex:58, animation:'ovIn .18s ease' }} onClick={onClose}>
      <div style={{ width:'600px', maxWidth:'100%', maxHeight:'88vh', background:'var(--surface)', borderRadius:'16px', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 24px 60px rgba(10,16,40,.34)', animation:'cardUp .22s ease' }} onClick={stop}>
        <div style={{ flex:'none', padding:'22px 26px 16px', borderBottom:'1px solid var(--ceceef4)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ font:'600 18px/1.2 "IBM Plex Sans"', color:'var(--c161a26)' }}>{state.mode==='edit' ? 'Edit document' : 'New document'}</div>
          <button style={{ border:'none', background:'var(--cf3f4f8)', width:'34px', height:'34px', borderRadius:'9px', cursor:'pointer', color:'var(--c54607a)', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}><Ico size={17} sw={2.2} d="M6 6l12 12M18 6L6 18" /></button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'20px 26px', display:'flex', flexDirection:'column', gap:'16px' }}>
          <div style={{ display:'flex', gap:'14px' }}>
            <div style={{ flex:1 }}><div style={lbl}>Name</div><input value={name} onChange={(e)=>setName(e.target.value)} placeholder="e.g. Fire Safety Induction" style={inp} /></div>
            <div style={{ width:'120px' }}><div style={lbl}>Version</div><input value={version} onChange={(e)=>setVersion(e.target.value)} style={inp} /></div>
          </div>
          <div>
            <div style={lbl}>Document type</div>
            <select value={docType} onChange={(e)=>setDocType(e.target.value)} style={{ ...inp, background:'var(--surface)' }}>
              <option value="Training">Training</option>
              <option value="Policy">Policy</option>
              <option value="Process">Process</option>
              <option value="Procedure">Procedure</option>
              <option value="Standard">Standard</option>
              <option value="Guideline">Guideline</option>
            </select>
          </div>
          <div>
            <div style={lbl}>Training file {state.mode==='edit' && <span style={{ textTransform:'none', color:'var(--caab0c0)', fontWeight:400 }}>(leave empty to keep current)</span>}</div>
            <input ref={fileRef} type="file" accept=".pdf,.mp4,.webm,.pptx,.ppt,.docx,.png,.jpg,.jpeg,.gif" style={{ display:'none' }} onChange={(e)=>setFile(e.target.files&&e.target.files[0])} />
            <button type="button" onClick={()=>fileRef.current&&fileRef.current.click()} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:'9px', border:'1px dashed var(--c213a9e)', background:'var(--ceef1fb)', color:'var(--c213a9e)', borderRadius:'9px', padding:'13px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }}>
              <Ico size={16} sw={1.9}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15l3-3 3 3"/></Ico>
              {file ? file.name : (d.upload_name ? ('Replace — current: ' + d.upload_name) : 'Choose file from your computer')}
            </button>
            <div style={{ font:'400 11px/1.4 "IBM Plex Mono",monospace', color:'var(--caab0c0)', marginTop:'6px' }}>PDF, video (mp4/webm), PowerPoint, Word or image · up to 250 MB.</div>
          </div>
          <div>
            <div style={lbl}>Completion deadline</div>
            <select value={dueMode} onChange={(e)=>setDueMode(e.target.value)} style={{ ...inp, background:'var(--surface)' }}>
              <option value="none">No deadline</option>
              <option value="rolling">Within N days of assignment</option>
              <option value="fixed">Fixed calendar date</option>
            </select>
            {dueMode==='rolling' && <div style={{ display:'flex', alignItems:'center', gap:'9px', marginTop:'10px' }}><span style={{ font:'500 13px/1 "IBM Plex Sans"', color:'var(--c54607a)' }}>Complete within</span><input type="number" min="1" value={dueDays} onChange={(e)=>setDueDays(e.target.value)} style={{ ...inp, width:'90px' }} /><span style={{ font:'500 13px/1 "IBM Plex Sans"', color:'var(--c54607a)' }}>days</span></div>}
            {dueMode==='fixed' && <input type="date" value={dueDate} onChange={(e)=>setDueDate(e.target.value)} style={{ ...inp, marginTop:'10px' }} />}
          </div>
          <div>
            <div style={lbl}>Assign to groups</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
              {(groups||[]).map((g)=>{ const on=gids.includes(g.id); return (
                <button key={g.id} onClick={()=>toggle(g.id)} style={{ border:'1px solid '+(on?'var(--c213a9e)':'var(--cd8dce6)'), background:on?'var(--ceef1fb)':'#fff', color:on?'var(--c213a9e)':'var(--c54607a)', borderRadius:'999px', padding:'7px 13px', font:'600 12.5px/1 "IBM Plex Sans"', cursor:'pointer' }}>{g.name}</button>
              ); })}
              {!(groups||[]).length && <span style={{ font:'400 12.5px/1.5 "IBM Plex Sans"', color:'var(--caab0c0)' }}>No groups available.</span>}
            </div>
          </div>
          {state.mode==='edit' && <div><div style={lbl}>Version note <span style={{ textTransform:'none', color:'var(--caab0c0)', fontWeight:400 }}>(optional)</span></div><input value={versionNote} onChange={(e)=>setVersionNote(e.target.value)} placeholder="What changed?" style={inp} /></div>}
        </div>
        <div style={{ flex:'none', borderTop:'1px solid var(--ceceef4)', background:'var(--cfafbfd)', padding:'16px 26px', display:'flex', gap:'12px', justifyContent:'flex-end' }}>
          <button style={{ border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c54607a)', borderRadius:'10px', padding:'11px 20px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={onClose}>Cancel</button>
          <button disabled={!canSave} onClick={submit} style={{ border:'none', background:canSave?'var(--c213a9e)':'var(--caebbe2)', color:'#fff', borderRadius:'10px', padding:'11px 22px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:canSave?'pointer':'not-allowed' }}>{state.mode==='edit'?'Save changes':'Create training'}</button>
        </div>
      </div>
    </div>
  );
}
