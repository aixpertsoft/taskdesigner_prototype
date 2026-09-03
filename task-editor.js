/* ===========================================================================
   Task Editor.

   Owns the task-definition model: the catalogue loaded from
   task-definitions.json.js, the binding resolver that turns a definition plus a
   task item into an actual action call, and the editor UI for authoring them.

   index.html is a *consumer* of this — it reads TASK_DEFS and calls the four
   runtime helpers. Both files are classic scripts, so they share one global
   lexical scope; this one loads second and may reference I, S, esc, fnv, stamp,
   render, toast and OCCUPIED_PORTS from index.html at call time.

   The rule that governs the whole file: ${request.foo} is a RENDERING of a
   structured binding, never a language. Nothing here parses or evaluates a
   string. Resolution is a dictionary lookup over three source kinds.
   =========================================================================== */
"use strict";

/* ============================ server action registry ============================ */
/* Stands in for GET /actions — the annotated Groovy/Java the server can already
   run. Read-only here: you pick one, you do not author one. */
const SERVER_ACTIONS = {
  cablePatch:{
    name:'cablePatch', label:'Cable patch',
    description:'de.aixpertsoft.taskrequest.actions.CablePatchAction',
    parameters:[
      {name:'operation', type:'enum', values:['Connect','Disconnect'], required:true},
      {name:'sourcePort',type:'string', required:true},
      {name:'targetPort',type:'string', required:true},
      {name:'cableType', type:'string'},
    ],
    outParameters:[{name:'cableId', type:'string'}],
  },
  reservePort:{
    name:'reservePort', label:'Reserve port',
    description:'de.aixpertsoft.taskrequest.actions.ReservePortAction',
    parameters:[
      {name:'device',type:'string',required:true},
      {name:'port',  type:'string',required:true},
      {name:'until', type:'string'},
    ],
    outParameters:[{name:'reservationId',type:'string'}],
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
  generateDocument:{
    name:'generateDocument', label:'Generate document',
    description:'de.aixpertsoft.taskrequest.actions.GenerateDocumentAction',
    parameters:[
      {name:'template',type:'string',required:true},
      {name:'subject', type:'string'},
    ],
    outParameters:[{name:'documentId',type:'string'},{name:'fileName',type:'string'},
                   {name:'sha256',type:'string'}],
  },
  archiveDocument:{
    name:'archiveDocument', label:'Archive document',
    description:'de.aixpertsoft.taskrequest.actions.ArchiveDocumentAction',
    parameters:[
      {name:'documentId',type:'string',required:true},
      {name:'store',     type:'string',required:true},
    ],
    outParameters:[{name:'archiveRef',type:'string'}],
  },
  createComponent:{
    name:'createComponent', label:'Create component',
    description:'de.aixpertsoft.taskrequest.actions.CreateComponentAction',
    parameters:[
      {name:'type',type:'string',required:true},
      {name:'name',type:'string',required:true},
    ],
    outParameters:[{name:'componentId',type:'string'}],
  },
};

const ICON_KEYS = ['cable','port','hello','doc','box','pen','gear','log'];

/* ============================ the catalogue ============================ */
/* TASK_DOC is the JSON document — the thing you would POST to the server.
   TASK_DEFS is the materialised view every consumer reads. */
let TASK_DOC = window.TASK_DEFINITIONS || {apiVersion:'aixboms.taskdefinition/v1', definitions:[]};
const TASK_DEFS = {};

/* The stored shape is a discriminated union — the kind-specific fields live under
   serverActionConfig or manualTaskConfig, so a reader can see at a glance which
   half applies. The runtime shape is flat, because every consumer already reads
   def.params / def.inputs / def.resultParams. flatten() and nest() are the only
   two places that know about the difference. */
function flatten(raw){
  const s = raw.serverActionConfig || {};
  const m = raw.manualTaskConfig   || {};
  const copy = x => JSON.parse(JSON.stringify(x || []));
  return {
    name:raw.name||'', label:raw.label||'', icon:raw.icon||'gear',
    description:raw.description||'', kind:raw.kind||'SERVER',
    params: copy(raw.params),
    action: s.action||'', inputs: copy(s.inputs), outputs: copy(s.outputs),
    resultParams: copy(m.resultParams),
    onRefusalDefault: m.onRefusalDefault || 'Send back',
  };
}
function nest(d){
  const out = {name:d.name, label:d.label, icon:d.icon, description:d.description||'',
               kind:d.kind, params:d.params||[]};
  if(d.kind==='SERVER'){
    out.serverActionConfig = {action:d.action||'', inputs:d.inputs||[], outputs:d.outputs||[]};
  }else{
    out.manualTaskConfig = {resultParams:d.resultParams||[],
                            onRefusalDefault:d.onRefusalDefault||'Send back'};
  }
  return out;
}
function serverConfig(raw){ return raw.serverActionConfig || {}; }

function materialise(d){
  const f = flatten(d);
  return Object.assign(f, {
    desc: f.description,
    iconKey: f.icon,
    icon: (typeof I!=='undefined' && I[f.icon]) || (typeof I!=='undefined' ? I.gear : ''),
    manual: f.kind === 'MANUAL',
  });
}
function reloadDefs(){
  Object.keys(TASK_DEFS).forEach(k=>{ delete TASK_DEFS[k]; });
  (TASK_DOC.definitions||[]).forEach(d=>{ TASK_DEFS[d.name] = materialise(d); });
}
reloadDefs();

/* ============================ resolution ============================ */
/* Three source kinds. No fourth, and no operators — see the file header. */
function resolveSource(src, t, r){
  if(!src) return undefined;
  switch(src.kind){
    case 'LITERAL':      return src.value;
    case 'TASK_PARAM':   return t ? t.config[src.path] : undefined;
    case 'REQUEST_DATA': return r ? r.data[src.path]   : undefined;
    default:             return undefined;
  }
}
function resolveInputs(def, t, r){
  const out = {};
  (def.inputs||[]).forEach(b=>{ out[b.target] = resolveSource(b.source, t, r); });
  return out;
}
function hasSource(src){
  if(!src || !src.kind) return false;
  if(src.kind==='LITERAL') return src.value!==undefined && src.value!=='';
  return !!src.path;
}
/* The ${…} form is produced FROM the bindings, for people to read. It is never
   read back: no code path parses this string. */
function renderSource(src){
  if(!hasSource(src)) return '∅';
  if(src.kind==='LITERAL')      return JSON.stringify(src.value);
  if(src.kind==='TASK_PARAM')   return '${task.'+src.path+'}';
  if(src.kind==='REQUEST_DATA') return '${request.'+src.path+'}';
  return '?';
}
function renderCall(def){
  if(!def || def.kind!=='SERVER') return '(no server action — a person closes this task)';
  const args = (def.inputs||[]).map(b=>`${b.target}=${renderSource(b.source)}`).join(', ');
  return `${def.action||'?'} ${args}`;
}
function renderResolvedCall(def, t, r){
  if(def.kind!=='SERVER') return def.label;
  const inputs = resolveInputs(def, t, r);
  const args = (def.inputs||[]).map(b=>`${b.target}=${JSON.stringify(inputs[b.target] ?? null)}`).join(', ');
  return `${def.action} ${args}`;
}

/* ============================ execution helpers ============================ */
/* Simulated POST /actions/run. Real outParameters, fake work. */
function runServerAction(def, inputs, r){
  switch(def.action){
    case 'generateDocument':{
      const file = `${String(inputs.template||'document').toLowerCase().replace(/\s+/g,'-')}-${r.id}.pdf`;
      return {documentId:'DOC-'+r.id.replace(/\D/g,''), fileName:file, sha256:fnv(file)};
    }
    case 'archiveDocument': return {archiveRef:`${inputs.store||'—'} / ${inputs.documentId||'—'}`};
    case 'printMessage':    return {printedAt:stamp()};
    case 'cablePatch':      return {cableId:'CBL-'+fnv(String(inputs.targetPort||'')).slice(0,5)};
    case 'reservePort':     return {reservationId:'RES-'+fnv(String(inputs.port||'')).slice(0,5)};
    case 'createComponent': return {componentId:'CMP-'+fnv(String(inputs.name||'')).slice(0,5)};
    default:                return {};
  }
}
/* Output mappings are how a task stores something on the request — the id of a
   created component, the document a later task reads. This is the only writer
   of those data fields; the requester cannot edit them by hand. */
function applyOutputs(def, outs, r){
  const written = {};
  (def.outputs||[]).forEach(m=>{
    if(!m.target || m.target.kind!=='REQUEST_DATA' || !m.target.path) return;
    const v = outs[m.source];
    if(v===undefined) return;
    r.data[m.target.path] = v;
    written[m.target.path] = v;
  });
  return written;
}
function actionFails(def, inputs){
  return def.action==='cablePatch'
    && inputs.operation==='Connect'
    && OCCUPIED_PORTS.includes(String(inputs.targetPort||'').trim());
}
function taskSummary(def, cfg){
  const vals = (def.params||[]).filter(p=>cfg[p.name]).slice(0,3).map(p=>cfg[p.name]);
  return vals.length ? vals.join(' · ') : '—';
}
/* Data parameters an execution writes are server-owned: authors must not type
   into them, or a requester could forge the id of something the server made. */
function isExecutionWritten(path){
  return (TASK_DOC.definitions||[]).some(d=>(serverConfig(d).outputs||[]).some(m=>
    m.target && m.target.kind==='REQUEST_DATA' && m.target.path===path));
}

/* ============================ validation ============================ */
function defIssues(d){
  const out = [];
  if(!String(d.name||'').trim())  out.push('Give it a name — this is the id requests will store.');
  if(!String(d.label||'').trim()) out.push('Give it a label.');
  if(d.kind==='SERVER'){
    const a = SERVER_ACTIONS[d.action];
    if(!a) out.push('Pick the server action this task runs.');
    else a.parameters.filter(p=>p.required).forEach(p=>{
      const b = (d.inputs||[]).find(x=>x.target===p.name);
      if(!hasSource(b && b.source)) out.push(`Required action input "${p.name}" is not mapped.`);
    });
  }else{
    if(!(d.resultParams||[]).length) out.push('A manual task needs at least one result field.');
  }
  (d.params||[]).forEach((p,i)=>{
    if(!String(p.name||'').trim()) out.push(`Configuration field ${i+1} has no name.`);
  });
  return out;
}
function usedBy(name){
  return (typeof S!=='undefined' ? S.requests : []).filter(r=>r.taskItems.some(t=>t.def===name)).length;
}

/* ============================ editor state ============================ */
const E = {screen:'list', draft:null, original:null};

function blankDef(){
  return {name:'', label:'', icon:'gear', description:'', kind:'SERVER',
          params:[], action:'', inputs:[], outputs:[],
          resultParams:[], onRefusalDefault:'Send back'};
}
function rawDef(name){
  return (TASK_DOC.definitions||[]).find(d=>d.name===name);
}
function startEdit(name){
  const raw = name ? rawDef(name) : null;
  /* The editor works on the flat shape; nest() puts it back on save. */
  E.draft = raw ? flatten(raw) : blankDef();
  /* Normalise the binding rows against the action's declared order, so the editor
     can address them positionally however the JSON document happened to list them. */
  syncBindings(E.draft);
  E.original = name || null;
  E.screen = 'edit';
  render();
}
/* Keep the input/output rows in step with the chosen action's declared contract. */
function syncBindings(d){
  if(d.kind!=='SERVER'){ d.inputs=[]; d.outputs=[]; return; }
  const a = SERVER_ACTIONS[d.action];
  if(!a){ d.inputs=[]; d.outputs=[]; return; }
  d.inputs = a.parameters.map(p=>{
    const prev = (d.inputs||[]).find(x=>x.target===p.name);
    return prev || {target:p.name, source:{kind:'TASK_PARAM', path:''}};
  });
  d.outputs = a.outParameters.map(o=>{
    const prev = (d.outputs||[]).find(x=>x.source===o.name);
    return prev || {source:o.name, target:{kind:'NONE'}};
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
        <span class="mono">task-definitions.json.js</span> — the document the server would return
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
              ? `<span>closed by a person</span>`
              : `<span class="mono">${esc(d.action||'—')}</span>`}
            <span class="dot">·</span><span>${d.params.length} config field${d.params.length===1?'':'s'}</span>
            ${d.outputs.length?`<span class="dot">·</span><span>stores ${d.outputs.filter(o=>o.target&&o.target.kind==='REQUEST_DATA').length} value(s)</span>`:''}
            <span class="dot">·</span><span>${n?`used by ${n} request${n===1?'':'s'}`:'not used yet'}</span>
          </div>
        </div>
        <div class="rside">${esc(renderCall(d).slice(0,46))}${renderCall(d).length>46?'…':''}</div>
      </div>`;
    }).join('')}
  </div>
  <p style="margin:14px 0 0;color:var(--ink-3);font-size:12.5px;max-width:80ch">
    A task type is a <b>named, pre-wired use</b> of something the server can already do. The
    executable stays code — an annotated Groovy or Java action. Which action it calls, where its
    inputs come from and where its results are stored is configuration, and that is what this
    screen edits.</p>`;
}

/* ---- one row of the config-field editor, shared by params and resultParams ---- */
function fieldRows(list, which){
  if(!list.length) return `<div class="empty" style="padding:14px">No fields yet.</div>`;
  return list.map((p,i)=>`
    <div class="te-field">
      <span class="te-num mono">${i+1}</span>
      <input type="text" data-te-f="${which}" data-i="${i}" data-k="name"  value="${esc(p.name||'')}"  placeholder="name" style="width:120px">
      <input type="text" data-te-f="${which}" data-i="${i}" data-k="label" value="${esc(p.label||'')}" placeholder="label" style="width:150px">
      <select data-te-f="${which}" data-i="${i}" data-k="type" style="width:auto">
        ${['text','enum'].map(t=>`<option ${p.type===t?'selected':''}>${t}</option>`).join('')}
      </select>
      ${p.type==='enum'
        ? `<input type="text" data-te-f="${which}" data-i="${i}" data-k="values"
             value="${esc((p.values||[]).join(', '))}" placeholder="option, option" style="flex:1;min-width:120px">`
        : `<input type="text" data-te-f="${which}" data-i="${i}" data-k="placeholder"
             value="${esc(p.placeholder||'')}" placeholder="placeholder" style="flex:1;min-width:120px">`}
      <label class="switch" title="Required"><input type="checkbox" data-te-f="${which}" data-i="${i}" data-k="required" ${p.required?'checked':''}>
        <span class="track"></span><span style="font-size:12px">req</span></label>
      <button class="btn sm ico" data-te="del-field" data-f="${which}" data-i="${i}" title="Remove field">${I.trash}</button>
    </div>`).join('');
}

/* ---- one input mapping row: action parameter <- source ---- */
function mapRow(d, param, i){
  const b = d.inputs[i];
  const src = b.source||{};
  const dataParams = (typeof S!=='undefined' ? S.definition.dataParameters : []);
  const kinds = [['TASK_PARAM','Task field'],['REQUEST_DATA','Request data'],['LITERAL','Literal'],['NONE','not mapped']];
  let picker;
  if(src.kind==='LITERAL'){
    picker = `<input type="text" data-te-map="${i}" data-k="value" value="${esc(src.value??'')}" placeholder="value" style="flex:1">`;
  }else if(src.kind==='REQUEST_DATA'){
    picker = `<select data-te-map="${i}" data-k="path" style="flex:1">
      <option value="">choose…</option>
      ${dataParams.map(p=>`<option value="${esc(p.name)}" ${src.path===p.name?'selected':''}>${esc(p.label)} (${esc(p.name)})</option>`).join('')}
    </select>`;
  }else if(src.kind==='TASK_PARAM'){
    picker = `<select data-te-map="${i}" data-k="path" style="flex:1">
      <option value="">choose…</option>
      ${(d.params||[]).map(p=>`<option value="${esc(p.name)}" ${src.path===p.name?'selected':''}>${esc(p.label||p.name)} (${esc(p.name)})</option>`).join('')}
    </select>`;
  }else{
    picker = `<span style="flex:1;color:var(--ink-3);font-size:12.5px">nothing is passed</span>`;
  }
  return `<div class="te-map">
    <span class="te-target mono">${esc(param.name)}${param.required?'<span class="req"> *</span>':''}</span>
    <span class="te-arrow">←</span>
    <select data-te-map="${i}" data-k="kind" style="width:auto">
      ${kinds.map(([k,l])=>`<option value="${k}" ${(src.kind||'NONE')===k?'selected':''}>${l}</option>`).join('')}
    </select>
    ${picker}
  </div>`;
}

function teEditor(){
  const d = E.draft;
  const action = SERVER_ACTIONS[d.action];
  const issues = defIssues(d);
  const dataParams = (typeof S!=='undefined' ? S.definition.dataParameters : []);

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
            ? 'The server runs it. Pick the action below and wire its inputs.'
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
              wiring it up is not.</span>
          </div>
          ${action?`<div class="te-contract">
            <div><b>accepts</b> ${action.parameters.map(p=>
              `<span class="kv">${esc(p.name)}${p.required?'<span class="req"> *</span>':''}</span>`).join(' ')}</div>
            <div style="margin-top:5px"><b>returns</b> ${action.outParameters.map(o=>
              `<span class="kv">${esc(o.name)}</span>`).join(' ')||'<span class="mono">nothing</span>'}</div>
            <div class="mono" style="margin-top:6px;color:var(--ink-3);font-size:11px">${esc(action.description)}</div>
          </div>`:''}
        </div>
      </section>`:''}

      <section class="panel">
        <div class="panel-head"><h3>Configuration UI</h3>
          <span class="pill neutral">${d.params.length} field${d.params.length===1?'':'s'}</span></div>
        <div class="panel-body">
          <span class="hint">What the requester fills in when they add this task. A pre-built form
            is the phase-2 idea; this is the attribute list.</span>
          ${fieldRows(d.params,'params')}
          <button class="btn sm" data-te="add-field" data-f="params">${I.plus} Add field</button>
        </div>
      </section>

      ${d.kind==='SERVER'&&action?`
      <section class="panel">
        <div class="panel-head"><h3>Input mappings</h3></div>
        <div class="panel-body">
          <span class="hint">Where each action input comes from. Built with pickers and stored as
            data — the <span class="mono">\${…}</span> form is only how it reads.</span>
          ${action.parameters.map((p,i)=>mapRow(d,p,i)).join('')}
        </div>
      </section>

      <section class="panel">
        <div class="panel-head"><h3>Output mappings</h3></div>
        <div class="panel-body">
          <span class="hint">Where results are stored on the request, so a later task or a rule can
            read them — the id of a created component, for instance.</span>
          ${action.outParameters.map((o,i)=>{
            const m = d.outputs[i]||{source:o.name,target:{kind:'NONE'}};
            const tgt = m.target||{kind:'NONE'};
            return `<div class="te-map">
              <span class="te-target mono">${esc(o.name)}</span>
              <span class="te-arrow">→</span>
              <select data-te-out="${i}" style="flex:1">
                <option value="" ${tgt.kind!=='REQUEST_DATA'?'selected':''}>don't store</option>
                ${dataParams.map(p=>`<option value="${esc(p.name)}" ${tgt.path===p.name?'selected':''}>request.${esc(p.name)}</option>`).join('')}
              </select>
            </div>`;
          }).join('')}
        </div>
      </section>`:''}

      ${d.kind==='MANUAL'?`
      <section class="panel">
        <div class="panel-head"><h3>Result fields</h3>
          <span class="pill neutral">${(d.resultParams||[]).length}</span></div>
        <div class="panel-body">
          <span class="hint">What the person supplies when they close it — the signature reference,
            a note. The completion form is generated from these.</span>
          ${fieldRows(d.resultParams||[],'resultParams')}
          <button class="btn sm" data-te="add-field" data-f="resultParams">${I.plus} Add field</button>
          <div class="field" style="margin-top:4px">
            <label>Default if refused</label>
            <select data-te-d="onRefusalDefault">
              ${['Send back','Fail the task','Not allowed'].map(v=>
                `<option ${((d.onRefusalDefault)||'Send back')===v?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>
        </div>
      </section>`:''}
    </div>

    <aside class="rail"><div id="te-preview">${previewHTML(d,issues)}</div></aside>
  </div>`;
}

function previewHTML(d, issues){
  issues = issues || defIssues(d);
  const stored = (d.outputs||[]).filter(m=>m.target && m.target.kind==='REQUEST_DATA' && m.target.path);
  return `
  <section class="panel">
    <div class="panel-head"><h3>What the requester sees</h3></div>
    <div class="panel-body">
      ${(d.params||[]).length ? (d.params||[]).map(p=>`
        <div class="field">
          <label>${esc(p.label||p.name||'—')} ${p.required?'<span class="req">*</span>':''}</label>
          ${p.type==='enum'
            ? `<select disabled>${(p.values||[]).map(v=>`<option>${esc(v)}</option>`).join('')}</select>`
            : `<input type="text" disabled placeholder="${esc(p.placeholder||'')}">`}
        </div>`).join('')
        : `<div style="font-size:12.5px;color:var(--ink-3)">No fields — nothing to fill in.</div>`}
    </div>
  </section>

  ${d.kind==='MANUAL'?`
  <section class="panel">
    <div class="panel-head"><h3>What the signer supplies</h3></div>
    <div class="panel-body">
      ${(d.resultParams||[]).length ? (d.resultParams||[]).map(p=>`
        <div class="field">
          <label>${esc(p.label||p.name||'—')} ${p.required?'<span class="req">*</span>':''}</label>
          <input type="text" disabled placeholder="${esc(p.placeholder||'')}">
        </div>`).join('')
        : `<div style="font-size:12.5px;color:var(--ink-3)">No result fields yet.</div>`}
      <span class="hint">If refused by default: <b>${esc(d.onRefusalDefault||'Send back')}</b>.</span>
    </div>
  </section>`:''}

  <section class="panel">
    <div class="panel-head"><h3>What runs</h3></div>
    <div class="panel-body">
      <div class="te-call mono">${esc(renderCall(d))}</div>
      <span class="hint">Generated from the bindings for you to read. Nothing parses it back.</span>
    </div>
  </section>

  ${stored.length?`
  <section class="panel">
    <div class="panel-head"><h3>What it stores</h3></div>
    <div class="panel-body">
      ${stored.map(m=>`<div class="te-call mono">request.${esc(m.target.path)} ← ${esc(m.source)}</div>`).join('')}
      <span class="hint">Written by the run, not by the requester.</span>
    </div>
  </section>`:''}

  <section class="panel">
    <div class="panel-head"><h3>Ready?</h3>
      <span class="pill ${issues.length?'bad':'ok'}">${issues.length?`${issues.length} to fix`:'valid'}</span></div>
    <div class="panel-body">
      ${issues.length
        ? issues.map(x=>`<div class="grule fail"><span class="gi">${I.cross}</span><span class="gt">${esc(x)}</span></div>`).join('')
        : `<div class="grule pass"><span class="gi">${I.check}</span><span class="gt">This task type can be added to a request.</span></div>`}
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
        placeholder='{ "apiVersion": "aixboms.taskdefinition/v1", "definitions": [ … ] }'></textarea>
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
      TASK_DOC = doc; reloadDefs(); closeModal(); render(); toast('Catalogue replaced');
      break;
    }
    case 'kind':
      d.kind = btn.dataset.v;
      syncBindings(d); render(); break;
    case 'add-field':{
      const f = btn.dataset.f;
      if(!d[f]) d[f]=[];
      d[f].push({name:'', label:'', type:'text', required:false});
      render(); break;
    }
    case 'del-field':{
      d[btn.dataset.f].splice(+btn.dataset.i,1);
      syncBindings(d); render(); break;
    }
  }
});

