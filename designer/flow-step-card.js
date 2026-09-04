/* ===========================================================================
   Flow step card — one activity in the flow editor, opened for configuration.

   Two halves, deliberately split: the DATA WIRING (the step as a call site
   for its task type — where each input comes from, where each output is
   kept) and the RUNTIME CONFIGURATION (assignment, display, preconditions,
   transitions — how the engine behaves here). A placeholder step edits its
   preconfigured activities instead, each wired exactly like a step.

   Handlers live in flow-editor.js; this file renders.
   =========================================================================== */
"use strict";

/* The runtime half of an activity. Created lazily so a document written before
   a key existed still opens with sane defaults. */
function rc(step){
  const c = step.runtimeConfig || (step.runtimeConfig = {});
  if(!c.assignedRoles)  c.assignedRoles = [];
  if(!('dueBy' in c))   c.dueBy = null;
  if(!c.display)        c.display = [];
  if(!c.requires)       c.requires = [];
  if(!c.transitions)    c.transitions = [];
  if(step.kind==='PLACEHOLDER'){ if(!step.possibleActivities) step.possibleActivities = []; }
  else{
    if(!step.inputBindings)  step.inputBindings  = {};
    if(!step.outputBindings) step.outputBindings = {};
  }
  return c;
}
function stepMeta(step){
  if(step.kind==='PLACEHOLDER')
    return {label: step.label||'Placeholder', icon: I.plus, manual:false, placeholder:true};
  const d = TASK_DEFS[step.taskDefinition];
  return d ? {label:d.label, icon:d.icon, manual:d.manual, placeholder:false, def:d}
           : {label:step.taskDefinition+' (unknown)', icon:I.warn, manual:false, placeholder:false};
}
function stepLabelById(id){
  const st = (S.definition.taskFlow||[]).find(x=>x.stepId===id);
  return st ? stepMeta(st).label : id;
}

