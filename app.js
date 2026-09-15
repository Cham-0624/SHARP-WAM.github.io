'use strict';
const $=id=>document.getElementById(id),svg=$('diagram');
const C={raw:'#bfd7ec',blue:'#5796c2',probe:'#4d8728',route:'#365f20',ink:'#35424e',muted:'#738294',line:'#aec8dc',red:'#d83232',purple:'#ab8ad1'};
let active=0,query=0,policy=0,emaStep=5,progress=0,readProgress=0,raf=0,lastTime=0,scanTime=0,hoverBlock=-1,hoverPair=-1;
let mode='auto',autoTime=0,autoStage=-1;
const stages=[
 {duration:2.2,active:0,policy:0,en:'Clean latent → probes'},
 {duration:2.4,active:1,policy:0,en:'Form candidate D'},
 {duration:4.8,active:1,policy:1,en:'Six similarities → redundant A–B'},
 {duration:3,active:1,policy:2,en:'EMA utility: A 2.8 / B 0.3'},
 {duration:3,active:1,policy:3,en:'Evict B, admit D → A/C/D'},
 ...[0,1,2].flatMap(q=>[
  {duration:2.4,active:2,policy:3,query:q,en:`Q${q+1} · L1 temporal routing`},
  {duration:2.4,active:3,policy:3,query:q,en:`Q${q+1} · L2 spatial partitioning`},
  {duration:2.6,active:4,policy:3,query:q,en:`Q${q+1} · Gather 120 native KV tokens`}
 ])
];
const AUTO_PLAYBACK_RATE=1.2;
const cycleDuration=stages.reduce((sum,s)=>sum+s.duration,0);
const defs=[{x:0,y:0,w:5,h:4,name:'H1'},{x:5,y:0,w:5,h:4,name:'H2'},{x:0,y:4,w:5,h:4,name:'H3'},{x:5,y:4,w:5,h:4,name:'H4'},{x:0,y:8,w:5,h:2,name:'L1'},{x:0,y:10,w:5,h:2,name:'L2'},{x:5,y:8,w:5,h:2,name:'R1'},{x:5,y:10,w:5,h:2,name:'R2'}];
const accepted=()=>policy===3;
const entries=()=>accepted()?['A','C','D']:['A','B','C'];
const chosen=()=>[[0,1],[1,2],[0,2]][query];
const blocks=f=>[[[0,2,4,6],[1,2,5,7]],[[0,1,4,6],[1,3,5,7]],[[1,3,4,6],[0,3,5,7]]][query][f];
const tx=(x,y,s,size=16,color=C.ink,anchor='start',attrs='')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="${anchor}" ${attrs}>${s}</text>`;
const box=(x,y,w,h,fill='none',stroke='none',rx=3,attrs='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" ${attrs}/>`;
const line=(d,color=C.line,attrs='')=>`<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" ${attrs}/>`;
const probe=(x,y,n=18,attrs='')=>box(x,y,n,n,'url(#probe-hatch)',C.probe,1.5,'stroke-width="1.5" '+attrs);
const probes=(x,y,gap=25,n=17)=>Array.from({length:8},(_,i)=>probe(x+(i%4)*gap,y+Math.floor(i/4)*(n+6),n)).join('');
function blockOrigin(x,y,s,b,kind){const framed=kind==='temporal'||kind==='spatial';return {x:x+b.x*s+(framed&&b.x>=5?6:0),y:y+b.y*s+(framed&&b.y>=8?5:0)};}
function mosaic(x,y,s,kind='',f=0){return defs.map((b,i)=>{const o=blockOrigin(x,y,s,b,kind);let out=`<g data-kind="${kind}" data-b="${i}" data-f="${f}">`;for(let r=0;r<b.h;r++)for(let c=0;c<b.w;c++)out+=box(o.x+c*s+1,o.y+r*s+1,s-2,s-2,C.raw,C.blue,1,'class="tile" stroke-width=".45"');return out+box(o.x,o.y,b.w*s,b.h*s,'transparent',C.blue,2,'class="selected-outline"')+'</g>';}).join('');}
function compactEntry(x,y,label,attrs='',fill='#f4f8fc',stroke=C.blue){return `<g ${attrs}>`+box(x,y,278,58,fill,stroke,4,'class="card-border"')+tx(x+14,y+36,label,24,C.ink,'start','class="entry-name"')+box(x+48,y+9,61,40,'#fff',C.probe,3,'class="entry-probe" stroke-width="1.5"')+`<g class="entry-probe-units">`+probes(x+53,y+14,13,10).replaceAll('stroke-width="1.5"','stroke-width="1" class="probe-unit"')+'</g>'+[0,1,2,3].map(j=>box(x+119+j*29,y+17,24,24,C.raw,C.blue,2,'class="entry-token"')).join('')+tx(x+244,y+37,'···',21,C.ink)+'</g>';}
function probeFormation(x){
 // Compact allowed-context schematic of the probe row in the paper's causal mask.
 return box(x+12,96,284,134,'#fff','#a7bccb',6,'stroke-dasharray="5 4" id="probe-mask"')+
 tx(x+154,113,'Causal attention mask',14,C.muted,'middle')+
 tx(x+57,134,'Anchor',13,'#bd752f','middle')+tx(x+152,134,'Past probes',13,C.probe,'middle')+tx(x+249,134,'Current KV',13,C.blue,'middle')+
 `<g class="probe-anchor">`+[0,1].map(i=>box(x+38+i*21,142,17,17,'#ffe7d5','#df843c',2)).join('')+'</g>'+
 `<g class="probe-history">`+[0,1,2].map(i=>probe(x+124+i*20,142,16)).join('')+'</g>'+
 `<g class="probe-source">`+[0,1,2].map(i=>box(x+220+i*20,142,16,16,C.raw,C.blue,2,'class="tile"')).join('')+'</g>'+
 `<g class="probe-aggregation" aria-hidden="true">`+[57,152,249].map((p,i)=>line(`M${x+p} 161 L${x+p} 175 L${x+57+i*96} 185`,C.probe,`class="aggregation-ray" style="animation-delay:${i*.15}s" marker-end="url(#arrow-green)"`)).join('')+'</g>'+
 `<g class="learned-probe-group">`+Array.from({length:8},(_,i)=>probe(x+35+i*30,186,20)).join('')+'</g>'+
 tx(x+154,224,'8 contextualized probes',13,C.probe,'middle')+
 `<g class="paired-entry">`+compactEntry(x+15,235,'D')+'</g>';
}

