/* Admin → Approval workflows. Author reusable approval templates (ADR-120,
   Phase 2c): a named, ordered chain of steps with all/any/quorum rules that can
   be applied to any policy from the Approvals panel. Editing a template never
   disturbs policies it was already applied to — apply copies the steps in. */
import * as React from 'react';
const { useState, useEffect } = React;
import { api } from '../api.js';
import { StepBuilder, stepsToPayload, ruleLabel } from './approvals.jsx';

const card = { background: '#fff', border: '1px solid #e6e8ee', borderRadius: '12px', boxShadow: '0 1px 3px rgba(20,30,80,.06)' };
const btn = (bg, fg, bd) => ({ border: '1px solid ' + (bd || bg), background: bg, color: fg, borderRadius: '9px', padding: '9px 15px', font: '600 13px/1 "IBM Plex Sans"', cursor: 'pointer' });

export function WorkflowTemplates({ toast }) {
  const [list, setList] = useState(null);
  const [emps, setEmps] = useState([]);
  const [editing, setEditing] = useState(null);   // { id?, name, description, steps:[{approverOids,rule,required}] }
  const [busy, setBusy] = useState(false);

  const load = async () => setList(await api.workflows());
  useEffect(() => {
    load().catch((e) => { if (toast) toast(e.message, true); });
    api.employees().then(setEmps).catch(() => {});
  }, []);

  const startNew = () => setEditing({ name: '', description: '', steps: [] });
  const startEdit = (t) => setEditing({ id: t.id, name: t.name, description: t.description || '', steps: t.steps.map((s) => ({ approverOids: s.approvers.map((a) => a.oid), rule: s.rule, required: s.required || 1 })) });
  const setSteps = (fn) => setEditing((ed) => ({ ...ed, steps: typeof fn === 'function' ? fn(ed.steps) : fn }));

  const run = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); if (okMsg && toast) toast(okMsg); await load(); }
    catch (e) { if (toast) toast(e.message, true); }
    finally { setBusy(false); }
  };
  const save = () => run(async () => {
    const body = { name: editing.name.trim(), description: editing.description.trim(), steps: stepsToPayload(editing.steps) };
    if (editing.id) await api.updateWorkflow(editing.id, body); else await api.createWorkflow(body);
    setEditing(null);
  }, 'Template saved');
  const del = (t) => { if (!window.confirm(`Delete template “${t.name}”? Policies it was applied to keep their approvers.`)) return; run(() => api.deleteWorkflow(t.id), 'Template deleted'); };

  const totalApprovers = editing ? editing.steps.reduce((n, s) => n + s.approverOids.length, 0) : 0;

  return (
    <div style={{ maxWidth: '860px' }}>
      {!editing && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ font: '400 13.5px/1.5 "IBM Plex Sans"', color: '#54607a' }}>Reusable approval chains you can apply to any policy from its Approvals panel.</div>
            <button style={{ ...btn('#213a9e', '#fff'), marginLeft: 'auto' }} onClick={startNew}>New template</button>
          </div>
          {list === null && <div style={{ ...card, padding: '30px', textAlign: 'center', color: '#8a92a6' }}>Loading…</div>}
          {list && !list.length && <div style={{ ...card, padding: '30px', textAlign: 'center', color: '#8a92a6', font: '400 13.5px/1.5 "IBM Plex Sans"' }}>No templates yet. Create one to standardise sign-off across policies.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {(list || []).map((t) => (
              <div key={t.id} style={{ ...card, padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '600 15px/1.3 "IBM Plex Sans"', color: '#161a26' }}>{t.name}</div>
                    {t.description && <div style={{ font: '400 12.5px/1.5 "IBM Plex Sans"', color: '#8a92a6', marginTop: '3px' }}>{t.description}</div>}
                  </div>
                  <button style={btn('#fff', '#213a9e', '#c9d3f0')} onClick={() => startEdit(t)}>Edit</button>
                  <button style={btn('#fff', '#c0143c', '#f0d6dd')} onClick={() => del(t)}>Delete</button>
                </div>
                <div style={{ marginTop: '11px', display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                  {!t.steps.length && <span style={{ font: '400 12px/1.4 "IBM Plex Sans"', color: '#aab0c0' }}>No steps.</span>}
                  {t.steps.map((s) => (
                    <span key={s.position} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f4f6fb', border: '1px solid #e6e8ee', borderRadius: '8px', padding: '5px 10px', font: '500 12px/1.3 "IBM Plex Sans"', color: '#3a4460' }}>
                      <b style={{ color: '#54607a' }}>{s.position}.</b> {s.approvers.map((a) => a.name || a.oid.slice(0, 8)).join(', ')}
                      <span style={{ font: '600 10px/1 "IBM Plex Mono",monospace', textTransform: 'uppercase', color: '#6b74e0' }}>· {ruleLabel(s)}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {editing && (
        <div style={{ ...card, padding: '22px 24px' }}>
          <div style={{ font: '600 16px/1.2 "IBM Plex Sans"', color: '#161a26', marginBottom: '16px' }}>{editing.id ? 'Edit template' : 'New template'}</div>
          <label style={{ display: 'block', font: '600 11px/1 "IBM Plex Mono",monospace', letterSpacing: '.06em', textTransform: 'uppercase', color: '#9aa1b2', marginBottom: '6px' }}>Name</label>
          <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Standard policy sign-off"
            style={{ width: '100%', border: '1px solid #d8dce6', borderRadius: '9px', padding: '9px 11px', font: '500 14px/1.3 "IBM Plex Sans"', outline: 'none', marginBottom: '14px' }} />
          <label style={{ display: 'block', font: '600 11px/1 "IBM Plex Mono",monospace', letterSpacing: '.06em', textTransform: 'uppercase', color: '#9aa1b2', marginBottom: '6px' }}>Description <span style={{ textTransform: 'none', color: '#c0c5d2' }}>(optional)</span></label>
          <input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="When to use this chain"
            style={{ width: '100%', border: '1px solid #d8dce6', borderRadius: '9px', padding: '9px 11px', font: '400 13px/1.3 "IBM Plex Sans"', outline: 'none', marginBottom: '18px' }} />
          <div style={{ font: '600 11px/1 "IBM Plex Mono",monospace', letterSpacing: '.08em', textTransform: 'uppercase', color: '#9aa1b2', marginBottom: '10px' }}>Steps (approved in order)</div>
          <StepBuilder steps={editing.steps} setSteps={setSteps} emps={emps} disabled={busy} />
          <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
            <button disabled={busy || !editing.name.trim() || !totalApprovers} style={btn('#213a9e', '#fff')} onClick={save}>Save template</button>
            <button disabled={busy} style={btn('#fff', '#54607a', '#e6e8ee')} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
