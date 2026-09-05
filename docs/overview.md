# Task Request — overview

**Jira:** AIXDEV-23409 · **Status:** design, prototype built, implementation not started

---

## The problem

Changes to infrastructure that need someone's sign-off are, today, coordinated informally. Somebody
asks in a meeting or by mail, somebody else says yes, and the work gets done. Two things are missing
from that: a record of who agreed to what, and any mechanical guarantee that the work does not happen
until they agreed.

AixBOMS does have a workflow engine — `de.comconsult.wf`, authored in the Development Suite. It is
capable and heavily used: 201 importing files, nine live process definitions, around thirty runtime
forms, parallel activity graphs, `WaitAll`/`WaitOne` gates, routers, sub-processes and Quartz
timeouts. But authoring anything in it requires a developer, and its power is aimed at a different
problem — long-running, branching provisioning processes, not "three people need to agree before
this runs."

## The idea

Borrow the shape of a GitHub Pull Request, and swap the diff for a list of tasks.

| Pull Request | Task Request |
| --- | --- |
| the proposed diff | the configured **tasks** |
| reviews | **approvals** |
| "request changes" | **change requests** |
| comments | **comments** |
| branch protection rules | **execution rules** |
| the Merge button | the **Execute** button |

The value of the analogy is that people already understand it. A request shows what is proposed, who
has signed off, what is still objected to, and a button that stays locked — and says why — until the
conditions are met.

> **Since revised:** the borrowed *pre-execution* controls — gate approvals, change requests and
> execution rules locking the Execute button — were later **removed from the design**. Approval
> proved stronger as an **activity inside the flow**: it sees the actual content and the
> transitions route on its answer. *Who may execute* is deferred to the platform's **user
> permissions**. The analogy above remains the origin story; a request today is closer to a
> designed **process instance** than to a Pull Request.

## The shape of it

**A `TaskRequestDefinition`** is the template, set up once by an administrator. It carries the status
graph, which task types may be added, the data fields to collect, and the execution rules.

**A `TaskRequest`** is one instance. It snapshots the definition's data fields, collects task items,
approvals, change requests and comments, and tracks its own status.

**A `TaskItem`** is one unit of work — sign a document, send a notification — configured through a form
generated from what the server declares about that task type.

Adding a new kind of task means writing a server-side executor and nothing else. No new screen, no
new dialog, no change to the request editor.

**A `WorkItem`** is a step only a person can carry out — a wording that must be approved before it
reaches customers. Execution parks there and resumes the moment the person closes it. Their answer
is data on the request, and the flow's **transitions** route on it: `approved = false` walks the
process back to the draft, `true` carries it forward. The routing is configured per activity and
approved along with the rest of the plan.

---

## The decisions that matter

### This does not replace the existing workflow engine

The original requirements document said it should. It cannot: a single-token state machine — even
with conditional routing and loops — is not a superset of parallel graphs, gates, routers and
sub-processes. This is a second, simpler subsystem for a different job, and the two coexist. The
line is parallelism: routing on a person's answer is in, running two branches at once is out. That removes migration of nine process
definitions and thirty forms from the critical path, and lets the simple case ship without solving
the hard one.

### The rules are enforced on the server, not in the button

The original document described gating the Execute button in the UI. That is not an approval control
— anyone able to call the API would bypass every rule. The server re-evaluates the full rule set
before dispatching anything; the button's state is a rendering hint. The prototype mirrors this:
starting a run re-evaluates every rule and refuses with the failing rule named, and the POC's most
important assertion is the bypass test — `POST /execute` called directly with the gate red must
return `403 RULE_NOT_SATISFIED`.

### Rules are structured data, not code

The original document proposed "boolean typescript expressions" for advanced rules. That contradicts
a decision already taken and written down in this codebase: the datasource designer removed
user-authored JavaScript because it is an RCE / stored-XSS-class capability, "typically an outright
compliance/pentest blocker" for on-prem installs, and non-functional under the production CSP
regardless. Both rule examples the document names are structured predicates anyway. See
[the specification](specification.md#rules) for the model.

### Approvals are bound to what was approved

Nothing in the original document invalidated approvals when the task configuration changed
afterwards, which leaves approve → edit → execute wide open. Every approval records a hash of the
task configuration it was given against, and only approvals matching the current hash count. Editing
a task dismisses prior sign-off — the same mechanism as GitHub's "dismiss stale reviews".

> **Since revised:** the hash mechanism left the design together with the gate approvals it
> protected. The in-flow approval step needs no equivalent — it decides on the *current* content
> by construction, and the plan is frozen while a run is in flight.

### Most of this already exists

The single largest finding from reviewing the requirements document: roughly 70% of the machinery it
specified is already in the codebase, in four unrelated places. Built literally, it would have been a
fifth parallel stack.

| Requirement | Already built |
| --- | --- |
| Task registry and server executors | `de.aixpertsoft.action.server` — `@Action` annotation, `ActionRegistry`, `GET /actions`, `POST /actions/run` |
| The task configuration UI | `RunServerActionCommand.tsx` already generates a dialog from declared parameters |
| Status workflow with role-gated transitions | `WorkflowDefinitionDTO` + the `ProjectStatusTransitionsDef` React Flow editor |
| Rich-text comments | TipTap v3, `RichTextEditor`, `CommentDef`, stored in a `JsonDomain` CLOB |
| Rule authoring UI pattern | `TransformSpec` + `PipelineBuilder` in the datasource designer |
| List page, save/dirty handling, ACLs | `EntityListPage`, `useWorkbenchSaveBridge`, `createEntityApi`, `openPermissionsDialog` |

What is genuinely new is small: a **per-attempt execution log** (there is no log table — only
single-slot `LAST_ERROR` columns). The N-of-M approval quorum originally listed here left the
design with the pre-execution gate.

---

## Naming

`Task` is already taken in this codebase — it means *workflow activity instance* (`TaskTableDef`,
`simpletask.form`, `taskorder.form`). `TaskDefinition`, `TaskRequest` and `WorkRequest` are free.

| Concept | Name |
| --- | --- |
| Metadata for a runnable unit of work | `TaskDefinition` |
| A configured unit inside a request | `TaskItem` |
| The request | `TaskRequest` |
| Its template | `TaskRequestDefinition` |
| Java package | `de.aixpertsoft.taskrequest` |
| TypeScript | `src/projects/client/task-request/` |

---

## What gets built first

A proof of concept proving the hard parts — the registry seam, server-side rule gating, approval
invalidation, the pause-and-resume of a manual step, and the failure surface — using a trivial
`HelloWorld` task plus a deliberately failing one, so the failure badge and execution log are
exercised for real.

**Explicitly not in the POC:** notifications (the work item inbox stands in), due-date escalation and
timeouts, binding expressions between one task's output and another's input, manual steps created
*during* a run, transactionality across "Execute all", free-text expression rules, and any migration
from the existing engine. Role-based assignment and a resumable run *are* in scope — manual tasks
require both.

Note that the prototype walks through a maintenance-notification workflow because that communicates
the feature to a non-technical audience; the POC ships `HelloWorld`. Nobody should read the mail
detail in the mockup as committed scope.

Full detail in [the specification](specification.md).