const positions=i=>({x:254,y:290+i*69});
const graphNodes={A:[394,134],B:[608,134],C:[394,212],D:[608,212]};
const pairs=[{a:'A',b:'C',s:.21,l:[374,176]},{a:'A',b:'D',s:.18,l:[459,164]},{a:'B',b:'C',s:.12,l:[543,182]},{a:'B',b:'D',s:.35,l:[630,176]},{a:'C',b:'D',s:.27,l:[501,229]},{a:'A',b:'B',s:.94,l:[501,122]}];
function utilityEquation(x){
 return `<g id="ema-equation" role="img" aria-label="u sub i at t equals beta u sub i at t minus one plus one minus beta h sub i at t; zero less than beta less than one">`+
 `<image href="./assets/ema-equation.svg" x="${x+14}" y="242" width="280" height="30" preserveAspectRatio="xMidYMid meet"/>`+
 tx(x+154,291,'0 &lt; β &lt; 1',13,C.muted,'middle')+'</g>';
}
function miniEntry(x,y,label,stroke=C.blue,attrs=''){
 return `<g ${attrs}>`+box(x,y,84,38,'#fff',stroke,3)+tx(x+8,y+25,label,19,C.ink)+probe(x+29,y+9,20)+box(x+53,y+9,20,20,C.raw,C.blue,2)+'</g>';
}
function policyScene(){const names=['Form incoming entry D','Compare all four entries','Compare EMA utility','Evict B; admit D'];let out=tx(32,28,'(b) Fixed KV Set and EMA-utility Eviction',18)+box(20,45,1280,263,'#fcfdff','#d3dfeb',8);
 for(let i=0;i<4;i++){const x=34+i*320;out+=`<g class="policy-zone" data-policy="${i}" id="policy-${i}" tabindex="0" role="group" aria-label="${names[i]}">`+box(x,56,308,242,'transparent','none',5,'class="policy-hit"')+tx(x+12,81,`${i+1}. ${names[i]}`,16);
 if(i===0){out+=probeFormation(x);}
 if(i===1){for(let j=0;j<pairs.length;j++){const p=pairs[j],a=graphNodes[p.a],b=graphNodes[p.b];out+=`<g id="pair-${j}" class="similarity-pair" data-pair="${j}" tabindex="0" role="group" aria-label="${p.a}–${p.b}: cosine similarity ${p.s.toFixed(2)}">`+line(`M${a[0]} ${a[1]} L${b[0]} ${b[1]}`,'transparent','class="pair-hit" style="stroke-width:16;pointer-events:stroke"')+line(`M${a[0]} ${a[1]} L${b[0]} ${b[1]}`,C.line,`id="pair-line-${j}"`)+box(p.l[0]-20,p.l[1]-13,40,18,'#fcfdff','none',3)+tx(p.l[0],p.l[1],p.s.toFixed(2),14,C.line,'middle',`id="pair-score-${j}"`)+'</g>';}
 for(const [name,p]of Object.entries(graphNodes)){out+=`<g id="graph-${name}">`+probe(p[0]-11,p[1]-11,22)+tx(p[0]-19,p[1]+5,name,18,C.ink,'end')+'</g>';}
 out+=`<image id="cosine-equation" href="./assets/cosine-equation.svg" x="366" y="237" width="270" height="47" preserveAspectRatio="xMidYMid meet"/>`+tx(508,299,'Hover a connection to inspect',12,C.muted,'middle','id="scan-caption"');}
 if(i===2){out+=utilityEquation(x)+tx(x+13,110,'Past Top-K hits → EMA utility',14,C.muted);for(let r=0;r<3;r++){const y=126+r*32;out+=tx(x+16,y+18,['A','B','C'][r],18);for(let j=0;j<6;j++){const on=r===0&&[0,1,3,4,5].includes(j)||r===1&&j===1;out+=box(x+46+j*24,y,18,21,on?C.blue:'#fff','#cbd7e3',2,`id="history-${r}-${j}"`);}out+=tx(x+204,y+17,['2.8','0.3','0.2'][r],15,C.ink,'middle',`id="utility-value-${r}"`)+line(`M${x+221} ${y+11} L${x+238} ${y+11}`,C.muted,'marker-end="url(#arrow)"')+box(x+245,y+7,47,8,'#e9eff4','none',0)+box(x+245,y+7,[44,5,3][r],8,C.blue,'none',0,`id="utility-bar-${r}"`);}out+=tx(x+46,229,'Past',12,C.muted)+tx(x+184,229,'Now',12,C.muted,'end');}
 if(i===3){out+=box(x+13,103,286,35,'#edf4e8','#bad0aa',4)+tx(x+156,126,'A–B redundant → remove B',14,C.route,'middle');out+=box(x+13,156,286,90,'#f5f9fd',C.blue,3,'stroke-dasharray="5 4"')+tx(x+26,177,'Updated set',14);for(let j=0;j<3;j++){const px=x+22+j*92;out+=`<g id="result-slot-${j}">`+box(px,192,84,38,'#fff',C.blue,3,`id="result-box-${j}"`)+tx(px+8,217,['A','B','C'][j],19,C.ink,'start',`id="result-label-${j}"`)+probe(px+29,201,20)+box(px+53,201,20,20,C.raw,C.blue,2)+'</g>';}out+='<g id="top-update-overlay" pointer-events="none"></g>';out+=tx(x+156,300,'3 / 3',14,C.muted,'middle','id="policy-result-caption"');}out+='</g>';}
 return out+tx(35,332,'',15,C.muted,'start','id="policy-explanation"')+line('M20 347 L1300 347','#dce5eb');}
