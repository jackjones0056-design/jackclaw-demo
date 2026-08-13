import { createGatewayAdapter } from './gateway-adapter.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const nowTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const AGENTS = [
  { id:'research', name:'RESEARCH', code:'R1', icon:'⌁', color:'#46a8ff', angle:-90, radius:.40 },
  { id:'coding', name:'CODING', code:'C1', icon:'</>', color:'#55dc75', angle:-43, radius:.41 },
  { id:'finance', name:'FINANCE', code:'F1', icon:'$', color:'#ffc64c', angle:0, radius:.42 },
  { id:'security', name:'SECURITY', code:'S1', icon:'◇', color:'#ff5349', angle:43, radius:.41 },
  { id:'memory', name:'MEMORY', code:'M1', icon:'⬡', color:'#4fe8ff', angle:90, radius:.40 },
  { id:'vision', name:'VISION', code:'VS1', icon:'◉', color:'#4fdcff', angle:137, radius:.41 },
  { id:'voice', name:'VOICE', code:'V1', icon:'◫', color:'#a96cff', angle:180, radius:.42 },
  { id:'aip', name:'AIP', code:'A1', icon:'△', color:'#c866ff', angle:223, radius:.41 },
  { id:'business', name:'BUSINESS', code:'B1', icon:'▣', color:'#ff8c42', angle:270, radius:.40 }
];

const state = {
  mode:'BOOT',
  selectedAgent:null,
  agents:new Map(AGENTS.map((a) => [a.id, { ...a, status:'ready', current:null, x:0, y:0, phase:Math.random()*Math.PI*2 }])),
  links:new Map(),
  approvals:new Map(),
  missions:[
    { id:'m1', title:'Mission Control Interface', status:'ACTIVE', agent:'coding', progress:76 },
    { id:'m2', title:'Skill Supply-Chain Hardening', status:'MONITOR', agent:'security', progress:92 },
    { id:'m3', title:'AIP Intelligence Workflow', status:'READY', agent:'aip', progress:64 }
  ],
  feed:[],
  tokenUsage:62,
  latency:18,
  security:'FORTIFIED',
  intensity:.55
};

