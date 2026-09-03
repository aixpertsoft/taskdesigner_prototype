# Prototype guide

A screen-by-screen walkthrough of `index.html` — what each part shows, and which design decision it
exists to demonstrate.

See the [README](../README.md) for how to start it. Background is in [overview.md](overview.md); the
contract is in [specification.md](specification.md).

---

## Before you start

Two things make the prototype make sense:

**Switch users.** The avatars at the top right change who you are. Approvals are per person, so a
single-user session cannot show the feature working. This is also the thing a session-storage
prototype could never have done, which is why the POC uses a file-backed endpoint instead.

**Watch the gate.** The box below the task list is the heart of the design. It restates every rule
with its own pass/fail and a reason, and the Execute button follows it.

---

## 1. The inbox

**What it shows.** Five tabs — *Awaiting my action*, *Awaiting my approval*, *My requests*,
*All open*, *Everything* — over a list of requests. Each row carries its status, how many tasks it
holds, approval progress, open change requests, and whether anything has failed or is parked waiting
for a person.

**Why it exists.** The original requirements document specified two editors and no list view. An
approval tool without an inbox is not a daily tool: the first question anyone has when they log in is
"what needs me?" and nothing in the original design answered it. The two leading tabs answer the two
forms that question takes — *something needs your signature* and *something needs your approval*.

**Try:** switch between users and watch *Awaiting my approval* change. M. Browett sees nothing there,
because the only open request he could act on is his own. *Awaiting my action* stays empty until a
run parks on a signature — see §6.

---

## 2. The task request

The centrepiece. Modelled on the GitHub PR page: what is proposed on the left, who has signed off on
the right, and a gate at the bottom.

### Task cards

Each task shows its type, its configuration as labelled values, and a status —
`not run` / `running` / `succeeded` / `failed`.

**Why:** the original document had `RunFlag: true/false`. That is too weak to hang a "Failed
execution" badge on, and gives re-runs nowhere to record an attempt count.

### The approvals rail

Lists everyone who could approve, what they decided, and — for those who cannot — why. The requester
is shown greyed with "cannot approve their own".

**Why:** self-approval has to be a rule, not an honour system. `excludeRequester` is a setting on the
approval rule, and the platform's existing `SelfAdvancementMode` covers the same ground for status
transitions.

**Try:** approve as A. Schmidt, then K. Weber. Then try as J. Novak — a Viewer holds no approving
role and the rail says so rather than silently hiding the button.

### Change requests

Raise one, resolve one, reopen one. An unresolved change request blocks execution.

**Why:** this is "request changes" from the PR analogy. It gives a reviewer a way to object that is
weaker than rejecting outright but still has teeth.

### The execution gate

Every rule, its state, and its reason. `2 approvals from Administrator (not the requester)` with
`1 of 2 so far`.