function zone(i,x,w){return `<g class="zone region" id="zone-${i}" data-zone="${i}" tabindex="0" role="group" aria-label="${['Input','Fixed KV Set','Temporal routing','Spatial partitioning','Native KV read'][i]}">`+box(x+2,210,w-4,352,'transparent','none',7,'class="zone-focus"')+box(x+2,210,w-4,352,'#eff5fb','none',7,'class="focus-surface"')+tx(x+14,176,'0'+(i+1),12,C.muted,'start','class="step-marker"')+tx(x+14,201,['Input &amp; index','Fixed KV Set','Temporal routing','Spatial partitioning','Native KV read'][i],18,C.ink,'start','class="zone-title"');}
function framesPanel(x,y,f,kind){const left=x+24,right=left+41,wristY=y+93;return box(x,y,128,140,'#fff',C.blue,4)+tx(x+12,y+22,'',21,C.ink,'start',`id="${kind==='temporal'?'retrieved':'spatial'}-${f}"`)+box(left-2,wristY-2,39,32,'#f8fbfd','#8ca8bd',3,'class="wrist-boundary" pointer-events="none"')+box(right-2,wristY-2,39,32,'#f8fbfd','#8ca8bd',3,'class="wrist-boundary" pointer-events="none"')+mosaic(left,y+32,7,kind,f)+tx(x+110,y+64,'H',14,C.muted)+tx(left+17.5,y+135,'L',13,C.ink,'middle','font-weight="650"')+tx(right+17.5,y+135,'R',13,C.ink,'middle','font-weight="650"');}
function build(){svg.innerHTML=`<title>SHARP-WAM: bounded KV maintenance and hierarchical sparse attention</title><desc>Hover over the upper row to compare entries A B C and incoming D, or the lower row to follow three queries through temporal and spatial selection.</desc><defs><pattern id="probe-hatch" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#fff"/><path d="M-1 1L1-1M0 6L6 0M5 7L7 5" stroke="#cfdfc2" stroke-width="1"/></pattern><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7" fill="#93adbf"/></marker><marker id="arrow-green" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7" fill="#365f20"/></marker></defs>`+policyScene()+`<g id="main-flow" transform="translate(0 355)">`+tx(32,20,'(c) Hierarchical Sparse Attention',18)+box(577,159,458,430,'#fbf9fd',C.purple,8,'stroke-width="1.7" id="hierarchy-box"')+tx(806,147,'Hierarchical sparse attention',18,'#6e4d9f','middle')+
`<g aria-hidden="true">`+line('M173 328 L229 328',C.blue,'marker-end="url(#arrow)"')+line('M550 328 L592 328',C.blue,'marker-end="url(#arrow)"')+line('M1020 328 L1071 328',C.blue,'marker-end="url(#arrow)"')+'</g>'+
zone(0,18,185)+tx(49,249,'Clean latent',17)+mosaic(62,273,10,'input')+tx(112,419,'120 tokens',15,C.muted,'middle')+line('M112 428 L112 445',C.route,'marker-end="url(#arrow-green)"')+box(41,458,143,92,'#fff',C.probe,4)+tx(112,480,'Learnable probes',14,C.probe,'middle')+`<g class="learned-probe-group input-probes">`+probes(62,493,27,17)+'</g>'+tx(112,575,'8 probes · content summary',13,C.probe,'middle')+'</g>'+
zone(1,221,344)+box(234,244,318,288,'#f3f8fd',C.blue,6)+tx(249,270,'Fixed KV Set',17)+tx(537,270,'3 / 3',15,C.muted,'end')+tx(332,284,'8 probes',12,C.probe,'middle')+tx(426,284,'Native KV',12,C.blue,'middle')+[0,1,2].map(i=>{const p=positions(i);return compactEntry(p.x,p.y,['A','B','C'][i],`data-pool="${i}" class="pool-card"`);}).join('')+tx(393,555,'Bounded capacity · native KV + probes',14,C.muted,'middle','id="pool-summary"')+`<g id="eviction-mark" opacity="0">`+box(326,576,197,37,'#fff4f4',C.red,3)+tx(424,601,'Evict B → A / C / D',15,C.red,'middle')+'</g></g>'+
zone(2,585,194)+tx(682,242,'L1 · Probe Top-K',16,C.probe,'middle')+[0,1].map(f=>framesPanel(619,264+f*151,f,'temporal')).join('')+tx(682,579,'3 entries → Top-2',15,C.muted,'middle')+'</g>'+
zone(3,793,235)+tx(911,242,'L2 · Block Top-K',16,C.ink,'middle')+[0,1].map(f=>framesPanel(846,264+f*151,f,'spatial')+line(`M750 ${329+f*151} L839 ${329+f*151}`,C.blue,'marker-end="url(#arrow)"')).join('')+tx(911,579,'8 → 4 blocks / frame',15,C.muted,'middle')+'</g>'+
zone(4,1050,256)+box(1075,289,219,167,'#f5f9fd',C.blue,5)+tx(1184,319,'Selected native KV',17,C.ink,'middle')+`<g id="gathered"></g>`+tx(1184,440,'120 raw tokens',15,C.muted,'middle')+tx(1184,498,'Read native keys / values',15,C.muted,'middle')+'</g>'+
`<g id="query-group" transform="translate(0 -28)">`+box(648,36,316,100,'#fff','#414141',5,'stroke-width="2"')+tx(669,68,'Current Q',24,C.ink,'start','font-weight="650"')+tx(943,65,'Hover to switch',13,C.muted,'end','id="query-hint"')+[0,1,2].map(q=>`<g class="query-choice" data-query="${q}" tabindex="0" role="button" aria-label="Query ${q+1}">`+box(663+q*97,83,90,40,'#fff','#9eacb8',4,`id="query-bg-${q}"`)+tx(708+q*97,111,'Q'+(q+1),23,C.ink,'middle','font-weight="600"')+'</g>').join('')+'</g>'+`<g id="route-lines" class="trace" pointer-events="none"></g><g id="raw-paths" class="trace" pointer-events="none"></g><g id="incoming" pointer-events="none"></g><g id="reading" pointer-events="none"></g></g><g id="auto-packets" pointer-events="none" aria-hidden="true"></g>`;
 $('headline').textContent='Follow the tokens through sparse memory.';$('instruction').textContent='Compare A/B/C with incoming D above; hover over Current Q below to explore sparse access.';document.documentElement.lang='en';
 $('legend').innerHTML=`<span><i class="raw"></i>${'Clean / native KV'}</span><span><i class="probe"></i>Probe token</span><span><i class="unrouted"></i>${'Not routed'}</span><span><i class="routed"></i>Top-K routed</span><span><i class="hierarchical"></i>${'Hierarchical sparse attention'}</span>`;
 $('scope').textContent='Colors, A/B/C/D entries, six similarity scores and final EMA utilities follow the paper figure. Capacity 3 and Top-2 illustrate the mechanism; query selections, probe aggregation paths and intermediate EMA trajectories are schematic; probes are not assigned one-to-one to camera blocks. 120 tokens / eight blocks per frame; anchor/recent paths and layer differences omitted.';$('touch-note').textContent='Tap and swipe on touch screens, or focus with Tab.';paintQuery();update();paintPlayback();if(mode==='auto'){paintAutoStage();paintAutoPackets();}}
