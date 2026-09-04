/* ===========================================================================
   Flow graph — the read-only SVG overview drawn above the step list.
   =========================================================================== */
"use strict";

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

