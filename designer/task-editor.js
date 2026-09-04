/* ===========================================================================
   Task Editor.

   Owns the task-definition model: the catalogue loaded from
   task-definitions.json.js, the binding resolver that turns a task type plus a
   task item into an actual action call, and the editor UI for authoring types.

   A task type is a PURE FUNCTION: a signature — inputs it needs, outputs it
   produces — and, for a server task, the action that implements it. It has NO
   reference to any request. Where each input comes from and where each output
   is stored is decided per use, in the request type's flow: the request type
   is the call site. That wiring lives on the TASK ITEM (inputBindings /
   outputBindings, copied from the flow step at instantiation), which is why
   the resolver here takes the item, not just the definition.

   index.html is a *consumer* of this — it reads TASK_DEFS and calls the
   runtime helpers. Both files are classic scripts, so they share one global
   lexical scope; this one loads second and may reference I, S, esc, fnv,
   stamp, render, toast from index.html at call time.

   The rule that governs the whole file: ${request.foo} is a RENDERING of a
   structured binding, never a language. Nothing here parses or evaluates a
   string. Resolution is a dictionary lookup over two source kinds.
   =========================================================================== */
"use strict";

/* ============================ server action registry ============================ */
/* Stands in for GET /actions — the annotated Groovy/Java the server can already
   run. Read-only here: you pick one, you do not author one. */
const SERVER_ACTIONS = {
  digitallySign:{
    name:'digitallySign', label:'Digitally sign',
    description:'de.aixpertsoft.taskrequest.actions.DigitallySignAction',
    parameters:[
      {name:'text',  type:'string', required:true},
      {name:'signer',type:'string'},
    ],
    outParameters:[{name:'sha256',type:'string'},{name:'signedAt',type:'string'}],
  },
  sendMail:{
    name:'sendMail', label:'Send mail',
    description:'de.aixpertsoft.taskrequest.actions.SendMailAction',
    parameters:[
      {name:'from',     type:'string', required:true},
      {name:'to',       type:'string', required:true},
      {name:'subject',  type:'string', required:true},
      {name:'body',     type:'string', required:true},
      {name:'signature',type:'string'},
    ],
    outParameters:[{name:'status',type:'string'},{name:'messageId',type:'string'},
                   {name:'accepted',type:'string'}],
  },
  printMessage:{
    name:'printMessage', label:'Print message',
    description:'de.aixpertsoft.taskrequest.actions.PrintMessageAction',
    parameters:[
      {name:'message',type:'string',required:true},
      {name:'level',  type:'enum', values:['INFO','WARN','ERROR']},
    ],
    outParameters:[{name:'printedAt',type:'string'}],
  },
};

const ICON_KEYS = ['doc','pen','stamp','mail','box','log','gear','hello'];

/* A recipient the mail server cannot deliver to. Type one of these into the
   draft step's Recipients field to see what a failed task looks like. */
const UNDELIVERABLE = /@(invalid|ghost)\./i;

/* ============================ the catalogue ============================ */
/* TASK_DOC is the JSON document — the thing you would POST to the server.
   TASK_DEFS is the materialised view every consumer reads. */
const TD_API = 'aixboms.taskdefinition/v2';
let TASK_DOC = window.TASK_DEFINITIONS || {apiVersion:TD_API, definitions:[]};

/* The stored shape keeps the kind-specific implementation under
   serverActionConfig / manualTaskConfig; the signature (inputs/outputs) is
   top-level, because it is the task's face regardless of kind. The runtime
   shape is flat. flatten() and nest() are the only two places that know the
   difference. */
function flatten(raw){
  const s = raw.serverActionConfig || {};
  const m = raw.manualTaskConfig   || {};
  const copy = x => JSON.parse(JSON.stringify(x || []));
  return {
    name:raw.name||'', label:raw.label||'', icon:raw.icon||'gear',
    description:raw.description||'', kind:raw.kind||'SERVER',
    action: s.action||'',
    inputs: copy(raw.inputs),
    outputs: copy(raw.outputs),
    resultParams: copy(m.resultParams),
    /* The verb on the button that closes it — "Submit draft", "Submit decision". */
    completeLabel: m.completeLabel || 'Complete',
  };
}
function nest(d){
  const out = {name:d.name, label:d.label, icon:d.icon, description:d.description||'',
               kind:d.kind};
  if(d.kind==='SERVER'){
    out.inputs  = d.inputs||[];
    out.outputs = d.outputs||[];
    out.serverActionConfig = {action:d.action||''};
  }else{
    out.manualTaskConfig = {completeLabel:d.completeLabel||'Complete',
                            resultParams:d.resultParams||[]};
  }
  return out;
}