class CellularField {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha:true });
    this.cells = [];
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.pointer = { x:-9999, y:-9999, active:false };
    this.last = performance.now();
    this.resize = this.resize.bind(this);
    this.frame = this.frame.bind(this);
    addEventListener('resize', this.resize);
    addEventListener('pointermove', (e) => {
      this.pointer.x = e.clientX; this.pointer.y = e.clientY; this.pointer.active = true;
    }, { passive:true });
    addEventListener('pointerleave', () => this.pointer.active = false, { passive:true });
    this.resize();
    requestAnimationFrame(this.frame);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    const target = clamp(Math.round((w*h)/15000), 46, 105);
    while (this.cells.length < target) this.cells.push(this.spawn(w,h));
    if (this.cells.length > target) this.cells.length = target;
  }

  spawn(w=innerWidth,h=innerHeight, seed=null) {
    return {
      x:seed?.x ?? Math.random()*w, y:seed?.y ?? Math.random()*h,
      vx:(Math.random()-.5)*.22, vy:(Math.random()-.5)*.22,
      r:Math.random()*1.6+.45, pulse:Math.random()*Math.PI*2,
      life:Math.random(), energy:Math.random()*.6+.25
    };
  }

  burst(x,y,amount=8) {
    const limit = 118;
    for (let i=0;i<amount && this.cells.length<limit;i++) {
      const c=this.spawn(innerWidth,innerHeight,{x:x+(Math.random()-.5)*28,y:y+(Math.random()-.5)*28});
      c.vx=(Math.random()-.5)*1.2;c.vy=(Math.random()-.5)*1.2;c.r=Math.random()*1.6+.7;c.energy=1;
      this.cells.push(c);
    }
  }

  frame(t) {
    const dt = Math.min(32, t-this.last || 16); this.last=t;
    const ctx=this.ctx,w=innerWidth,h=innerHeight,intensity=state.intensity;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle='rgba(255,45,34,.025)';

    for (const c of this.cells) {
      c.pulse += .008*dt;
      c.x += c.vx*dt*(.32+intensity*.42);
      c.y += c.vy*dt*(.32+intensity*.42);
      if (c.x<-30)c.x=w+30;if(c.x>w+30)c.x=-30;if(c.y<-30)c.y=h+30;if(c.y>h+30)c.y=-30;
      if (this.pointer.active) {
        const dx=c.x-this.pointer.x,dy=c.y-this.pointer.y,d2=dx*dx+dy*dy;
        if(d2<11000&&d2>1){const f=(1-d2/11000)*.009;c.vx+=dx*f;c.vy+=dy*f;}
      }
      c.vx*=.998;c.vy*=.998;
    }

    const maxDist = innerWidth < 700 ? 90 : 118;
    const max2=maxDist*maxDist;
    ctx.lineWidth=.55;
    for(let i=0;i<this.cells.length;i++){
      const a=this.cells[i];
      for(let j=i+1;j<this.cells.length;j++){
        const b=this.cells[j],dx=a.x-b.x,dy=a.y-b.y,d2=dx*dx+dy*dy;
        if(d2<max2){
          const alpha=(1-d2/max2)*(.09+intensity*.16);
          ctx.strokeStyle=`rgba(255,55,43,${alpha})`;
          ctx.beginPath();ctx.moveTo(a.x,a.y);
          const mx=(a.x+b.x)/2+Math.sin(a.pulse+b.pulse)*3,my=(a.y+b.y)/2+Math.cos(a.pulse-b.pulse)*3;
          ctx.quadraticCurveTo(mx,my,b.x,b.y);ctx.stroke();
        }
      }
    }

    for(const c of this.cells){
      const glow=(Math.sin(c.pulse)+1)/2;
      ctx.beginPath();ctx.arc(c.x,c.y,c.r+glow*.8,0,Math.PI*2);
      ctx.fillStyle=`rgba(255,${45+Math.round(glow*35)},${34+Math.round(glow*26)},${.10+c.energy*.23})`;ctx.fill();
    }
    requestAnimationFrame(this.frame);
  }
}

const cellField = new CellularField($('#cellular'));
const stage = $('#networkStage');
const svg = $('#connections');
const core = $('#jackclawCore');
const agentLayer = $('#agentLayer');

function buildAgents() {
  for (const agent of state.agents.values()) {
    const button=document.createElement('button');
    button.className='agent';button.dataset.agent=agent.id;button.style.setProperty('--agent',agent.color);
    button.innerHTML=`<span class="agent-orb"><span class="agent-icon">${agent.icon}</span></span><span class="agent-copy"><strong>${agent.name}</strong><span>AGENT-${agent.code}</span></span>`;
    button.addEventListener('click',()=>selectAgent(agent.id));
    agentLayer.appendChild(button);

    const ns='http://www.w3.org/2000/svg';
    const path=document.createElementNS(ns,'path');path.classList.add('link');path.dataset.agent=agent.id;svg.appendChild(path);
    state.links.set(agent.id,path);
  }
}

function layoutNetwork(t=0) {
  const rect=stage.getBoundingClientRect();
  const cx=rect.width/2,cy=rect.height/2;
  const rx=Math.min(rect.width*.45,430), ry=Math.min(rect.height*.39,300);
  const mobile=rect.width<650;
  for(const agent of state.agents.values()){
    const rad=agent.angle*Math.PI/180;
    const floatX=Math.sin(t*.00055+agent.phase)*4;
    const floatY=Math.cos(t*.00047+agent.phase)*5;
    const localRx=rx*(mobile?1.02:1)*agent.radius/.41;
    const localRy=ry*agent.radius/.41;
    agent.x=cx+Math.cos(rad)*localRx+floatX;
    agent.y=cy+Math.sin(rad)*localRy+floatY;
    const el=$(`.agent[data-agent="${agent.id}"]`);
    if(el){el.style.left=`${agent.x}px`;el.style.top=`${agent.y}px`;}
    const path=state.links.get(agent.id);
    if(path){
      const dx=agent.x-cx,dy=agent.y-cy;
      const bend=Math.sin(rad*2)*24;
      const qx=cx+dx*.53-dy/Math.max(1,Math.hypot(dx,dy))*bend;
      const qy=cy+dy*.53+dx/Math.max(1,Math.hypot(dx,dy))*bend;
      path.setAttribute('d',`M ${cx} ${cy} Q ${qx} ${qy} ${agent.x} ${agent.y}`);
    }
  }
  requestAnimationFrame(layoutNetwork);
}

