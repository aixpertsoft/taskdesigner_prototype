/* ===========================================================================
   Request type editor — the administrator's side: the SCREEN SHELL.

   A request type carries two things: the TASK FLOW and its DATA PARAMETERS.
   There is no pre-execution approval gate — WHO may execute is a
   user-permission question in the real system, and approval, where a process
   needs one, is an activity in the flow. Since v4 it also
   carries ALL the data wiring — each flow step is a call site for a task
   type, which is itself a pure function with no reference to any request.

   This file owns the DOCUMENT: the JSON loaded from request-types.json.js,
   the apiVersion guard, export/import, and the screen frame that mounts the
   sections. The sections themselves live next to it:

     flow-editor.js      the Task flow section — list, add step, validation
     flow-step-card.js   one activity's card: wiring, runtime config, edges
     flow-graph.js       the read-only SVG overview of the graph
     data-editor.js      the Data parameters section
     execution-rules-editor.js   the Execution rules section

   Classic scripts in one global scope — load order among the designer files
   does not matter, because everything is called at render time.
   =========================================================================== */
"use strict";

/* ============================ the document ============================ */
/* request-types.json.js is the source. Everything the editor changes is changed
   in this object, so Export hands back exactly what the server would store. */
const RT_API = 'aixboms.requesttype/v5';
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
    dataParameters:[], taskFlow:[]}));
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
      ${[['flow','Task flow'],['data','Data parameters']]
        .map(([k,l])=>`<button data-def="${k}" aria-current="${S.defSection===k}">${l}</button>`).join('')}
    </nav>
    <div class="card">
      ${S.defSection==='flow'    ? defFlow()
       :                           defData()}
    </div>
  </div>`;
}


function dlgRtExport(){
  openModal(`<div class="dialog wide" role="dialog" aria-modal="true" aria-label="Export">
    <div class="dhead"><h2>request-types.json</h2>
      <button class="iconbtn" data-act="close">${I.cross}</button></div>
    <div class="dbody">
      <p style="margin:0;color:var(--ink-3);font-size:13px">The request type as the server would
        store it — flow, data wiring, step rules, data parameters and gate rules. This is the whole
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
  }
});