/* Structural changes re-render; text typing only repaints the preview, so the
   caret stays where it is. */
document.addEventListener('change', e=>{
  const el = e.target; const d = E.draft; if(!d) return;

  if(el.dataset.teD!==undefined && el.dataset.teD){
    d[el.dataset.teD] = el.value;
    if(el.dataset.teD==='action') syncBindings(d);
    if(['action','icon'].includes(el.dataset.teD)){ render(); return; }
    paintPreview(); return;
  }
  if(el.dataset.teF){
    const list = d[el.dataset.teF], p = list[+el.dataset.i], k = el.dataset.k;
    if(k==='required') p.required = el.checked;
    else if(k==='values') p.values = el.value.split(',').map(s=>s.trim()).filter(Boolean);
    else p[k] = el.value;
    if(k==='type' || k==='name'){ render(); return; }
    paintPreview(); return;
  }
  if(el.dataset.teMap!==undefined){
    const b = d.inputs[+el.dataset.teMap];
    if(el.dataset.k==='kind'){
      b.source = el.value==='LITERAL' ? {kind:'LITERAL', value:''}
               : el.value==='NONE'    ? {kind:'NONE'}
               : {kind:el.value, path:''};
      render(); return;
    }
    b.source[el.dataset.k] = el.value;
    paintPreview(); return;
  }
  if(el.dataset.teOut!==undefined){
    const m = d.outputs[+el.dataset.teOut];
    m.target = el.value ? {kind:'REQUEST_DATA', path:el.value} : {kind:'NONE'};
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
  if(el.dataset.teMap!==undefined && el.type==='text'){
    d.inputs[+el.dataset.teMap].source[el.dataset.k] = el.value;
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
