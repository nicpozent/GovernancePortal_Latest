# User Stories — Policy Approval Workflow

_Detailed stories with Gherkin acceptance criteria, traced to endpoints and
automated tests. Companion: [HLD.md](HLD.md) · [LLD.md](LLD.md)._

---

## 1. Personas

| Persona | Who | Capabilities |
|---------|-----|--------------|
| **Governance Admin** | Holds `Governance.Admin` app role | Everything: configure/submit/publish any policy, decide on any step (override), manage templates, `approve-externally` |
| **Policy Owner** | The `owner_oid` of a policy (admin or manager) | Configure approvers, submit, withdraw, publish, apply a template — for **their** policies |
| **Approver** | A person named on a step, or a member of a step's group | See the policy under review; approve / reject / request changes when it is their step |
| **Employee** | Any authenticated user | See & acknowledge only Approved-and-Published policies |

---

## 2. Epic

> *As the organisation, we need every policy to be formally approved by the right
> people, in the right order, before employees are asked to acknowledge it — with
> a tamper-evident record of who approved what.*

---

## 3. Stories

### 3.1 Configure & submit (Policy Owner)

**US-01 — Configure an ordered approver chain**
> As a Policy Owner, I want to define the sequence of approvers for a policy so the
> right people sign off in the right order.

```gherkin
Given I own a policy in Draft/Published/Changes-Requested/Rejected
When I save steps [ {Infra Mgr}, {CISO}, {CTO} ]
Then the policy shows a 3-step chain
And I cannot change approvers while it is In Review
```

**US-02 — Group a step with a rule (all / any / quorum)**
> As a Policy Owner, I want a single step to hold several approvers with a rule so I
> can model "any one director" or "2 of the security team".

```gherkin
Given a step with approvers [A, B, C]
When I set its rule to "quorum" with required = 2
Then the step is satisfied once any 2 of {A,B,C} approve
And "any" is satisfied by 1, "all" requires all 3
```

**US-03 — Target a directory group as an approver**
> As a Policy Owner, I want to point a step at a group (e.g. "Security") so I don't
> maintain names by hand.

```gherkin
Given a step targets the group "Security" with rule "all"
When I submit the policy
Then the group is expanded to its current members, frozen for this run
And every frozen member must approve
And an empty group blocks submission with a clear message
```

**US-04 — Submit for approval**
> As a Policy Owner, I want to submit a policy so its approval run begins and it is
> hidden from employees until published.

```gherkin
Given a policy with at least one configured step
When I submit it
Then its state becomes In Review
And employees can no longer see or open it
And the first step's approvers are notified (if email is configured)
```

**US-05 — Withdraw a submission**
```gherkin
Given a policy is In Review
When I withdraw it
Then it returns to Draft and no step is awaiting a decision
```

**US-06 — Apply a reusable template**
> As a Policy Owner, I want to apply a standard chain in one click.

```gherkin
Given an admin has published a "Standard sign-off" template
When I apply it to my policy
Then the template's steps/people/groups are COPIED onto my policy
And later edits to the template do not change my policy
And I cannot apply a template while the policy is In Review
```

### 3.2 Decide (Approver)

**US-07 — See what awaits me**
```gherkin
Given I am the current approver (named, or via a group) on one or more policies
When I open "My approvals"
Then I see exactly those policies awaiting my decision
And a policy I have already approved (or that is not my turn) is not listed
```

**US-08 — Approve my step**
```gherkin
Given it is my step
When I approve
Then my approval is appended to the immutable ledger
And if my step's rule is now satisfied the chain advances (or reaches Approved)
And I cannot approve the same step twice
```

**US-09 — Reject / request changes with a mandatory comment**
```gherkin
Given it is my step
When I reject or request changes without a comment
Then I am refused with "a comment is required"
When I supply a comment
Then the policy moves to Rejected / Changes Requested and my comment is recorded
And the owner is notified of the outcome
```

**US-10 — Be blocked when it is not my turn**
```gherkin
Given an earlier step is not yet satisfied
When I (a later-step approver) try to approve
Then I am refused with "not_pending_approver"
```

