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

The prototype is a single self-contained HTML file with no build step and no dependencies.

**Simplest — just open it:**

```
index.html
```

Double-click it, or drag it into a browser. That is all it needs.

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
| **M. Browett** | NetOps | No — opened TR-1042, and you cannot approve your own request |
| **A. Schmidt** | Administrator, NetOps | Yes |
| **K. Weber** | Administrator | Yes |
| **J. Novak** | Viewer | No — holds no approving role |

### Three things worth trying

**1. Watch the gate unlock.** Open `TR-1042`. The box below the tasks lists every rule and why it is
failing. Switch to A. Schmidt and approve, then K. Weber and approve. Resolve K. Weber's change
request in the right rail, then tick *Change window confirmed* on the **Data** tab. The gate turns
green and Execute unlocks.

**2. Watch an approval get dismissed.** With the gate green, edit any task's configuration
(**Configure** on a task card) and change a value. Every approval given so far is dismissed, the rail
marks them, and the gate closes again. This is the approve-then-edit-then-execute hole being closed —
the same thing GitHub does when it dismisses stale reviews.

**3. Watch a task fail, then fix it.** Execute the tasks. The second one targets `PP-3 / Port 24`,
which is already carrying a cable, so it fails with a business-logic error — the failure badge and the
execution log are both real. Change its target port to something free and re-run. Note that the edit
dismisses your approvals, so you have to get them again first. That loop exercises the whole
integrity model.

Also worth a look: **Request types** in the top nav. Change the required approval count from 2 to 1,
or turn off *exclude the requester*, and the gate on TR-1042 responds immediately — the point being
that this is configuration, not code.

### What is real and what is not

**Real** — the rules engine, the approval quorum, role checks, the stale-approval dismissal, the
status transition guards, and the execution gate. These are the logic described in
[the specification](docs/specification.md), so the Execute button is genuinely blocked rather than
merely drawn greyed out.

**Simulated** — task execution. No server is contacted; a task "runs" on a timer and its outcome is
decided by a hard-coded list of occupied ports.

**Not present** — persistence, authentication, notifications, and anything asynchronous.

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
index.html                  the prototype — one self-contained file, no build
docs/overview.md            feature overview and design decisions
docs/specification.md       full technical specification
docs/prototype-guide.md     screen-by-screen walkthrough
```

## Editing the prototype

`index.html` is hand-written HTML, CSS and vanilla JavaScript in one file. It is organised as:

1. **CSS custom properties** — the full light palette on `:root`, redefined for dark under both
   `prefers-color-scheme` and `[data-theme="dark"]`.
2. **Reference data** — `USERS`, `TASK_DEFS`, `STATUS_TRANSITIONS`, `OCCUPIED_PORTS`.
3. **State** — `seed()` returns the whole demo state; `S` holds the live copy.
4. **Rule engine** — `evaluateRule()` and `evaluateGate()`. These mirror the specification and are the
   part worth porting; everything else is throwaway.
5. **Render functions** — `viewInbox()`, `viewRequest()`, `viewDefinition()` and their panes, all
   returning HTML strings. `render()` redraws everything on any change.
6. **Events** — one delegated `click` handler plus `change` and `input`, dispatching on `data-act`.

There is no framework and no bundler on purpose: the file has to survive being emailed around and
opened from disk.