function paintQuery(){const es=entries(),cs=chosen();for(let f=0;f<2;f++){$('retrieved-'+f).textContent=es[cs[f]];$('spatial-'+f).textContent=es[cs[f]];}
 let routes='';for(let i=0;i<3;i++){const p=positions(i),on=cs.includes(i);routes+=line(`M648 83 C590 83 ${p.x+78} 204 ${p.x+78} ${p.y+29}`,on?C.route:'#a4a4a4',on?'class="route-selected" marker-end="url(#arrow-green)"':'class="route-unselected" stroke-dasharray="4 5"');if(on){const f=cs.indexOf(i),y=329+f*151;routes+=line(`M${p.x+278} ${p.y+29} C578 ${p.y+29} 575 ${y} 614 ${y}`,C.route,'class="route-selected" marker-end="url(#arrow-green)"');}}$('route-lines').innerHTML=routes;
 let tiles='',n=0;for(let f=0;f<2;f++)for(const bi of blocks(f)){const b=defs[bi];for(let k=0;k<b.w*b.h;k++){tiles+=box(1116+(n%15)*9,341+Math.floor(n/15)*9,6.8,6.8,C.raw,C.blue,1,'stroke-width=".5"');n++;}}$('gathered').innerHTML=tiles;$('raw-paths').innerHTML=[0,1].map(f=>line(`M977 ${329+f*151} C1035 ${329+f*151} 1016 376 1069 376`,C.blue,'class="flow"')).join('');for(let q=0;q<3;q++){$('query-bg-'+q).setAttribute('fill',q===query?'#e7eff5':'#fff');$('query-bg-'+q).setAttribute('stroke',q===query?'#34424f':'#a8b5bf');$('query-bg-'+q).setAttribute('stroke-width',q===query?2:1);}}
