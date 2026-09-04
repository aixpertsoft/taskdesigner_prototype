/* ===========================================================================
   Dialogs — every modal: completing a manual step, what-was-entered,
   blockers, the execution log, adding a task, creating a request.

   Part of the split prototype: classic scripts sharing one global scope, so
   this file may call anything its siblings declare — resolution happens at
   call time, after every file has loaded. index.html wires and boots.
   =========================================================================== */
"use strict";

/* ============================ dialogs ============================ */
function closeModal(){ $('#modal').innerHTML=''; }
function openModal(html){
  $('#modal').innerHTML = `<div class="scrim" data-scrim="1">${html}</div>`;
  const f = $('#modal input, #modal select, #modal button');
  if(f) f.focus();
}
/* Filling a placeholder slot — the ONLY way a requester extends a plan, and the
   menu holds PRECONFIGURED activities, never raw task types. Each entry was set
   up by the designer like a flow step, so one click adds it complete — there is
   no configuration form for the requester at all. */
function dlgAddTask(slotId){
  const r = req();
  const slot = r.taskItems.find(t=>t.id===slotId);
  if(!slot) return;
  const acts = (slot.possibleActivities||[]).filter(a=>TASK_DEFS[a.taskDefinition]);
  openModal(`<div class="dialog" role="dialog" aria-modal="true" aria-label="Add an activity">
    <div class="dhead"><h2>Add — ${esc(slot.label||'Additional steps')}</h2>
      <button class="iconbtn" data-act="close">${I.cross}</button></div>
    <div class="dbody">
      <p style="margin:0;color:var(--ink-3);font-size:13px">
        These activities were configured into the process by its designer — adding one is a single
        click, nothing to fill in. It changes the plan, so approvals will need to be given again.</p>
      <div class="tiles">
        ${acts.map(a=>{
          const d = TASK_DEFS[a.taskDefinition];
          const cfg = Object.entries(a.defaults||{}).filter(([,v])=>v!=='')
            .map(([k,v])=>`${k}: ${v}`).join(' · ');
          return `<button class="tile" data-act="fill-slot"
              data-activity="${esc(a.id)}" data-slot="${slot.id}">
            <span class="ti">${d.icon}</span><b>${esc(a.label||d.label)}</b>
            <small>${esc(d.desc)}</small>
            ${cfg?`<small class="mono" style="opacity:.75">${esc(cfg)}</small>`:''}
          </button>`;
        }).join('')}
      </div>
    </div>
  </div>`);
}

/* A blocked step: show what is missing, and collect it. The values arrive through
   the execution path, so they land outside the hash and the run's approvals hold. */
