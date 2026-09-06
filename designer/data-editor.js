/* ===========================================================================
   Data parameters editor — the Data parameters section of the request-type
   screen. A clean LIST of parameters; everything about one parameter is
   edited in a single dialog (the same list → dialog pattern as the task-type
   catalogue and the inbox). Owns the reference guard: a parameter still
   referenced by wiring, transitions or display cannot be deleted, and the
   referencing places are named — in the dialog, where the Delete button is.
   =========================================================================== */
"use strict";

/* -------------------------------------------------------- data parameters */
/* Everything that references a data parameter BY NAME. Deleting one that is
   still referenced would silently break bindings and rules, so it is refused
   with the referencing places named. */
function dataParamUses(name){
  const uses=[];
  const scanWiring=(holder,where)=>{
    Object.entries(holder.inputBindings||{}).forEach(([k,b])=>{
      if(b&&b.kind==='REQUEST_DATA'&&b.path===name) uses.push(`${where} reads it (input "${k}")`);
    });
    Object.entries(holder.outputBindings||{}).forEach(([k,b])=>{
      if(b&&b.path===name) uses.push(`${where} writes it (output "${k}")`);
    });
  };
  (S.definition.taskFlow||[]).forEach(st=>{
    scanWiring(st, `"${stepMeta(st).label}"`);
    (st.possibleActivities||[]).forEach(a=>
      scanWiring(a, `activity "${a.label||a.taskDefinition}"`));
    const c=st.runtimeConfig||{};
    (c.transitions||[]).forEach(tr=>{ if(tr.when && tr.when.path===name)
      uses.push(`a transition on "${stepMeta(st).label}"`); });
    (c.display||[]).forEach(n=>{ if(n===name)
      uses.push(`shown to the person on "${stepMeta(st).label}"`); });
  });
  return uses;
}

function defData(){
  return `<div style="padding:15px">
    <p style="margin:0 0 12px;color:var(--ink-3);font-size:13px">
      Fields copied into every new request. A field is either <b>filled in by the requester</b> —
      theirs to edit, frozen while a run is in progress — or <b>written by a task</b> during the
      run, read-only for the requester so nobody can forge what the server produced. Click a
      parameter to edit everything about it.</p>
    <div class="rows">
    ${S.definition.dataParameters.map(p=>{
      const uses = dataParamUses(p.name);
      return `<div class="row" data-dp="edit" data-name="${esc(p.name)}" tabindex="0" role="button">
        <div class="rmain">
          <div class="rtitle">
            <strong>${esc(p.label)}</strong>
            <span class="id mono">${esc(p.name)}</span>
          </div>
          <div class="rmeta">
            <span class="pill ${p.owner==='EXECUTION'?'blue':'neutral'}">${
              p.owner==='EXECUTION'?'written by a task':'filled in by the requester'}</span>
            ${p.requiredAtCreation?`<span class="pill warn">at creation</span>`:''}
            ${p.internal?`<span class="pill neutral">internal</span>`:''}
            ${p.type==='boolean'?`<span class="pill neutral">yes / no</span>`:''}
            ${p.defaultValue!==''&&p.defaultValue!=null&&p.defaultValue!==false
              ?`<span class="dot">·</span><span>default: ${esc(String(p.defaultValue))}</span>`:''}
            <span class="dot">·</span><span>${uses.length?`${uses.length} use${uses.length===1?'':'s'}`:'not used yet'}</span>
          </div>
        </div>
      </div>`;
    }).join('')}
    </div>
    <div style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn" data-dp="add">${I.plus} Add parameter</button>
      <span class="hint">New parameters reach <b>new</b> requests; existing requests keep the data
        they were created with.</span>
    </div>
  </div>`;
}

/* One dialog for a parameter's whole life: add (name === null) and edit.
   Nothing is changed until Save reads the fields back — Cancel is free. */