const captions=()=>[
 ['Build an index. Keep detail.','Blue squares denote native visual KV; green hatched squares denote probes. Eight learnable probes use a causal mask to attend to anchors, current content and past probes. Their summaries are stored alongside native KV in entry D.','Color denotes token type. H, L and R identify head and wrist views.'],
 ['A/B/C → A/C/D','A and B have the highest probe similarity (0.94). With utility 2.8 for A and 0.3 for B, evict B and admit D.','A and C remain, D enters, and capacity stays at three.'],
 ['Retrieve historical entries via probes.','Hover over Q1 / Q2 / Q3 above steps 03/04. Animated green dashed paths reach selected probes; gray dashed paths indicate unselected entries.','Three queries retrieve three distinct Top-2 pairs without changing the set.'],
 ['Locate regions within retrieved frames.','Block-level pooled Q/K scores relevance. H has four blocks; L and R each have two, aligned side by side in one row. Hover over a block to inspect it.','Selected blocks stay blue; unselected blocks turn white with gray borders. Their native KV remains stored.'],
 ['Read the selected native KV.','Selected spatial blocks from two frames supply 120 historical raw tokens and their native keys and values.','This example accesses 120 / 360 historical raw tokens, excluding other context and retrieval costs.']
];
function update(){svg.setAttribute('data-probe-learning',String(policy===0&&active<=1));for(let i=0;i<5;i++){$('zone-'+i).classList.toggle('active',active===i);$('zone-'+i).classList.toggle('visited',i<active);}$('route-lines').setAttribute('opacity',active>=2?1:0);$('raw-paths').setAttribute('opacity',active===4?1:0);$('query-group').setAttribute('opacity',1);
 for(const el of svg.querySelectorAll('[data-pool]')){const i=+el.dataset.pool,on=active<2||chosen().includes(i);el.style.opacity=on?1:.32;el.classList.toggle('routed',active>=2&&on);const border=el.querySelector('.card-border');border.setAttribute('stroke',!on?'#bbb':active>=2?C.route:C.blue);const pr=el.querySelector('.entry-probe');pr.setAttribute('fill','#fff');for(const unit of el.querySelectorAll('.probe-unit')){unit.setAttribute('fill',on?'url(#probe-hatch)':'#fff');unit.setAttribute('stroke',on?C.probe:'#bbb');}pr.setAttribute('stroke',on?C.probe:'#bbb');border.setAttribute('stroke-width',on&&active>=2?3.5:1);border.setAttribute('fill',active>=2&&on?'#edf5e5':'#f4f8fc');pr.setAttribute('stroke-width',active>=2&&on?2.8:1.5);for(const raw of el.querySelectorAll('.entry-token')){raw.setAttribute('fill',on?C.raw:'#fff');raw.setAttribute('stroke',on?C.blue:'#bbb');}}
 for(const el of svg.querySelectorAll('[data-kind="spatial"]')){const on=active<3||blocks(+el.dataset.f).includes(+el.dataset.b);for(const tile of el.querySelectorAll('.tile')){tile.setAttribute('fill',on?C.raw:'#fff');tile.setAttribute('stroke',on?C.blue:'#c4c4c4');}el.querySelector('.selected-outline').setAttribute('stroke',on?C.blue:'#bbb');el.querySelector('.selected-outline').setAttribute('stroke-width',on&&active>=3?2:1);}
 $('zone-1').style.opacity=active>=2?1:'';const summary=$('pool-summary');summary.textContent=active>=2?'Top-2: '+chosen().map(i=>entries()[i]).join(' + '):'Bounded capacity · native KV + probes';summary.setAttribute('fill',active>=2?C.route:C.muted);summary.setAttribute('font-size',active>=2?19:14);summary.setAttribute('font-weight',active>=2?750:400);const d=captions()[active];$('number').textContent='0'+(active+1);$('title').textContent=d[0];$('description').textContent=d[1];$('key').textContent=d[2];paintPolicy();paintSimilarity();if(!raf)raf=requestAnimationFrame(animate);}
