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
| **Requests / Request types** | top left | The two halves: everyday use, and administrator setup. |

### The demo users

| User | Roles | Can approve? |
| --- | --- | --- |
| **M. Browett** | NetOps | No — opened TR-2087, and you cannot approve your own request |
| **A. Schmidt** | Administrator, NetOps | Yes |
| **K. Weber** | Administrator | Yes |
| **J. Novak** | Viewer | No — holds no approving role |

### The example

One worked case: **the notification a network operator must send customers before planned
maintenance.** Four steps — a person drafts the notification, the server fingerprints the exact wording, an
administrator approves that wording, the server sends it and records the result. The fingerprint is
the point: it makes *what was approved* and *what was sent* provably the same text.

### Three things worth trying

**1. Run it.** Open `TR-2087` and press **Execute all tasks**. It stops immediately — step 1 needs a
person. Press **Submit draft** and write the notification. The server signs it, then parks again for an
administrator. Switch to K. Weber, whose *Awaiting my action* tab now shows 1, and press **Approve**.
The mail sends by itself. Nobody pressed "continue" — closing the human step *is* the resume.

**2. Watch the data fill in.** The **Data** tab has two fields you own and several marked *set by
execution*. The subject, text, fingerprint and delivery status are written by the run, through the
task definitions' output mappings, and are read-only by design.

**3. Watch a task fail.** Put an address at `@invalid.example` in the recipients at step 3. The send
fails with `550 5.1.1 … recipient address rejected`, the run stops there, and everything before it
keeps its results — the failure badge and the execution log are both real.

Also worth a look: **Task types** in the top nav, where the four steps are authored — which server
action each one calls, and how values are wired between them. And **Request types**, where changing
the required approval count makes the gate respond immediately: configuration, not code.

### What is real and what is not

**Real** — the rules engine, the approval quorum, role checks, the stale-approval dismissal, the
status transition guards, the execution gate, and the run state machine that parks on a manual task
and resumes when someone signs it. These are the logic described in
[the specification](docs/specification.md), so the Execute button is genuinely blocked rather than
merely drawn greyed out.

**Simulated** — task execution. No server is contacted; a task "runs" on a timer, the fingerprint is a
stand-in hash rather than SHA-256, and no mail leaves your browser.

**Not present** — persistence, authentication, notifications, and timeouts. A run pauses on a manual
step and resumes by itself, but everything happens inside one browser tab.

### One deliberate rough edge

*Execute this task* on an individual task card stays clickable even when the gate is red, and tells
you the server refused. That is not a bug. It demonstrates that the gate lives on the server, not in
the button's `disabled` attribute — which is the single most important correction this design makes
to the original requirements document.

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
index.html                  requests, approvals and the execution engine
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

Hand-written HTML, CSS and vanilla JavaScript. The split is by ownership: the two `*.json.js` files
hold **data and no logic**, each editor owns its own model and screen, and `index.html` is only a
consumer of both catalogues.

`index.html` is organised as:

1. **CSS custom properties** — the full light palette on `:root`, redefined for dark under both
   `prefers-color-scheme` and `[data-theme="dark"]`.
2. **Reference data** — `USERS`, `STATUS_TRANSITIONS`.
3. **State** — `seed()` returns the whole demo state; `S` holds the live copy; `boot()` runs it once
   the data files have loaded.
4. **Rule engine** — `evaluateRule()` and `evaluateGate()`. These mirror the specification and are the
   part worth porting; everything else is throwaway.
5. **Run engine** — `driveRun()`, `completeWorkItem()`, `resolveBlocker()`: the cursor, the park on a
   manual step, and the resume when it closes.
6. **Render functions** — `viewInbox()`, `viewRequest()` and their panes, all returning HTML strings.
   `render()` redraws everything on any change.
7. **Events** — one delegated `click` handler plus `change` and `input`, dispatching on `data-act`.
   Each editor file registers its own handlers under its own attribute (`data-te`, `data-rt`,
   `data-er`), so the files stay separable.

The files load as **classic scripts, not modules** — `type="module"` and `fetch()` of a sibling
`.json` are both blocked over `file://`, and the prototype has to survive being emailed around and
opened from disk.
