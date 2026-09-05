# Prototype guide

A walkthrough of `index.html` — what each part shows, and which design decision it exists to
demonstrate.

See the [README](../README.md) for how to start it. Background is in [overview.md](overview.md); the
contract is in [specification.md](specification.md).

---

## The example

One worked case, chosen because every network operator already does it and nobody needs domain
knowledge to follow it: **the notification you have to send customers before planned maintenance.**

> *Notify customers — R12 uplink switch replacement* (the request you raise in the demo — the
> inbox deliberately starts empty, so the plan you get is provably the template, freshly copied)

| # | Activity | Kind | Who or what |
| --- | --- | --- | --- |
| 1 | Draft notification | **person** | NetOps writes the subject, the message and the recipient list |
| 2 | Approve notification | **person** | An administrator answers *Approve the wording?* — yes routes forward, no routes back to the draft |
| 3 | Additional steps | **slot** | A designed extension point — its menu offers a preconfigured *Digital signature* (a SHA-256 fingerprint of the wording) and a *Second approval* |
| 4 | Send notification | server | `sendMail` — delivers it and records what the mail server answered |

The approval is given on the text itself — the dialog shows the drafted wording before the decision.
When portable proof is needed, the requester fills the slot with a **digital signature** and the
send carries the fingerprint of exactly the wording that was approved. That record — who approved
what, and optionally a cryptographic receipt of it — is what an email thread and a verbal "yes,
send it" cannot give you, and it is why this is worth a workflow at all.

---

## Before you start

**Switch users.** The avatars at the top right change who you are. Work is assigned by role, so a
single-user session cannot show the feature working. There are four:

| | Role | In this demo |
| --- | --- | --- |
| MB | NetOps | raised the request; drafts the notification |
| KW | Administrator | approves the wording |
| AS | Administrator, NetOps | can do either |
| JN | Viewer | can do neither — useful for showing what *is* locked |

**Watch the task cards.** They are the heart of the design: the card a run is parked on turns
amber and says who it is waiting for — and carries the button to act. The header's status pill
says what the request as a whole is doing.

**Two applications, one shell.** The switch at the top left flips between **Runtime** — the end
user's app: inbox, requests, work items — and **Designer** — the administrator's: the request type
with its task flow and data, and the task type catalogue. They share live state on purpose:
change the flow in the designer, switch back, and the very next request already follows it. In
production these
would be separately permissioned applications; the prototype keeps them in one page so the
cause-and-effect between them stays demonstrable.

---

## The five-minute demo

1. The inbox starts empty. Press **New task request** — it wants a title *and the notification
   subject*: the designer marked the subject **required at creation**, so the request cannot
   exist without it (the *start form*). The whole process arrives already instantiated.
2. Press **Launch** — there is no approval gate; the process itself decides where
   people are needed. It runs for half a second and **stops** — step 1 needs a person. The card
   turns amber: *Execution is parked here. Waiting for NetOps.*
3. You are M. Browett, so it is yours. Press **Submit draft** — the subject arrives **prefilled
   with what you entered at creation** (refine it or keep it), so fill in the message and
   recipients and submit. The process routes straight on to the approval and parks again — this
   time for an **Administrator**.
4. Switch to **K. Weber**. Her *Awaiting my action* tab shows **1**, and the row is flagged
   *your turn*. Open it: the dialog shows the drafted text and what each answer will do. Tick
   **Approve the wording** and press **Submit decision**. (Leave it unticked and the process walks
   back to the draft instead — that is the transitions routing on her answer.)
5. The mail sends by itself. Open the **Data** tab: subject, text, recipients, delivery status and
   message id have all filled in during the run.
6. Run it again, but first press **Add task** on the *Additional steps* slot and pick
   **Digital signature** — one click, no form: the activity arrives preconfigured by the request
   type, and its card is marked **added**, so the deviation stays visible. This time the approved
   wording is fingerprinted and the send carries the signature.

Nobody pressed a "continue" button at any point. Closing the human step *is* the resume.

**To show a failure:** put an address at `@invalid.example` in the recipients at step 3. The send
fails with `550 5.1.1 … recipient address rejected`, the run stops, and everything before it keeps
its results.

---

## What the parts are showing

### The inbox

Four tabs — *Awaiting my action*, *My requests*, *All open*, *Everything*. The first answers
"what needs me?" — a draft to write, a decision to give, a blocker to clear. *Awaiting my action*
is a worklist: opening a row opens the **form itself**, ready to act on, with the context the
designer declared — not the request. A **Show request** button on the row is the way in when you
do want the whole picture. The original requirements document specified two editors and no list
view; a daily work tool without an inbox is not a daily tool.

### The request