function pulse(agentId, outbound=true, color=null) {
  const path=state.links.get(agentId);if(!path)return;
  const ns='http://www.w3.org/2000/svg';const dot=document.createElementNS(ns,'circle');
  const agent=state.agents.get(agentId);dot.setAttribute('r','3.2');dot.setAttribute('fill',color||agent?.color||'#ff3428');dot.classList.add('pulse-dot');svg.appendChild(dot);
  const length=path.getTotalLength();const start=performance.now(),duration=720;
  function tick(t){const p=clamp((t-start)/duration,0,1);const q=outbound?p:1-p;const pt=path.getPointAtLength(length*q);dot.setAttribute('cx',pt.x);dot.setAttribute('cy',pt.y);dot.setAttribute('opacity',String(1-Math.max(0,p-.72)/.28));if(p<1)requestAnimationFrame(tick);else dot.remove();}
  requestAnimationFrame(tick);
}

function setAgentStatus(id,status,current=null){
  const a=state.agents.get(id);if(!a)return;a.status=status;a.current=current;
  const el=$(`.agent[data-agent="${id}"]`);if(!el)return;
  el.classList.toggle('busy',status==='busy');el.classList.toggle('offline',status==='offline');el.classList.toggle('quarantined',status==='quarantined');
  const link=state.links.get(id);link?.classList.toggle('active',status==='busy');link?.classList.toggle('dim',status==='offline'||status==='quarantined');
}

function setCoreMode(mode,sub=null){
  state.mode=mode;core.classList.remove('thinking','executing','alert');
  if(mode==='THINKING')core.classList.add('thinking');if(mode==='EXECUTING')core.classList.add('executing');if(mode==='ALERT')core.classList.add('alert');
  $('#coreState').textContent=mode;$('#coreSub').textContent=sub||({ONLINE:'SYNTHETIC COMMAND // AWAITING DIRECTIVE',THINKING:'ROUTING INTELLIGENCE',EXECUTING:'MULTI-AGENT EXECUTION ACTIVE',ALERT:'HUMAN AUTHORIZATION REQUIRED'}[mode]||'SYSTEM ACTIVE');
  state.intensity=mode==='ONLINE'?.5:mode==='THINKING'?.78:mode==='EXECUTING'?1:.9;
}

function selectAgent(id){
  state.selectedAgent=id;$$('.agent').forEach(el=>el.classList.toggle('selected',el.dataset.agent===id));
  const a=state.agents.get(id);if(!a)return;
  openDrawer(a.name,`<div class="drawer-section"><div class="k">AGENT IDENTITY</div><div class="big">${a.name} // AGENT-${a.code}</div><div class="drawer-row"><span>STATUS</span><span class="tag ${a.status==='ready'?'green':'red'}">${a.status.toUpperCase()}</span></div><div class="drawer-row"><span>CURRENT TASK</span><span>${a.current||'Standing by'}</span></div><div class="drawer-row"><span>TRUST TIER</span><span class="tag green">CONTROLLED</span></div></div><div class="drawer-section"><div class="k">EXECUTION POLICY</div><div class="drawer-row"><span>Tool requests</span><span>Security kernel gated</span></div><div class="drawer-row"><span>Consequential actions</span><span>Approval required</span></div><div class="drawer-row"><span>Audit trail</span><span class="tag green">ACTIVE</span></div></div>`);
}

