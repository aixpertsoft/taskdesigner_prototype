/* ===========================================================================
   Execution rules editor.

   Execution rules gate the WHOLE run before it starts — they answer "may this
   request run at all?". They are not to be confused with a task flow step's own
   skipWhen / requires, which answer "should this one step run, now?" and can only
   be judged once the run is under way. Those live in request-type-editor.js.

   Two rule types, deliberately:

     approvals                    Minimum N approvals from a role, optionally
                                  excluding the requester.
     noUnresolvedChangeRequests   Nothing may be objected to.

   Both are structured predicates — a kind plus its fields, never an expression.
   The original requirements document proposed "boolean typescript expressions";
   that contradicts a decision already taken in this codebase, and both examples
   it named are structured predicates anyway.

   evaluateRule() in index.html still understands `data` and `allTasksSucceeded`
   as well, so an imported document carrying them keeps working — this editor
   simply does not offer them.

   Removing the approvals rule has a visible consequence: a request type that
   needs no approval should not show an approvals rail. See requiresApprovals().
   =========================================================================== */
"use strict";

const RULE_TYPES = {
  approvals: {
    label:'Minimum approvals from a role',
    blurb:'N people holding a given role must approve before the request may run.',
    make:()=>({kind:'approvals', min:1, roles:['Administrator'], excludeRequester:true}),
    once:false,
  },
  noUnresolvedChangeRequests: {
    label:'No open change requests',
    blurb:'Nothing raised in the conversation may still be unresolved.',
    make:()=>({kind:'noUnresolvedChangeRequests'}),
    once:true,   /* a second copy would say nothing new */
  },
};

/* Every role any demo user holds. In the real thing this is the principal picker. */
function knownRoles(){
  const set = new Set();
  USER_ORDER.forEach(u=>USERS[u].roles.forEach(r=>set.add(r)));
  return [...set];
}

function ruleCard(rule,i,gate){
  const meta = RULE_TYPES[rule.kind];
  const result = gate.rules[i];
  return `
  <div class="rulecard">
    <div class="rulecard-top">
      <span class="rulecard-num">${i+1}</span>
      <strong style="flex:1">${esc(meta?meta.label:rule.kind)}</strong>
      ${result?`<span class="pill ${result.satisfied?'ok':'bad'}">${result.satisfied?'passing':'blocking'}</span>`:''}
      <button class="btn sm ico" data-er="del" data-i="${i}"
        title="Remove this rule">${I.trash}</button>
    </div>
    <div class="rulecard-body">
      ${rule.kind==='approvals'? `
        <span>at least</span>
        <input type="number" min="1" max="4" value="${rule.min}" data-er="min" data-i="${i}">
        <span>approval${rule.min===1?'':'s'} from</span>
        <div class="rolepick">
          ${knownRoles().map(role=>`
            <label class="rolechip ${(rule.roles||[]).includes(role)?'on':''}">
              <input type="checkbox" data-er="role" data-i="${i}" data-role="${esc(role)}"
                ${(rule.roles||[]).includes(role)?'checked':''}>
              ${esc(role)}
            </label>`).join('')}
        </div>
        <label class="switch" style="gap:7px">
          <input type="checkbox" data-er="excl" data-i="${i}" ${rule.excludeRequester?'checked':''}>
          <span class="track"></span><span>not the requester</span>
        </label>`
      : rule.kind==='data' ? `
        <span class="chip">${esc(rule.path)}</span><span>must be set</span>
        <span class="hint">Imported rule — this editor does not create these.</span>`
      : `<span style="color:var(--ink-3)">${esc(RULE_TYPES[rule.kind]?RULE_TYPES[rule.kind].blurb:'No options.')}</span>`}
    </div>
    ${result && !result.satisfied
      ? `<div class="rulecard-why">${esc(result.reason||'')}</div>` : ''}
  </div>`;
}