Four tabs — **Tasks**, **Conversation**, **Data**, **History** — over one object: the plan the
process instantiated, what the run has done so far, and a bar that says what it is doing now.

**Task cards** carry the step, its status, the settings it was configured with, and a small row of
actions — the execution log and remove; nothing more. A manual step also shows who it is waiting for.
Steps from the standard flow carry no badge — they are the normal case; a task somebody added by
hand is marked **added**, because a deviation from the standard process is precisely what an
approver should look at.

**Task settings are the designer's, never the requester's.** A template step carries the wiring
its flow step declared; a slot fill carries the wiring of the preconfigured activity that was
picked — there is no configuration form in the request at all. There is no edit-in-place either:
changing your mind means remove and re-add, so the audit trail records the change as what it is.
The requester's job is deliberately small: raise the request and do their manual steps.

**Conversation** carries comments — discussion stays on the request, next to the work it is about.

**Data** is the interesting one during a run. Two fields are yours to edit — the maintenance window
and the affected system. The rest are marked **written by a task** and are read-only: they are written
by a task, through the output wiring the request type declares. If a requester could type into them, they could forge the fingerprint of
a document the server signed.

**History** is the audit trail. Note the entries attributed to **System** — see below.

### Launching a run

The request's page-level actions live in the **header, top right** — the modern convention, and a
toolbar built for more actions to join. Idle, it holds **Launch** and **Close**. While a run is
parked it becomes **Cancel run**; completed or closed, it is empty. There is no status bar under
the task list — run state needs no second home: the header pill says what the request is doing,
and the parked or blocked card says who it waits for and what is missing, right where the work is.

**Close** is the GitHub-style end for a request that is not going to run — available only while
the request is open and idle, and only to its requester or an administrator. The dialog demands a
**reason**, because a closed request is read-only and final: the record should say why the work
was abandoned, in the closer's words. Closed requests leave *All open*, keep their reason in a
banner on the request and in the inbox row, and wear a grey **CLOSED** pill.

**There is deliberately no pre-execution approval gate.** Earlier iterations locked Execute behind
rules — an approval quorum, no open change requests. Both were removed on purpose: *who may
execute* is a **user-permission** question, deferred to the platform's permissions; *whether
something is approved* is an **activity inside the flow** — the demo's approval step, which sees
the actual content and routes on its answer. What still stops a run is the process itself:
manual steps, and required inputs that resolve to nothing, each named when it happens — and
enforced by the engine, not by a disabled button, because anyone able to call the API bypasses a
UI-only control.

**And there is deliberately no way to run one task by hand.** Execution happens only through a run,
which walks the flow along its transitions and validates each action's required
inputs. Retrying a failed step is simply **Launch** again — the run resumes at the failed
activity; nothing that already succeeded is redone.

---

## Manual steps, and routing on the answer

A manual step is not "a task that does nothing". It **creates a work item and suspends the run** until
a person closes it — with an assignee, the payload they need to see, and a result it collects back.

Three things are worth pointing at while a run is parked:

- **The plan is frozen.** *Add task* and *Remove* are disabled. If step 4 could be edited while
  steps 1–2 are already done, half a plan would execute under terms nobody had seen.
- **Only the right people can act.** As M. Browett the approval step says *not yours to do* —
  he drafted it. Assignment is by role.
- **The audit trail names three parties.** Open the log on the send step: it ran as **System**,
  *on behalf of* M. Browett, *triggered by* K. Weber. The person who pressed Execute was long gone,
  and a system whose purpose is recording who agreed to what cannot be vague about that.

### Seeing what somebody entered

Once a manual step is closed, the card carries a one-line preview of what was typed —
*M. Browett entered: "Planned maintenance 12.09.2026…"* — and a **View** button that reopens the
same form, read-only, headed with who closed it and when. It is the form, not a log excerpt, so the
labels are the ones the person saw. Blocker values appear the same way, labelled from the data
parameters they filled.

It shows the **most recent close** only. If a decision was answered *no* and the step later redone,
the view is the answer that stuck; the earlier one stays on the record in the execution log.

### Saying no is data, and the transitions route on it

There is no decline button. The approval form asks a question — **Approve the wording?** — and the
person answers it; one submit button either way. What happens next is decided by the flow's
**transitions**, and the dialog says so before they answer:

> approved = false → Draft notification
> approved = true → onward

**Try it:** at the approval, leave the switch off and give a reason. The run walks **back** to the
draft — a fresh work item for NetOps, attempt two, with everything previously entered still on the
request. Nothing is marked failed, because nothing broke: someone answered a question. Redraft,
and the corrected wording goes straight back for approval — the approver decides on the new text,
not a memory of the old one — then onward to the send. Both attempts stay on the record.

