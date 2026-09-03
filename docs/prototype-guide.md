# Prototype guide

A walkthrough of `index.html` — what each part shows, and which design decision it exists to
demonstrate.

See the [README](../README.md) for how to start it. Background is in [overview.md](overview.md); the
contract is in [specification.md](specification.md).

---

## The example

One worked case, chosen because every network operator already does it and nobody needs domain
knowledge to follow it: **the notification you have to send customers before planned maintenance.**

> *TR-2087 — Notify customers, R12 uplink switch replacement*

| # | Step | Kind | Who or what |
| --- | --- | --- | --- |
| 1 | Draft notification | **person** | NetOps writes the subject, the message and the recipient list |
| 2 | Sign notification | server | `digitallySign` — a SHA-256 fingerprint of the exact wording |
| 3 | Approve notification | **person** | An administrator approves that wording, before customers see it |
| 4 | Send notification | server | `sendMail` — delivers it and records what the mail server answered |

The point of steps 2 and 3 together: the fingerprint makes *what was approved* and *what was sent*
provably the same text. That is the thing an email thread and a verbal "yes, send it" cannot give
you, and it is why this is worth a workflow at all.

---

## Before you start

**Switch users.** The avatars at the top right change who you are. Work and approvals are assigned by
role, so a single-user session cannot show the feature working. There are four:

| | Role | In this demo |
| --- | --- | --- |
| MB | NetOps | raised the request; drafts the notification |
| KW | Administrator | approves the wording |
| AS | Administrator, NetOps | can do either |
| JN | Viewer | can do neither — useful for showing what *is* locked |

**Watch the bar under the task list.** It is the heart of the design: it says whether the request may
run, what is stopping it, or who it is currently waiting for.

---

## The five-minute demo

1. The inbox opens on **All open** with the one request. Click it.
2. Press **Execute all tasks**. It runs for half a second and **stops** — step 1 needs a person. The
   card turns amber: *Execution is parked here. Waiting for NetOps.*
3. You are M. Browett, so it is yours. Press **Submit draft**, fill in a subject, a message and
   recipients, and submit.
4. Watch it continue on its own: the server fingerprints the text, then parks again — this time for
   an **Administrator**.
5. Switch to **K. Weber**. Her *Awaiting my action* tab shows **1**, and the row is flagged
   *your turn*. Open it and press **Approve**. The dialog shows her the drafted text and its
   fingerprint before she agrees to it.
6. The mail sends by itself. Open the **Data** tab: subject, text, recipients, fingerprint, delivery
   status and message id have all filled in during the run.

Nobody pressed a "continue" button at any point. Closing the human step *is* the resume.

**To show a failure:** put an address at `@invalid.example` in the recipients at step 3. The send
fails with `550 5.1.1 … recipient address rejected`, the run stops, and everything before it keeps
its results.

---

## What the parts are showing

### The inbox

Five tabs — *Awaiting my action*, *Awaiting my approval*, *My requests*, *All open*, *Everything*.
The two leading tabs answer the two forms of "what needs me?": something needs your **signature**,
or something needs your **approval**. The original requirements document specified two editors and
no list view; an approval tool without an inbox is not a daily tool.

### The request

Four tabs — **Tasks**, **Conversation**, **Data**, **History** — over a Pull Request-shaped object:
what is proposed, who has signed off, what is still objected to, and a button that stays locked until
the conditions are met.

**Task cards** carry the step, its status, the settings it was configured with, and a small row of
actions. A manual step also shows who it is waiting for.

**The approvals rail** shows every eligible approver and their state. The requester appears greyed
out — you cannot approve your own request, which is `excludeRequester` on the rule, not a hard-coded
special case.

**Conversation** carries comments and change requests. Each change request has a **Resolve** button;
while any is open, the gate is red.

**Data** is the interesting one during a run. Two fields are yours to edit — the maintenance window
and the affected system. The rest are marked **set by execution** and are read-only: they are written
by a task's output mapping. If a requester could type into them, they could forge the fingerprint of
a document the server signed.

**History** is the audit trail. Note the entries attributed to **System** — see below.

### The execution gate

Collapsed by default into one bar. Blocked, it reads *“1 thing still needs doing”* with the Execute
button disabled; ready, it turns green. Click it to unfold every rule with its own pass/fail and a
reason, plus the plan's fingerprint.

