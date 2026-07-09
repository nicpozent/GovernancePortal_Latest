/* Extracted from app.jsx — presentational components (misc). */
import * as React from 'react';
const { useState } = React;
import { api } from '../api.js';
import { Ico, typePill, fmtDate, fmtDT } from '../ui.jsx';
import { Empty } from './common.jsx';

export function MySignatures({ rows }) {
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--ce6e8ee)', borderRadius:'14px', overflow:'hidden', maxWidth:'880px' }}>
      <div style={{ display:'grid', gridTemplateColumns:'2.4fr 1fr 1.2fr 1fr', gap:'14px', padding:'13px 22px', background:'var(--cf8f9fc)', borderBottom:'1px solid var(--ceceef4)', font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.06em', color:'var(--c9aa1b2)', textTransform:'uppercase' }}>
        <div>Document</div><div>Version</div><div>Signature</div><div>Date</div>
      </div>
      {rows.map((s,i)=>(
        <div key={i} style={{ display:'grid', gridTemplateColumns:'2.4fr 1fr 1.2fr 1fr', gap:'14px', padding:'15px 22px', borderBottom:'1px solid var(--cf3f4f8)', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', minWidth:0 }}><span style={typePill(s.type)}>{s.type}</span><span style={{ font:'600 13.5px/1.3 "IBM Plex Sans"', color:'var(--c23283a)' }}>{s.policy}</span></div>
          <div style={{ font:'500 12.5px/1 "IBM Plex Mono",monospace', color:'var(--c54607a)' }}>{s.version}</div>
          <div style={{ font:'400 13px/1.3 "IBM Plex Sans"', color:'var(--c54607a)' }}>{s.name}</div>
          <div style={{ font:'400 12.5px/1 "IBM Plex Mono",monospace', color:'var(--c8a92a6)' }}>{s.date}</div>
        </div>
      ))}
      {!rows.length && <Empty msg="You haven't signed anything yet." />}
    </div>
  );
}

/* ============================ overlays ============================ */

export function AuditLog({ rows, onBackup, backingUp }) {
  const fmtAt = (v) => { const d = new Date(v); return isNaN(d) ? '—' : fmtDT(d); };
  const actionColor = (a) => a.includes('archive')||a.includes('remove')||a.includes('delete') ? 'var(--cc0143c)' : a.includes('create')||a.includes('add') ? 'var(--c1f7a5c)' : 'var(--c213a9e)';
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
        <div style={{ font:'400 13px/1.5 "IBM Plex Sans"', color:'var(--c7b8294)' }}>Every administrative action is recorded (append-only).</div>
        <button onClick={onBackup} disabled={backingUp} style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c213a9e)', borderRadius:'10px', padding:'10px 16px', font:'600 12.5px/1 "IBM Plex Sans"', cursor:backingUp?'not-allowed':'pointer' }}>
          <Ico size={15} sw={1.9}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></Ico>{backingUp ? 'Preparing…' : 'Download backup (.sql)'}
        </button>
      </div>
      <div style={{ background:'var(--surface)', border:'1px solid var(--ce6e8ee)', borderRadius:'14px', overflow:'hidden' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1.4fr 1.4fr 1fr', gap:'14px', padding:'13px 22px', background:'var(--cf8f9fc)', borderBottom:'1px solid var(--ceceef4)', font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.06em', color:'var(--c9aa1b2)', textTransform:'uppercase' }}>
        <div>When</div><div>Actor</div><div>Action</div><div>Target</div>
      </div>
      {rows.map((r)=>(
        <div key={r.id} style={{ display:'grid', gridTemplateColumns:'1.4fr 1.4fr 1.4fr 1fr', gap:'14px', padding:'13px 22px', borderBottom:'1px solid var(--cf3f4f8)', alignItems:'center' }}>
          <div style={{ font:'400 12px/1.3 "IBM Plex Mono",monospace', color:'var(--c8a92a6)' }}>{fmtAt(r.at)}</div>
          <div style={{ font:'500 13px/1.3 "IBM Plex Sans"', color:'var(--c23283a)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.actor_name||'—'}</div>
          <div><span style={{ font:'600 11.5px/1 "IBM Plex Mono",monospace', color:actionColor(r.action), background:actionColor(r.action)+'14', padding:'4px 9px', borderRadius:'6px' }}>{r.action}</span></div>
          <div style={{ font:'400 12.5px/1.3 "IBM Plex Sans"', color:'var(--c54607a)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.target||'—'}</div>
        </div>
      ))}
      {!rows.length && <Empty msg="No audit entries yet." />}
    </div>
    </div>
  );
}

export function Backups({ backups, backingUp, onCreate, onDownloadLive, onDownloadStored }) {
  const kb = (n) => n >= 1048576 ? (n/1048576).toFixed(1)+' MB' : n >= 1024 ? Math.round(n/1024)+' KB' : (n||0)+' B';
  const fmtAt = (v) => { const d = new Date(v); return isNaN(d) ? '—' : fmtDT(d); };
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'22px' }}>
        <div style={{ background:'var(--surface)', border:'1px solid var(--ce6e8ee)', borderRadius:'14px', padding:'20px 22px' }}>
          <div style={{ font:'600 15px/1 "IBM Plex Sans"', color:'var(--c161a26)', marginBottom:'6px' }}>Manual backup</div>
          <div style={{ font:'400 12.5px/1.5 "IBM Plex Sans"', color:'var(--c7b8294)', marginBottom:'16px' }}>Download a full database dump to your computer (choose where to save it), or create a copy stored on the server.</div>
          <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
            <button onClick={onDownloadLive} disabled={backingUp} style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'none', background:'var(--c213a9e)', color:'#fff', borderRadius:'10px', padding:'11px 16px', font:'600 13px/1 "IBM Plex Sans"', cursor:backingUp?'not-allowed':'pointer' }}>
              <Ico size={15} sw={1.9}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></Ico>{backingUp?'Preparing…':'Download backup'}
            </button>
            <button onClick={onCreate} disabled={backingUp} style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c213a9e)', borderRadius:'10px', padding:'11px 16px', font:'600 13px/1 "IBM Plex Sans"', cursor:backingUp?'not-allowed':'pointer' }}>
              <Ico size={15} sw={2.2} d="M12 5v14M5 12h14" />Create server backup
            </button>
          </div>
        </div>
        <div style={{ background:'var(--surface)', border:'1px solid var(--ce6e8ee)', borderRadius:'14px', padding:'20px 22px' }}>
          <div style={{ font:'600 15px/1 "IBM Plex Sans"', color:'var(--c161a26)', marginBottom:'6px' }}>Automated backups</div>
          <div style={{ font:'400 12.5px/1.6 "IBM Plex Sans"', color:'var(--c7b8294)' }}>The server writes a database backup automatically to <code style={{ font:'600 12px/1 "IBM Plex Mono",monospace', color:'var(--c54607a)' }}>./backups</code> on the host and keeps the 14 most recent. For a full-application backup (code + certs + config + DB), run <code style={{ font:'600 12px/1 "IBM Plex Mono",monospace', color:'var(--c54607a)' }}>backup-all.ps1</code> — schedule it weekly via Windows Task Scheduler.</div>
        </div>
      </div>
      <div style={{ background:'var(--surface)', border:'1px solid var(--ce6e8ee)', borderRadius:'14px', overflow:'hidden' }}>
        <div style={{ display:'grid', gridTemplateColumns:'2.4fr 1fr 1fr', gap:'14px', padding:'13px 22px', background:'var(--cf8f9fc)', borderBottom:'1px solid var(--ceceef4)', font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.06em', color:'var(--c9aa1b2)', textTransform:'uppercase' }}>
          <div>Backup file</div><div>Created</div><div>Size</div>
        </div>
        {backups.map((b)=>(
          <div key={b.name} style={{ display:'grid', gridTemplateColumns:'2.4fr 1fr 1fr', gap:'14px', padding:'13px 22px', borderBottom:'1px solid var(--cf3f4f8)', alignItems:'center' }}>
            <button onClick={()=>onDownloadStored(b.name)} style={{ textAlign:'left', border:'none', background:'transparent', cursor:'pointer', font:'600 13px/1.3 "IBM Plex Sans"', color:'var(--c213a9e)', display:'inline-flex', alignItems:'center', gap:'8px', minWidth:0 }}>
              <Ico size={15} sw={1.9}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></Ico>
              <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{b.name}</span>
            </button>
            <div style={{ font:'400 12px/1 "IBM Plex Mono",monospace', color:'var(--c8a92a6)' }}>{fmtAt(b.at)}</div>
            <div style={{ font:'400 12px/1 "IBM Plex Mono",monospace', color:'var(--c8a92a6)' }}>{kb(b.size)}</div>
          </div>
        ))}
        {!backups.length && <Empty msg="No server backups yet — click “Create server backup”." />}
      </div>
    </div>
  );
}

