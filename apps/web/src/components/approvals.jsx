/* Admin → Policy Library → Approvals. Drives the ADR-120 workflow for one
   policy: configure approvers, submit, decide (approve / reject / request
   changes), withdraw, publish. State + decisions come from the API. */
import * as React from 'react';
const { useState, useEffect } = React;
import { api } from '../api.js';

export const APPROVAL_BADGE = {
  draft: ['Draft', '#54607a', '#eef1f6'],
  in_review: ['In review', '#9a6712', '#fbf1d9'],
  changes_requested: ['Changes requested', '#c2410c', '#fbe9dd'],
  rejected: ['Rejected', '#c0143c', '#fbe7ec'],
  approved: ['Approved', '#213a9e', '#e7ebfb'],
  published: ['Published', '#1f7a5c', '#e6f3ec'],
};

export function ApprovalBadge({ state }) {
  const b = APPROVAL_BADGE[state] || APPROVAL_BADGE.published;
  return <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: '999px', font: '600 10.5px/1.4 "IBM Plex Mono",monospace', letterSpacing: '.03em', textTransform: 'uppercase', color: b[1], background: b[2] }}>{b[0]}</span>;
}

const DECISION_LABEL = { approved: ['approved', '#1f7a5c'], rejected: ['rejected', '#c0143c'], changes_requested: ['requested changes', '#c2410c'] };
const btn = (bg, fg, bd) => ({ border: '1px solid ' + (bd || bg), background: bg, color: fg, borderRadius: '9px', padding: '9px 15px', font: '600 13px/1 "IBM Plex Sans"', cursor: 'pointer' });
const fmtWhen = (v) => { const d = new Date(v); return isNaN(d) ? '' : d.toLocaleDateString() + ' ' + d.toTimeString().slice(0, 5); };
export const ruleLabel = (s) => {
  const hasGroups = s.groups && s.groups.length;
  if (s.rule === 'any') return 'Any one approves';
  if (s.rule === 'quorum') return hasGroups ? `${s.required} must approve` : `${s.required} of ${s.approvers.length} required`;
  return (s.approvers.length > 1 || hasGroups) ? 'All must approve' : 'Approval';
};

// Normalize builder steps to the API { approverOids, groupIds, rule, required }
// shape, dropping empty steps. The quorum count is clamped ≥1 here; the server
// clamps it against the resolved member count (groups expand at submit).
export const stepsToPayload = (steps) => steps
  .map((s) => ({ approverOids: s.approverOids || [], groupIds: s.groupIds || [], rule: s.rule, required: s.rule === 'quorum' ? Math.max(Number(s.required) || 1, 1) : undefined }))
  .filter((s) => (s.approverOids.length || s.groupIds.length));