This request type has two rules: **one Administrator approval, not the requester** and **no
unresolved change requests**. Both are editable on the *Request types* screen — change the approval
count and the bar responds immediately.

**The rules run on the server, not in the button.** *Execute this task* on an individual card stays
clickable when the gate is red and reports that the server refused. That is deliberate: the original
design gated execution in the UI only, which is not an approval control, because anyone able to call
the API bypasses it.

---

## Manual steps, and what declining means

A manual step is not "a task that does nothing". It **creates a work item and suspends the run** until
a person closes it — with an assignee, the payload they need to see, and a result it collects back.

Three things are worth pointing at while a run is parked:

- **The plan is frozen.** *Configure*, *Add task* and *Remove* are all disabled. A run is bound to
  the fingerprint it started on; if step 4 could be edited while steps 1–2 are already done, the hash
  would move, approvals would be dismissed, and half a plan would have executed under terms nobody
  approved.
- **Only the right people can act.** As M. Browett the approval step says *not yours to do* —
  he drafted it. Assignment is by role, like approvals.
- **The audit trail names three parties.** Open the log on the send step: it ran as **System**,
  *on behalf of* M. Browett, *triggered by* K. Weber. The person who pressed Execute was long gone,
  and a system whose purpose is recording who agreed to what cannot be vague about that.

### Seeing what somebody entered

Once a manual step is closed, the card carries a one-line preview of what was typed —
*M. Browett entered: "Planned maintenance 12.09.2026…"* — and a **View** button that reopens the
same form, read-only, headed with who closed it and when. It is the form, not a log excerpt, so the
labels are the ones the person saw. Blocker values appear the same way, labelled from the data
parameters they filled.

It shows the **most recent close** only. If a step was declined and then redone, the view is the
approval that stuck; the earlier decline stays on the record in the execution log and as the change
request it raised, which is where you would look for it anyway.

### Declining is a decision, not a breakage

Marking a decline as *failed* is wrong by default: it paints a red error over a considered human
answer and offers *re-run* as the recovery, when the real recovery is to send the request back to
whoever can change it. So each manual step carries an **If declined** setting.

It lives in the step's **Runtime configuration** — *Request types → Task flow*, open a manual step.
The requester never sees it and cannot change it. Resolution order is: the flow step, then the task
type's own `onRefusalDefault`, then *Send back*.

| Setting | What declining does |
| --- | --- |
| **Send back** *(default)* | The run ends, the step returns to *not run*, and **nothing is marked failed**. The reason is filed as an open change request, which turns the gate red until it is resolved. |
| **Fail the task** | The task is marked failed and the run stops, exactly like a task that errored. |
| **Not allowed** | There is no decline button at all. Complete it, or the run stays parked. |

**Try it:** at step 3, press **Decline & send back** with a reason — say the window is wrong. Nothing
turns red. The *Conversation* tab gains an open change request in K. Weber's name and the bar reads
*1 thing still needs doing*. Resolve it and execute again: the draft and the signature are already
done, so the run goes straight back to the approval.

**On "not allowed":** a work item nobody may decline could park forever, so two rules keep it honest.
Cancelling a run is always available, and cancelling is the **requester's or an administrator's**
call — never the assigned person's. Otherwise they simply cancel instead of declining and the setting
means nothing. Try it as J. Novak: *Cancel run* is disabled.

---

## Task types — where the four steps come from

The **Task types** screen is the catalogue. Each entry is a *named, pre-wired use* of something the
server can already do:

- A **capability** is code — annotated Groovy or Java, discovered from `GET /actions`. `sendMail` is
  a capability.
- A **task type** is configuration — which action it calls, where its inputs come from, where its
  results are stored, and what the requester is asked to fill in. *Send notification* is a task type.

Open *Send notification* and the editor shows the whole wiring:

```
sendMail from=${task.fromAddress},
         to=${request.recipients},
         subject=${request.notificationSubject},
         body=${request.notificationBody},
         signature=${request.sha256}
```

**That dollar-brace form is a rendering, not a language.** Bindings are built with pickers and stored
as structured records — a source kind (`LITERAL`, `REQUEST_DATA`, `TASK_PARAM`) and a path.
Resolution is a dictionary lookup. Nothing parses or evaluates a string, which is what keeps this
from becoming the free-text-expression hole the specification already closed for rules.

