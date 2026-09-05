/* ===========================================================================
   Request view — task cards, the conversation/data/history panes, and the
   execution bar.

   Part of the split prototype: classic scripts sharing one global scope, so
   this file may call anything its siblings declare — resolution happens at
   call time, after every file has loaded. index.html wires and boots.
   =========================================================================== */
"use strict";

/* ============================ render: request ============================ */
function viewRequest(){
  const r = req(); if(!r) return viewInbox();

  return `
  <div class="rq-head">
    <button class="backlink" data-act="back">${I.chevL} All task requests</button>
    <div class="rq-title">
      <span class="pill ${STATUS_TONE[requestStatus(r)]}">${requestStatus(r)}</span>
      <h1>${esc(r.name)}</h1>
    </div>
    <div class="rq-sub">
      <span class="mono">${r.id}</span><span>·</span>
      <span>${esc(S.definition.name)}</span><span>·</span>
      <span>opened by ${esc(USERS[r.requester].name)}</span><span>·</span>
      <span>${esc(r.createdAt)}</span>
    </div>
  </div>

  <div class="tabs" role="tablist">
    <button role="tab" aria-selected="${S.requestTab==='tasks'}" data-rtab="tasks">Tasks <span class="count">${r.taskItems.length}</span></button>
    <button role="tab" aria-selected="${S.requestTab==='talk'}"  data-rtab="talk">Conversation <span class="count">${r.comments.length}</span></button>
    <button role="tab" aria-selected="${S.requestTab==='data'}"  data-rtab="data">Data</button>
    <button role="tab" aria-selected="${S.requestTab==='hist'}"  data-rtab="hist">History <span class="count">${r.history.length}</span></button>
  </div>

  <div class="rq-body norail">
    <div>
      ${S.requestTab==='tasks' ? paneTasks(r)
       :S.requestTab==='talk'  ? paneTalk(r)
       :S.requestTab==='data'  ? paneData(r)
       :                         paneHist(r)}
    </div>
  </div>`;
}

function paneTasks(r){
  /* A run in flight freezes the plan: the hash it is executing must not move
     under it, or half a plan runs under terms nobody approved. The only way a
     requester extends a plan is a placeholder slot the designer put there. */
  const locked = requestStatus(r)==='COMPLETED'||runInFlight(r);
  return `<div class="tasklist">
    ${r.taskItems.length
      ? r.taskItems.map(t=>t.kind==='PLACEHOLDER' ? slotCard(r,t,locked) : taskCard(r,t,locked)).join('')
      : `<div class="empty">No tasks yet. A request needs at least one task before it can be executed.</div>`}
  </div>
  ${gateBox(r)}`;
}

/* A placeholder slot: the designed extension point, rendered as the Add button
   the designer put into the process. Its fills appear as ordinary task cards,
   marked "added", directly after it. */
function slotCard(r,t,locked){
  const eligible = (t.possibleActivities||[]).filter(a=>TASK_DEFS[a.taskDefinition]);
  return `<article class="task slot">
    <div class="task-top" style="align-items:center">
      <div class="task-ico">${I.plus}</div>
      <div class="task-main">
        <div class="task-name"><strong>${esc(t.label||'Additional steps')}</strong>
          <span class="pill neutral">optional</span></div>
        <div class="task-note">A slot in the process — ${eligible.length
          ? `may hold: ${eligible.map(a=>esc(a.label||TASK_DEFS[a.taskDefinition].label)).join(', ')}`
          : 'no activities configured'}. Empty, the run passes straight through.</div>
      </div>
      <div class="task-acts">
        <button class="btn sm" data-act="add-task" data-slot="${t.id}"
          ${locked||!eligible.length?'disabled':''}
          title="${locked?'The plan is frozen while a run is in progress':'Add a preconfigured activity into this slot'}">
          ${I.plus} Add task</button>
      </div>
    </div>
  </article>`;
}