function addFeed(title,body,kind='event'){
  const item={id:crypto.randomUUID?.()||String(Date.now()+Math.random()),title,body,kind,time:nowTime()};state.feed.unshift(item);state.feed=state.feed.slice(0,18);renderFeed();
}

function renderFeed(){
  const feed=$('#activityFeed');if(!state.feed.length){feed.innerHTML='<div class="empty">NO ACTIVITY RECORDED<br>AWAITING SYSTEM EVENTS</div>';return;}
  feed.innerHTML=state.feed.map(item=>`<div class="feeditem"><span class="feedicon">${item.kind==='security'?'!':item.kind==='tool'?'◆':'•'}</span><strong>${escapeHtml(item.title)}</strong><span class="feedtime">${item.time}</span><p>${escapeHtml(item.body)}</p></div>`).join('');
}

function escapeHtml(value=''){return String(value).replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

function addApproval(a){
  const id=a.id||`approval-${Date.now()}`;state.approvals.set(id,{...a,id});renderApprovals();$('#approvalCount').textContent=String(state.approvals.size);setCoreMode('ALERT','SECURITY GATE // APPROVAL REQUIRED');
  const agentId=a.agentId||'security';setAgentStatus(agentId,'busy','Awaiting authorization');pulse(agentId,true,'#ffad35');cellField.burst(innerWidth*.56,innerHeight*.5,8);addFeed('Approval required',a.summary||'A consequential action requires human authorization.','security');
}

function renderApprovals(){
  const root=$('#approvalQueue');const items=[...state.approvals.values()];
  if(!items.length){root.innerHTML='<div class="empty">NO PENDING APPROVALS<br>SECURITY GATE NOMINAL</div>';return;}
  root.innerHTML=items.map(a=>`<div class="approval" data-id="${escapeHtml(a.id)}"><span class="risk">${(a.risk||'REVIEW').toUpperCase()} RISK // HUMAN GATE</span><strong>${escapeHtml(a.summary||'Approval requested')}</strong><div class="meta">${escapeHtml(a.agentId||'SYSTEM')} // ${new Date(a.createdAtMs||Date.now()).toLocaleTimeString()}</div><div class="approval-actions"><button class="deny" data-decision="deny">DENY</button><button class="allow" data-decision="allow-once">ALLOW ONCE</button></div></div>`).join('');
  $$('.approval-actions button',root).forEach(btn=>btn.addEventListener('click',()=>resolveApproval(btn.closest('.approval').dataset.id,btn.dataset.decision)));
}

async function resolveApproval(id,decision){
  const a=state.approvals.get(id);if(!a)return;
  try{await gateway.resolveApproval(id,decision);}catch(error){toast(`APPROVAL ERROR // ${error.message}`);return;}
  state.approvals.delete(id);renderApprovals();$('#approvalCount').textContent=String(state.approvals.size);
  const agentId=a.agentId||'security';setAgentStatus(agentId,'ready');pulse(agentId,false,decision==='deny'?'#ff5349':'#56e47d');
  addFeed(decision==='deny'?'Action denied':'Action authorized',a.summary||id,'security');
  setCoreMode(state.approvals.size?'ALERT':'ONLINE');
}

function openDrawer(title,html){$('#drawerTitle').textContent=title;$('#drawerBody').innerHTML=html;$('#drawer').classList.add('open');$('#drawerScrim').classList.add('show');}
function closeDrawer(){$('#drawer').classList.remove('open');$('#drawerScrim').classList.remove('show');}

function panelContent(type){
  if(type==='missions') return state.missions.map(m=>`<div class="drawer-section"><div class="k">MISSION</div><div class="big">${m.title}</div><div class="drawer-row"><span>STATUS</span><span class="tag ${m.status==='ACTIVE'?'green':''}">${m.status}</span></div><div class="drawer-row"><span>PRIMARY AGENT</span><span>${m.agent.toUpperCase()}</span></div><div class="usagebar"><i style="width:${m.progress}%"></i></div></div>`).join('');
  if(type==='skills') return `<div class="drawer-section"><div class="k">SKILL TRUST SYSTEM</div><div class="big">ZERO-TRUST SKILL PIPELINE</div><div class="drawer-row"><span>Third-party default</span><span class="tag red">QUARANTINE</span></div><div class="drawer-row"><span>Hash pinning</span><span class="tag green">ENFORCED</span></div><div class="drawer-row"><span>Install policy</span><span class="tag green">FAIL CLOSED</span></div></div><div class="drawer-section"><div class="k">TRUSTED SOURCES</div><div class="drawer-row"><span>Local JackClaw skills</span><span class="tag green">ELIGIBLE</span></div><div class="drawer-row"><span>ClawHub</span><span class="tag red">REVIEW REQUIRED</span></div><div class="drawer-row"><span>Unknown source</span><span class="tag red">BLOCKED</span></div></div>`;
  if(type==='security') return `<div class="drawer-section"><div class="k">SECURITY KERNEL</div><div class="big">${state.security}</div><div class="drawer-row"><span>Policy model</span><span>Default deny</span></div><div class="drawer-row"><span>Pending approvals</span><span>${state.approvals.size}</span></div><div class="drawer-row"><span>Audit logging</span><span class="tag green">ACTIVE</span></div><div class="drawer-row"><span>Secret export</span><span class="tag red">BLOCKED</span></div></div>`;
  if(type==='systems') return `<div class="drawer-section"><div class="k">CONTROL PLANE</div><div class="big">OPENCLAW GATEWAY</div><div class="drawer-row"><span>Connection</span><span id="drawerConnection" class="tag">${gateway.connected?'CONNECTED':'DEMO'}</span></div><div class="drawer-row"><span>Requested scopes</span><span>READ / WRITE / APPROVALS</span></div><div class="drawer-row"><span>Admin scope</span><span class="tag red">NOT REQUESTED</span></div><div class="drawer-row"><span>Tool events</span><span class="tag green">SUPPORTED</span></div></div>`;
  return `<div class="drawer-section"><div class="k">JACKCLAW MISSION CONTROL</div><div class="big">SYNTHETIC COMMAND INTERFACE</div><div class="drawer-row"><span>Agents</span><span>${state.agents.size}</span></div><div class="drawer-row"><span>Missions</span><span>${state.missions.length}</span></div><div class="drawer-row"><span>Security</span><span class="tag green">${state.security}</span></div></div>`;
}

function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2200);}