// Shared ordered-step editor (policy Approvals modal + reusable-template admin
// screen). `steps` is [{ approverOids:[], groupIds:[], rule, required }].
// `groups` is the directory/local groups list (empty if the caller can't list them).
export function StepBuilder({ steps, setSteps, emps, groups, disabled }) {
  const activeEmps = (emps || []).filter((e) => e.status !== 'Inactive');
  const allGroups = groups || [];
  const nameOf = (oid) => { const e = (emps || []).find((x) => x.oid === oid); return e ? e.display_name : oid.slice(0, 8); };
  const groupName = (id) => { const g = allGroups.find((x) => x.id === id); return g ? g.name : id.slice(0, 8); };
  const patchStep = (i, patch) => setSteps((ss) => ss.map((s, j) => j === i ? { ...s, ...patch } : s));
  const addStep = () => setSteps((ss) => [...ss, { approverOids: [], groupIds: [], rule: 'all', required: 1 }]);
  const removeStep = (i) => setSteps((ss) => ss.filter((_, j) => j !== i));
  const addApprover = (i, oid) => { if (!oid) return; patchStep(i, { approverOids: [...new Set([...steps[i].approverOids, oid])] }); };
  const removeApprover = (i, oid) => patchStep(i, { approverOids: steps[i].approverOids.filter((x) => x !== oid) });
  const addGroup = (i, id) => { if (!id) return; patchStep(i, { groupIds: [...new Set([...(steps[i].groupIds || []), id])] }); };
  const removeGroup = (i, id) => patchStep(i, { groupIds: (steps[i].groupIds || []).filter((x) => x !== id) });
  const chip = (bg, bd, fg, xbg, xfg) => ({ span: { display: 'inline-flex', alignItems: 'center', gap: '6px', background: bg, border: '1px solid ' + bd, borderRadius: '999px', padding: '4px 6px 4px 11px', font: '500 12.5px/1.2 "IBM Plex Sans"', color: fg }, x: { border: 'none', background: xbg, color: xfg, width: '17px', height: '17px', borderRadius: '50%', cursor: 'pointer', font: '600 10px/1 "IBM Plex Mono"' } });
  const peopleChip = chip('#eef1fb', '#d5ddf5', '#23283a', '#d5ddf5', '#3a4bb0');
  const groupChip = chip('#e9f5ef', '#c8e6d7', '#1f5c45', '#c8e6d7', '#1f7a5c');
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {steps.map((s, i) => {
          const gids = s.groupIds || [];
          const avail = activeEmps.filter((e) => !s.approverOids.includes(e.oid));
          const availGroups = allGroups.filter((g) => !gids.includes(g.id));
          return (
            <div key={i} style={{ border: '1px solid #e6e8ee', borderRadius: '11px', padding: '12px 13px', background: '#fbfbfd' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '9px', flexWrap: 'wrap' }}>
                <span style={{ font: '600 12.5px/1 "IBM Plex Sans"', color: '#54607a' }}>Step {i + 1}</span>
                <select value={s.rule} disabled={disabled} onChange={(e) => patchStep(i, { rule: e.target.value })} style={{ border: '1px solid #d8dce6', borderRadius: '8px', padding: '5px 8px', font: '500 12.5px/1 "IBM Plex Sans"', color: '#23283a', background: '#fff' }}>
                  <option value="all">All must approve</option>
                  <option value="any">Any one approves</option>
                  <option value="quorum">Quorum…</option>
                </select>
                {s.rule === 'quorum' && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px', font: '500 12px/1 "IBM Plex Sans"', color: '#54607a' }}>
                    <input type="number" min={1} value={s.required} disabled={disabled} onChange={(e) => patchStep(i, { required: e.target.value })} style={{ width: '52px', border: '1px solid #d8dce6', borderRadius: '8px', padding: '5px 7px', font: '500 12.5px/1 "IBM Plex Mono"' }} />
                    must approve
                  </span>
                )}
                <button disabled={disabled} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#c0143c', font: '600 12px/1 "IBM Plex Sans"', cursor: 'pointer' }} onClick={() => removeStep(i)}>Remove step</button>
              </div>
              {(s.approverOids.length > 0 || gids.length > 0) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '9px' }}>
                  {s.approverOids.map((oid) => (
                    <span key={oid} style={peopleChip.span}>{nameOf(oid)}
                      <button disabled={disabled} style={peopleChip.x} onClick={() => removeApprover(i, oid)}>✕</button></span>
                  ))}
                  {gids.map((id) => (
                    <span key={id} style={groupChip.span} title="Directory group — resolved to its members at submit">◇ {groupName(id)}
                      <button disabled={disabled} style={groupChip.x} onClick={() => removeGroup(i, id)}>✕</button></span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                <select value="" disabled={disabled} onChange={(e) => { addApprover(i, e.target.value); e.target.value = ''; }} style={{ flex: '1 1 200px', border: '1px solid #d8dce6', borderRadius: '8px', padding: '7px 9px', font: '400 12.5px/1 "IBM Plex Sans"', color: '#54607a', background: '#fff' }}>
                  <option value="">+ Add person…</option>
                  {avail.map((e) => <option key={e.oid} value={e.oid}>{e.display_name}{e.department ? ' · ' + e.department : ''}</option>)}
                </select>
                {allGroups.length > 0 && (
                  <select value="" disabled={disabled} onChange={(e) => { addGroup(i, e.target.value); e.target.value = ''; }} style={{ flex: '1 1 200px', border: '1px solid #d8dce6', borderRadius: '8px', padding: '7px 9px', font: '400 12.5px/1 "IBM Plex Sans"', color: '#1f5c45', background: '#fff' }}>
                    <option value="">+ Add group…</option>
                    {availGroups.map((g) => <option key={g.id} value={g.id}>{g.name}{typeof g.member_count !== 'undefined' ? ` (${g.member_count})` : ''}</option>)}
                  </select>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <button disabled={disabled} style={{ ...btn('#fff', '#54607a', '#e6e8ee'), marginTop: '11px' }} onClick={addStep}>+ Add step</button>
    </div>
  );
}

export function MyApprovals({ pending, onOpen }) {
  const card = { background: '#fff', border: '1px solid #e6e8ee', borderRadius: '12px', boxShadow: '0 1px 3px rgba(20,30,80,.06)' };
  const list = pending || [];
  return (
    <div style={{ maxWidth: '820px' }}>
      {!list.length && <div style={{ ...card, padding: '30px', textAlign: 'center', color: '#8a92a6', font: '400 13.5px/1.5 "IBM Plex Sans"' }}>Nothing is awaiting your approval right now.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {list.map((p) => (
          <div key={p.id} style={{ ...card, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: '600 15px/1.3 "IBM Plex Sans"', color: '#161a26' }}>{p.name}</div>
              <div style={{ font: '400 12.5px/1.4 "IBM Plex Mono",monospace', color: '#9aa1b2', marginTop: '3px' }}>{p.version}{p.submitted_at ? ' · submitted ' + new Date(p.submitted_at).toLocaleDateString() : ''}</div>
            </div>
            <button style={{ border: 'none', background: '#213a9e', color: '#fff', borderRadius: '9px', padding: '10px 17px', font: '600 13px/1 "IBM Plex Sans"', cursor: 'pointer' }} onClick={() => onOpen(p)}>Review</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ApprovalsModal({ policy, onClose, onChanged, toast }) {
  const [data, setData] = useState(null);
  const [emps, setEmps] = useState([]);
  const [groups, setGroups] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [steps, setSteps] = useState([]);    // builder: [{ approverOids:[], groupIds:[], rule, required }]
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const stop = (e) => e.stopPropagation();

  const load = async () => {
    const d = await api.policyApprovals(policy.id);
    setData(d);
    // The builder edits the SPEC: directly-named people (from_group null) + groups.
    setSteps((d.steps || []).map((s) => ({
      approverOids: s.approvers.filter((a) => !a.from_group).map((a) => a.oid),
      groupIds: (s.groups || []).map((g) => g.id),
      rule: s.rule, required: s.required,
    })));
  };
  useEffect(() => {
    load().catch((e) => { if (toast) toast(e.message, true); onClose(); });
    api.employees().then(setEmps).catch(() => {});
    api.groups().then(setGroups).catch(() => {});         // admin-only; ignored for non-admins
    api.workflows().then(setTemplates).catch(() => {});   // admin-only; ignored for non-admins
  }, []);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); if (okMsg && toast) toast(okMsg); await load(); if (onChanged) onChanged(); }
    catch (e) { if (toast) toast(e.message, true); }
    finally { setBusy(false); }
  };
  const nameOf = (oid) => {
    const e = emps.find((x) => x.oid === oid);
    if (e) return e.display_name;
    for (const s of (data ? data.steps : [])) { const a = s.approvers.find((x) => x.oid === oid); if (a && a.name) return a.name; }
    return oid.slice(0, 8);
  };
  const saveSteps = () => api.setApproverSteps(policy.id, stepsToPayload(steps));

  if (!data) return null;
  const st = data.approval_state;
  const canConfig = data.canGovern && st !== 'in_review';
  // Most recent decision (current version) per (position, approver).
  const decFor = (pos, oid) => { let hit = null; data.decisions.forEach((d) => { if (d.step_position === pos && d.approver_oid === oid) hit = d; }); return hit; };
  const totalApprovers = steps.reduce((n, s) => n + s.approverOids.length + (s.groupIds || []).length, 0);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,26,48,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '36px', zIndex: 56, animation: 'ovIn .18s ease' }} onClick={onClose}>
      <div style={{ width: '640px', maxWidth: '100%', maxHeight: '88vh', background: '#fff', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(10,16,40,.34)', animation: 'cardUp .22s ease' }} onClick={stop}>
        <div style={{ flex: 'none', padding: '22px 26px', borderBottom: '1px solid #eceef4', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ font: '600 18px/1.2 "IBM Plex Sans"', color: '#161a26' }}>Approval — {policy.name}</div>
            <div style={{ marginTop: '7px', display: 'flex', alignItems: 'center', gap: '9px' }}><ApprovalBadge state={st} />
              <span style={{ font: '400 12px/1.3 "IBM Plex Mono",monospace', color: '#9aa1b2' }}>{policy.version}</span></div>
          </div>
          <button style={{ border: 'none', background: '#f3f4f8', width: '34px', height: '34px', borderRadius: '9px', cursor: 'pointer', color: '#54607a', flex: 'none' }} onClick={onClose}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 26px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Approval chain (grouped steps) */}
          <div>
            <div style={{ font: '600 11px/1 "IBM Plex Mono",monospace', letterSpacing: '.08em', textTransform: 'uppercase', color: '#9aa1b2', marginBottom: '10px' }}>Approval chain</div>
            {!data.steps.length && <div style={{ font: '400 13px/1.5 "IBM Plex Sans"', color: '#8a92a6' }}>No approvers configured yet.</div>}
            {data.steps.map((s) => {
              const isCurrent = data.currentStep && data.currentStep.position === s.position;
              const circle = s.satisfied ? '#1f7a5c' : (isCurrent ? '#213a9e' : '#eef0f4');
              return (
                <div key={s.position} style={{ display: 'flex', alignItems: 'flex-start', gap: '11px', padding: '10px 0', borderBottom: '1px solid #f3f4f8' }}>
                  <span style={{ flex: 'none', width: '22px', height: '22px', borderRadius: '50%', background: circle, color: s.satisfied || isCurrent ? '#fff' : '#9aa1b2', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '600 11px/1 "IBM Plex Mono"' }}>{s.satisfied ? '✓' : s.position}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ font: '600 12.5px/1.3 "IBM Plex Sans"', color: '#54607a' }}>Step {s.position}</span>
                      {(s.approvers.length > 1 || (s.groups && s.groups.length)) && <span style={{ font: '600 10px/1.4 "IBM Plex Mono",monospace', textTransform: 'uppercase', letterSpacing: '.04em', color: '#6b74e0', background: '#eef0fb', borderRadius: '999px', padding: '2px 8px' }}>{ruleLabel(s)}</span>}
                      {(s.groups || []).map((g) => <span key={g.id} title="Directory group — expanded to its members at submit" style={{ font: '600 10px/1.4 "IBM Plex Mono",monospace', color: '#1f5c45', background: '#e9f5ef', border: '1px solid #c8e6d7', borderRadius: '999px', padding: '2px 8px' }}>◇ {g.name}</span>)}
                      {isCurrent && <span style={{ font: '600 11px/1 "IBM Plex Mono"', color: '#213a9e' }}>· awaiting</span>}
                    </div>
                    {!s.approvers.length && (s.groups && s.groups.length) ? <div style={{ marginTop: '5px', font: '400 12px/1.5 "IBM Plex Sans"', color: '#8a92a6' }}>Members resolved when submitted for approval.</div> : null}
                    {s.approvers.map((a) => {
                      const dec = decFor(s.position, a.oid);
                      const approvedInRun = s.approvedOids.includes(a.oid);
                      return (
                        <div key={a.oid} style={{ marginTop: '5px' }}>
                          <div style={{ font: '600 13px/1.3 "IBM Plex Sans"', color: '#23283a' }}>{a.name || nameOf(a.oid)}{a.from_group && <span style={{ marginLeft: '7px', color: '#1f7a5c', font: '500 11px/1 "IBM Plex Mono"' }}>· via group</span>}{approvedInRun && <span style={{ marginLeft: '7px', color: '#1f7a5c', font: '600 11px/1 "IBM Plex Mono"' }}>✓</span>}</div>
                          {dec && <div style={{ font: '400 12px/1.5 "IBM Plex Sans"', color: DECISION_LABEL[dec.decision][1], marginTop: '1px' }}>{DECISION_LABEL[dec.decision][0]}{dec.comment ? ' — “' + dec.comment + '”' : ''} <span style={{ color: '#aab0c0' }}>· {fmtWhen(dec.decided_at)}</span></div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Current approver actions */}
          {data.canAct && (
            <div style={{ background: '#f7f8fb', border: '1px solid #eceef4', borderRadius: '11px', padding: '15px' }}>
              <div style={{ font: '600 13px/1.3 "IBM Plex Sans"', color: '#23283a', marginBottom: '9px' }}>Your decision</div>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment (required to reject or request changes)…" rows={2}
                style={{ width: '100%', border: '1px solid #d8dce6', borderRadius: '9px', padding: '9px 11px', font: '400 13px/1.4 "IBM Plex Sans"', resize: 'vertical', outline: 'none' }} />
              <div style={{ display: 'flex', gap: '9px', marginTop: '10px', flexWrap: 'wrap' }}>
                <button disabled={busy} style={btn('#1f7a5c', '#fff')} onClick={() => run(() => api.approvePolicy(policy.id, comment), 'Approved')}>Approve</button>
                <button disabled={busy} style={btn('#fff', '#c2410c', '#f0d9c9')} onClick={() => run(() => api.requestChanges(policy.id, comment), 'Changes requested')}>Request changes</button>
                <button disabled={busy} style={btn('#fff', '#c0143c', '#f0d6dd')} onClick={() => run(() => api.rejectPolicy(policy.id, comment), 'Rejected')}>Reject</button>
              </div>
            </div>
          )}

          {/* Owner / admin: configure approver steps */}
          {canConfig && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                <div style={{ font: '600 11px/1 "IBM Plex Mono",monospace', letterSpacing: '.08em', textTransform: 'uppercase', color: '#9aa1b2' }}>Configure steps (approved in order)</div>
                {templates.length > 0 && (
                  <select value="" style={{ marginLeft: 'auto', border: '1px solid #d8dce6', borderRadius: '8px', padding: '5px 9px', font: '500 12px/1 "IBM Plex Sans"', color: '#54607a', background: '#fff' }}
                    onChange={(e) => { const id = e.target.value; e.target.value = ''; if (id) run(() => api.applyWorkflow(policy.id, Number(id)), 'Template applied'); }}>
                    <option value="">Apply a template…</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
              </div>
              <StepBuilder steps={steps} setSteps={setSteps} emps={emps} groups={groups} disabled={busy} />
              <button disabled={busy || !totalApprovers} style={{ ...btn('#fff', '#213a9e', '#c9d3f0'), marginTop: '11px' }} onClick={() => run(saveSteps, 'Steps saved')}>Save steps ({totalApprovers})</button>
            </div>
          )}
        </div>

        {/* Footer: governance actions */}
        <div style={{ flex: 'none', borderTop: '1px solid #eceef4', background: '#fafbfd', padding: '15px 26px', display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {data.canGovern && ['draft', 'changes_requested', 'rejected', 'published'].includes(st) &&
            <button disabled={busy || !data.steps.length} style={btn('#213a9e', '#fff')} onClick={() => run(() => api.submitApproval(policy.id), 'Submitted for approval')}>Submit for approval</button>}
          {data.canGovern && st === 'in_review' &&
            <button disabled={busy} style={btn('#fff', '#54607a', '#e6e8ee')} onClick={() => run(() => api.withdrawApproval(policy.id), 'Withdrawn')}>Withdraw</button>}
          {data.canGovern && st === 'approved' &&
            <button disabled={busy} style={btn('#1f7a5c', '#fff')} onClick={() => run(() => api.publishPolicy(policy.id), 'Published')}>Publish</button>}
          {data.canGovern && !['published'].includes(st) &&
            <button disabled={busy} style={btn('#fff', '#54607a', '#e6e8ee')} onClick={() => run(() => api.approveExternally(policy.id), 'Marked approved externally')}>Mark approved externally</button>}
          <button style={btn('#fff', '#54607a', '#e6e8ee')} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