function taskCard(r,t,locked){
  const def = TASK_DEFS[t.def];
  const tone = {NOT_RUN:'neutral',RUNNING:'blue',WAITING:'warn',SUCCEEDED:'ok',FAILED:'bad',
                }[t.status]||'neutral';
  const label= {NOT_RUN:'not run',RUNNING:'running…',WAITING:'waiting for a person',
                SUCCEEDED:'succeeded',FAILED:'failed'}[t.status]||t.status.toLowerCase();
  const taskLogs = r.logs.filter(l=>l.taskId===t.id);
  const last = taskLogs.slice(-1)[0];
  const logCount = taskLogs.length;
  const open = (r.workItems||[]).find(x=>x.taskItemId===t.id && x.state==='OPEN');
  const w = open && open.kind!=='BLOCKER' ? open : null;
  const blocker = open && open.kind==='BLOCKER' ? open : null;
  const canSign = w && w.roles.some(ro=>hasRole(S.me,ro));
  const canClear = blocker && blocker.roles.some(ro=>hasRole(S.me,ro));
  const submitted = lastSubmission(r,t.id);
  return `<article class="task ${t.status==='FAILED'?'failed':''} ${t.status==='WAITING'?'waiting':''}">
    <div class="task-top">
      <div class="task-ico">${def.icon}</div>
      <div class="task-main">
        <div class="task-name">
          <strong>${esc(def.label)}</strong>
          ${t.fromSlot?`<span class="pill warn" title="Added to this request by hand, into a slot the process provides — not part of the standard ${esc(S.definition.name)} flow">added</span>`:''}
          ${def.manual?`<span class="pill neutral" title="No server executor — a person closes this one">manual</span>`:''}
          <span class="pill ${tone}">${t.status==='RUNNING'?I.spin:''}${label}</span>
          ${t.attempts>1?`<span class="pill neutral">attempt ${t.attempts}</span>`:''}
        </div>
        <div class="task-cfg">
          ${taskInputs(def).map(p=>{
            const b=(t.inputBindings||{})[p.name];
            return b&&b.kind==='LITERAL'&&b.value
              ? `<span class="kv">${esc(p.label)} <b>${esc(b.value)}</b></span>` : '';
          }).join('')}
        </div>
        ${last && t.status==='SUCCEEDED' ? `<div class="task-note">ran ${esc(last.at)} by ${esc(USERS[last.by].name)}${
          last.onBehalfOf?` on behalf of ${esc(USERS[last.onBehalfOf].name)}`:''}</div>`:''}
        ${submitted?`<div class="task-sub">
            <span class="si">${I.eye}</span>
            <div style="flex:1">${esc(submittedPreview(def,submitted))}</div>
            <button class="btn sm ghost" data-act="show-submission" data-id="${t.id}">View</button>
          </div>`:''}
        ${w ? `<div class="task-wait">
            <span class="wi">${I.pause}</span>
            <div style="flex:1">
              <div><b>Execution is parked here.</b> Waiting for ${esc(w.roles.join(' or '))} —
                ${eligibleFor(w).map(u=>esc(USERS[u].name)).join(', ')}${w.dueAt?` · due ${esc(w.dueAt)}`:''}</div>
              <div style="margin-top:2px;opacity:.85">Work item <span class="mono">${esc(w.id)}</span> · the run resumes the moment it closes.</div>
            </div>
            ${canSign?`<button class="btn sm go" data-act="sign" data-id="${w.id}">${I.pen} ${esc(def.completeLabel||'Complete')}</button>`
                     :`<span class="pill neutral">not yours to do</span>`}
          </div>`:''}
        ${blocker?`<div class="task-wait">
            <span class="wi">${I.warn}</span>
            <div style="flex:1">
              <div><b>Blocked before this step could start.</b></div>
              ${blocker.unmet.map(u=>`<div style="margin-top:2px">${esc(u.label)} — ${esc(u.reason)}</div>`).join('')}
            </div>
            ${canClear?`<button class="btn sm go" data-act="sign" data-id="${blocker.id}">Supply &amp; continue</button>`
                      :`<span class="pill neutral">not yours to clear</span>`}
          </div>`:''}
        ${t.status==='FAILED'? `<div class="task-err">${I.warn}<div>
            <div><b>Execution failed.</b> ${esc(t.error||'')}</div>
            ${t.errorSource?`<div class="mono" style="margin-top:3px;opacity:.85">${esc(t.errorSource)}</div>`:''}
          </div></div>`:''}
      </div>
      <div class="task-acts">
        <button class="btn sm ico" data-act="show-log" data-id="${t.id}"
          title="Execution log" aria-label="Execution log">${I.log}${logCount?`<span class="n">${logCount}</span>`:''}</button>
        ${t.fromSlot?`<button class="btn sm ico" data-act="del-task" data-id="${t.id}"
          ${locked?'disabled':''}
          title="Remove this added task from its slot"
          aria-label="Remove this task">${I.trash}</button>`
        :''}
      </div>
    </div>
  </article>`;
}

