/* ===========================================================================
   Request type editor — the administrator's side.

   A request type carries four things: the status graph, the TASK FLOW, the data
   parameters, and the execution rules that gate a run.

   The task flow is the substantive part. It is an ORDERED TEMPLATE: creating a
   request instantiates it, so every request of a type starts as the same process
   rather than an empty list somebody assembles by hand.

   Deliberately LINEAR. Steps run in order, and a step may be skipped — but there
   is no branching, no parallelism and no loops. That line is what keeps this from
   becoming a second copy of de.comconsult.wf; a conditional skip is a one-armed
   router, and the arm is all this subsystem should ever grow.

   A step has two halves, and the split is the point:

     AUTHORING — what the requester gets and may change
       required  — the requester may not remove it
       defaults  — pre-filled into the task when instantiated

     runtimeConfig — how the ENGINE behaves here. Never shown to the requester,
     never editable by them, but inside the approval hash all the same, because
     what an approver approved includes how the step behaves.
       onRefusal — what declining does; null falls back to the task type default
       skipWhen  — TaskRule[]; if satisfied when the cursor arrives, the step is
                   marked SKIPPED and the run carries on
       requires  — TaskRule[]; if unsatisfied, the run parks on a blocker work
                   item. These cannot be gate rules: the value may be produced by
                   an earlier step, so they can only be judged at run time.

   Both rule lists reuse evaluateRule() from index.html unchanged — there is no
   second rule engine and no expression language.
   =========================================================================== */
"use strict";

/* ============================ the document ============================ */
/* request-types.json.js is the source. Everything the editor changes is changed
   in this object, so Export hands back exactly what the server would store. */
const RT_API = 'aixboms.requesttype/v1';
let REQUEST_TYPE_DOC = window.REQUEST_TYPES || {apiVersion:RT_API, requestTypes:[]};

/* Refuse an unknown major rather than guessing at it — a file from a newer
   client is not something to half-read. */
function checkApiVersion(doc){
  const v = String((doc&&doc.apiVersion)||'');
  const major = v.split('/')[1] || '';
  const want  = RT_API.split('/')[1];
  if(!v) return 'No apiVersion — refusing to guess at the shape.';
  if(major !== want) return `apiVersion ${v} is not ${RT_API}; this build cannot read it.`;
  return null;
}
function currentRequestType(){
  const list = REQUEST_TYPE_DOC.requestTypes||[];
  /* A deep copy: the session edits its own instance, and Export re-reads it. */
  return JSON.parse(JSON.stringify(list[0]||{
    id:'empty', name:'Untitled', onError:'STOP',
    executionRules:[], dataParameters:[], taskFlow:[]}));
}
/* The session's definition IS the document's first entry — write it back so an
   export reflects what is on screen. */
function requestTypeJson(){
  const doc = JSON.parse(JSON.stringify(REQUEST_TYPE_DOC));
  doc.apiVersion = doc.apiVersion || RT_API;
  if(!doc.requestTypes || !doc.requestTypes.length) doc.requestTypes = [S.definition];
  else doc.requestTypes[0] = JSON.parse(JSON.stringify(S.definition));
  return JSON.stringify(doc, null, 2);
}

function viewDefinition(){
  const d = S.definition;
  return `
  <div class="page-head">
    <div>
      <h1>${esc(d.name)}</h1>
      <p>The template. Everything here is set up by an administrator — no code involved.</p>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn" data-rt="export">${I.log} Export JSON</button>
      <button class="btn" data-rt="import">Import JSON</button>
      <button class="btn" data-act="back-inbox">${I.chevL} Back to requests</button>
    </div>
  </div>
  <div class="def-body">
    <nav class="sidenav">
      ${[['flow','Task flow'],['workflow','Status workflow'],
         ['data','Data parameters'],['rules','Execution rules']]
        .map(([k,l])=>`<button data-def="${k}" aria-current="${S.defSection===k}">${l}</button>`).join('')}
    </nav>
    <div class="card">
      ${S.defSection==='flow'    ? defFlow()
       :S.defSection==='workflow'? defWorkflow()
       :S.defSection==='data'    ? defData()
       :                           defRules()}
    </div>
  </div>`;
}

/* The runtime half of a step: how the engine behaves when it gets here. Created
   lazily so a document written before the block existed still opens. */
