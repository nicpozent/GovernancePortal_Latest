# Birgma Governance Portal — User Guide

The portal has three profiles. What you see depends on the app role assigned to
you in Microsoft Entra ID. People with more than one role get a **role switcher**
(top of the screen) to move between views.

- **Employee** — everyone: read & acknowledge what's assigned to you.
- **Manager** (`Governance.Manager`) — upload & assign your own documents/trainings
  to your team and track their completion; plus the full Employee experience.
- **Administrator** (`Governance.Admin`) — full control: policies, groups,
  employees, quizzes, reporting, backups, audit.

Signing in: click **Sign in with Microsoft** and use your normal work account.
After 15 minutes idle you're signed out automatically (60-second warning first).

---

## 1. Employee

### My policies
Your required documents, each with a status: **Action required**, **Signed**, or
**Re-sign required** (the document changed version since you last signed), plus
any **deadline** (amber within 7 days, red when overdue).

### Reading & acknowledging
1. Click **Read & sign**.
2. Open the document (SharePoint link, or the uploaded file plays/loads inline —
   use **Enlarge** for a bigger view).
3. If there's a **knowledge check**, answer it and submit — you must reach the
   pass mark. Fail → retry, up to **3 attempts**; wrong answers are shown so you
   can learn before retrying.
4. Tick "I have read and understood", type your first and last name, click
   **Sign & acknowledge**.
5. You get a printable **confirmation** (and a confirmation **email**). Your
   signature records the exact version, date and time.

### My signatures
Your full acknowledgement history — your personal compliance record.

---

## 2. Manager

A manager has everything an employee does, plus a **Manager** view (role switcher).

### Team dashboard
KPIs for the people who report to you (functional or directory manager):
team size, fully compliant count, overall completion %, open items — with a
**My team** list (per-person completion) and a **By document** breakdown.
**Remind my team** emails reminders to your team members who still owe a signature.

### Documents
Upload and assign your own material from your computer:
1. **New document** → pick a **type** (Training, Policy, Process, Procedure,
   Standard, Guideline).
2. Upload the file (PDF, video, PowerPoint, Word, image — up to 250 MB).
3. Set version, optional deadline (none / N days after assignment / fixed date),
   and **assign to groups** — the **Reaches N people** line shows your audience.
4. Optionally attach a **Quiz** (see below).
5. Save. Employees in the assigned groups now see it in *My policies*.
Edit to replace the file or change assignment; **Quiz** for the knowledge check;
the history icon for version history; archive to retire it. You only see and
manage **your own** uploads.

---

## 3. Administrator

### Dashboard
Organisation-wide compliance. Toggle **Overview / By unit / By group**; click a
group to see who has and hasn't signed. **Export CSV** (scope: all, a department,
or one group) for the full matrix. **Send reminders** runs the email reminder
cycle now.

### Policy library
- **Add policy** → name, type, version, pick the document with **Browse
  SharePoint** (or paste a link), set deadline + **owner** (gets review
  reminders) + **review-by** date, and **assign to groups** (watch *Reaches N
  people* — unassigned = private to admins/owner; use **All Employees** for
  company-wide).
- **Edit** re-opens the form (record a **version note** for the change log).
- **Quiz**, **version history**, and **archive/restore** per policy.

### Groups & access
Platform roles (Administrators, Compliance, Read All, All Employees) and local
groups. **Map** on-prem AD / Entra security groups into any group — membership
rolls up automatically — or add members directly. Archive (preferred) or delete
unused groups.

### Employees
- **Sync now** imports users, groups and managers from the directory (also runs
  nightly). The **last-sync** status shows success/time/counts.
- **Import CSV** bulk-adds local users (optional).
- Set a person's **functional manager** (pencil icon) for cross-entity reporting.
- **Former employees** tab keeps leavers' signature history for audit.

### Quizzes (knowledge checks)
On any policy/training: set a title, **pass mark %**, and questions with points;
mark the correct answer. **Analytics** shows pass rate and per-question
difficulty. Archive/restore/delete. Employees must pass before signing.

### Backups & Audit
- **Backups** — download a DB dump, create a server-stored backup, or rely on the
  daily automatic backup (kept 14). Whole-application backup via
  `deploy/scripts/backup-all.ps1`.
- **Audit log** — every administrative action (append-only), with who/when/what.

### Help
In-app, searchable, role-aware help is built in (sidebar → **Help**).

---

## Tips
- **Company-wide** distribution = assign to the **All Employees** group (make sure
  it has members — unassigned documents are private).
- **Deadlines:** "N days after assignment" is fair to new joiners; "fixed date"
  is for hard org-wide rollouts.
- **Re-sign:** bumping a policy's version returns it to "Re-sign required" for
  everyone, so people acknowledge the new version.
