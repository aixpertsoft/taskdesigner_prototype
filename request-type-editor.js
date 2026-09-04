/* ===========================================================================
   Request type editor — the administrator's side.

   A request type carries four things: the status graph, the TASK FLOW, the data
   parameters, and the execution rules that gate a run.

   The task flow is the substantive part: an ACTIVITY GRAPH. Creating a request
   instantiates it, so every request of a type starts as the same process.

   The flow is a SINGLE-TOKEN STATE MACHINE. Activities are joined by
   transitions — unconditional, or a single structured equality against request
   data — evaluated in order, first match wins. Loops are allowed (approved =
   false routes back to the draft); parallelism, fork/join, sub-processes and
   timers are not. That is the line between this subsystem and
   de.comconsult.wf, and it is meant to hold.

   Exactly one activity is the start; one or more are ends. A PLACEHOLDER
   activity is a designed slot the requester may fill at runtime from a list of
   eligible task types — the only way a requester extends a plan.

   Both rule lists reuse evaluateRule() from index.html unchanged — there is no
   second rule engine and no expression language.
   =========================================================================== */
"use strict";

/* ============================ the document ============================ */
/* request-types.json.js is the source. Everything the editor changes is changed
   in this object, so Export hands back exactly what the server would store. */
const RT_API = 'aixboms.requesttype/v3';
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
    id:'empty', name:'Untitled',
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
    </div>
  </div>
  <div class="def-body">
    <nav class="sidenav">
      ${[['flow','Task flow'],['data','Data parameters'],['rules','Execution rules']]
        .map(([k,l])=>`<button data-def="${k}" aria-current="${S.defSection===k}">${l}</button>`).join('')}
    </nav>
    <div class="card">
      ${S.defSection==='flow'    ? defFlow()
       :S.defSection==='data'    ? defData()
       :                           defRules()}
    </div>
  </div>`;
}

/* The runtime half of an activity. Created lazily so a document written before
   a key existed still opens with sane defaults. */
function rc(step){
  const c = step.runtimeConfig || (step.runtimeConfig = {});
  if(!c.assignedRoles)  c.assignedRoles = [];
  if(!('dueBy' in c))   c.dueBy = null;
  if(!c.display)        c.display = [];
  if(!c.requires)       c.requires = [];
  if(!c.transitions)    c.transitions = [];
  if(step.kind==='PLACEHOLDER' && !step.possibleActivities) step.possibleActivities = [];
  return c;
}
function stepMeta(step){
  if(step.kind==='PLACEHOLDER')
    return {label: step.label||'Placeholder', icon: I.plus, manual:false, placeholder:true, params:[]};
  const d = TASK_DEFS[step.taskDefinition];
  return d ? {label:d.label, icon:d.icon, manual:d.manual, placeholder:false, params:d.params, def:d}
           : {label:step.taskDefinition+' (unknown)', icon:I.warn, manual:false, placeholder:false, params:[]};
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
              : defaultsSummary(m.def||{params:[]},step)))}
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
          ${ad && ad.params.length?`<div class="formgrid" style="padding:4px 0 0;max-width:none">
            ${ad.params.map(p=>{
              const v=(a.defaults||{})[p.name]??'';
              const warn=(p.required&&!v&&p.type!=='boolean')
                ?`<span class="hint" style="color:var(--bad)">Required — the requester cannot supply
                    it, so it must be set here.</span>`:'';
              if(p.type==='enum') return `<div class="field"><label>${esc(p.label)}</label>
                <select data-rt="act-cfg" data-i="${i}" data-j="${j}" data-k="${p.name}">
                  <option value="">—</option>
                  ${(p.values||[]).map(o=>`<option ${o===v?'selected':''}>${esc(o)}</option>`).join('')}
                </select>${warn}</div>`;
              return `<div class="field"><label>${esc(p.label)}</label>
                <input type="text" data-rt="act-cfg" data-i="${i}" data-j="${j}" data-k="${p.name}"
                  value="${esc(v)}" placeholder="${esc(p.placeholder||'')}">${warn}</div>`;
            }).join('')}
          </div>`:''}
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
      <h4>Default values</h4>
      <span class="hint">Pre-filled into the task when a request is created. Task settings are
        design-time: the requester never edits them, so required fields need their value here.</span>
      <div class="formgrid" style="padding:0;max-width:none">
        ${m.params.length? m.params.map(p=>{
          const v = (step.defaults||{})[p.name] ?? '';
          const flag = '';
          const warn = (p.required && !v && p.type!=='boolean')
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
      </div>`}

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