/* The signature, kind-independent. A manual task's inputs are nothing (its
   context comes from runtimeConfig.display); its outputs are the form's
   answers — declared once as resultParams, never duplicated. */
function taskInputs(def){  return def.kind==='MANUAL' ? [] : (def.inputs||[]); }
function taskOutputs(def){ return def.kind==='MANUAL' ? (def.resultParams||[]) : (def.outputs||[]); }

function materialise(d){
  const f = flatten(d);
  return Object.assign(f, {
    desc: f.description,
    iconKey: f.icon,
    icon: (typeof I!=='undefined' && I[f.icon]) || (typeof I!=='undefined' ? I.gear : ''),
    manual: f.kind === 'MANUAL',
  });
}
const TASK_DEFS = {};
function reloadDefs(){
  Object.keys(TASK_DEFS).forEach(k=>{ delete TASK_DEFS[k]; });
  (TASK_DOC.definitions||[]).forEach(d=>{ TASK_DEFS[d.name] = materialise(d); });
}
reloadDefs();

/* ============================ resolution ============================ */
/* Two source kinds. No third, and no operators — see the file header. The
   bindings live on the task item, put there by the request type. */
function resolveSource(src, r){
  if(!src) return undefined;
  switch(src.kind){
    case 'LITERAL':      return src.value;
    case 'REQUEST_DATA': return r ? r.data[src.path] : undefined;
    default:             return undefined;
  }
}
function resolveInputs(def, t, r){
  const out = {};
  taskInputs(def).forEach(p=>{ out[p.name] = resolveSource((t.inputBindings||{})[p.name], r); });
  return out;
}
/* Which of the task's REQUIRED inputs would resolve to nothing, and where each
   was supposed to come from. This is the generic "you cannot run this yet":
   the signature's own declared contract, checked against what the wiring can
   actually deliver right now. */
function missingInputs(def, t, r){
  if(!def || def.kind!=='SERVER') return [];
  const inputs = resolveInputs(def, t, r);
  return taskInputs(def).filter(p=>p.required).filter(p=>{
    const v = inputs[p.name];
    return v===undefined || v===null || String(v).trim()==='';
  }).map(p=>({target:p.name, source:(t.inputBindings||{})[p.name]||null}));
}
/* Where a missing value was supposed to come from, in words a person can act on. */
function describeSource(src){
  if(!src) return 'it is not wired to anything';
  if(src.kind==='LITERAL') return 'its fixed value is empty';
  if(src.kind==='REQUEST_DATA'){
    const p=(typeof S!=='undefined'?S.definition.dataParameters:[]).find(x=>x.name===src.path);
    return p&&p.owner==='EXECUTION'
      ? `request.${src.path} is written by an earlier step that has not run yet`
      : `request.${src.path} is empty`;
  }
  return 'its source is unknown';
}

function hasSource(src){
  if(!src || !src.kind) return false;
  if(src.kind==='LITERAL') return src.value!==undefined && src.value!=='';
  return !!src.path;
}
/* The signature, rendered for people: printMessage(message, level) → printedAt.
   Never read back: no code path parses this string. */
function renderCall(def){
  if(!def || def.kind!=='SERVER') return '(no server action — a person closes this task)';
  const args = taskInputs(def).map(p=>p.name+(p.required?'*':'')).join(', ');
  const rets = taskOutputs(def).map(o=>o.name).join(', ');
  return `${def.action||'?'}(${args})${rets?` → ${rets}`:''}`;
}
function renderResolvedCall(def, t, r){
  if(def.kind!=='SERVER') return def.label;
  const inputs = resolveInputs(def, t, r);
  const args = taskInputs(def).map(p=>`${p.name}=${JSON.stringify(inputs[p.name] ?? null)}`).join(', ');
  return `${def.action} ${args}`;
}

