/* ===========================================================================
   Flow editor — the Task flow section of the request-type screen.

   The flow is a SINGLE-TOKEN STATE MACHINE. Activities are joined by
   transitions — unconditional, or a single structured equality against
   request data — evaluated in order, first match wins. Loops are allowed
   (approved = false routes back to the draft); parallelism, fork/join,
   sub-processes and timers are not. That is the line between this subsystem
   and de.comconsult.wf, and it is meant to hold.

   This file owns the section: the list of steps, adding one, the validation
   that keeps the graph sound, and every flow event handler. The card for one
   step is flow-step-card.js; the picture is flow-graph.js.
   =========================================================================== */
"use strict";

/* ------------------------------------------------------- graph validation */
function flowIssues(){
  const flow = S.definition.taskFlow||[];
  const out = [];
  const starts = flow.filter(x=>x.start);
  if(starts.length!==1) out.push(starts.length===0
    ? 'No start activity — the run would have nowhere to begin.'
    : 'More than one start activity — a run begins in exactly one place.');
  if(!flow.some(x=>x.end)) out.push('No end activity — the process could never complete.');
  flow.forEach(st=>{
    const trs = rc(st).transitions;
    const m = stepMeta(st);
    if(!trs.length && !st.end) out.push(`"${m.label}" is a dead end — no transition and not an end.`);
    const always = trs.filter(t=>!t.when);
    if(always.length>1) out.push(`"${m.label}" has ${always.length} unconditional transitions — only the first can ever fire.`);
    if(always.length===1 && trs.indexOf(always[0])!==trs.length-1)
      out.push(`"${m.label}": the unconditional transition fires before later conditions — move it last.`);
    trs.forEach(t=>{ if(!flow.some(x=>x.stepId===t.to))
      out.push(`"${m.label}" routes to a missing activity (${t.to}).`); });
    if(st.kind==='PLACEHOLDER'){
      if(!(st.possibleActivities||[]).length)
        out.push(`Slot "${m.label}" has no preconfigured activities.`);
      (st.possibleActivities||[]).forEach(a=>{
        const ad = TASK_DEFS[a.taskDefinition];
        if(!ad){ out.push(`Activity "${a.label||a.id}" uses an unknown task type.`); return; }
        taskInputs(ad).filter(p=>p.required).forEach(p=>{
          if(!hasSource((a.inputBindings||{})[p.name]))
            out.push(`Activity "${a.label||ad.label}": required input "${p.label}" is not wired.`);
        });
      });
    } else if(m.def){
      taskInputs(m.def).filter(p=>p.required).forEach(p=>{
        if(!hasSource((st.inputBindings||{})[p.name]))
          out.push(`"${m.label}": required input "${p.label}" is not wired.`);
      });
    }
  });
  /* reachability from the start */
  if(starts.length===1){
    const seen = new Set([starts[0].stepId]);
    const queue = [starts[0].stepId];
    while(queue.length){
      const id = queue.shift();
      const st = flow.find(x=>x.stepId===id);
      if(!st) continue;
      (rc(st).transitions||[]).forEach(t=>{ if(!seen.has(t.to)){ seen.add(t.to); queue.push(t.to); } });
    }
    flow.filter(x=>!seen.has(x.stepId)).forEach(x=>
      out.push(`"${stepMeta(x).label}" is unreachable from the start.`));
  }
  return out;
}


function defFlow(){
  const flow = S.definition.taskFlow||[];
  const uses = S.requests.length;
  const issues = flowIssues();
  return `<div style="padding:15px">
    <p style="margin:0 0 4px;color:var(--ink-3);font-size:13px">
      The activity graph every request of this type starts with. Creating a request instantiates
      it — the requester gets the process, not an empty list.</p>
    <p style="margin:0 0 12px;color:var(--ink-3);font-size:12.5px">
      One token walks the arrows: transitions route on a field's value, and may loop back — an
      approval answered <span class="mono">approved = false</span> returns to the draft. No
      branching into parallel work; that is deliberate, and it is the line that keeps this from
      becoming a second workflow engine.</p>

    ${flowSvg()}

    ${issues.length?`<div class="rulenote" style="margin:0 0 12px">${I.warn}<div>
      ${issues.map(esc).join('<br>')}</div></div>`:''}

    <div class="flowlist">
      ${flow.length? flow.map(flowStep).join('')
        : `<div class="empty">No activities yet. A request created from this type would start empty.</div>`}
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="btn" data-rt="add-step">${I.plus} Add an activity</button>
      <span class="hint">${uses} existing request${uses===1?'':'s'} — already instantiated, and
        unaffected by changes here.</span>
    </div>
  </div>`;
}