/* ---------------------------------------------------------------- task flow */
function flowStep(step,i){
  const m = stepMeta(step);
  const last = S.definition.taskFlow.length-1;
  const dataParams = S.definition.dataParameters;
  return `
  <div class="flowstep ${S.flowOpen===step.stepId?'open':''} ${m.placeholder?'slotstep':''}">
    <div class="flowhead">
      <span class="flownum mono">${i+1}</span>
      <span class="task-ico">${m.icon}</span>
      <div class="flowmain">
        <div class="flowtitle">
          <strong>${esc(m.label)}</strong>
          ${m.placeholder?`<span class="pill neutral">slot</span>`
            : m.manual?`<span class="pill neutral">manual</span>`:`<span class="pill blue">server</span>`}
          ${step.start?`<span class="pill ok">● start</span>`:''}
          ${step.end?`<span class="pill ok">end ◉</span>`:''}
          ${(rc(step).requires||[]).length?`<span class="pill warn">has a precondition</span>`:''}
        </div>
        <div class="flowsub">${esc(
          (m.manual ? `carried out by ${(rc(step).assignedRoles.length?rc(step).assignedRoles:['Administrator']).join(' or ')}`
                     + (rc(step).dueBy?` · due ${rc(step).dueBy}`:'') + ' · ' : '')
          + (m.placeholder
              ? `may hold: ${(step.possibleActivities||[]).map(a=>a.label||(TASK_DEFS[a.taskDefinition]||{}).label||a.taskDefinition).join(', ')||'nothing yet'}`
              : (m.def ? wiringSummary(m.def,step) : 'unknown task type')))}
          — then: ${(rc(step).transitions||[]).map(tr=>
            `${tr.when?describeTransition(tr)+' → ':'→ '}${stepLabelById(tr.to)}`).join('; ')
            || (step.end?'the process completes':'nowhere (dead end)')}</div>
      </div>
      <div class="flowacts">
        <button class="btn sm ico" data-rt="up" data-i="${i}" ${i===0?'disabled':''}
          title="Move up (layout only — the arrows decide the order)">↑</button>
        <button class="btn sm ico" data-rt="down" data-i="${i}" ${i===last?'disabled':''}
          title="Move down (layout only)">↓</button>
        <button class="btn sm ico" data-rt="toggle" data-id="${step.stepId}"
          title="Configure this activity">${I.gear}</button>
        <button class="btn sm ico" data-rt="del-step" data-i="${i}"
          title="Remove from the flow">${I.trash}</button>
      </div>
    </div>

    ${S.flowOpen===step.stepId?`
    <div class="flowbody">
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px">
        <label class="switch">
          <input type="checkbox" data-rt="start" data-i="${i}" ${step.start?'checked':''}>
          <span class="track"></span><span>Start — the run begins here</span>
        </label>
        <label class="switch">
          <input type="checkbox" data-rt="end" data-i="${i}" ${step.end?'checked':''}>
          <span class="track"></span><span>End — completing here may finish the process</span>
        </label>
      </div>

      ${m.placeholder?`
      <h4>Slot</h4>
      <span class="hint">A designed extension point: at runtime the requester sees an
        <b>Add task</b> button and picks from the <b>preconfigured activities</b> below — never a
        raw task type, and never a form. Configure each one here exactly as you would a flow step;
        one click adds it complete. Empty, the run passes straight through.</span>
      <div class="field" style="max-width:280px"><label>Label</label>
        <input type="text" data-rt="plabel" data-i="${i}" value="${esc(step.label||'')}"
          placeholder="Additional steps"></div>
      <h5>Preconfigured activities</h5>
      ${(step.possibleActivities||[]).map((a,j)=>{
        const ad = TASK_DEFS[a.taskDefinition];
        return `<div class="actcard">
          <div class="te-map" style="border:0;padding:2px 0">
            <input type="text" data-rt="act-label" data-i="${i}" data-j="${j}"
              value="${esc(a.label||'')}" placeholder="label" style="width:170px">
            <span class="te-arrow">uses</span>
            <select data-rt="act-def" data-i="${i}" data-j="${j}" style="flex:1;min-width:150px">
              ${Object.values(TASK_DEFS).map(d=>`<option value="${d.name}"
                ${a.taskDefinition===d.name?'selected':''}>${esc(d.label)}</option>`).join('')}
            </select>
            <button class="btn sm ico" data-rt="act-del" data-i="${i}" data-j="${j}"
              title="Remove this activity">${I.trash}</button>
          </div>
          ${ad?`<div style="padding:2px 0 0">${wiringRows(ad, a, i, j)}</div>`:''}
          ${ad && ad.manual?`<div class="rolepick" style="margin-top:6px">
            ${knownRoles().map(role=>`
              <label class="rolechip ${((a.runtimeConfig||{}).assignedRoles||[]).includes(role)?'on':''}">
                <input type="checkbox" data-rt="act-role" data-i="${i}" data-j="${j}" data-role="${esc(role)}"
                  ${((a.runtimeConfig||{}).assignedRoles||[]).includes(role)?'checked':''}>
                ${esc(role)}
              </label>`).join('')}
          </div>`:''}
        </div>`;
      }).join('')}
      <button class="btn sm" data-rt="act-add" data-i="${i}" style="margin-top:6px">
        ${I.plus} Add an activity</button>`
      :`
      <h4>Data wiring</h4>
      <span class="hint">A task type is a function — it says what it needs and what it produces,
        and knows nothing about this request type. Here is the call site: where each value comes
        from, and where each result is kept. Steps hand work to each other only through the
        request's fields.</span>
      ${m.def ? wiringRows(m.def, step, i, null)
        : `<div style="font-size:12.5px;color:var(--ink-3)">Unknown task type — nothing to wire.</div>`}`}

      <h4 class="rtsec">Runtime configuration</h4>
      <span class="hint">How the engine behaves at this activity. None of it is shown to the
        requester — but all of it is inside the approval hash, because what an approver approved
        includes how the process routes.</span>

      ${m.manual?`
      <h5>Who may carry it out</h5>
      <div class="rolepick">
        ${knownRoles().map(role=>`
          <label class="rolechip ${rc(step).assignedRoles.includes(role)?'on':''}">
            <input type="checkbox" data-rt="wrole" data-i="${i}" data-role="${esc(role)}"
              ${rc(step).assignedRoles.includes(role)?'checked':''}>
            ${esc(role)}
          </label>`).join('')}
      </div>
      ${rc(step).assignedRoles.length?'':`<span class="hint" style="color:var(--warn)">
        Nobody selected — the engine falls back to Administrator.</span>`}

      <h5>Shown to the person</h5>
      <span class="hint">Which request fields the completion dialog displays, so each activity shows
        only what its person needs. Fields with no value yet are omitted — list the approver's
        comment on the draft step and it appears only on a redo, carrying the reason.</span>
      <div class="rolepick">
        ${S.definition.dataParameters.map(p=>`
          <label class="rolechip ${rc(step).display.includes(p.name)?'on':''}">
            <input type="checkbox" data-rt="dshow" data-i="${i}" data-name="${esc(p.name)}"
              ${rc(step).display.includes(p.name)?'checked':''}>
            ${esc(p.label)}
          </label>`).join('')}
      </div>
      <div class="field" style="margin-top:8px;max-width:220px">
        <label>Due by</label>
        <input type="text" data-rt="dueby" data-i="${i}" value="${esc(rc(step).dueBy||'')}"
          placeholder="12.09.2026">
      </div>`:''}

      ${m.placeholder?'':`
      <h5>Do not start until…</h5>
      <span class="hint">Checked at run time, because the value may be produced by an earlier step.
        If it is not satisfied the run parks on a blocker until somebody supplies it.</span>
      ${ruleRows(rc(step),'requires',i,dataParams,'No precondition.')}`}

      <h5>Transitions — where the process goes next</h5>
      <span class="hint">Evaluated in order once this activity completes; the first match wins.
        <b>always</b> is the "otherwise" and belongs last. A condition is one field compared to one
        value — routing on the person's answer, like <span class="mono">approved = false</span>
        back to the draft.</span>
      ${transitionRows(step,i,dataParams)}
    </div>`:''}
  </div>`;
}

