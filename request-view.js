/* ===========================================================================
   Request view — task cards, the conversation/data/history panes, the
   approvals rail and the execution gate bar.

   Part of the split prototype: classic scripts sharing one global scope, so
   this file may call anything its siblings declare — resolution happens at
   call time, after every file has loaded. index.html wires and boots.
   =========================================================================== */
"use strict";

/* ============================ render: request ============================ */
function viewRequest(){
  const r = req(); if(!r) return viewInbox();
  const gate = evaluateGate(r);
  const openCr = r.changeRequests.filter(c=>!c.resolved).length;

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
    <button role="tab" aria-selected="${S.requestTab==='talk'}"  data-rtab="talk">Conversation <span class="count">${r.comments.length+r.changeRequests.length}</span>
      ${openCr?`<span class="pill warn" style="margin-left:5px">${openCr} to resolve</span>`:''}</button>
    <button role="tab" aria-selected="${S.requestTab==='data'}"  data-rtab="data">Data</button>
    <button role="tab" aria-selected="${S.requestTab==='hist'}"  data-rtab="hist">History <span class="count">${r.history.length}</span></button>
  </div>

  <div class="rq-body ${requiresApprovals()?"":"norail"}">
    <div>
      ${S.requestTab==='tasks' ? paneTasks(r,gate)
       :S.requestTab==='talk'  ? paneTalk(r)
       :S.requestTab==='data'  ? paneData(r)
       :                         paneHist(r)}
    </div>
    ${requiresApprovals()?`<aside class="rail">${panelApprovals(r,gate)}</aside>`:''}
  </div>`;
}

function paneTasks(r,gate){
  /* A run in flight freezes the plan: the hash it is executing must not move
     under it, or half a plan runs under terms nobody approved. The only way a
     requester extends a plan is a placeholder slot the designer put there. */
  const locked = requestStatus(r)==='COMPLETED'||runInFlight(r);
  return `<div class="tasklist">
    ${r.taskItems.length
      ? r.taskItems.map(t=>t.kind==='PLACEHOLDER' ? slotCard(r,t,locked) : taskCard(r,t,locked)).join('')
      : `<div class="empty">No tasks yet. A request needs at least one task before it can be executed.</div>`}
  </div>
  ${gateBox(r,gate)}`;
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
          ${def.params.filter(p=>t.config[p.name]).map(p=>
            `<span class="kv">${esc(p.label)} <b>${esc(t.config[p.name])}</b></span>`).join('')}
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
    ${frozen?`<div class="databar">${I.pause} A run is in progress, so the fields it was approved
      against are frozen. Values a blocked step needs are supplied through the work item.</div>`:''}
    <div class="formgrid">
    ${S.definition.dataParameters.map(p=>{
      const v = r.data[p.name];
      /* EXECUTION fields are written by a task's output mapping and sit outside the
         hash. AUTHOR fields are inside it, so they freeze while a run holds it. */
      const written = p.owner==='EXECUTION';
      const disabled = written || frozen;
      const note = written ? `Written by a task — not editable here.`
                 : frozen  ? `Frozen: the approvals for this run cover this value.` : '';
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
                :`<span class="hint">A task's skip rule reads this — and it is inside the hash,
                   so changing it dismisses approvals.</span>`}
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
  const items = [...r.comments.map(c=>({...c,kind:'comment'})),
                 ...r.changeRequests.map(c=>({...c,kind:'cr'}))]
                .sort((a,b)=>a.at.localeCompare(b.at));
  return `<div class="card"><div class="thread">
    ${items.map(m=>`<div class="msg ${m.kind==='cr'?'is-cr':''} ${m.resolved?'done':''}">
      <div class="av">${USERS[m.user].initials}</div>
      <div class="bubble">
        <div class="bhead">
          <b>${esc(USERS[m.user].name)}</b>
          <span>${m.kind==='cr'?'requested a change':'commented'}</span>
          <span>·</span><span class="mono">${esc(m.at)}</span>
          ${m.kind==='cr'?`
            <span class="pill ${m.resolved?'ok':'warn'}" style="margin-left:auto">${m.resolved?'resolved':'open'}</span>
            <button class="btn sm ghost" data-act="toggle-cr" data-id="${m.id}"
              title="${m.resolved?'Reopen this change request':'Mark this change request resolved'}">
              ${m.resolved?'Reopen':I.check+' Resolve'}</button>`:''}
        </div>
        <div class="btext">${esc(m.text)}</div>
      </div>
    </div>`).join('')}
    <div class="composer">
      <div class="fake-toolbar" aria-hidden="true">
        <span style="font-weight:700">B</span><span style="font-style:italic">I</span>
        <span style="text-decoration:underline">U</span><span>•</span><span>1.</span><span>&lt;/&gt;</span>
      </div>
      <textarea id="composer" placeholder="Add a comment, or raise a change request…"></textarea>
      <div class="crow">
        <button class="btn sm" data-act="post-cr">Request changes</button>
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

function panelApprovals(r,gate){
  const hash = gate.hash;
  const rule = S.definition.executionRules.find(x=>x.kind==='approvals');
  const good = r.approvals.filter(a=>a.decision==='APPROVED'&&a.hash===hash&&
    (!rule||!rule.roles.length||rule.roles.some(ro=>hasRole(a.user,ro)))&&
    (!rule||!rule.excludeRequester||a.user!==r.requester));
  const mine = r.approvals.find(a=>a.user===S.me);
  const isRequester = r.requester===S.me;
  const canApprove = !isRequester && (!rule||!rule.roles.length||rule.roles.some(ro=>hasRole(S.me,ro)))
                     && requestStatus(r)==='OPEN';

  const rows = USER_ORDER.filter(u=>u!==r.requester).map(u=>{
    const a = r.approvals.find(x=>x.user===u);
    const stale = a && a.hash!==hash;
    const eligible = !rule||!rule.roles.length||rule.roles.some(ro=>hasRole(u,ro));
    let note = eligible ? USERS[u].roles.join(', ') : `${USERS[u].roles.join(', ')} — cannot approve this type`;
    if(a) note = stale ? 'dismissed — a task was edited' : (a.decision==='APPROVED'?`approved ${a.at}`:`rejected ${a.at}`);
    return `<div class="approver ${a&&!stale&&a.decision==='APPROVED'?'did':''} ${stale?'stale':''}">
      <span class="av">${a&&!stale?(a.decision==='APPROVED'?I.check:I.cross):USERS[u].initials}</span>
      <span class="who">${esc(USERS[u].name)}<small>${esc(note)}</small></span>
    </div>`;
  }).join('');

  return `<section class="panel">
    <div class="panel-head">
      <h3>Approvals</h3>
      <span class="pill ${rule&&good.length>=rule.min?'ok':'neutral'}">${good.length} of ${rule?rule.min:0}</span>
    </div>
    <div class="panel-body">
      ${rows}
      <div class="approver" style="opacity:.65">
        <span class="av">${USERS[r.requester].initials}</span>
        <span class="who">${esc(USERS[r.requester].name)}<small>requester — cannot approve their own</small></span>
      </div>
      ${canApprove
        ? (mine && mine.hash===hash
            ? `<button class="btn sm" data-act="unapprove" style="width:100%;justify-content:center">Withdraw my ${mine.decision==='APPROVED'?'approval':'rejection'}</button>`
            : `<div style="display:flex;gap:6px">
                 <button class="btn sm go" data-act="approve" style="flex:1;justify-content:center">${I.check} Approve</button>
                 <button class="btn sm" data-act="reject" style="justify-content:center">Reject</button>
               </div>`)
        : `<div class="hint" style="font-size:11.5px;color:var(--ink-3)">
             ${isRequester?'You opened this request, so you cannot approve it.'
               : requestStatus(r)!=='OPEN' ? 'Approvals are closed — the work is done.'
               : `${esc(me().name)} does not hold a role that may approve this request type.`}
           </div>`}
    </div>
  </section>`;
}


function gateBox(r,gate){
  const running = r.taskItems.some(t=>t.status==='RUNNING');
  const checks = [
    ...(gate.noTasks?[{label:'At least one task', satisfied:false, reason:'this request has none yet'}]:[]),
    ...gate.rules,
  ];
  const todo = checks.filter(x=>!x.satisfied).length;
  const waiting = r.run && r.run.state==='WAITING' ? openWorkItems(r)[0] : null;
  const allDone = r.taskItems.length>0 && r.taskItems.every(t=>t.status==='SUCCEEDED');

  /* Three states share this bar: a run parked on a person, a run working,
     and no run at all — where the gate decides whether one may start. */
  const head = waiting
    ? `<span class="gi pausing">${I.pause}</span>
       <span>Waiting for a signature <span class="gsub">— ${esc(eligibleFor(waiting).map(u=>USERS[u].name).join(' or '))}${
         waiting.dueAt?`, due ${esc(waiting.dueAt)}`:''}</span></span>`
    : allDone
    ? `<span class="gi">${I.check}</span><span>All tasks completed <span class="gsub">— nothing left to run</span></span>`
    : gate.canExecute
    ? `<span class="gi">${I.check}</span><span>Ready to execute <span class="gsub">— all ${checks.length} checks passed</span></span>`
    : `<span class="gi">${I.warn}</span><span>${todo} thing${todo===1?'':'s'} still ${todo===1?'needs':'need'} doing <span class="gsub">— before this request may run</span></span>`;

  const action = waiting
    ? `<button class="btn ghost" data-act="cancel-run" ${mayCancel(r)?'':'disabled'}
         title="${mayCancel(r)?'Abandon the run and unlock the request for editing'
                             :'Only the requester or an administrator may cancel a run'}">Cancel run</button>`
    : `<button class="btn ${gate.canExecute&&!allDone?'go':''}" data-act="run-all"
         ${gate.canExecute&&!running&&!allDone&&!runInFlight(r)?'':'disabled'}
         title="${gate.canExecute?'Run every task that has not succeeded yet':'Blocked until every check passes'}">
         ${running?I.spin+' Running…':I.play+' Execute all tasks'}
       </button>`;

  return `<section class="gate ${waiting?'parked':gate.canExecute?'open':''}">
    <div class="gate-bar">
      <button class="gate-toggle" data-act="toggle-gate" aria-expanded="${S.gateOpen}" aria-controls="gate-detail">
        ${head}
        <span class="chev">${I.chevD}</span>
      </button>
      ${action}
    </div>
    ${S.gateOpen?`<div class="gate-detail" id="gate-detail">
      <div class="gate-rules">
        ${checks.map(x=>`<div class="grule ${x.satisfied?'pass':'fail'}">
          <span class="gi">${x.satisfied?I.check:I.cross}</span>
          <span class="gt">${esc(x.label)}<div class="gr">${esc(x.reason)}</div></span>
        </div>`).join('')}
      </div>
      <div class="gate-foot">
        <span class="hash" title="A fingerprint of every task and its settings. Edit a task and it changes — which is what dismisses approvals given for the old one.">fingerprint ${gate.hash}</span>
        ${r.run?`<span class="hash" style="margin-left:12px"
          title="A run is bound to the fingerprint it started on, and freezes the plan until it ends.">run ${esc(r.run.id)} · ${esc(r.run.state.toLowerCase())} · step ${Math.min(r.run.cursor+1,r.taskItems.length)} of ${r.taskItems.length} · started by ${esc(USERS[r.run.startedBy].name)}</span>`:''}
      </div>
    </div>`:''}
  </section>`;
}