/* ============================ execution helpers ============================ */
/* Simulated POST /actions/run. Real outParameters, fake work. */
function runServerAction(def, inputs, r){
  switch(def.action){
    case 'digitallySign':
      return {sha256: fnv(String(inputs.text||'')) + fnv(String(inputs.text||'').split('').reverse().join('')),
              signedAt: stamp()};
    case 'sendMail':{
      const to = String(inputs.to||'').split(',').map(s=>s.trim()).filter(Boolean);
      return {status:'DELIVERED', messageId:'<'+fnv(String(inputs.subject||''))+'@aixpertsoft.de>',
              accepted:String(to.length)};
    }
    case 'printMessage': return {printedAt:stamp()};
    default:             return {};
  }
}
/* Output bindings are how a task stores something on the request — the id of a
   created component, the document a later task reads. The request type wired
   them; this is the only writer of those data fields. */
function applyOutputs(def, t, outs, r){
  const written = {};
  taskOutputs(def).forEach(o=>{
    const b = (t.outputBindings||{})[o.name];
    if(!b || b.kind!=='REQUEST_DATA' || !b.path) return;
    const v = outs[o.name];
    if(v===undefined) return;
    r.data[b.path] = v;
    written[b.path] = v;
  });
  return written;
}
/* The one simulated failure: the mail server rejects an undeliverable recipient. */
function actionFails(def, inputs){
  return def.action==='sendMail' && UNDELIVERABLE.test(String(inputs.to||''));
}
function failureFor(def, inputs){
  const bad = String(inputs.to||'').split(',').map(s=>s.trim()).find(a=>UNDELIVERABLE.test(a));
  return {
    message:`550 5.1.1 <${bad}>: recipient address rejected — domain not found.`,
    trace:`  at de.aixpertsoft.taskrequest.actions.SendMailAction.perform(SendMailAction.java:96)\n`
        + `  at de.aixpertsoft.action.ActionExecutor.run(ActionExecutor.java:64)`,
    source:'de.aixpertsoft.taskrequest.actions.SendMailAction:96',
  };
}
/* A one-line "how this use is configured" — the fixed values its wiring set. */
function taskSummary(def, t){
  const vals = taskInputs(def).map(p=>{
    const b = (t.inputBindings||{})[p.name];
    return b && b.kind==='LITERAL' && b.value ? b.value : null;
  }).filter(Boolean).slice(0,3);
  return vals.length ? vals.join(' · ') : '—';
}

/* ============================ validation ============================ */
/* Only the signature is validated here. Whether a USE of the type is fully
   wired is the request type's business — flowIssues() checks it there. */
function defIssues(d){
  const out = [];
  if(!String(d.name||'').trim())  out.push('Give it a name — this is the id requests will store.');
  if(!String(d.label||'').trim()) out.push('Give it a label.');
  if(d.kind==='SERVER'){
    if(!SERVER_ACTIONS[d.action]) out.push('Pick the server action this task runs.');
  }else{
    if(!(d.resultParams||[]).length) out.push('A manual task needs at least one form field.');
    (d.resultParams||[]).forEach((p,i)=>{
      if(!String(p.name||'').trim()) out.push(`Form field ${i+1} has no name.`);
    });
  }
  return out;
}
function usedBy(name){
  return (typeof S!=='undefined' ? S.requests : []).filter(r=>r.taskItems.some(t=>t.def===name)).length;
}

/* ============================ editor state ============================ */
const E = {screen:'list', draft:null, original:null};

function blankDef(){
  return {name:'', label:'', icon:'gear', description:'', kind:'SERVER',
          action:'', inputs:[], outputs:[], resultParams:[]};
}
function rawDef(name){
  return (TASK_DOC.definitions||[]).find(d=>d.name===name);
}
function startEdit(name){
  const raw = name ? rawDef(name) : null;
  /* The editor works on the flat shape; nest() puts it back on save. */
  E.draft = raw ? flatten(raw) : blankDef();
  syncSignature(E.draft);
  E.original = name || null;
  E.screen = 'edit';
  render();
}
/* The signature mirrors the chosen action's declared contract: one input per
   parameter, one output per return value. Names, types and requiredness come
   from the action; the author supplies the labels the request designer will
   wire against. Re-picking the action keeps labels for names that survive. */