function paintPolicy(){for(let i=0;i<4;i++)$('policy-'+i).classList.toggle('policy-active',policy===i);if(active===1&&policy>=1&&policy<3){for(const i of [0,1]){const b=svg.querySelector(`[data-pool="${i}"] .card-border`);b.setAttribute('stroke',i===1&&policy===2?C.red:C.route);b.setAttribute('stroke-width','3');}}
 const trajectories=[[1.5,2.1,1.8,2.4,2.0,2.8],[.9,.72,.58,.46,.37,.3],[.61,.49,.39,.31,.25,.2]];for(let r=0;r<3;r++){const u=trajectories[r][emaStep];$('utility-value-'+r).textContent=u.toFixed(1);$('utility-bar-'+r).setAttribute('width',47*u/3);for(let j=0;j<6;j++)$('history-'+r+'-'+j).setAttribute('opacity',j<=emaStep?1:.2);}
 const es=entries();for(let i=0;i<3;i++){$('result-label-'+i).textContent=es[i];$('result-box-'+i).setAttribute('stroke',es[i]==='D'?C.probe:C.blue);}$('policy-result-caption').textContent=policy===3?'Evict B / admit D · 3 / 3':'3 / 3';
 const details=['① Eight learnable probes aggregate anchor, current visual content and past probes through a causal mask. Pair the resulting summaries with native KV to form candidate D.','② Score all six A/B/C/D pairs, then emphasize the highest-scoring pair A–B (0.94).','③ A has EMA utility 2.8 and B 0.3. C is lower (0.2), but is outside the most redundant pair.','④ Evict lower-utility B within pair A–B, keep A/C, and admit D: the updated set is A/C/D.'];$('policy-explanation').textContent=details[policy];if(active===1){$('number').textContent='(b) '+(policy+1);$('title').textContent=['Form candidate D','Six pairs → A–B','2.8 versus 0.3','A/B/C → A/C/D'][policy];$('description').textContent=details[policy];$('key').textContent=policy===3?'In general, D is rejected only when it belongs to the most redundant pair and has lower retention priority than its partner. Equal priority favors D.':'Similarity identifies a redundant pair; historical utility decides which member to retain.';}}
function paintSimilarity(){
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const scanning=mode==='auto'&&policy===1&&!reduced;
 const phase=scanning?Math.floor((scanTime%6.2)/.6):6;
 const inspected=mode==='manual'?hoverPair:-1;
 for(let j=0;j<6;j++){
  const winner=j===5,hovered=j===inspected,hot=hovered||(scanning&&j===phase);
  const shown=!scanning||j<=phase||winner;
  const path=$('pair-line-'+j),label=$('pair-score-'+j);
  path.setAttribute('stroke',winner?'#285cac':hot?'#3478c5':'#b6cbed');
  path.setAttribute('stroke-width',winner?(hovered?5.5:4):hot?2.8:1.2);
  path.setAttribute('opacity',shown?1:.24);
  label.setAttribute('fill',winner||hot?'#2459a6':'#a5bfe4');
  label.setAttribute('font-weight',winner||hot?'750':'500');
  label.setAttribute('opacity',shown?1:.3);
 }
 for(const name of ['A','B','C','D']){
  const on=inspected>=0&&(pairs[inspected].a===name||pairs[inspected].b===name);
  $('graph-'+name).classList.toggle('pair-endpoint-active',on);
 }
 $('scan-caption').textContent=inspected>=0?(inspected===5?'A–B · most redundant · 0.94':`${pairs[inspected].a}–${pairs[inspected].b} · cosine ${pairs[inspected].s.toFixed(2)}`):scanning?(phase>=6?'Most redundant: A–B = 0.94':'Comparing probe pairs…'):mode==='manual'?'Hover a connection to inspect':'Most redundant: A–B = 0.94';
}
function animate(time){if(document.hidden){raf=0;lastTime=0;return;}const dt=(lastTime?Math.min((time-lastTime)/1000,.05):.016)*(mode==='auto'?AUTO_PLAYBACK_RATE:1);lastTime=time;if(mode==='auto')advanceAuto(dt);const goal=accepted()?1:0,readGoal=active===4?1:0;progress+=Math.sign(goal-progress)*Math.min(Math.abs(goal-progress),dt/1.6);readProgress+=Math.sign(readGoal-readProgress)*Math.min(Math.abs(readGoal-readProgress),dt/.85);const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;if(reduced){progress=goal;readProgress=readGoal;}
 const moving=progress>.01&&progress<.99,e=progress*progress*(3-2*progress);const names=progress>.92?['A','C','D']:['A','B','C'];for(const el of svg.querySelectorAll('[data-pool]')){const i=+el.dataset.pool;el.querySelector('.entry-name').textContent=names[i];el.style.opacity=moving&&i>0?.12:active>=2&&!chosen().includes(i)?.32:1;}$('eviction-mark').setAttribute('opacity',e);let overlay='';if(moving){overlay+=compactEntry(46+(254-46)*e,476+(428-476)*e,'D','','#fff',C.probe);overlay+=`<g opacity="${1-e}">`+compactEntry(254+90*e,359+200*e,'B','','#fff4f4',C.red)+'</g>';overlay+=compactEntry(254,428-69*e,'C');}$('incoming').innerHTML=overlay;paintTopUpdate();
 let flying='';if(readProgress>.01&&readProgress<.99){const a=readProgress*readProgress*(3-2*readProgress);let n=0;for(let f=0;f<2;f++)for(const bi of blocks(f)){const b=defs[bi];for(let r=0;r<b.h;r++)for(let c=0;c<b.w;c++){const o=blockOrigin(870,296+f*151,7,b,'spatial'),sx=o.x+c*7+1,sy=o.y+r*7+1,ex=1116+(n%15)*9,ey=341+Math.floor(n/15)*9;flying+=box(sx+(ex-sx)*a,sy+(ey-sy)*a,6,6,C.raw,C.blue,1);n++;}}}$('reading').innerHTML=flying;if(mode==='auto')$('gathered').setAttribute('opacity',active===4&&readProgress>=.99?1:0);else $('gathered').setAttribute('opacity',1);
 if(mode==='auto'&&policy===1&&!reduced&&!document.hidden){scanTime+=dt;paintSimilarity();}if(mode==='auto'||Math.abs(progress-goal)>.001||Math.abs(readProgress-readGoal)>.001||mode==='auto'&&policy===1&&!reduced&&!document.hidden){raf=requestAnimationFrame(animate);}else{raf=0;lastTime=0;}}