function rc(step){
  const c = step.runtimeConfig || (step.runtimeConfig = {});
  if(!('onRefusal' in c)) c.onRefusal = null;
  if(!c.assignedRoles)    c.assignedRoles = [];
  if(!('dueBy' in c))     c.dueBy = null;
  if(!c.skipWhen)         c.skipWhen = [];
  if(!c.requires)         c.requires = [];
  return c;
}

/* ---------------------------------------------------------------- task flow */
function flowStep(step,i){
  const d = TASK_DEFS[step.taskDefinition];
  const last = S.definition.taskFlow.length-1;
  if(!d) return `<div class="flowstep"><b>${esc(step.taskDefinition)}</b> — unknown task type</div>`;
  const dataParams = S.definition.dataParameters;
  return `
  <div class="flowstep ${S.flowOpen===step.stepId?'open':''}">
    <div class="flowhead">
      <span class="flownum mono">${i+1}</span>
      <span class="task-ico">${d.icon}</span>
      <div class="flowmain">
        <div class="flowtitle">
          <strong>${esc(d.label)}</strong>
          ${d.manual?`<span class="pill neutral">manual</span>`:`<span class="pill blue">server</span>`}
          ${step.required?`<span class="pill ok">required</span>`
                         :`<span class="pill neutral">optional</span>`}
          ${(rc(step).skipWhen||[]).length?`<span class="pill warn">skippable</span>`:''}
          ${(rc(step).requires||[]).length?`<span class="pill warn">has a precondition</span>`:''}
          ${d.manual && refusalMode({def:step.taskDefinition, onRefusal:rc(step).onRefusal})==='Not allowed'
            ? `<span class="pill bad">cannot be declined</span>`:''}
        </div>
        <div class="flowsub">${esc(
          (d.manual ? `carried out by ${(rc(step).assignedRoles.length?rc(step).assignedRoles:['Administrator']).join(' or ')}`
                     + (rc(step).dueBy?` · due ${rc(step).dueBy}`:'') + ' · ' : '')
          + defaultsSummary(d,step))}</div>
      </div>
      <div class="flowacts">
        <button class="btn sm ico" data-rt="up" data-i="${i}" ${i===0?'disabled':''}
          title="Move up">↑</button>
        <button class="btn sm ico" data-rt="down" data-i="${i}" ${i===last?'disabled':''}
          title="Move down">↓</button>
        <button class="btn sm ico" data-rt="toggle" data-id="${step.stepId}"
          title="Configure this step">${I.gear}</button>
        <button class="btn sm ico" data-rt="del-step" data-i="${i}"
          title="Remove from the flow">${I.trash}</button>
      </div>
    </div>

    ${S.flowOpen===step.stepId?`
    <div class="flowbody">
      <label class="switch" style="margin-bottom:10px">
        <input type="checkbox" data-rt="required" data-i="${i}" ${step.required?'checked':''}>
        <span class="track"></span>
        <span>Required — the requester cannot remove this step</span>
      </label>

      <h4>Default values</h4>
      <span class="hint">Pre-filled into the task when a request is created. Fields marked
        <b>fixed</b> or <b>hidden</b> on the task type can only be set here — the requester cannot
        change them, so a required one needs a value. Values that must come from the request at run
        time are input mappings on the task type, not defaults.</span>
      <div class="formgrid" style="padding:0;max-width:none">
        ${d.params.length? d.params.map(p=>{
          const v = (step.defaults||{})[p.name] ?? '';
          const flag = p.hidden   ? ' <span class="pill warn">hidden</span>'
                     : p.readonly ? ' <span class="pill neutral">fixed</span>' : '';
          /* Task settings are fixed at creation, so a template step's required
             fields can ONLY come from these defaults. */
          const warn = (p.required && !v)
            ? `<span class="hint" style="color:var(--bad)">Required, and the requester cannot set
                it — give it a value here.</span>` : '';
          if(p.type==='enum') return `<div class="field"><label>${esc(p.label)}${flag}</label>
            <select data-rt="cfg" data-i="${i}" data-k="${p.name}">
              <option value="">—</option>
              ${(p.values||[]).map(o=>`<option ${o===v?'selected':''}>${esc(o)}</option>`).join('')}
            </select>${warn}</div>`;
          return `<div class="field"><label>${esc(p.label)}${flag}</label>
            <input type="text" data-rt="cfg" data-i="${i}" data-k="${p.name}"
              value="${esc(v)}" placeholder="${esc(p.placeholder||'')}">${warn}</div>`;
        }).join('') : `<div style="font-size:12.5px;color:var(--ink-3)">This task type has no
          configuration fields.</div>`}
      </div>

      <h4 class="rtsec">Runtime configuration</h4>
      <span class="hint">How the engine behaves when it reaches this step. None of it is shown to
        the requester or editable by them — but all of it is inside the approval hash, because what
        an approver approved includes how the step behaves.</span>

      ${d.manual?`
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
      <div class="field" style="margin-top:8px;max-width:220px">
        <label>Due by</label>
        <input type="text" data-rt="dueby" data-i="${i}" value="${esc(rc(step).dueBy||'')}"
          placeholder="12.09.2026">
      </div>

      <h5>If the person declines</h5>
      <select data-rt="onrefusal" data-i="${i}" style="width:auto">
        <option value="" ${!rc(step).onRefusal?'selected':''}>Use the task type's default (${esc(d.onRefusalDefault||'Send back')})</option>
        ${['Send back','Fail the task','Not allowed'].map(v=>
          `<option ${rc(step).onRefusal===v?'selected':''}>${v}</option>`).join('')}
      </select>`:''}

      <h5>Skip this step when…</h5>
      <span class="hint">Evaluated once, when the run reaches this step. If it matches, the step is
        recorded as <b>skipped</b> and the run carries straight on.</span>
      ${ruleRows(rc(step),'skipWhen',i,dataParams,'Never skipped.')}

      <h5>Do not start until…</h5>
      <span class="hint">Checked at run time, because the value may be produced by an earlier step.
        If it is not satisfied the run parks on a blocker until somebody supplies it.</span>
      ${ruleRows(rc(step),'requires',i,dataParams,'No precondition.')}
    </div>`:''}
  </div>`;
}