export const HELP_TOPICS = [
  // ── User topics ──
  { aud:'user', cat:'Getting started', title:'Signing in', keywords:'login sign in microsoft entra sso account access', body:[
    'Open the portal link and click "Sign in with Microsoft". Use your normal Birgma / Biltema work account — there is no separate password for this portal.',
    'After 15 minutes of inactivity you are automatically signed out and will need to sign in again. A warning appears 60 seconds beforehand.' ] },
  { aud:'user', cat:'Policies', title:'Reading and acknowledging a policy', keywords:'read sign acknowledge policy document sharepoint signature', body:[
    'Go to "My policies". Each card shows a policy you are required to read, its status (Action required / Signed / Re-sign required) and any deadline.',
    'Click "Read & sign". Open the document in SharePoint using the link, read it, then tick "I have read and understood", type your first and last name, and click "Sign & acknowledge".',
    'Your signature is time-stamped and records the exact document version. If the policy is later updated, it returns to "Re-sign required" so you acknowledge the new version.' ] },
  { aud:'user', cat:'Policies', title:'Knowledge checks (quizzes)', keywords:'quiz test exam questions pass score retake attempts knowledge check', body:[
    'Some policies include a short knowledge check shown under the document in the Read & sign window. You must pass it before you can sign.',
    'Pick an answer for every question and submit. Your score is shown immediately and saved. You need to reach the pass mark set by your administrator.',
    'If you do not pass you can retake it — up to 3 attempts in total. After 3 unsuccessful attempts the check locks; contact your administrator. Once passed, signing unlocks.' ] },
  { aud:'user', cat:'Deadlines', title:'Due dates and overdue items', keywords:'due date deadline overdue days reminder late', body:[
    'A policy may have a deadline. "My policies" shows your personal due date and turns amber when it is within 7 days and red once overdue.',
    'Rolling deadlines are fair to new joiners: your window starts when you become required, not when the policy was first created.' ] },
  { aud:'user', cat:'History', title:'My signatures', keywords:'history signatures record proof audit my signatures', body:[
    'The "My signatures" page lists everything you have acknowledged, with the version and date — your personal compliance record.' ] },
  { aud:'user', cat:'Privacy', title:'Your data & privacy (GDPR)', keywords:'gdpr privacy data personal ip address timestamp record processing rights', body:[
    'To prove you have read and accepted each policy, procedure, guideline or training, this portal records your name, work email, department, and — each time you sign — the document version, the date and time, and the IP address and browser you signed from. This is necessary so your acknowledgement is reliable evidence of compliance.',
    'Your manager relationship and any knowledge-check scores are also stored. The portal only accesses the governance SharePoint site and your directory profile — nothing more.',
    'You can see everything recorded about your own acknowledgements on the "My signatures" page at any time. If you believe something is incorrect, contact your administrator.' ] },
  { aud:'user', cat:'Privacy', title:'How long your records are kept', keywords:'retention how long kept delete erasure leavers 10 years gdpr right to be forgotten', body:[
    'Acknowledgement, audit and quiz records are kept for at least 10 years. This retention period exists because the records are legal compliance evidence — they may be needed long after a policy was signed, including after someone has left the company.',
    'Because of this, your records are retained even if you leave (this is a recognised exception to the GDPR right to erasure, where data must be kept to meet a legal obligation). Once the retention period has passed, the records are removed under our data-retention process. To see what is held about you, or to ask for a correction or erasure, contact your administrator.' ] },

  // ── Admin topics ──
  { aud:'admin', cat:'Data protection', title:'GDPR — privacy notice, retention & sub-processors', keywords:'gdpr privacy notice retention 10 years erasure leavers microsoft dpa sub-processor data protection ip address', body:[
    'Privacy notice: employees must be told this system records their acknowledgements, including the IP address and timestamp of each signature, and why (reliable compliance evidence). Make sure this is covered in your staff privacy notice — storing the IP is fine, but it must be disclosed.',
    'Retention: acknowledgement, audit and quiz data is kept for at least 10 years as legal compliance evidence. Deletion is NOT automatic — it is performed under your data-retention process using the privileged retention tool (npm run gdpr -- retention). Keep this period in step with your published privacy notice.',
    'Right of access & erasure: satisfy Art. 15/20 with the per-subject DSAR export (GET /api/admin/data-subject/:oid/export, or npm run gdpr -- export). Leavers are retained for audit — a recognised Art. 17 exemption where data is needed for a legal obligation; when a lawful erasure IS required, a DBA runs the privileged erasure tool (personal records deleted, audit entries pseudonymised). Record each such action. See the GDPR Data Rights runbook.',
    'Microsoft as sub-processor: Entra ID, Microsoft Graph and SharePoint are Microsoft services that process this data on your behalf. Ensure your Data Processing Agreement (DPA) with Microsoft covers them — this is standard under your Microsoft 365 agreement.' ] },
  { aud:'admin', cat:'Concepts', title:'How compliance is calculated', keywords:'compliance percentage assigned signed required denominator dashboard', body:[
    'Compliance = signed ÷ required. "Required" people are the active employees who are members of a group the policy is assigned to.',
    'A policy with NO group assignment applies to ALL active employees. A policy assigned to a group with no members shows 0/0 until the group has members.',
    'A signature only counts toward a policy if the signer is in that policy\u2019s assigned group and signed the current version.' ] },
  { aud:'admin', cat:'Policies', title:'Adding, editing and archiving policies', keywords:'policy add edit create sharepoint picker archive restore version due date', body:[
    'Policy library → "Add policy". Give it a name, type, version, pick the document with "Browse SharePoint" (or paste a link), set an optional deadline, and assign it to one or more groups.',
    'Edit re-opens the same form. Archiving removes a policy from the active library and from employees\u2019 lists but keeps all signatures; restore it from the Archived tab. The SharePoint file is never touched.' ] },
  { aud:'admin', cat:'Groups & access', title:'Groups, platform roles and directory mapping', keywords:'groups platform local directory mapping members entra active directory roll up administrators read all', body:[
    'Platform roles (Administrators, Compliance, Read All, All Employees) and local groups grant access and drive policy assignment.',
    'Map on-prem AD / Entra security groups into any group ("Import from Active Directory") — membership rolls up automatically. Or add employees directly with "Manage members".',
    'Groups can be archived (preferred) or, when they have no assignments or mappings, permanently deleted.' ] },
  { aud:'admin', cat:'Employees', title:'Syncing employees & managers', keywords:'employees sync directory entra active directory manager functional legal csv import', body:[
    'Employees → "Sync now" pulls assigned users and groups from the directory, including each person\u2019s legal/local manager.',
    'Set a different functional (real) manager per person with the edit (pencil) button — useful for cross-entity reporting lines.',
    '"Import CSV" bulk-adds local users (optional; AD sync stays primary). Headers firstName/lastName or displayName, email, department, jobTitle are recognised in any order.' ] },
  { aud:'admin', cat:'Quizzes', title:'Building and managing quizzes', keywords:'quiz create edit points pass mark questions options archive restore delete knowledge check', body:[
    'Policy library → "Quiz" on a policy. Set a title and pass mark (%), add questions with 2+ options each, mark the correct answer, and set points per question.',
    'Re-open "Quiz" anytime to modify and re-save (shows the latest version). Archive hides it (signing is no longer gated) and can be restored; Delete is permanent.',
    'Employees take it after reading; it is graded server-side, scores are saved, and signing is blocked until they pass (max 3 attempts).' ] },
  { aud:'admin', cat:'Reporting', title:'Dashboard, drill-down and CSV export', keywords:'dashboard report export csv excel by unit by group department completion who signed', body:[
    'The dashboard has Overview, By unit (department) and By group views. Click a group to see exactly which members have signed and which have not.',
    'Use the scope dropdown next to "Export CSV" to export the full matrix, a single department, or one group. The CSV opens in Excel and lists each required (employee × policy) with status, version and timestamp.' ] },
  { aud:'admin', cat:'Backups', title:'Backups (database and full application)', keywords:'backup restore pg_dump database download automatic weekly disaster recovery', body:[
    'Backups screen: "Download backup" streams a database dump to your computer; "Create server backup" stores one on the server. A daily automatic DB backup is kept (14 most recent).',
    'For a whole-application backup (code + certs + config + database) run backup-all.ps1 on the host; its footer shows how to schedule it weekly with Windows Task Scheduler.' ] },
  { aud:'admin', cat:'Audit', title:'Audit log', keywords:'audit log who did what history admin actions accountability', body:[
    'The Audit log records every administrative action (policy create/edit/archive, group and membership changes, mappings, quiz changes, sync, backups, quiz attempts) with who, when and the target. It is append-only.' ] },
  { aud:'admin', cat:'Installation', title:'Installing the solution (Docker, WSL2, deploy)', keywords:'install setup docker wsl2 vmware esxi deploy compose container windows vm nested virtualization', body:[
    'Full step-by-step — VM prep (enable nested virtualization on ESXi), install WSL2 (wsl --install), install Docker Desktop (WSL2 engine, Linux containers), then deploy: copy the folder, set the two .env files, add TLS certs, and run "docker compose up --build -d".',
    'On a fresh database every schema migration and grant runs automatically — no manual SQL. The complete guide is in INSTALL-GUIDE.md in the deployment package.' ] },
  { aud:'admin', cat:'Installation', title:'Azure / Entra configuration', keywords:'azure entra app registration redirect uri graph permissions sites.selected sharepoint client secret token version mail.send', body:[
    'Two app registrations: the API app (expose access_as_user, create the Governance.Admin role, set requestedAccessTokenVersion 2, generate a client secret) and the SPA app (single-page platform, redirect URI = your https origin).',
    'Grant Microsoft Graph application permissions (User.Read.All, GroupMember.Read.All, Application.Read.All) with admin consent for directory sync, and Sites.Selected + a per-site read grant for SharePoint. Full details in INSTALL-GUIDE.md, Part 5.' ] },
  { aud:'admin', cat:'Security', title:'Security considerations & hardening', keywords:'security tls encryption key vault managed identity secrets port 5432 private endpoint conditional access mfa append-only least privilege', body:[
    'Current model: browser↔server traffic is TLS-encrypted; the database uses a least-privilege app role; signature, audit and quiz-attempt ledgers are append-only; tokens are validated for signature/issuer/audience/tenant/scope; admin actions require the Governance.Admin role; 15-min idle logout and CSP are in place.',
    'Harden for production: drop the 5432 port mapping (DB stays on the internal Docker network), protect .env and certs (they hold the DB superuser password and TLS key — use BitLocker), limit VM/Docker access, and keep off-host access-controlled backups.',
    'Most secure (Azure-native): host on App Service / Container Apps with a Managed Identity (no client secret stored — DefaultAzureCredential uses it automatically), secrets in Azure Key Vault, Azure Database for PostgreSQL behind a Private Endpoint with TLS enforced, and Conditional Access (MFA / compliant device). See IMPLEMENTATION_GUIDE.md §7.' ] },
  { aud:'admin', cat:'Troubleshooting', title:'Common issues', keywords:'troubleshoot 502 invalid_token permission denied sync error quiz error logs', body:[
    '502 on every call → the API crashed; check "docker compose logs --tail=40 api". invalid_token / wrong issuer → set requestedAccessTokenVersion 2 and sign in again.',
    'permission denied for view → grants did not apply; re-run docker-grants.sql. A blank or failing screen after an update usually means the api/web image was not rebuilt — use "docker compose build --no-cache".' ] },
];