function dlgAddStep(){
  openModal(`<div class="dialog" role="dialog" aria-modal="true" aria-label="Add a step">
    <div class="dhead"><h2>Add a step to the flow</h2>
      <button class="iconbtn" data-act="close">${I.cross}</button></div>
    <div class="dbody">
      <p style="margin:0;color:var(--ink-3);font-size:13px">
        It goes at the end of the list; wire it in with transitions. The task catalogue is
        authored under <b>Task types</b>.</p>
      <div class="tiles">
        ${Object.values(TASK_DEFS).map(d=>`<button class="tile" data-rt="pick-step" data-def="${d.name}">
          <span class="ti">${d.icon}</span><b>${esc(d.label)}</b><small>${esc(d.desc)}</small>
        </button>`).join('')}
        <button class="tile" data-rt="pick-step" data-def="__placeholder">
          <span class="ti">${I.plus}</span><b>Placeholder</b><small>A designed slot the requester
          may fill at runtime from a list of eligible task types.</small>
        </button>
      </div>
    </div>
  </div>`);
}


document.addEventListener('click', e=>{
  const btn = e.target.closest('[data-rt]');
  if(!btn) return;
  const flow = S.definition.taskFlow;
  const i = +btn.dataset.i;
  switch(btn.dataset.rt){
    case 'toggle':
      S.flowOpen = S.flowOpen===btn.dataset.id ? null : btn.dataset.id;
      render(); break;
    case 'up':   { const [s]=flow.splice(i,1); flow.splice(i-1,0,s); render(); break; }
    case 'down': { const [s]=flow.splice(i,1); flow.splice(i+1,0,s); render(); break; }
    case 'del-step':
      flow.splice(i,1); render(); toast('Step removed from the flow'); break;
    case 'add-step': dlgAddStep(); break;
    case 'pick-step':{
      const id = 's'+(++S.seq);
      const base = {stepId:id, start:!flow.some(x=>x.start), end:false,
        runtimeConfig:{assignedRoles:[], dueBy:null, requires:[], transitions:[]}};
      if(btn.dataset.def==='__placeholder'){
        flow.push(Object.assign(base, {kind:'PLACEHOLDER', label:'Additional steps', possibleActivities:[]}));
      }else{
        flow.push(Object.assign(base, {taskDefinition:btn.dataset.def,
          inputBindings:{}, outputBindings:{}}));
      }
      S.flowOpen = id;
      closeModal(); render(); toast('Activity added — wire it in with transitions'); break;
    }
    case 'act-add':{
      const list = flow[i].possibleActivities = flow[i].possibleActivities||[];
      const first = Object.values(TASK_DEFS)[0];
      list.push({id:'a'+(++S.seq), label:'', taskDefinition:first?first.name:'',
        inputBindings:{}, outputBindings:{},
        runtimeConfig:{assignedRoles:[], dueBy:null, display:[], requires:[]}});
      render(); break;
    }
    case 'act-del': flow[i].possibleActivities.splice(+btn.dataset.j,1); render(); break;
    case 'add-tr':{
      const others = flow.filter(x=>x!==flow[i]);
      rc(flow[i]).transitions.push({when:null, to:(others[0]||flow[i]).stepId});
      render(); break;
    }
    case 'del-tr': rc(flow[i]).transitions.splice(+btn.dataset.j,1); render(); break;
    case 'tr-up':{
      const l=rc(flow[i]).transitions, j=+btn.dataset.j;
      [l[j-1],l[j]]=[l[j],l[j-1]]; render(); break;
    }
    case 'tr-down':{
      const l=rc(flow[i]).transitions, j=+btn.dataset.j;
      [l[j+1],l[j]]=[l[j],l[j+1]]; render(); break;
    }
    case 'add-rule':
      (rc(flow[i])[btn.dataset.w] = rc(flow[i])[btn.dataset.w]||[])
        .push({kind:'data', path:S.definition.dataParameters[0].name, op:'truthy'});
      render(); break;
    case 'del-rule':
      rc(flow[i])[btn.dataset.w].splice(+btn.dataset.j,1); render(); break;
  }
});


