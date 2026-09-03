/* ===========================================================================
   Run engine — execution and every mutation: approvals, the cursor walk,
   parking on work items and blockers, resume, decline, cancel.

   Part of the split prototype: classic scripts sharing one global scope, so
   this file may call anything its siblings declare — resolution happens at
   call time, after every file has loaded. index.html wires and boots.
   =========================================================================== */
"use strict";

/* ============================ mutations ============================ */
function note(r,text,who){ r.history.push({at:stamp(),who:who||S.me,text}); }

function approve(decision){
  const r=req(); const hash=taskConfigHash(r);
  r.approvals = r.approvals.filter(a=>a.user!==S.me);
  r.approvals.push({id:'a'+(++S.seq), user:S.me, decision, at:stamp(), hash});
  note(r, decision==='APPROVED'?'approved this request':'rejected this request');
  r.version++;
  render(); toast(decision==='APPROVED'?'Approved':'Rejected');
}
function unapprove(){
  const r=req();
  r.approvals = r.approvals.filter(a=>a.user!==S.me);
  note(r,'withdrew their review'); r.version++;
  render(); toast('Withdrawn');
}
/* ---------------------------------------------------------------
   Execution runs.

   A run walks the task list with a cursor. An automatic task is
   dispatched to its executor; a manual task creates a work item and
   the run parks itself until a human closes it. Completing the work
   item resumes the same run — there is no "continue" button, because
   in every engine that does this well the completion *is* the resume.
   --------------------------------------------------------------- */

/* One task item, dispatched.

   Nothing here knows what the task *is* — it resolves the definition's input
   bindings, calls the named server action, and stores whatever the action
   returned according to the output mappings. All four helpers live in
   task-editor.js, which owns the definition model. Returns true on success. */
async function runOneTask(r,t,actor){
  const d = TASK_DEFS[t.def];
  t.status='RUNNING'; render();
  await sleep(520);
  t.attempts++;

  const inputs = resolveInputs(d,t,r);
  const call   = renderResolvedCall(d,t,r);

  if(actionFails(d,inputs)){
    const f = failureFor(d,inputs);
    t.status='FAILED'; t.error=f.message; t.errorSource=f.source;
    r.logs.push({taskId:t.id, attempt:t.attempts, at:stamp(), outcome:'FAILED', ms:1380, ...actor,
      detail:`${call}\nBusinessLogicError: ${f.message}\n${f.trace}`});
    note(r,`ran ${d.label} — failed`, actor.by);
    render();
    return false;
  }

  const produced = runServerAction(d, inputs, r);
  const stored   = applyOutputs(d, produced, r);
  t.status='SUCCEEDED'; t.error=null;
  t.outputs = Object.keys(produced).length ? produced : null;
  r.logs.push({taskId:t.id, attempt:t.attempts, at:stamp(), outcome:'SUCCEEDED', ms:410, ...actor,
    detail:`${call}\n${d.label} completed — ${taskSummary(d,t.config)}`
         + (t.outputs?`\nreturned:\n`+Object.entries(t.outputs).map(([k,v])=>`  ${k}: ${v}`).join('\n'):'')
         + (Object.keys(stored).length?`\nstored on the request:\n`
             +Object.entries(stored).map(([k,v])=>`  request.${k} = ${v}`).join('\n'):'')});
  note(r,`ran ${d.label} — succeeded`, actor.by);
  render();
  return true;
}

/* Everything a preceding task handed forward — the payload a signer is shown. */
function priorOutputs(r,upTo){
  return r.taskItems.slice(0,upTo)
    .filter(t=>t.outputs)
    .map(t=>({label:TASK_DEFS[t.def].label, outputs:t.outputs}));
}

function startRun(){
  const r=req();
  const gate=evaluateGate(r);
  /* The server re-evaluates the gate; the button state is only a hint. */
  if(!gate.canExecute){
    S.gateOpen=true; render();
    toast(`The server refused: ${gateRefusal(r,gate)}`); return;
  }
  if(runInFlight(r)){ toast('A run is already in progress'); return; }
  r.run = {id:'run'+(++S.seq), state:'RUNNING', cursor:0, hash:gate.hash,
           startedBy:S.me, startedAt:stamp(), waitingOn:null, resumed:false, triggeredBy:null};
  note(r,'started an execution run');
  driveRun(r);
}