function dlgBlocker(workItemId){
  const r = req();
  const w = r.workItems.find(x=>x.id===workItemId);
  const fields = (w.needs||[])
    .map(path=>S.definition.dataParameters.find(p=>p.name===path))
    .filter(p=>p && p.owner==='EXECUTION');
  const frozen = (w.needs||[])
    .map(path=>S.definition.dataParameters.find(p=>p.name===path))
    .filter(p=>p && p.owner!=='EXECUTION');
  openModal(`<div class="dialog" role="dialog" aria-modal="true" aria-label="Blocked step">
    <div class="dhead">
      <span style="color:var(--warn)">${I.warn}</span>
      <h2>${esc(w.title)}</h2>
      <button class="iconbtn" data-act="close">${I.cross}</button>
    </div>
    <div class="dbody">
      <div class="ctxbox">
        <h4>Not satisfied</h4>
        ${w.unmet.map(u=>`<div class="ctxrow"><span>${esc(u.label)}</span>
          <span class="mono">${esc(u.reason)}</span></div>`).join('')}
      </div>
      ${fields.map(p=>`<div class="field">
        <label>${esc(p.label)} <span class="req">*</span></label>
        <input type="text" data-p="${p.name}" value="${esc(r.data[p.name]??'')}">
      </div>`).join('')}
      ${frozen.length?`<div class="task-err">${I.warn}<div>
        ${frozen.map(p=>esc(p.label)).join(', ')} — the approvals for this run cover
        ${frozen.length===1?'this value':'these values'}, so ${frozen.length===1?'it':'they'} cannot be
        changed mid-run. Cancel the run to edit ${frozen.length===1?'it':'them'}, then execute again.
      </div></div>`:''}
      <div style="font-size:12px;color:var(--ink-3);border-top:1px solid var(--border);padding-top:11px">
        What you supply here is recorded as execution output — attributed to you and in the log —
        so it does not disturb the approvals already given.
      </div>
    </div>
    <div class="dfoot">
      <button class="btn" data-act="close">Cancel</button>
      ${fields.length?`<button class="btn go" data-act="do-unblock" data-id="${w.id}">${I.check} Supply &amp; continue</button>`:''}
    </div>
  </div>`);
}
function dlgLog(taskId){
  const r = req();
  const t = r.taskItems.find(x=>x.id===taskId);
  const def = TASK_DEFS[t.def];
  const logs = r.logs.filter(l=>l.taskId===taskId).slice().reverse();
  openModal(`<div class="dialog wide" role="dialog" aria-modal="true" aria-label="Execution log">
    <div class="dhead"><h2>Execution log — ${esc(def.label)}</h2>
      <button class="iconbtn" data-act="close">${I.cross}</button></div>
    <div class="dbody">
      ${logs.length? logs.map(l=>`<div class="logrow">
        <div class="loghead">
          <span class="pill ${l.outcome==='SUCCEEDED'?'ok':l.outcome==='ROUTED'?'blue':'bad'}">${
            l.outcome==='SUCCEEDED'?'succeeded':l.outcome==='ROUTED'?'routed':'failed'}</span>
          <span>Attempt ${l.attempt}</span>
          <span class="mono">${esc(l.at)}</span>
          <span class="mono">${esc(USERS[l.by].name)}</span>
          ${l.onBehalfOf?`<span class="mono" style="color:var(--ink-3)">on behalf of ${esc(USERS[l.onBehalfOf].name)}</span>`:''}
          ${l.triggeredBy?`<span class="mono" style="color:var(--ink-3)">· triggered by ${esc(USERS[l.triggeredBy].name)}</span>`:''}
          <span class="mono" style="margin-left:auto">${l.ms} ms</span>
        </div>
        <div class="logbody">${esc(l.detail)}</div>
      </div>`).join('')
      : `<div class="empty">This task has not been run yet. Every attempt — successful or not — is
         recorded here, and that record is the audit trail.</div>`}
    </div>
    <div class="dfoot"><button class="btn" data-act="close">Close</button></div>
  </div>`);
}
/* What a person actually typed, after the fact.

   The same form, read-only. A work item keeps everything it collected; this just
   renders it back instead of leaving it buried in the log text. Only the most
   recent close is shown — earlier attempts stay on the record in the execution
   log and, for a decline, as the change request it raised. */
function lastSubmission(r,taskItemId){
  const closed = (r.workItems||[]).filter(w=>w.taskItemId===taskItemId && w.state!=='OPEN');
  return closed.length ? closed[closed.length-1] : null;
}
/* One line of what they typed, for the card — the first value that has any
   length, trimmed. Enough to recognise; the dialog has the rest. */
function submittedPreview(def,w){
  const who = USERS[w.completedBy] ? USERS[w.completedBy].name : 'someone';
  if(w.state==='REJECTED') return `${who} declined: ${w.rejectionReason||''}`;
  if(w.state==='CANCELLED') return `Cancelled with the run.`;
  const first = Object.values(w.result||{}).map(v=>String(v||'').trim()).find(v=>v);
  const verb = w.kind==='BLOCKER' ? 'supplied' : 'entered';
  if(!first) return `${who} closed this without entering anything.`;
  return `${who} ${verb}: “${first.length>70?first.slice(0,70)+'…':first}”`;
}
function fieldLabel(def,key){
  const rp = (def.resultParams||[]).find(p=>p.name===key);
  if(rp) return rp.label;
  const dp = (S.definition.dataParameters||[]).find(p=>p.name===key);
  return dp ? dp.label : key;
}
function dlgSubmission(taskItemId){
  const r = req();
  const t = r.taskItems.find(x=>x.id===taskItemId);
  const def = TASK_DEFS[t.def];
  const w = lastSubmission(r,taskItemId);
  const stateTone = {COMPLETED:'ok', REJECTED:'bad', CANCELLED:'neutral', EXPIRED:'warn'};

  openModal(`<div class="dialog" role="dialog" aria-modal="true" aria-label="What was entered">
    <div class="dhead">
      <span style="color:var(--accent)">${def.icon}</span>
      <h2>${esc(def.label)} — what was entered</h2>
      <button class="iconbtn" data-act="close">${I.cross}</button>
    </div>
    <div class="dbody">
      ${w?`
        <div class="subhead">
          <span class="pill ${stateTone[w.state]||'neutral'}">${esc(w.state.toLowerCase())}</span>
          <b>${esc(USERS[w.completedBy]?USERS[w.completedBy].name:'—')}</b>
          <span class="mono">${esc(w.completedAt||'')}</span>
          ${w.kind==='BLOCKER'?`<span class="pill neutral" style="margin-left:auto">blocker</span>`:''}
        </div>
        ${w.rejectionReason?`<div class="task-err">${I.warn}
          <div><b>Declined.</b> ${esc(w.rejectionReason)}</div></div>`:''}
        ${Object.keys(w.result||{}).length
          ? Object.entries(w.result).map(([k,v])=>`
              <div class="field">
                <label>${esc(fieldLabel(def,k))}</label>
                ${String(v||'').length>60
                  ? `<textarea readonly rows="4">${esc(v)}</textarea>`
                  : `<input type="text" readonly value="${esc(v??'')}">`}
              </div>`).join('')
          : `<div style="font-size:12.5px;color:var(--ink-3)">Closed without any values entered.</div>`}
        <div style="font-size:12px;color:var(--ink-3);border-top:1px solid var(--border);padding-top:11px">
          The most recent close. Earlier attempts are in the execution log.
        </div>`
        : `<div class="empty">Nobody has closed this step yet.</div>`}
    </div>
    <div class="dfoot"><button class="btn" data-act="close">Close</button></div>
  </div>`);
}

