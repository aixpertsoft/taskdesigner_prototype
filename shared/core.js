/* ===========================================================================
   Core — icons, demo users, helpers, and the RULE ENGINE.

   evaluateRule/evaluateGate mirror the specification and are the part worth
   porting; see docs/prototype-guide.md, Porting notes.

   Part of the split prototype: classic scripts sharing one global scope, so
   this file may call anything its siblings declare — resolution happens at
   call time, after every file has loaded. index.html wires and boots.
   =========================================================================== */
"use strict";

/* ============================ icons ============================ */
const I = {
  chevL:'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3 5 8l5 5"/></svg>',
  chevD:'<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 6 8 10.5 12.5 6"/></svg>',
  check:'<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4.5 6.2 11.5 3 8.3"/></svg>',
  cross:'<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 4 4 12M4 4l8 8"/></svg>',
  warn:'<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.2 15 14H1L8 2.2Z"/><path d="M8 6.4v3.2M8 11.8v.1"/></svg>',
  plus:'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 3.5v9M3.5 8h9"/></svg>',
  cable:'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 1.5v3.2M5.6 1.5v3.2"/><rect x="1.9" y="4.7" width="4.8" height="3.4" rx="1"/><path d="M4.3 8.1v2.4a3 3 0 0 0 3 3h1.4"/><path d="M13 14.5v-3.2M10.4 14.5v-3.2"/><rect x="9.3" y="7.9" width="4.8" height="3.4" rx="1"/></svg>',
  port:'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.6" y="3.4" width="12.8" height="9.2" rx="1.4"/><path d="M4.4 6.3v3.4M8 6.3v3.4M11.6 6.3v3.4"/></svg>',
  hello:'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.2 4.2h11.6v7.2H9.4L6.6 13.8v-2.4H2.2z"/></svg>',
  log:'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.4 1.8h6l3.2 3.2v9.2H3.4z"/><path d="M9.2 1.9V5h3.2M5.6 8.4h4.8M5.6 10.9h3.2"/></svg>',
  gear:'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.1"/><path d="M8 1.4v1.5M8 13.1v1.5M14.6 8h-1.5M2.9 8H1.4M12.7 3.3l-1.1 1.1M4.4 11.6l-1.1 1.1M12.7 12.7l-1.1-1.1M4.4 4.4 3.3 3.3"/></svg>',
  rerun:'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 8a5.5 5.5 0 1 1-1.7-3.9"/><path d="M13.5 2v3.2h-3.2"/></svg>',
  trash:'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.6 4.2h10.8M6 4.2V2.8h4v1.4M4 4.2l.6 9h6.8l.6-9"/></svg>',
  play:'<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 2.8 12.8 8l-8.3 5.2z"/></svg>',
  spin:'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 1.8a6.2 6.2 0 1 1-4.4 1.8"/></svg>',
  pause:'<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="3" width="3" height="10" rx="1"/><rect x="9" y="3" width="3" height="10" rx="1"/></svg>',
  pen:'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1.8 14.2h12.4"/><path d="M11.1 2.2a1.6 1.6 0 0 1 2.3 2.3l-7 7-3 .7.7-3z"/></svg>',
  doc:'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.4 1.8h6l3.2 3.2v9.2H3.4z"/><path d="M9.2 1.9V5h3.2M5.6 8.4h4.8M5.6 10.9h3.2"/></svg>',
  box:'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1.8 4.6 8 1.8l6.2 2.8v6.8L8 14.2l-6.2-2.8z"/><path d="M1.8 4.6 8 7.4l6.2-2.8M8 7.4v6.8"/></svg>',
  mail:'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.6" y="3.2" width="12.8" height="9.6" rx="1.4"/><path d="m1.9 4.4 6.1 4.3 6.1-4.3"/></svg>',
  stamp:'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.6 13.6h10.8"/><rect x="2.6" y="9.6" width="10.8" height="2.6" rx="1"/><path d="M6 9.6V7.4a2 2 0 0 1-.6-1.5V4.2a2 2 0 0 1 2-2h1.2a2 2 0 0 1 2 2v1.7A2 2 0 0 1 10 7.4v2.2"/></svg>',
  eye:'<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1.2 8S3.8 3.6 8 3.6 14.8 8 14.8 8 12.2 12.4 8 12.4 1.2 8 1.2 8Z"/><circle cx="8" cy="8" r="1.9"/></svg>',
};