async function driveRun(r){
  const run=r.run; if(!run) return;
  run.state='RUNNING'; render();
  while(run.cursor < r.taskItems.length){
    const t = r.taskItems[run.cursor];
    if(t.status==='SUCCEEDED'||t.status==='SKIPPED'){ run.cursor++; continue; }
    const d = TASK_DEFS[t.def];

    /* Skip: decided once, when the cursor arrives. The run carries straight on —
       nothing waits, and the step is recorded as skipped rather than done. */
    const skip = (t.skipWhen||[]).filter(rule=>evaluateRule(rule,r).satisfied);
    if(skip.length){
      t.status='SKIPPED'; t.skipReason = skip.map(x=>evaluateRule(x,r).label).join('; ');
      r.logs.push({taskId:t.id, attempt:t.attempts, at:stamp(), outcome:'SKIPPED', ms:0,
        by: run.resumed?'system':run.startedBy,
        detail:`Skipped — ${t.skipReason}.`});
      note(r,`skipped ${d.label}`, run.resumed?'system':S.me);
      run.cursor++; render(); continue;
    }

    /* Precondition: unlike a gate rule, this cannot be checked before the run
       starts, because the value it needs may be produced by an earlier step.
       Two sources feed it: the step's declared `requires` rules, and — with no
       configuration at all — any REQUIRED input of the action that resolves to
       nothing. The action's own contract says what it cannot run without. */
    const unmetRules = (t.requires||[]).map(rule=>evaluateRule(rule,r)).filter(x=>!x.satisfied);
    const missing = d.manual ? [] : missingInputs(d,t,r);
    if(unmetRules.length || missing.length){
      const unmet = [
        ...unmetRules.map(x=>({label:x.label, reason:x.reason})),
        ...missing.map(m=>({label:`Required input "${m.target}" has no value`,
                            reason:describeSource(m.source)})),
      ];
      const needs = [...new Set([
        ...(t.requires||[]).filter(rule=>!evaluateRule(rule,r).satisfied).map(rule=>rule.path),
        ...missing.filter(m=>m.source&&m.source.kind==='REQUEST_DATA').map(m=>m.source.path),
      ])];
      const w = {id:'wi'+(++S.seq), runId:run.id, taskItemId:t.id, kind:'BLOCKER',
        title:`${d.label} cannot start`, roles:['Administrator','NetOps'],
        dueAt:null, state:'OPEN', createdAt:stamp(),
        unmet, needs,
        context:priorOutputs(r,run.cursor), result:null};
      r.workItems.push(w);
      t.status='WAITING';
      run.state='WAITING'; run.waitingOn=w.id;
      note(r,`execution blocked before ${d.label} — ${unmet.map(x=>x.label).join('; ')}`,
        run.resumed?'system':S.me);
      render();
      toast(`Blocked — ${unmet[0].label}`);
      return;
    }

    if(d.manual){
      /* Who may act comes from the step's runtimeConfig, declared by the
         administrator — not from a config field the requester could edit. An
         empty list falls back to Administrator, so no step can park where
         nobody may ever close it. */
      const who = (t.assignedRoles&&t.assignedRoles.length) ? t.assignedRoles : ['Administrator'];
      const w = {id:'wi'+(++S.seq), runId:run.id, taskItemId:t.id, kind:'TASK',
        title:d.label, roles:who,
        dueAt:t.dueBy||null, state:'OPEN', createdAt:stamp(),
        context:priorOutputs(r,run.cursor), result:null};
      r.workItems.push(w);
      t.status='WAITING';
      run.state='WAITING'; run.waitingOn=w.id;
      note(r,`execution paused — waiting for a ${d.label.toLowerCase()}`, run.resumed?'system':S.me);
      render();
      toast(`Paused — ${d.label} is waiting for ${who.join(' or ')}`);
      return;
    }

    /* After a resume nobody is holding the request open, so the run continues
       under the system identity, on behalf of the requester. */
    const actor = run.resumed
      ? {by:'system', onBehalfOf:r.requester, triggeredBy:run.triggeredBy}
      : {by:run.startedBy};
    const ok = await runOneTask(r,t,actor);
    if(!ok && S.definition.onError==='STOP'){
      run.state='FAILED'; run.finishedAt=stamp();
      render(); toast('Run stopped after a failure — remaining tasks left untouched');
      return;
    }
    run.cursor++;
  }
  run.state = r.taskItems.every(t=>t.status==='SUCCEEDED'||t.status==='SKIPPED')
    ? 'COMPLETED' : 'FAILED';
  run.finishedAt=stamp();
  render();
  toast(run.state==='COMPLETED'?'All tasks completed':'Run finished with failures');
}