### 3.3 Publish (Policy Owner / Admin)

**US-11 — Publish an approved policy**
```gherkin
Given a policy is Approved
When I publish it
Then employees can see and acknowledge it again
And publishing a not-yet-approved policy is refused ("not_approved")
```

**US-12 — Record external approval (Admin escape hatch)**
> As a Governance Admin, for a policy signed off outside the portal, I want to mark
> it approved without routing it.

```gherkin
Given a policy that was approved in SharePoint
When I "approve externally"
Then it becomes Published and visible, and the action is audited
```

### 3.4 Manage templates (Governance Admin)

**US-13 — Author, edit, delete templates**
```gherkin
Given I am an admin
When I create/edit/delete an approval template (steps of people and/or groups)
Then non-admins cannot list or manage templates
And deleting a template leaves policies it was applied to intact
```

### 3.5 Integrity & audit (Governance Admin / Auditor)

**US-14 — Tamper-evident decision record**
```gherkin
Given decisions have been recorded
When anyone (including the app role) attempts to update or delete a decision
Then the database refuses it (append-only); corrections are new rows
```

**US-15 — Snapshot integrity for in-flight runs**
```gherkin
Given a policy is In Review with a group step frozen at submit
When someone is added to that group
Then the running approval is unchanged
And re-submitting later takes a fresh snapshot that includes the new member
```

---

## 4. Cross-cutting acceptance criteria

- **Backward compatible:** an existing policy that is never submitted stays `published`/visible.
- **Per version:** approving version *v1* does not approve a later *v2*.
- **Availability:** a mail-send failure never fails a decision.
- **Least privilege:** no new Entra scope is required to resolve group members.

---

## 5. Traceability matrix

Story → API surface → automated test (file · test name). All tests under
`apps/api/test/integration/`.

| Story | Endpoint(s) | Test |
|-------|-------------|------|
| US-01 | `PUT …/approvers` | approvals · *full chain: configure → …* |
| US-02 | `PUT …/approvers` (steps) | approvals · *group step 'any' / 'all' / 'quorum'*; *mixed steps* |
| US-03 | `PUT …/approvers` (groupIds) + `submit` | approval-groups · *group step 'all'/'any'/'quorum'*; *empty group cannot be submitted*; *named person also a group member counted once* |
| US-04 | `POST …/submit` | approvals · *full chain …* (visibility gate); *submit requires at least one approver* |
| US-05 | `POST …/withdraw` | approvals · *full chain …* |
| US-06 | `POST …/apply-workflow` | approval-templates · *applying a template configures the policy and drives a real run*; *a template cannot be applied while In Review* |
| US-07 | `GET /approvals/pending` | approvals · *pending queue lists policies awaiting the caller*; approval-groups · *group step 'any' … a group member is pending* |
| US-08 | `POST …/approve` | approvals · *full chain …*; *group step 'all' … double-approve is blocked* |
| US-09 | `POST …/reject`, `…/request-changes` | approvals · *request-changes needs a comment …*; *reject moves to rejected …* |
| US-10 | `POST …/approve` (out of turn) | approvals · *full chain …* (out-of-turn approver rejected); approval-groups · *snapshot … adding a member AFTER submit* |
| US-11 | `POST …/publish` | approvals · *publish is blocked unless approved …* |
| US-12 | `POST …/approve-externally` | approvals · *… admin can approve externally* |
| US-13 | `GET/POST/PUT/DELETE /approval-workflows` | approval-templates · *template CRUD is admin-only*; *create … and read it back*; *deleting a template leaves applied policies intact* |
| US-14 | (DB grant) | Enforced by `REVOKE update,delete on policy_approvals`; exercised implicitly by every decision test |
| US-15 | `expandGroups` at submit | approval-groups · *snapshot-at-submit …*; *re-submitting after changes re-resolves the group* |

**Coverage:** 22 integration tests across `approvals.test.js` (10),
`approval-templates.test.js` (6), `approval-groups.test.js` (6).