function defaultsSummary(d,step){
  const vals = (d.params||[]).filter(p=>!p.hidden && (step.defaults||{})[p.name])
    .map(p=>`${p.label}: ${step.defaults[p.name]}`);
  return vals.length ? vals.join(' · ') : 'no defaults set';
}

/* Both rule lists are TaskRule[] of kind 'data' — the same shape the gate uses. */
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

function defFlow(){
  const flow = S.definition.taskFlow||[];
  const uses = S.requests.length;
  return `<div style="padding:15px">
    <p style="margin:0 0 4px;color:var(--ink-3);font-size:13px">
      The ordered steps every request of this type starts with. Creating a request instantiates this
      flow — the requester gets the process, not an empty list.</p>
    <p style="margin:0 0 14px;color:var(--ink-3);font-size:12.5px">
      Steps run in order. A step may be <b>skipped</b> by a condition, but there is no branching and
      no parallelism — that is deliberate, and it is the line that keeps this from becoming a second
      workflow engine.</p>

    <div class="flowlist">
      ${flow.length? flow.map(flowStep).join('')
        : `<div class="empty">No steps yet. A request created from this type would start empty.</div>`}
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="btn" data-rt="add-step">${I.plus} Add a step</button>
      <span class="hint">${uses} existing request${uses===1?'':'s'} — already instantiated, and
        unaffected by changes here.</span>
    </div>
  </div>`;
}