function defRules(){
  const r = req() || S.requests[0];
  const gate = evaluateGate(r);
  const rules = S.definition.executionRules || [];
  const addable = Object.entries(RULE_TYPES)
    .filter(([kind,m])=>!(m.once && rules.some(x=>x.kind===kind)));

  return `<div style="padding:15px">
    <p style="margin:0 0 12px;color:var(--ink-3);font-size:13px">
      Every rule here must pass before Execute unlocks — they gate the <b>whole run</b> before it
      starts. A step's own <i>skip</i> and <i>precondition</i> rules live on the
      <b>Task flow</b>, because those can only be judged once the run is under way.
      Change anything and the gate on <span class="mono">${esc(r.id)}</span> responds immediately.</p>

    ${rules.length
      ? rules.map((rule,i)=>ruleCard(rule,i,gate)).join('')
      : `<div class="empty">No rules — <b>every</b> request of this type could be executed by
          anyone the moment it has a task. That is a valid setting, and occasionally the right one,
          but it is worth saying out loud.</div>`}

    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
      ${addable.map(([kind,m])=>`
        <button class="btn" data-er="add" data-kind="${kind}" title="${esc(m.blurb)}">
          ${I.plus} ${esc(m.label)}</button>`).join('')}
      ${addable.length?'':`<span class="hint">Both rule types are already in use.</span>`}
    </div>

    ${!requiresApprovals()?`<div class="rulenote">${I.warn}
      <div>No approvals rule, so the request editor shows no approvals rail — there is nobody to
        show. Add one and it comes back.</div></div>`:''}

    <div class="rulenote" style="margin-top:9px">
      <div><b>On failure:</b> ${S.definition.onError==='STOP'
        ? 'stop — remaining tasks are left untouched.' : 'carry on with the remaining tasks.'}
      <button class="btn sm ghost" data-er="onerror" style="margin-left:6px">Change</button></div>
    </div>
  </div>`;
}

/* ============================ events ============================ */
document.addEventListener('click', e=>{
  const btn = e.target.closest('[data-er]');
  if(!btn) return;
  const rules = S.definition.executionRules;
  switch(btn.dataset.er){
    case 'add':{
      rules.push(RULE_TYPES[btn.dataset.kind].make());
      render(); toast('Rule added'); break;
    }
    case 'del':{
      const [gone] = rules.splice(+btn.dataset.i,1);
      render();
      toast(gone.kind==='approvals' ? 'Approvals no longer required' : 'Rule removed');
      break;
    }
    case 'onerror':
      S.definition.onError = S.definition.onError==='STOP'?'CONTINUE':'STOP';
      render(); break;
  }
});

document.addEventListener('change', e=>{
  const el = e.target; const er = el.dataset.er; if(!er) return;
  const rule = S.definition.executionRules[+el.dataset.i];
  if(er==='min'){
    rule.min = Math.max(1, Math.min(4, parseInt(el.value||'1',10)));
    render(); return;
  }
  if(er==='excl'){ rule.excludeRequester = el.checked; render(); return; }
  if(er==='role'){
    const role = el.dataset.role;
    rule.roles = rule.roles || [];
    if(el.checked){ if(!rule.roles.includes(role)) rule.roles.push(role); }
    else rule.roles = rule.roles.filter(x=>x!==role);
    render(); return;
  }
});

/* ============================ styles ============================ */
document.head.insertAdjacentHTML('beforeend', `<style>
.rulecard-top .ico{width:26px;height:26px;padding:0;justify-content:center;border-color:transparent;
  background:transparent;color:var(--ink-3)}
.rulecard-top .ico:hover{background:var(--surface-2);color:var(--ink)}
.rulecard-why{padding:0 11px 10px 44px;font-size:12.5px;color:var(--bad)}
.rolepick{display:flex;gap:5px;flex-wrap:wrap}
.rolechip{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;
  border:1px solid var(--border);background:var(--surface-2);font-size:12px;color:var(--ink-2);
  cursor:pointer;user-select:none}
.rolechip.on{background:var(--accent-soft);border-color:var(--accent-line);color:var(--accent);
  font-weight:600}
.rolechip input{position:absolute;opacity:0;pointer-events:none}
.rulenote{display:flex;gap:9px;align-items:flex-start;margin-top:13px;padding:11px 13px;
  background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r);
  font-size:12.5px;color:var(--ink-2)}
</style>`);