function syncSignature(d){
  if(d.kind==='MANUAL'){ d.inputs=[]; d.outputs=[]; return; }
  const a = SERVER_ACTIONS[d.action];
  if(!a){ d.inputs=[]; d.outputs=[]; return; }
  const nice = n => n.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase());
  d.inputs = a.parameters.map(p=>{
    const prev = (d.inputs||[]).find(x=>x.name===p.name) || {};
    return {name:p.name, label:prev.label||nice(p.name),
            type:p.type==='enum'?'enum':'text',
            required:!!p.required,
            ...(p.values?{values:p.values.slice()}:{}),
            placeholder:prev.placeholder||''};
  });
  d.outputs = a.outParameters.map(o=>{
    const prev = (d.outputs||[]).find(x=>x.name===o.name) || {};
    return {name:o.name, label:prev.label||nice(o.name), type:'text'};
  });
}
function saveDraft(){
  const d = E.draft;
  const issues = defIssues(d);
  if(issues.length){ toast(issues[0]); return; }
  const clean = nest(JSON.parse(JSON.stringify(d)));
  const list = TASK_DOC.definitions;
  const at = E.original ? list.findIndex(x=>x.name===E.original) : -1;
  if(at>=0) list[at] = clean; else list.push(clean);
  reloadDefs();
  E.screen='list'; E.draft=null; E.original=null;
  render(); toast(at>=0?'Task type saved':'Task type created');
}
function deleteDef(name){
  const n = usedBy(name);
  if(n){ toast(`${n} request${n===1?'':'s'} still use this task type`); return; }
  TASK_DOC.definitions = TASK_DOC.definitions.filter(d=>d.name!==name);
  reloadDefs(); render(); toast('Task type removed');
}
function exportJson(){
  return JSON.stringify(TASK_DOC, null, 2);
}

/* ============================ views ============================ */
function viewTaskDefs(){
  return E.screen==='edit' ? teEditor() : teList();
}

function teList(){
  const defs = TASK_DOC.definitions||[];
  return `
  <div class="page-head">
    <div>
      <h1>Task types</h1>
      <p>The catalogue requests choose from. Loaded from
        <span class="mono">data/task-definitions.json.js</span> — the document the server would return
        from <span class="mono">GET /taskdefinitions</span>.</p>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn" data-te="export">${I.log} Export JSON</button>
      <button class="btn" data-te="import">Import JSON</button>
      <button class="btn primary" data-te="new">${I.plus} New task type</button>
    </div>
  </div>
  <div class="rows">
    ${defs.map(raw=>{
      const d = TASK_DEFS[raw.name]; const n = usedBy(raw.name);
      return `<div class="row" data-te="edit" data-name="${esc(raw.name)}" tabindex="0" role="button">
        <div class="task-ico" style="margin-top:2px">${d.icon}</div>
        <div class="rmain">
          <div class="rtitle">
            <strong>${esc(d.label)}</strong>
            <span class="pill ${d.manual?'warn':'blue'}">${d.manual?'manual':'server'}</span>
            <span class="id mono">${esc(raw.name)}</span>
          </div>
          <div class="rmeta">
            ${d.manual
              ? `<span>closed by a person</span>
                 <span class="dot">·</span><span>${(d.resultParams||[]).length} form field${(d.resultParams||[]).length===1?'':'s'}</span>`
              : `<span class="mono">${esc(d.action||'—')}</span>
                 <span class="dot">·</span><span>needs ${taskInputs(d).length} · produces ${taskOutputs(d).length}</span>`}
            <span class="dot">·</span><span>${n?`used by ${n} request${n===1?'':'s'}`:'not used yet'}</span>
          </div>
        </div>
        <div class="rside">${esc(renderCall(d).slice(0,46))}${renderCall(d).length>46?'…':''}</div>
      </div>`;
    }).join('')}
  </div>
  <p style="margin:14px 0 0;color:var(--ink-3);font-size:12.5px;max-width:80ch">
    A task type is a <b>pure function</b>: what it needs, what it produces, and — for a server
    task — the annotated Groovy or Java action that implements it. It knows nothing about any
    request. Where its inputs come from and where its results are stored is wired per use, in
    the request type's task flow.</p>`;
}

