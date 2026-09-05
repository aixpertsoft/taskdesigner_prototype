/* ===========================================================================
   Inbox view — the runtime's landing screen and its tabs.

   Part of the split prototype: classic scripts sharing one global scope, so
   this file may call anything its siblings declare — resolution happens at
   call time, after every file has loaded. index.html wires and boots.
   =========================================================================== */
"use strict";

/* ============================ render: inbox ============================ */
function inboxFilter(){
  const m=S.me;
  /* The human task list. In the real API this is GET /workitems?assignedToMe —
     a query over work items, not over requests. */
  if(S.inboxTab==='action'){
    return S.requests.filter(r=>myWorkItems(r,m).length>0);
  }
  if(S.inboxTab==='mine')   return S.requests.filter(r=>r.requester===m);
  if(S.inboxTab==='open')   return S.requests.filter(r=>['OPEN','RUNNING'].includes(requestStatus(r)));
  return S.requests;
}
function viewInbox(){
  const counts = {
    action:   S.requests.reduce((n,r)=>n+myWorkItems(r,S.me).length,0),
    mine:     S.requests.filter(r=>r.requester===S.me).length,
    open:     S.requests.filter(r=>['OPEN','RUNNING'].includes(requestStatus(r))).length,
  };
  const list = inboxFilter();
  return `
  <div class="page-head">
    <div>
      <h1>Task Requests</h1>
      <p>Changes waiting to be reviewed, approved and carried out.</p>
    </div>
    <button class="btn primary" data-act="new-request">${I.plus} New task request</button>
  </div>
  <div class="tabs" role="tablist">
    <button role="tab" aria-selected="${S.inboxTab==='action'}"   data-tab="action">Awaiting my action
      ${counts.action?`<span class="pill warn">${counts.action}</span>`:`<span class="count">0</span>`}</button>
    <button role="tab" aria-selected="${S.inboxTab==='mine'}"     data-tab="mine">My requests <span class="count">${counts.mine}</span></button>
    <button role="tab" aria-selected="${S.inboxTab==='open'}"     data-tab="open">All open <span class="count">${counts.open}</span></button>
    <button role="tab" aria-selected="${S.inboxTab==='all'}"      data-tab="all">Everything <span class="count">${S.requests.length}</span></button>
  </div>
  ${list.length ? `<div class="rows">${list.map(inboxRow).join('')}</div>`
    : `<div class="empty">Nothing here for ${esc(me().name)} right now. Try another tab, or switch user.</div>`}`;
}
function inboxRow(r){
  const failed = r.taskItems.filter(t=>t.status==='FAILED').length;
  const mine = myWorkItems(r,S.me).length;
  const parked = r.run && r.run.state==='WAITING';
  const bits = [`${r.taskItems.length} task${r.taskItems.length===1?'':'s'}`];
  if(r.closed) bits.push(`closed — ${r.closed.reason}`);
  else if(failed) bits.push(`${failed} failed execution${failed===1?'':'s'}`);
  else if(parked){
    /* Name the step that is actually waiting — the flow decides what that is. */
    const w = openWorkItems(r)[0];
    bits.push(w ? (mine ? 'waiting for you — '+w.title : 'waiting — '+w.title) : 'waiting');
  }
  else if(requestStatus(r)==='OPEN' && r.taskItems.length) bits.push('ready to launch');
  /* In the action tab the row opens the FORM directly — the fastest path to
     acting. The request stays one click away via Show request. */
  const myWi = myWorkItems(r,S.me)[0];
  const direct = S.inboxTab==='action' && myWi;
  return `<div class="row" ${direct
      ? `data-wi="${myWi.id}" data-open-req="${r.id}" title="Open the form and act on it"`
      : `data-open="${r.id}"`} tabindex="0" role="button">
    <div class="rmain">
      <div class="rtitle">
        ${mine?`<span class="pill warn">${I.pause} your turn</span>`:''}
        <span class="pill ${STATUS_TONE[requestStatus(r)]}">${requestStatus(r)}</span>
        <span class="id mono">${r.id}</span>
        <strong>${esc(r.name)}</strong>
        ${failed?`<span class="pill bad">${I.warn} failed</span>`:''}
      </div>
      <div class="rmeta">${bits.map((b,i)=>`${i?'<span class="dot">·</span>':''}<span>${esc(b)}</span>`).join('')}</div>
    </div>
    <div class="rside">${esc(S.definition.name)}<br>${esc(USERS[r.requester].name)}${direct
      ? `<br><button class="btn sm" data-open="${r.id}" style="margin-top:6px">Show request</button>` : ''}</div>
  </div>`;
}