function activate(i){if(i===active&&policy===(i===0?0:3))return;active=i;policy=i===0?0:3;emaStep=5;hoverBlock=-1;paintQuery();update();}
function handle(e){if(mode==='auto')return;const pairTarget=e.target.closest('[data-pair]');const nextPair=pairTarget?+pairTarget.dataset.pair:-1;if(nextPair!==hoverPair){hoverPair=nextPair;paintSimilarity();}const pe=e.target.closest('[data-policy]');if(pe){const p=+pe.dataset.policy;if(p===1&&policy!==1)scanTime=0;policy=p;if(policy===3)emaStep=5;active=1;paintQuery();update();return;}const q=e.target.closest('[data-query]');if(q){query=+q.dataset.query;activate(2);paintQuery();update();return;}const z=e.target.closest('[data-zone]');if(z&&!(+z.dataset.zone===1&&active>=2))activate(+z.dataset.zone);const pool=e.target.closest('[data-pool]');if(pool&&active>=2){const i=+pool.dataset.pool;$('key').textContent=entries()[i]+' · '+(chosen().includes(i)?'Top-2 selected · access its historical KV':'Not selected · retained in the set');return;}const b=e.target.closest('[data-kind="spatial"]');if(b){const i=+b.dataset.b,f=+b.dataset.f,on=blocks(f).includes(i);hoverBlock=i;$('key').textContent=`${entries()[chosen()[f]]} · ${defs[i].name} · ${defs[i].w*defs[i].h} raw tokens · ${on?'Read native KV':'Not accessed; retained'}`;}else if(hoverBlock>=0){hoverBlock=-1;$('key').textContent=captions()[active][2];}}
svg.addEventListener('pointerleave',()=>{if(mode==='manual'){hoverPair=-1;paintSimilarity();}});svg.addEventListener('focusout',e=>{if(mode==='manual'&&!e.relatedTarget?.closest('[data-pair]')){hoverPair=-1;paintSimilarity();}});svg.addEventListener('pointerover',handle);svg.addEventListener('focusin',handle);svg.addEventListener('click',handle);svg.addEventListener('pointermove',e=>{if(mode==='auto')return;if(e.target.closest('[data-policy="2"]')){const point=svg.createSVGPoint();point.x=e.clientX;point.y=e.clientY;const local=point.matrixTransform(svg.getScreenCTM().inverse()),n=Math.max(0,Math.min(5,Math.floor((local.x-720)/24)));if(n!==emaStep){emaStep=n;paintPolicy();}}});svg.addEventListener('keydown',e=>{if(mode==='auto')return;if(e.target.closest('[data-zone]')&&(e.key==='ArrowRight'||e.key==='ArrowLeft')){e.preventDefault();$('zone-'+Math.max(0,Math.min(4,active+(e.key==='ArrowRight'?1:-1)))).focus();}});document.addEventListener('visibilitychange',()=>{lastTime=0;if(!document.hidden&&(mode==='auto'||policy===1)&&!raf)raf=requestAnimationFrame(animate);});$('mode-auto').onclick=()=>setMode('auto');$('mode-manual').onclick=()=>setMode('manual');build();advanceAuto(0);

