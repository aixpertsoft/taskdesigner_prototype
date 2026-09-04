/* ===========================================================================
   Run engine — execution and every mutation: approvals, the graph walk,
   parking on work items and blockers, routing, resume, cancel.

   The flow is a SINGLE-TOKEN STATE MACHINE. A run holds one position — the
   current activity — and moves along transitions: evaluated in order after the
   activity completes, first match wins, `when: null` always fires. Taking a
   transition RESETS its target to NOT_RUN, which is what makes loops re-execute
   (approved=false walks back to the draft, and the draft parks again as a fresh
   attempt). A completed end activity with no matching transition completes the
   run. Conditional routing and loops are in; parallelism is not.

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

/* ============================ the graph ============================ */
function itemByStep(r,stepId){ return r.taskItems.find(t=>t.stepId===stepId); }
function startItem(r){ return r.taskItems.find(t=>t.start); }

/* One transition condition: a single structured equality against request data.
   Strict ===, so boolean false matches false and not undefined. */
function transitionMatches(tr,r){
  if(!tr.when) return true;
  return r.data[tr.when.path] === tr.when.equals;
}
function describeTransition(tr){
  return tr.when ? `${tr.when.path} = ${JSON.stringify(tr.when.equals)}` : 'always';
}

/* Where the token goes after `t` completes. Returns the next item, 'END', or
   null for a dead end (validation in the designer should make that impossible). */
function routeFrom(r,t){
  const tr = (t.transitions||[]).find(x=>transitionMatches(x,r));
  if(tr){
    const next = itemByStep(r,tr.to);
    if(next) return {next, tr};
  }
  return t.end ? {next:'END'} : null;
}

/* One task item, dispatched.

   Nothing here knows what the task *is* — it resolves the definition's input
   bindings, calls the named server action, and stores whatever the action
   returned according to the item's output bindings. All the helpers live in
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
  const stored   = applyOutputs(d, t, produced, r);
  t.status='SUCCEEDED'; t.error=null;
  t.outputs = Object.keys(produced).length ? produced : null;
  r.logs.push({taskId:t.id, attempt:t.attempts, at:stamp(), outcome:'SUCCEEDED', ms:410, ...actor,
    detail:`${call}\n${d.label} completed — ${taskSummary(d,t)}`
         + (t.outputs?`\nreturned:\n`+Object.entries(t.outputs).map(([k,v])=>`  ${k}: ${v}`).join('\n'):'')
         + (Object.keys(stored).length?`\nstored on the request:\n`
             +Object.entries(stored).map(([k,v])=>`  request.${k} = ${v}`).join('\n'):'')});
  note(r,`ran ${d.label} — succeeded`, actor.by);
  render();
  return true;
}

/* What the completion dialog shows the person: the request-data fields the
   activity DECLARES it wants shown (runtimeConfig.display), with their current
   values. Empty fields are omitted — so the draft step can list approvalNote
   and it only appears on a redo, carrying the approver's reason. Nothing is
   shown that the designer did not ask for. */
function displayContext(r,t){
  return (t.display||[])
    .map(name=>{
      const p = (S.definition.dataParameters||[]).find(x=>x.name===name);
      const v = r.data[name];
      if(v===''||v===null||v===undefined) return null;
      return {label: p?p.label:name, value: p&&p.type==='boolean' ? (v?'Yes':'No') : String(v)};
    })
    .filter(Boolean);
}

function itemLabel(t){
  return TASK_DEFS[t.def] ? TASK_DEFS[t.def].label : (t.label||'Placeholder');
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

  /* A FAILED run is resumable at the activity it failed on; anything else
     starts a fresh walk from the start activity. */
  if(r.run && r.run.state==='FAILED' && itemByStep(r,r.run.node)){
    r.run.state='RUNNING'; r.run.finishedAt=null;
    note(r,`resumed the run at ${itemLabel(itemByStep(r,r.run.node))}`);
    driveRun(r);
    return;
  }
  const first = startItem(r);
  if(!first){ toast('This flow has no start activity'); return; }
  r.taskItems.forEach(t=>{ if(t.status!=='NOT_RUN'){ t.status='NOT_RUN'; t.error=null; } });
  r.run = {id:'run'+(++S.seq), state:'RUNNING', node:first.stepId, hash:gate.hash,
           startedBy:S.me, startedAt:stamp(), waitingOn:null, resumed:false, triggeredBy:null};
  note(r,'started an execution run');
  driveRun(r);
}

/* Advance the token from a completed activity. Mutates the run; returns
   'CONTINUE' when the walk should carry on, anything else ended it. */
function advance(r,t){
  const run=r.run;
  const routed = routeFrom(r,t);
  if(!routed){
    run.state='FAILED'; run.finishedAt=stamp();
    note(r,`the run stopped — no transition matched after ${itemLabel(t)}`,'system');
    render(); toast('Run stopped — no transition matched');
    return 'ENDED';
  }
  if(routed.next==='END'){
    run.state='COMPLETED'; run.finishedAt=stamp();
    render(); toast('Process completed');
    return 'ENDED';
  }
  if(routed.tr && routed.tr.when){
    r.logs.push({taskId:t.id, attempt:t.attempts, at:stamp(), outcome:'ROUTED', ms:0,
      by:run.resumed?'system':run.startedBy,
      detail:`Routed to ${itemLabel(routed.next)} — ${describeTransition(routed.tr)}.`});
  }
  /* Entering an activity resets it: a loop back to the draft is a fresh attempt. */
  routed.next.status='NOT_RUN'; routed.next.error=null;
  run.node = routed.next.stepId;
  return 'CONTINUE';
}

