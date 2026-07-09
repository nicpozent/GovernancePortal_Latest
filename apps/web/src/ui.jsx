/* ============================================================
   Presentation helpers extracted from app.jsx: CSS-string→style-object,
   pills/segments/tabs/chips, date/initials formatting, employee-CSV parsing,
   and the inline icon component. Pure and side-effect-free (easy to unit-test).
   ============================================================ */

/* ---------- style helpers (lets us reuse the prototype's exact CSS strings) ---------- */
export function css(str) {
  const o = {};
  String(str).split(';').forEach((d) => {
    const i = d.indexOf(':'); if (i < 0) return;
    let k = d.slice(0, i).trim(); const v = d.slice(i + 1).trim();
    if (!k) return;
    k = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    o[k] = v;
  });
  return o;
}
const TYPE_META = { Policy:'var(--c213a9e)', Process:'var(--c0078c0)', Procedure:'var(--c6d4bd1)', Standard:'var(--c1f7a5c)', Guideline:'var(--cb7791f)' };
export const pctColor = (p) => (p >= 80 ? 'var(--c1f7a5c)' : (p >= 50 ? 'var(--cb7791f)' : 'var(--cc0143c)'));
export const typePill = (t) => { const c = TYPE_META[t] || 'var(--c6b7280)'; return css(`display:inline-block;padding:4px 9px;border-radius:999px;font:600 10.5px/1.3 "IBM Plex Mono",monospace;letter-spacing:.06em;text-transform:uppercase;color:${c};background:${c}15`); };
export const statusPill = (st) => { const m = { signed:['var(--c1f7a5c)','var(--ce6f3ec)'], pending:['var(--c9a6712)','var(--cfbf2df)'], outdated:['var(--cc0143c)','var(--cfbe7ec)'] }[st] || ['var(--c6b7280)','var(--ceef1f5)']; return { display:'inline-flex', alignItems:'center', gap:'6px', padding:'5px 11px', borderRadius:'999px', fontFamily:'"IBM Plex Sans",sans-serif', fontSize:'12px', fontWeight:600, lineHeight:1, color:m[0], background:m[1] }; };
export const sourceStyle = (s) => { const c = s==='Entra ID' ? 'var(--c0078c0)' : (s==='Active Directory' ? 'var(--c1f7a5c)' : 'var(--c6b7280)'); return css(`display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:6px;font:500 11.5px/1.3 "IBM Plex Mono",monospace;color:${c};background:${c}12`); };
export const seg = (on) => ({ flex:'1', padding:'8px 16px', borderRadius:'8px', border:'none', cursor:'pointer', fontFamily:'"IBM Plex Sans",sans-serif', fontSize:'13px', fontWeight:600, lineHeight:1, background:on?'#fff':'transparent', color:on?'var(--c213a9e)':'var(--c6b7280)', boxShadow:on?'0 1px 3px rgba(20,30,80,.14)':'none' });
export const tabStyle = (on) => ({ padding:'8px 15px', borderRadius:'9px', border:'1px solid '+(on?'var(--c213a9e)':'var(--ce6e8ee)'), background:on?'var(--c213a9e)':'#fff', color:on?'#fff':'var(--c41485a)', cursor:'pointer', fontFamily:'"IBM Plex Sans",sans-serif', fontSize:'13px', fontWeight:600, lineHeight:1 });
export const chipStyle = (on) => ({ padding:'6px 13px', borderRadius:'999px', border:'1px solid '+(on?'var(--c213a9e)':'var(--ce6e8ee)'), background:on?'var(--ceef1fb)':'#fff', color:on?'var(--c213a9e)':'var(--c6b7280)', cursor:'pointer', fontFamily:'"IBM Plex Sans",sans-serif', fontSize:'12.5px', fontWeight:600, lineHeight:1 });
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const fmtDate = (v) => { if (!v) return '—'; const d = new Date(v); if (isNaN(d)) return '—'; return d.getDate()+' '+MONTHS[d.getMonth()]+' '+d.getFullYear(); };
export const fmtDT = (d) => fmtDate(d.getTime())+', '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
export const initials = (n) => String(n||'').split(' ').filter(Boolean).map((x)=>x[0]).slice(0,2).join('').toUpperCase() || '—';

// Map a policy's assigned group NAMES back to their ids (for editing).
export function groupIdsFor(policy, grps) {
  if (!policy.groups || !grps.length) return [];
  const byName = Object.fromEntries(grps.map((g)=>[g.name, g.id]));
  return policy.groups.map((n)=>byName[n]).filter(Boolean);
}

// Parse an employee CSV. Recognises headers (case-insensitive): firstName/first,
// lastName/last, displayName/name, email, department/dept, jobTitle/title.
export function parseEmployeeCsv(text) {
  const split = (line) => { const out=[]; let cur='', q=false; for (let i=0;i<line.length;i++){ const c=line[i]; if(q){ if(c==='"'){ if(line[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=c; } else { if(c==='"')q=true; else if(c===','){out.push(cur);cur='';} else cur+=c; } } out.push(cur); return out; };
  const lines = text.replace(/\r/g,'').split('\n').filter((l)=>l.trim().length);
  if (!lines.length) return [];
  const norm = (s) => s.trim().toLowerCase().replace(/[^a-z]/g,'');
  const hdr = split(lines[0]).map(norm);
  const idx = (names) => { for (const n of names){ const i = hdr.indexOf(n); if (i>=0) return i; } return -1; };
  const map = { firstName:idx(['firstname','first','givenname']), lastName:idx(['lastname','last','surname','familyname']), displayName:idx(['displayname','name','fullname']), email:idx(['email','mail','upn','userprincipalname']), department:idx(['department','dept','unit']), jobTitle:idx(['jobtitle','title','role','position']) };
  const hasHeader = Object.values(map).some((v)=>v>=0);
  const rows = [];
  const start = hasHeader ? 1 : 0;
  for (let i=start;i<lines.length;i++){
    const c = split(lines[i]);
    const get = (k, fallbackIdx) => { const j = map[k] >= 0 ? map[k] : (hasHeader ? -1 : fallbackIdx); return j>=0 ? (c[j]||'').trim() : ''; };
    rows.push({ firstName:get('firstName',0), lastName:get('lastName',1), displayName:get('displayName',-1), email:get('email',2), department:get('department',3), jobTitle:get('jobTitle',4) });
  }
  return rows.filter((r)=>r.email || r.displayName || r.firstName || r.lastName);
}

/* small inline icons */
export const Ico = ({ d, size=18, sw=2, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}>
    {children || <path d={d} />}
  </svg>
);
