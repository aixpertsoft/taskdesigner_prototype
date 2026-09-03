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
| 1 | Draft notice | **person** | NetOps writes the subject, the message and the recipient list |
| 2 | Sign notice | server | `digitallySign` — a SHA-256 fingerprint of the exact wording |
| 3 | Approve notice | **person** | An administrator approves that wording, before customers see it |
| 4 | Send notice | server | `sendMail` — delivers it and records what the mail server answered |

The point of steps 2 and 3 together: the fingerprint makes *what was approved* and *what was sent*
provably the same text. That is the thing an email thread and a verbal "yes, send it" cannot give
you, and it is why this is worth a workflow at all.

---

## Before you start

**Switch users.** The avatars at the top right change who you are. Work and approvals are assigned by
role, so a single-user session cannot show the feature working. There are four:

| | Role | In this demo |
| --- | --- | --- |
| MB | NetOps | raised the request; drafts the notice |
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
actions. A manual step also shows who it is waiting for and what declining it would do.

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

### Declining is a decision, not a breakage

Marking a decline as *failed* is wrong by default: it paints a red error over a considered human
answer and offers *re-run* as the recovery, when the real recovery is to send the request back to
whoever can change it. So each manual step carries an **If declined** setting, part of its
configuration — which means it is hashed, which means reviewers approve it:

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
  results are stored, and what the requester is asked to fill in. *Send notice* is a task type.

Open *Send notice* and the editor shows the whole wiring:

```
sendMail from=${task.fromAddress},
         to=${request.recipients},
         subject=${request.noticeSubject},
         body=${request.noticeBody},
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

The right-hand rail previews all of it live: the form the requester will see, the call that will run,
and what it will store.

The catalogue itself lives in [`task-definitions.json.js`](../task-definitions.json.js) — strip the
assignment line and the remainder is a valid JSON document, the one `GET /taskdefinitions` would
return. **Export JSON** on the list screen hands you exactly that.

---

## Request types — the admin side

**Status workflow** — the transition graph, with the roles allowed on each arrow. In the real
implementation this is the existing `ProjectStatusTransitionsDef` React Flow editor, not a new one.

**Allowed tasks** — which task types may be added to a request of this type.

**Data parameters** — fields copied into every new request. Note the split between author-owned and
execution-written; the `data` rule arm needs the types, which is why they are typed rather than
free name/value pairs.

**Execution rules** — editable, and the gate responds immediately.

**Why the rules are structured, not code:** the original document proposed "boolean typescript
expressions". Both examples it named are structured predicates, and free-text JS contradicts a
written decision already taken in this codebase. See [the rules section](specification.md#rules).

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

The three-file split is deliberate and worth preserving in shape:
`task-definitions.json.js` is data, `task-editor.js` owns the definition model and its editor, and
`index.html` is only a consumer.

The render functions are throwaway: the real implementation is React and MUI on the existing designer
shell.