**Why this is the highest-value piece of UI in the feature:** an Execute button that is merely greyed
out is infuriating and generates support tickets. One that says exactly what is missing is
self-service. The reasons come from the server in the real implementation — see
[`GET /taskrequests/{id}/gate`](specification.md#gate-response) — so the client cannot drift from
what the server will actually enforce.

### Status dropdown

Offers only the transitions your roles permit from the current status.

**Why:** the original document hard-coded `OPEN → APPROVED → COMPLETED → ARCHIVED`. That is a linear
graph with no rejection and no way back. Reusing the existing `WorkflowDefinitionDTO` and its editor
makes `REJECTED`, `CANCELLED` and a route back from `APPROVED` authoring decisions instead of code
changes.

**Try:** as M. Browett on TR-1042 you get "no moves available" — NetOps cannot advance from `OPEN`.
Switch to an Administrator and the dropdown appears.

---

## 3. Adding and configuring a task

A tile picker, then a form.

**Why the form matters more than it looks.** It is generated from what the server declares about the
task type — the `@Parameter[]` on the `@Action` annotation. Adding a new kind of task means writing a
server-side executor and nothing else: no new screen, no new dialog, no change to the request editor.
This is the extensibility seam, and it is the reason the registry is the strongest idea in the
original document. Today the equivalent list in the old engine is a hand-maintained constant in
`EventActivityExecutor.java` that has to be kept in sync with `ActionFactory` by hand.

---

## 4. The stale-approval demonstration

**The one to show people.**

Get TR-1042 to a green gate — approve as both Administrators, resolve the change request, tick
*Change window confirmed* on the **Data** tab. Then press **Configure** on any task and change a
value.

Every approval is dismissed. The rail marks them, the gate reason says *"1 dismissed because a task
was edited after signing off"*, and Execute re-locks.

**Why:** nothing in the original document invalidated approvals when the task configuration changed
afterwards, which leaves approve → edit → execute wide open. Approvals are bound to a hash of the
task configuration, and only approvals matching the current hash count. GitHub calls this "dismiss
stale reviews". The current hash is shown at the foot of the gate box so you can watch it change.

---

## 5. Failure and the execution log

Execute the tasks on TR-1042. The second targets `PP-3 / Port 24`, which already carries a cable, so
it fails with a business-logic error. The card gets a failure badge and the inline reason; the log
dialog shows the attempt.

**Why every attempt is logged, successful or not:** it is the audit trail, and an approval system
without one is worthless. There is no execution log table in the platform today — only single-slot
`LAST_ERROR` columns on `CCM_WDS_PI` and `CCM_WDS_AI`, which cannot answer "who ran this, when, and
what happened the first two times".

**On failure the run stops** and later tasks are left `NOT_RUN`. That is the `onError: STOP` policy,
switchable on the **Request types** screen. Execution is deliberately **not** transactional across
tasks — a partial run is a real, representable state, and pretending otherwise would be a promise the
system cannot keep.

**Try the full loop:** fix the failing task's target port, notice that the edit dismissed your
approvals, re-approve, and re-run. That exercises the entire integrity model in about a minute.

---

## 6. A manual step — execution that waits for a person

Open **TR-1039** (*Decommission switch SW-07*). It is already approved, so the bar under the tasks is
green. Its plan has four steps: disconnect the cable, **generate document**, **digital signature**,
**archive document**.

Press **Execute all tasks**. The first two run, and then execution stops on the signature. The task
card turns amber — *Execution is parked here. Waiting for Administrator* — and the bar changes to
**Waiting for a signature**, offering only **Cancel run**.

**Switch to K. Weber.** The inbox's first tab, *Awaiting my action*, now shows 1, and the row is
flagged **your turn**. Open the request and press **Sign**. The dialog shows what the preceding task
handed forward — the file name, document id and hash — above a form generated from the fields the
signature declares. Fill in a signature reference and sign.

**The remaining task runs on its own.** There is no "continue execution" button, and that is
deliberate: in Camunda, Step Functions, Temporal and GitHub Actions alike, closing the human task
*is* the resume signal. A second button would mean two clicks for one decision and a "signed but not
continued" state that somebody has to chase.

**Three things worth pointing out while it is parked:**

- **The plan is frozen.** *Configure*, *Add task* and *Remove* are all disabled. A run is bound to
  the fingerprint it started on; if task 4 could be edited while tasks 1–2 are already done, the hash
  would move, approvals would be dismissed, and half a plan would have executed under terms nobody
  approved.
- **Nobody else can sign it.** As M. Browett — the requester, and NetOps rather than Administrator —
  the card says *not yours to sign*. Assignment is by role, like approvals.
- **The audit trail names three parties.** Open the log on the archive task: it ran as **System**,
  *on behalf of* M. Browett, *triggered by* K. Weber. The person who pressed Execute was long gone,
  and a system whose purpose is recording who agreed to what cannot be vague about that.

### What happens if they will not sign

A refusal is a decision, not a breakage — so marking the task *failed* is the wrong default. It
paints a red error badge over a considered human answer and offers *re-run* as the recovery, when the
real recovery is to send the request back to whoever can change it. So the signature task carries an
**If refused** setting, visible on the card and part of the configuration (which means it is hashed,
which means reviewers approve it):

| Setting | What a refusal does |
| --- | --- |
| **Send back** *(default)* | The run ends, the signature goes back to *not run*, and **nothing is marked failed**. The reason is filed as an open change request — so the gate turns red and the request cannot run again until it is resolved. |
| **Fail the task** | The task is marked failed and the run stops, exactly like a task that errored. |
| **Not allowed** | There is no Refuse button. Sign, or the run stays parked. |

**Try the send-back loop on TR-1039.** Park it on the signature, switch to K. Weber, press **Decline
& send back** with a reason. Nothing turns red-failed; instead the *Conversation* tab has a new open
change request in her name, and the bar reads **1 thing still needs doing**. Resolve it as the
requester and execute again — the cable and the document are already done, so the run goes straight
back to the signature.

**On "sign or nothing":** a work item nobody may decline could park forever, so two rules keep it
honest. Cancelling a run is always available, and cancelling is the **requester's or an
administrator's** call — never the assigned signer's. Otherwise the signer just cancels instead of
declining and the setting means nothing. Try it as J. Novak: the Cancel run button is disabled.

---

## 7. Request types — the admin side

**Status workflow** — the transition graph, with the roles allowed on each arrow. In the real
implementation this is the existing `ProjectStatusTransitionsDef` React Flow editor, not a new one.

**Allowed tasks** — which task types may be added to a request of this type. The catalogue is
authored on the **Task types** screen and stored as `task-definitions.json`; each entry wraps a
server action the platform can already run, or is closed by a person.

**Data parameters** — fields copied into every new request, then edited per request. The prototype
keeps the original document's name/value idea but adds types, because retrofitting types into
persisted data is painful and the `data` rule arm needs them.

**Execution rules** — editable. Change the required approval count from 2 to 1, or turn off *exclude
the requester*, and the gate on TR-1042 responds immediately.

**Why the rules are structured, not code:** the original document proposed "boolean typescript
expressions". Both examples it named are structured predicates, and free-text JS contradicts a
written decision already taken in this codebase. See
[the rules section](specification.md#rules).

---

## The deliberate rough edge

*Execute this task* on an individual card stays clickable even when the gate is red, and reports that
the server refused.

That is not an oversight. The original document gated execution only in the UI — which is not an
approval control, because anyone able to call the API bypasses it. Showing a refusal makes visible
that the gate lives on the server and the button's state is only a hint.

---

## What is not modelled

Persistence, authentication, notifications, due dates and timeouts, and the BC4J layer. Task
execution is simulated on a timer with a hard-coded list of occupied ports.

A run *does* pause on a manual step and resume when it closes, but everything happens in one browser
tab — there is no worker, no polling and no way for the signature to arrive from elsewhere. In the
real implementation the resume runs on a worker, and the work item is a top-level record with its
own inbox query.

The prototype also shows **Cable Patch** tasks throughout because that communicates the feature. The
POC ships **HelloWorld**. Nobody should read the port-level detail as committed scope.

---

## Porting notes

`evaluateRule()` and `evaluateGate()` in `index.html` are the parts worth keeping — they map directly
onto `src/projects/client/task-request/rules/evaluateRule.ts`, and the same fixture table should
drive the Java `RuleEvaluator` tests. `TASK_DEFS` is the shape `taskDefinitionRegistry.tsx` needs.

`driveRun()` / `completeWorkItem()` are worth keeping as a statement of intent rather than as code:
the cursor, the park on a manual task, and the resume-on-completion are the server's `drive()` loop
in the specification. In the real implementation they live in Java, not the client.

The render functions are throwaway: the real implementation is React and MUI on the existing designer
chassis.
