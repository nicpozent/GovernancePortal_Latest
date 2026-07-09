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

export function ApprovalsModal({ policy, onClose, onChanged, toast }) {
  const [data, setData] = useState(null);
  const [emps, setEmps] = useState([]);
  const [sel, setSel] = useState([]);        // ordered approver oids being configured
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const stop = (e) => e.stopPropagation();

  const load = async () => {
    const d = await api.policyApprovals(policy.id);
    setData(d);
    setSel(d.approvers.map((a) => a.oid));
  };
  useEffect(() => {
    load().catch((e) => { if (toast) toast(e.message, true); onClose(); });
    api.employees().then(setEmps).catch(() => {});
  }, []);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); if (okMsg && toast) toast(okMsg); await load(); if (onChanged) onChanged(); }
    catch (e) { if (toast) toast(e.message, true); }
    finally { setBusy(false); }
  };
  const toggle = (oid) => setSel((s) => s.includes(oid) ? s.filter((x) => x !== oid) : [...s, oid]);
  const nameOf = (oid) => { const e = emps.find((x) => x.oid === oid); return e ? e.display_name : (data && data.approvers.find((a) => a.oid === oid) || {}).name || oid.slice(0, 8); };

  if (!data) return null;
  const st = data.approval_state;
  const canConfig = data.canGovern && st !== 'in_review';
  const decisionByStep = {};
  data.decisions.forEach((d) => { decisionByStep[d.step_position] = d; });

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
          {/* Approver chain */}
          <div>
            <div style={{ font: '600 11px/1 "IBM Plex Mono",monospace', letterSpacing: '.08em', textTransform: 'uppercase', color: '#9aa1b2', marginBottom: '10px' }}>Approval chain</div>
            {!data.approvers.length && <div style={{ font: '400 13px/1.5 "IBM Plex Sans"', color: '#8a92a6' }}>No approvers configured yet.</div>}
            {data.approvers.map((a) => {
              const dec = decisionByStep[a.position];
              const isCurrent = data.currentStep && data.currentStep.position === a.position;
              return (
                <div key={a.position} style={{ display: 'flex', alignItems: 'flex-start', gap: '11px', padding: '9px 0', borderBottom: '1px solid #f3f4f8' }}>
                  <span style={{ flex: 'none', width: '22px', height: '22px', borderRadius: '50%', background: dec ? (DECISION_LABEL[dec.decision][1]) : (isCurrent ? '#213a9e' : '#eef0f4'), color: dec || isCurrent ? '#fff' : '#9aa1b2', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '600 11px/1 "IBM Plex Mono"' }}>{a.position}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '600 13.5px/1.3 "IBM Plex Sans"', color: '#23283a' }}>{a.name || nameOf(a.oid)}{isCurrent && <span style={{ marginLeft: '8px', font: '600 11px/1 "IBM Plex Mono"', color: '#213a9e' }}>· awaiting</span>}</div>
                    {dec && <div style={{ font: '400 12.5px/1.5 "IBM Plex Sans"', color: DECISION_LABEL[dec.decision][1], marginTop: '2px' }}>{DECISION_LABEL[dec.decision][0]}{dec.comment ? ' — “' + dec.comment + '”' : ''} <span style={{ color: '#aab0c0' }}>· {fmtWhen(dec.decided_at)}</span></div>}
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

          {/* Owner / admin: configure approvers */}
          {canConfig && (
            <div>
              <div style={{ font: '600 11px/1 "IBM Plex Mono",monospace', letterSpacing: '.08em', textTransform: 'uppercase', color: '#9aa1b2', marginBottom: '10px' }}>Configure approvers (in order)</div>
              <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #eceef4', borderRadius: '10px' }}>
                {emps.filter((e) => e.status !== 'Inactive').map((e) => {
                  const idx = sel.indexOf(e.oid);
                  return (
                    <div key={e.oid} onClick={() => toggle(e.oid)} style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f8', background: idx >= 0 ? '#eef1fb' : '#fff' }}>
                      <span style={{ flex: 'none', width: '20px', height: '20px', borderRadius: '50%', border: '1px solid ' + (idx >= 0 ? '#213a9e' : '#cfd4e0'), background: idx >= 0 ? '#213a9e' : '#fff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '600 11px/1 "IBM Plex Mono"' }}>{idx >= 0 ? idx + 1 : ''}</span>
                      <span style={{ flex: 1, font: '500 13px/1.3 "IBM Plex Sans"', color: '#23283a' }}>{e.display_name}</span>
                      <span style={{ font: '400 11.5px/1 "IBM Plex Mono"', color: '#9aa1b2' }}>{e.department || ''}</span>
                    </div>
                  );
                })}
              </div>
              <button disabled={busy} style={{ ...btn('#fff', '#213a9e', '#c9d3f0'), marginTop: '10px' }} onClick={() => run(() => api.setApprovers(policy.id, sel), 'Approvers saved')}>Save approvers ({sel.length})</button>
            </div>
          )}
        </div>

        {/* Footer: governance actions */}
        <div style={{ flex: 'none', borderTop: '1px solid #eceef4', background: '#fafbfd', padding: '15px 26px', display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {data.canGovern && ['draft', 'changes_requested', 'rejected', 'published'].includes(st) &&
            <button disabled={busy || !sel.length} style={btn('#213a9e', '#fff')} onClick={() => run(() => api.submitApproval(policy.id), 'Submitted for approval')}>Submit for approval</button>}
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