function defaultsSummary(d,step){
  const vals = (d.params||[]).filter(p=>(step.defaults||{})[p.name])
    .map(p=>`${p.label}: ${step.defaults[p.name]}`);
  return vals.length ? vals.join(' · ') : 'no defaults set';
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
        ad.params.filter(p=>p.required && p.type!=='boolean').forEach(p=>{
          if(!((a.defaults||{})[p.name]))
            out.push(`Activity "${a.label||ad.label}": required field "${p.label}" has no value — the requester cannot supply it.`);
        });
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

/* ------------------------------------------------------------ SVG overview */
/* Read-only picture of the graph, redrawn on every render. Nodes sit in list
   order; the arrows carry the truth. Forward edges run above the row, back
   edges arc below, condition labels on the edge. */
function flowSvg(){
  const flow = S.definition.taskFlow||[];
  if(!flow.length) return '';
  const BW=138, GAP=26, Y=64, H=34;
  const x = i => 12 + i*(BW+GAP);
  const width = 12 + flow.length*(BW+GAP);
  const idx = {}; flow.forEach((st,i)=>idx[st.stepId]=i);
  const nodes = flow.map((st,i)=>{
    const m = stepMeta(st);
    const cls = st.kind==='PLACEHOLDER' ? 'stroke-dasharray="5 3"' : '';
    const fill = st.start||st.end ? 'var(--ok-soft)' : 'var(--surface-2)';
    const line = st.start||st.end ? 'var(--ok-line)' : 'var(--border-strong)';
    const name = m.label.length>17 ? m.label.slice(0,16)+'…' : m.label;
    return `<g>
      <rect x="${x(i)}" y="${Y}" width="${BW}" height="${H}" rx="6" fill="${fill}" stroke="${line}" ${cls}/>
      <text x="${x(i)+BW/2}" y="${Y+21}" text-anchor="middle" fill="var(--ink-2)"
        style="font:600 11px var(--sans)">${esc(name)}</text>
      ${st.start?`<text x="${x(i)+8}" y="${Y-6}" fill="var(--ok)" style="font:700 10px var(--mono)">● start</text>`:''}
      ${st.end?`<text x="${x(i)+BW-8}" y="${Y-6}" text-anchor="end" fill="var(--ok)" style="font:700 10px var(--mono)">end ◉</text>`:''}
    </g>`;
  }).join('');
  let edges='';
  flow.forEach((st,i)=>{
    (rc(st).transitions||[]).forEach(tr=>{
      const j = idx[tr.to]; if(j===undefined) return;
      const label = tr.when ? describeTransition(tr) : '';
      const x1=x(i)+BW, x2=x(j), midY=Y+H/2;
      if(j===i+1){
        edges += `<path d="M${x1} ${midY} L${x2-2} ${midY}" class="fedge"/>`;
        if(label) edges += `<text x="${(x1+x2)/2}" y="${midY-7}" text-anchor="middle" class="elabel">${esc(label)}</text>`;
      } else if(j>i){
        const ax1=x(i)+BW/2, ax2=x(j)+BW/2, top=Y-26-(j-i)*4;
        edges += `<path d="M${ax1} ${Y} C ${ax1} ${top}, ${ax2} ${top}, ${ax2} ${Y-1}" class="fedge"/>`;
        if(label) edges += `<text x="${(ax1+ax2)/2}" y="${top+11}" text-anchor="middle" class="elabel">${esc(label)}</text>`;
      } else {
        const ax1=x(i)+BW/2, ax2=x(j)+BW/2, bot=Y+H+30+(i-j)*4;
        edges += `<path d="M${ax1} ${Y+H} C ${ax1} ${bot}, ${ax2} ${bot}, ${ax2} ${Y+H+1}" class="bedge"/>`;
        edges += `<text x="${(ax1+ax2)/2}" y="${bot-5}" text-anchor="middle" class="elabel warn">${esc(label||'always')}</text>`;
      }
    });
  });
  return `<div class="graph" style="padding:0 0 10px">
    <svg width="${width}" height="176" role="img" aria-label="The activity graph">
      <defs><marker id="fa" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0 0 L8 4 L0 8 z" fill="var(--border-strong)"/></marker></defs>
      <style>
        .fedge{fill:none;stroke:var(--border-strong);stroke-width:1.4;marker-end:url(#fa)}
        .bedge{fill:none;stroke:var(--warn);stroke-width:1.4;stroke-dasharray:4 3;marker-end:url(#fa)}
        .elabel{fill:var(--ink-3);font:500 10px var(--mono)}
        .elabel.warn{fill:var(--warn)}
      </style>
      ${edges}${nodes}
    </svg>
  </div>`;
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

/* -------------------------------------------------------- data parameters */
/* Everything that references a data parameter BY NAME. Deleting one that is
   still referenced would silently break bindings and rules, so it is refused
   with the referencing places named. */
function dataParamUses(name){
  const uses=[];
  (TASK_DOC.definitions||[]).forEach(d=>{
    const sc=d.serverActionConfig||{}, mc=d.manualTaskConfig||{};
    (sc.inputs||[]).forEach(b=>{ if(b.source&&b.source.kind==='REQUEST_DATA'&&b.source.path===name)
      uses.push(`${d.name} reads it (input "${b.target}")`); });
    [...(sc.outputs||[]),...(mc.outputs||[])].forEach(m=>{ if(m.target&&m.target.path===name)
      uses.push(`${d.name} writes it (output "${m.source}")`); });
  });
  (S.definition.taskFlow||[]).forEach(st=>{
    const c=st.runtimeConfig||{};
    (c.requires||[]).forEach(rule=>{ if(rule.path===name)
      uses.push(`a precondition on "${stepMeta(st).label}"`); });
    (c.transitions||[]).forEach(tr=>{ if(tr.when && tr.when.path===name)
      uses.push(`a transition on "${stepMeta(st).label}"`); });
    (c.display||[]).forEach(n=>{ if(n===name)
      uses.push(`shown to the person on "${stepMeta(st).label}"`); });
  });
  (S.definition.executionRules||[]).forEach(rule=>{ if(rule.kind==='data'&&rule.path===name)
    uses.push('an execution rule'); });
  return uses;
}

function defData(){
  return `<div style="padding:15px">
    <p style="margin:0 0 12px;color:var(--ink-3);font-size:13px">
      Fields copied into every new request. A field is either <b>filled in by the requester</b> —
      covered by the approval hash, so changing it dismisses sign-off, and frozen while a run is in
      progress — or <b>written by a task</b> during the run, outside the hash, which is why a run
      does not dismiss its own approvals.</p>
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
        they were created with. Moving a field between the two kinds changes what the approval hash
        covers, so it can dismiss sign-off on open requests.</span>
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
    </div>
    <div class="dfoot">
      <button class="btn" data-act="close">Cancel</button>
      <button class="btn primary" data-dp="create">Add parameter</button>
    </div>
  </div>`);
}

/* ============================ events ============================ */
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
    list.push({name, label, type, owner,
      defaultValue: type==='boolean' ? dflt==='true' : dflt});
    closeModal(); render(); toast('Parameter added'); return;
  }
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
      const base = {stepId:id, start:!flow.some(x=>x.start), end:false,
        runtimeConfig:{assignedRoles:[], dueBy:null, requires:[], transitions:[]}};
      if(btn.dataset.def==='__placeholder'){
        flow.push(Object.assign(base, {kind:'PLACEHOLDER', label:'Additional steps', possibleActivities:[]}));
      }else{
        flow.push(Object.assign(base, {taskDefinition:btn.dataset.def, defaults:{}}));
      }
      S.flowOpen = id;
      closeModal(); render(); toast('Activity added — wire it in with transitions'); break;
    }
    case 'act-add':{
      const list = flow[i].possibleActivities = flow[i].possibleActivities||[];
      const first = Object.values(TASK_DEFS)[0];
      list.push({id:'a'+(++S.seq), label:'', taskDefinition:first?first.name:'',
        defaults:{}, runtimeConfig:{assignedRoles:[], dueBy:null, display:[], requires:[]}});
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
  if(el.dataset.dp && el.dataset.j!==undefined){
    const p = S.definition.dataParameters[+el.dataset.j]; if(!p) return;
    const k = el.dataset.dp;
    if(k==='label') p.label = el.value;
    else if(k==='type'){ p.type = el.value; p.defaultValue = el.value==='boolean' ? false : String(p.defaultValue==null?'':p.defaultValue); }
    else if(k==='owner') p.owner = el.value;
    else if(k==='default') p.defaultValue = p.type==='boolean' ? el.checked : el.value;
    render(); return;
  }
  const rt = el.dataset.rt; if(!rt) return;
  const flow = S.definition.taskFlow;
  const i = +el.dataset.i;
  if(rt==='cfg'){ flow[i].defaults[el.dataset.k] = el.value; render(); return; }
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
    a.taskDefinition = el.value; a.defaults = {};   /* new type, fresh configuration */
    render(); return;
  }
  if(rt==='act-cfg'){
    const a = flow[i].possibleActivities[+el.dataset.j];
    (a.defaults = a.defaults||{})[el.dataset.k] = el.value; render(); return;
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