function updateMetrics(){
  $('#agentCount').textContent=`${[...state.agents.values()].filter(a=>a.status!=='offline').length} / ${state.agents.size}`;
  $('#approvalCount').textContent=String(state.approvals.size);
  $('#tokenUsage').textContent=`${state.tokenUsage}%`;$('#tokenBar').style.width=`${state.tokenUsage}%`;$('#latency').textContent=`${state.latency}ms`;
}

function tickClock(){const n=new Date();$('#clock').textContent=n.toLocaleTimeString([], {hour12:false});$('#date').textContent=n.toLocaleDateString([], {month:'short',day:'2-digit'}).toUpperCase();}

const gateway=createGatewayAdapter();

gateway.addEventListener('status',(e)=>{
  const d=e.detail;$('#gatewayMode').textContent=d.mode==='openclaw'?'GATEWAY LIVE':'SIMULATION';$('#connectionState').textContent=d.connected?(d.mode==='openclaw'?'OPENCLAW LINKED':'DEMO BUS ACTIVE'):'OFFLINE';
  addFeed(d.connected?'Control plane online':'Control plane offline',d.mode==='openclaw'?'Authenticated OpenClaw Gateway connection established.':'Mission Control simulation bus initialized.','event');
});
gateway.addEventListener('run.started',(e)=>{const {agentId,text}=e.detail;setCoreMode('THINKING',`ROUTING → ${agentId.toUpperCase()}`);setAgentStatus(agentId,'busy',text);pulse(agentId,true);state.latency=Math.round(12+Math.random()*18);updateMetrics();addFeed(`${agentId.toUpperCase()} activated`,text,'event');});
gateway.addEventListener('tool.started',(e)=>{const {agentId,tool}=e.detail;setCoreMode('EXECUTING',`${agentId.toUpperCase()} // ${tool}`);pulse(agentId,true);addFeed('Tool execution',`${agentId.toUpperCase()} → ${tool}`,'tool');});
gateway.addEventListener('tool.finished',(e)=>pulse(e.detail.agentId,false));
gateway.addEventListener('run.completed',(e)=>{const {agentId,text}=e.detail;setAgentStatus(agentId,'ready');pulse(agentId,false);setCoreMode(state.approvals.size?'ALERT':'ONLINE');addFeed(`${agentId.toUpperCase()} complete`,text,'event');state.tokenUsage=clamp(state.tokenUsage+1,0,99);updateMetrics();});
gateway.addEventListener('approval.requested',(e)=>addApproval(e.detail));
gateway.addEventListener('approval.resolved',(e)=>{if(state.approvals.has(e.detail.id)){state.approvals.delete(e.detail.id);renderApprovals();updateMetrics();}});
gateway.addEventListener('sessions.changed',(e)=>{const d=e.detail||{};if(Number.isFinite(d.totalTokens)&&Number.isFinite(d.contextTokens)&&d.contextTokens>0){state.tokenUsage=clamp(Math.round(d.totalTokens/d.contextTokens*100),0,100);updateMetrics();}});
gateway.addEventListener('warning',(e)=>addFeed('Gateway warning',e.detail.message||'Gateway warning','security'));

