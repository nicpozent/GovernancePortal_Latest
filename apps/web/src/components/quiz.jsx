/* Extracted from app.jsx — presentational components (quiz). */
import * as React from 'react';
const { useState } = React;
import { api } from '../api.js';
import { Ico } from '../ui.jsx';

export function QuizBuilder({ state, onSave, onDelete, onArchive, onRestore, onClose }) {
  const stop = (e) => e.stopPropagation();
  const [title, setTitle] = useState(state.title);
  const [passPct, setPassPct] = useState(state.passPct);
  const [qs, setQs] = useState(state.questions);
  const setQ = (i, patch) => setQs((a) => a.map((q, j) => j === i ? { ...q, ...patch } : q));
  const setOpt = (i, k, v) => setQs((a) => a.map((q, j) => j === i ? { ...q, options: q.options.map((o, m) => m === k ? v : o) } : q));
  const addOpt = (i) => setQs((a) => a.map((q, j) => j === i ? { ...q, options: [...q.options, ''] } : q));
  const delOpt = (i, k) => setQs((a) => a.map((q, j) => j === i ? { ...q, options: q.options.filter((_, m) => m !== k), correctIndex: Math.max(0, q.correctIndex - (k <= q.correctIndex ? 1 : 0)) } : q));
  const addQ = () => setQs((a) => [...a, { prompt:'', options:['',''], correctIndex:0, points:1 }]);
  const delQ = (i) => setQs((a) => a.filter((_, j) => j !== i));
  const totalPoints = qs.reduce((s, q) => s + (parseInt(q.points,10)||0), 0);
  const [analytics, setAnalytics] = useState(null);   // null | 'loading' | data
  const loadAnalytics = async () => {
    if (analytics && analytics !== 'closed') { setAnalytics(null); return; }
    setAnalytics('loading');
    try { const a = await api.quizAnalytics(state.policy.id); setAnalytics(a); }
    catch (e) { setAnalytics(null); }
  };
  const lbl = { font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.05em', color:'#9aa1b2', textTransform:'uppercase', marginBottom:'7px' };
  const inp = { width:'100%', border:'1px solid #d8dce6', borderRadius:'9px', padding:'10px 12px', font:'400 13.5px/1.3 "IBM Plex Sans"', outline:'none', boxSizing:'border-box' };
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(20,26,48,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:'36px', zIndex:58, animation:'ovIn .18s ease' }} onClick={onClose}>
      <div style={{ width:'720px', maxWidth:'100%', maxHeight:'88vh', background:'#fff', borderRadius:'16px', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 24px 60px rgba(10,16,40,.34)', animation:'cardUp .22s ease' }} onClick={stop}>
        <div style={{ flex:'none', padding:'22px 26px 16px', borderBottom:'1px solid #eceef4', display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
          <div><div style={{ font:'600 18px/1.2 "IBM Plex Sans"', color:'#161a26' }}>Knowledge check</div><div style={{ font:'400 12px/1.3 "IBM Plex Sans"', color:'#7b8294', marginTop:'3px' }}>for {state.policy.name}{state.archived ? ' · archived' : ''}</div></div>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            {state.exists && <button onClick={loadAnalytics} style={{ border:'1px solid #e6e8ee', background: analytics&&analytics!=='loading'?'#eef1fb':'#fff', color:'#213a9e', borderRadius:'9px', padding:'8px 13px', font:'600 12px/1 "IBM Plex Sans"', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'7px' }}><Ico size={14} sw={2}><path d="M3 3v18h18M7 14l4-4 3 3 5-6"/></Ico>Analytics</button>}
            <button style={{ border:'none', background:'#f3f4f8', width:'34px', height:'34px', borderRadius:'9px', cursor:'pointer', color:'#54607a', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}><Ico size={17} sw={2.2} d="M6 6l12 12M18 6L6 18" /></button>
          </div>
        </div>
        {state.loading ? <div style={{ height:'200px', display:'flex', alignItems:'center', justifyContent:'center' }}><span style={{ width:'26px', height:'26px', border:'3px solid #d2d7e3', borderTopColor:'#213a9e', borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite' }}></span></div> : (
        <React.Fragment>
        <div style={{ flex:1, overflowY:'auto', padding:'20px 26px', display:'flex', flexDirection:'column', gap:'18px' }}>
          {analytics && analytics!=='loading' && analytics.summary && <div style={{ border:'1px solid #e3def5', borderRadius:'12px', overflow:'hidden' }}>
            <div style={{ background:'#f6f3fd', padding:'12px 16px', borderBottom:'1px solid #e3def5', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ font:'600 13px/1 "IBM Plex Sans"', color:'#6d4bd1' }}>Analytics</span>
              <span style={{ font:'500 11.5px/1 "IBM Plex Mono",monospace', color:'#8a92a6' }}>{analytics.summary.people_passed||0}/{analytics.summary.people||0} people passed · avg {analytics.summary.avg_pct!=null?analytics.summary.avg_pct+'%':'—'} · {analytics.summary.attempts||0} attempts</span>
            </div>
            <div style={{ padding:'8px 16px 14px' }}>
              {analytics.questions.map((q,i)=>(
                <div key={i} style={{ padding:'9px 0', borderBottom:i<analytics.questions.length-1?'1px solid #f0f1f6':'none' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:'12px', alignItems:'baseline' }}>
                    <span style={{ font:'400 13px/1.4 "IBM Plex Sans"', color:'#2a3142', flex:1 }}>{i+1}. {q.prompt}</span>
                    <span style={{ font:'600 12.5px/1 "IBM Plex Sans"', color: q.rate==null?'#aab0c0':q.rate>=70?'#1f7a5c':q.rate>=40?'#9a6712':'#c0143c', flex:'none' }}>{q.rate==null?'—':q.rate+'% correct'}</span>
                  </div>
                  <div style={{ font:'400 10.5px/1.3 "IBM Plex Mono",monospace', color:'#aab0c0', marginTop:'3px' }}>{q.correct}/{q.answered} correct · {q.points} pt{q.points===1?'':'s'}</div>
                </div>
              ))}
              {!analytics.questions.length && <div style={{ font:'400 12.5px/1.5 "IBM Plex Sans"', color:'#aab0c0', padding:'8px 0' }}>No attempts recorded yet.</div>}
            </div>
          </div>}
          {analytics==='loading' && <div style={{ textAlign:'center', padding:'14px' }}><span style={{ width:'20px', height:'20px', border:'3px solid #d2d7e3', borderTopColor:'#6d4bd1', borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite' }}></span></div>}
          <div style={{ display:'flex', gap:'14px' }}>
            <div style={{ flex:1 }}><div style={lbl}>Quiz title</div><input value={title} onChange={(e)=>setTitle(e.target.value)} style={inp} /></div>
            <div style={{ width:'150px' }}><div style={lbl}>Pass mark (%)</div><input type="number" min="1" max="100" value={passPct} onChange={(e)=>setPassPct(e.target.value)} style={inp} /></div>
          </div>
          {qs.map((q, i)=>(
            <div key={i} style={{ border:'1px solid #e6e8ee', borderRadius:'12px', padding:'16px' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
                <span style={{ font:'600 12px/1 "IBM Plex Mono",monospace', color:'#6d4bd1' }}>QUESTION {i+1}</span>
                <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                  <span style={{ font:'500 11.5px/1 "IBM Plex Sans"', color:'#8a92a6' }}>Points</span>
                  <input type="number" min="1" value={q.points} onChange={(e)=>setQ(i,{points:e.target.value})} style={{ ...inp, width:'64px', padding:'7px 9px' }} />
                  {qs.length>1 && <button onClick={()=>delQ(i)} style={{ border:'none', background:'transparent', color:'#c0143c', cursor:'pointer', display:'flex' }}><Ico size={16} sw={2} d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></button>}
                </div>
              </div>
              <input value={q.prompt} onChange={(e)=>setQ(i,{prompt:e.target.value})} placeholder="Question text" style={{ ...inp, marginBottom:'10px' }} />
              <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
                {q.options.map((o,k)=>(
                  <div key={k} style={{ display:'flex', alignItems:'center', gap:'9px' }}>
                    <input type="radio" name={'correct'+i} checked={q.correctIndex===k} onChange={()=>setQ(i,{correctIndex:k})} title="Correct answer" style={{ width:'17px', height:'17px', accentColor:'#1f7a5c', flex:'none', cursor:'pointer' }} />
                    <input value={o} onChange={(e)=>setOpt(i,k,e.target.value)} placeholder={'Option '+(k+1)} style={{ ...inp, padding:'8px 11px' }} />
                    {q.options.length>2 && <button onClick={()=>delOpt(i,k)} style={{ border:'none', background:'transparent', color:'#aab0c0', cursor:'pointer', display:'flex' }}><Ico size={15} sw={2.2} d="M6 6l12 12M18 6L6 18" /></button>}
                  </div>
                ))}
              </div>
              <button onClick={()=>addOpt(i)} style={{ marginTop:'9px', border:'none', background:'transparent', color:'#213a9e', cursor:'pointer', font:'600 12px/1 "IBM Plex Sans"', display:'inline-flex', alignItems:'center', gap:'6px' }}><Ico size={13} sw={2.4} d="M12 5v14M5 12h14" />Add option</button>
              <div style={{ font:'400 11px/1.3 "IBM Plex Mono",monospace', color:'#aab0c0', marginTop:'8px' }}>Select the radio next to the correct answer.</div>
            </div>
          ))}
          <button onClick={addQ} style={{ border:'1px dashed #c9cfdd', background:'#fff', color:'#213a9e', borderRadius:'10px', padding:'11px', font:'600 13px/1 "IBM Plex Sans"', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'7px' }}><Ico size={14} sw={2.2} d="M12 5v14M5 12h14" />Add question</button>
        </div>
        <div style={{ flex:'none', borderTop:'1px solid #eceef4', background:'#fafbfd', padding:'16px 26px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ font:'500 12px/1 "IBM Plex Mono",monospace', color:'#8a92a6' }}>{qs.length} questions · {totalPoints} points · pass ≥ {passPct}%</div>
          <div style={{ display:'flex', gap:'12px' }}>
            {state.exists && !state.archived && <button style={{ border:'1px solid #e6e8ee', background:'#fff', color:'#9a6712', borderRadius:'10px', padding:'11px 18px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={onArchive}>Archive</button>}
            {state.exists && state.archived && <button style={{ border:'1px solid #cdd5f0', background:'#eef1fb', color:'#213a9e', borderRadius:'10px', padding:'11px 18px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={onRestore}>Restore</button>}
            {state.exists && <button style={{ border:'1px solid #f0d6dd', background:'#fff', color:'#c0143c', borderRadius:'10px', padding:'11px 18px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={onDelete}>Delete</button>}
            <button style={{ border:'none', background:'#213a9e', color:'#fff', borderRadius:'10px', padding:'11px 22px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={()=>onSave({ title, passPct: parseInt(passPct,10)||80, questions: qs })}>Save quiz</button>
          </div>
        </div>
        </React.Fragment>
        )}
      </div>
    </div>
  );
}

export function QuizTake({ quizState, alreadyPassed, bestPct, onAnswer, onSubmit, onRetry }) {
  if (alreadyPassed) return (
    <div style={{ marginTop:'20px', display:'flex', alignItems:'center', gap:'10px', background:'#f3f8f5', border:'1px solid #dcebe3', borderRadius:'11px', padding:'14px 16px', font:'500 13px/1.4 "IBM Plex Sans"', color:'#1f7a5c' }}>
      <Ico size={17} sw={2.4} d="M20 6L9 17l-5-5" />Knowledge check passed{bestPct!=null?(' — '+bestPct+'%'):''}.
    </div>
  );
  if (!quizState) return null;
  if (quizState.loading) return <div style={{ marginTop:'20px', textAlign:'center', padding:'20px' }}><span style={{ width:'22px', height:'22px', border:'3px solid #d2d7e3', borderTopColor:'#213a9e', borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite' }}></span></div>;
  const r = quizState.result;
  const passed = quizState.passed;
  const remaining = quizState.maxAttempts - quizState.attemptsUsed;
  const allAnswered = (quizState.questions || []).every((q) => quizState.answers[q.id] !== undefined);
  const blocked = !passed && remaining <= 0;
  const revMap = {}; if (r && r.review) r.review.forEach((x)=>{ revMap[x.id] = x; });
  return (
    <div style={{ marginTop:'22px', border:'1px solid #e3def5', borderRadius:'12px', overflow:'hidden' }}>
      <div style={{ background:'#f6f3fd', padding:'13px 16px', borderBottom:'1px solid #e3def5', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ font:'600 13.5px/1 "IBM Plex Sans"', color:'#6d4bd1' }}>Knowledge check</span>
        <span style={{ font:'500 11.5px/1 "IBM Plex Mono",monospace', color:'#8a92a6' }}>pass ≥ {quizState.passPct}% · attempt {Math.min(quizState.attemptsUsed+ (passed?0:1), quizState.maxAttempts)}/{quizState.maxAttempts}</span>
      </div>
      <div style={{ padding:'16px' }}>
        {r && <div style={{ marginBottom:'14px', display:'flex', alignItems:'center', gap:'9px', borderRadius:'9px', padding:'10px 13px', font:'600 13px/1.3 "IBM Plex Sans"', color: passed?'#1f7a5c':'#c0143c', background: passed?'#e6f3ec':'#fbe7ec' }}>
          {passed ? 'Passed' : 'Not passed'} — {r.pct}% ({r.score}/{r.maxScore}). {passed ? 'You can sign below.' : (remaining>0 ? (remaining+' attempt'+(remaining===1?'':'s')+' remaining.') : 'No attempts left — contact your administrator.')}
        </div>}
        {!passed && quizState.questions.map((q, i)=>{ const rv = revMap[q.id]; return (
          <div key={q.id} style={{ marginBottom:'16px' }}>
            <div style={{ font:'600 13.5px/1.4 "IBM Plex Sans"', color:'#23283a', marginBottom:'9px' }}>{i+1}. {q.prompt} <span style={{ font:'400 11px/1 "IBM Plex Mono",monospace', color:'#aab0c0' }}>({q.points} pt{q.points===1?'':'s'})</span>{rv && <span style={{ marginLeft:'7px', font:'600 11px/1 "IBM Plex Mono",monospace', color: rv.correct?'#1f7a5c':'#c0143c' }}>{rv.correct?'✓ correct':'✗ incorrect'}</span>}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
              {(q.options||[]).map((o,k)=>{ const sel = quizState.answers[q.id]===k;
                let bd='#e6e8ee', bg='#fff';
                if (rv) { if (k===rv.correctIndex) { bd='#1f7a5c'; bg='#e6f3ec'; } else if (k===rv.chosen && !rv.correct) { bd='#c0143c'; bg='#fbe7ec'; } }
                else if (sel) { bd='#6d4bd1'; bg='#f6f3fd'; }
                return (
                <label key={k} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'9px 12px', borderRadius:'9px', cursor: (blocked||rv)?'default':'pointer', border:'1px solid '+bd, background:bg }}>
                  <input type="radio" name={'q'+q.id} disabled={blocked||!!rv} checked={sel} onChange={()=>onAnswer(q.id,k)} style={{ width:'16px', height:'16px', accentColor:'#6d4bd1', flex:'none' }} />
                  <span style={{ font:'400 13px/1.4 "IBM Plex Sans"', color:'#2a3142' }}>{o}</span>
                  {rv && k===rv.correctIndex && <span style={{ marginLeft:'auto', color:'#1f7a5c', display:'flex' }}><Ico size={15} sw={2.4} d="M20 6L9 17l-5-5" /></span>}
                </label>
              ); })}
            </div>
          </div>
        ); })}
        {r && !passed && remaining>0 && <div style={{ font:'400 12px/1.4 "IBM Plex Sans"', color:'#8a92a6', marginBottom:'12px' }}>Review the correct answers above (shown in green), then try again.</div>}
        {!passed && !blocked && (r ? <button onClick={onRetry} style={{ border:'none', borderRadius:'10px', padding:'11px 20px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer', color:'#fff', background:'#6d4bd1' }}>Try again</button> : <button disabled={!allAnswered} onClick={onSubmit} style={{ border:'none', borderRadius:'10px', padding:'11px 20px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:allAnswered?'pointer':'not-allowed', color:'#fff', background:allAnswered?'#6d4bd1':'#c3b9e6' }}>Submit answers</button>)}
      </div>
    </div>
  );
}

/* ============================ help content ============================ */