/* ============================ reference data ============================ */
const USERS = {
  mb:{id:'mb',name:'M. Browett',initials:'MB',roles:['NetOps']},
  as:{id:'as',name:'A. Schmidt',initials:'AS',roles:['Administrator','NetOps']},
  kw:{id:'kw',name:'K. Weber', initials:'KW',roles:['Administrator']},
  jn:{id:'jn',name:'J. Novak',  initials:'JN',roles:['Viewer']},
  /* Not a person and never selectable — the identity a resumed run executes under. */
  system:{id:'system',name:'System',initials:'SYS',roles:[]},
};
const USER_ORDER = ['mb','as','kw','jn'];

/* A request's status is DERIVED from its execution, never set by hand. The
   original design had a second, user-driven state machine next to the run's —
   with APPROVED-the-status competing with the approvals rule for the same word.
   One lifecycle is enough: open until the work is done. */
const STATUS_TONE = {OPEN:'blue', RUNNING:'warn', COMPLETED:'ok'};
function requestStatus(r){
  /* Derived from the run, not from the items: with conditional routing, the
     activities on an untaken branch legitimately stay NOT_RUN, so "every task
     succeeded" stopped being the test. Done = the walk reached an end.
     RUNNING covers the whole in-flight life — working AND parked on a person,
     which is most of it. A failed or cancelled run falls back to OPEN: the
     request needs attention again, and Execute can resume or restart it. */
  if(r.run && r.run.state==='COMPLETED') return 'COMPLETED';
  if(runInFlight(r)) return 'RUNNING';
  return 'OPEN';
}

/* ============================ helpers ============================ */
const $  = (s,r=document)=>r.querySelector(s);
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const me  = ()=>USERS[S.me];
const req = ()=>S.requests.find(r=>r.id===S.openRequestId);
const hasRole = (u,r)=>USERS[u].roles.includes(r);
const sleep = ms=>new Promise(r=>setTimeout(r,ms));

/* Deterministic stand-in for the SHA-256 taskConfigHash in the spec. */
function fnv(str){
  let h1=0x811c9dc5, h2=0x01000193;
  for(let i=0;i<str.length;i++){
    h1=(h1^str.charCodeAt(i))>>>0; h1=(h1*0x01000193)>>>0;
    h2=(h2+str.charCodeAt(i)*(i+7))>>>0;
  }
  return (h1.toString(16)+h2.toString(16)).padStart(12,'0').slice(0,12);
}
/* What an approval is bound to.

   Task configs alone are not enough once a step can be skipped by a data flag:
   approve, set skipApproval, execute, and the approval step vanishes without
   anything being invalidated — approve-then-edit-then-execute wearing a hat.
   So the hash covers the plan AND the author-owned data.

   Execution-written fields are excluded, or a run would dismiss its own
   approvals the moment a task stored an output. */
function authorData(r){
  const out = {};
  (S.definition.dataParameters||[])
    .filter(p=>p.owner!=='EXECUTION')
    .forEach(p=>{ out[p.name] = r.data[p.name]; });
  return out;
}
function taskConfigHash(r){
  /* The routing is in here even though the requester cannot set it: what an
     approver approved includes where the process may go — reassigning a step,
     rewiring an edge or filling a placeholder slot all move the hash. */
  const items = (r.taskItems||[]).map(t=>
    ({d:t.def, k:t.kind, i:t.inputBindings, o:t.outputBindings, q:t.requires, x:t.transitions,
      b:t.start, e:t.end, a:t.assignedRoles, u:t.dueBy}));
  return fnv(JSON.stringify({tasks:items, data:authorData(r)}));
}