function paneData(r){
  const frozen = runInFlight(r);
  return `<div class="card">
    ${frozen?`<div class="databar">${I.pause} A run is in progress, so your fields are frozen
      until it ends. Values a blocked step needs are supplied through the work item.</div>`:''}
    <div class="formgrid">
    ${S.definition.dataParameters.map(p=>{
      const v = r.data[p.name];
      /* EXECUTION fields are written by a task through the output wiring — read-only
         here, or a requester could forge what the server produced. AUTHOR fields
         freeze while a run is in flight, so the plan's inputs stay stable under it. */
      const written = p.owner==='EXECUTION';
      const disabled = written || frozen;
      const note = written ? `Written by a task — not editable here.`
                 : frozen  ? `Frozen while the run is in progress.` : '';
      if(p.type==='boolean'){
        return `<div class="field">
          <label>${esc(p.label)}${written?' <span class="pill neutral">written by a task</span>':''}</label>
          <label class="switch">
            <input type="checkbox" data-act="data-bool" data-name="${p.name}" ${v?'checked':''}
              ${disabled?'disabled':''}>
            <span class="track"></span>
            <span>${v?'Yes':'No'}</span>
          </label>
          ${note?`<span class="hint">${esc(note)}</span>`
                :`<span class="hint">A transition can route on this — like skipping the
                   approval step.</span>`}
        </div>`;
      }
      return `<div class="field">
        <label>${esc(p.label)}${written?' <span class="pill neutral">written by a task</span>':''}</label>
        <input type="text" value="${esc(v??'')}" data-act="data-text" data-name="${p.name}"
          ${disabled?'disabled':''}>
        ${note?`<span class="hint">${esc(note)}</span>`:''}
      </div>`;
    }).join('')}
    </div>
  </div>`;
}

function paneTalk(r){
  return `<div class="card"><div class="thread">
    ${r.comments.map(m=>`<div class="msg">
      <div class="av">${USERS[m.user].initials}</div>
      <div class="bubble">
        <div class="bhead">
          <b>${esc(USERS[m.user].name)}</b>
          <span>commented</span>
          <span>·</span><span class="mono">${esc(m.at)}</span>
        </div>
        <div class="btext">${esc(m.text)}</div>
      </div>
    </div>`).join('')}
    <div class="composer">
      <div class="fake-toolbar" aria-hidden="true">
        <span style="font-weight:700">B</span><span style="font-style:italic">I</span>
        <span style="text-decoration:underline">U</span><span>•</span><span>1.</span><span>&lt;/&gt;</span>
      </div>
      <textarea id="composer" placeholder="Add a comment…"></textarea>
      <div class="crow">
        <button class="btn sm primary" data-act="post-comment">Comment</button>
      </div>
    </div>
  </div></div>`;
}

function paneHist(r){
  return `<div class="card"><div class="hist">
    ${[...r.history].reverse().map(h=>`<div class="hevent">
      <span class="hdot"></span>
      <span class="ht"><b>${esc(USERS[h.who].name)}</b> ${esc(h.text)}</span>
      <span class="hw">${esc(h.at)}</span>
    </div>`).join('')}
  </div></div>`;
}

function gateBox(r){
  const running = r.taskItems.some(t=>t.status==='RUNNING');
  const waiting = r.run && r.run.state==='WAITING' ? openWorkItems(r)[0] : null;
  const allDone = requestStatus(r)==='COMPLETED';
  const canRun  = r.taskItems.length>0 && !runInFlight(r) && !allDone;

  /* The run-state bar. There is deliberately no approval gate any more: WHO
     may execute is a user-permission question in the real system, and
     approval, where a process needs one, is an activity inside the flow. What
     still stops a run is the process itself — manual steps, and required
     inputs that resolve to nothing. */
  const head = waiting
    ? `<span class="gi pausing">${I.pause}</span>
       <span>${esc(waiting.kind==='BLOCKER' ? 'Blocked — '+waiting.title : 'Waiting — '+waiting.title)} <span class="gsub">— ${esc(eligibleFor(waiting).map(u=>USERS[u].name).join(' or '))}${
         waiting.dueAt?`, due ${esc(waiting.dueAt)}`:''}</span></span>`
    : allDone
    ? `<span class="gi">${I.check}</span><span>All tasks completed <span class="gsub">— nothing left to run</span></span>`
    : r.taskItems.length
    ? `<span class="gi">${I.check}</span><span>Ready to execute <span class="gsub">— the run pauses wherever the process needs a person</span></span>`
    : `<span class="gi">${I.warn}</span><span>No tasks <span class="gsub">— a request needs at least one task to run</span></span>`;

  const action = waiting
    ? `<button class="btn ghost" data-act="cancel-run" ${mayCancel(r)?'':'disabled'}
         title="${mayCancel(r)?'Abandon the run and unlock the request for editing'
                             :'Only the requester or an administrator may cancel a run'}">Cancel run</button>`
    : `<button class="btn ${canRun?'go':''}" data-act="run-all"
         ${canRun&&!running?'':'disabled'}
         title="${canRun?'Run every task that has not succeeded yet':'Nothing to run'}">
         ${running?I.spin+' Running…':I.play+' Execute all tasks'}
       </button>`;

  return `<section class="gate ${waiting?'parked':canRun?'open':''}">
    <div class="gate-bar">
      <div class="gate-toggle" style="cursor:default">${head}</div>
      ${action}
    </div>
  </section>`;
}