async function driveRun(r){
  const run=r.run; if(!run) return;
  run.state='RUNNING'; render();
  /* Cycle guard: a walk that routes without ever parking or executing a manual
     step must terminate — bounded generously rather than trusted blindly. */
  let hops = 0;
  while(hops++ < 100){
    const t = itemByStep(r,run.node);
    if(!t){ run.state='FAILED'; run.finishedAt=stamp(); render(); return; }

    /* A placeholder is a designed slot: its filled tasks sit as real activities
       spliced before it in the graph, so by the time the token arrives here the
       slot itself is a pass-through. */
    if(t.kind==='PLACEHOLDER'){
      t.status='SUCCEEDED';
      if(advance(r,t)!=='CONTINUE') return;
      continue;
    }

    const d = TASK_DEFS[t.def];

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
        context:displayContext(r,t), result:null};
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
        context:displayContext(r,t), result:null};
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
    if(!ok){
      /* A failed task always halts the run. Execute again resumes right here. */
      run.state='FAILED'; run.finishedAt=stamp();
      render(); toast('Run stopped after a failure — Execute again to retry this step');
      return;
    }
    if(advance(r,t)!=='CONTINUE') return;
  }
  /* The hop bound tripped: a routing loop with no human step in it. */
  run.state='FAILED'; run.finishedAt=stamp();
  note(r,'the run stopped — the transitions loop without ever pausing','system');
  render(); toast('Run stopped — the transitions loop endlessly');
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
     values are — that is how a drafted message reaches the task that sends it,
     and how an approval decision reaches the transitions that route on it. */
  const stored = applyOutputs(d, t, result, r);
  r.logs.push({taskId:t.id, attempt:t.attempts, at:stamp(), by:S.me, outcome:'SUCCEEDED', ms:0,
    detail:`${d.label} completed by ${USERS[S.me].name}.\n`
         + Object.entries(result).filter(([,v])=>v!==''&&v!==undefined).map(([k,v])=>`  ${k}: ${v}`).join('\n')
         + (Object.keys(stored).length?`\nstored on the request:\n`
             +Object.entries(stored).map(([k,v])=>`  request.${k} = ${v}`).join('\n'):'')});
  note(r,`completed "${w.title}"`);
  r.run.waitingOn=null;
  r.run.resumed=true; r.run.triggeredBy=S.me;
  closeModal();
  if(advance(r,t)!=='CONTINUE') return;
  render(); toast('Done — execution continues');
  await driveRun(r);
}

/* ============================ placeholder slots ============================ */
/* Filling a slot splices a real activity into the request's own graph copy:
   the new task takes over the slot's outgoing transitions and the slot points
   at it, so the token walks prev → fills, in order → onward. Both filling and
   unfilling move the plan's hash — approvers see every deviation. */
function fillSlot(r, slotId, activityId){
  const slot = r.taskItems.find(t=>t.id===slotId);
  if(!slot || slot.kind!=='PLACEHOLDER') return null;
  /* Only a PRECONFIGURED activity from the slot's own menu — never a raw task
     type. The designer configured it like a flow step, so it arrives complete:
     wiring, assignment, display, preconditions. */
  const act = (slot.possibleActivities||[]).find(a=>a.id===activityId);
  if(!act) return null;
  const defName = act.taskDefinition;
  const arc = act.runtimeConfig||{};
  /* Fills are chained by inserting the new task LAST: it inherits whatever the
     current chain-end routes to, and the chain-end is redirected at it. */
  const chain = slotFills(r, slot);
  const prev = chain.length ? chain[chain.length-1] : null;
  const inheritFrom = prev || slot;
  const fill = {
    id:'ti'+(++S.seq), def:defName, stepId:'f'+S.seq, kind:'TASK',
    fromSlot:slot.id, fillLabel:act.label||defName, start:false, end:false,
    status:'NOT_RUN', attempts:0,
    inputBindings:JSON.parse(JSON.stringify(act.inputBindings||{})),
    outputBindings:JSON.parse(JSON.stringify(act.outputBindings||{})),
    assignedRoles:JSON.parse(JSON.stringify(arc.assignedRoles||[])),
    dueBy:arc.dueBy||null,
    display:JSON.parse(JSON.stringify(arc.display||[])),
    requires:JSON.parse(JSON.stringify(arc.requires||[])),
    transitions: JSON.parse(JSON.stringify(inheritFrom.transitions||[])),
  };
  if(prev){
    prev.transitions = [{when:null, to:fill.stepId}];
  }else{
    /* first fill: it goes where the slot went; the slot now goes to it */
    slot.transitions = [{when:null, to:fill.stepId}];
  }
  /* insert after the current chain end, keeping the list readable */
  const anchor = prev || slot;
  r.taskItems.splice(r.taskItems.indexOf(anchor)+1, 0, fill);
  return fill;
}
function slotFills(r, slot){
  return r.taskItems.filter(t=>t.fromSlot===slot.id);
}
function unfillSlot(r, fillId){
  const i = r.taskItems.findIndex(t=>t.id===fillId);
  if(i<0) return;
  const fill = r.taskItems[i];
  const pointer = r.taskItems.find(t=>(t.transitions||[]).some(x=>x.to===fill.stepId));
  if(pointer) pointer.transitions = JSON.parse(JSON.stringify(fill.transitions||[]));
  r.taskItems.splice(i,1);
  r.logs = r.logs.filter(l=>l.taskId!==fillId);
}

/* There is deliberately NO way to run one task by hand. Execution happens only
   through a run, which walks the graph along its transitions, honours
   preconditions, and validates each action's required inputs before dispatch.
   Retrying after a failure is Execute again: the run resumes at the failed
   activity. */

/* Ending a parked run is the requester's or an administrator's call, never the
   assigned person's — otherwise a mandatory step is defeated by cancelling. */
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