/* Resolving a blocker: the missing values are supplied through the work item, not
   by editing the Data tab. They are execution-written, so they sit outside the
   hash and the approvals given for this run survive — and the audit trail records
   who supplied them. If nothing satisfies the rule, the run stays parked. */
async function resolveBlocker(id, values){
  const r=req();
  const w=r.workItems.find(x=>x.id===id); if(!w||w.state!=='OPEN') return;
  const t=r.taskItems.find(x=>x.id===w.taskItemId);
  Object.entries(values).forEach(([k,v])=>{ if(v!=='') r.data[k]=v; });
  const tdef = TASK_DEFS[t.def];
  const still = [
    ...(t.requires||[]).map(rule=>evaluateRule(rule,r)).filter(x=>!x.satisfied),
    ...(tdef.manual?[]:missingInputs(tdef,t,r).map(m=>
        ({label:`required input "${m.target}" still has no value`}))),
  ];
  if(still.length){
    render(); toast(`Still blocked — ${still[0].label}`); return;
  }
  w.state='COMPLETED'; w.result=values; w.completedBy=S.me; w.completedAt=stamp();
  t.status='NOT_RUN';
  r.logs.push({taskId:t.id, attempt:t.attempts, at:stamp(), by:S.me, outcome:'SUCCEEDED', ms:0,
    detail:`Blocker cleared by ${USERS[S.me].name}.\n`
         + Object.entries(values).filter(([,v])=>v).map(([k,v])=>`  request.${k} = ${v}`).join('\n')});
  note(r,`cleared the block on ${TASK_DEFS[t.def].label}`);
  r.run.waitingOn=null; r.run.resumed=true; r.run.triggeredBy=S.me;
  closeModal(); render(); toast('Unblocked — execution continues');
  await driveRun(r);
}

async function completeWorkItem(id,result){
  const r=req();
  const w=r.workItems.find(x=>x.id===id); if(!w||w.state!=='OPEN') return;
  if(w.kind==='BLOCKER') return resolveBlocker(id,result);
  const t=r.taskItems.find(x=>x.id===w.taskItemId);
  const d=TASK_DEFS[t.def];
  w.state='COMPLETED'; w.result=result; w.completedBy=S.me; w.completedAt=stamp();
  t.status='SUCCEEDED'; t.error=null; t.attempts++; t.outputs=result;
  /* A person's answers are stored on the request the same way an action's return
     values are — that is how a drafted message reaches the task that sends it. */
  const stored = applyOutputs(d, result, r);
  r.logs.push({taskId:t.id, attempt:t.attempts, at:stamp(), by:S.me, outcome:'SUCCEEDED', ms:0,
    detail:`${d.label} completed by ${USERS[S.me].name}.\n`
         + Object.entries(result).filter(([,v])=>v).map(([k,v])=>`  ${k}: ${v}`).join('\n')
         + (Object.keys(stored).length?`\nstored on the request:\n`
             +Object.entries(stored).map(([k,v])=>`  request.${k} = ${v}`).join('\n'):'')});
  note(r,`completed "${w.title}" — execution continues`);
  r.run.cursor++; r.run.waitingOn=null;
  r.run.resumed=true; r.run.triggeredBy=S.me;
  closeModal(); render(); toast('Done — execution continues');
  await driveRun(r);
}