This replaced three older mechanisms — a configurable "If declined" policy, a separate "Skip when"
rule, and a continue-past-failure switch — all of which were transitions wearing disguises. One
routing concept now does all of it.

**Escape hatch:** a run parked on a step nobody answers can always be **cancelled** — by the
requester or an administrator, never the assigned person, or a mandatory step would be defeated by
cancelling instead of answering. Try it as J. Novak: *Cancel run* is disabled.

---

## Task types — where the four steps come from

The **Task types** screen is the catalogue. Each entry is a **pure function**:

- A **capability** is code — annotated Groovy or Java, discovered from `GET /actions`. `sendMail` is
  a capability.
- A **task type** is a *signature over a capability* — what it needs, what it produces, and which
  action implements it. *Send notification* is a task type. It has **no reference to any request**:
  where its inputs come from and where its results are stored is not its business.

Open *Send notification* and the editor shows exactly that:

```
sendMail(from*, to*, subject*, body*, signature) → status, messageId
```

Names and which inputs are required come from the action's own contract; the author supplies the
**labels** — *Sender*, *Recipients* — because those labels are what the request designer wires
against. A manual task type is the same idea with a form instead of an action: its form fields
*are* what it produces, and the person's answers go wherever the use decides.

**The wiring lives in the request type.** Each flow step is a *call site*: its input bindings say
where every input comes from — a fixed value, or a request field — and its output bindings say
which results are kept, and on which field. That is what makes the catalogue actually reusable:
the same task type can serve any process, because nothing in it names another process's fields.

**Bindings are structured records, not a language.** A source is a kind (`LITERAL` or
`REQUEST_DATA`) and a value or path, built with pickers; resolution is a dictionary lookup. The
dollar-brace form you may see in logs is a rendering for people to read — nothing parses or
evaluates a string, which is what keeps this from becoming the free-text-expression hole the
specification already closed for rules.

There is no direct task-to-task reference: an earlier step writes to the request's data, a later
step reads it. At design time you cannot know which task items a plan will hold — slots and loops
see to that — so the request is the bus.

The right-hand rail previews the signature live: what it needs, what it produces, and — for a
manual type — the form the person will get.

The catalogue itself lives in [`data/task-definitions.json.js`](../data/task-definitions.json.js) — strip the
assignment line and the remainder is a valid JSON document, the one `GET /taskdefinitions` would
return. **Export JSON** on the list screen hands you exactly that.

---

## Request types — where the process is defined

### Task flow

The four steps are not something the requester assembled. They are the **task flow** on the request
type: an ordered template, instantiated when a request is created. Raise a new request and the whole
process is already there.

Each step has two halves, and the split is deliberate.

**Data wiring** — the step as a call site for its task type. *What it needs*: each input is wired
to **a fixed value** typed here (the sender address) or read **from the request** (the recipients
an earlier step filled in). *What it produces*: each result is kept on a request field, or not
kept at all. The editor warns when a required input is unwired — there is nobody downstream to
supply it — and only *written-by-a-task* fields are offered as output targets, so a run can never
move its own approval hash.

**Runtime configuration** — how the *engine* behaves when it gets here. None of it is shown to the
requester or editable by them, and none of it appears on the task form:

| | |
| --- | --- |
| **Who may carry it out** | The candidate roles for a manual step — anyone holding one of them sees it in *Awaiting my action* and may close it. Empty falls back to Administrator, so no step can park where nobody may ever act. |
| **Due by** | Shown on the work item while the step waits. |
| **Shown to the person** | Which request fields appear in the *"From the request"* box of the form the person fills in — each step shows only what its person needs. Empty fields are omitted, so the draft step lists the approver's comment and it appears only on a redo, carrying the reason. Presentation only. |
| **Transitions** | The outgoing edges: evaluated in order once the activity completes, first match wins, *always* is the otherwise. A condition is one field compared to one value — `approved = false` back to the draft. |

Assignment used to be an ordinary form field the engine recognised by name — which meant the
requester could reassign the approval step to a role they hold. Now it is declared configuration:
the requester never sees it and cannot change it.

In the JSON these sit together under `runtimeConfig`, which is also how the editor groups them.

**The flow is a single-token state machine, on purpose.** One token walks the arrows: transitions
route on a field's value and may loop back, and exactly one activity is the start, one or more the
ends. What stays out — deliberately — is parallelism: no fork/join, no sub-processes, no timers.
That is the line between this and `de.comconsult.wf`; conditional routing on a person's answer is
the everyday case this subsystem exists for, running two things at once is not.

**Editing the template does not touch requests already raised.** A request snapshots its steps —
including their rules — at creation. Same reasoning as `definitionVersion` in the specification.

### Try the skip — it is just an edge