export function Help({ isAdmin }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const topics = HELP_TOPICS.filter((t)=> isAdmin ? (t.aud==='admin'||t.aud==='both') : (t.aud==='user'||t.aud==='both'));
  const needle = q.trim().toLowerCase();
  const matches = needle ? topics.filter((t)=> (t.title+' '+t.cat+' '+t.keywords+' '+t.body.join(' ')).toLowerCase().includes(needle)) : topics;
  const cats = []; matches.forEach((t)=>{ if (!cats.includes(t.cat)) cats.push(t.cat); });
  const hi = (text) => {
    if (!needle) return text;
    const i = text.toLowerCase().indexOf(needle); if (i<0) return text;
    return [<React.Fragment key="a">{text.slice(0,i)}</React.Fragment>, <mark key="b" style={{ background:'var(--cfef3c7)', color:'inherit', borderRadius:'3px' }}>{text.slice(i,i+needle.length)}</mark>, <React.Fragment key="c">{text.slice(i+needle.length)}</React.Fragment>];
  };
  return (
    <div style={{ maxWidth:'860px' }}>
      <div style={{ position:'relative', marginBottom:'20px' }}>
        <span style={{ position:'absolute', left:'14px', top:'50%', transform:'translateY(-50%)', color:'var(--c9aa1b2)', display:'flex' }}><Ico size={17}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></Ico></span>
        <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search help — keywords or a phrase (e.g. quiz, backup, invalid_token, sign in)" style={{ width:'100%', border:'1px solid var(--cd8dce6)', borderRadius:'11px', padding:'13px 14px 13px 42px', font:'400 14px/1 "IBM Plex Sans"', outline:'none', boxSizing:'border-box' }} />
      </div>
      {needle && <div style={{ font:'400 12.5px/1 "IBM Plex Mono",monospace', color:'var(--c8a92a6)', marginBottom:'14px' }}>{matches.length} result{matches.length===1?'':'s'} for \u201c{q.trim()}\u201d</div>}
      {cats.map((cat)=>(
        <div key={cat} style={{ marginBottom:'22px' }}>
          <div style={{ font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.09em', textTransform:'uppercase', color:'var(--c9aa1b2)', marginBottom:'11px' }}>{cat}</div>
          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
            {matches.filter((t)=>t.cat===cat).map((t)=>{ const id = t.title; const isOpen = open===id || !!needle; return (
              <div key={id} style={{ background:'var(--surface)', border:'1px solid var(--ce6e8ee)', borderRadius:'12px', overflow:'hidden' }}>
                <button onClick={()=>setOpen(open===id?null:id)} style={{ width:'100%', textAlign:'left', border:'none', background:'transparent', cursor:'pointer', padding:'15px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px' }}>
                  <span style={{ font:'600 14.5px/1.3 "IBM Plex Sans"', color:'var(--c23283a)' }}>{hi(t.title)}</span>
                  <span style={{ color:'var(--caab0c0)', display:'flex', flex:'none', transform:isOpen?'rotate(90deg)':'none', transition:'transform .15s' }}><Ico size={17} d="M9 6l6 6-6 6" /></span>
                </button>
                {isOpen && <div style={{ padding:'0 18px 16px', display:'flex', flexDirection:'column', gap:'10px' }}>
                  {t.body.map((para,i)=>(<p key={i} style={{ margin:0, font:'400 13.5px/1.65 "IBM Plex Sans"', color:'var(--c54607a)' }}>{hi(para)}</p>))}
                </div>}
              </div>
            ); })}
          </div>
        </div>
      ))}
      {!matches.length && <Empty msg={'No help topics match \u201c'+q.trim()+'\u201d. Try a different keyword.'} />}
      {isAdmin && <div style={{ marginTop:'8px', font:'400 12px/1.6 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)', background:'var(--cf6f8fb)', borderRadius:'10px', padding:'14px 16px' }}>The complete installation, Azure setup and security guide also ships as <strong style={{ color:'var(--c54607a)' }}>INSTALL-GUIDE.md</strong> in the deployment package.</div>}
    </div>
  );
}

export function Integrations() {
  const [c, setC] = React.useState(null);
  const [forwardUrl, setForwardUrl] = React.useState('');
  const [forwardToken, setForwardToken] = React.useState('');
  const [tokenDirty, setTokenDirty] = React.useState(false);
  const [forwardEnabled, setForwardEnabled] = React.useState(false);
  const [feedEnabled, setFeedEnabled] = React.useState(false);
  const [newKey, setNewKey] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [testResult, setTestResult] = React.useState(null);
  const load = async () => {
    const d = await api.integrations();
    setC(d); setForwardUrl(d.forwardUrl || ''); setForwardEnabled(d.forwardEnabled); setFeedEnabled(d.feedEnabled);
    setForwardToken(''); setTokenDirty(false); setNewKey('');
  };
  React.useEffect(() => { load().catch(()=>{}); }, []);
  const save = async () => {
    setBusy(true);
    try {
      await api.saveIntegrations({ forwardEnabled, forwardUrl, feedEnabled, ...(tokenDirty ? { forwardToken } : {}) });
      window.__toast && window.__toast('Integration settings saved');
      await load();
    } catch (e) { window.__toast && window.__toast('Save failed: ' + e.message, true); }
    setBusy(false);
  };
  const rotate = async () => {
    try { const r = await api.rotateFeedKey(); setNewKey(r.apiKey); setFeedEnabled(true); await load(); setNewKey(r.apiKey); }
    catch (e) { window.__toast && window.__toast('Failed: ' + e.message, true); }
  };
  const test = async () => {
    setTestResult('...');
    try { const r = await api.testForward(); setTestResult(r.ok ? 'Delivered (HTTP ' + r.status + ')' : ('Failed: ' + (r.error || ('HTTP ' + r.status)))); await load(); }
    catch (e) { setTestResult('Failed: ' + e.message); }
  };
  if (!c) return <div style={{ padding:'60px', textAlign:'center' }}><span style={{ width:'28px', height:'28px', border:'3px solid var(--cd2d7e3)', borderTopColor:'var(--c213a9e)', borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite' }}></span></div>;
  const lbl = { font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.05em', color:'var(--c9aa1b2)', textTransform:'uppercase', marginBottom:'7px' };
  const inp = { width:'100%', border:'1px solid var(--cd8dce6)', borderRadius:'9px', padding:'10px 12px', font:'400 13.5px/1.3 "IBM Plex Sans"', outline:'none', boxSizing:'border-box' };
  const card = { background:'var(--surface)', border:'1px solid var(--ce6e8ee)', borderRadius:'14px', padding:'22px 24px', marginBottom:'18px' };
  const feedUrl = (window.location.origin + '/feed/audit');
  return (
    <div style={{ maxWidth:'780px' }}>
      {/* PUSH */}
      <div style={card}>
        <div style={{ font:'600 15px/1 "IBM Plex Sans"', color:'var(--c161a26)', marginBottom:'5px' }}>Forward events to another system (push)</div>
        <div style={{ font:'400 12.5px/1.6 "IBM Plex Sans"', color:'var(--c7b8294)', marginBottom:'16px' }}>Every audit/business event is POSTed as JSON to your endpoint (SIEM, Logic App, webhook). Fire-and-forget — it never affects portal operations.</div>
        <div style={{ marginBottom:'13px' }}><div style={lbl}>Endpoint URL</div><input value={forwardUrl} onChange={(e)=>setForwardUrl(e.target.value)} placeholder="https://your-system.example.com/ingest" style={inp} /></div>
        <div style={{ marginBottom:'13px' }}><div style={lbl}>Bearer token <span style={{ textTransform:'none', color:'var(--caab0c0)', fontWeight:400 }}>(sent as Authorization header)</span></div><input type="password" value={tokenDirty ? forwardToken : ''} onChange={(e)=>{ setForwardToken(e.target.value); setTokenDirty(true); }} placeholder={c.forwardTokenSet ? '•••••••• (leave blank to keep)' : 'optional'} style={inp} /></div>
        <label style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'16px', cursor:'pointer' }}>
          <input type="checkbox" checked={forwardEnabled} onChange={(e)=>setForwardEnabled(e.target.checked)} style={{ width:'17px', height:'17px', accentColor:'var(--c213a9e)' }} />
          <span style={{ font:'500 13.5px/1.4 "IBM Plex Sans"', color:'var(--c2a3142)' }}>Enable forwarding</span>
        </label>
        <div style={{ display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap' }}>
          <button onClick={save} disabled={busy} style={{ border:'none', background:'var(--c213a9e)', color:'#fff', borderRadius:'10px', padding:'11px 20px', font:'600 13px/1 "IBM Plex Sans"', cursor:busy?'not-allowed':'pointer' }}>Save</button>
          <button onClick={test} style={{ border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c213a9e)', borderRadius:'10px', padding:'11px 18px', font:'600 13px/1 "IBM Plex Sans"', cursor:'pointer' }}>Send test event</button>
          {testResult && <span style={{ font:'500 12.5px/1 "IBM Plex Mono",monospace', color: /Deliv/.test(testResult)?'var(--c1f8a5b)':'var(--cc0143c)' }}>{testResult}</span>}
          {c.lastForwardAt && <span style={{ font:'400 11.5px/1 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)' }}>last: {c.lastForwardStatus} · {fmtDate(c.lastForwardAt)}</span>}
        </div>
      </div>
      {/* PULL */}
      <div style={card}>
        <div style={{ font:'600 15px/1 "IBM Plex Sans"', color:'var(--c161a26)', marginBottom:'5px' }}>Expose an API to consume (pull)</div>
        <div style={{ font:'400 12.5px/1.6 "IBM Plex Sans"', color:'var(--c7b8294)', marginBottom:'16px' }}>External systems read the audit feed with an API key. Supports <code style={{ background:'var(--cf3f4f8)', padding:'1px 5px', borderRadius:'4px' }}>?since=ISO8601</code> and <code style={{ background:'var(--cf3f4f8)', padding:'1px 5px', borderRadius:'4px' }}>?limit=N</code> for incremental polling.</div>
        <label style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'14px', cursor:'pointer' }}>
          <input type="checkbox" checked={feedEnabled} onChange={(e)=>setFeedEnabled(e.target.checked)} style={{ width:'17px', height:'17px', accentColor:'var(--c213a9e)' }} />
          <span style={{ font:'500 13.5px/1.4 "IBM Plex Sans"', color:'var(--c2a3142)' }}>Enable consumer feed</span>
        </label>
        <div style={{ marginBottom:'13px' }}><div style={lbl}>Feed endpoint</div><div style={{ font:'500 12.5px/1.4 "IBM Plex Mono",monospace', color:'var(--c41485a)', background:'var(--cf6f8fb)', border:'1px solid var(--ce6e9f1)', borderRadius:'8px', padding:'10px 12px', wordBreak:'break-all' }}>GET {feedUrl}</div></div>
        <div style={{ marginBottom:'14px' }}><div style={lbl}>API key</div>
          {newKey
            ? <div style={{ font:'500 12.5px/1.4 "IBM Plex Mono",monospace', color:'var(--c1f8a5b)', background:'var(--ce6f3ec)', border:'1px solid var(--ccfe8da)', borderRadius:'8px', padding:'10px 12px', wordBreak:'break-all' }}>{newKey}<div style={{ color:'var(--c54607a)', marginTop:'5px', fontWeight:400 }}>Copy it now — it won't be shown again.</div></div>
            : <div style={{ font:'400 12.5px/1.4 "IBM Plex Sans"', color: c.feedKeySet?'var(--c54607a)':'var(--caab0c0)' }}>{c.feedKeySet ? 'A key is set (hidden). Rotate to issue a new one.' : 'No key yet — generate one.'}</div>}
        </div>
        <div style={{ display:'flex', gap:'12px' }}>
          <button onClick={save} disabled={busy} style={{ border:'none', background:'var(--c213a9e)', color:'#fff', borderRadius:'10px', padding:'11px 20px', font:'600 13px/1 "IBM Plex Sans"', cursor:busy?'not-allowed':'pointer' }}>Save</button>
          <button onClick={rotate} style={{ border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c213a9e)', borderRadius:'10px', padding:'11px 18px', font:'600 13px/1 "IBM Plex Sans"', cursor:'pointer' }}>{c.feedKeySet ? 'Rotate key' : 'Generate key'}</button>
        </div>
        <div style={{ marginTop:'15px', font:'400 11.5px/1.5 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)' }}>Example:<br/>curl -H "Authorization: Bearer &lt;key&gt;" "{feedUrl}?since=2026-01-01T00:00:00Z"</div>
      </div>
    </div>
  );
}

/* ============================ small bits ============================ */