/* ---- one row of the form-field editor (manual tasks) ---- */
function fieldRows(list, which){
  if(!list.length) return `<div class="empty" style="padding:14px">No fields yet.</div>`;
  return list.map((p,i)=>`
    <div class="te-field">
      <span class="te-num mono">${i+1}</span>
      <input type="text" data-te-f="${which}" data-i="${i}" data-k="name"  value="${esc(p.name||'')}"  placeholder="name" style="width:120px">
      <input type="text" data-te-f="${which}" data-i="${i}" data-k="label" value="${esc(p.label||'')}" placeholder="label" style="width:150px">
      <select data-te-f="${which}" data-i="${i}" data-k="type" style="width:auto">
        ${['text','enum','boolean'].map(t=>`<option ${p.type===t?'selected':''}>${t}</option>`).join('')}
      </select>
      ${p.type==='enum'
        ? `<input type="text" data-te-f="${which}" data-i="${i}" data-k="values"
             value="${esc((p.values||[]).join(', '))}" placeholder="option, option" style="flex:1;min-width:120px">`
        : `<input type="text" data-te-f="${which}" data-i="${i}" data-k="placeholder"
             value="${esc(p.placeholder||'')}" placeholder="placeholder" style="flex:1;min-width:120px">`}
      <span class="flags">
        ${[['required','required','Must have a value']].map(([k,txt,tip])=>
          `<label class="flagchip ${p[k]?'on':''}" title="${tip}">
            <input type="checkbox" data-te-f="${which}" data-i="${i}" data-k="${k}" ${p[k]?'checked':''}>${txt}
          </label>`).join('')}
      </span>
      <button class="btn sm ico" data-te="del-field" data-f="${which}" data-i="${i}" title="Remove field">${I.trash}</button>
    </div>`).join('');
}

/* ---- signature rows: names and requiredness fixed by the action, labels
        authored here — they are what the request designer wires against ---- */
function sigRows(list, which){
  return list.map((p,i)=>`
    <div class="te-map">
      <span class="te-target mono">${esc(p.name)}${p.required?'<span class="req"> *</span>':''}</span>
      <input type="text" data-te-sig="${which}" data-i="${i}" data-k="label"
        value="${esc(p.label||'')}" placeholder="label" style="width:190px">
      ${which==='inputs'?`
      <input type="text" data-te-sig="${which}" data-i="${i}" data-k="placeholder"
        value="${esc(p.placeholder||'')}" placeholder="example value (shown as a hint)"
        style="flex:1;min-width:130px">`:''}
    </div>`).join('');
}