function transitionRows(step,i,dataParams){
  const list = rc(step).transitions;
  const others = (S.definition.taskFlow||[]).filter(x=>x.stepId!==step.stepId);
  const condFields = dataParams;   /* boolean → true/false picker, text → exact value */
  return `
    ${list.length? list.map((tr,j)=>{
      const p = tr.when ? condFields.find(x=>x.name===tr.when.path) : null;
      return `<div class="te-map">
        <select data-rt="tr-kind" data-i="${i}" data-j="${j}" style="width:auto">
          <option value="always" ${!tr.when?'selected':''}>always</option>
          <option value="when" ${tr.when?'selected':''}>when</option>
        </select>
        ${tr.when?`
          <select data-rt="tr-path" data-i="${i}" data-j="${j}" style="width:auto">
            ${condFields.map(f=>`<option value="${esc(f.name)}" ${tr.when.path===f.name?'selected':''}>${esc(f.label)} (${esc(f.name)})</option>`).join('')}
          </select>
          <span class="te-arrow">=</span>
          ${p&&p.type==='boolean'
            ? `<select data-rt="tr-val" data-i="${i}" data-j="${j}" data-bool="1" style="width:auto">
                 <option value="true" ${tr.when.equals===true?'selected':''}>true</option>
                 <option value="false" ${tr.when.equals===false?'selected':''}>false</option>
               </select>`
            : `<input type="text" data-rt="tr-val" data-i="${i}" data-j="${j}"
                 value="${esc(tr.when.equals??'')}" placeholder="exact value" style="width:110px">`}`:''}
        <span class="te-arrow">→</span>
        <select data-rt="tr-to" data-i="${i}" data-j="${j}" style="flex:1;min-width:130px">
          ${others.map(o=>`<option value="${esc(o.stepId)}" ${tr.to===o.stepId?'selected':''}>${esc(stepMeta(o).label)}</option>`).join('')}
        </select>
        <button class="btn sm ico" data-rt="tr-up" data-i="${i}" data-j="${j}" ${j===0?'disabled':''} title="Evaluate earlier">↑</button>
        <button class="btn sm ico" data-rt="tr-down" data-i="${i}" data-j="${j}" ${j===list.length-1?'disabled':''} title="Evaluate later">↓</button>
        <button class="btn sm ico" data-rt="del-tr" data-i="${i}" data-j="${j}" title="Remove">${I.trash}</button>
      </div>`;
    }).join('')
    : `<div style="font-size:12.5px;color:var(--ink-3);padding:4px 0">${step.end
        ?'No outgoing transitions — completing here finishes the process.'
        :'None — a dead end. Add one, or mark this activity as an end.'}</div>`}
    <button class="btn sm" data-rt="add-tr" data-i="${i}" style="margin-top:6px">${I.plus} Add transition</button>`;
}