/* The completion form is generated from resultParams, exactly the way the task
   config form is generated from params. Above it sits what the signer is signing:
   whatever the preceding tasks handed forward. */
function dlgSign(workItemId){
  const r = req();
  const w = r.workItems.find(x=>x.id===workItemId);
  const t = r.taskItems.find(x=>x.id===w.taskItemId);
  const def = TASK_DEFS[t.def];
  /* One submit button, no decline path: what happens next is decided by the
     flow's transitions, routing on what the person entered. Saying "no" is
     data — approved unticked — not a different button. */
  const routes = (t.transitions||[]).filter(x=>x.when).map(x=>{
    const target = r.taskItems.find(y=>y.stepId===x.to);
    return `${describeTransition(x)} → ${target?itemLabel(target):x.to}`;
  });
  openModal(`<div class="dialog" role="dialog" aria-modal="true" aria-label="Complete this step">
    <div class="dhead">
      <span style="color:var(--accent)">${def.icon}</span>
      <h2>${esc(def.label)} — ${esc(w.title)}</h2>
      <button class="iconbtn" data-act="close">${I.cross}</button>
    </div>
    <div class="dbody">
      ${w.context.length? `<div class="ctxbox">
        <h4>From the request</h4>
        ${w.context.map(c=>
          `<div class="ctxrow"><span>${esc(c.label)}</span><span class="mono">${esc(c.value)}</span></div>`).join('')}
      </div>`:''}
      ${def.resultParams.map(p=>{
        if(p.type==='boolean') return `<div class="field">
          <label>${esc(p.label)} ${p.required?'<span class="req">*</span>':''}</label>
          <label class="switch"><input type="checkbox" data-p="${p.name}" data-bool="1">
            <span class="track"></span><span>Yes</span></label></div>`;
        if(p.type==='enum') return `<div class="field">
          <label>${esc(p.label)} ${p.required?'<span class="req">*</span>':''}</label>
          <select data-p="${p.name}">${(p.values||[]).map(o=>
            `<option>${esc(o)}</option>`).join('')}</select></div>`;
        return `<div class="field">
          <label>${esc(p.label)} ${p.required?'<span class="req">*</span>':''}</label>
          <input type="text" data-p="${p.name}" placeholder="${esc(p.placeholder||'')}"></div>`;
      }).join('')}
      <div style="font-size:12px;color:var(--ink-3);border-top:1px solid var(--border);padding-top:11px">
        Closing this work item lets <b>execution continue on its own</b> — under the system identity,
        on behalf of ${esc(USERS[r.requester].name)}.
        ${routes.length?`<div style="margin-top:6px">What happens next depends on what you enter:
          ${routes.map(x=>`<div class="mono" style="margin-top:2px">${esc(x)}</div>`).join('')}</div>`:''}
      </div>
    </div>
    <div class="dfoot">
      <button class="btn" data-act="close">Cancel</button>
      <button class="btn go" data-act="do-sign" data-id="${w.id}">${I.check} ${esc(def.completeLabel||'Complete')}</button>
    </div>
  </div>`);
}

function dlgNewRequest(){
  openModal(`<div class="dialog" role="dialog" aria-modal="true" aria-label="New task request">
    <div class="dhead"><h2>New task request</h2>
      <button class="iconbtn" data-act="close">${I.cross}</button></div>
    <div class="dbody">
      <div class="field"><label>Request type</label>
        <select id="nr-type"><option>${esc(S.definition.name)}</option></select>
        <span class="hint">Decides the approval rules, the statuses, and which tasks may be added.</span>
      </div>
      <div class="field"><label>Title <span class="req">*</span></label>
        <input type="text" id="nr-name" placeholder="e.g. Patch rack R14 uplinks"></div>
    </div>
    <div class="dfoot">
      <button class="btn" data-act="close">Cancel</button>
      <button class="btn primary" data-act="create-request">Create</button>
    </div>
  </div>`);
}