function teEditor(){
  const d = E.draft;
  const action = SERVER_ACTIONS[d.action];
  const issues = defIssues(d);

  return `
  <div class="rq-head">
    <button class="backlink" data-te="back">${I.chevL} All task types</button>
    <div class="rq-title">
      <h1>${E.original?`Edit ${esc(d.label||d.name)}`:'New task type'}</h1>
      <div class="rq-actions">
        ${E.original?`<button class="btn ghost" data-te="delete" data-name="${esc(E.original)}">${I.trash} Delete</button>`:''}
        <button class="btn" data-te="back">Cancel</button>
        <button class="btn primary" data-te="save">Save</button>
      </div>
    </div>
  </div>

  <div class="te-body">
    <div style="display:grid;gap:12px">

      <section class="panel">
        <div class="panel-head"><h3>Identity</h3></div>
        <div class="panel-body" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));display:grid">
          <div class="field"><label>Name <span class="req">*</span></label>
            <input type="text" data-te-d="name" value="${esc(d.name)}" ${E.original?'disabled':''}
              placeholder="printMessage">
            <span class="hint">${E.original?'The id is immutable — requests store it.':'The id requests will store.'}</span></div>
          <div class="field"><label>Label <span class="req">*</span></label>
            <input type="text" data-te-d="label" value="${esc(d.label)}" placeholder="Print message"></div>
          <div class="field"><label>Icon</label>
            <select data-te-d="icon">${ICON_KEYS.map(k=>`<option ${d.icon===k?'selected':''}>${k}</option>`).join('')}</select></div>
          <div class="field" style="grid-column:1/-1"><label>Description</label>
            <input type="text" data-te-d="description" value="${esc(d.description||'')}"
              placeholder="What this task does, in one line."></div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head"><h3>Type</h3></div>
        <div class="panel-body">
          <div class="seg">
            <button class="${d.kind==='SERVER'?'on':''}" data-te="kind" data-v="SERVER">Server action</button>
            <button class="${d.kind==='MANUAL'?'on':''}" data-te="kind" data-v="MANUAL">Manual</button>
          </div>
          <span class="hint">${d.kind==='SERVER'
            ? 'The server runs it. Pick the action below — its contract becomes this task’s signature.'
            : 'A person carries it out. Execution parks here until they close it.'}</span>
        </div>
      </section>

      ${d.kind==='SERVER'?`
      <section class="panel">
        <div class="panel-head"><h3>Server action</h3>
          ${action?`<span class="pill blue">${action.parameters.length} in · ${action.outParameters.length} out</span>`:''}</div>
        <div class="panel-body">
          <div class="field">
            <label>Action <span class="req">*</span></label>
            <select data-te-d="action">
              <option value="">choose an action…</option>
              ${Object.values(SERVER_ACTIONS).map(a=>
                `<option value="${a.name}" ${d.action===a.name?'selected':''}>${esc(a.label)} — ${esc(a.name)}</option>`).join('')}
            </select>
            <span class="hint">From <span class="mono">GET /actions</span>. Adding a new one is code;
              naming a use of it is not.</span>
          </div>
          ${action?`<div class="mono" style="color:var(--ink-3);font-size:11px">${esc(action.description)}</div>`:''}
        </div>
      </section>

      ${action?`
      <section class="panel">
        <div class="panel-head"><h3>What it needs</h3></div>
        <div class="panel-body">
          <span class="hint">The action's parameters, one row each. Names and which are required
            come from the action itself; you give each a label — that label is what the request
            designer sees when wiring values in. <span class="req">*</span> = the run cannot start
            this task without it.</span>
          ${sigRows(d.inputs,'inputs')}
        </div>
      </section>

      <section class="panel">
        <div class="panel-head"><h3>What it produces</h3></div>
        <div class="panel-body">
          <span class="hint">The action's return values. The request type decides which of them
            are kept, and on which request field — nothing is stored unless a use wires it.</span>
          ${sigRows(d.outputs,'outputs')}
        </div>
      </section>`:''}`:''}

      ${d.kind==='MANUAL'?`
      <section class="panel">
        <div class="panel-head"><h3>Form fields</h3>
          <span class="pill neutral">${(d.resultParams||[]).length}</span></div>
        <div class="panel-body">
          <span class="hint">The form shown to the person carrying out the step — a subject and a
            message, or just a comment. What they enter is what this task <b>produces</b>; the
            request type decides where each answer is stored.</span>
          ${fieldRows(d.resultParams||[],'resultParams')}
          <button class="btn sm" data-te="add-field" data-f="resultParams">${I.plus} Add field</button>
          <div class="field" style="margin-top:4px">
            <label>Button that closes it</label>
            <input type="text" data-te-d="completeLabel" value="${esc(d.completeLabel||'Complete')}"
              placeholder="Approve">
            <span class="hint">The verb the person sees — "Approve", "Submit draft", "Sign".</span>
          </div>
        </div>
      </section>`:''}
    </div>

    <aside class="rail"><div id="te-preview">${previewHTML(d,issues)}</div></aside>
  </div>`;
}

function previewHTML(d, issues){
  issues = issues || defIssues(d);
  return `
  <section class="panel">
    <div class="panel-head"><h3>The signature</h3></div>
    <div class="panel-body">
      <div class="te-call mono">${esc(renderCall(d))}</div>
      ${taskInputs(d).length?`
        <div style="font-size:12.5px;color:var(--ink-2)"><b>needs</b>
          ${taskInputs(d).map(p=>`<span class="kv">${esc(p.label||p.name)}${p.required?' *':''}</span>`).join(' ')}</div>`:''}
      ${taskOutputs(d).length?`
        <div style="font-size:12.5px;color:var(--ink-2)"><b>produces</b>
          ${taskOutputs(d).map(o=>`<span class="kv">${esc(o.label||o.name)}</span>`).join(' ')}</div>`:''}
      <span class="hint">A pure function: no request in sight. Each request type wires it —
        where inputs come from, which outputs are kept.</span>
    </div>
  </section>

  ${d.kind==='MANUAL'?`
  <section class="panel">
    <div class="panel-head"><h3>The form the person gets</h3></div>
    <div class="panel-body">
      ${(d.resultParams||[]).length ? (d.resultParams||[]).map(p=>`
        <div class="field">
          <label>${esc(p.label||p.name||'—')} ${p.required?'<span class="req">*</span>':''}</label>
          <input type="text" disabled placeholder="${esc(p.placeholder||'')}">
        </div>`).join('')
        : `<div style="font-size:12.5px;color:var(--ink-3)">No form fields yet.</div>`}
      <span class="hint">A boolean answer here is what the flow's transitions route on.</span>
    </div>
  </section>`:''}

  <section class="panel">
    <div class="panel-head"><h3>Ready?</h3>
      <span class="pill ${issues.length?'bad':'ok'}">${issues.length?`${issues.length} to fix`:'valid'}</span></div>
    <div class="panel-body">
      ${issues.length
        ? issues.map(x=>`<div class="grule fail"><span class="gi">${I.cross}</span><span class="gt">${esc(x)}</span></div>`).join('')
        : `<div class="grule pass"><span class="gi">${I.check}</span><span class="gt">This task type can be used in a request type.</span></div>`}
    </div>
  </section>`;
}