**Input mappings** say where each action parameter comes from. **Output mappings** say where its
results are stored on the request — and manual steps have them too, which is how the drafted message
reaches the task that sends it. There is no direct task-to-task reference: an earlier step writes to
the request's data, a later step reads it. At authoring time you cannot know which earlier task item
will be in a plan, so the request is the bus.

Two flags on a configuration field decide how much of it the requester gets. **fixed** (readonly)
shows the field in the request but locks it; **hidden** keeps it off the request form entirely. Both
kinds of field get their value from the step's defaults in the request type — the flow editor marks
them, and warns when a required one has no default, because the requester cannot supply it. In the
demo, *Signed on behalf of* is fixed and the sender address is hidden: organisation policy, not a
per-request decision.

The right-hand rail previews all of it live: the form the requester will see, the call that will run,
and what it will store.

The catalogue itself lives in [`task-definitions.json.js`](../task-definitions.json.js) — strip the
assignment line and the remainder is a valid JSON document, the one `GET /taskdefinitions` would
return. **Export JSON** on the list screen hands you exactly that.

---

## Request types — where the process is defined

### Task flow

The four steps are not something the requester assembled. They are the **task flow** on the request
type: an ordered template, instantiated when a request is created. Raise a new request and the whole
process is already there.

Each step has two halves, and the split is deliberate.

**Authoring** — what the requester gets, and what they may change:

| | |
| --- | --- |
| **required** | The requester cannot remove it. On a task card it shows as a *step* badge and the delete button is disabled. |
| **defaults** | Pre-filled into the task item — the sender address, who signs, the due date. Still editable per request. |

**Runtime configuration** — how the *engine* behaves when it gets here. None of it is shown to the
requester or editable by them, and none of it appears on the task form:

| | |
| --- | --- |
| **Who may carry it out** | The candidate roles for a manual step — anyone holding one of them sees it in *Awaiting my action* and may close it. Empty falls back to Administrator, so no step can park where nobody may ever act. |
| **Due by** | Shown on the work item while the step waits. |
| **If declined** | What declining does — *Send back*, *Fail the task*, or *Not allowed*. Leave it unset and the task type's own default applies. |
| **Skip when** | Evaluated once, when the run reaches the step. If it matches, the step is recorded **skipped** and the run carries straight on. |
| **Do not start until** | Checked at run time. If unsatisfied the run parks on a **blocker** until somebody supplies what is missing. |

Assignment used to be an ordinary form field the engine recognised by name — which meant the
requester could reassign the approval step to a role they hold. Now it is declared configuration:
the requester never sees it, and because it is inside the approval hash, reassigning a step
dismisses the approvals given for the old assignment.

In the JSON these three sit together under `runtimeConfig`, which is also how the editor groups
them. All of it is inside the approval hash even so, because what an approver approved includes how
the step behaves — not just what it is configured with.

**The flow is linear on purpose.** Steps run in order and a step may be skipped; there is no
branching, no parallelism, no loops. That is the line between this and `de.comconsult.wf` — a
conditional skip is a one-armed router, and one arm is all this subsystem should grow. The moment
"if X do A else do B" appears, you are rebuilding the engine the overview says this does not replace.

**Editing the template does not touch requests already raised.** A request snapshots its steps —
including their rules — at creation. Same reasoning as `definitionVersion` in the specification.

### Try the skip

Tick **Skip the approval step** on the Data tab. Two things happen:

1. **Your approval is dismissed.** That flag is inside the approval hash, so changing it invalidates
   sign-off — exactly like editing a task does. Without that, you could get approval, then set the
   flag, then execute, and the approval step would vanish with nothing invalidated. That is
   approve-then-edit-then-execute wearing a different hat.
2. Re-approve, execute, and step 3 is marked **skipped**. Not done, not failed — skipped, with the
   reason, in the log.

### Try the blocker

Give the signing step a skip rule too, so no fingerprint is ever produced. Execute: the run reaches
*Send notification*, finds its precondition unmet, and **parks on a blocker** — the same pause as a manual
step, in the same inbox.

**Why this cannot be a gate rule:** the fingerprint does not exist until the signing step has run.
Preconditions are the rules that can only be judged once the run is under way.

**And even with no rule configured at all**, a server step cannot run before its inputs exist. The
action registry declares which parameters are required, so the engine checks what the bindings can
actually deliver: a run reaching *Send notification* with nothing drafted parks on a blocker naming
each unproduced input and where it was supposed to come from — *"body" has no value:
request.notificationBody is written by an earlier step that has not run yet.* The same check guards
the per-task run button: trying to sign before drafting, or send before anything, is refused by
name instead of "succeeding" against empty values. The action's own contract does the work; nobody
has to remember to configure it.