Tick **Skip the approval step** on the Data tab and execute: after the draft, the run takes the
conditional edge `skipApproval = true` straight past the approval, which is simply never entered.
There is no separate skip mechanism — it is one transition among the others, visible in the graph
picture.

### The blocker

A server step will not dispatch while a **required input resolves to nothing** — and this needs no
configuration at all. The action registry declares which parameters are required, so the engine
checks what the wiring can actually deliver, at run time, because the value may be produced by an
earlier step. A run reaching *Send notification* with nothing drafted **parks on a blocker** — the
same pause as a manual step, in the same inbox — naming each unproduced input and where it was
supposed to come from: *"body" has no value: request.notificationBody is written by an earlier
step that has not run yet.* The action's own contract does the work; nobody has to remember to
configure it.

**To see one:** in the designer, rewire the send's *Message* to a field nothing fills — say the
approver's comment — and execute with *Skip the approval step* ticked. The run reaches the send and
parks, naming exactly that field. Press **Supply & continue** and provide the value: it is
recorded as execution output, attributed to you, on the audit trail — and the run resumes on its
own. (There used to be a configurable *do not start until…* precondition on top of this; it was
removed — the automatic contract check covers the case people actually hit.)

### The rest of the screen

**No status workflow.** A request's status is *derived*: **open** until Launch starts a run,
**running** for the whole in-flight life — the engine working *and* parked on a person, which is
most of it — and **completed** once the walk reaches an end, at which point authoring locks. A
failed or cancelled run falls back to *open*: the request needs attention again. The one
exception is **closed** — not derived, but an explicit, recorded decision (who, when, and the
reason in their words) that the work is never going to happen. The original design had
a second, user-driven state machine (OPEN → APPROVED → COMPLETED…), which competed with the run for
the same words: APPROVED-the-status against the approvals rule, COMPLETED-the-status against the
run's own completed. One lifecycle is enough. The platform's role-gated status workflow
(`ProjectStatusTransitionsDef`) remains in the specification as production reuse if a hand-driven
lifecycle turns out to be needed; the prototype deliberately does not duplicate it.

**Data parameters** — every field is either **filled in by the requester** (theirs to edit; frozen
during a run) or **written by a task** during the run (read-only for the requester, so nobody can
forge what the server produced). Either kind can additionally be marked **at creation**: the New-request
dialog becomes a *start form* that refuses to create without it — data the process cannot exist
without never needs a work item to chase it. On a task-written field that is only the *starting*
value: tasks may refine it later, and their forms arrive prefilled with what is there — which is how
the demo's subject is demanded at creation yet still editable in the draft step. The list is fully
editable — label, type, owner and default
inline, new fields via *Add parameter*. Deleting a field is refused while anything still references
it by name — a wiring binding, a transition, a display list — with the references listed, since
a silent delete would break those bindings without a trace. Names themselves are fixed once created,
for the same reason.

**There are no rules any more — at all.** Earlier iterations gated the whole run behind
pre-execution rules (an approval quorum, no open change requests) and let a step declare *do not
start until…* preconditions. All of it was removed on purpose: *who may execute* is deferred to
the platform's **user permissions**, approval became an **activity in the flow** — content-aware,
routed on its answer — and the only run-time pause left needs no configuration: a required input
that resolves to nothing parks the run, by the action's own contract. The original document's
"boolean typescript expressions" never happened; what conditions remain (transitions) are
structured records, never code.

### It is all JSON

**Export JSON** on this screen hands you the whole request type — flow, data wiring, step rules,
data parameters and gate rules — as [`data/request-types.json.js`](../data/request-types.json.js) holds it. Strip
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
| `shared/core.js` | icons, demo users, helpers, and the derived request status |
| `runtime/run-engine.js` | execution and every mutation — the `drive()` loop as a statement of intent |
| `runtime/inbox-view.js` / `request-view.js` / `dialogs.js` | the runtime screens and modals |
| `data/task-definitions.json.js` | the task catalogue, as data |
| `data/request-types.json.js` | the request types, their task flows and all data wiring, as data |
| `designer/task-editor.js` | the task-definition model, the binding resolver, the Task types screen |
| `designer/request-type-editor.js` | the Request types screen shell, its document, export/import |
| `designer/flow-editor.js` | the Task flow section — step list, add step, validation, handlers |
| `designer/flow-step-card.js` | one activity's card — data wiring, runtime config, transitions |
| `designer/flow-graph.js` | the read-only SVG overview of the graph |
| `designer/data-editor.js` | the Data parameters section and its reference guard |
| `index.html` | the shell — markup, seed data, `render()`, event wiring, boot |

The render functions are throwaway: the real implementation is React and MUI on the existing designer
shell.
