# Task Request — technical specification

**Jira:** AIXDEV-23409

File paths below refer to the [`aixpertsoft/verios`](https://github.com/aixpertsoft/verios) and
[`aixpertsoft/aixboms`](https://github.com/aixpertsoft/aixboms) repositories. They are written as
plain paths rather than links because branch layouts move.

Background and rationale are in [overview.md](overview.md); this document is the contract.

---

## Scope decisions

1. **Not a replacement.** `de.comconsult.wf` stays. This is a second, simpler subsystem that
   coexists with it.
2. **Production home is a new BC4J subsystem** — `de.aixpertsoft.taskrequest`, generated from a
   `models/*.json` + `genbc4j` run. Not an extension of `proma`.
3. **The POC persists via a file-backed document endpoint** (the `/datasources` pattern), not
   session storage. Same client code as production, and real cross-user semantics — so approvals are
   demonstrable, which session storage cannot do.

---

## Reuse map — do not rebuild these

| Requirement | Use this |
| --- | --- |
| `TaskDefinitionRegistry`, server-side Executor | `de.aixpertsoft.action.server`: `@Action(name,label,description,parameters,outParameters)` + `IAction.perform()`, `ActionRegistry.INSTANCE`, annotation-scanned discovery, `GET /actions`, `POST /actions/run` |
| Task Configurator UI | `forms/core/command/serveractions/RunServerActionCommand.tsx` already builds a dialog from the declared `Parameter[]` |
| Per-type registry shape | `client/datasource-designer/designer/datasourceTypeRegistry.tsx` — `{ id, label, description, icon, makeEmpty, Editor }`; feeds `util-ui/TilePickerDialog.tsx` free |
| StatusWorkflow | `model/server/websocket/proma/WorkflowDefinitionDTO.ts` + `client/forms/components/ProjectStatusTransitionsDef/`, incl. `mandatoryAttributesPerStatus` and per-transition `StatusPermissionsDTO { roles[], creator/assigneePermissionMode }` |
| Comments & change requests (JSON rich text) | TipTap v3 — `client/common/components/RichText/RichTextEditor.tsx`, `forms/components/CommentDef/`, stored as stringified TipTap JSON in a `JsonDomain` CLOB (see `proma/bc4j/Comment.xml`) |
| Save / dirty / list / ACL chassis | `util-ui/EntityListPage.tsx`, `util-ui/useWorkbenchSaveBridge.ts`, `lib/util/restApi.ts` (`createEntityApi`, `createPermissionsApi`), `util-ui/permissions/openPermissionsDialog.ts` |
| Shell & rail styling | `datasource-designer/designer/DatasourceDesignerShell.tsx` (~95 lines, the best template), `util-ui/designerRail.tsx`, `designerControls.tsx`, `designerStyles.ts` |
| Execution log surface | `de.comconsult.audit.businesslogic` history loggers + `forms/components/HistoryTableDef/` |
| Principal picker | `de.comconsult.admin.bc4j.CocoAdminRolesAndGroupsAndUsers` via `openViewDefTableDialog` |

**Registry caution:** copy the *datasource* registry shape (one entry per type), not the dashboard
widget one — the latter splits registration across `WidgetCatalog`, `RENDERERS`, `WIDGET_RUNTIMES`,
an icon map and a `switch`, which is exactly the drift a real registry exists to eliminate.

---

## TaskAPI — client/server contract

### Design principle: split the authoring surface from the authority surface

The most important decision in the API, and what closes the security hole in the original
requirements document.

| Surface | Who owns it | How it is written |
| --- | --- | --- |
| **Authoring** — name, `data` values, task item list and their configs | the client | `POST /taskrequests` (whole-document save, optimistic-locked) |
| **Authority** — approvals, status, execution state, logs | the **server only** | dedicated sub-resource endpoints; each re-checks rules and permissions |

A document save carrying `approvals`, `status`, `taskItems[].status` or `executions` is **rejected
with `IMMUTABLE_FIELD`**, not silently merged. You cannot approve your own request by PUTting JSON.

### Three integrity mechanisms

1. **`version`** — monotonic int on `TaskRequest`. Every save sends `baseVersion`; mismatch →
   `409 STALE_VERSION`. Covers concurrent editing.
2. **`taskConfigHash`** — SHA-256 over the canonical JSON of the ordered task item configs. Every
   `Approval` records the hash it was given against. The `approvals` rule counts **only** approvals
   whose hash equals the current one, so editing a task config invalidates prior sign-off. Without
   this, approve → edit → execute is an open door.
3. **Server-side gate re-evaluation** — `POST /taskrequests/{id}/execute` re-runs the full rule set
   server-side before dispatching. The client's gate call is a hint for rendering; this is the
   control.

### Resources

Base: `{restURL()}/…` → `https://{host}/aixboms/rest/…`. Bearer token via `authHeaders()`.

**Task definition registry** — a thin projection over the existing `ActionRegistry`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/taskdefinitions` | List available task types (id, label, description, icon, parameters) |
| `GET` | `/taskdefinitions/{name}` | One definition, with its full `Parameter[]` |

**Task request definitions** — document CRUD via `AbstractDocumentResource`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/taskrequestdefs` | List metadata |
| `GET` | `/taskrequestdefs/{id}` | Load `{ metadata, content }` |
| `POST` | `/taskrequestdefs` | Create / update |
| `DELETE` | `/taskrequestdefs/{id}` | Delete |
| `GET` `PUT` | `/taskrequestdefs/{id}/permissions` | ACL (`createPermissionsApi`) |

**Task requests** — document CRUD for the authoring surface, plus authority sub-resources.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/taskrequests?status=&definitionId=&requester=&awaitingMyApproval=` | Inbox list |
| `GET` | `/taskrequests/{id}` | Load full request |
| `POST` | `/taskrequests` | Create / save **authoring surface only** |
| `DELETE` | `/taskrequests/{id}` | Delete |
| `GET` `PUT` | `/taskrequests/{id}/permissions` | ACL |
| `GET` | `/taskrequests/{id}/gate` | Rule evaluation — drives the gate box |
| `POST` | `/taskrequests/{id}/approvals` | Add / replace **my** approval |
| `DELETE` | `/taskrequests/{id}/approvals/mine` | Withdraw my approval |
| `POST` | `/taskrequests/{id}/comments` | Add comment (TipTap JSON) |
| `PATCH` `DELETE` | `/taskrequests/{id}/comments/{commentId}` | Edit / delete own comment |
| `POST` | `/taskrequests/{id}/change-requests` | Raise a change request |
| `PATCH` | `/taskrequests/{id}/change-requests/{crId}` | `{ resolved: boolean }` |
| `POST` | `/taskrequests/{id}/transitions` | `{ toStatus }` — guarded by the status graph |
| `POST` | `/taskrequests/{id}/execute` | Start a run — returns when it pauses or finishes |
| `GET` | `/taskrequests/{id}/runs`, `/runs/{runId}` | Run state |
| `POST` | `/taskrequests/{id}/runs/{runId}/cancel` | Abandon a paused run and unlock authoring — **requester or Administrator only**, never the assigned signer |
| `GET` | `/taskrequests/{id}/executions?taskItemId=` | Execution log |

**Work items** — top-level, because they are an inbox and their actor may not be able to address the
parent request.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/workitems?assignedToMe=&state=&taskRequestId=` | The human task list |
| `GET` | `/workitems/{wid}` | One work item, with its `context` |
| `POST` | `/workitems/{wid}/claim` | Take a candidate-group item |
| `POST` | `/workitems/{wid}/complete` | `{ result }` — validate, log, **resume the run** |
| `POST` | `/workitems/{wid}/reject` | `{ reason }` — honours the item's `RefusalPolicy`; `403` under `NOT_ALLOWED` |

Every mutating sub-resource returns the **refreshed `TaskRequestDTO`**, so the client never guesses
at derived state (status, task item statuses, invalidated approvals, new version).

### DTOs

TypeScript shown; the Java DTOs in `de.aixpertsoft.taskrequest.dto` are the source of truth and the
TS is generated by the existing `syncWithVerios` converter into
`src/projects/model/server/taskrequest/`.

```ts
// ---------- registry ----------
export interface TaskDefinitionDTO {
  name: string;                 // @Action.name — the executor id
  label: string;
  description: string;
  icon?: string;
  execution: 'AUTOMATIC' | 'MANUAL';   // default AUTOMATIC; see "Manual tasks"
  parameters: ParameterDTO[];   // reused verbatim from de.aixpertsoft.action.dto
  resultParameters?: ParameterDTO[];   // MANUAL only — what the human supplies
  defaultAssignedRoles?: string[];     // MANUAL only
}

// ---------- definition ----------
export interface TaskRequestDefinitionContentDTO {
  apiVersion: 'aixboms.taskrequest/v1';
  id: string;
  name: string;
  description?: string;
  definitionVersion: number;               // stamped onto requests; see "definition drift"
  statusWorkflow: WorkflowDefinitionDTO;   // reused from proma
  supportedTaskDefinitions: string[];      // TaskDefinitionDTO.name[]
  dataParameters: DataParameterDTO[];
  executionRules: TaskRule[];
  onError: 'STOP' | 'CONTINUE';            // execute-all failure policy
}

export interface DataParameterDTO {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  required: boolean;
  defaultValue?: unknown;
  enumValues?: string[];
}

// ---------- request ----------
export type TaskItemStatus = 'NOT_RUN' | 'RUNNING' | 'WAITING' | 'SUCCEEDED' | 'FAILED';

export interface TaskItemDTO {
  id: string;
  taskDefinitionName: string;
  label: string;
  config: Record<string, unknown>;   // validated against the TaskDefinition's Parameter[]
  status: TaskItemStatus;            // server-owned; WAITING = parked on a work item
  outputs?: Record<string, unknown>; // server-owned, written on SUCCEEDED from @Action outParameters
  lastAttempt?: number;              // server-owned
  lastError?: string;                // server-owned
}

export interface ApprovalDTO {
  id: string;
  userId: string;
  displayName: string;
  decision: 'APPROVED' | 'REJECTED';
  comment?: string;
  createdAt: string;                 // ISO-8601
  taskConfigHash: string;            // what was approved
  stale: boolean;                    // derived: hash !== request.taskConfigHash
}

export interface ChangeRequestDTO {
  id: string; userId: string; displayName: string;
  body: TipTapDocument;
  resolved: boolean;
  resolvedBy?: string; resolvedAt?: string;
  createdAt: string;
}

export interface CommentDTO {
  id: string; userId: string; displayName: string;
  body: TipTapDocument;
  createdAt: string; updatedAt?: string;
}

export interface TaskRequestContentDTO {
  apiVersion: 'aixboms.taskrequest/v1';
  id: string;
  name: string;
  definitionId: string;
  definitionVersion: number;         // snapshot — which rules/graph this request is bound to
  status: string;                    // server-owned
  requester: string;                 // server-owned
  createdAt: string;                 // server-owned
  version: number;                   // optimistic lock, server-owned
  taskConfigHash: string;            // server-computed
  data: Record<string, unknown>;     // snapshot-copied from the definition at creation
  taskItems: TaskItemDTO[];
  approvals: ApprovalDTO[];          // server-owned
  changeRequests: ChangeRequestDTO[];// server-owned
  comments: CommentDTO[];            // server-owned
  currentRun?: ExecutionRunDTO;      // server-owned — present while a run is in flight
}
```

### Manual tasks — human steps inside a run

Some work has no executor. A task generates a document and a named person must digitally sign it
before the next task files it. The design rule, taken from every engine that does this well:

> A manual task is not "a task that does nothing". It is **a task that creates a work item and
> suspends the run until that work item reaches a terminal state** — with an assignee, a payload it
> shows the human, and a result it collects back.

**Manual task types live in the same registry.** `TaskDefinitionDTO.execution` distinguishes them;
manual types are declared server-side by an annotation scanned like `@Action` but carry no
`IAction`. This buys the whole client surface unchanged — the tile picker, `supportedTaskDefinitions`,
and the config form generated from `parameters`. The **completion form is generated from
`resultParameters` by the same `Parameter[]` renderer**, so a manual task needs no new UI either.
Ship one type in the POC, `manualSignOff`; admin-defined manual types (label and result fields
authored in the definition editor, no code) are the natural extension.

**The requester places manual steps in the plan**, like any other task. They are therefore visible
before approval, covered by `taskConfigHash`, and counted by the gate. Steps that materialise
*during* a run would undermine the product's central promise — that a request shows what is proposed
before it runs — and are deliberately not supported.

**Execution becomes a resumable run.** This is the substantive change: `POST /execute` can no longer
be a loop inside one HTTP call, because a signature takes days. Note that the same mechanism covers
slow automatic tasks, which the original non-goals flagged as needing a revisit.

```ts
export type RunState      = 'RUNNING' | 'WAITING' | 'COMPLETED' | 'FAILED'
                          | 'CANCELLED'          // an operator abandoned it
                          | 'SENT_BACK';         // a signer declined and returned it to the author
export type WorkItemState = 'OPEN' | 'CLAIMED' | 'COMPLETED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';

/* Declared per manual task item, so it is inside taskConfigHash and therefore
   covered by approval: reviewers sign off on whether a signature may be declined. */
export type RefusalPolicy = 'SEND_BACK' | 'FAIL' | 'NOT_ALLOWED';

export interface ExecutionRunDTO {
  id: string; taskRequestId: string;
  state: RunState;
  taskConfigHash: string;          // the plan this run executes — frozen for its lifetime
  cursor: number;                  // index into taskItems
  waitingOnWorkItemId?: string;
  startedBy: string; startedAt: string; finishedAt?: string;
}

export interface WorkItemDTO {
  id: string; runId: string; taskRequestId: string; taskItemId: string;
  title: string; instructions?: string;
  assignedRoles: string[];               // candidate group
  assignedUser?: string;                 // set on claim
  dueAt?: string;
  state: WorkItemState;
  context: Record<string, unknown>;      // outputs of preceding task items
  result?: Record<string, unknown>;      // validated against resultParameters
  completedBy?: string; completedAt?: string; rejectionReason?: string;
}
```

`EXPIRED` is reserved now so adding timeouts later does not widen the state machine.

**Work items are addressed globally, owned locally.** Their lifecycle belongs to the run — only the
engine creates one, and deleting the request cascades — but they get their own table, REST collection
and ACL, because three things demand it: they are an **inbox** ("what must I do?" queries across all
requests, filtered by assignee, role, state and due date — the same argument this document already
makes for real columns on the request); a signer may hold **no read permission** on the parent
request; and a notification **links to a work item**, not to "request 1039, task 2". They are not
merely `taskItem.status = WAITING` plus an assignee column: re-running a manual task creates a
*second* work item, and both belong in the audit trail — the same reason `TaskExecutionLog` is
separate from `TaskItem`. `ExecutionRun` stays a child of the request; it has no inbox pressure.

**Task outputs carry the handoff.** `@Action` already declares `outParameters`; `TaskItemDTO.outputs`
surfaces them, and a work item's `context` is the outputs of every preceding item in the run — which
is what the signer is shown. **Deliberately no binding expressions** (`${task1.fileId}`): inventing
an expression language here would repeat the mistake this document rejects for rules. Selective
binding is a later feature.

**Completion resumes the run — there is no "Continue" button.** In Camunda, Step Functions, Temporal
and GitHub Actions alike, closing the human task *is* the resume signal. A separate button means two
clicks for one decision and creates a "signed but not continued" limbo somebody has to chase. A
per-definition flag for an explicit operator release is a documented extension, not the default.

#### What a refusal means is configurable

A refusal is **a decision, not a breakage**. Treating it as a task failure is wrong by default: it
paints a red badge and an error where a considered human answer belongs, and it offers *re-run* as
the recovery when the actual recovery is to route the request back to whoever can change it. But some
steps genuinely have no "no" — a compliance signature is given or the change does not proceed. So the
manual task item declares a `RefusalPolicy`:

| Policy | Effect |
| --- | --- |
| `SEND_BACK` *(default)* | Work item → `REJECTED`, task item back to `NOT_RUN`, run ends `SENT_BACK`. **Nothing is marked failed.** The reason is filed as an **unresolved change request**, which the existing `noUnresolvedChangeRequests` rule turns into a red gate — so the request cannot re-execute until it is dealt with. Re-running afterwards skips the task items that already succeeded. |
| `FAIL` | Task item → `FAILED`; `definition.onError` decides `STOP` or `CONTINUE`. For steps where a refusal really is an error condition. |
| `NOT_ALLOWED` | `POST /workitems/{wid}/reject` returns **403**. Sign, or the run stays parked. |

Reusing change requests here is the point: a refusal to sign *is* "request changes" raised
mid-execution, the gate re-blocking falls out of a rule that already exists, and the requester finds
the objection in the conversation where every other objection lives. No new rule, no new surface.

**`NOT_ALLOWED` needs an escape hatch, and cancelling is it.** A work item that cannot be declined and
is not signed would otherwise park forever. Two invariants make that safe:

1. **Cancelling a run is always available**, and it is the only way out of a `NOT_ALLOWED` item.
2. **Cancelling is the requester's or an administrator's authority, never the assigned signer's** —
   otherwise "sign or nothing" is defeated by the signer cancelling instead of declining.

A refusal is recorded on the work item (`state`, `rejectionReason`, `completedBy`, `completedAt`) and
in the execution log under all policies, including `SEND_BACK` where the log row outcome is
`SENT_BACK`. Declining is never silent.

### Rules

**Do not use free-text TypeScript expressions.** That contradicts a written decision in
`client/datasource-designer/README.md`, which removed user-authored JS because it is an RCE /
stored-XSS-class capability, "typically an outright compliance/pentest blocker" for on-prem installs,
and non-functional under the production CSP regardless (no `unsafe-eval`, no `blob:`).

Both use cases the original document names are structured predicates, and neither is expressible in
raw JSONata without an approval-quorum helper anyway. So the rule is data:

```ts
export type TaskRule =
  | { kind: 'approvals'; min: number; roles?: string[]; excludeRequester?: boolean }
  | { kind: 'noUnresolvedChangeRequests' }
  | { kind: 'allTasksSucceeded' }
  | { kind: 'data'; path: string; op: 'eq' | 'ne' | 'gt' | 'lt' | 'truthy'; value?: unknown }
  | { kind: 'all' | 'any'; rules: TaskRule[] }
  | { kind: 'not'; rule: TaskRule };
```

Evaluated by a pure function returning **per-rule reasons**, not just a boolean — the reasons are
what the gate box renders:

```ts
export interface RuleContext {
  data: Record<string, unknown>;
  approvals: ApprovalDTO[]; changeRequests: ChangeRequestDTO[]; taskItems: TaskItemDTO[];
  requester: string; currentUser: string;
}
export function evaluateRule(rule: TaskRule, ctx: RuleContext): GateRuleResult;
```

Mirrored in Java as `de.aixpertsoft.taskrequest.rules.RuleEvaluator` — **the Java one is the gate**;
the TS one exists for rendering and for the definition editor's live preview. Both tested against
the same fixture table, in both directions.

A free-text `{ kind: 'expression'; jsonata }` arm is deliberately **deferred** until a server-side
evaluator exists. Adding it client-only would reintroduce exactly the bypass this design closes.

> The prototype's `evaluateRule()` / `evaluateGate()` in `index.html` implement this, minus the
> composite `all` / `any` / `not` arms. It is the part worth porting.

### Gate response

```ts
export interface GateRuleResult {
  ruleIndex: number;
  kind: TaskRule['kind'];
  label: string;                 // "2 approvals from Administrator (not the requester)"
  satisfied: boolean;
  reason?: string;               // "1 of 2 — 1 dismissed because a task was edited"
}
export interface GateDTO {
  canExecute: boolean;
  taskConfigHash: string;        // echo — pass back to /execute
  rules: GateRuleResult[];
  blockedBy?: 'RULES' | 'PERMISSION' | 'STATUS' | 'NO_TASKS';
}
```

### Execute

```ts
export interface ExecuteRequestDTO {
  taskItemIds?: string[];         // omit = all
  expectedTaskConfigHash: string; // TOCTOU guard — 409 if the request changed under you
}
export interface TaskExecutionResultDTO {
  taskItemId: string; attempt: number;
  outcome: 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  startedAt: string; finishedAt: string; durationMs: number;
  executedBy: string;
  message?: string; detail?: string;   // BusinessLogicError text, stack excerpt
}
export interface ExecuteReplyDTO {
  results: TaskExecutionResultDTO[];
  run: ExecutionRunDTO;                // where the run got to
  request: TaskRequestContentDTO;      // refreshed
}
```

`TaskExecutionResultDTO.executedBy` is joined by `onBehalfOf?` and `triggeredBy?` — see
"identity of a resumed run" below.

**Server sequence for `POST /execute`:**

```
 1. load request, check WRITE permission
 2. 409 STALE_VERSION      if expectedTaskConfigHash != current
 3. 409 RUN_IN_PROGRESS    if a run is already RUNNING or WAITING
 4. 403 RULE_NOT_SATISFIED if RuleEvaluator says no   ← the actual gate, evaluated once
 5. create ExecutionRun { RUNNING, cursor: 0, taskConfigHash }, lock the authoring surface
 6. drive(run)

drive(run):
   while cursor < taskItems.length:
     t = taskItems[cursor]
     if definition(t).execution == MANUAL:
        create WorkItem { OPEN, assignedRoles, context: outputs of items before cursor }
        t.status = WAITING; run.state = WAITING; run.waitingOnWorkItemId = wi.id
        return                                    ← the HTTP call ends here
     mark RUNNING → ActionExecutor.run(@Action by name, config) → SUCCEEDED | FAILED
     on SUCCEEDED: t.outputs = declared outParameters
     append a TaskExecutionLog row for the attempt, always
     on FAILED: honour definition.onError (STOP → run.state = FAILED; return)
     cursor++
   run.state = COMPLETED; unlock the authoring surface
```

**Server sequence for `POST /workitems/{wid}/complete`:**

```
 1. caller holds one of assignedRoles; work item OPEN | CLAIMED; run WAITING
 2. 400 VALIDATION_FAILED  if result does not satisfy resultParameters
 3. wi.COMPLETED; t.status = SUCCEEDED; t.outputs = result; append a log row
 4. run.state = RUNNING; cursor++
 5. drive(run)                                    ← auto-resume
 6. return refreshed request + run
```

`drive()` continuing inline is acceptable for the POC because the remaining tasks are fast. In
production it belongs on a worker — **AixBOMS already runs Quartz** for `de.comconsult.wf` timeouts.

**Identity of a resumed run.** After a pause, the person who pressed Execute is gone. Tasks that run
after a resume log `executedBy: 'system'`, `onBehalfOf: <requester>`, `triggeredBy: <who closed the
work item>`. For a subsystem whose purpose is a record of who agreed to what, this cannot be fudged.

**A run freezes the plan.** While a run is `RUNNING` or `WAITING`, authoring saves, task edits and a
second `/execute` are refused with `409 RUN_IN_PROGRESS`. Without it, a run paused for two days can
have task 5 edited while tasks 1–3 are done: the hash moves, approvals are dismissed, and half a plan
has executed under terms that no longer exist. Cancel the run to edit.

**Gate approvals and work items are different things**, and the document should not let them blur.
Gate approvals answer *"may this plan run at all?"* — before anything happens, about the whole plan,
hash-bound. Work items answer *"do this one step now"* — during the run, about one task, producing a
result. Manual steps are never gate rules. `allTasksSucceeded` needs no change: a `WAITING` item is
not `SUCCEEDED`, which is already the right answer.

**Not transactional across task items.** Each task is its own transaction; a partial run is a real,
representable state (`SUCCEEDED` + `FAILED` + `NOT_RUN` side by side). The original document is
silent on this — it must be stated, because it is the difference between "Execute all" being a
convenience and being a promise the system cannot keep. There is no compensation or rollback in the
POC; re-run is the recovery path.

### Errors

`TaskApiErrorDTO { code, message, details? }` with HTTP status:

| Code | Status | When |
| --- | --- | --- |
| `NOT_FOUND` | 404 | unknown id, or unreadable — existence must not leak, matching `JsonDocumentStorageService` |
| `FORBIDDEN` | 403 | ACL denies, or not permitted for this status transition |
| `STALE_VERSION` | 409 | `baseVersion` / `expectedTaskConfigHash` mismatch |
| `RUN_IN_PROGRESS` | 409 | authoring save, task edit or second `/execute` while a run is `RUNNING` or `WAITING` |
| `IMMUTABLE_FIELD` | 400 | save tried to write approvals / status / execution state |
| `INVALID_TRANSITION` | 400 | target status not reachable per the status graph |
| `RULE_NOT_SATISFIED` | 403 | execute attempted while the gate is red — **carries the full `GateDTO` in `details`** |
| `VALIDATION_FAILED` | 400 | task config does not satisfy the `Parameter[]`, or a mandatory data attribute is missing |
| `TASK_EXECUTION_FAILED` | 200 | *not* an error response — a failed task is a normal `ExecuteReplyDTO` outcome |

That last row matters: a task failing business logic is data, not an HTTP error. Only a refusal to
*attempt* execution is an error.

### Client surface

`src/projects/client/task-request/task-api/TaskAPI.ts` — the **only** module that knows the
transport.

```ts
const defs     = createEntityApi<TaskRequestDefinitionMetadataDTO, TaskRequestDefinitionContentDTO>({
  path: 'taskrequestdefs', toMetadata: (d) => ({ id: d.id, name: d.name }) });
const requests = createEntityApi<TaskRequestMetadataDTO, TaskRequestContentDTO>({
  path: 'taskrequests',    toMetadata: (r) => ({ id: r.id, name: r.name, status: r.status }) });

export const taskRequestDefinitionApi     = defs;
export const taskRequestApi               = requests;
export const taskRequestDefPermissionsApi = createPermissionsApi('taskrequestdefs');
export const taskRequestPermissionsApi    = createPermissionsApi('taskrequests');

export function listTaskDefinitions(): Promise<TaskDefinitionDTO[]>;
export function getGate(id: string): Promise<GateDTO>;
export function addApproval(id: string, decision: 'APPROVED' | 'REJECTED', comment?: string): Promise<TaskRequestContentDTO>;
export function withdrawApproval(id: string): Promise<TaskRequestContentDTO>;
export function addComment(id: string, body: TipTapDocument): Promise<TaskRequestContentDTO>;
export function addChangeRequest(id: string, body: TipTapDocument): Promise<TaskRequestContentDTO>;
export function resolveChangeRequest(id: string, crId: string, resolved: boolean): Promise<TaskRequestContentDTO>;
export function transition(id: string, toStatus: string): Promise<TaskRequestContentDTO>;
export function execute(id: string, req: ExecuteRequestDTO): Promise<ExecuteReplyDTO>;
export function getExecutions(id: string, taskItemId?: string): Promise<TaskExecutionResultDTO[]>;
```

### Phase-2 transport note

Entity CRUD on this platform normally goes over the WebSocket `LoadDataAction` / `QueryAction`, not
REST. When the BC4J entities land, the REST document endpoints for `/taskrequests` are replaced — but
`TaskAPI.ts` is the seam, so no UI component changes. The authority sub-resources (`/gate`,
`/execute`, `/approvals`, `/transitions`) **stay REST** regardless: they are operations, not row CRUD,
and they run server-side logic that `LoadDataAction` cannot express.

---

## POC scope

Proves the hard parts — the registry seam, server-side rule gating, approval invalidation and the
failure surface. HelloWorld proves nothing about execution and is only a placeholder, so ship **two**
task definitions: `HelloWorld` and a deliberately failing `HelloWorldFail`, so the failure badge and
the execution log are exercised for real.

### Server — new module `de.aixpertsoft.taskrequest`

- `HelloWorldAction` / `HelloWorldFailAction` — `@Action`-annotated `IAction` implementations with a
  `greeting` `@Parameter`, discovered and run by the **existing** `ActionRegistry` / `ActionExecutor`.
  No new execution engine.
- `TaskRequestDefinitionResource` and `TaskRequestResource` — `extends AbstractDocumentResource` over
  `JsonDocumentStorageService`, file-backed under `~/.aixboms/`. ~4 small classes each (DTO,
  MetadataDTO, StorageService, Resource); pattern in `de.aixpertsoft.datasources`.
- `TaskRequestOperationsResource` — the authority sub-resources.
- `RuleEvaluator`, `TaskConfigHasher`, `ExecutionGuard`.

### Client — `src/projects/client/task-request/`

```
dto/            TaskRequest, TaskRequestDefinition, TaskItem, Approval, ChangeRequest, Gate
rules/          TaskRule.ts, evaluateRule.ts, RuleEditor.tsx
registry/       taskDefinitionRegistry.tsx        (seeded from GET /taskdefinitions)
definition/     TaskRequestDefinitionShell.tsx    (from DatasourceDesignerShell)
                StatusWorkflowPanel.tsx           (reuse ProjectStatusTransitionsDef)
                SupportedTasksPanel.tsx, DataParamsPanel.tsx, RulesPanel.tsx
request/        TaskRequestEditor.tsx
                TaskItemList.tsx, ApprovalPanel.tsx, ChangeRequestList.tsx,
                CommentThread.tsx, ExecuteBar.tsx, ExecutionLogDialog.tsx
launcher/       TaskRequestLaunchpad.tsx, TaskRequestListPage.tsx, InboxPage.tsx
task-api/       TaskAPI.ts
```

Register a `TaskRequestPackage` in `src/app/PackageInitializer.ts` plus a navi Activity and Admin
menu entry, mirroring `AixSoNaviDashboardDesignerActivity.xml`.

### Definition drift

`data` is snapshot-copied at creation, but rules, status graph and supported tasks are referenced by
type — so editing a definition can silently un-approve an in-flight request. Hence
`definitionVersion` on both sides: a request is bound to the version it was created from, and
definition edits bump it. Requests on an older version keep their original rules until explicitly
migrated.

---

## Explicit non-goals for the POC

Notifications (the work item inbox stands in); due-date escalation and timeouts (`EXPIRED` is
reserved but never set); binding expressions between task outputs and later task inputs; manual steps
created *during* a run; transactionality across "Execute all"; the JSONata expression rule arm;
migration of anything from `de.comconsult.wf`.

**No longer non-goals.** Manual tasks brought pause/resume forward: a run suspends on a work item and
resumes when it closes, so long-running execution and role-based **assignment** are both in scope.
Individual automatic tasks are still dispatched synchronously inside `drive()`; making *those*
asynchronous is the remaining piece, and the run state machine is the place it will land.

---

## Phase 2 — BC4J

Add `Server/ApplicationSuite/Admin/Basis-DB/models/taskrequest.json` and run
`gradlew genbc4j -Pfile=taskrequest.json`. Budget for scale: the 3-entity `proma.json` generated
~110 files (BC4J XML, Liquibase, forms, aspects, activities, LOVs, members, menus, icons).

```
TaskRequest  ──1:N──▶  TaskItem  ──1:N──▶  TaskExecutionLog
             ──1:N──▶  Approval
             ──1:N──▶  ChangeRequest
             ──1:N──▶  Comment
             ──1:N──▶  ExecutionRun ──1:N──▶ WorkItem ──N:1──▶ TaskItem
```

Task config, `data`, task outputs, work item `context`/`result` and rules as `"type": "JSON"`
(`JsonDomain`) columns; **status, type, requester, dates and outcome as real columns** — the inbox
filters and reports on those, and querying JSON CLOBs for them is painful. The same rule applies
harder to `WorkItem`: **`state`, `assignedRoles`, `assignedUser` and `dueAt` must be real, indexed
columns**, because `GET /workitems?assignedToMe` is the query that makes manual tasks usable.
`TaskExecutionLog` should follow the platform's polymorphic
`RefObjType` / `RefObjNr` / `RefObjId` convention.

---

## Verification

1. `yarn lint <paths>` and `yarn lint-ts` from the verios root.
2. `yarn test run src/projects/client/task-request/rules/__tests__` — table-driven tests for
   `evaluateRule`, including both cases named in the original document.
3. Java: `RuleEvaluatorTest` sharing the **same fixture table** as the TS tests, asserting parity in
   both directions; `HelloWorldActionTest` following `ActionExecutorTest` / `ActionRegistryTest`.
4. End-to-end in the running app:
   - Admin menu → Task Request Definitions → create one with `HelloWorld` supported, a status graph,
     one data param `goodToGo`, and rule
     `approvals{ min: 2, roles: ['Administrator'], excludeRequester: true }`.
   - New Task Request from it → add a HelloWorld task item → **Execute disabled**, gate shows
     "0 of 2 approvals".
   - Approve as two different Administrator users → gate green → Execute → greeting on server
     `System.out`, execution log populated.
   - **Bypass test** — with the gate red, call `POST /taskrequests/{id}/execute` directly. Must return
     `403 RULE_NOT_SATISFIED`. *The single most important assertion in the POC.*
   - **Immutable-field test** — `POST /taskrequests` with a hand-written `approvals` array. Must
     return `400 IMMUTABLE_FIELD`.
   - **Stale-approval test** — approve to green, then edit a task config. Approvals must flip to
     `stale: true` and Execute must re-disable.
   - **Concurrency test** — two tabs, save from both. Second must get `409 STALE_VERSION`.
   - Add `HelloWorldFail` → execute all → "Failed execution" badge, `onError: STOP` leaves later
     tasks `NOT_RUN`, log dialog shows both attempts.
   - **Manual task test** — a plan of *generate document → manualSignOff → archive*. Execute: the
     first task succeeds, the second goes `WAITING`, the third stays `NOT_RUN`, and the reply carries
     `run.state = WAITING`. `GET /workitems?assignedToMe=true` returns the item for an eligible
     signer and nothing for anyone else. `POST /workitems/{wid}/complete` runs the third task
     **without a second Execute call**, and its log row reads
     `executedBy: system, onBehalfOf: <requester>, triggeredBy: <signer>`.
   - **Frozen-plan test** — while the run is `WAITING`, `POST /taskrequests` with an edited task
     config must return `409 RUN_IN_PROGRESS`, and the `taskConfigHash` must be unchanged afterwards.
   - **Wrong-signer test** — `complete` called by a user outside `assignedRoles` must return `403`.
   - **Refusal tests**, one per policy:
     - `SEND_BACK` — the run ends `SENT_BACK`, **no task item is `FAILED`**, the declined item is back
       at `NOT_RUN`, an unresolved change request appears carrying the reason, and the gate is red
       again. Resolve it, re-execute, and the already-succeeded tasks are not re-run.
     - `FAIL` — task `FAILED`, run `FAILED` under `onError: STOP`, later tasks `NOT_RUN`, and **no**
       change request is filed.
     - `NOT_ALLOWED` — `reject` returns `403` and the run stays `WAITING`.
   - **Cancel authority test** — `runs/{runId}/cancel` must return `403` for the assigned signer and
     succeed for the requester and for an Administrator. Without this, `NOT_ALLOWED` is decorative.