/* ------------------------------------------------------------ status graph */
function defWorkflow(){
  const box=(x,y,w,label,tone)=>{
    const fill = tone==='ok'?'var(--ok-soft)':tone==='bad'?'var(--bad-soft)':tone==='blue'?'var(--accent-soft)':'var(--surface-2)';
    const line = tone==='ok'?'var(--ok-line)':tone==='bad'?'var(--bad-line)':tone==='blue'?'var(--accent-line)':'var(--border-strong)';
    const ink  = tone==='ok'?'var(--ok)':tone==='bad'?'var(--bad)':tone==='blue'?'var(--accent)':'var(--ink-2)';
    return `<g><rect x="${x}" y="${y}" width="${w}" height="34" rx="6" fill="${fill}" stroke="${line}"/>
      <text x="${x+w/2}" y="${y+22}" text-anchor="middle" fill="${ink}"
        style="font:600 11.5px var(--sans);letter-spacing:.05em">${label}</text></g>`;
  };
  const arrow=(x1,y1,x2,y2,dash)=>`<path d="M${x1} ${y1} L${x2} ${y2}" stroke="var(--border-strong)"
      stroke-width="1.4" marker-end="url(#ah)" ${dash?'stroke-dasharray="4 3"':''} fill="none"/>`;
  return `<div class="graph">
    <svg width="720" height="200" role="img" aria-label="Status workflow graph">
      <defs><marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0 0 L8 4 L0 8 z" fill="var(--border-strong)"/></marker></defs>
      ${box(10,26,96,'OPEN','blue')}
      ${box(186,26,110,'APPROVED','ok')}
      ${box(376,26,116,'COMPLETED','')}
      ${box(572,26,110,'ARCHIVED','')}
      ${box(186,124,110,'REJECTED','bad')}
      ${arrow(108,43,184,43)}
      ${arrow(298,43,374,43)}
      ${arrow(494,43,570,43)}
      ${arrow(240,60,240,122,true)}
      ${arrow(186,60,110,60,true)}
      <text x="150" y="34" text-anchor="middle" fill="var(--ink-3)" style="font:400 10px var(--mono)">Administrator</text>
      <text x="336" y="34" text-anchor="middle" fill="var(--ink-3)" style="font:400 10px var(--mono)">NetOps</text>
      <text x="532" y="34" text-anchor="middle" fill="var(--ink-3)" style="font:400 10px var(--mono)">Administrator</text>
      <text x="250" y="96" fill="var(--ink-3)" style="font:400 10px var(--mono)">reject</text>
      <text x="118" y="74" fill="var(--ink-3)" style="font:400 10px var(--mono)">send back</text>
    </svg>
    <p style="margin:12px 0 0;color:var(--ink-3);font-size:12.5px;max-width:60ch">
      Each arrow carries the roles allowed to make that move, so who may advance a request is a
      setting, not a code change. This is the transition editor AixBOMS already uses for ticket
      status.
    </p>
  </div>`;
}

/* -------------------------------------------------------- data parameters */
function defData(){
  return `<div style="padding:15px">
    <p style="margin:0 0 12px;color:var(--ink-3);font-size:13px">
      Fields copied into every new request. <b>Author</b> fields are the requester's and are covered
      by the approval hash, so changing one dismisses sign-off — and they are frozen while a run is in
      progress. <b>Execution</b> fields are written by a task's output mapping and sit outside the
      hash, which is why a run does not dismiss its own approvals.</p>
    <div class="rows" style="box-shadow:none">
      ${S.definition.dataParameters.map(p=>`<div class="row" style="cursor:default">
        <div class="rmain"><div class="rtitle"><strong>${esc(p.label)}</strong>
          <span class="pill neutral">${p.type}</span>
          <span class="pill ${p.owner==='EXECUTION'?'warn':'blue'}">${p.owner==='EXECUTION'?'execution':'author'}</span></div>
          <div class="rmeta"><span class="mono">${esc(p.name)}</span><span class="dot">·</span>
          <span>default ${esc(String(p.defaultValue))}</span></div></div>
      </div>`).join('')}
    </div>
  </div>`;
}


/* ============================ events ============================ */
function dlgAddStep(){
  openModal(`<div class="dialog" role="dialog" aria-modal="true" aria-label="Add a step">
    <div class="dhead"><h2>Add a step to the flow</h2>
      <button class="iconbtn" data-act="close">${I.cross}</button></div>
    <div class="dbody">
      <p style="margin:0;color:var(--ink-3);font-size:13px">
        It goes at the end; reorder it with the arrows. The catalogue is authored under
        <b>Task types</b>.</p>
      <div class="tiles">
        ${Object.values(TASK_DEFS).map(d=>`<button class="tile" data-rt="pick-step" data-def="${d.name}">
          <span class="ti">${d.icon}</span><b>${esc(d.label)}</b><small>${esc(d.desc)}</small>
        </button>`).join('')}
      </div>
    </div>
  </div>`);
}

