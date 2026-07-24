/* ============================================================
   Birgma Governance Portal — production SPA
   React + MSAL (Entra ID SSO) + live API.
   Same design as the prototype; data comes from /api/* (proxied
   same-origin by nginx, so no CORS). Runtime config in config.js.
   ============================================================ */
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { csvField } from './format.js';
import { api, initAuth, currentAccount, signIn, signOut, localSignOut, getToken, CONFIG_OK, IDLE_LOGOUT_MS, API_BASE } from './api.js';
import { seg, fmtDate, initials, parseEmployeeCsv, groupIdsFor, Ico } from './ui.jsx';
import { useTheme } from './theme.js';

const { useState, useEffect, useRef, useCallback } = React;

/* ============================================================ */
import { ConfirmArchive, ImportModal, SharePointPicker, MembersModal, GroupComplianceModal, ConfirmDeleteGroup, ManagerEditModal, ReceiptModal, PolicyHistoryModal } from './components/modals.jsx';
import { Dashboard, ManagerDashboard } from './components/dashboard.jsx';
import { PolicyLibrary, MyPolicies, Reader, Drawer } from './components/policies.jsx';
import { Employees, Groups } from './components/people.jsx';
import { MySignatures, AuditLog, Backups, Help, Integrations } from './components/misc.jsx';
import { IdleWarning, Toast, Splash, SignIn } from './components/common.jsx';
import { QuizBuilder } from './components/quiz.jsx';
import { Trainings, TrainingEditor } from './components/trainings.jsx';
import { AppEvaluation } from './components/evaluation.jsx';
import { ApprovalsModal, MyApprovals } from './components/approvals.jsx';
import { WorkflowTemplates } from './components/workflows.jsx';

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
  const [approvals, setApprovals] = useState(null);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const { theme, toggle: toggleTheme } = useTheme();
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
      } else if (v === 'myapprovals') {
        setPendingApprovals(await api.pendingApprovals());
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
    // Document metadata (SharePoint webUrl + version) — independent of the preview.
    let doc = {};
    try { doc = await api.document(p.id); } catch (_) { /* fall back to p.sharepoint_url */ }
    setReader((r) => r ? { ...r, doc } : r);
    // Inline preview streamed through our own origin (CSP-safe blob). Attempted
    // independently so a metadata hiccup never suppresses it; falls back silently
    // to the SharePoint link if the document can't be proxied.
    try {
      const token = await getToken();
      const res = await fetch(API_BASE + '/api/policies/' + p.id + '/content', { headers: { Authorization: 'Bearer ' + token } });
      if (res.ok) {
        const blob = await res.blob();
        const mime = blob.type || '';
        if (/pdf|image|video/.test(mime)) {
          const previewUrl = URL.createObjectURL(blob);
          setReader((r) => r ? { ...r, doc: { ...(r.doc || {}), previewUrl, previewMime: mime } } : r);
        }
      }
    } catch (_) { /* keep the link-only view */ }
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
    evaluation:['Application evaluation','Evidence-based maturity assessment across engineering, security & compliance'],
    myapprovals:['My approvals','Policies awaiting your decision'],
    workflows:['Approval workflows','Reusable approval templates you can apply to any policy'],
  };

  // dashboard
  const polRows = dashRows.map((r) => { const assigned = Number(r.assigned) || 0, signed = Number(r.signed) || 0; const pct = assigned ? Math.round(signed/assigned*100) : 0; return { id:r.id, name:r.name, type:r.doc_type, version:r.version, assigned, signed, pct, unassigned: assigned === 0 }; });
  const totalReq = polRows.reduce((a,r)=>a+r.assigned,0), totalSigned = polRows.reduce((a,r)=>a+r.signed,0);
  const overall = totalReq ? Math.round(totalSigned/totalReq*100) : 0, pending = totalReq - totalSigned;
  const kpis = [
    { label:'Overall compliance', value:overall+'%', sub:totalSigned+' of '+totalReq+' acknowledgements', accent:'var(--c213a9e)' },
    { label:'Active policies', value:String(dashRows.length), sub:'across document types', accent:'var(--c0078c0)' },
    { label:'Employees', value:String(emps.length), sub:'synced from AD / Entra ID', accent:'var(--c1f7a5c)' },
    { label:'Pending signatures', value:String(pending<0?0:pending), sub:'awaiting acknowledgement', accent:'var(--cd81848)' },
  ];
  const recent = recentSigs.slice(0,6).map((s)=>({ name:s.display_name||s.full_name, policy:s.policy_name, version:s.policy_version, date:fmtDate(s.signed_at), initials:initials(s.display_name||s.full_name) }));
  const attention = polRows.filter((r)=>!r.unassigned).slice().sort((a,b)=>a.pct-b.pct).slice(0,4);
  const deptRows = byDept.map((d)=>{ const assigned = Number(d.assigned) || 0, signed = Number(d.signed) || 0; const pct = assigned ? Math.round(signed/assigned*100) : 0; return { role:d.role, count:Number(d.people)||0, pct }; });
  const groupRows = byGroup.map((g)=>{ const assigned = Number(g.assigned)||0, signed = Number(g.signed)||0; const pct = assigned ? Math.round(signed/assigned*100) : 0; return { id:g.id, name:g.name, kind:g.kind, members:Number(g.members)||0, policies:Number(g.policies)||0, assigned, signed, pct, raw:g }; });

  // policy library
  const typeTabs = TYPES.map((t)=>({ t, count: t==='All'?pols.length:pols.filter((p)=>p.doc_type===t).length, on:activeType===t }));
  const fpol = activeType==='All' ? pols : pols.filter((p)=>p.doc_type===activeType);
  const dueMeta = (v) => { if (!v) return null; const d = new Date(v); if (isNaN(d)) return null; const days = Math.ceil((d - new Date(new Date().toDateString())) / 86400000); return { text: fmtDate(v), days, overdue: days < 0, soon: days >= 0 && days <= 7 }; };
  const polCards = fpol.map((p)=>{ const c = countsById[p.id]||{assigned:0,signed:0}; const assigned = Number(c.assigned)||0, signed = Number(c.signed)||0; const pct = assigned?Math.round(signed/assigned*100):0; const due = dueMeta(p.due_date); const dueText = p.due_date ? ('Due '+ (due?due.text:fmtDate(p.due_date)) + (due&&due.overdue?' · overdue':'')) : (p.due_days!=null ? ('Due '+p.due_days+'d after assignment') : null); return { raw:p, id:p.id, name:p.name, type:p.doc_type, version:p.version, url:p.sharepoint_url, owner:p.owner||'—', updated:fmtDate(p.updated_at), due, dueText, dueRolling:(!p.due_date && p.due_days!=null), assigned, signed, pct, groupsText:(p.groups&&p.groups.length)?p.groups.join(', '):'—', approval_state:p.approval_state }; });
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
      <button onClick={()=>go(v)} style={{ display:'flex', alignItems:'center', gap:'11px', width:'100%', textAlign:'left', border:'none', cursor:'pointer', fontFamily:'"IBM Plex Sans",sans-serif', fontSize:'14px', lineHeight:1, fontWeight:on?600:500, padding:'11px 13px', borderRadius:'10px', marginBottom:'3px', background:on?'var(--c213a9e)':'transparent', color:on?'#fff':'var(--c454c5e)' }}>
        {icon}{label}
      </button>
    );
  };

  return (
    <div style={{ display:'flex', height:'100vh', width:'100%', overflow:'hidden', background:'var(--ceef1f5)' }}>
      {/* sidebar */}
      <aside style={{ width:'264px', flex:'none', background:'var(--surface)', borderRight:'1px solid var(--ce6e8ee)', display:'flex', flexDirection:'column', padding:'22px 16px 16px' }}>
        <div style={{ padding:'6px 8px 16px', marginBottom:'14px', borderBottom:'1px solid var(--ceef0f4)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
            <img src="assets/birgma-logo.png" alt="Birgma" style={{ height:'26px', width:'auto', display:'block' }} />
            <span style={{ width:'1px', height:'30px', background:'var(--ce1e4ec)', display:'block' }}></span>
            <img src="assets/biltema-logo.png" alt="Biltema" style={{ height:'12px', width:'auto', display:'block' }} />
          </div>
          <div style={{ font:'500 11px/1.3 "IBM Plex Mono",monospace', color:'var(--c9aa1b2)', letterSpacing:'.04em', marginTop:'11px' }}>Governance Portal</div>
        </div>

        {role==='admin' && (
          <React.Fragment>
            <div style={{ font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.1em', color:'var(--c9aa1b2)', textTransform:'uppercase', padding:'8px 12px 10px' }}>Administration</div>
            {navBtn('dashboard','Dashboard', <Ico><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></Ico>)}
            {navBtn('policies','Policy library', <Ico><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></Ico>)}
            {navBtn('employees','Employees', <Ico><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 4.2A3 3 0 0 1 16 10M21 20c0-2.6-1.6-4.6-4-5.2"/></Ico>)}
            {navBtn('groups','Groups & access', <Ico><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4M3 17l9 4 9-4"/></Ico>)}
            {navBtn('audit','Audit log', <Ico><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></Ico>)}
            {navBtn('integrations','Integrations', <Ico><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="8" cy="7" r="1.6" fill="currentColor"/><circle cx="16" cy="12" r="1.6" fill="currentColor"/><circle cx="9" cy="17" r="1.6" fill="currentColor"/></Ico>)}
            {navBtn('backups','Backups', <Ico><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></Ico>)}
            {navBtn('myapprovals','My approvals', <Ico><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></Ico>)}
            {navBtn('workflows','Approval workflows', <Ico><path d="M4 5h6v4H4zM14 15h6v4h-6zM7 9v4a2 2 0 0 0 2 2h5"/></Ico>)}
            {navBtn('help','Help & guides', <Ico><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 1 1 4 2.8c-.8.3-1.1.9-1.1 1.7v.3"/><path d="M12 17h.01"/></Ico>)}
            {navBtn('evaluation','Application evaluation', <Ico><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></Ico>)}
          </React.Fragment>
        )}
        {role==='manager' && (
          <React.Fragment>
            <div style={{ font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.1em', color:'var(--c9aa1b2)', textTransform:'uppercase', padding:'8px 12px 10px' }}>Training management</div>
            {navBtn('mdashboard','Team dashboard', <Ico><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></Ico>)}
            {navBtn('trainings','Documents', <Ico><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1 2.7 2 6 2s6-1 6-2v-5"/></Ico>)}
            {navBtn('myapprovals','My approvals', <Ico><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></Ico>)}
            <div style={{ font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.1em', color:'var(--c9aa1b2)', textTransform:'uppercase', padding:'18px 12px 10px' }}>My governance</div>
            {navBtn('mypolicies','My policies', <Ico><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v6h6M9 14l2 2 4-4"/></Ico>)}
            {navBtn('mysignatures','My signatures', <Ico><path d="M3 17l4 4 6-10M14 7l3-3 3 3-9 9"/><path d="M3 21h6"/></Ico>)}
            {navBtn('help','Help', <Ico><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 1 1 4 2.8c-.8.3-1.1.9-1.1 1.7v.3"/><path d="M12 17h.01"/></Ico>)}
          </React.Fragment>
        )}
        {role==='employee' && (
          <React.Fragment>
            <div style={{ font:'600 11px/1 "IBM Plex Mono",monospace', letterSpacing:'.1em', color:'var(--c9aa1b2)', textTransform:'uppercase', padding:'8px 12px 10px' }}>My governance</div>
            {navBtn('mypolicies','My policies', <Ico><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v6h6M9 14l2 2 4-4"/></Ico>)}
            {navBtn('mysignatures','My signatures', <Ico><path d="M3 17l4 4 6-10M14 7l3-3 3 3-9 9"/><path d="M3 21h6"/></Ico>)}
            {navBtn('help','Help', <Ico><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 1 1 4 2.8c-.8.3-1.1.9-1.1 1.7v.3"/><path d="M12 17h.01"/></Ico>)}
          </React.Fragment>
        )}

        <div style={{ marginTop:'auto' }}></div>
        <button onClick={signOut} style={{ display:'flex', alignItems:'center', gap:'10px', border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c54607a)', borderRadius:'10px', padding:'10px 13px', font:'600 13px/1 "IBM Plex Sans",sans-serif', cursor:'pointer', marginBottom:'12px' }}>
          <Ico size={16}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></Ico>Sign out
        </button>
        <div style={{ borderTop:'1px solid var(--ceef0f4)', padding:'14px 12px 4px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ font:'500 11px/1.3 "IBM Plex Mono",monospace', color:'var(--ca7adbd)' }}>Birgma Group</span>
          <span style={{ font:'500 11px/1.3 "IBM Plex Mono",monospace', color:'var(--cc2c7d3)' }}>v1.0</span>
        </div>
      </aside>

      {/* main column */}
      <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column' }}>
        <header style={{ flex:'none', height:'74px', background:'var(--surface)', borderBottom:'1px solid var(--ce6e8ee)', display:'flex', alignItems:'center', gap:'20px', padding:'0 30px' }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ font:'600 19px/1.2 "IBM Plex Sans"', color:'var(--c161a26)' }}>{titles[view][0]}</div>
            <div style={{ font:'400 13px/1.3 "IBM Plex Sans"', color:'var(--c7b8294)', marginTop:'2px' }}>{titles[view][1]}</div>
          </div>
          {busy && <span style={{ width:'16px', height:'16px', border:'2px solid var(--cd2d7e3)', borderTopColor:'var(--c213a9e)', borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite' }}></span>}
          {(isAdmin || isManager) && (
            <div style={{ display:'flex', background:'var(--ceef0f4)', borderRadius:'11px', padding:'4px', width:isAdmin&&isManager?'330px':'230px' }}>
              <button style={seg(role==='employee')} onClick={()=>switchRole('employee')}>Employee</button>
              {isManager && <button style={seg(role==='manager')} onClick={()=>switchRole('manager')}>Manager</button>}
              {isAdmin && <button style={seg(role==='admin')} onClick={()=>switchRole('admin')}>Admin</button>}
            </div>
          )}
          <button onClick={toggleTheme} aria-label={theme==='dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme==='dark' ? 'Light mode' : 'Dark mode'}
            style={{ width:'38px', height:'38px', flex:'none', borderRadius:'10px', border:'1px solid var(--ce6e8ee)', background:'var(--surface)', color:'var(--c54607a)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            {theme==='dark'
              ? <Ico size={17}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></Ico>
              : <Ico size={17}><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></Ico>}
          </button>
          <div style={{ display:'flex', alignItems:'center', gap:'11px', paddingLeft:'18px', borderLeft:'1px solid var(--ceceef4)' }}>
            <div style={{ width:'38px', height:'38px', borderRadius:'50%', background:'var(--c213a9e)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', font:'600 13px/1 "IBM Plex Sans"' }}>{persona.initials}</div>
            <div>
              <div style={{ font:'600 13.5px/1.2 "IBM Plex Sans"', color:'var(--c1a1d29)' }}>{persona.name}</div>
              <div style={{ font:'400 11.5px/1.3 "IBM Plex Sans"', color:'var(--c8a92a6)' }}>{persona.sub}</div>
            </div>
          </div>
        </header>

        <main style={{ flex:1, overflowY:'auto', padding:'28px 30px 40px' }}>
          {view==='dashboard' && <Dashboard {...{ kpis, polRows, recent, attention, deptRows, groupRows, dashLayout, setDashLayout, onGroup:openGroupDetail, onExport:exportReport, exporting, exportScope, setExportScope, onReminders:sendReminders, sendingReminders }} />}
          {view==='policies' && <PolicyLibrary {...{ typeTabs, setActiveType, polCards, polTab, switchPolTab, archivedCards, openAddPolicy:()=>openDrawer('policy','add'), openEdit:(p)=>openDrawer('policy','edit',{...p.raw,_groupIds:groupIdsFor(p.raw,grps)}), openReader, onArchive:(p)=>setConfirmArchive(p.raw), onRestore:doRestore, onQuiz:(p)=>openQuizBuilder(p.raw), onHistory:(p)=>openPolicyHistory(p.raw), onApprovals:(p)=>setApprovals({ policy:p.raw }) }} />}
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
          {view==='evaluation' && <AppEvaluation />}
          {view==='myapprovals' && <MyApprovals pending={pendingApprovals} onOpen={(p)=>setApprovals({ policy:p })} />}
          {view==='workflows' && <WorkflowTemplates toast={showToast} />}
        </main>
      </div>

      {reader && <Reader {...{ reader, onClose:()=>setReader(null), signFirst, signLast, signAgreed, setSignFirst, setSignLast, setSignAgreed, submitSign, quizState, setQuizAnswer, submitQuizAttempt, retryQuiz }} />}
      {receipt && <ReceiptModal receipt={receipt} onClose={()=>setReceipt(null)} />}
      {policyHistory && <PolicyHistoryModal detail={policyHistory} onClose={()=>setPolicyHistory(null)} />}
      {approvals && <ApprovalsModal policy={approvals.policy} onClose={()=>setApprovals(null)} onChanged={()=>loadView(view)} toast={showToast} />}
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

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