Press **Supply & continue** and provide the value. Note what the dialog says: what you supply is
recorded as execution output, attributed to you, so it does **not** disturb the approvals already
given. That is also why the Data tab is frozen during a run — the author-owned fields are what the
approvals cover, so a blocker collects its values through the work item instead.

### The rest of the screen

**Status workflow** — the transition graph, with the roles allowed on each arrow. In the real
implementation this is the existing `ProjectStatusTransitionsDef` React Flow editor, not a new one.

**Data parameters** — every field is either **author** (the requester's; inside the hash; frozen
during a run) or **execution** (written by a task's output mapping; outside the hash, which is why a
run does not dismiss its own approvals).

**Execution rules** — these gate the *whole run* before it starts, and can be added and removed.
There are two types, and deliberately only two:

| | |
| --- | --- |
| **Minimum approvals from a role** | N people holding a given role must approve. Roles are picked as chips; *not the requester* is a toggle. |
| **No open change requests** | Nothing raised in the conversation may still be unresolved. Only one of these is offered, since a second would say nothing new. |

A step's own skip and precondition rules live on the **Task flow** instead, because those can only be
judged once the run is under way.

**Remove the approvals rule and the approvals rail disappears** from the request editor, the layout
closes up, and the *Awaiting my approval* inbox tab is hidden — there is nobody to show, and drawing
an empty panel would invent a step the process does not have. Add it back and everything returns.

One nuance worth knowing: an approval binds to the **plan and the author data**, not to the request
type's rules. So removing and re-adding an approvals rule does not dismiss sign-off already given —
the plan never changed. Changing the *quorum*, on the other hand, re-evaluates the gate immediately.
Whether a rule edit should invalidate in-flight requests is the `definitionVersion` question in
[the specification](specification.md), which the prototype does not model.

**Why the rules are structured, not code:** the original document proposed "boolean typescript
expressions". Both examples it named are structured predicates, and free-text JS contradicts a
written decision already taken in this codebase. See [the rules section](specification.md#rules).
Step rules reuse the same `TaskRule` shape as gate rules — there is no second rule engine.

### It is all JSON

**Export JSON** on this screen hands you the whole request type — flow, defaults, step rules, data
parameters and gate rules — as [`request-types.json.js`](../request-types.json.js) holds it. Strip
the assignment line and the remainder is a valid `.json` document, the one `GET /taskrequestdefs`
would return. **Import JSON** takes one back, refusing an `apiVersion` it does not recognise rather
than guessing at the shape.

---

## What is not modelled

Persistence, authentication, notifications, due dates and timeouts, and the BC4J layer. Signing and
sending are simulated — the fingerprint is a stand-in hash, not SHA-256, and no mail leaves your
browser.

A run *does* pause on a manual step and resume when it closes, but everything happens in one browser
tab: there is no worker, no polling, and no way for the approval to arrive from elsewhere. In the
real implementation the resume runs on a worker, and a work item is a top-level record with its own
inbox query and its own permissions.

---

## Porting notes

`evaluateRule()` and `evaluateGate()` are the parts worth keeping — they map directly onto
`src/projects/client/task-request/rules/evaluateRule.ts`, and the same fixture table should drive the
Java `RuleEvaluator` tests.

`driveRun()` / `completeWorkItem()` are worth keeping as a statement of intent rather than as code:
the cursor, the park on a manual task, and the resume-on-completion are the server's `drive()` loop
in the specification. In the real implementation they live in Java, not the client.

The file split is deliberate and worth preserving in shape — data files hold no logic, editors own
their model, and `index.html` is only a consumer:

| File | Owns |
| --- | --- |
| `task-definitions.json.js` | the task catalogue, as data |
| `request-types.json.js` | the request types and their task flows, as data |
| `task-editor.js` | the task-definition model, the binding resolver, the Task types screen |
| `request-type-editor.js` | the Request types screen, including the task flow editor |
| `execution-rules-editor.js` | the gate rules — the two rule types, and adding/removing them |
| `index.html` | requests, approvals, the run engine — a consumer of both catalogues |

The render functions are throwaway: the real implementation is React and MUI on the existing designer
shell.