function paintPreview(){
  const el = document.getElementById('te-preview');
  if(el && E.draft) el.innerHTML = previewHTML(E.draft);
}

/* ============================ dialogs ============================ */
function dlgExport(){
  openModal(`<div class="dialog wide" role="dialog" aria-modal="true" aria-label="Export">
    <div class="dhead"><h2>task-definitions.json</h2>
      <button class="iconbtn" data-act="close">${I.cross}</button></div>
    <div class="dbody">
      <p style="margin:0;color:var(--ink-3);font-size:13px">The document as the server would store
        it. Every task type in the prototype is this and nothing more.</p>
      <textarea id="te-json" readonly rows="18" class="mono"
        style="font-size:11.5px;line-height:1.45">${esc(exportJson())}</textarea>
    </div>
    <div class="dfoot"><button class="btn" data-act="close">Close</button>
      <button class="btn primary" data-te="copy">Copy</button></div>
  </div>`);
}
function dlgImport(){
  openModal(`<div class="dialog wide" role="dialog" aria-modal="true" aria-label="Import">
    <div class="dhead"><h2>Import task definitions</h2>
      <button class="iconbtn" data-act="close">${I.cross}</button></div>
    <div class="dbody">
      <p style="margin:0;color:var(--ink-3);font-size:13px">Paste a
        <span class="mono">task-definitions.json</span> document. It replaces the whole catalogue.</p>
      <textarea id="te-import" rows="16" class="mono" style="font-size:11.5px"
        placeholder='{ "apiVersion": "${TD_API}", "definitions": [ … ] }'></textarea>
    </div>
    <div class="dfoot"><button class="btn" data-act="close">Cancel</button>
      <button class="btn primary" data-te="do-import">Import</button></div>
  </div>`);
}

/* ============================ events ============================ */
document.addEventListener('click', e=>{
  const btn = e.target.closest('[data-te]');
  if(!btn) return;
  const act = btn.dataset.te;
  const d = E.draft;
  switch(act){
    case 'new':    startEdit(null); break;
    case 'edit':   startEdit(btn.dataset.name); break;
    case 'back':   E.screen='list'; E.draft=null; E.original=null; render(); break;
    case 'save':   saveDraft(); break;
    case 'delete': deleteDef(btn.dataset.name); E.screen='list'; E.draft=null; render(); break;
    case 'export': dlgExport(); break;
    case 'import': dlgImport(); break;
    case 'copy':{
      const ta = document.getElementById('te-json');
      if(ta){ ta.select(); try{ document.execCommand('copy'); }catch(_){} }
      toast('Copied'); break;
    }
    case 'do-import':{
      const ta = document.getElementById('te-import');
      let doc;
      try{ doc = JSON.parse(ta.value); }
      catch(err){ toast('That is not valid JSON'); break; }
      if(!doc || !Array.isArray(doc.definitions)){ toast('Expected { definitions: [ … ] }'); break; }
      const major = String(doc.apiVersion||'').split('/')[1]||'';
      if(major !== TD_API.split('/')[1]){
        toast(`apiVersion ${doc.apiVersion||'(missing)'} is not ${TD_API}; this build cannot read it`); break;
      }
      TASK_DOC = doc; reloadDefs(); closeModal(); render(); toast('Catalogue replaced');
      break;
    }
    case 'kind':
      d.kind = btn.dataset.v;
      syncSignature(d); render(); break;
    case 'add-field':{
      const f = btn.dataset.f;
      if(!d[f]) d[f]=[];
      d[f].push({name:'', label:'', type:'text', required:false});
      render(); break;
    }
    case 'del-field':{
      d[btn.dataset.f].splice(+btn.dataset.i,1);
      render(); break;
    }
  }
});