/* One wiring editor, shared by flow steps and a slot's preconfigured
   activities (j = the activity index, null for a step). Deliberately plain
   language: "a fixed value", "from the request" — the people using this are
   not developers, and LITERAL/REQUEST_DATA are storage details. */
function wiringRows(def, holder, i, j){
  const at = j==null ? '' : ` data-j="${j}"`;
  const dataParams = S.definition.dataParameters||[];
  const ins  = taskInputs(def);
  const outs = taskOutputs(def);
  const inRows = ins.map(p=>{
    const b = (holder.inputBindings||{})[p.name] || null;
    const kind = b ? b.kind : '';
    const missing = p.required && !hasSource(b);
    return `<div class="te-map">
      <span class="te-target">${esc(p.label||p.name)}${p.required?'<span class="req"> *</span>':''}</span>
      <span class="te-arrow">←</span>
      <select data-rt="wire-in" data-i="${i}"${at} data-k="${p.name}" style="width:auto;max-width:240px">
        <option value="" ${!b?'selected':''}>nothing</option>
        <option value="LIT" ${kind==='LITERAL'?'selected':''}>a fixed value…</option>
        ${dataParams.map(q=>`<option value="R:${esc(q.name)}"
          ${kind==='REQUEST_DATA'&&b.path===q.name?'selected':''}>from the request: ${esc(q.label)}</option>`).join('')}
      </select>
      ${kind==='LITERAL'?`<input type="text" data-rt="wire-lit" data-i="${i}"${at} data-k="${p.name}"
        value="${esc(b.value??'')}" placeholder="${esc(p.placeholder||'the value')}" style="flex:1;min-width:130px">`:''}
      ${missing?`<span class="hint" style="color:var(--bad);margin:0">Required — wire it, or the
        run will block here.</span>`:''}
    </div>`;
  }).join('');
  /* Only execution-owned fields may be written: writing a requester field
     would move the approval hash mid-run. */
  const outTargets = dataParams.filter(q=>q.owner==='EXECUTION');
  const outRows = outs.map(o=>{
    const b = (holder.outputBindings||{})[o.name] || null;
    return `<div class="te-map">
      <span class="te-target">${esc(o.label||o.name)}</span>
      <span class="te-arrow">→</span>
      <select data-rt="wire-out" data-i="${i}"${at} data-k="${o.name}" style="flex:1;min-width:160px">
        <option value="">not kept</option>
        ${outTargets.map(q=>`<option value="${esc(q.name)}"
          ${b&&b.path===q.name?'selected':''}>kept on the request: ${esc(q.label)}</option>`).join('')}
      </select>
    </div>`;
  }).join('');
  return `${ins.length?`<h5 style="margin-top:8px">What it needs</h5>${inRows}`:''}
    ${outs.length?`<h5>${def.manual?'Where the answers are kept':'What it produces'}</h5>${outRows}`:''}
    ${!ins.length&&!outs.length?`<div style="font-size:12.5px;color:var(--ink-3)">Nothing to wire.</div>`:''}`;
}
function wiringSummary(def, holder){
  const bits = taskInputs(def).map(p=>{
    const b=(holder.inputBindings||{})[p.name];
    return b&&b.kind==='LITERAL'&&b.value ? `${p.label}: ${b.value}` : null;
  }).filter(Boolean);
  const reads = taskInputs(def).filter(p=>{
    const b=(holder.inputBindings||{})[p.name];
    return b&&b.kind==='REQUEST_DATA'&&b.path;
  }).length;
  const stores = Object.keys(holder.outputBindings||{}).length;
  if(reads)  bits.push(`reads ${reads} request field${reads===1?'':'s'}`);
  if(stores) bits.push(`keeps ${stores} result${stores===1?'':'s'}`);
  return bits.length ? bits.join(' · ') : 'not wired yet';
}