function dlgRtExport(){
  openModal(`<div class="dialog wide" role="dialog" aria-modal="true" aria-label="Export">
    <div class="dhead"><h2>request-types.json</h2>
      <button class="iconbtn" data-act="close">${I.cross}</button></div>
    <div class="dbody">
      <p style="margin:0;color:var(--ink-3);font-size:13px">The request type as the server would
        store it — flow, defaults, step rules, data parameters and gate rules. This is the whole
        process definition, and there is no code in it.</p>
      <textarea id="rt-json" readonly rows="20" class="mono"
        style="font-size:11.5px;line-height:1.45">${esc(requestTypeJson())}</textarea>
    </div>
    <div class="dfoot"><button class="btn" data-act="close">Close</button>
      <button class="btn primary" data-rt="copy">Copy</button></div>
  </div>`);
}
function dlgRtImport(){
  openModal(`<div class="dialog wide" role="dialog" aria-modal="true" aria-label="Import">
    <div class="dhead"><h2>Import a request type</h2>
      <button class="iconbtn" data-act="close">${I.cross}</button></div>
    <div class="dbody">
      <p style="margin:0;color:var(--ink-3);font-size:13px">Paste a
        <span class="mono">request-types.json</span> document. It replaces the current request type;
        requests already raised keep the flow they were instantiated from.</p>
      <textarea id="rt-import" rows="18" class="mono" style="font-size:11.5px"
        placeholder='{ "apiVersion": "${RT_API}", "requestTypes": [ … ] }'></textarea>
    </div>
    <div class="dfoot"><button class="btn" data-act="close">Cancel</button>
      <button class="btn primary" data-rt="do-import">Import</button></div>
  </div>`);
}

document.addEventListener('click', e=>{
  const btn = e.target.closest('[data-rt]');
  if(!btn) return;
  const flow = S.definition.taskFlow;
  const i = +btn.dataset.i;
  switch(btn.dataset.rt){
    case 'export': dlgRtExport(); break;
    case 'import': dlgRtImport(); break;
    case 'copy':{
      const ta = document.getElementById('rt-json');
      if(ta){ ta.select(); try{ document.execCommand('copy'); }catch(_){} }
      toast('Copied'); break;
    }
    case 'do-import':{
      const ta = document.getElementById('rt-import');
      let doc;
      try{ doc = JSON.parse(ta.value); }
      catch(err){ toast('That is not valid JSON'); break; }
      const bad = checkApiVersion(doc);
      if(bad){ toast(bad); break; }
      if(!Array.isArray(doc.requestTypes) || !doc.requestTypes.length){
        toast('Expected { requestTypes: [ … ] }'); break;
      }
      const rt = doc.requestTypes[0];
      if(!Array.isArray(rt.taskFlow)){ toast('That request type has no taskFlow'); break; }
      const unknown = rt.taskFlow.map(s=>s.taskDefinition).filter(n=>!TASK_DEFS[n]);
      if(unknown.length){ toast(`Unknown task type: ${unknown[0]}`); break; }
      REQUEST_TYPE_DOC = doc;
      S.definition = currentRequestType();
      S.flowOpen = null;
      closeModal(); render(); toast('Request type replaced'); break;
    }
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
      flow.push({stepId:id, taskDefinition:btn.dataset.def, required:false, defaults:{},
        runtimeConfig:{onRefusal:null, skipWhen:[], requires:[]}});
      S.flowOpen = id;
      closeModal(); render(); toast('Step added — set its defaults'); break;
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
  const el = e.target; const rt = el.dataset.rt; if(!rt) return;
  const flow = S.definition.taskFlow;
  const i = +el.dataset.i;
  if(rt==='required'){ flow[i].required = el.checked; render(); return; }
  if(rt==='cfg'){ flow[i].defaults[el.dataset.k] = el.value; render(); return; }
  if(rt==='onrefusal'){ rc(flow[i]).onRefusal = el.value || null; render(); return; }
  if(rt==='wrole'){
    const roles = rc(flow[i]).assignedRoles, role = el.dataset.role;
    if(el.checked){ if(!roles.includes(role)) roles.push(role); }
    else rc(flow[i]).assignedRoles = roles.filter(x=>x!==role);
    render(); return;
  }
  if(rt==='dueby'){ rc(flow[i]).dueBy = el.value.trim() || null; render(); return; }
  if(rt==='rule-path'){ rc(flow[i])[el.dataset.w][+el.dataset.j].path = el.value; render(); return; }
  if(rt==='rule-op'){ rc(flow[i])[el.dataset.w][+el.dataset.j].op = el.value; render(); return; }
});

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
.flowbody .hint{display:block;margin-bottom:8px}
.flowbody .formgrid{grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}
</style>`);
