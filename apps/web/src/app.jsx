/* ============================================================
   Birgma Governance Portal — production SPA
   React + MSAL (Entra ID SSO) + live API.
   Same design as the prototype; data comes from /api/* (proxied
   same-origin by nginx, so no CORS). Runtime config in config.js.
   ============================================================ */
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { csvField, escapeHtml } from './format.js';
import { api, initAuth, currentAccount, signIn, signOut, localSignOut, getToken, CONFIG_OK, IDLE_LOGOUT_MS, API_BASE } from './api.js';
import { pctColor, typePill, statusPill, sourceStyle, seg, tabStyle, chipStyle, fmtDate, fmtDT, initials, parseEmployeeCsv, Ico } from './ui.jsx';

const { useState, useEffect, useRef, useCallback } = React;

/* ============================================================ */
function App() {
  const [phase, setPhase] = useState('loading');   // loading | signedout | error | ready
  const [fatal, setFatal] = useState('');
  const [idleOut, setIdleOut] = useState(false);
  const [idleWarn, setIdleWarn] = useState(false);
  const [me, setMe] = useState(null);
  const [role, setRole] = useState('admin');
  const [view, setView] = useState('dashboard');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const toastErr = useRef(false);
  const tt = useRef(null);

  const [activeType, setActiveType] = useState('All');
  const [empFilter, setEmpFilter] = useState('All');
  const [polTab, setPolTab] = useState('active');
  const [archived, setArchived] = useState([]);
  const [confirmArchive, setConfirmArchive] = useState(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [membersGroup, setMembersGroup] = useState(null);
  const [memberIds, setMemberIds] = useState(new Set());
  const [auditRows, setAuditRows] = useState([]);

  // data buckets
  const [pols, setPols] = useState([]);
  const [emps, setEmps] = useState([]);
  const [grps, setGrps] = useState([]);
  const [dashRows, setDashRows] = useState([]);
  const [byDept, setByDept] = useState([]);
  const [byGroup, setByGroup] = useState([]);
  const [groupDetail, setGroupDetail] = useState(null);   // { group, rows } | null
  const [exporting, setExporting] = useState(false);
  const [exportScope, setExportScope] = useState('all');
  const [backingUp, setBackingUp] = useState(false);
  const [backups, setBackups] = useState([]);
  const [quizState, setQuizState] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [syncInfo, setSyncInfo] = useState(null);
  const [trainings, setTrainings] = useState([]);
  const [trainGroups, setTrainGroups] = useState([]);
  const [trainEdit, setTrainEdit] = useState(null);   // { mode, data } | null
  const [managerData, setManagerData] = useState(null);
  const [mgrReminding, setMgrReminding] = useState(false);
  const sendTeamReminders = async () => {
    if (mgrReminding) return; setMgrReminding(true);
    try { const out = await api.managerReminders(); showToast(out.disabled ? 'Reminders not configured (set GRAPH_MAIL_SENDER)' : ('Reminders sent: ' + out.sent + (out.errors ? (' · ' + out.errors + ' failed') : '')), !!out.disabled || out.errors > 0); }
    catch (e) { showToast('Reminders failed: ' + e.message, true); }
    setMgrReminding(false);
  };
  const [policyHistory, setPolicyHistory] = useState(null);
  const openPolicyHistory = async (p) => {
    setPolicyHistory({ policy: p, rows: null });
    try { const rows = await api.policyVersions(p.id); setPolicyHistory({ policy: p, rows }); }
    catch (e) { showToast('Could not load history: ' + e.message, true); setPolicyHistory(null); }
  };
  const [formerEmps, setFormerEmps] = useState([]);
  const [empTab, setEmpTab] = useState('active');
  const [managerEdit, setManagerEdit] = useState(null);   // employee being edited | null
  const [groupTab, setGroupTab] = useState('active');
  const [archivedGroups, setArchivedGroups] = useState([]);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(null);
  const [recentSigs, setRecentSigs] = useState([]);
  const [mySigs, setMySigs] = useState([]);
  const [platformGroups, setPlatformGroups] = useState([]);
  const [dirGroups, setDirGroups] = useState([]);
  const [dashLayout, setDashLayout] = useState('A');

  // reader / sign
  const [reader, setReader] = useState(null);       // { policy, doc }
  const [signFirst, setSignFirst] = useState('');
  const [signLast, setSignLast] = useState('');
  const [signAgreed, setSignAgreed] = useState(false);

  // drawer + import modal
  const [drawer, setDrawer] = useState(null);       // { type, mode }
  const [form, setForm] = useState({});
  const [importOpen, setImportOpen] = useState(false);
  const [impSel, setImpSel] = useState([]);
  const [impTarget, setImpTarget] = useState(null);
  const [impSearch, setImpSearch] = useState('');
  const [syncing, setSyncing] = useState(false);

  // SharePoint file picker
  const [picker, setPicker] = useState(false);
  const [pkLevel, setPkLevel] = useState('libraries');
  const [pkDrive, setPkDrive] = useState('');
  const [pkDriveName, setPkDriveName] = useState('');
  const [pkPath, setPkPath] = useState('');
  const [pkItems, setPkItems] = useState([]);
  const [pkLoading, setPkLoading] = useState(false);
  const [pkErr, setPkErr] = useState('');

  const showToast = (msg, isErr) => { toastErr.current = !!isErr; setToast(msg); clearTimeout(tt.current); tt.current = setTimeout(()=>setToast(null), 3600); };
  useEffect(() => { window.__toast = showToast; return () => { if (window.__toast === showToast) delete window.__toast; }; });
  const isAdmin = !!(me && me.isAdmin);
  const isManager = !!(me && me.isManager);

  /* ---- boot: auth + whoami ---- */
  useEffect(() => {
    (async () => {
      if (!CONFIG_OK) { setPhase('signedout'); return; }
      try {
        await initAuth();
        if (!currentAccount()) { setPhase('signedout'); return; }
        const m = await api.me();
        setMe(m);
        setRole(m.isAdmin ? 'admin' : m.isManager ? 'manager' : 'employee');
        setView(m.isAdmin ? 'dashboard' : m.isManager ? 'mdashboard' : 'mypolicies');
        setPhase('ready');
      } catch (e) {
        setFatal(e.message || String(e));
        setPhase(currentAccount() ? 'error' : 'signedout');
      }
    })();
  }, []);

  /* ---- per-view data loading ---- */
  const loadView = useCallback(async (v) => {
    setBusy(true);
    try {
      if (v === 'dashboard') {
        const [rows, e, sigs, bd, bg] = await Promise.all([api.dashboard(), api.employees(), api.signatures(), api.dashboardByDept(), api.dashboardByGroup()]);
        setDashRows(rows); setEmps(e); setRecentSigs(sigs); setByDept(bd); setByGroup(bg);
      } else if (v === 'policies') {
        const [p, g, rows] = await Promise.all([api.policies(), api.groups(), api.dashboard()]);
        setPols(p); setGrps(g); setDashRows(rows);
      } else if (v === 'employees') {
        const [e, ss, fm] = await Promise.all([api.employees(), api.syncStatus().catch(()=>null), api.formerEmployees().catch(()=>[])]);
        setEmps(e); setSyncInfo(ss); setFormerEmps(fm);
      } else if (v === 'groups') {
        const [pg, dg, e] = await Promise.all([api.platformGroups(), api.directoryGroups(), api.employees()]);
        setPlatformGroups(pg); setDirGroups(dg); setEmps(e);
      } else if (v === 'audit') {
        setAuditRows(await api.audit());
      } else if (v === 'backups') {
        await loadBackups();
      } else if (v === 'mypolicies') {
        setPols(await api.policies());
      } else if (v === 'mysignatures') {
        setMySigs(await api.signatures());
      } else if (v === 'trainings') {
        const [t, g] = await Promise.all([api.trainings(), api.trainingGroups().catch(()=>[])]);
        setTrainings(t); setTrainGroups(g);
      } else if (v === 'mdashboard') {
        setManagerData(await api.managerDashboard());
      }
    } catch (e) { showToast('Could not load: ' + e.message, true); }
    setBusy(false);
  }, []);

  useEffect(() => { if (phase === 'ready') loadView(view); }, [phase, view, loadView]);

  /* ---- inactivity timeout: local sign-out after 15 min idle ---- */
  useEffect(() => {
    if (phase !== 'ready') return;
    let warnTimer, logoutTimer;
    const onIdle = async () => { await localSignOut(); setMe(null); setIdleWarn(false); setIdleOut(true); setPhase('signedout'); };
    const reset = () => {
      clearTimeout(warnTimer); clearTimeout(logoutTimer); setIdleWarn(false);
      warnTimer = setTimeout(() => setIdleWarn(true), Math.max(0, IDLE_LOGOUT_MS - 60_000));
      logoutTimer = setTimeout(onIdle, IDLE_LOGOUT_MS);
    };
    const evts = ['mousemove', 'mousedown', 'keydown', 'scroll', 'wheel', 'touchstart', 'click'];
    evts.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { clearTimeout(warnTimer); clearTimeout(logoutTimer); evts.forEach((e) => window.removeEventListener(e, reset)); };
  }, [phase]);

  /* ---- actions ---- */
  const go = (v) => { setReader(null); setDrawer(null); setView(v); };
  const switchRole = (r) => {
    setRole(r); setReader(null); setDrawer(null); setActiveType('All');
    setView(r === 'employee' ? 'mypolicies' : r === 'manager' ? 'mdashboard' : 'dashboard');
  };

  const openReader = async (p) => {
    const nm = (me && me.profile && me.profile.display_name) || (me && me.identity && me.identity.name) || '';
    const parts = nm.split(' ');
    setReader({ policy: p, doc: null });
    setSignFirst(parts[0] || ''); setSignLast(parts.slice(1).join(' ') || ''); setSignAgreed(false);
    setQuizState(null);
    try {
      const out = await api.getQuiz(p.id);
      if (out && out.quiz) {
        setQuizState({ loading:false, questions: out.questions || [], passPct: out.quiz.passPct || 80, attemptsUsed: out.attemptsUsed || 0, maxAttempts: out.maxAttempts || 3, passed: !!out.passed, answers: {}, result: null });
      }
    } catch (e) { /* no quiz / load error → no gate */ }
    const isTraining = p.doc_type === 'Training' || p.source === 'Upload';
    if (isTraining) {
      try {
        const token = await getToken();
        const res = await fetch(API_BASE + '/api/policies/' + p.id + '/file', { headers: { Authorization: 'Bearer ' + token } });
        if (res.ok) {
          const blob = await res.blob();
          const fileUrl = URL.createObjectURL(blob);
          setReader((r) => r ? { ...r, doc: { training: true, fileUrl, mime: blob.type, name: p.upload_name } } : r);
        } else { setReader((r) => r ? { ...r, doc: { training: true, error: true } } : r); }
      } catch (_) { setReader((r) => r ? { ...r, doc: { training: true, error: true } } : r); }
      return;
    }
    try { const doc = await api.document(p.id); setReader((r) => r ? { ...r, doc } : r); } catch (_) {}
  };
  const setQuizAnswer = (qid, idx) => setQuizState((s) => ({ ...s, answers: { ...s.answers, [qid]: idx } }));
  const retryQuiz = () => setQuizState((s) => ({ ...s, result: null, answers: {} }));
  const submitQuizAttempt = async () => {
    const p = reader.policy;
    try {
      const out = await api.submitQuiz(p.id, quizState.answers);
      setQuizState((s) => ({ ...s, result: out, passed: out.passed, attemptsUsed: out.attemptNo }));
      if (out.passed) showToast('Quiz passed — ' + out.pct + '%'); else showToast('Quiz not passed — ' + out.pct + '%', true);
    } catch (e) { showToast(e.message, true); }
  };
  const submitSign = async () => {
    const p = reader.policy; const fullName = (signFirst + ' ' + signLast).trim();
    try {
      await api.sign(p.id, fullName);
      const bestPct = (quizState && quizState.result && quizState.result.pct) || (quizState && quizState.passed ? quizState.passPct : null);
      setReader(null);
      setReceipt({ name: fullName, policy: p.name, version: p.version || '', type: p.doc_type, at: new Date(), quizPct: p.has_quiz || (quizState && quizState.questions && quizState.questions.length) ? bestPct : null });
      loadView(view);
    }
    catch (e) { showToast('Could not sign: ' + e.message, true); }
  };

  const syncNow = async () => {
    if (syncing) return; setSyncing(true);
    try { const out = await api.sync(); showToast('Directory synced · ' + ((out && out.added) || 0) + ' added, ' + ((out && out.updated) || 0) + ' updated'); await loadView('employees'); }
    catch (e) { showToast('Sync failed: ' + e.message, true); }
    setSyncing(false);
  };

  const openDrawer = (type, mode, data) => {
    let f;
    if (type === 'policy') {
      f = mode === 'edit'
        ? { id:data.id, name:data.name, url:data.sharepoint_url||'', type:data.doc_type, version:data.version, driveId:data.sharepoint_drive_id||null, itemId:data.sharepoint_item_id||null, dueMode:(data.due_date?'fixed':(data.due_days!=null?'rolling':'none')), dueDate:(data.due_date?String(data.due_date).slice(0,10):''), dueDays:(data.due_days!=null?String(data.due_days):'30'), reviewDate:(data.review_date?String(data.review_date).slice(0,10):''), ownerOid:(data.owner_oid||''), versionNote:'', groupIds:(data._groupIds||[]).slice() }
        : { name:'', url:'', type:'Policy', version:'v1.0', driveId:null, itemId:null, dueMode:'none', dueDate:'', dueDays:'30', reviewDate:'', ownerOid:((me.profile&&me.profile.oid)||''), versionNote:'', groupIds:[] };
      if (!grps.length) api.groups().then(setGrps).catch(()=>{});
      if (!emps.length) api.employees().then(setEmps).catch(()=>{});
    } else if (type === 'group') {
      f = { name:'', description:'', kind:'Local' };
    } else {
      f = { first:'', last:'', email:'', role:'Unassigned', title:'' };
    }
    setForm(f); setDrawer({ type, mode });
  };
  const setF = (k) => (e) => setForm((o) => ({ ...o, [k]: e.target.value }));
  const toggleGroupId = (id) => setForm((o) => { const a = o.groupIds || []; return { ...o, groupIds: a.includes(id) ? a.filter((x)=>x!==id) : [...a, id] }; });

  const saveDrawer = async () => {
    try {
      if (drawer.type === 'policy') {
        if (drawer.mode === 'edit') { await api.updatePolicy(form.id, { name:form.name, docType:form.type, version:form.version, sharepointUrl:form.url, sharepointDriveId:form.driveId, sharepointItemId:form.itemId, dueDate:form.dueMode==='fixed'?(form.dueDate||null):null, dueDays:form.dueMode==='rolling'?(parseInt(form.dueDays,10)||null):null, reviewDate:form.reviewDate||null, ownerOid:form.ownerOid||null, versionNote:form.versionNote||null, groupIds:form.groupIds }); showToast('Policy updated'); }
        else { await api.createPolicy({ name:form.name, docType:form.type, version:form.version, sharepointUrl:form.url, sharepointDriveId:form.driveId, sharepointItemId:form.itemId, dueDate:form.dueMode==='fixed'?(form.dueDate||null):null, dueDays:form.dueMode==='rolling'?(parseInt(form.dueDays,10)||null):null, reviewDate:form.reviewDate||null, ownerOid:form.ownerOid||null, groupIds:form.groupIds }); showToast('Policy created'); }
      } else if (drawer.type === 'group') {
        if (form.kind === 'Platform') { await api.createPlatformGroup({ name:form.name, description:form.description }); showToast('Platform group created'); }
        else { await api.createGroup({ name:form.name, description:form.description }); showToast('Local group created'); }
      } else {
        await api.addEmployee({ firstName:form.first, lastName:form.last, email:form.email, department:form.role, jobTitle:form.title }); showToast('Local user added');
      }
      setDrawer(null); loadView(view);
    } catch (e) { showToast('Save failed: ' + e.message, true); }
  };

  const openImport = (targetId) => { setImpTarget(targetId || (platformGroups[0] && platformGroups[0].id) || null); setImpSel([]); setImpSearch(''); setImportOpen(true); };
  const doImport = async () => {
    try { for (const adId of impSel) { await api.mapGroup(adId, impTarget); } setImportOpen(false); showToast(impSel.length + ' directory group' + (impSel.length===1?'':'s') + ' mapped'); loadView('groups'); }
    catch (e) { showToast('Mapping failed: ' + e.message, true); }
  };
  const removeMapping = async (adId, pgId) => { try { await api.unmapGroup(adId, pgId); loadView('groups'); } catch (e) { showToast('Failed: ' + e.message, true); } };

  const loadArchived = async () => { try { setArchived(await api.archivedPolicies()); } catch (e) { showToast('Could not load archived: ' + e.message, true); } };
  const switchPolTab = (t) => { setPolTab(t); if (t === 'archived') loadArchived(); };
  const doArchive = async () => {
    const p = confirmArchive; if (!p) return;
    try { await api.archivePolicy(p.id); setConfirmArchive(null); showToast('“' + p.name + '” archived'); loadView('policies'); }
    catch (e) { showToast('Archive failed: ' + e.message, true); }
  };
  const doRestore = async (p) => {
    try { await api.restorePolicy(p.id); showToast('“' + p.name + '” restored'); loadArchived(); }
    catch (e) { showToast('Restore failed: ' + e.message, true); }
  };

  const openMembers = async (g) => {
    setMembersGroup(g); setMembersOpen(true); setMemberIds(new Set());
    try {
      const [all, mem] = await Promise.all([api.employees(), api.groupMembers(g.id)]);
      setEmps(all); setMemberIds(new Set(mem.map((m) => m.oid)));
    } catch (e) { showToast('Could not load members: ' + e.message, true); }
  };
  const toggleMember = async (oid) => {
    const g = membersGroup; if (!g) return; const has = memberIds.has(oid);
    try {
      if (has) { await api.removeGroupMember(g.id, oid); setMemberIds((s) => { const n = new Set(s); n.delete(oid); return n; }); }
      else { await api.addGroupMember(g.id, oid); setMemberIds((s) => new Set(s).add(oid)); }
    } catch (e) { showToast('Failed: ' + e.message, true); }
  };

  const openGroupDetail = async (g) => {
    setGroupDetail({ group: g, rows: null });
    try { const rows = await api.groupDetail(g.id); setGroupDetail({ group: g, rows }); }
    catch (e) { showToast('Could not load group: ' + e.message, true); setGroupDetail(null); }
  };

  const loadArchivedGroups = async () => { try { setArchivedGroups(await api.archivedGroups()); } catch (e) { showToast('Could not load: ' + e.message, true); } };
  const switchGroupTab = (t) => { setGroupTab(t); if (t === 'archived') loadArchivedGroups(); };
  const doArchiveGroup = async (g) => { try { await api.archiveGroup(g.id); showToast('“' + g.name + '” archived'); loadView('groups'); } catch (e) { showToast('Archive failed: ' + e.message, true); } };
  const doRestoreGroup = async (g) => { try { await api.restoreGroup(g.id); showToast('“' + g.name + '” restored'); loadArchivedGroups(); } catch (e) { showToast('Restore failed: ' + e.message, true); } };
  const doDeleteGroup = async () => {
    const g = confirmDeleteGroup; if (!g) return;
    try { await api.deleteGroup(g.id); setConfirmDeleteGroup(null); showToast('“' + g.name + '” deleted'); loadView('groups'); if (groupTab === 'archived') loadArchivedGroups(); }
    catch (e) { showToast(e.message, true); setConfirmDeleteGroup(null); }
  };

  const [quizBuilder, setQuizBuilder] = useState(null);   // { policy, title, passPct, questions, loading } | null
  const archiveTraining = async (t) => {
    try { await api.archiveTraining(t.id); showToast('Training archived'); loadView('trainings'); }
    catch (e) { showToast('Archive failed: ' + e.message, true); }
  };
  const saveTraining = async (fields, file) => {
    try {
      if (fields.id) { await api.updateTraining(fields.id, fields, file); showToast('Training updated'); }
      else { await api.createTraining(fields, file); showToast('Training created'); }
      setTrainEdit(null); loadView('trainings');
    } catch (e) { showToast('Save failed: ' + e.message, true); }
  };

  const openQuizBuilder = async (p) => {
    try {
      const out = await api.getQuiz(p.id);
      const questions = (out.quiz ? out.questions : []).map((q) => ({ prompt: q.prompt, options: (q.options||[]).slice(), correctIndex: q.correctIndex||0, points: q.points||1 }));
      setQuizBuilder({ policy: p, exists: !!out.quiz, archived: !!(out.quiz && out.quiz.archived), title: (out.quiz && out.quiz.title) || 'Knowledge check', passPct: (out.quiz && out.quiz.passPct) || 80, questions: questions.length ? questions : [{ prompt:'', options:['',''], correctIndex:0, points:1 }] });
    } catch (e) { showToast('Could not load quiz: ' + e.message, true); }
  };
  const saveQuiz = async (data) => {
    try { const out = await api.saveQuiz(quizBuilder.policy.id, data); showToast('Quiz saved (' + out.questions + ' questions)'); setQuizBuilder(null); loadView('policies'); }
    catch (e) { showToast('Save failed: ' + e.message, true); }
  };
  const removeQuiz = async () => {
    try { await api.deleteQuiz(quizBuilder.policy.id); showToast('Quiz removed'); setQuizBuilder(null); loadView('policies'); }
    catch (e) { showToast('Delete failed: ' + e.message, true); }
  };
  const archiveQuiz = async () => {
    try { await api.archiveQuiz(quizBuilder.policy.id); showToast('Quiz archived'); setQuizBuilder(null); loadView('policies'); }
    catch (e) { showToast('Archive failed: ' + e.message, true); }
  };
  const restoreQuiz = async () => {
    try { await api.restoreQuiz(quizBuilder.policy.id); showToast('Quiz restored'); setQuizBuilder((s)=>s?{...s, archived:false}:s); }
    catch (e) { showToast('Restore failed: ' + e.message, true); }
  };

  const [sendingReminders, setSendingReminders] = useState(false);
  const sendReminders = async () => {
    if (sendingReminders) return; setSendingReminders(true);
    try { const out = await api.runReminders(); showToast(out.disabled ? 'Reminders not configured (set GRAPH_MAIL_SENDER)' : ('Reminders sent: ' + out.sent + (out.errors ? (' · ' + out.errors + ' failed') : '')), !!out.disabled || out.errors > 0); }
    catch (e) { showToast('Reminders failed: ' + e.message, true); }
    setSendingReminders(false);
  };

  const exportReport = async () => {
    if (exporting) return; setExporting(true);
    try {
      let scope = null, suffix = '';
      if (exportScope.indexOf('dept:') === 0) { const d = exportScope.slice(5); scope = { department: d }; suffix = '-' + d; }
      else if (exportScope.indexOf('group:') === 0) { const id = exportScope.slice(6); scope = { group: id }; const g = byGroup.find((x)=>String(x.id)===id); suffix = '-' + (g ? g.name : 'group'); }
      const rows = await api.complianceReport(scope);
      const cols = ['display_name','email','upn','department','policy','doc_type','current_version','status','signed_version','signed_at','signed_as'];
      const head = ['Employee','Email','UPN','Department','Policy','Type','Current version','Status','Signed version','Signed at','Signed as'];
      const esc = csvField;
      const lines = [head.join(',')].concat(rows.map((r) => cols.map((c) => esc(c === 'signed_at' ? (r[c] ? new Date(r[c]).toISOString() : '') : r[c])).join(',')));
      const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'compliance-report' + suffix.replace(/[^a-z0-9-]+/gi, '_') + '-' + new Date().toISOString().slice(0,10) + '.csv';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      showToast('Report exported (' + rows.length + ' rows)');
    } catch (e) { showToast('Export failed: ' + e.message, true); }
    setExporting(false);
  };

  const loadBackups = async () => { try { setBackups(await api.listBackups()); } catch (e) { showToast('Could not load backups: ' + e.message, true); } };
  const createServerBackup = async () => {
    if (backingUp) return; setBackingUp(true);
    try { await api.createBackup(); showToast('Backup created on server'); await loadBackups(); }
    catch (e) { showToast('Backup failed: ' + e.message, true); }
    setBackingUp(false);
  };
  const downloadStoredBackup = async (name) => {
    try {
      const token = await getToken();
      const res = await fetch(API_BASE + '/api/admin/backups/' + encodeURIComponent(name), { headers: { Authorization: 'Bearer ' + token } });
      if (!res.ok) throw new Error('download failed (' + res.status + ')');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { showToast('Download failed: ' + e.message, true); }
  };

  const downloadBackup = async () => {
    if (backingUp) return; setBackingUp(true);
    try {
      const token = await getToken();
      const res = await fetch(API_BASE + '/api/admin/backup', { headers: { Authorization: 'Bearer ' + token } });
      if (!res.ok) throw new Error('backup failed (' + res.status + ')');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'governance-backup-' + new Date().toISOString().slice(0,19).replace(/[:]/g,'-') + '.sql';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      showToast('Backup downloaded');
    } catch (e) { showToast('Backup failed: ' + e.message, true); }
    setBackingUp(false);
  };

  const importEmployeesCsv = async (file) => {
    try {
      const text = await file.text();
      const rows = parseEmployeeCsv(text);
      if (!rows.length) { showToast('No rows found in CSV', true); return; }
      const out = await api.bulkImportEmployees(rows);
      showToast('Imported ' + out.added + ' user' + (out.added===1?'':'s') + (out.skipped ? (' · ' + out.skipped + ' skipped') : ''));
      loadView('employees');
    } catch (e) { showToast('Import failed: ' + e.message, true); }
  };
  const setFunctionalManager = async (oid, mgrOid) => {
    try { await api.setEmployeeManager(oid, mgrOid || null); showToast('Manager updated'); loadView('employees'); }
    catch (e) { showToast('Failed: ' + e.message, true); }
  };

  const loadPicker = async (drive, path, driveName) => {
    setPkLoading(true); setPkErr('');
    try {
      const out = await api.browseSharePoint(drive, path);
      setPkLevel(out.level); setPkItems(out.items || []); setPkPath(out.path || ''); setPkDrive(drive || '');
      if (!drive) setPkDriveName(''); else if (driveName !== undefined) setPkDriveName(driveName);
    } catch (e) { setPkErr(e.message); setPkItems([]); }
    setPkLoading(false);
  };
  const openPicker = () => { setPicker(true); setPkLevel('libraries'); setPkDrive(''); setPkDriveName(''); setPkPath(''); setPkItems([]); loadPicker('', '', ''); };
  const pickFile = (it) => {
    setForm((o) => ({ ...o, url: it.webUrl, driveId: it.driveId, itemId: it.itemId, name: (o.name && o.name.trim()) ? o.name : it.name.replace(/\.[^.]+$/, '') }));
    setPicker(false);
  };

  /* ============================ render gates ============================ */
  if (phase === 'loading') return <Splash />;
  if (phase === 'signedout' || phase === 'error') return <SignIn onSignIn={signIn} configOk={CONFIG_OK} fatal={phase==='error'?fatal:''} idle={idleOut} />;

  /* ============================ derived data ============================ */
  const TYPES = ['All','Policy','Process','Procedure','Standard','Guideline'];
  const countsById = {}; dashRows.forEach((r) => { countsById[r.id] = r; });

  const persona = {
    name: (me.profile && me.profile.display_name) || (me.identity && me.identity.name) || 'User',
    sub: isAdmin ? 'Administrator' : ((me.profile && me.profile.job_title) || 'Employee'),
  };
  persona.initials = initials(persona.name);

  const titles = {
    dashboard:['Compliance dashboard','Organisation-wide acknowledgement status'],
    policies:['Policy library','Manage governance documents and group assignments'],
    employees:['Employees & directory','Synced from Active Directory & Microsoft Entra ID'],
    groups:['Groups & access','Import directory groups and map them to platform roles'],
    audit:['Audit log','Administrative actions across the portal'],
    integrations:['Integrations','Forward events to another system, or expose an API to consume them'],
    backups:['Backups','Database backups — manual download, server copies, and the weekly schedule'],
    mypolicies:['My policies','Documents you are required to read and acknowledge'],
    mysignatures:['My signatures','Your acknowledgement history'],
    trainings:['Documents','Upload and assign your own trainings, policies and procedures'],
    mdashboard:['Team dashboard','Compliance across your team — policies, procedures and trainings'],
    help:['Help & guides', role==='admin' ? 'Setup, administration and installation — searchable' : 'How to read and acknowledge your policies'],
  };

  // dashboard
  const polRows = dashRows.map((r) => { const assigned = Number(r.assigned) || 0, signed = Number(r.signed) || 0; const pct = assigned ? Math.round(signed/assigned*100) : 0; return { id:r.id, name:r.name, type:r.doc_type, version:r.version, assigned, signed, pct }; });
  const totalReq = polRows.reduce((a,r)=>a+r.assigned,0), totalSigned = polRows.reduce((a,r)=>a+r.signed,0);
  const overall = totalReq ? Math.round(totalSigned/totalReq*100) : 0, pending = totalReq - totalSigned;
  const kpis = [
    { label:'Overall compliance', value:overall+'%', sub:totalSigned+' of '+totalReq+' acknowledgements', accent:'#213a9e' },
    { label:'Active policies', value:String(dashRows.length), sub:'across document types', accent:'#0078c0' },
    { label:'Employees', value:String(emps.length), sub:'synced from AD / Entra ID', accent:'#1f7a5c' },
    { label:'Pending signatures', value:String(pending<0?0:pending), sub:'awaiting acknowledgement', accent:'#d81848' },
  ];
  const recent = recentSigs.slice(0,6).map((s)=>({ name:s.display_name||s.full_name, policy:s.policy_name, version:s.policy_version, date:fmtDate(s.signed_at), initials:initials(s.display_name||s.full_name) }));
  const attention = polRows.slice().sort((a,b)=>a.pct-b.pct).slice(0,4);
  const deptRows = byDept.map((d)=>{ const assigned = Number(d.assigned) || 0, signed = Number(d.signed) || 0; const pct = assigned ? Math.round(signed/assigned*100) : 0; return { role:d.role, count:Number(d.people)||0, pct }; });
  const groupRows = byGroup.map((g)=>{ const assigned = Number(g.assigned)||0, signed = Number(g.signed)||0; const pct = assigned ? Math.round(signed/assigned*100) : 0; return { id:g.id, name:g.name, kind:g.kind, members:Number(g.members)||0, policies:Number(g.policies)||0, assigned, signed, pct, raw:g }; });

  // policy library
  const typeTabs = TYPES.map((t)=>({ t, count: t==='All'?pols.length:pols.filter((p)=>p.doc_type===t).length, on:activeType===t }));
  const fpol = activeType==='All' ? pols : pols.filter((p)=>p.doc_type===activeType);
  const dueMeta = (v) => { if (!v) return null; const d = new Date(v); if (isNaN(d)) return null; const days = Math.ceil((d - new Date(new Date().toDateString())) / 86400000); return { text: fmtDate(v), days, overdue: days < 0, soon: days >= 0 && days <= 7 }; };
  const polCards = fpol.map((p)=>{ const c = countsById[p.id]||{assigned:0,signed:0}; const assigned = Number(c.assigned)||0, signed = Number(c.signed)||0; const pct = assigned?Math.round(signed/assigned*100):0; const due = dueMeta(p.due_date); const dueText = p.due_date ? ('Due '+ (due?due.text:fmtDate(p.due_date)) + (due&&due.overdue?' · overdue':'')) : (p.due_days!=null ? ('Due '+p.due_days+'d after assignment') : null); return { raw:p, id:p.id, name:p.name, type:p.doc_type, version:p.version, url:p.sharepoint_url, owner:p.owner||'—', updated:fmtDate(p.updated_at), due, dueText, dueRolling:(!p.due_date && p.due_days!=null), assigned, signed, pct, groupsText:(p.groups&&p.groups.length)?p.groups.join(', '):'—' }; });
  const archivedCards = archived.map((p)=>({ raw:p, id:p.id, name:p.name, type:p.doc_type, version:p.version, url:p.sharepoint_url, owner:p.owner||'—', archivedOn:fmtDate(p.archived_at) }));

  // employees
  const ROLE_OPTS = Array.from(new Set(emps.map((e)=>e.department).filter(Boolean))).sort();
  const empFilters = ['All', ...ROLE_OPTS];
  const empList = (empFilter==='All'?emps:emps.filter((e)=>e.department===empFilter));
  const adCount = emps.filter((e)=>e.source==='Active Directory').length;
  const entraCount = emps.filter((e)=>e.source==='Entra ID').length;

  // my policies
  const myTypeTabs = TYPES;
  let mine = pols; if (activeType!=='All') mine = mine.filter((p)=>p.doc_type===activeType);
  const labels = { signed:'Signed', pending:'Action required', outdated:'Re-sign required' };
  const myList = mine.map((p)=>{ const st = p.status||'pending'; const s = p.signature; const due = dueMeta(p.personal_due || p.due_date); return { raw:p, id:p.id, name:p.name, type:p.doc_type, version:p.version, owner:p.owner||'—', updated:fmtDate(p.updated_at), due:(st==='signed'?null:due), hasQuiz:!!p.has_quiz, quizPassed:!!p.quiz_passed, quizBest:p.quiz_best_pct, status:st, label:labels[st], signed:st==='signed', cta: st==='signed'?'Re-open':(st==='outdated'?'Re-sign':'Read & sign'), signedLine: s? (s.full_name+'  ·  '+fmtDate(s.signed_at)+'  ·  '+s.policy_version) : '', outdatedNote: st==='outdated'&&s? ('You signed '+s.policy_version+' — current version is '+p.version) : '' }; });
  const myPending = myList.filter((p)=>!p.signed).length, mySignedN = myList.filter((p)=>p.signed).length;

  // my signatures
  const mySigRows = mySigs.slice().map((s)=>({ policy:s.policy_name, version:s.policy_version, date:fmtDate(s.signed_at), name:s.full_name, type:s.doc_type }));

  // groups & access cards
  const platformCards = platformGroups.map((pg)=>({ id:pg.id, name:pg.name, desc:pg.description||'', kind:pg.kind||'Platform', isAdmin: pg.name==='Administrators', memberCount: pg.memberCount||0, mapped:(pg.mapped||[]).map((m)=>({ id:m.id, name:m.name, source:m.source, members:m.members })), isEmpty:!(pg.mapped&&pg.mapped.length) }));
  const importList = dirGroups.filter((a)=>!impSearch || a.name.toLowerCase().includes(impSearch.toLowerCase()));
  const impTargetName = (platformGroups.find((p)=>p.id===impTarget)||{}).name || '';

  /* ============================ layout ============================ */
  const navBtn = (v, label, icon) => {
    const on = view===v;
    return (
      <button onClick={()=>go(v)} style={{ display:'flex', alignItems:'center', gap:'11px', width:'100%', textAlign:'left', border:'none', cursor:'pointer', fontFamily:'"IBM Plex Sans",sans-serif', fontSize:'14px', lineHeight:1, fontWeight:on?600:500, padding:'11px 13px', borderRadius:'10px', marginBottom:'3px', background:on?'#213a9e':'transparent', color:on?'#fff':'#454c5e' }}>
        {icon}{label}
      </button>
    );
  };

  return (
    <div style={{ display:'flex', height:'100vh', width:'100%', overflow:'hidden', background:'#eef1f5' }}>
      {/* sidebar */}
      <aside style={{ width:'264px', flex:'none', background:'#fff', borderRight:'1px solid #e6e8ee', display:'flex', flexDirection:'column', padding:'22px 16px 16px' }}>
        <div style={{ padding:'6px 8px 16px', marginBottom:'14px', borderBottom:'1px solid #eef0f4' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
            <img src="assets/birgma-logo.png" alt="Birgma" style={{ height:'26px', width:'auto', display:'block' }} />
            <span style={{ width:'1px', height:'30px', background:'#e1e4ec', display:'block' }}></span>
            <img src="assets/biltema-logo.png" alt="Biltema" style={{ height:'12px', width:'auto', display:'block' }} />
          </div>
          <div style={{ font:'500 11px/1.3 "IBM Plex Mono",monospace', color:'#9aa1b2', letterSpacing:'.04em', marginTop:'11px' }}>Governance Portal</div>
        </div>

        {role==='admin' && (
          <React.Fragment>
            <div style={{ font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.1em', color:'#9aa1b2', textTransform:'uppercase', padding:'8px 12px 10px' }}>Administration</div>
            {navBtn('dashboard','Dashboard', <Ico><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></Ico>)}
            {navBtn('policies','Policy library', <Ico><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></Ico>)}
            {navBtn('employees','Employees', <Ico><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 4.2A3 3 0 0 1 16 10M21 20c0-2.6-1.6-4.6-4-5.2"/></Ico>)}
            {navBtn('groups','Groups & access', <Ico><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4M3 17l9 4 9-4"/></Ico>)}
            {navBtn('audit','Audit log', <Ico><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></Ico>)}
            {navBtn('integrations','Integrations', <Ico><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="8" cy="7" r="1.6" fill="currentColor"/><circle cx="16" cy="12" r="1.6" fill="currentColor"/><circle cx="9" cy="17" r="1.6" fill="currentColor"/></Ico>)}
            {navBtn('backups','Backups', <Ico><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></Ico>)}
            {navBtn('help','Help & guides', <Ico><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 1 1 4 2.8c-.8.3-1.1.9-1.1 1.7v.3"/><path d="M12 17h.01"/></Ico>)}
          </React.Fragment>
        )}
        {role==='manager' && (
          <React.Fragment>
            <div style={{ font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.1em', color:'#9aa1b2', textTransform:'uppercase', padding:'8px 12px 10px' }}>Training management</div>
            {navBtn('mdashboard','Team dashboard', <Ico><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></Ico>)}
            {navBtn('trainings','Documents', <Ico><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1 2.7 2 6 2s6-1 6-2v-5"/></Ico>)}
            <div style={{ font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.1em', color:'#9aa1b2', textTransform:'uppercase', padding:'18px 12px 10px' }}>My governance</div>
            {navBtn('mypolicies','My policies', <Ico><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v6h6M9 14l2 2 4-4"/></Ico>)}
            {navBtn('mysignatures','My signatures', <Ico><path d="M3 17l4 4 6-10M14 7l3-3 3 3-9 9"/><path d="M3 21h6"/></Ico>)}
            {navBtn('help','Help', <Ico><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 1 1 4 2.8c-.8.3-1.1.9-1.1 1.7v.3"/><path d="M12 17h.01"/></Ico>)}
          </React.Fragment>
        )}
        {role==='employee' && (
          <React.Fragment>
            <div style={{ font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.1em', color:'#9aa1b2', textTransform:'uppercase', padding:'8px 12px 10px' }}>My governance</div>
            {navBtn('mypolicies','My policies', <Ico><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v6h6M9 14l2 2 4-4"/></Ico>)}
            {navBtn('mysignatures','My signatures', <Ico><path d="M3 17l4 4 6-10M14 7l3-3 3 3-9 9"/><path d="M3 21h6"/></Ico>)}
            {navBtn('help','Help', <Ico><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 1 1 4 2.8c-.8.3-1.1.9-1.1 1.7v.3"/><path d="M12 17h.01"/></Ico>)}
          </React.Fragment>
        )}

        <div style={{ marginTop:'auto' }}></div>
        <button onClick={signOut} style={{ display:'flex', alignItems:'center', gap:'10px', border:'1px solid #e6e8ee', background:'#fff', color:'#54607a', borderRadius:'10px', padding:'10px 13px', font:'600 13px/1 "IBM Plex Sans",sans-serif', cursor:'pointer', marginBottom:'12px' }}>
          <Ico size={16}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></Ico>Sign out
        </button>
        <div style={{ borderTop:'1px solid #eef0f4', padding:'14px 12px 4px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ font:'500 11px/1.3 "IBM Plex Mono",monospace', color:'#a7adbd' }}>Birgma Group</span>
          <span style={{ font:'500 11px/1.3 "IBM Plex Mono",monospace', color:'#c2c7d3' }}>v1.0</span>
        </div>
      </aside>

      {/* main column */}
      <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column' }}>
        <header style={{ flex:'none', height:'74px', background:'#fff', borderBottom:'1px solid #e6e8ee', display:'flex', alignItems:'center', gap:'20px', padding:'0 30px' }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ font:'600 19px/1.2 "IBM Plex Sans"', color:'#161a26' }}>{titles[view][0]}</div>
            <div style={{ font:'400 13px/1.3 "IBM Plex Sans"', color:'#7b8294', marginTop:'2px' }}>{titles[view][1]}</div>
          </div>
          {busy && <span style={{ width:'16px', height:'16px', border:'2px solid #d2d7e3', borderTopColor:'#213a9e', borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite' }}></span>}
          {(isAdmin || isManager) && (
            <div style={{ display:'flex', background:'#eef0f4', borderRadius:'11px', padding:'4px', width:isAdmin&&isManager?'330px':'230px' }}>
              <button style={seg(role==='employee')} onClick={()=>switchRole('employee')}>Employee</button>
              {isManager && <button style={seg(role==='manager')} onClick={()=>switchRole('manager')}>Manager</button>}
              {isAdmin && <button style={seg(role==='admin')} onClick={()=>switchRole('admin')}>Admin</button>}
            </div>
          )}
          <div style={{ display:'flex', alignItems:'center', gap:'11px', paddingLeft:'18px', borderLeft:'1px solid #eceef4' }}>
            <div style={{ width:'38px', height:'38px', borderRadius:'50%', background:'#213a9e', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', font:'600 13px/1 "IBM Plex Sans"' }}>{persona.initials}</div>
            <div>
              <div style={{ font:'600 13.5px/1.2 "IBM Plex Sans"', color:'#1a1d29' }}>{persona.name}</div>
              <div style={{ font:'400 11.5px/1.3 "IBM Plex Sans"', color:'#8a92a6' }}>{persona.sub}</div>
            </div>
          </div>
        </header>

        <main style={{ flex:1, overflowY:'auto', padding:'28px 30px 40px' }}>
          {view==='dashboard' && <Dashboard {...{ kpis, polRows, recent, attention, deptRows, groupRows, dashLayout, setDashLayout, onGroup:openGroupDetail, onExport:exportReport, exporting, exportScope, setExportScope, onReminders:sendReminders, sendingReminders }} />}
          {view==='policies' && <PolicyLibrary {...{ typeTabs, setActiveType, polCards, polTab, switchPolTab, archivedCards, openAddPolicy:()=>openDrawer('policy','add'), openEdit:(p)=>openDrawer('policy','edit',{...p.raw,_groupIds:groupIdsFor(p.raw,grps)}), openReader, onArchive:(p)=>setConfirmArchive(p.raw), onRestore:doRestore, onQuiz:(p)=>openQuizBuilder(p.raw), onHistory:(p)=>openPolicyHistory(p.raw) }} />}
          {view==='employees' && <Employees {...{ empFilters, empFilter, setEmpFilter, empList, adCount, entraCount, syncing, syncNow, openAdd:()=>openDrawer('employee','add'), onImport:importEmployeesCsv, onEditManager:(e)=>setManagerEdit(e), syncInfo, formerEmps, empTab, setEmpTab }} />}
          {view==='groups' && <Groups {...{ platformCards, groupTab, switchGroupTab, archivedGroups, openAddGroup:()=>openDrawer('group','add'), openImport, removeMapping, onMembers:openMembers, onArchive:doArchiveGroup, onRestore:doRestoreGroup, onDelete:(g)=>setConfirmDeleteGroup(g) }} />}
          {view==='audit' && <AuditLog rows={auditRows} onBackup={downloadBackup} backingUp={backingUp} />}
          {view==='integrations' && <Integrations />}
          {view==='backups' && <Backups {...{ backups, backingUp, onCreate:createServerBackup, onDownloadLive:downloadBackup, onDownloadStored:downloadStoredBackup }} />}
          {view==='mypolicies' && <MyPolicies {...{ myTypeTabs, activeType, setActiveType, myList, myPending, mySignedN, openReader }} />}
          {view==='mysignatures' && <MySignatures rows={mySigRows} />}
          {view==='trainings' && <Trainings {...{ trainings, onNew:()=>setTrainEdit({ mode:'new' }), onEdit:(t)=>setTrainEdit({ mode:'edit', data:t }), onArchive:archiveTraining, onQuiz:(t)=>openQuizBuilder(t), onHistory:(t)=>openPolicyHistory(t) }} />}
          {view==='mdashboard' && <ManagerDashboard data={managerData} onReminders={sendTeamReminders} reminding={mgrReminding} />}
          {view==='help' && <Help isAdmin={role==='admin'} />}
        </main>
      </div>

      {reader && <Reader {...{ reader, onClose:()=>setReader(null), signFirst, signLast, signAgreed, setSignFirst, setSignLast, setSignAgreed, submitSign, quizState, setQuizAnswer, submitQuizAttempt, retryQuiz }} />}
      {receipt && <ReceiptModal receipt={receipt} onClose={()=>setReceipt(null)} />}
      {policyHistory && <PolicyHistoryModal detail={policyHistory} onClose={()=>setPolicyHistory(null)} />}
      {trainEdit && <TrainingEditor state={trainEdit} groups={trainGroups} onClose={()=>setTrainEdit(null)} onSave={saveTraining} />}
      {importOpen && <ImportModal {...{ onClose:()=>setImportOpen(false), platformGroups, impTarget, setImpTarget, impSearch, setImpSearch, importList, impSel, setImpSel, impTargetName, doImport }} />}
      {drawer && <Drawer {...{ drawer, form, setF, grps, emps, toggleGroupId, roleOpts:ROLE_OPTS, onClose:()=>setDrawer(null), onSave:saveDrawer, onBrowse:openPicker }} />}
      {picker && <SharePointPicker {...{ pkLevel, pkDrive, pkDriveName, pkPath, pkItems, pkLoading, pkErr, onNav:loadPicker, onPick:pickFile, onClose:()=>setPicker(false) }} />}
      {confirmArchive && <ConfirmArchive policy={confirmArchive} onCancel={()=>setConfirmArchive(null)} onConfirm={doArchive} />}
      {membersOpen && <MembersModal {...{ group:membersGroup, emps, memberIds, onToggle:toggleMember, onClose:()=>{ setMembersOpen(false); loadView('groups'); } }} />}
      {groupDetail && <GroupComplianceModal detail={groupDetail} onClose={()=>setGroupDetail(null)} />}
      {confirmDeleteGroup && <ConfirmDeleteGroup group={confirmDeleteGroup} onCancel={()=>setConfirmDeleteGroup(null)} onConfirm={doDeleteGroup} />}
      {managerEdit && <ManagerEditModal employee={managerEdit} emps={emps} onSave={(oid)=>{ setFunctionalManager(managerEdit.oid, oid); setManagerEdit(null); }} onClose={()=>setManagerEdit(null)} />}
      {quizBuilder && <QuizBuilder state={quizBuilder} onSave={saveQuiz} onDelete={removeQuiz} onArchive={archiveQuiz} onRestore={restoreQuiz} onClose={()=>setQuizBuilder(null)} />}
      {idleWarn && <IdleWarning onStay={()=>setIdleWarn(false)} />}
      {toast && <Toast msg={toast} err={toastErr.current} />}
    </div>
  );
}

function ConfirmArchive({ policy, onCancel, onConfirm }) {
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

function groupIdsFor(policy, grps) {
  if (!policy.groups || !grps.length) return [];
  const byName = Object.fromEntries(grps.map((g)=>[g.name, g.id]));
  return policy.groups.map((n)=>byName[n]).filter(Boolean);
}

/* ============================ screens ============================ */
function Dashboard({ kpis, polRows, recent, attention, deptRows, groupRows, dashLayout, setDashLayout, onGroup, onExport, exporting, exportScope, setExportScope, onReminders, sendingReminders }) {
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', font:'500 13px/1 "IBM Plex Mono",monospace', color:'#8a92a6' }}><span style={{ width:'8px', height:'8px', borderRadius:'50%', background:'#1f7a5c' }}></span>Live data</div>
        <div style={{ display:'flex', alignItems:'center', gap:'14px' }}>
          <button onClick={onReminders} disabled={sendingReminders} title="Send acknowledgement reminder emails now" style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'1px solid #e6e8ee', background:'#fff', color:'#41485a', borderRadius:'10px', padding:'10px 14px', font:'600 12.5px/1 "IBM Plex Sans"', cursor:sendingReminders?'not-allowed':'pointer' }}>
            <Ico size={15} sw={1.9}><path d="M4 4h16v12H5.2L4 17.2z"/><path d="M8 9h8M8 12h5"/></Ico>{sendingReminders?'Sending…':'Send reminders'}
          </button>
          <div style={{ display:'flex', alignItems:'center', gap:'7px' }}>
            <select value={exportScope} onChange={(e)=>setExportScope(e.target.value)} style={{ border:'1px solid #e6e8ee', background:'#fff', color:'#41485a', borderRadius:'10px', padding:'9px 11px', font:'500 12.5px/1 "IBM Plex Sans"', cursor:'pointer', maxWidth:'190px' }}>
              <option value="all">All employees</option>
              <optgroup label="By unit">
                {deptRows.map((d)=>(<option key={'d'+d.role} value={'dept:'+d.role}>{d.role}</option>))}
              </optgroup>
              <optgroup label="By group">
                {groupRows.map((g)=>(<option key={'g'+g.id} value={'group:'+g.id}>{g.name}</option>))}
              </optgroup>
            </select>
            <button onClick={onExport} disabled={exporting} style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'none', background:'#213a9e', color:'#fff', borderRadius:'10px', padding:'10px 15px', font:'600 12.5px/1 "IBM Plex Sans"', cursor:exporting?'not-allowed':'pointer' }}>
              <Ico size={15} sw={2}><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></Ico>{exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <span style={{ font:'500 12px/1 "IBM Plex Mono",monospace', color:'#9aa1b2' }}>LAYOUT</span>
            <div style={{ display:'flex', background:'#eef0f4', borderRadius:'10px', padding:'4px', width:'230px' }}>
              <button style={seg(dashLayout==='A')} onClick={()=>setDashLayout('A')}>Overview</button>
              <button style={seg(dashLayout==='B')} onClick={()=>setDashLayout('B')}>By unit</button>
              <button style={seg(dashLayout==='C')} onClick={()=>setDashLayout('C')}>By group</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'16px', marginBottom:'18px' }}>
        {kpis.map((k,i)=>(
          <div key={i} style={{ background:'#fff', border:'1px solid #e6e8ee', borderRadius:'14px', padding:'18px 20px', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', left:0, top:0, bottom:0, width:'4px', background:k.accent }}></div>
            <div style={{ font:'500 12.5px/1.3 "IBM Plex Sans"', color:'#7b8294' }}>{k.label}</div>
            <div style={{ font:'600 32px/1.1 "IBM Plex Sans"', color:'#161a26', margin:'8px 0 4px', letterSpacing:'-.02em' }}>{k.value}</div>
            <div style={{ font:'400 12px/1.3 "IBM Plex Mono",monospace', color:'#9aa1b2' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {dashLayout==='A' ? (
        <div style={{ display:'grid', gridTemplateColumns:'1.7fr 1fr', gap:'18px', alignItems:'start' }}>
          <div style={{ background:'#fff', border:'1px solid #e6e8ee', borderRadius:'14px', padding:'6px 4px 8px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px 12px' }}>
              <div style={{ font:'600 15px/1 "IBM Plex Sans"', color:'#161a26' }}>Compliance by policy</div>
              <div style={{ font:'500 12px/1 "IBM Plex Mono",monospace', color:'#9aa1b2' }}>SIGNED / ASSIGNED</div>
            </div>
            {polRows.map((r)=>(
              <div key={r.id} style={{ display:'flex', alignItems:'center', gap:'14px', padding:'11px 18px', borderTop:'1px solid #f0f1f6' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'9px', marginBottom:'7px' }}><span style={typePill(r.type)}>{r.type}</span><span style={{ font:'600 13.5px/1.2 "IBM Plex Sans"', color:'#23283a', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.name}</span></div>
                  <div style={{ height:'8px', background:'#eef1f5', borderRadius:'5px', overflow:'hidden' }}><div style={{ height:'100%', borderRadius:'5px', width:r.pct+'%', background:pctColor(r.pct), transition:'width .4s' }}></div></div>
                </div>
                <div style={{ width:'46px', textAlign:'right', font:'600 15px/1 "IBM Plex Sans"', color:pctColor(r.pct) }}>{r.pct}%</div>
                <div style={{ width:'54px', textAlign:'right', font:'400 12.5px/1 "IBM Plex Mono",monospace', color:'#9aa1b2' }}>{r.signed}/{r.assigned}</div>
              </div>
            ))}
            {!polRows.length && <Empty msg="No policies yet." />}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'18px' }}>
            <div style={{ background:'#fff', border:'1px solid #e6e8ee', borderRadius:'14px', padding:'18px' }}>
              <div style={{ font:'600 15px/1 "IBM Plex Sans"', color:'#161a26', marginBottom:'14px' }}>Recent signatures</div>
              {recent.map((s,i)=>(
                <div key={i} style={{ display:'flex', alignItems:'center', gap:'11px', padding:'9px 0', borderTop:'1px solid #f3f4f8' }}>
                  <div style={{ width:'32px', height:'32px', flex:'none', borderRadius:'50%', background:'#eef1fb', color:'#213a9e', display:'flex', alignItems:'center', justifyContent:'center', font:'600 11.5px/1 "IBM Plex Sans"' }}>{s.initials}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ font:'600 13px/1.2 "IBM Plex Sans"', color:'#23283a', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.name}</div>
                    <div style={{ font:'400 11.5px/1.3 "IBM Plex Sans"', color:'#8a92a6', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.policy} · {s.version}</div>
                  </div>
                  <div style={{ font:'400 11px/1 "IBM Plex Mono",monospace', color:'#aab0c0', whiteSpace:'nowrap' }}>{s.date}</div>
                </div>
              ))}
              {!recent.length && <Empty msg="No signatures yet." />}
            </div>
            <div style={{ background:'#fff', border:'1px solid #e6e8ee', borderRadius:'14px', padding:'18px' }}>
              <div style={{ font:'600 15px/1 "IBM Plex Sans"', color:'#161a26', marginBottom:'6px' }}>Needs attention</div>
              <div style={{ font:'400 12px/1.3 "IBM Plex Sans"', color:'#8a92a6', marginBottom:'12px' }}>Lowest acknowledgement rates</div>
              {attention.map((a)=>(
                <div key={a.id} style={{ display:'flex', alignItems:'center', gap:'11px', padding:'9px 0', borderTop:'1px solid #f3f4f8' }}>
                  <span style={{ width:'8px', height:'8px', borderRadius:'50%', flex:'none', background:pctColor(a.pct) }}></span>
                  <div style={{ flex:1, minWidth:0, font:'500 13px/1.3 "IBM Plex Sans"', color:'#23283a', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.name}</div>
                  <div style={{ font:'600 13.5px/1 "IBM Plex Sans"', color:pctColor(a.pct) }}>{a.pct}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : dashLayout==='B' ? (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'18px', alignItems:'start' }}>
          <div style={{ background:'#fff', border:'1px solid #e6e8ee', borderRadius:'14px', padding:'18px' }}>
            <div style={{ font:'600 15px/1 "IBM Plex Sans"', color:'#161a26', marginBottom:'4px' }}>Compliance by department</div>
            <div style={{ font:'400 12px/1.3 "IBM Plex Sans"', color:'#8a92a6', marginBottom:'16px' }}>Acknowledgement rate per organisational unit</div>
            {deptRows.map((d,i)=>(
              <div key={i} style={{ padding:'10px 0', borderTop:'1px solid #f3f4f8' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
                  <div style={{ font:'600 13.5px/1 "IBM Plex Sans"', color:'#23283a' }}>{d.role} <span style={{ font:'400 11.5px/1 "IBM Plex Mono",monospace', color:'#aab0c0' }}>· {d.count} people</span></div>
                  <div style={{ font:'600 14px/1 "IBM Plex Sans"', color:pctColor(d.pct) }}>{d.pct}%</div>
                </div>
                <div style={{ height:'9px', background:'#eef1f5', borderRadius:'5px', overflow:'hidden' }}><div style={{ height:'100%', borderRadius:'5px', width:d.pct+'%', background:pctColor(d.pct), transition:'width .4s' }}></div></div>
              </div>
            ))}
            {!deptRows.length && <Empty msg="No department data yet." />}
          </div>
          <div style={{ background:'#fff', border:'1px solid #e6e8ee', borderRadius:'14px', padding:'18px' }}>
            <div style={{ font:'600 15px/1 "IBM Plex Sans"', color:'#161a26', marginBottom:'4px' }}>Compliance by policy</div>
            <div style={{ font:'400 12px/1.3 "IBM Plex Sans"', color:'#8a92a6', marginBottom:'16px' }}>Ranked by acknowledgement rate</div>
            {polRows.slice().sort((a,b)=>a.pct-b.pct).map((r)=>(
              <div key={r.id} style={{ padding:'9px 0', borderTop:'1px solid #f3f4f8', display:'flex', alignItems:'center', gap:'12px' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ font:'500 13px/1.3 "IBM Plex Sans"', color:'#23283a', marginBottom:'7px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.name}</div>
                  <div style={{ height:'7px', background:'#eef1f5', borderRadius:'4px', overflow:'hidden' }}><div style={{ height:'100%', borderRadius:'4px', width:r.pct+'%', background:pctColor(r.pct), transition:'width .4s' }}></div></div>
                </div>
                <div style={{ width:'42px', textAlign:'right', font:'600 13.5px/1 "IBM Plex Sans"', color:pctColor(r.pct) }}>{r.pct}%</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ background:'#fff', border:'1px solid #e6e8ee', borderRadius:'14px', padding:'6px 4px 8px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px 12px' }}>
            <div><div style={{ font:'600 15px/1 "IBM Plex Sans"', color:'#161a26' }}>Compliance by group</div><div style={{ font:'400 12px/1.3 "IBM Plex Sans"', color:'#8a92a6', marginTop:'4px' }}>Members × assigned policies · click a group to see who's signed</div></div>
            <div style={{ font:'500 12px/1 "IBM Plex Mono",monospace', color:'#9aa1b2' }}>SIGNED / REQUIRED</div>
          </div>
          {groupRows.map((g)=>(
            <div key={g.id} onClick={()=>onGroup(g.raw)} style={{ display:'flex', alignItems:'center', gap:'14px', padding:'12px 18px', borderTop:'1px solid #f0f1f6', cursor:'pointer' }} onMouseEnter={(e)=>{e.currentTarget.style.background='#f8f9fc';}} onMouseLeave={(e)=>{e.currentTarget.style.background='transparent';}}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'9px', marginBottom:'7px' }}>
                  <span style={{ font:'600 13.5px/1.2 "IBM Plex Sans"', color:'#23283a' }}>{g.name}</span>
                  <span style={{ display:'inline-block', padding:'2px 7px', borderRadius:'999px', font:'600 9.5px/1.3 "IBM Plex Mono",monospace', letterSpacing:'.04em', textTransform:'uppercase', color: g.kind==='Local'?'#1f7a5c':'#213a9e', background: g.kind==='Local'?'#e6f3ec':'#eef1fb' }}>{g.kind}</span>
                  <span style={{ font:'400 11px/1 "IBM Plex Mono",monospace', color:'#aab0c0' }}>{g.members} members · {g.policies} policies</span>
                </div>
                <div style={{ height:'8px', background:'#eef1f5', borderRadius:'5px', overflow:'hidden' }}><div style={{ height:'100%', borderRadius:'5px', width:g.pct+'%', background:pctColor(g.pct), transition:'width .4s' }}></div></div>
              </div>
              <div style={{ width:'46px', textAlign:'right', font:'600 15px/1 "IBM Plex Sans"', color:pctColor(g.pct) }}>{g.pct}%</div>
              <div style={{ width:'54px', textAlign:'right', font:'400 12.5px/1 "IBM Plex Mono",monospace', color:'#9aa1b2' }}>{g.signed}/{g.assigned}</div>
              <Ico size={17} d="M9 6l6 6-6 6" />
            </div>
          ))}
          {!groupRows.length && <Empty msg="No platform or local groups yet." />}
        </div>
      )}
    </div>
  );
}

function PolicyLibrary({ typeTabs, setActiveType, polCards, polTab, switchPolTab, archivedCards, openAddPolicy, openEdit, openReader, onArchive, onRestore, onQuiz, onHistory }) {
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'18px' }}>
        <div style={{ display:'flex', background:'#eef0f4', borderRadius:'11px', padding:'4px', width:'260px' }}>
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
        <button style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'none', background:'#213a9e', color:'#fff', borderRadius:'10px', padding:'11px 18px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={openAddPolicy}>
          <Ico size={16} sw={2.2} d="M12 5v14M5 12h14" />Add policy
        </button>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
        {polCards.map((p)=>(
          <div key={p.id} style={{ background:'#fff', border:'1px solid #e6e8ee', borderRadius:'14px', padding:'20px 22px', display:'flex', gap:'24px', alignItems:'center' }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:'11px', marginBottom:'9px' }}>
                <span style={typePill(p.type)}>{p.type}</span>
                <span style={{ font:'500 11px/1 "IBM Plex Mono",monospace', color:'#8a92a6', background:'#f3f4f8', padding:'4px 8px', borderRadius:'6px' }}>{p.version}</span>
              </div>
              <div style={{ font:'600 16.5px/1.25 "IBM Plex Sans"', color:'#161a26', marginBottom:'8px' }}>{p.name}</div>
              <div style={{ display:'flex', alignItems:'center', gap:'16px', flexWrap:'wrap', font:'400 12.5px/1.4 "IBM Plex Sans"', color:'#7b8294' }}>
                {p.url && <a href={p.url} target="_blank" rel="noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:'6px', color:'#0078c0', textDecoration:'none', fontWeight:500 }}><Ico size={14}><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></Ico>SharePoint</a>}
                <span>Owner: {p.owner}</span>
                <span>Updated {p.updated}</span>
                <span>Assigned: {p.groupsText}</span>
                <span style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'3px 9px', borderRadius:'999px', font:'600 11px/1.3 "IBM Plex Mono",monospace', color: p.assigned>0?'#1f7a5c':'#9a6712', background: p.assigned>0?'#e6f3ec':'#fbf2df' }}>{p.assigned>0 ? ('applies to '+p.assigned+(p.assigned===1?' person':' people')) : 'reaches no one'}</span>
                {p.dueText && <span style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'3px 9px', borderRadius:'999px', font:'600 11px/1.3 "IBM Plex Mono",monospace', color: (p.due&&p.due.overdue)?'#c0143c':(p.due&&p.due.soon)?'#9a6712':'#54607a', background: (p.due&&p.due.overdue)?'#fbe7ec':(p.due&&p.due.soon)?'#fbf2df':'#eef1f5' }}>{p.dueText}</span>}
              </div>
            </div>
            <div style={{ width:'160px', flex:'none' }}>
              <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:'7px' }}><span style={{ font:'600 18px/1 "IBM Plex Sans"', color:pctColor(p.pct) }}>{p.pct}%</span><span style={{ font:'400 12px/1 "IBM Plex Mono",monospace', color:'#9aa1b2' }}>{p.signed}/{p.assigned}</span></div>
              <div style={{ height:'7px', background:'#eef1f5', borderRadius:'4px', overflow:'hidden' }}><div style={{ height:'100%', borderRadius:'4px', width:p.pct+'%', background:pctColor(p.pct), transition:'width .4s' }}></div></div>
            </div>
            <div style={{ display:'flex', gap:'9px', flex:'none' }}>
              <button style={{ border:'1px solid #e6e8ee', background:'#fff', color:'#41485a', borderRadius:'9px', padding:'9px 14px', font:'600 13px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={()=>openReader(p.raw)}>Preview</button>
              <button style={{ border:'1px solid #e6e8ee', background:'#fff', color:'#213a9e', borderRadius:'9px', padding:'9px 14px', font:'600 13px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={()=>openEdit(p)}>Edit</button>
              <button title="Knowledge check" style={{ border:'1px solid #e6e8ee', background:'#fff', color:'#6d4bd1', borderRadius:'9px', padding:'9px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:'6px', font:'600 13px/1 "IBM Plex Sans"' }} onClick={()=>onQuiz(p)}><Ico size={15} sw={1.9}><path d="M9.1 9a3 3 0 1 1 4 2.8c-.8.3-1.1.9-1.1 1.7v.5"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/></Ico>Quiz</button>
              <button title="Version history" style={{ border:'1px solid #e6e8ee', background:'#fff', color:'#54607a', borderRadius:'9px', padding:'9px 11px', cursor:'pointer', display:'flex', alignItems:'center' }} onClick={()=>onHistory(p)}><Ico size={16} sw={1.9}><path d="M3 3v5h5"/><path d="M3 8a9 9 0 1 0 2.5-5.3L3 8"/><path d="M12 8v5l3 2"/></Ico></button>
              <button title="Archive" style={{ border:'1px solid #f0d6dd', background:'#fff', color:'#c0143c', borderRadius:'9px', padding:'9px 11px', cursor:'pointer', display:'flex', alignItems:'center' }} onClick={()=>onArchive(p)}><Ico size={16} sw={1.9}><path d="M3 7h18M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 7l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7"/></Ico></button>
            </div>
          </div>
        ))}
        {!polCards.length && <Empty msg="No policies in this view. Click “Add policy” to create one." />}
      </div>
      </React.Fragment>
      ) : (
      <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
        {archivedCards.map((p)=>(
          <div key={p.id} style={{ background:'#fbfbfc', border:'1px solid #e6e8ee', borderRadius:'14px', padding:'18px 22px', display:'flex', gap:'24px', alignItems:'center' }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:'11px', marginBottom:'8px' }}>
                <span style={typePill(p.type)}>{p.type}</span>
                <span style={{ font:'500 11px/1 "IBM Plex Mono",monospace', color:'#8a92a6', background:'#f3f4f8', padding:'4px 8px', borderRadius:'6px' }}>{p.version}</span>
                <span style={{ display:'inline-block', padding:'4px 9px', borderRadius:'999px', font:'600 10.5px/1.3 "IBM Plex Mono",monospace', letterSpacing:'.05em', textTransform:'uppercase', color:'#8a92a6', background:'#eef1f5' }}>Archived</span>
              </div>
              <div style={{ font:'600 16px/1.25 "IBM Plex Sans"', color:'#5a6276', marginBottom:'6px' }}>{p.name}</div>
              <div style={{ font:'400 12.5px/1.4 "IBM Plex Sans"', color:'#9aa1b2' }}>Owner: {p.owner} · Archived {p.archivedOn}</div>
            </div>
            <button style={{ border:'1px solid #cdd5f0', background:'#eef1fb', color:'#213a9e', borderRadius:'9px', padding:'9px 16px', font:'600 13px/1 "IBM Plex Sans"', cursor:'pointer', flex:'none', display:'inline-flex', alignItems:'center', gap:'7px' }} onClick={()=>onRestore(p)}><Ico size={15} sw={2}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></Ico>Restore</button>
          </div>
        ))}
        {!archivedCards.length && <Empty msg="No archived policies." />}
      </div>
      )}
    </div>
  );
}

function Employees({ empFilters, empFilter, setEmpFilter, empList, adCount, entraCount, syncing, syncNow, openAdd, onImport, onEditManager, syncInfo, formerEmps, empTab, setEmpTab }) {
  const fileRef = React.useRef(null);
  const syncDot = syncInfo ? (syncInfo.status==='success' ? '#1f7a5c' : syncInfo.status==='error' ? '#c0143c' : '#9a6712') : '#c9cfdd';
  const syncWhen = syncInfo && syncInfo.finished_at ? new Date(syncInfo.finished_at) : null;
  return (
    <div>
      <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display:'none' }} onChange={(e)=>{ const f=e.target.files&&e.target.files[0]; if(f) onImport(f); e.target.value=''; }} />
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'22px' }}>
        <ConnCard color="#1f7a5c" title="Active Directory" sub={'on-prem · '+adCount+' users'} icon={<Ico size={24} sw={1.8}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v16"/></Ico>} />
        <ConnCard color="#0078c0" title="Microsoft Entra ID" sub={'cloud · '+entraCount+' users'} icon={<Ico size={24} sw={1.8} d="M12 3l8 4v5c0 4.5-3 7.5-8 9-5-1.5-8-4.5-8-9V7z" />} />
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'14px', marginBottom:'18px', flexWrap:'wrap' }}>
        <div style={{ display:'flex', background:'#eef0f4', borderRadius:'11px', padding:'4px', width:'300px' }}>
          <button style={seg(empTab==='active')} onClick={()=>setEmpTab('active')}>Active</button>
          <button style={seg(empTab==='former')} onClick={()=>setEmpTab('former')}>Former{formerEmps&&formerEmps.length?(' ('+formerEmps.length+')'):''}</button>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'9px', font:'500 12px/1.4 "IBM Plex Mono",monospace', color:'#8a92a6' }}>
          <span style={{ width:'9px', height:'9px', borderRadius:'50%', background:syncDot, flex:'none' }}></span>
          {syncInfo ? ('Last sync: '+(syncInfo.status||'')+(syncWhen?(' · '+fmtDate(syncWhen)+' '+syncWhen.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})):'')+(syncInfo.status==='success'?(' · +'+(syncInfo.added||0)+' / ~'+(syncInfo.updated||0)):'')) : 'No sync run yet'}
          {syncInfo && syncInfo.status==='error' && syncInfo.error ? <span style={{ color:'#c0143c' }}>— {String(syncInfo.error).slice(0,60)}</span> : null}
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
          <button style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'1px solid #e6e8ee', background:'#fff', color:'#41485a', borderRadius:'10px', padding:'11px 16px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={()=>fileRef.current&&fileRef.current.click()}>
            <Ico size={16} sw={1.9}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15l3 3 3-3"/></Ico>Import CSV
          </button>
          <button style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'1px solid #e6e8ee', background:'#fff', color:'#41485a', borderRadius:'10px', padding:'11px 16px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={openAdd}>
            <Ico size={16} sw={2.2} d="M12 5v14M5 12h14" />Add local user
          </button>
          <button style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'none', background:'#213a9e', color:'#fff', borderRadius:'10px', padding:'11px 18px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={syncNow}>
            {syncing && <span style={{ width:'15px', height:'15px', border:'2px solid rgba(255,255,255,.4)', borderTopColor:'#fff', borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite' }}></span>}
            Sync now
          </button>
        </div>
      </div>
      <div style={{ background:'#fff', border:'1px solid #e6e8ee', borderRadius:'14px', overflow:'hidden' }}>
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1.2fr 1fr 1.4fr 0.9fr 40px', gap:'14px', padding:'13px 20px', background:'#f8f9fc', borderBottom:'1px solid #eceef4', font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.06em', color:'#9aa1b2', textTransform:'uppercase' }}>
          <div>Employee</div><div>Title</div><div>Department</div><div>Manager</div><div>Source</div><div></div>
        </div>
        {empList.map((e)=>(
          <div key={e.oid||e.email} style={{ display:'grid', gridTemplateColumns:'2fr 1.2fr 1fr 1.4fr 0.9fr 40px', gap:'14px', padding:'13px 20px', borderBottom:'1px solid #f3f4f8', alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'11px', minWidth:0 }}>
              <div style={{ width:'34px', height:'34px', flex:'none', borderRadius:'50%', background:'#eef1fb', color:'#213a9e', display:'flex', alignItems:'center', justifyContent:'center', font:'600 12px/1 "IBM Plex Sans"' }}>{initials(e.display_name)}</div>
              <div style={{ minWidth:0 }}><div style={{ font:'600 13.5px/1.2 "IBM Plex Sans"', color:'#23283a', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{e.display_name}</div><div style={{ font:'400 11.5px/1.3 "IBM Plex Mono",monospace', color:'#9aa1b2', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{e.email||e.upn}</div></div>
            </div>
            <div style={{ font:'400 13px/1.3 "IBM Plex Sans"', color:'#54607a' }}>{e.job_title||'—'}</div>
            <div style={{ font:'500 13px/1.3 "IBM Plex Sans"', color:'#23283a' }}>{e.department}</div>
            <div style={{ minWidth:0 }}>
              <div style={{ font:'500 12.5px/1.3 "IBM Plex Sans"', color: e.functional_manager_name?'#23283a':'#aab0c0', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{e.functional_manager_name || '—'}</div>
              {e.manager_name && <div style={{ font:'400 10.5px/1.3 "IBM Plex Mono",monospace', color:'#aab0c0', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>AD: {e.manager_name}</div>}
            </div>
            <div><span style={sourceStyle(e.source)}>{e.source}</span></div>
            <div><button title="Set functional manager" onClick={()=>onEditManager(e)} style={{ border:'1px solid #e6e8ee', background:'#fff', color:'#54607a', borderRadius:'8px', width:'30px', height:'30px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><Ico size={15} sw={1.9} d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></button></div>
          </div>
        ))}
        {!empList.length && <Empty msg="No employees yet — run “Sync now” to import, or use Import CSV." />}
      </div>
      </React.Fragment>
      )}
    </div>
  );
}

function FormerEmployees({ rows }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #e6e8ee', borderRadius:'14px', overflow:'hidden' }}>
      <div style={{ padding:'14px 20px', borderBottom:'1px solid #eceef4', font:'400 12.5px/1.5 "IBM Plex Sans"', color:'#7b8294' }}>Employees who left or were removed from the directory. They no longer count toward compliance, but their signature history is retained for audit.</div>
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1.3fr 1fr 1fr', gap:'14px', padding:'13px 20px', background:'#f8f9fc', borderBottom:'1px solid #eceef4', font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.06em', color:'#9aa1b2', textTransform:'uppercase' }}>
        <div>Employee</div><div>Department</div><div>Left</div><div>Signatures kept</div>
      </div>
      {(rows||[]).map((e)=>(
        <div key={e.oid} style={{ display:'grid', gridTemplateColumns:'2fr 1.3fr 1fr 1fr', gap:'14px', padding:'13px 20px', borderBottom:'1px solid #f3f4f8', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'11px', minWidth:0 }}>
            <div style={{ width:'34px', height:'34px', flex:'none', borderRadius:'50%', background:'#f0f1f5', color:'#9aa1b2', display:'flex', alignItems:'center', justifyContent:'center', font:'600 12px/1 "IBM Plex Sans"' }}>{initials(e.display_name)}</div>
            <div style={{ minWidth:0 }}><div style={{ font:'600 13.5px/1.2 "IBM Plex Sans"', color:'#54607a', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{e.display_name}</div><div style={{ font:'400 11.5px/1.3 "IBM Plex Mono",monospace', color:'#aab0c0', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{e.email||e.upn}</div></div>
          </div>
          <div style={{ font:'500 13px/1.3 "IBM Plex Sans"', color:'#54607a' }}>{e.department}</div>
          <div style={{ font:'400 12px/1.3 "IBM Plex Mono",monospace', color:'#9aa1b2' }}>{e.deactivated_at?fmtDate(e.deactivated_at):'—'}</div>
          <div style={{ font:'600 13px/1.3 "IBM Plex Sans"', color:'#23283a' }}>{e.signatures}</div>
        </div>
      ))}
      {!(rows||[]).length && <Empty msg="No former employees." />}
    </div>
  );
}
function ConnCard({ color, title, sub, icon }) {
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

function Groups({ platformCards, groupTab, switchGroupTab, archivedGroups, openAddGroup, openImport, removeMapping, onMembers, onArchive, onRestore, onDelete }) {
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'16px' }}>
        <div style={{ display:'flex', background:'#eef0f4', borderRadius:'11px', padding:'4px', width:'260px' }}>
          <button style={seg(groupTab==='active')} onClick={()=>switchGroupTab('active')}>Active</button>
          <button style={seg(groupTab==='archived')} onClick={()=>switchGroupTab('archived')}>Archived</button>
        </div>
      </div>
      {groupTab==='archived' ? (
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px' }}>
        {archivedGroups.map((g)=>(
          <div key={g.id} style={{ background:'#fbfbfc', border:'1px solid #e6e8ee', borderRadius:'14px', padding:'20px 22px', display:'flex', flexDirection:'column', gap:'12px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}><span style={{ font:'600 15px/1.2 "IBM Plex Sans"', color:'#5a6276' }}>{g.name}</span><span style={{ display:'inline-block', padding:'3px 8px', borderRadius:'999px', font:'600 10px/1.3 "IBM Plex Mono",monospace', letterSpacing:'.05em', textTransform:'uppercase', color:'#8a92a6', background:'#eef1f5' }}>Archived</span></div>
            <div style={{ font:'400 12px/1.4 "IBM Plex Mono",monospace', color:'#9aa1b2' }}>{g.kind} · {g.member_count} members · {g.policy_count} policies</div>
            <div style={{ display:'flex', gap:'9px', marginTop:'2px' }}>
              <button style={{ flex:1, border:'1px solid #cdd5f0', background:'#eef1fb', color:'#213a9e', borderRadius:'9px', padding:'9px', font:'600 12.5px/1 "IBM Plex Sans"', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'7px' }} onClick={()=>onRestore(g)}><Ico size={15} sw={2}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></Ico>Restore</button>
              <button title="Delete permanently" style={{ border:'1px solid #f0d6dd', background:'#fff', color:'#c0143c', borderRadius:'9px', padding:'9px 12px', cursor:'pointer', display:'flex', alignItems:'center' }} onClick={()=>onDelete(g)}><Ico size={16} sw={1.9}><path d="M3 7h18M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 7l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7"/></Ico></button>
            </div>
          </div>
        ))}
        {!archivedGroups.length && <Empty msg="No archived groups." />}
      </div>
      ) : (
      <React.Fragment>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'16px', marginBottom:'18px', flexWrap:'wrap' }}>
        <div style={{ font:'400 13px/1.5 "IBM Plex Sans"', color:'#7b8294', maxWidth:'560px' }}>Platform roles and local groups grant access inside the portal. Create a local group, then map on-prem Active Directory or Entra ID security groups into any group — membership rolls up automatically.</div>
        <div style={{ display:'flex', gap:'10px', flex:'none' }}>
          <button style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'1px solid #e6e8ee', background:'#fff', color:'#41485a', borderRadius:'10px', padding:'11px 16px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={openAddGroup}>
            <Ico size={16} sw={2.2} d="M12 5v14M5 12h14" />Create group
          </button>
          <button style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'none', background:'#213a9e', color:'#fff', borderRadius:'10px', padding:'11px 18px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={()=>openImport(null)}>
            <Ico size={16}><path d="M12 3l8 4v5c0 4.5-3 7.5-8 9-5-1.5-8-4.5-8-9V7z"/><path d="M9 11l2 2 4-4"/></Ico>Import from Active Directory
          </button>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px' }}>
        {platformCards.map((g)=>(
          <div key={g.id} style={{ background:'#fff', border:'1px solid '+(g.isAdmin?'#cdd5f0':'#e6e8ee'), borderRadius:'14px', padding:'20px 22px', display:'flex', flexDirection:'column', gap:'14px' }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:'12px' }}>
              <div style={{ width:'40px', height:'40px', flex:'none', borderRadius:'10px', background:'#213a9e0f', color:'#213a9e', display:'flex', alignItems:'center', justifyContent:'center' }}><Ico size={21} sw={1.9}><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4M3 17l9 4 9-4"/></Ico></div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px' }}><span style={{ font:'600 16px/1.2 "IBM Plex Sans"', color:'#161a26' }}>{g.name}</span>{g.isAdmin ? <span style={{ display:'inline-block', padding:'3px 8px', borderRadius:'999px', font:'600 10px/1.3 "IBM Plex Mono",monospace', letterSpacing:'.05em', textTransform:'uppercase', color:'#c0143c', background:'#fbe7ec' }}>Admin role</span> : <span style={{ display:'inline-block', padding:'3px 8px', borderRadius:'999px', font:'600 10px/1.3 "IBM Plex Mono",monospace', letterSpacing:'.05em', textTransform:'uppercase', color: g.kind==='Local'?'#1f7a5c':'#213a9e', background: g.kind==='Local'?'#e6f3ec':'#eef1fb' }}>{g.kind==='Local'?'Local group':'Platform role'}</span>}</div>
                <div style={{ font:'400 12.5px/1.5 "IBM Plex Sans"', color:'#7b8294', marginTop:'5px' }}>{g.desc}</div>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'7px', font:'500 12px/1 "IBM Plex Mono",monospace', color:'#8a92a6' }}>
              <span style={{ display:'inline-flex', alignItems:'center', gap:'7px' }}><Ico size={14}><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 2.7-5 6-5s6 2 6 5"/></Ico>{g.memberCount} effective members</span>
              <button onClick={()=>onMembers(g)} style={{ border:'1px solid #e6e8ee', background:'#fff', color:'#213a9e', borderRadius:'8px', padding:'6px 11px', font:'600 11.5px/1 "IBM Plex Sans"', cursor:'pointer' }}>Manage members</button>
            </div>
            <div style={{ borderTop:'1px solid #f0f1f6', paddingTop:'13px', marginTop:'2px' }}>
              <div style={{ font:'600 10.5px/1 "IBM Plex Mono",monospace', letterSpacing:'.08em', textTransform:'uppercase', color:'#9aa1b2', marginBottom:'10px' }}>Mapped directory groups</div>
              {g.isEmpty && <div style={{ font:'400 12.5px/1.5 "IBM Plex Sans"', color:'#aab0c0', padding:'6px 0 10px' }}>No directory groups mapped yet.</div>}
              <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                {g.mapped.map((m)=>(
                  <div key={m.id} style={{ display:'flex', alignItems:'center', gap:'10px', background:'#f7f8fb', border:'1px solid #eceef4', borderRadius:'9px', padding:'8px 10px 8px 12px' }}>
                    <span style={{ flex:1, minWidth:0, font:'600 12.5px/1.2 "IBM Plex Sans"', color:'#2a3142', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.name}</span>
                    <span style={sourceStyle(m.source)}>{m.source}</span>
                    <span style={{ font:'400 11px/1 "IBM Plex Mono",monospace', color:'#9aa1b2' }}>{m.members}</span>
                    <button style={{ border:'none', background:'transparent', cursor:'pointer', color:'#aab0c0', display:'flex', padding:'2px' }} onClick={()=>removeMapping(m.id, g.id)}><Ico size={15} sw={2.2} d="M6 6l12 12M18 6L6 18" /></button>
                  </div>
                ))}
              </div>
              <button style={{ marginTop:'12px', width:'100%', border:'1px dashed #c9cfdd', background:'#fff', color:'#213a9e', borderRadius:'9px', padding:'9px', font:'600 12.5px/1 "IBM Plex Sans"', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'7px' }} onClick={()=>openImport(g.id)}>
                <Ico size={14} sw={2.2} d="M12 5v14M5 12h14" />Map directory group
              </button>
            </div>
            <div style={{ borderTop:'1px solid #f0f1f6', paddingTop:'12px', display:'flex', justifyContent:'flex-end', gap:'8px' }}>
              {!g.isAdmin && <button title="Archive group" style={{ border:'1px solid #e6e8ee', background:'#fff', color:'#9a6712', borderRadius:'8px', padding:'7px 12px', font:'600 11.5px/1 "IBM Plex Sans"', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'6px' }} onClick={()=>onArchive(g)}><Ico size={14} sw={1.9}><path d="M3 7h18M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 7l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7"/></Ico>Archive</button>}
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

function MyPolicies({ myTypeTabs, activeType, setActiveType, myList, myPending, mySignedN, openReader }) {
  return (
    <div>
      <div style={{ display:'flex', gap:'14px', marginBottom:'20px' }}>
        <StatCard color="#9a6712" value={myPending} label="Awaiting your signature" icon={<Ico size={22}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Ico>} />
        <StatCard color="#1f7a5c" value={mySignedN} label="Signed and up to date" icon={<Ico size={22} d="M20 6L9 17l-5-5" />} />
      </div>
      <div style={{ display:'flex', gap:'9px', flexWrap:'wrap', marginBottom:'18px' }}>
        {myTypeTabs.map((t)=>(<button key={t} style={tabStyle(activeType===t)} onClick={()=>setActiveType(t)}>{t}</button>))}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
        {myList.map((p)=>(
          <div key={p.id} style={{ background:'#fff', border:'1px solid #e6e8ee', borderRadius:'14px', padding:'20px 22px', display:'flex', gap:'22px', alignItems:'center' }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:'11px', marginBottom:'9px' }}>
                <span style={typePill(p.type)}>{p.type}</span>
                <span style={{ font:'500 11px/1 "IBM Plex Mono",monospace', color:'#8a92a6', background:'#f3f4f8', padding:'4px 8px', borderRadius:'6px' }}>{p.version}</span>
                <span style={statusPill(p.status)}>{p.label}</span>
                {p.hasQuiz && <span style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'4px 9px', borderRadius:'999px', font:'600 10.5px/1.3 "IBM Plex Mono",monospace', letterSpacing:'.04em', textTransform:'uppercase', color: p.quizPassed?'#1f7a5c':'#6d4bd1', background: p.quizPassed?'#e6f3ec':'#f6f3fd' }}>{p.quizPassed ? ('Quiz '+(p.quizBest!=null?p.quizBest+'%':'passed')) : 'Quiz required'}</span>}
              </div>
              <div style={{ font:'600 16.5px/1.25 "IBM Plex Sans"', color:'#161a26', marginBottom:'6px' }}>{p.name}</div>
              <div style={{ font:'400 13px/1.5 "IBM Plex Sans"', color:'#7b8294' }}>Owner: {p.owner} · Updated {p.updated}{p.due ? ' · ' : ''}{p.due && <span style={{ fontWeight:600, color: p.due.overdue?'#c0143c':p.due.soon?'#9a6712':'#54607a' }}>Due {p.due.text}{p.due.overdue?' (overdue)':''}</span>}</div>
              {p.signed && (
                <div style={{ display:'inline-flex', alignItems:'center', gap:'8px', marginTop:'12px', background:'#f3f8f5', border:'1px solid #dcebe3', borderRadius:'9px', padding:'8px 13px', font:'500 12.5px/1 "IBM Plex Sans"', color:'#1f7a5c' }}>
                  <Ico size={15} sw={2.4} d="M20 6L9 17l-5-5" />Signed by {p.signedLine}
                </div>
              )}
              {p.outdatedNote && <div style={{ marginTop:'10px', font:'500 12px/1.3 "IBM Plex Mono",monospace', color:'#c0143c' }}>{p.outdatedNote}</div>}
            </div>
            <div style={{ flex:'none' }}>
              <button style={{ border:'none', borderRadius:'10px', padding:'13px 22px', font:'600 14px/1 "IBM Plex Sans"', cursor:'pointer', color:'#fff', background:'#213a9e' }} onClick={()=>openReader(p.raw)}>{p.cta}</button>
            </div>
          </div>
        ))}
        {!myList.length && <Empty msg="Nothing to acknowledge right now." />}
      </div>
    </div>
  );
}
function StatCard({ color, value, label, icon }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #e6e8ee', borderRadius:'14px', padding:'16px 20px', flex:1, display:'flex', alignItems:'center', gap:'14px' }}>
      <div style={{ width:'42px', height:'42px', borderRadius:'11px', background:color+'12', color, display:'flex', alignItems:'center', justifyContent:'center' }}>{icon}</div>
      <div><div style={{ font:'600 24px/1 "IBM Plex Sans"', color:'#161a26' }}>{value}</div><div style={{ font:'400 12.5px/1.3 "IBM Plex Sans"', color:'#7b8294' }}>{label}</div></div>
    </div>
  );
}

function MySignatures({ rows }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #e6e8ee', borderRadius:'14px', overflow:'hidden', maxWidth:'880px' }}>
      <div style={{ display:'grid', gridTemplateColumns:'2.4fr 1fr 1.2fr 1fr', gap:'14px', padding:'13px 22px', background:'#f8f9fc', borderBottom:'1px solid #eceef4', font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.06em', color:'#9aa1b2', textTransform:'uppercase' }}>
        <div>Document</div><div>Version</div><div>Signature</div><div>Date</div>
      </div>
      {rows.map((s,i)=>(
        <div key={i} style={{ display:'grid', gridTemplateColumns:'2.4fr 1fr 1.2fr 1fr', gap:'14px', padding:'15px 22px', borderBottom:'1px solid #f3f4f8', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', minWidth:0 }}><span style={typePill(s.type)}>{s.type}</span><span style={{ font:'600 13.5px/1.3 "IBM Plex Sans"', color:'#23283a' }}>{s.policy}</span></div>
          <div style={{ font:'500 12.5px/1 "IBM Plex Mono",monospace', color:'#54607a' }}>{s.version}</div>
          <div style={{ font:'400 13px/1.3 "IBM Plex Sans"', color:'#54607a' }}>{s.name}</div>
          <div style={{ font:'400 12.5px/1 "IBM Plex Mono",monospace', color:'#8a92a6' }}>{s.date}</div>
        </div>
      ))}
      {!rows.length && <Empty msg="You haven't signed anything yet." />}
    </div>
  );
}

/* ============================ overlays ============================ */
function Reader({ reader, onClose, signFirst, signLast, signAgreed, setSignFirst, setSignLast, setSignAgreed, submitSign, quizState, setQuizAnswer, submitQuizAttempt, retryQuiz }) {
  const p = reader.policy; const doc = reader.doc;
  const version = (doc && doc.version) || p.version;
  const url = (doc && doc.webUrl) || p.sharepoint_url;
  const needsQuiz = !!(quizState && !quizState.passed && (quizState.questions || []).length);
  const enable = signAgreed && signFirst.trim() && signLast.trim() && !needsQuiz;
  const [big, setBig] = React.useState(false);
  const stop = (e) => e.stopPropagation();
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(20,26,48,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:'36px', zIndex:50, animation:'ovIn .18s ease' }} onClick={onClose}>
      <div style={{ width:'920px', maxWidth:'100%', maxHeight:'90vh', background:'#fff', borderRadius:'16px', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 24px 60px rgba(10,16,40,.34)', animation:'cardUp .22s ease' }} onClick={stop}>
        <div style={{ flex:'none', padding:'22px 26px', borderBottom:'1px solid #eceef4', display:'flex', alignItems:'flex-start', gap:'16px' }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'11px', marginBottom:'10px' }}><span style={typePill(p.doc_type)}>{p.doc_type}</span><span style={{ font:'500 11px/1 "IBM Plex Mono",monospace', color:'#8a92a6', background:'#f3f4f8', padding:'4px 8px', borderRadius:'6px' }}>{version}</span></div>
            <div style={{ font:'600 21px/1.2 "IBM Plex Sans"', color:'#161a26' }}>{p.name}</div>
            <div style={{ font:'400 12.5px/1.3 "IBM Plex Sans"', color:'#8a92a6', marginTop:'6px' }}>Owner: {p.owner||'—'} · Updated {fmtDate(p.updated_at)}</div>
          </div>
          <button style={{ border:'none', background:'#f3f4f8', width:'36px', height:'36px', borderRadius:'9px', cursor:'pointer', color:'#54607a', display:'flex', alignItems:'center', justifyContent:'center', flex:'none' }} onClick={onClose}><Ico size={18} sw={2.2} d="M6 6l12 12M18 6L6 18" /></button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'26px 30px' }}>
          {doc && doc.training
            ? (doc.error
                ? <div style={{ marginBottom:'22px', font:'400 13px/1.5 "IBM Plex Sans"', color:'#c0143c' }}>Could not load the training file. Please try again.</div>
                : !doc.fileUrl
                  ? <div style={{ marginBottom:'22px', display:'flex', alignItems:'center', justifyContent:'center', height:'120px' }}><span style={{ width:'24px', height:'24px', border:'3px solid #d2d7e3', borderTopColor:'#213a9e', borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite' }}></span></div>
                  : <div style={{ marginBottom:'22px' }}>
                      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:'8px' }}>
                        <button onClick={()=>setBig(true)} style={{ display:'inline-flex', alignItems:'center', gap:'7px', border:'1px solid #e6e8ee', background:'#fff', color:'#213a9e', borderRadius:'8px', padding:'7px 13px', font:'600 12px/1 "IBM Plex Sans"', cursor:'pointer' }}><Ico size={14} sw={2}><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></Ico>Enlarge</button>
                      </div>
                      {(doc.mime||'').startsWith('video')
                        ? <video src={doc.fileUrl} controls style={{ width:'100%', maxHeight:'440px', borderRadius:'11px', background:'#000' }}></video>
                        : (doc.mime||'').startsWith('image')
                          ? <img src={doc.fileUrl} alt={doc.name} style={{ width:'100%', borderRadius:'11px', border:'1px solid #e6e9f1' }} />
                          : (doc.mime||'').includes('pdf')
                            ? <iframe src={doc.fileUrl} title="Training" style={{ width:'100%', height:'440px', border:'1px solid #e6e9f1', borderRadius:'11px' }}></iframe>
                            : <a href={doc.fileUrl} download={doc.name} style={{ display:'flex', alignItems:'center', gap:'13px', background:'#f6f8fb', border:'1px solid #e6e9f1', borderRadius:'11px', padding:'13px 16px', textDecoration:'none' }}><div style={{ width:'34px', height:'34px', borderRadius:'8px', background:'#213a9e12', color:'#213a9e', display:'flex', alignItems:'center', justifyContent:'center', flex:'none' }}><Ico size={18}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></Ico></div><div style={{ flex:1 }}><div style={{ font:'600 13px/1.2 "IBM Plex Sans"', color:'#23283a' }}>Download training material</div><div style={{ font:'400 11.5px/1.3 "IBM Plex Mono",monospace', color:'#9aa1b2' }}>{doc.name}</div></div><Ico size={17}><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></Ico></a>}
                      <div style={{ marginTop:'10px', textAlign:'right' }}><a href={doc.fileUrl} download={doc.name} style={{ font:'600 12px/1 "IBM Plex Sans"', color:'#213a9e', textDecoration:'none' }}>Download a copy</a></div>
                    </div>)
            : url
            ? <a href={url} target="_blank" rel="noreferrer" style={{ display:'flex', alignItems:'center', gap:'13px', background:'#f6f8fb', border:'1px solid #e6e9f1', borderRadius:'11px', padding:'13px 16px', textDecoration:'none', marginBottom:'22px' }}>
                <div style={{ width:'34px', height:'34px', borderRadius:'8px', background:'#0078c012', color:'#0078c0', display:'flex', alignItems:'center', justifyContent:'center', flex:'none' }}><Ico size={18}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></Ico></div>
                <div style={{ flex:1, minWidth:0 }}><div style={{ font:'600 13px/1.2 "IBM Plex Sans"', color:'#23283a' }}>Open source document in SharePoint</div><div style={{ font:'400 11.5px/1.3 "IBM Plex Mono",monospace', color:'#9aa1b2', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{url}</div></div>
                <Ico size={17}><path d="M7 17L17 7M9 7h8v8"/></Ico>
              </a>
            : <div style={{ marginBottom:'22px', font:'400 13px/1.5 "IBM Plex Sans"', color:'#8a92a6' }}>No SharePoint link on file for this document.</div>}
          {!(doc && doc.training) && <div style={{ padding:'14px 16px', border:'1px dashed #d2d7e3', borderRadius:'10px', background:'repeating-linear-gradient(135deg,#fafbfd,#fafbfd 9px,#f3f5f9 9px,#f3f5f9 18px)', font:'400 11.5px/1.5 "IBM Plex Mono",monospace', color:'#9aa1b2', textAlign:'center' }}>The authoritative document is stored in SharePoint. Open it above, then acknowledge below. The version you sign is captured automatically ({version}).</div>}
          {quizState && <QuizTake quizState={quizState} alreadyPassed={quizState.passed && !quizState.result} bestPct={p.quiz_best_pct} onAnswer={setQuizAnswer} onSubmit={submitQuizAttempt} onRetry={retryQuiz} />}
        </div>
        <div style={{ flex:'none', borderTop:'1px solid #eceef4', background:'#fafbfd', padding:'20px 26px' }}>
          <label style={{ display:'flex', alignItems:'flex-start', gap:'11px', cursor:'pointer', marginBottom:'16px' }}>
            <input type="checkbox" checked={signAgreed} onChange={(e)=>setSignAgreed(e.target.checked)} style={{ width:'19px', height:'19px', marginTop:'1px', accentColor:'#213a9e', flex:'none', cursor:'pointer' }} />
            <span style={{ font:'500 13.5px/1.5 "IBM Plex Sans"', color:'#2a3142' }}>I have read and understood the {p.name} ({version})</span>
          </label>
          {needsQuiz && <div style={{ font:'500 12px/1.4 "IBM Plex Sans"', color:'#9a6712', marginBottom:'14px', marginTop:'-6px' }}>Pass the knowledge check above to enable signing.</div>}
          <div style={{ display:'flex', gap:'14px', alignItems:'flex-end', flexWrap:'wrap' }}>
            <div style={{ flex:1, minWidth:'130px' }}>
              <div style={{ font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.05em', color:'#9aa1b2', textTransform:'uppercase', marginBottom:'7px' }}>First name</div>
              <input value={signFirst} onChange={(e)=>setSignFirst(e.target.value)} placeholder="First name" style={{ width:'100%', border:'1px solid #d8dce6', borderRadius:'9px', padding:'11px 13px', font:'400 14px/1 "IBM Plex Sans"', color:'#23283a', outline:'none' }} />
            </div>
            <div style={{ flex:1, minWidth:'130px' }}>
              <div style={{ font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.05em', color:'#9aa1b2', textTransform:'uppercase', marginBottom:'7px' }}>Last name</div>
              <input value={signLast} onChange={(e)=>setSignLast(e.target.value)} placeholder="Last name" style={{ width:'100%', border:'1px solid #d8dce6', borderRadius:'9px', padding:'11px 13px', font:'400 14px/1 "IBM Plex Sans"', color:'#23283a', outline:'none' }} />
            </div>
            <button disabled={!enable} style={{ border:'none', borderRadius:'10px', padding:'13px 22px', font:'600 14px/1 "IBM Plex Sans"', cursor:enable?'pointer':'not-allowed', color:'#fff', background:enable?'#213a9e':'#bcc3d6' }} onClick={submitSign}>Sign &amp; acknowledge</button>
          </div>
          <div style={{ display:'flex', gap:'22px', marginTop:'14px', font:'400 11.5px/1.4 "IBM Plex Mono",monospace', color:'#9aa1b2', flexWrap:'wrap' }}>
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
                : <iframe src={doc.fileUrl} title="Training (enlarged)" style={{ width:'100%', height:'100%', border:'none', borderRadius:'8px', background:'#fff' }}></iframe>}
          </div>
        </div>
      )}
    </div>
  );
}

function ImportModal({ onClose, platformGroups, impTarget, setImpTarget, impSearch, setImpSearch, importList, impSel, setImpSel, impTargetName, doImport }) {
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

function ReachLine({ groupIds }) {
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
    <div style={{ marginTop:'10px', display:'inline-flex', alignItems:'center', gap:'7px', padding:'6px 11px', borderRadius:'8px', font:'600 12px/1 "IBM Plex Sans"', color: none?'#9a6712':'#1f7a5c', background: none?'#fbf2df':'#e6f3ec' }}>
      <Ico size={14} sw={1.9}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></Ico>
      {n === null ? 'Calculating reach\u2026' : none ? 'Reaches no one \u2014 assign a group with members' : ('Reaches ' + n + (n === 1 ? ' person' : ' people'))}
    </div>
  );
}

function Drawer({ drawer, form, setF, grps, emps, toggleGroupId, roleOpts, onClose, onSave, onBrowse }) {
  const stop = (e) => e.stopPropagation();
  const title = drawer.type==='policy' ? (drawer.mode==='edit'?'Edit policy':'New policy') : drawer.type==='group' ? 'Create platform group' : 'Add local user';
  const lbl = { font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.05em', color:'#9aa1b2', textTransform:'uppercase', marginBottom:'8px' };
  const inp = { width:'100%', border:'1px solid #d8dce6', borderRadius:'9px', padding:'11px 13px', font:'400 14px/1 "IBM Plex Sans"', outline:'none' };
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(20,26,48,.4)', display:'flex', justifyContent:'flex-end', zIndex:55, animation:'ovIn .16s ease' }} onClick={onClose}>
      <div style={{ width:'480px', maxWidth:'100%', height:'100%', background:'#fff', display:'flex', flexDirection:'column', boxShadow:'-12px 0 40px rgba(10,16,40,.2)', animation:'drawerIn .22s ease' }} onClick={stop}>
        <div style={{ flex:'none', padding:'22px 26px', borderBottom:'1px solid #eceef4', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ font:'600 18px/1 "IBM Plex Sans"', color:'#161a26' }}>{title}</div>
          <button style={{ border:'none', background:'#f3f4f8', width:'34px', height:'34px', borderRadius:'9px', cursor:'pointer', color:'#54607a', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}><Ico size={17} sw={2.2} d="M6 6l12 12M18 6L6 18" /></button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'24px 26px', display:'flex', flexDirection:'column', gap:'20px' }}>
          {drawer.type==='policy' && (
            <React.Fragment>
              <div><div style={lbl}>Policy name</div><input value={form.name} onChange={setF('name')} placeholder="e.g. Information Security Policy" style={inp} /></div>
              <div style={{ display:'flex', gap:'14px' }}>
                <div style={{ flex:1 }}><div style={lbl}>Type</div>
                  <select value={form.type} onChange={setF('type')} style={{ ...inp, background:'#fff' }}>
                    {['Policy','Process','Procedure','Standard','Guideline'].map((o)=>(<option key={o} value={o}>{o}</option>))}
                  </select>
                </div>
                <div style={{ width:'120px' }}><div style={lbl}>Version</div><input value={form.version} onChange={setF('version')} placeholder="v1.0" style={inp} /></div>
              </div>
              <div>
                <div style={lbl}>Signature deadline <span style={{ textTransform:'none', color:'#aab0c0', fontWeight:400 }}>(optional)</span></div>
                <select value={form.dueMode||'none'} onChange={setF('dueMode')} style={{ ...inp, background:'#fff' }}>
                  <option value="none">No deadline</option>
                  <option value="rolling">Within N days of assignment (fair to new joiners)</option>
                  <option value="fixed">Fixed calendar date</option>
                </select>
                {form.dueMode==='rolling' && <div style={{ display:'flex', alignItems:'center', gap:'9px', marginTop:'10px' }}><span style={{ font:'500 13px/1 "IBM Plex Sans"', color:'#54607a' }}>Sign within</span><input type="number" min="1" value={form.dueDays||''} onChange={setF('dueDays')} style={{ ...inp, width:'90px' }} /><span style={{ font:'500 13px/1 "IBM Plex Sans"', color:'#54607a' }}>days of becoming required</span></div>}
                {form.dueMode==='fixed' && <input type="date" value={form.dueDate||''} onChange={setF('dueDate')} style={{ ...inp, marginTop:'10px' }} />}
              </div>
              <div>
                <div style={lbl}>Review by <span style={{ textTransform:'none', color:'#aab0c0', fontWeight:400 }}>(optional — reminds the owner to revisit)</span></div>
                <input type="date" value={form.reviewDate||''} onChange={setF('reviewDate')} style={inp} />
              </div>
              {drawer.mode==='edit' && <div>
                <div style={lbl}>Version note <span style={{ textTransform:'none', color:'#aab0c0', fontWeight:400 }}>(optional — recorded in version history)</span></div>
                <input value={form.versionNote||''} onChange={setF('versionNote')} placeholder="What changed in this version?" style={inp} />
              </div>}
              <div>
                <div style={lbl}>Owner <span style={{ textTransform:'none', color:'#aab0c0', fontWeight:400 }}>(receives review reminders)</span></div>
                <select value={form.ownerOid||''} onChange={setF('ownerOid')} style={{ ...inp, background:'#fff' }}>
                  <option value="">— Unassigned —</option>
                  {(emps||[]).map((e)=>(<option key={e.oid} value={e.oid}>{e.display_name}{e.department?(' · '+e.department):''}</option>))}
                </select>
              </div>
              <div>
                <div style={lbl}>Policy document</div>
                <button type="button" onClick={onBrowse} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:'9px', border:'1px solid #213a9e', background:'#eef1fb', color:'#213a9e', borderRadius:'9px', padding:'11px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4"/></svg>
                  {form.itemId ? 'Change document' : 'Browse SharePoint'}
                </button>
                {form.url
                  ? <div style={{ marginTop:'10px', display:'flex', alignItems:'center', gap:'9px', background:'#f3f8f5', border:'1px solid #dcebe3', borderRadius:'9px', padding:'9px 12px' }}>
                      <span style={{ color:'#1f7a5c', display:'flex', flex:'none' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M20 6L9 17l-5-5"/></svg></span>
                      <a href={form.url} target="_blank" rel="noreferrer" style={{ flex:1, minWidth:0, font:'500 12px/1.3 "IBM Plex Mono",monospace', color:'#1f7a5c', textDecoration:'none', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{form.url}</a>
                    </div>
                  : <div style={{ marginTop:'8px', font:'400 11.5px/1.4 "IBM Plex Mono",monospace', color:'#aab0c0' }}>No document selected yet.</div>}
                <details style={{ marginTop:'10px' }}>
                  <summary style={{ font:'500 11.5px/1 "IBM Plex Sans"', color:'#8a92a6', cursor:'pointer' }}>Or paste a link manually</summary>
                  <input value={form.url} onChange={setF('url')} placeholder="https://birgmabiltema.sharepoint.com/..." style={{ ...inp, marginTop:'8px', font:'400 13px/1 "IBM Plex Mono",monospace' }} />
                </details>
              </div>
              <div>
                <div style={lbl}>Assign to groups</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'9px' }}>
                  {grps.map((g)=>{ const on = (form.groupIds||[]).includes(g.id); return (
                    <div key={g.id} onClick={()=>toggleGroupId(g.id)} style={{ display:'flex', alignItems:'center', gap:'9px', padding:'9px 12px', borderRadius:'9px', cursor:'pointer', border:'1px solid '+(on?'#213a9e':'#e6e8ee'), background:on?'#eef1fb':'#fff', font:'500 13px/1 "IBM Plex Sans"', color:'#2a3142' }}>
                      <input type="checkbox" checked={on} readOnly style={{ width:'16px', height:'16px', accentColor:'#213a9e', pointerEvents:'none' }} />{g.name}
                    </div>
                  ); })}
                  {!grps.length && <div style={{ gridColumn:'1 / -1', font:'400 12.5px/1.5 "IBM Plex Sans"', color:'#aab0c0' }}>No groups yet — create one under Groups &amp; access.</div>}
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
                  <select value={form.role} onChange={setF('role')} style={{ ...inp, background:'#fff' }}>
                    {['Unassigned', ...roleOpts.filter((r)=>r!=='Unassigned')].map((r)=>(<option key={r} value={r}>{r}</option>))}
                  </select>
                </div>
                <div style={{ flex:1 }}><div style={lbl}>Title</div><input value={form.title} onChange={setF('title')} style={inp} /></div>
              </div>
              <div style={{ font:'400 12px/1.5 "IBM Plex Mono",monospace', color:'#9aa1b2', background:'#f6f8fb', borderRadius:'9px', padding:'12px 14px' }}>Local users are stored in the portal and counted alongside synced directory accounts.</div>
            </React.Fragment>
          )}
          {drawer.type==='group' && (
            <React.Fragment>
              <div><div style={lbl}>Group name</div><input value={form.name} onChange={setF('name')} placeholder="e.g. All Staff" style={inp} /></div>
              <div><div style={lbl}>Description</div><input value={form.description} onChange={setF('description')} placeholder="What this group is for" style={inp} /></div>
              <div><div style={lbl}>Group type</div>
                <select value={form.kind} onChange={setF('kind')} style={{ ...inp, background:'#fff' }}>
                  <option value="Local">Local group — map AD / Entra groups into it</option>
                  <option value="Platform">Platform role — internal authorization role</option>
                </select>
              </div>
              <div style={{ font:'400 12px/1.5 "IBM Plex Mono",monospace', color:'#9aa1b2', background:'#f6f8fb', borderRadius:'9px', padding:'12px 14px' }}>After creating, use “Import from Active Directory” to map on-prem AD or Entra ID security groups into it — members roll up automatically.</div>
            </React.Fragment>
          )}
        </div>
        <div style={{ flex:'none', borderTop:'1px solid #eceef4', padding:'18px 26px', display:'flex', gap:'12px', justifyContent:'flex-end' }}>
          <button style={{ border:'1px solid #e6e8ee', background:'#fff', color:'#54607a', borderRadius:'10px', padding:'11px 20px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={onClose}>Cancel</button>
          <button style={{ border:'none', background:'#213a9e', color:'#fff', borderRadius:'10px', padding:'11px 22px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={onSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

function SharePointPicker({ pkLevel, pkDrive, pkDriveName, pkPath, pkItems, pkLoading, pkErr, onNav, onPick, onClose }) {
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

function MembersModal({ group, emps, memberIds, onToggle, onClose }) {
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

function AuditLog({ rows, onBackup, backingUp }) {
  const fmtAt = (v) => { const d = new Date(v); return isNaN(d) ? '—' : fmtDT(d); };
  const actionColor = (a) => a.includes('archive')||a.includes('remove')||a.includes('delete') ? '#c0143c' : a.includes('create')||a.includes('add') ? '#1f7a5c' : '#213a9e';
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
        <div style={{ font:'400 13px/1.5 "IBM Plex Sans"', color:'#7b8294' }}>Every administrative action is recorded (append-only).</div>
        <button onClick={onBackup} disabled={backingUp} style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'1px solid #e6e8ee', background:'#fff', color:'#213a9e', borderRadius:'10px', padding:'10px 16px', font:'600 12.5px/1 "IBM Plex Sans"', cursor:backingUp?'not-allowed':'pointer' }}>
          <Ico size={15} sw={1.9}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></Ico>{backingUp ? 'Preparing…' : 'Download backup (.sql)'}
        </button>
      </div>
      <div style={{ background:'#fff', border:'1px solid #e6e8ee', borderRadius:'14px', overflow:'hidden' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1.4fr 1.4fr 1fr', gap:'14px', padding:'13px 22px', background:'#f8f9fc', borderBottom:'1px solid #eceef4', font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.06em', color:'#9aa1b2', textTransform:'uppercase' }}>
        <div>When</div><div>Actor</div><div>Action</div><div>Target</div>
      </div>
      {rows.map((r)=>(
        <div key={r.id} style={{ display:'grid', gridTemplateColumns:'1.4fr 1.4fr 1.4fr 1fr', gap:'14px', padding:'13px 22px', borderBottom:'1px solid #f3f4f8', alignItems:'center' }}>
          <div style={{ font:'400 12px/1.3 "IBM Plex Mono",monospace', color:'#8a92a6' }}>{fmtAt(r.at)}</div>
          <div style={{ font:'500 13px/1.3 "IBM Plex Sans"', color:'#23283a', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.actor_name||'—'}</div>
          <div><span style={{ font:'600 11.5px/1 "IBM Plex Mono",monospace', color:actionColor(r.action), background:actionColor(r.action)+'14', padding:'4px 9px', borderRadius:'6px' }}>{r.action}</span></div>
          <div style={{ font:'400 12.5px/1.3 "IBM Plex Sans"', color:'#54607a', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.target||'—'}</div>
        </div>
      ))}
      {!rows.length && <Empty msg="No audit entries yet." />}
    </div>
    </div>
  );
}

function IdleWarning({ onStay }) {
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

function GroupComplianceModal({ detail, onClose }) {
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

function ConfirmDeleteGroup({ group, onCancel, onConfirm }) {
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

function ManagerEditModal({ employee, emps, onSave, onClose }) {
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

function Backups({ backups, backingUp, onCreate, onDownloadLive, onDownloadStored }) {
  const kb = (n) => n >= 1048576 ? (n/1048576).toFixed(1)+' MB' : n >= 1024 ? Math.round(n/1024)+' KB' : (n||0)+' B';
  const fmtAt = (v) => { const d = new Date(v); return isNaN(d) ? '—' : fmtDT(d); };
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'22px' }}>
        <div style={{ background:'#fff', border:'1px solid #e6e8ee', borderRadius:'14px', padding:'20px 22px' }}>
          <div style={{ font:'600 15px/1 "IBM Plex Sans"', color:'#161a26', marginBottom:'6px' }}>Manual backup</div>
          <div style={{ font:'400 12.5px/1.5 "IBM Plex Sans"', color:'#7b8294', marginBottom:'16px' }}>Download a full database dump to your computer (choose where to save it), or create a copy stored on the server.</div>
          <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
            <button onClick={onDownloadLive} disabled={backingUp} style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'none', background:'#213a9e', color:'#fff', borderRadius:'10px', padding:'11px 16px', font:'600 13px/1 "IBM Plex Sans"', cursor:backingUp?'not-allowed':'pointer' }}>
              <Ico size={15} sw={1.9}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></Ico>{backingUp?'Preparing…':'Download backup'}
            </button>
            <button onClick={onCreate} disabled={backingUp} style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'1px solid #e6e8ee', background:'#fff', color:'#213a9e', borderRadius:'10px', padding:'11px 16px', font:'600 13px/1 "IBM Plex Sans"', cursor:backingUp?'not-allowed':'pointer' }}>
              <Ico size={15} sw={2.2} d="M12 5v14M5 12h14" />Create server backup
            </button>
          </div>
        </div>
        <div style={{ background:'#fff', border:'1px solid #e6e8ee', borderRadius:'14px', padding:'20px 22px' }}>
          <div style={{ font:'600 15px/1 "IBM Plex Sans"', color:'#161a26', marginBottom:'6px' }}>Automated backups</div>
          <div style={{ font:'400 12.5px/1.6 "IBM Plex Sans"', color:'#7b8294' }}>The server writes a database backup automatically to <code style={{ font:'600 12px/1 "IBM Plex Mono",monospace', color:'#54607a' }}>./backups</code> on the host and keeps the 14 most recent. For a full-application backup (code + certs + config + DB), run <code style={{ font:'600 12px/1 "IBM Plex Mono",monospace', color:'#54607a' }}>backup-all.ps1</code> — schedule it weekly via Windows Task Scheduler.</div>
        </div>
      </div>
      <div style={{ background:'#fff', border:'1px solid #e6e8ee', borderRadius:'14px', overflow:'hidden' }}>
        <div style={{ display:'grid', gridTemplateColumns:'2.4fr 1fr 1fr', gap:'14px', padding:'13px 22px', background:'#f8f9fc', borderBottom:'1px solid #eceef4', font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.06em', color:'#9aa1b2', textTransform:'uppercase' }}>
          <div>Backup file</div><div>Created</div><div>Size</div>
        </div>
        {backups.map((b)=>(
          <div key={b.name} style={{ display:'grid', gridTemplateColumns:'2.4fr 1fr 1fr', gap:'14px', padding:'13px 22px', borderBottom:'1px solid #f3f4f8', alignItems:'center' }}>
            <button onClick={()=>onDownloadStored(b.name)} style={{ textAlign:'left', border:'none', background:'transparent', cursor:'pointer', font:'600 13px/1.3 "IBM Plex Sans"', color:'#213a9e', display:'inline-flex', alignItems:'center', gap:'8px', minWidth:0 }}>
              <Ico size={15} sw={1.9}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></Ico>
              <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{b.name}</span>
            </button>
            <div style={{ font:'400 12px/1 "IBM Plex Mono",monospace', color:'#8a92a6' }}>{fmtAt(b.at)}</div>
            <div style={{ font:'400 12px/1 "IBM Plex Mono",monospace', color:'#8a92a6' }}>{kb(b.size)}</div>
          </div>
        ))}
        {!backups.length && <Empty msg="No server backups yet — click “Create server backup”." />}
      </div>
    </div>
  );
}

function QuizBuilder({ state, onSave, onDelete, onArchive, onRestore, onClose }) {
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

function QuizTake({ quizState, alreadyPassed, bestPct, onAnswer, onSubmit, onRetry }) {
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
const HELP_TOPICS = [
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

function Help({ isAdmin }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const topics = HELP_TOPICS.filter((t)=> isAdmin ? (t.aud==='admin'||t.aud==='both') : (t.aud==='user'||t.aud==='both'));
  const needle = q.trim().toLowerCase();
  const matches = needle ? topics.filter((t)=> (t.title+' '+t.cat+' '+t.keywords+' '+t.body.join(' ')).toLowerCase().includes(needle)) : topics;
  const cats = []; matches.forEach((t)=>{ if (!cats.includes(t.cat)) cats.push(t.cat); });
  const hi = (text) => {
    if (!needle) return text;
    const i = text.toLowerCase().indexOf(needle); if (i<0) return text;
    return [<React.Fragment key="a">{text.slice(0,i)}</React.Fragment>, <mark key="b" style={{ background:'#fef3c7', color:'inherit', borderRadius:'3px' }}>{text.slice(i,i+needle.length)}</mark>, <React.Fragment key="c">{text.slice(i+needle.length)}</React.Fragment>];
  };
  return (
    <div style={{ maxWidth:'860px' }}>
      <div style={{ position:'relative', marginBottom:'20px' }}>
        <span style={{ position:'absolute', left:'14px', top:'50%', transform:'translateY(-50%)', color:'#9aa1b2', display:'flex' }}><Ico size={17}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></Ico></span>
        <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search help — keywords or a phrase (e.g. quiz, backup, invalid_token, sign in)" style={{ width:'100%', border:'1px solid #d8dce6', borderRadius:'11px', padding:'13px 14px 13px 42px', font:'400 14px/1 "IBM Plex Sans"', outline:'none', boxSizing:'border-box' }} />
      </div>
      {needle && <div style={{ font:'400 12.5px/1 "IBM Plex Mono",monospace', color:'#8a92a6', marginBottom:'14px' }}>{matches.length} result{matches.length===1?'':'s'} for \u201c{q.trim()}\u201d</div>}
      {cats.map((cat)=>(
        <div key={cat} style={{ marginBottom:'22px' }}>
          <div style={{ font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.09em', textTransform:'uppercase', color:'#9aa1b2', marginBottom:'11px' }}>{cat}</div>
          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
            {matches.filter((t)=>t.cat===cat).map((t)=>{ const id = t.title; const isOpen = open===id || !!needle; return (
              <div key={id} style={{ background:'#fff', border:'1px solid #e6e8ee', borderRadius:'12px', overflow:'hidden' }}>
                <button onClick={()=>setOpen(open===id?null:id)} style={{ width:'100%', textAlign:'left', border:'none', background:'transparent', cursor:'pointer', padding:'15px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px' }}>
                  <span style={{ font:'600 14.5px/1.3 "IBM Plex Sans"', color:'#23283a' }}>{hi(t.title)}</span>
                  <span style={{ color:'#aab0c0', display:'flex', flex:'none', transform:isOpen?'rotate(90deg)':'none', transition:'transform .15s' }}><Ico size={17} d="M9 6l6 6-6 6" /></span>
                </button>
                {isOpen && <div style={{ padding:'0 18px 16px', display:'flex', flexDirection:'column', gap:'10px' }}>
                  {t.body.map((para,i)=>(<p key={i} style={{ margin:0, font:'400 13.5px/1.65 "IBM Plex Sans"', color:'#54607a' }}>{hi(para)}</p>))}
                </div>}
              </div>
            ); })}
          </div>
        </div>
      ))}
      {!matches.length && <Empty msg={'No help topics match \u201c'+q.trim()+'\u201d. Try a different keyword.'} />}
      {isAdmin && <div style={{ marginTop:'8px', font:'400 12px/1.6 "IBM Plex Mono",monospace', color:'#9aa1b2', background:'#f6f8fb', borderRadius:'10px', padding:'14px 16px' }}>The complete installation, Azure setup and security guide also ships as <strong style={{ color:'#54607a' }}>INSTALL-GUIDE.md</strong> in the deployment package.</div>}
    </div>
  );
}

function ReceiptModal({ receipt, onClose }) {
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

function PolicyHistoryModal({ detail, onClose }) {
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

function ManagerDashboard({ data, onReminders, reminding }) {
  if (!data) return <div style={{ padding:'60px', textAlign:'center' }}><span style={{ width:'28px', height:'28px', border:'3px solid #d2d7e3', borderTopColor:'#213a9e', borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite' }}></span></div>;
  const s = data.summary || { people:0, compliant:0, pct:0, assigned:0, signed:0 };
  const pctColor = (p) => p>=80?'#1f8a5b':p>=50?'#caa53d':'#c0143c';
  const kpis = [
    { label:'Team members', value:s.people },
    { label:'Fully compliant', value:s.compliant + ' / ' + s.people },
    { label:'Overall completion', value:s.pct + '%', color:pctColor(s.pct) },
    { label:'Open items', value:(s.assigned - s.signed) },
  ];
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px', flexWrap:'wrap', gap:'12px' }}>
        <div style={{ font:'400 13px/1.5 "IBM Plex Sans"', color:'#7b8294', maxWidth:'520px' }}>Compliance for the people who report to you — across policies, procedures and trainings.</div>
        <button onClick={onReminders} disabled={reminding} style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'none', background:'#213a9e', color:'#fff', borderRadius:'10px', padding:'11px 16px', font:'600 12.5px/1 "IBM Plex Sans"', cursor:reminding?'not-allowed':'pointer' }}>
          <Ico size={15} sw={1.9}><path d="M4 4h16v12H5.2L4 17.2z"/><path d="M8 9h8M8 12h5"/></Ico>{reminding?'Sending…':'Remind my team'}
        </button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'16px', marginBottom:'22px' }}>
        {kpis.map((k,i)=>(
          <div key={i} style={{ background:'#fff', border:'1px solid #e6e8ee', borderRadius:'14px', padding:'18px 20px' }}>
            <div style={{ font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.06em', textTransform:'uppercase', color:'#9aa1b2', marginBottom:'10px' }}>{k.label}</div>
            <div style={{ font:'700 26px/1 "IBM Plex Sans"', color:k.color||'#161a26' }}>{k.value}</div>
          </div>
        ))}
      </div>
      {!data.team.length && <Empty msg="No team members found yet. Your reports appear here once they have you set as their functional or directory manager (run a directory sync first)." />}
      {!!data.team.length && (
        <div style={{ display:'grid', gridTemplateColumns:'1.3fr 1fr', gap:'18px', alignItems:'start' }}>
          <div style={{ background:'#fff', border:'1px solid #e6e8ee', borderRadius:'14px', overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #eceef4', font:'600 14px/1 "IBM Plex Sans"', color:'#161a26' }}>My team</div>
            {data.team.map((m)=>(
              <div key={m.oid} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 20px', borderBottom:'1px solid #f3f4f8' }}>
                <div style={{ width:'34px', height:'34px', flex:'none', borderRadius:'50%', background:'#eef1fb', color:'#213a9e', display:'flex', alignItems:'center', justifyContent:'center', font:'600 12px/1 "IBM Plex Sans"' }}>{initials(m.name)}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ font:'600 13.5px/1.2 "IBM Plex Sans"', color:'#23283a', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.name}</div>
                  <div style={{ font:'400 11.5px/1.3 "IBM Plex Mono",monospace', color:'#9aa1b2' }}>{m.department||'—'}</div>
                </div>
                <div style={{ width:'90px', height:'7px', background:'#eef1f5', borderRadius:'5px', overflow:'hidden', flex:'none' }}><div style={{ height:'100%', width:m.pct+'%', background:pctColor(m.pct) }}></div></div>
                <div style={{ width:'58px', textAlign:'right', font:'600 13px/1 "IBM Plex Sans"', color:pctColor(m.pct) }}>{m.pct}%</div>
                <div style={{ width:'48px', textAlign:'right', font:'400 11.5px/1 "IBM Plex Mono",monospace', color:'#9aa1b2' }}>{m.signed}/{m.required}</div>
              </div>
            ))}
          </div>
          <div style={{ background:'#fff', border:'1px solid #e6e8ee', borderRadius:'14px', overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #eceef4', font:'600 14px/1 "IBM Plex Sans"', color:'#161a26' }}>By document</div>
            {(data.items||[]).map((it)=>{ const pct = it.assigned?Math.round(it.signed/it.assigned*100):0; return (
              <div key={it.id} style={{ padding:'12px 20px', borderBottom:'1px solid #f3f4f8' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'9px', marginBottom:'7px' }}>
                  <span style={{ font:'600 12.5px/1.3 "IBM Plex Sans"', color:'#23283a', flex:1, minWidth:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{it.name}</span>
                  <span style={{ font:'600 9.5px/1.3 "IBM Plex Mono",monospace', letterSpacing:'.04em', textTransform:'uppercase', color: it.docType==='Training'?'#6d4bd1':'#213a9e', background: it.docType==='Training'?'#f6f3fd':'#eef1fb', padding:'2px 7px', borderRadius:'999px' }}>{it.docType}</span>
                  <span style={{ font:'600 12px/1 "IBM Plex Sans"', color:pctColor(pct) }}>{pct}%</span>
                </div>
                <div style={{ height:'6px', background:'#eef1f5', borderRadius:'4px', overflow:'hidden' }}><div style={{ height:'100%', width:pct+'%', background:pctColor(pct) }}></div></div>
              </div>
            ); })}
            {!(data.items||[]).length && <Empty msg="No assigned documents." />}
          </div>
        </div>
      )}
    </div>
  );
}

function Trainings({ trainings, onNew, onEdit, onArchive, onQuiz, onHistory }) {
  const fmtPct = (s, a) => a ? Math.round(s/a*100) : 0;
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'16px', marginBottom:'18px', flexWrap:'wrap' }}>
        <div style={{ font:'400 13px/1.5 "IBM Plex Sans"', color:'#7b8294', maxWidth:'560px' }}>Upload your own documents — trainings, policies, procedures, guidelines — from your computer, attach a knowledge check, and assign to groups. Completion is tracked like everything else.</div>
        <button onClick={onNew} style={{ display:'inline-flex', alignItems:'center', gap:'8px', border:'none', background:'#213a9e', color:'#fff', borderRadius:'10px', padding:'11px 18px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer', flex:'none' }}>
          <Ico size={16} sw={2.2} d="M12 5v14M5 12h14" />New document
        </button>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
        {trainings.map((t)=>{ const assigned=Number(t.assigned)||0, signed=Number(t.signed)||0, pct=fmtPct(signed,assigned); return (
          <div key={t.id} style={{ background:'#fff', border:'1px solid #e6e8ee', borderRadius:'14px', padding:'20px 22px' }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:'16px' }}>
              <div style={{ width:'42px', height:'42px', flex:'none', borderRadius:'10px', background:'#eef1fb', color:'#213a9e', display:'flex', alignItems:'center', justifyContent:'center' }}><Ico size={22} sw={1.8}><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1 2.7 2 6 2s6-1 6-2v-5"/></Ico></div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'9px', flexWrap:'wrap' }}>
                  <span style={{ font:'600 16px/1.2 "IBM Plex Sans"', color:'#161a26' }}>{t.name}</span>
                  <span style={{ font:'600 10px/1.3 "IBM Plex Mono",monospace', letterSpacing:'.04em', textTransform:'uppercase', color: t.doc_type==='Training'?'#6d4bd1':'#213a9e', background: t.doc_type==='Training'?'#f6f3fd':'#eef1fb', padding:'2px 8px', borderRadius:'999px' }}>{t.doc_type}</span>
                  <span style={{ font:'400 12px/1 "IBM Plex Mono",monospace', color:'#aab0c0' }}>{t.version}</span>
                </div>
                <div style={{ font:'400 12.5px/1.5 "IBM Plex Sans"', color:'#7b8294', marginTop:'5px' }}>
                  {t.upload_name ? t.upload_name : 'No file'} · Assigned: {(t.groups&&t.groups.length)?t.groups.join(', '):'—'}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:'12px', marginTop:'12px' }}>
                  <div style={{ flex:1, maxWidth:'320px', height:'8px', background:'#eef1f5', borderRadius:'5px', overflow:'hidden' }}><div style={{ height:'100%', borderRadius:'5px', width:pct+'%', background:pct>=70?'#1f8a5b':pct>=40?'#caa53d':'#c0143c' }}></div></div>
                  <span style={{ font:'600 13px/1 "IBM Plex Sans"', color:'#23283a' }}>{pct}%</span>
                  <span style={{ font:'400 12px/1 "IBM Plex Mono",monospace', color:'#9aa1b2' }}>{signed}/{assigned} signed</span>
                </div>
              </div>
              <div style={{ display:'flex', gap:'8px', flex:'none' }}>
                <button style={{ border:'1px solid #e6e8ee', background:'#fff', color:'#213a9e', borderRadius:'9px', padding:'9px 14px', font:'600 13px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={()=>onEdit(t)}>Edit</button>
                <button title="Knowledge check" style={{ border:'1px solid #e6e8ee', background:'#fff', color:'#6d4bd1', borderRadius:'9px', padding:'9px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:'6px', font:'600 13px/1 "IBM Plex Sans"' }} onClick={()=>onQuiz(t)}><Ico size={15} sw={1.9}><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 1 1 4 2.8c-.8.3-1.1.9-1.1 1.7v.5"/><path d="M12 17h.01"/></Ico>Quiz</button>
                <button title="Version history" style={{ border:'1px solid #e6e8ee', background:'#fff', color:'#54607a', borderRadius:'9px', padding:'9px 11px', cursor:'pointer', display:'flex', alignItems:'center' }} onClick={()=>onHistory(t)}><Ico size={16} sw={1.9}><path d="M3 3v5h5"/><path d="M3 8a9 9 0 1 0 2.5-5.3L3 8"/><path d="M12 8v5l3 2"/></Ico></button>
                <button title="Archive" style={{ border:'1px solid #f0d6dd', background:'#fff', color:'#c0143c', borderRadius:'9px', padding:'9px 11px', cursor:'pointer', display:'flex', alignItems:'center' }} onClick={()=>onArchive(t)}><Ico size={16} sw={1.9}><path d="M3 7h18M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 7l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7"/></Ico></button>
              </div>
            </div>
          </div>
        ); })}
        {!trainings.length && <Empty msg="Nothing here yet — click “New document” to upload your first." />}
      </div>
    </div>
  );
}

function TrainingEditor({ state, groups, onClose, onSave }) {
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
  const lbl = { font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.05em', color:'#9aa1b2', textTransform:'uppercase', marginBottom:'7px' };
  const inp = { width:'100%', border:'1px solid #d8dce6', borderRadius:'9px', padding:'10px 12px', font:'400 13.5px/1.3 "IBM Plex Sans"', outline:'none', boxSizing:'border-box' };
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
      <div style={{ width:'600px', maxWidth:'100%', maxHeight:'88vh', background:'#fff', borderRadius:'16px', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 24px 60px rgba(10,16,40,.34)', animation:'cardUp .22s ease' }} onClick={stop}>
        <div style={{ flex:'none', padding:'22px 26px 16px', borderBottom:'1px solid #eceef4', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ font:'600 18px/1.2 "IBM Plex Sans"', color:'#161a26' }}>{state.mode==='edit' ? 'Edit document' : 'New document'}</div>
          <button style={{ border:'none', background:'#f3f4f8', width:'34px', height:'34px', borderRadius:'9px', cursor:'pointer', color:'#54607a', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}><Ico size={17} sw={2.2} d="M6 6l12 12M18 6L6 18" /></button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'20px 26px', display:'flex', flexDirection:'column', gap:'16px' }}>
          <div style={{ display:'flex', gap:'14px' }}>
            <div style={{ flex:1 }}><div style={lbl}>Name</div><input value={name} onChange={(e)=>setName(e.target.value)} placeholder="e.g. Fire Safety Induction" style={inp} /></div>
            <div style={{ width:'120px' }}><div style={lbl}>Version</div><input value={version} onChange={(e)=>setVersion(e.target.value)} style={inp} /></div>
          </div>
          <div>
            <div style={lbl}>Document type</div>
            <select value={docType} onChange={(e)=>setDocType(e.target.value)} style={{ ...inp, background:'#fff' }}>
              <option value="Training">Training</option>
              <option value="Policy">Policy</option>
              <option value="Process">Process</option>
              <option value="Procedure">Procedure</option>
              <option value="Standard">Standard</option>
              <option value="Guideline">Guideline</option>
            </select>
          </div>
          <div>
            <div style={lbl}>Training file {state.mode==='edit' && <span style={{ textTransform:'none', color:'#aab0c0', fontWeight:400 }}>(leave empty to keep current)</span>}</div>
            <input ref={fileRef} type="file" accept=".pdf,.mp4,.webm,.pptx,.ppt,.docx,.png,.jpg,.jpeg,.gif" style={{ display:'none' }} onChange={(e)=>setFile(e.target.files&&e.target.files[0])} />
            <button type="button" onClick={()=>fileRef.current&&fileRef.current.click()} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:'9px', border:'1px dashed #213a9e', background:'#eef1fb', color:'#213a9e', borderRadius:'9px', padding:'13px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }}>
              <Ico size={16} sw={1.9}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15l3-3 3 3"/></Ico>
              {file ? file.name : (d.upload_name ? ('Replace — current: ' + d.upload_name) : 'Choose file from your computer')}
            </button>
            <div style={{ font:'400 11px/1.4 "IBM Plex Mono",monospace', color:'#aab0c0', marginTop:'6px' }}>PDF, video (mp4/webm), PowerPoint, Word or image · up to 250 MB.</div>
          </div>
          <div>
            <div style={lbl}>Completion deadline</div>
            <select value={dueMode} onChange={(e)=>setDueMode(e.target.value)} style={{ ...inp, background:'#fff' }}>
              <option value="none">No deadline</option>
              <option value="rolling">Within N days of assignment</option>
              <option value="fixed">Fixed calendar date</option>
            </select>
            {dueMode==='rolling' && <div style={{ display:'flex', alignItems:'center', gap:'9px', marginTop:'10px' }}><span style={{ font:'500 13px/1 "IBM Plex Sans"', color:'#54607a' }}>Complete within</span><input type="number" min="1" value={dueDays} onChange={(e)=>setDueDays(e.target.value)} style={{ ...inp, width:'90px' }} /><span style={{ font:'500 13px/1 "IBM Plex Sans"', color:'#54607a' }}>days</span></div>}
            {dueMode==='fixed' && <input type="date" value={dueDate} onChange={(e)=>setDueDate(e.target.value)} style={{ ...inp, marginTop:'10px' }} />}
          </div>
          <div>
            <div style={lbl}>Assign to groups</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
              {(groups||[]).map((g)=>{ const on=gids.includes(g.id); return (
                <button key={g.id} onClick={()=>toggle(g.id)} style={{ border:'1px solid '+(on?'#213a9e':'#d8dce6'), background:on?'#eef1fb':'#fff', color:on?'#213a9e':'#54607a', borderRadius:'999px', padding:'7px 13px', font:'600 12.5px/1 "IBM Plex Sans"', cursor:'pointer' }}>{g.name}</button>
              ); })}
              {!(groups||[]).length && <span style={{ font:'400 12.5px/1.5 "IBM Plex Sans"', color:'#aab0c0' }}>No groups available.</span>}
            </div>
          </div>
          {state.mode==='edit' && <div><div style={lbl}>Version note <span style={{ textTransform:'none', color:'#aab0c0', fontWeight:400 }}>(optional)</span></div><input value={versionNote} onChange={(e)=>setVersionNote(e.target.value)} placeholder="What changed?" style={inp} /></div>}
        </div>
        <div style={{ flex:'none', borderTop:'1px solid #eceef4', background:'#fafbfd', padding:'16px 26px', display:'flex', gap:'12px', justifyContent:'flex-end' }}>
          <button style={{ border:'1px solid #e6e8ee', background:'#fff', color:'#54607a', borderRadius:'10px', padding:'11px 20px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:'pointer' }} onClick={onClose}>Cancel</button>
          <button disabled={!canSave} onClick={submit} style={{ border:'none', background:canSave?'#213a9e':'#aebbe2', color:'#fff', borderRadius:'10px', padding:'11px 22px', font:'600 13.5px/1 "IBM Plex Sans"', cursor:canSave?'pointer':'not-allowed' }}>{state.mode==='edit'?'Save changes':'Create training'}</button>
        </div>
      </div>
    </div>
  );
}

function Integrations() {
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
  if (!c) return <div style={{ padding:'60px', textAlign:'center' }}><span style={{ width:'28px', height:'28px', border:'3px solid #d2d7e3', borderTopColor:'#213a9e', borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite' }}></span></div>;
  const lbl = { font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.05em', color:'#9aa1b2', textTransform:'uppercase', marginBottom:'7px' };
  const inp = { width:'100%', border:'1px solid #d8dce6', borderRadius:'9px', padding:'10px 12px', font:'400 13.5px/1.3 "IBM Plex Sans"', outline:'none', boxSizing:'border-box' };
  const card = { background:'#fff', border:'1px solid #e6e8ee', borderRadius:'14px', padding:'22px 24px', marginBottom:'18px' };
  const feedUrl = (window.location.origin + '/feed/audit');
  return (
    <div style={{ maxWidth:'780px' }}>
      {/* PUSH */}
      <div style={card}>
        <div style={{ font:'600 15px/1 "IBM Plex Sans"', color:'#161a26', marginBottom:'5px' }}>Forward events to another system (push)</div>
        <div style={{ font:'400 12.5px/1.6 "IBM Plex Sans"', color:'#7b8294', marginBottom:'16px' }}>Every audit/business event is POSTed as JSON to your endpoint (SIEM, Logic App, webhook). Fire-and-forget — it never affects portal operations.</div>
        <div style={{ marginBottom:'13px' }}><div style={lbl}>Endpoint URL</div><input value={forwardUrl} onChange={(e)=>setForwardUrl(e.target.value)} placeholder="https://your-system.example.com/ingest" style={inp} /></div>
        <div style={{ marginBottom:'13px' }}><div style={lbl}>Bearer token <span style={{ textTransform:'none', color:'#aab0c0', fontWeight:400 }}>(sent as Authorization header)</span></div><input type="password" value={tokenDirty ? forwardToken : ''} onChange={(e)=>{ setForwardToken(e.target.value); setTokenDirty(true); }} placeholder={c.forwardTokenSet ? '•••••••• (leave blank to keep)' : 'optional'} style={inp} /></div>
        <label style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'16px', cursor:'pointer' }}>
          <input type="checkbox" checked={forwardEnabled} onChange={(e)=>setForwardEnabled(e.target.checked)} style={{ width:'17px', height:'17px', accentColor:'#213a9e' }} />
          <span style={{ font:'500 13.5px/1.4 "IBM Plex Sans"', color:'#2a3142' }}>Enable forwarding</span>
        </label>
        <div style={{ display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap' }}>
          <button onClick={save} disabled={busy} style={{ border:'none', background:'#213a9e', color:'#fff', borderRadius:'10px', padding:'11px 20px', font:'600 13px/1 "IBM Plex Sans"', cursor:busy?'not-allowed':'pointer' }}>Save</button>
          <button onClick={test} style={{ border:'1px solid #e6e8ee', background:'#fff', color:'#213a9e', borderRadius:'10px', padding:'11px 18px', font:'600 13px/1 "IBM Plex Sans"', cursor:'pointer' }}>Send test event</button>
          {testResult && <span style={{ font:'500 12.5px/1 "IBM Plex Mono",monospace', color: /Deliv/.test(testResult)?'#1f8a5b':'#c0143c' }}>{testResult}</span>}
          {c.lastForwardAt && <span style={{ font:'400 11.5px/1 "IBM Plex Mono",monospace', color:'#9aa1b2' }}>last: {c.lastForwardStatus} · {fmtDate(c.lastForwardAt)}</span>}
        </div>
      </div>
      {/* PULL */}
      <div style={card}>
        <div style={{ font:'600 15px/1 "IBM Plex Sans"', color:'#161a26', marginBottom:'5px' }}>Expose an API to consume (pull)</div>
        <div style={{ font:'400 12.5px/1.6 "IBM Plex Sans"', color:'#7b8294', marginBottom:'16px' }}>External systems read the audit feed with an API key. Supports <code style={{ background:'#f3f4f8', padding:'1px 5px', borderRadius:'4px' }}>?since=ISO8601</code> and <code style={{ background:'#f3f4f8', padding:'1px 5px', borderRadius:'4px' }}>?limit=N</code> for incremental polling.</div>
        <label style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'14px', cursor:'pointer' }}>
          <input type="checkbox" checked={feedEnabled} onChange={(e)=>setFeedEnabled(e.target.checked)} style={{ width:'17px', height:'17px', accentColor:'#213a9e' }} />
          <span style={{ font:'500 13.5px/1.4 "IBM Plex Sans"', color:'#2a3142' }}>Enable consumer feed</span>
        </label>
        <div style={{ marginBottom:'13px' }}><div style={lbl}>Feed endpoint</div><div style={{ font:'500 12.5px/1.4 "IBM Plex Mono",monospace', color:'#41485a', background:'#f6f8fb', border:'1px solid #e6e9f1', borderRadius:'8px', padding:'10px 12px', wordBreak:'break-all' }}>GET {feedUrl}</div></div>
        <div style={{ marginBottom:'14px' }}><div style={lbl}>API key</div>
          {newKey
            ? <div style={{ font:'500 12.5px/1.4 "IBM Plex Mono",monospace', color:'#1f8a5b', background:'#e6f3ec', border:'1px solid #cfe8da', borderRadius:'8px', padding:'10px 12px', wordBreak:'break-all' }}>{newKey}<div style={{ color:'#54607a', marginTop:'5px', fontWeight:400 }}>Copy it now — it won't be shown again.</div></div>
            : <div style={{ font:'400 12.5px/1.4 "IBM Plex Sans"', color: c.feedKeySet?'#54607a':'#aab0c0' }}>{c.feedKeySet ? 'A key is set (hidden). Rotate to issue a new one.' : 'No key yet — generate one.'}</div>}
        </div>
        <div style={{ display:'flex', gap:'12px' }}>
          <button onClick={save} disabled={busy} style={{ border:'none', background:'#213a9e', color:'#fff', borderRadius:'10px', padding:'11px 20px', font:'600 13px/1 "IBM Plex Sans"', cursor:busy?'not-allowed':'pointer' }}>Save</button>
          <button onClick={rotate} style={{ border:'1px solid #e6e8ee', background:'#fff', color:'#213a9e', borderRadius:'10px', padding:'11px 18px', font:'600 13px/1 "IBM Plex Sans"', cursor:'pointer' }}>{c.feedKeySet ? 'Rotate key' : 'Generate key'}</button>
        </div>
        <div style={{ marginTop:'15px', font:'400 11.5px/1.5 "IBM Plex Mono",monospace', color:'#9aa1b2' }}>Example:<br/>curl -H "Authorization: Bearer &lt;key&gt;" "{feedUrl}?since=2026-01-01T00:00:00Z"</div>
      </div>
    </div>
  );
}

/* ============================ small bits ============================ */
function Empty({ msg }) { return <div style={{ padding:'26px 18px', textAlign:'center', font:'400 13px/1.5 "IBM Plex Sans"', color:'#aab0c0' }}>{msg}</div>; }
function Toast({ msg, err }) {
  return (
    <div style={{ position:'fixed', bottom:'26px', left:'50%', transform:'translateX(-50%)', background:'#161a26', color:'#fff', padding:'13px 22px', borderRadius:'11px', font:'500 13.5px/1 "IBM Plex Sans"', display:'flex', alignItems:'center', gap:'11px', boxShadow:'0 12px 32px rgba(10,16,40,.3)', zIndex:60, animation:'toastIn .25s ease' }}>
      <span style={{ width:'20px', height:'20px', borderRadius:'50%', background:err?'#c0143c':'#1f7a5c', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">{err?<path d="M18 6L6 18M6 6l12 12"/>:<path d="M20 6L9 17l-5-5"/>}</svg>
      </span>
      {msg}
    </div>
  );
}
function Splash() {
  return (
    <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center', background:'#eef1f5' }}>
      <span style={{ width:'34px', height:'34px', border:'3px solid #d2d7e3', borderTopColor:'#213a9e', borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite' }}></span>
    </div>
  );
}
function SignIn({ onSignIn, configOk, fatal, idle }) {
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

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