/* Structural changes re-render; text typing only repaints the preview, so the
   caret stays where it is. */
document.addEventListener('change', e=>{
  const el = e.target; const d = E.draft; if(!d) return;

  if(el.dataset.teD!==undefined && el.dataset.teD){
    d[el.dataset.teD] = el.value;
    if(el.dataset.teD==='action') syncSignature(d);
    if(['action','icon'].includes(el.dataset.teD)){ render(); return; }
    paintPreview(); return;
  }
  if(el.dataset.teF){
    const list = d[el.dataset.teF], p = list[+el.dataset.i], k = el.dataset.k;
    /* The flag chips show their state through the .on class, which only a full
       render rebuilds — the checkbox inside them is invisible. So a flag toggle
       must render, not just repaint the preview, or the chip lags a click behind. */
    if(k==='required'){ p[k] = el.checked; render(); return; }
    if(k==='values') p.values = el.value.split(',').map(s=>s.trim()).filter(Boolean);
    else p[k] = el.value;
    if(k==='type'){ render(); return; }
    paintPreview(); return;
  }
  if(el.dataset.teSig){
    d[el.dataset.teSig][+el.dataset.i][el.dataset.k] = el.value;
    paintPreview(); return;
  }
});

document.addEventListener('input', e=>{
  const el = e.target; const d = E.draft; if(!d) return;
  if(el.dataset.teD){ d[el.dataset.teD] = el.value; paintPreview(); return; }
  if(el.dataset.teF && el.type==='text'){
    const p = d[el.dataset.teF][+el.dataset.i], k = el.dataset.k;
    if(k==='values') p.values = el.value.split(',').map(s=>s.trim()).filter(Boolean);
    else p[k] = el.value;
    paintPreview(); return;
  }
  if(el.dataset.teSig && el.type==='text'){
    d[el.dataset.teSig][+el.dataset.i][el.dataset.k] = el.value;
    paintPreview(); return;
  }
});

/* ============================ styles ============================ */
document.head.insertAdjacentHTML('beforeend', `<style>
.te-body{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:20px;align-items:start}
@media (max-width:980px){.te-body{grid-template-columns:1fr}}
.seg{display:inline-flex;border:1px solid var(--border-strong);border-radius:var(--r);overflow:hidden}
.seg button{background:var(--surface);border:0;padding:7px 14px;cursor:pointer;color:var(--ink-2);font-weight:500}
.seg button+button{border-left:1px solid var(--border-strong)}
.seg button.on{background:var(--accent);color:var(--accent-ink)}
.te-field{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:7px;border:1px solid var(--border);
  border-radius:var(--r);background:var(--surface-2)}
.te-field+.te-field{margin-top:6px}
.te-field input[type=text],.te-field select{padding:4px 7px;font-size:12.5px;background:var(--surface)}
.flags{display:flex;gap:3px}
.flagchip{display:inline-flex;align-items:center;padding:2px 7px;border-radius:20px;font-size:11px;
  border:1px solid var(--border);background:var(--surface);color:var(--ink-3);cursor:pointer;
  user-select:none;white-space:nowrap}
.flagchip.on{background:var(--accent-soft);border-color:var(--accent-line);color:var(--accent);
  font-weight:600}
.flagchip input{position:absolute;opacity:0;pointer-events:none}
.te-num{width:20px;height:20px;flex:none;display:grid;place-items:center;font-size:11px;
  border-radius:4px;background:var(--surface-3);color:var(--ink-3)}
.te-map{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 0}
.te-map+.te-map{border-top:1px solid var(--border)}
.te-map select,.te-map input[type=text]{padding:4px 7px;font-size:12.5px}
.te-target{min-width:110px;font-size:12.5px;color:var(--ink)}
.te-arrow{color:var(--ink-3)}
.te-contract{margin-top:4px;padding:9px 11px;border:1px solid var(--border);border-radius:var(--r);
  background:var(--surface-2);font-size:12.5px}
.te-call{font-size:11.5px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r);
  padding:7px 9px;color:var(--ink-2);word-break:break-word;line-height:1.5}
.te-call+.te-call{margin-top:5px}
#te-preview{display:grid;gap:12px;position:sticky;top:72px}
#te-preview .panel-body{gap:8px}
</style>`);