function paintPlayback(){
 const automatic=mode==='auto';
 document.documentElement.setAttribute('data-playback',mode);
 for(const m of ['auto','manual'])$('mode-'+m).setAttribute('aria-pressed',String(mode===m));
 $('mode-auto').textContent='▶ Auto';$('mode-manual').textContent='Manual';
 $('description').setAttribute('aria-live',automatic?'off':'polite');
 $('instruction').textContent=automatic?'Follow the moving tokens through memory updates, then three queries through both sparse selection layers.':'Hover over the upper row for eviction, or the lower modules and Q1 / Q2 / Q3 to explore each step.';
 $('playback-hint').textContent=automatic?'Full pipeline · looping':'Hover to explore';
 $('touch-note').textContent='In Manual, hover, tap or use Tab to explore; swipe horizontally on touch screens.';
 $('query-hint').textContent=automatic?'Auto cycle':'Hover to switch';
 if(!automatic){$('playback-label').textContent='Manual exploration';$('playback-progress').style.width='0%';}
}
function setMode(next){
 if(mode===next)return;
 mode=next;lastTime=0;hoverPair=-1;
 if(next==='auto'){autoTime=0;autoStage=-1;advanceAuto(0);}
 else{$('auto-packets').innerHTML='';svg.removeAttribute('data-auto-phase');svg.removeAttribute('data-auto-active');update();$('gathered').setAttribute('opacity',1);}
 paintPlayback();if(!raf)raf=requestAnimationFrame(animate);
}
function advanceAuto(dt){
 autoTime+=dt;
 if(autoTime>=cycleDuration){autoTime%=cycleDuration;autoStage=-1;}
 let start=0,index=0;while(index<stages.length-1&&autoTime>=start+stages[index].duration){start+=stages[index].duration;index++;}
 const stage=stages[index];
 if(index!==autoStage){
  autoStage=index;active=stage.active;policy=stage.policy;query=stage.query??0;hoverPair=-1;hoverBlock=-1;emaStep=policy===2?0:5;scanTime=0;readProgress=0;
  // A new cycle replays the initial ABC state; it never animates an inverse eviction.
  if(index===0)progress=0;
  paintQuery();update();paintAutoStage();paintAutoPackets();
 }
 if(policy===2){const n=Math.min(5,Math.floor((autoTime-start)/.4));if(n!==emaStep){emaStep=n;paintPolicy();}}
 $('playback-progress').style.width=(autoTime/cycleDuration*100).toFixed(2)+'%';
}
function paintAutoStage(){
 const stage=stages[Math.max(0,autoStage)];
 svg.setAttribute('data-auto-phase',String(Math.max(0,autoStage)));svg.setAttribute('data-auto-active',String(active));
 $('playback-label').textContent=stage.en;
 $('gathered').setAttribute('opacity',active===4&&readProgress>=.99?1:0);
 if(active===2){$('description').textContent='Current Q scores the stored probes. Moving green dashes mark Top-2, and the corresponding frames enter the first sparse layer.';}
 if(active===3){$('description').textContent='Block Top-K selects regions within the two frames. Head and both wrists retain their spatial positions; highlighted blue blocks supply native KV.';}
 if(policy===1){$('description').textContent='Compare six probe similarities in sequence, then emphasize A–B (0.94), the most redundant pair.';}
}
function paintAutoPackets(){
 // Flow connections convey direction, rather than implying extra tokens moving between operations.
 const arrowStream=(d,color=C.blue,track=true)=>(track?line(d,color,`class="flow-arrow-track" marker-end="url(#${color===C.blue?'arrow':'arrow-green'})"`):'')+`<g class="flow-chevron"><path d="M-7 -4 L-2 0 L-7 4 M0 -4 L5 0 L0 4" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><animateMotion dur="1.25s" rotate="auto" repeatCount="indefinite" path="${d}"/></g>`;
 let out='';
 if(autoStage===0){out+=arrowStream('M112 785 L112 800',C.probe,false);}
 
 if(autoStage===2){out+=arrowStream('M337 190 L356 190',C.probe);}
 if(autoStage===3){out+=arrowStream('M657 190 L677 190',C.probe);}
 if(autoStage===4){out+=arrowStream('M977 190 L997 190');}
 if(active===2){for(const path of $('route-lines').querySelectorAll('.route-selected'))out+=`<g transform="translate(0 355)">${arrowStream(path.getAttribute('d'),C.route,false)}</g>`;}
 // Each retrieved frame already has one connector into spatial partitioning.
 if(active===3){for(let f=0;f<2;f++)out+=`<g class="flow-chevron"><path d="M-5 -4 L0 0 L-5 4" fill="none" stroke="${C.blue}" stroke-width="2"/><animateMotion dur="1.25s" rotate="auto" repeatCount="indefinite" path="M750 ${684+f*151} L831 ${684+f*151}"/></g>`;}
 $('auto-packets').innerHTML=out;
}

function paintTopUpdate(){
 const replacing=accepted()&&progress>.01&&progress<.99;
 const e=progress*progress*(3-2*progress);
 const names=accepted()&&progress>.92?['A','C','D']:['A','B','C'];
 for(let i=0;i<3;i++){
  $('result-label-'+i).textContent=names[i];
  $('result-slot-'+i).setAttribute('opacity',replacing&&i>0?0:1);
  $('result-box-'+i).setAttribute('stroke',names[i]==='D'?C.probe:C.blue);
 }
 let out='';
 if(replacing){
  // B exits upward, C shifts left, and D enters from below. All motion stays in the final policy panel.
  out+=miniEntry(1108,192-42*e,'B',C.red,`opacity="${Math.max(0,1-e*1.8)}"`);
  out+=miniEntry(1200-92*e,192,'C');
  out+=miniEntry(1200,244-52*e,'D',C.probe,`opacity="${Math.min(1,e*2)}"`);
 }
 $('top-update-overlay').innerHTML=out;
}