function dlgDataParam(name){
  const p = name ? S.definition.dataParameters.find(x=>x.name===name) : null;
  const uses = p ? dataParamUses(p.name) : [];
  openModal(`<div class="dialog" role="dialog" aria-modal="true" aria-label="${p?'Edit':'Add'} data parameter">
    <div class="dhead"><h2>${p?`Edit ${esc(p.label)}`:'Add a data parameter'}</h2>
      <button class="iconbtn" data-act="close">${I.cross}</button></div>
    <div class="dbody">
      <div class="field"><label>Name ${p?'':'<span class="req">*</span>'}</label>
        <input type="text" id="dp-name" value="${esc(p?p.name:'')}" ${p?'disabled':''}
          placeholder="changeTicket">
        <span class="hint">${p?'Fixed once created — wiring and transitions refer to it.'
          :'The id wiring and transitions will refer to — letters and digits, fixed once created.'}</span></div>
      <div class="field"><label>Label <span class="req">*</span></label>
        <input type="text" id="dp-label" value="${esc(p?p.label:'')}" placeholder="Change ticket"></div>
      <div class="field"><label>Type</label>
        <select id="dp-type">
          <option value="text" ${!p||p.type!=='boolean'?'selected':''}>text</option>
          <option value="boolean" ${p&&p.type==='boolean'?'selected':''}>yes / no</option>
        </select></div>
      <div class="field"><label>Who provides the value</label>
        <select id="dp-owner">
          <option value="AUTHOR" ${!p||p.owner!=='EXECUTION'?'selected':''}>filled in by the requester</option>
          <option value="EXECUTION" ${p&&p.owner==='EXECUTION'?'selected':''}>written by a task</option>
        </select></div>
      <div class="field"><label>Default</label>
        <input type="text" id="dp-default"
          value="${esc(p==null?'':String(p.defaultValue??''))}" placeholder="">
        <span class="hint">For a yes / no field, write <span class="mono">true</span> or leave empty.</span></div>
      <label class="switch"><input type="checkbox" id="dp-atcreation" ${p&&p.requiredAtCreation?'checked':''}>
        <span class="track"></span><span style="font-size:12.5px">Must be filled in when the
        request is created</span></label>
      <label class="switch"><input type="checkbox" id="dp-internal" ${p&&p.internal?'checked':''}>
        <span class="track"></span><span style="font-size:12.5px">Internal — keep it off the
        Data tab (inspectable under Internal fields)</span></label>
      ${p&&uses.length?`<div class="ctxbox">
        <h4>Where it is used</h4>
        ${uses.map(u=>`<div class="ctxrow"><span>${esc(u)}</span></div>`).join('')}
      </div>`:''}
    </div>
    <div class="dfoot">
      ${p?`<button class="btn danger" data-dp="dp-delete" data-name="${esc(p.name)}"
        ${uses.length?'disabled':''} style="margin-right:auto"
        title="${uses.length?`Referenced by ${esc(uses[0])}${uses.length>1?` and ${uses.length-1} more`:''}`:'Remove this parameter'}">
        ${I.trash} Delete</button>`:''}
      <button class="btn" data-act="close">Cancel</button>
      <button class="btn primary" data-dp="dp-save" ${p?`data-name="${esc(p.name)}"`:''}>
        ${p?'Save':'Add parameter'}</button>
    </div>
  </div>`);
}

document.addEventListener('click', e=>{
  const dp = e.target.closest('[data-dp]');
  if(!dp) return;
  const act = dp.dataset.dp;
  const list = S.definition.dataParameters;

  if(act==='add'){ dlgDataParam(null); return; }
  if(act==='edit'){ dlgDataParam(dp.dataset.name); return; }

  if(act==='dp-delete'){
    const p = list.find(x=>x.name===dp.dataset.name); if(!p) return;
    const uses = dataParamUses(p.name);
    if(uses.length){ toast(`Referenced by ${uses[0]}${uses.length>1?` and ${uses.length-1} more`:''}`); return; }
    list.splice(list.indexOf(p),1);
    closeModal(); render(); toast('Parameter removed'); return;
  }

  if(act==='dp-save'){
    const editing = dp.dataset.name ? list.find(x=>x.name===dp.dataset.name) : null;
    const name = editing ? editing.name : (document.getElementById('dp-name')||{value:''}).value.trim();
    const label = (document.getElementById('dp-label')||{value:''}).value.trim();
    const type = (document.getElementById('dp-type')||{value:'text'}).value;
    const owner = (document.getElementById('dp-owner')||{value:'AUTHOR'}).value;
    const dflt = (document.getElementById('dp-default')||{value:''}).value.trim();
    if(!editing){
      if(!/^[A-Za-z][A-Za-z0-9]*$/.test(name)){ toast('The name must be letters and digits, starting with a letter'); return; }
      if(list.some(p=>p.name===name)){ toast(`"${name}" already exists`); return; }
    }
    if(!label){ toast('Give it a label'); return; }
    const p = editing || {name};
    p.label = label;
    p.type = type;
    p.owner = owner;
    p.defaultValue = type==='boolean' ? dflt==='true' : dflt;
    if((document.getElementById('dp-atcreation')||{}).checked) p.requiredAtCreation = true;
    else delete p.requiredAtCreation;
    if((document.getElementById('dp-internal')||{}).checked) p.internal = true;
    else delete p.internal;
    if(!editing) list.push(p);
    closeModal(); render(); toast(editing?'Parameter saved':'Parameter added'); return;
  }
});
