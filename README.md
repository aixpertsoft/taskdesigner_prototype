# Task Request — designer prototype

A clickable prototype for a proposed **Task Request** subsystem in AixBOMS: a lightweight approval
workflow modelled on the GitHub Pull Request, where a request bundles one or more configured tasks,
collects approvals and change requests, and unlocks an Execute button only once a set of rules passes.

Jira: **AIXDEV-23409**

This repository holds the prototype and its design documentation. It contains **no product code** —
nothing here ships. It exists to settle the design before implementation starts in
[`aixpertsoft/verios`](https://github.com/aixpertsoft/verios).

---

## Start it

The prototype is plain HTML, CSS and JavaScript with no build step and no dependencies.

**Simplest — just open it:**

```
index.html
```

Double-click it, or drag it into a browser. That is all it needs. `index.html` loads four sibling
files from the same folder, so keep them together — but there is nothing to install or compile.

**Or serve it** (only worth it if you want a shareable local URL):

```bash
npx serve .          # then open http://localhost:3000
# or
python -m http.server 8000
```

The only external request the page makes is the IBM Plex webfont from Google Fonts. Offline it falls
back to Segoe UI and still works.

---

## Use it

Everything runs in your browser. There is no server, nothing is saved, and reloading starts over —
so click freely. The reset button (top right) restores the seeded state at any time.

### The controls that matter

| Control | Where | What it does |
| --- | --- | --- |
| **Viewing as** | top right | Switches the current user. This is the key control — approvals are per person, so most of the prototype only makes sense if you switch. |
| **Reset** | top right | Restores the starting state. |
| **Theme** | top right | Light / dark. |
| **Runtime / Designer** | top left | The two applications in one shell: the end user's task requests, and the administrator's process design. Designer edits are live in the runtime the moment you switch. |

### The demo users

| User | Roles | Can approve? |
| --- | --- | --- |
| **M. Browett** | NetOps | No — opened TR-2087, and you cannot approve your own request |
| **A. Schmidt** | Administrator, NetOps | Yes |
| **K. Weber** | Administrator | Yes |
| **J. Novak** | Viewer | No — holds no approving role |

### The example

One worked case: **the notification a network operator must send customers before planned
maintenance.** A person drafts the notification, an administrator approves the exact wording (or
sends it back — the process loops on their answer), and the server sends it and records the result.
A designed slot in the middle can hold a **digital signature** when a cryptographic receipt of the
approved wording is wanted — proof that *what was approved* and *what was sent* are the same text.

### Three things worth trying

**1. Run it.** Open `TR-2087` and press **Execute all tasks**. It stops immediately — step 1 needs a
person. Press **Submit draft** and write the notification; the process routes straight to the
approval. Switch to K. Weber, tick **Approve the wording**, and **Submit decision**. The mail sends
by itself. Answer *no* instead and the process walks back to the draft — the flow's transitions
route on her answer; there is no decline button and no continue button.

**2. Watch the data fill in.** The **Data** tab has two fields you own and several marked *written
by a task*. The subject, text, fingerprint and delivery status are written by the run, through the
task definitions' output mappings, and are read-only by design.

**3. Watch a task fail.** Put an address at `@invalid.example` in the recipients at step 3. The send
fails with `550 5.1.1 … recipient address rejected`, the run stops there, and everything before it
keeps its results — the failure badge and the execution log are both real.

Also worth a look: **Task types** in the top nav, where the four steps are authored — which server
action each one calls, and how values are wired between them. And **Request types**, where changing
the required approval count makes the gate respond immediately: configuration, not code.

### What is real and what is not

**Real** — the rules engine, the approval quorum, role checks, the stale-approval dismissal, the
execution gate, and the run state machine — a single token walking a routed graph, parking on
manual steps, looping back when an approval answers no. A request's status is derived from that machine — open until the work is done — rather than
being a second, hand-driven state machine beside it. These are the logic described in
[the specification](docs/specification.md), so the Execute button is genuinely blocked rather than
merely drawn greyed out.

**Simulated** — task execution. No server is contacted; a task "runs" on a timer, the fingerprint is a
stand-in hash rather than SHA-256, and no mail leaves your browser.

**Not present** — persistence, authentication, notifications, and timeouts. A run pauses on a manual
step and resumes by itself, but everything happens inside one browser tab.

### The most important correction

The gate lives on the server, not in the Execute button's `disabled` attribute — the original
requirements document gated execution in the UI only, which is not an approval control, because
anyone able to call the API bypasses it. The prototype's run engine re-evaluates the full rule set
when a run starts and refuses with the failing rule named; in the real system the bypass test —
calling `POST /execute` directly with the gate red and getting `403 RULE_NOT_SATISFIED` — is the
single most important assertion in the POC.

---

## Read it

| Document | What it covers |
| --- | --- |
| [docs/overview.md](docs/overview.md) | What the feature is, the problem it solves, and the design decisions — start here |
| [docs/specification.md](docs/specification.md) | The technical specification: model, TaskAPI contract, DTOs, rules, POC scope |
| [docs/prototype-guide.md](docs/prototype-guide.md) | Screen-by-screen walkthrough of what the prototype shows and why |

---

## Repository layout

```
index.html                  the shell: markup, seed data, render(), event wiring, boot
app.css                     base styles
core.js                     icons, demo users, helpers, and the RULE ENGINE
inbox-view.js               the runtime's landing screen
request-view.js             the request screen: cards, panes, rail, gate bar
dialogs.js                  every modal
run-engine.js               execution and every mutation
task-definitions.json.js    the task catalogue, as data
request-types.json.js       the request types and their task flows, as data
task-editor.js              the Task types screen and the binding resolver
request-type-editor.js      the Request types screen and the task flow editor
execution-rules-editor.js   the gate rules
docs/overview.md            feature overview and design decisions
docs/specification.md       full technical specification
docs/prototype-guide.md     screen-by-screen walkthrough
```

## Editing the prototype

Hand-written HTML, CSS and vanilla JavaScript, one file per responsibility. The two `*.json.js`
files hold **data and no logic**; `core.js` carries the rule engine (`evaluateRule`/`evaluateGate` —
the part worth porting); `run-engine.js` carries execution and every mutation; each screen and the
dialogs render from their own file; each editor owns its model and screen. `index.html` is only the
shell: markup, `seed()`, `render()`, the delegated event handlers (dispatching on `data-act`; each
editor registers its own under `data-te`/`data-rt`/`data-er`/`data-dp`), and `boot()`.

The files load as **classic scripts sharing one global scope, not modules** — `type="module"` and
`fetch()` of a sibling `.json` are both blocked over `file://`, and the prototype has to survive
being emailed around and opened from disk. Load order is irrelevant for the function files
(resolution happens at call time); only the data files must precede the editors that read them at
load. If a file is missing or stale-cached, `boot()` names it on screen instead of leaving a dead
button.
