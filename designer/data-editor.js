/* ===========================================================================
   Data parameters editor — the Data parameters section of the request-type
   screen. Owns the reference guard: a parameter still referenced by wiring,
   rules, transitions or display cannot be deleted, and the referencing
   places are named.
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
      run, read-only for the requester so nobody can forge what the server produced. Either kind
      can additionally be demanded
      <b>at creation</b>: the New-request form refuses to create without it. On a task-written
      field that is only the <b>starting value</b> — tasks may refine it later, and their forms
      arrive prefilled with what is there.</p>
    ${S.definition.dataParameters.map((p,j)=>{
      const uses = dataParamUses(p.name);
      return `<div class="te-field">
        <span class="mono" style="min-width:150px" title="The id bindings and rules refer to — fixed once created">${esc(p.name)}</span>
        <input type="text" data-dp="label" data-j="${j}" value="${esc(p.label)}"
          placeholder="label" style="width:190px">
        <select data-dp="type" data-j="${j}" style="width:auto">
          ${['text','boolean'].map(t=>`<option ${p.type===t?'selected':''}>${t}</option>`).join('')}
        </select>
        <select data-dp="owner" data-j="${j}" style="width:auto"
          title="Who provides the value — the requester by hand, or a task during the run">
          <option value="AUTHOR" ${p.owner!=='EXECUTION'?'selected':''}>filled in by the requester</option>
          <option value="EXECUTION" ${p.owner==='EXECUTION'?'selected':''}>written by a task</option>
        </select>
        <label class="flagchip ${p.requiredAtCreation?'on':''}"
          title="The requester must provide this when creating the request — creation is refused without it.${p.owner==='EXECUTION'?' It is only the starting value: tasks may refine it later.':''}">
          <input type="checkbox" data-dp="atcreation" data-j="${j}"
            ${p.requiredAtCreation?'checked':''}>at creation</label>
        ${p.type==='boolean'
          ? `<label class="switch" title="Default"><input type="checkbox" data-dp="default" data-j="${j}"
               ${p.defaultValue?'checked':''}><span class="track"></span><span style="font-size:12px">default</span></label>`
          : `<input type="text" data-dp="default" data-j="${j}" value="${esc(p.defaultValue??'')}"
               placeholder="default" style="flex:1;min-width:110px">`}
        ${uses.length?`<span class="pill neutral" title="${esc(uses.join('; '))}">${uses.length} use${uses.length===1?'':'s'}</span>`:''}
        <button class="btn sm ico" data-dp="del" data-j="${j}"
          ${uses.length?'disabled':''}
          title="${uses.length?`Referenced by ${esc(uses[0])}${uses.length>1?` and ${uses.length-1} more`:''}`:'Remove this field'}">${I.trash}</button>
      </div>`;
    }).join('')}
    <div style="margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn" data-dp="add">${I.plus} Add parameter</button>
      <span class="hint">New parameters reach <b>new</b> requests; existing requests keep the data
        they were created with. Moving a field between the two kinds changes who may write it.</span>
    </div>
  </div>`;
}

function dlgAddDataParam(){
  openModal(`<div class="dialog" role="dialog" aria-modal="true" aria-label="Add data parameter">
    <div class="dhead"><h2>Add a data parameter</h2>
      <button class="iconbtn" data-act="close">${I.cross}</button></div>
    <div class="dbody">
      <div class="field"><label>Name <span class="req">*</span></label>
        <input type="text" id="dp-name" placeholder="changeTicket">
        <span class="hint">The id bindings and rules will refer to — letters and digits, fixed once
          created.</span></div>
      <div class="field"><label>Label <span class="req">*</span></label>
        <input type="text" id="dp-label" placeholder="Change ticket"></div>
      <div class="field"><label>Type</label>
        <select id="dp-type"><option>text</option><option>boolean</option></select></div>
      <div class="field"><label>Owner</label>
        <select id="dp-owner">
          <option value="AUTHOR">filled in by the requester</option>
          <option value="EXECUTION">written by a task</option>
        </select></div>
      <div class="field"><label>Default</label>
        <input type="text" id="dp-default" placeholder=""></div>
      <label class="switch"><input type="checkbox" id="dp-atcreation">
        <span class="track"></span><span style="font-size:12.5px">Must be filled in when the
        request is created</span></label>
    </div>
    <div class="dfoot">
      <button class="btn" data-act="close">Cancel</button>
      <button class="btn primary" data-dp="create">Add parameter</button>
    </div>
  </div>`);
}


document.addEventListener('click', e=>{
  const dp = e.target.closest('[data-dp]');
  if(dp && (dp.dataset.dp==='add'||dp.dataset.dp==='del'||dp.dataset.dp==='create')){
    const list = S.definition.dataParameters;
    if(dp.dataset.dp==='add'){ dlgAddDataParam(); return; }
    if(dp.dataset.dp==='del'){
      const p = list[+dp.dataset.j];
      const uses = dataParamUses(p.name);
      if(uses.length){ toast(`Referenced by ${uses[0]}${uses.length>1?` and ${uses.length-1} more`:''}`); return; }
      list.splice(+dp.dataset.j,1); render(); toast('Parameter removed'); return;
    }
    /* create */
    const name = (document.getElementById('dp-name')||{value:''}).value.trim();
    const label = (document.getElementById('dp-label')||{value:''}).value.trim();
    const type = (document.getElementById('dp-type')||{value:'text'}).value;
    const owner = (document.getElementById('dp-owner')||{value:'AUTHOR'}).value;
    const dflt = (document.getElementById('dp-default')||{value:''}).value.trim();
    if(!/^[A-Za-z][A-Za-z0-9]*$/.test(name)){ toast('The name must be letters and digits, starting with a letter'); return; }
    if(list.some(p=>p.name===name)){ toast(`"${name}" already exists`); return; }
    if(!label){ toast('Give it a label'); return; }
    const np = {name, label, type, owner,
      defaultValue: type==='boolean' ? dflt==='true' : dflt};
    if((document.getElementById('dp-atcreation')||{}).checked) np.requiredAtCreation = true;
    list.push(np);
    closeModal(); render(); toast('Parameter added'); return;
  }
});

document.addEventListener('change', e=>{
  const el = e.target;
  if(el.dataset.dp && el.dataset.j!==undefined){
    const p = S.definition.dataParameters[+el.dataset.j]; if(!p) return;
    const k = el.dataset.dp;
    if(k==='label') p.label = el.value;
    else if(k==='type'){ p.type = el.value; p.defaultValue = el.value==='boolean' ? false : String(p.defaultValue==null?'':p.defaultValue); }
    else if(k==='owner') p.owner = el.value;
    else if(k==='atcreation'){ if(el.checked) p.requiredAtCreation = true; else delete p.requiredAtCreation; }
    else if(k==='default') p.defaultValue = p.type==='boolean' ? el.checked : el.value;
    render(); return;
  }
});