$('#commandForm').addEventListener('submit',async(e)=>{e.preventDefault();const input=$('#commandInput');const text=input.value.trim();if(!text)return;input.value='';try{await gateway.sendDirective(text,{source:'mission-control'});}catch(error){toast(`DIRECTIVE FAILED // ${error.message}`);addFeed('Directive failed',error.message,'security');}});
$('#coreButton').addEventListener('click',()=>{cellField.burst(innerWidth*.5,innerHeight*.5,10);setCoreMode('THINKING','MANUAL CORE INTERROGATION');setTimeout(()=>setCoreMode(state.approvals.size?'ALERT':'ONLINE'),900);});
$('#drawerClose').addEventListener('click',closeDrawer);$('#drawerScrim').addEventListener('click',closeDrawer);
$$('.navbtn[data-panel]').forEach(btn=>btn.addEventListener('click',()=>{$$('.navbtn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');const type=btn.dataset.panel;openDrawer(type.toUpperCase(),panelContent(type));}));

function demoAmbientEvent(){
  if(!gateway.connected||gateway.mode!=='demo'||state.mode==='ALERT')return;
  const options=[
    ['research','Passive intelligence sweep','Public-source context indexed.'],
    ['security','Security sweep','No active policy violations detected.'],
    ['memory','Memory lattice sync','Project context map reconciled.'],
    ['coding','Repository telemetry','JackClaw runtime state verified.']
  ];
  const [agent,title,body]=options[Math.floor(Math.random()*options.length)];setAgentStatus(agent,'busy',title);pulse(agent,true);addFeed(title,body,agent==='security'?'security':'event');setTimeout(()=>{setAgentStatus(agent,'ready');pulse(agent,false);},850);
}

buildAgents();renderFeed();renderApprovals();updateMetrics();tickClock();setInterval(tickClock,1000);setInterval(demoAmbientEvent,7200);requestAnimationFrame(layoutNetwork);

(async()=>{
  try{await gateway.connect();setCoreMode('ONLINE');updateMetrics();setTimeout(()=>addFeed('Mission Control ready','Living cellular command topology initialized.','event'),300);}catch(error){setCoreMode('ALERT','GATEWAY CONNECTION FAILED');addFeed('Gateway unavailable',error.message,'security');toast('GATEWAY CONNECTION FAILED');}
})();