/* Precondition rules are TaskRule[] of kind 'data' — the same shape the gate uses. */
function ruleRows(runtime,which,i,dataParams,emptyText){
  const list = runtime[which]||[];
  return `
    ${list.length? list.map((rule,j)=>`
      <div class="te-map">
        <span class="te-target">request data</span>
        <select data-rt="rule-path" data-i="${i}" data-w="${which}" data-j="${j}" style="flex:1">
          ${dataParams.map(p=>`<option value="${esc(p.name)}" ${rule.path===p.name?'selected':''}>${esc(p.label)} (${esc(p.name)})</option>`).join('')}
        </select>
        <span class="te-arrow">is</span>
        <select data-rt="rule-op" data-i="${i}" data-w="${which}" data-j="${j}" style="width:auto">
          <option value="truthy" ${rule.op==='truthy'?'selected':''}>set / true</option>
          <option value="falsy"  ${rule.op==='falsy' ?'selected':''}>empty / false</option>
        </select>
        <button class="btn sm ico" data-rt="del-rule" data-i="${i}" data-w="${which}" data-j="${j}"
          title="Remove">${I.trash}</button>
      </div>`).join('')
      : `<div style="font-size:12.5px;color:var(--ink-3);padding:4px 0">${esc(emptyText)}</div>`}
    <button class="btn sm" data-rt="add-rule" data-i="${i}" data-w="${which}"
      style="margin-top:6px">${I.plus} Add condition</button>`;
}


/* ============================ styles ============================ */
document.head.insertAdjacentHTML('beforeend', `<style>
.flowlist{display:grid;gap:8px}
.flowstep{border:1px solid var(--border);border-radius:var(--r-lg);background:var(--surface);
  overflow:hidden}
.flowstep.open{border-color:var(--accent-line)}
.flowhead{display:flex;gap:11px;align-items:center;padding:10px 12px}
.flowstep.open .flowhead{background:var(--accent-soft)}
.flownum{width:22px;height:22px;flex:none;display:grid;place-items:center;font-size:11px;
  border-radius:5px;background:var(--surface-3);color:var(--ink-3)}
.flowmain{flex:1;min-width:0}
.flowtitle{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.flowsub{margin-top:3px;font-size:12px;color:var(--ink-3)}
.flowacts{display:flex;gap:1px;flex:none}
.flowacts .ico{width:28px;height:28px;padding:0;justify-content:center;border-color:transparent;
  background:transparent;color:var(--ink-3)}
.flowacts .ico:hover:not(:disabled){background:var(--surface-2);color:var(--ink)}
.flowbody{padding:12px 13px;border-top:1px solid var(--border);background:var(--surface-2)}
.flowbody h4{margin:0 0 4px;font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;
  color:var(--ink-2)}
.flowbody h4.rtsec{margin-top:16px;padding-top:13px;border-top:1px solid var(--border-strong);
  color:var(--accent)}
.flowbody h5{margin:14px 0 5px;font-size:12.5px;font-weight:600;color:var(--ink)}
.flowstep.slotstep{border-style:dashed}
.actcard{border:1px solid var(--border);border-radius:var(--r);background:var(--surface);
  padding:8px 10px;margin-top:7px}
.flowstep.slotstep .task-ico{color:var(--accent)}
.flowbody .hint{display:block;margin-bottom:8px}
.flowbody .formgrid{grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}
</style>`);