/* What a refusal means is configured per task, because it differs per step.
   Refusing is a decision, not a breakage — so the default routes the request
   back to whoever can act on it rather than marking anything failed. */
/* Set by the administrator on the flow step; the task type supplies a fallback
   for steps that say nothing. The requester never sees it and cannot change it. */
function refusalMode(t){
  const def = TASK_DEFS[t.def] || {};
  return t.onRefusal || def.onRefusalDefault || 'Send back';
}

function rejectWorkItem(id,reason){
  const r=req();
  const w=r.workItems.find(x=>x.id===id); if(!w||w.state!=='OPEN') return;
  const t=r.taskItems.find(x=>x.id===w.taskItemId);
  const d=TASK_DEFS[t.def];
  const mode=refusalMode(t);
  if(mode==='Not allowed'){ toast('This signature cannot be refused — cancel the run instead'); return; }

  /* The refusal itself is recorded the same way whatever the mode. */
  w.state='REJECTED'; w.rejectionReason=reason; w.completedBy=S.me; w.completedAt=stamp();
  r.run.waitingOn=null;

  if(mode==='Fail the task'){
    t.status='FAILED'; t.error=`Signature refused: ${reason}`; t.attempts++;
    r.logs.push({taskId:t.id, attempt:t.attempts, at:stamp(), by:S.me, outcome:'FAILED', ms:0,
      detail:`${d.label} refused by ${USERS[S.me].name}.\n  reason: ${reason}`});
    note(r,`declined "${w.title}" — the task failed`);
    if(S.definition.onError==='STOP'){
      r.run.state='FAILED'; r.run.finishedAt=stamp();
      closeModal(); render(); toast('Signature refused — the run stopped here');
    }else{
      r.run.cursor++; r.run.resumed=true; r.run.triggeredBy=S.me;
      closeModal(); render(); driveRun(r);
    }
    return;
  }

  /* Send back: nothing failed. The task never ran, the run ends, and the refusal
     becomes an open change request — which the existing rule turns into a red gate. */
  t.status='NOT_RUN';
  r.logs.push({taskId:t.id, attempt:t.attempts, at:stamp(), by:S.me, outcome:'SENT_BACK', ms:0,
    detail:`${d.label} declined by ${USERS[S.me].name}; sent back to the requester.\n  reason: ${reason}`});
  r.changeRequests.push({id:'cr'+(++S.seq), user:S.me, resolved:false, at:stamp(),
    text:`Declined "${w.title}": ${reason}`});
  r.run.state='SENT_BACK'; r.run.finishedAt=stamp();
  note(r,`declined "${w.title}" and sent the request back`);
  closeModal(); render();
  toast('Sent back to the requester — nothing was marked failed');
}

/* There is deliberately NO way to run one task by hand. Execution happens only
   through a run, which walks the flow in order, honours skip rules and
   preconditions, and validates each action's required inputs before dispatch.
   Retrying a failed step is Execute all again: a new run skips what already
   succeeded and picks up where it failed. */

/* Ending a parked run is the requester's or an administrator's call, never the
   signer's — otherwise "sign or nothing" is defeated by cancelling instead. */
function mayCancel(r){ return r.requester===S.me || hasRole(S.me,'Administrator'); }

function cancelRun(){
  const r=req(); if(!runInFlight(r)) return;
  if(!mayCancel(r)){ toast('Only the requester or an administrator may cancel a run'); return; }
  openWorkItems(r).forEach(w=>{ w.state='CANCELLED'; });
  r.taskItems.filter(t=>t.status==='WAITING').forEach(t=>{ t.status='NOT_RUN'; });
  r.run.state='CANCELLED'; r.run.finishedAt=stamp();
  note(r,'cancelled the execution run');
  render(); toast('Run cancelled — the request is editable again');
}