/* Does this request type require approval at all? If not, there is no approvals
   rail to draw and no "awaiting my approval" inbox to fill — showing either would
   be inventing a step the process does not have. */
function requiresApprovals(){
  return (S.definition.executionRules||[]).some(x=>x.kind==='approvals');
}

/* A run is in flight while it is working or parked on a work item. */
function runInFlight(r){ return !!r.run && (r.run.state==='RUNNING' || r.run.state==='WAITING'); }
function openWorkItems(r){ return (r.workItems||[]).filter(w=>w.state==='OPEN'); }
function myWorkItems(r,user){
  return openWorkItems(r).filter(w=>w.roles.some(ro=>hasRole(user,ro)));
}
function eligibleFor(w){ return USER_ORDER.filter(u=>w.roles.some(ro=>hasRole(u,ro))); }
function stamp(){
  const d=new Date();
  const p=n=>String(n).padStart(2,'0');
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function toast(msg){
  const t=$('#toast'); t.textContent=msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove('on'),2100);
}

/* ============================ rule engine ============================ */
/* Mirrors evaluateRule() from the specification, reasons included. */
function evaluateRule(rule,r){
  const hash = taskConfigHash(r);
  switch(rule.kind){
    case 'approvals':{
      const roles = rule.roles||[];
      const valid = r.approvals.filter(a=>
        a.decision==='APPROVED' &&
        a.hash===hash &&
        (!roles.length || roles.some(ro=>hasRole(a.user,ro))) &&
        (!rule.excludeRequester || a.user!==r.requester));
      const dismissed = r.approvals.filter(a=>a.decision==='APPROVED' && a.hash!==hash).length;
      const label = `${rule.min} approval${rule.min===1?'':'s'}`
        + (roles.length?` from ${roles.join(' or ')}`:'')
        + (rule.excludeRequester?' (not the requester)':'');
      let reason = `${valid.length} of ${rule.min} so far`;
      if(dismissed) reason += ` — ${dismissed} dismissed because a task was edited after signing off`;
      return {label, satisfied: valid.length>=rule.min, reason};
    }
    case 'noUnresolvedChangeRequests':{
      const open = r.changeRequests.filter(c=>!c.resolved).length;
      return {label:'No unresolved change requests', satisfied:open===0,
              reason: open?`${open} still open`:'all resolved'};
    }
    case 'allTasksSucceeded':{
      const bad = r.taskItems.filter(t=>t.status!=='SUCCEEDED').length;
      return {label:'Every task has run successfully', satisfied:bad===0,
              reason: bad?`${bad} not yet successful`:'all succeeded'};
    }
    case 'data':{
      const v = r.data[rule.path];
      const param = S.definition.dataParameters.find(p=>p.name===rule.path);
      const ok = rule.op==='truthy' ? !!v : v===rule.value;
      return {label:`${param?param.label:rule.path} must be set`, satisfied:ok,
              reason: ok?'confirmed':'not confirmed yet'};
    }
    default: return {label:rule.kind, satisfied:false, reason:'unknown rule'};
  }
}
/* Why the gate said no, in one sentence. The prototype's stand-in for the
   GateDTO the real server returns inside a RULE_NOT_SATISFIED refusal — the
   server decides, but it also explains, and the client renders what it sent. */
function gateRefusal(r, gate){
  if(gate.noTasks) return 'a request needs at least one task';
  const failing = gate.rules.filter(x=>!x.satisfied);
  if(!failing.length) return 'rules are not satisfied';
  return `${failing[0].label} — ${failing[0].reason}`
       + (failing.length>1?` (and ${failing.length-1} more, see the checklist)`:'');
}

function evaluateGate(r){
  const rules = S.definition.executionRules.map(rule=>evaluateRule(rule,r));
  const noTasks = r.taskItems.length===0;
  return {
    rules,
    hash: taskConfigHash(r),
    noTasks,
    canExecute: !noTasks && rules.every(x=>x.satisfied),
  };
}