document.addEventListener('change', e=>{
  const el = e.target;
  const rt = el.dataset.rt; if(!rt) return;
  const flow = S.definition.taskFlow;
  const i = +el.dataset.i;
  /* The wiring rows serve both flow steps and slot activities: data-j picks
     the activity, its absence means the step itself. */
  const wireHolder = () => el.dataset.j!==undefined
    ? flow[i].possibleActivities[+el.dataset.j] : flow[i];
  if(rt==='wire-in'){
    const h = wireHolder(); const ib = h.inputBindings = h.inputBindings||{};
    if(!el.value) delete ib[el.dataset.k];
    else if(el.value==='LIT') ib[el.dataset.k] = {kind:'LITERAL', value:''};
    else ib[el.dataset.k] = {kind:'REQUEST_DATA', path:el.value.slice(2)};
    render(); return;
  }
  if(rt==='wire-lit'){
    const h = wireHolder(); const b = (h.inputBindings||{})[el.dataset.k];
    if(b) b.value = el.value;
    render(); return;
  }
  if(rt==='wire-out'){
    const h = wireHolder(); const ob = h.outputBindings = h.outputBindings||{};
    if(!el.value) delete ob[el.dataset.k];
    else ob[el.dataset.k] = {kind:'REQUEST_DATA', path:el.value};
    render(); return;
  }
  if(rt==='start'){
    /* exactly one start: setting it here clears it everywhere else */
    if(el.checked){ flow.forEach(x=>{ x.start=false; }); flow[i].start=true; }
    else flow[i].start=false;
    render(); return;
  }
  if(rt==='end'){ flow[i].end = el.checked; render(); return; }
  if(rt==='plabel'){ flow[i].label = el.value; render(); return; }
  if(rt==='act-label'){ flow[i].possibleActivities[+el.dataset.j].label = el.value; render(); return; }
  if(rt==='act-def'){
    const a = flow[i].possibleActivities[+el.dataset.j];
    a.taskDefinition = el.value;
    a.inputBindings = {}; a.outputBindings = {};   /* new type, fresh wiring */
    render(); return;
  }
  if(rt==='act-role'){
    const a = flow[i].possibleActivities[+el.dataset.j];
    const rc2 = a.runtimeConfig = a.runtimeConfig||{assignedRoles:[],dueBy:null,display:[],requires:[]};
    const list = rc2.assignedRoles = rc2.assignedRoles||[];
    if(el.checked){ if(!list.includes(el.dataset.role)) list.push(el.dataset.role); }
    else rc2.assignedRoles = list.filter(x=>x!==el.dataset.role);
    render(); return;
  }
  if(rt==='tr-kind'){
    const tr = rc(flow[i]).transitions[+el.dataset.j];
    if(el.value==='always') tr.when = null;
    else{
      const f = S.definition.dataParameters.find(p=>p.type==='boolean')
             || S.definition.dataParameters[0];
      tr.when = {path:f?f.name:'', equals:f&&f.type==='boolean'?true:''};
    }
    render(); return;
  }
  if(rt==='tr-path'){
    const tr = rc(flow[i]).transitions[+el.dataset.j];
    const f = S.definition.dataParameters.find(p=>p.name===el.value);
    tr.when = {path:el.value, equals:f&&f.type==='boolean'?true:''};
    render(); return;
  }
  if(rt==='tr-val'){
    const tr = rc(flow[i]).transitions[+el.dataset.j];
    tr.when.equals = el.dataset.bool ? el.value==='true' : el.value;
    render(); return;
  }
  if(rt==='tr-to'){ rc(flow[i]).transitions[+el.dataset.j].to = el.value; render(); return; }
  if(rt==='wrole'){
    const roles = rc(flow[i]).assignedRoles, role = el.dataset.role;
    if(el.checked){ if(!roles.includes(role)) roles.push(role); }
    else rc(flow[i]).assignedRoles = roles.filter(x=>x!==role);
    render(); return;
  }
  if(rt==='dueby'){ rc(flow[i]).dueBy = el.value.trim() || null; render(); return; }
  if(rt==='dshow'){
    const list = rc(flow[i]).display;
    if(el.checked){ if(!list.includes(el.dataset.name)) list.push(el.dataset.name); }
    else rc(flow[i]).display = list.filter(x=>x!==el.dataset.name);
    render(); return;
  }
  if(rt==='rule-path'){ rc(flow[i])[el.dataset.w][+el.dataset.j].path = el.value; render(); return; }
  if(rt==='rule-op'){ rc(flow[i])[el.dataset.w][+el.dataset.j].op = el.value; render(); return; }
});

