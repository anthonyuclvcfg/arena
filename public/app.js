/* UI, vector renderer, rule editor and authoritative-online client. Vanilla JS. */
(() => {
  'use strict';
  const E = window.CSpireArena, $ = id => document.getElementById(id);
  const KEY='line-arena.robot.v1';
  const COLORS=['#76d8cf','#f09b7e','#b6a0ed','#8ed4a0','#84b9ff','#e9a3d1','#e9cb76','#c4dce7'];
  const robotColor=r=>COLORS[r?.team??r?.id??0];
  const resultNames=result=>(state.teamCount?result.teamStandings:result.standings).filter(r=>r.winner).map(r=>r.name).join(' & ');
  const TAGS=['a','b','c','d','e','f','g','h'];
  const BONUS_TOOL_COLOR='#f1cb7f', CRITICAL_TOOL_COLOR='#ff5c6c', CRITICAL_TOOL_RATIO=.25;
  function toolIsCritical(t){return !t.broken&&Number.isFinite(t.health)&&t.maxHealth>0&&t.health/t.maxHealth<=CRITICAL_TOOL_RATIO;}
  function toolStatusClasses(t){return (t.bonus?' bonus-tool':'')+(t.broken?' broken':toolIsCritical(t)?' critical-tool':'');}
  let config=E.normalizeConfig(E.loadouts.dual), seed=freshSeed();
  let botCount=4,battleMode='ffa';
  let selectedTool=0, dragTool=null, inspectWall=-1, dragScale=null, hoverTool=-1;
  let toolClicks=[], wheelRemainder=0, wheelTarget=-1, lastWheelAt=0;
  let mode='idle', state, paused=false, speed=1, accumulator=0, last=performance.now(), countdown=0;
  let history=[], replayIndex=0, replayClock=0, lastUi=0, toastTimer;
  let drawing=false, drawStart=null, drawEnd=null, dragRule=-1, saved=true;
  let serverAvailable=false, room=null, pilotId=null, stream=null, onlineSlot=0;
  let lastEventId=-1, finishing=false, trails=Array.from({length:E.MAX_BOTS},()=>[]);
  const arena=$('arena'), ctx=arena.getContext('2d');
  const builder=$('builder'), bctx=builder.getContext('2d');
  try { const stored=localStorage.getItem(KEY);if(stored)config=E.normalizeConfig(JSON.parse(stored)); } catch(_) {}
  function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3400);}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(config));saved=true;}catch(_){saved=false;}$('save-status').textContent=saved?'SAVED LOCALLY':'NOT SAVED';}
  function locked(){return (mode==='local'&&state.status==='running') || mode==='replay' || !!room;}
  function applyLock(){
    const lock=locked();document.body.classList.toggle('locked',lock);
    if(lock&&(dragTool!==null||drawStart))cancelBuilderGesture();
    document.querySelectorAll('#workshop input, #workshop select, #workshop button, #brain select, #brain button').forEach(el=>{if(el.id!=='import-file'&&!el.classList.contains('panel-collapse'))el.disabled=lock;});
    $('seed-button').disabled=lock;
    const selectedMode=room?.mode||battleMode;
    $('bot-count').disabled=lock||selectedMode!=='ffa';$('battle-mode').disabled=lock;$('battle-mode').value=selectedMode;
    for(const o of $('bot-count').options)o.textContent=selectedMode==='ffa'?o.value+(o.value==='2'?' · Duel':' · Free-for-all'):o.value+' robots';
    if(room)$('bot-count').value=String(state.robots.length);
    document.querySelector('.roster-options').hidden=!!room;
    if(!lock)$('add-rule').disabled=config.rules.length>=E.MAX_RULES;
    document.querySelectorAll('.tool-slot.empty').forEach(el=>{el.disabled=true;});
    $('online-open').disabled=mode==='local'&&state.status==='running';
    $('start').disabled=!!room;
  }
  // View-only controls never change a robot, its rules, or simulation timing.
  let closedPanels={builder:false,logic:false},beforeBattlePanels=null,viewTimer=0,metricsFrame=0;
  const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function updateArenaSize(){
    const hud=document.querySelector('.match-hud').getBoundingClientRect().height;
    const panel=$('arena-panel'),wrap=document.querySelector('.arena-wrap');
    const chrome=wrap.getBoundingClientRect().top-panel.getBoundingClientRect().top;
    const size=Math.max(220,Math.floor(window.innerHeight-hud-chrome-18));
    panel.style.setProperty('--focus-square',size+'px');
  }
  function scheduleArenaSize(){
    if(metricsFrame)return;
    metricsFrame=requestAnimationFrame(()=>{metricsFrame=0;updateArenaSize();});
  }
  function showArena(){
    const hud=document.querySelector('.match-hud').getBoundingClientRect().height;
    const top=window.scrollY+$('arena-panel').getBoundingClientRect().top-hud-8;
    window.scrollTo({top:Math.max(0,top),behavior:reducedMotion()?'instant':'smooth'});
  }
  function setPanels(next,{scroll=false}={}){
    clearTimeout(viewTimer);
    closedPanels={...closedPanels,...next};
    for(const side of ['builder','logic']){
      const closed=closedPanels[side],dock=$(side+'-dock'),content=dock.firstElementChild;
      const reopen=$('restore-'+side),close=$('collapse-'+side),active=document.activeElement;
      // Transfer focus out before making a collapsing subtree inert.
      reopen.hidden=!closed;
      if(closed&&content.contains(active))reopen.focus({preventScroll:true});
      content.inert=closed;
      if(closed)content.setAttribute('aria-hidden','true');else content.removeAttribute('aria-hidden');
      dock.classList.toggle('collapsed',closed);
      close.setAttribute('aria-expanded',String(!closed));reopen.setAttribute('aria-expanded',String(!closed));
      if(!closed&&active===reopen)close.focus({preventScroll:true});
    }
    const focused=closedPanels.builder&&closedPanels.logic;
    document.body.classList.toggle('arena-focused',focused);
    const intro=document.querySelector('.intro');intro.inert=focused;
    if(focused)intro.setAttribute('aria-hidden','true');else intro.removeAttribute('aria-hidden');
    const toggle=$('arena-size-toggle'),label=focused?'Restore both panels':'Maximize arena';
    toggle.setAttribute('aria-pressed',String(focused));toggle.setAttribute('aria-label',label);toggle.title=label;
    scheduleArenaSize();
    viewTimer=setTimeout(()=>{updateArenaSize();if(scroll)showArena();},reducedMotion()?0:590);
  }
  function enterBattleView(){
    if(!beforeBattlePanels)beforeBattlePanels={...closedPanels};
    setPanels({builder:true,logic:true},{scroll:true});
  }
  function leaveBattleView(){
    const restore=beforeBattlePanels||{builder:false,logic:false};beforeBattlePanels=null;setPanels(restore);
  }
  document.querySelectorAll('[data-panel-close]').forEach(b=>b.onclick=()=>setPanels({[b.dataset.panelClose]:true}));
  document.querySelectorAll('[data-panel-open]').forEach(b=>b.onclick=()=>setPanels({[b.dataset.panelOpen]:false}));
  $('arena-size-toggle').onclick=()=>{
    const focused=closedPanels.builder&&closedPanels.logic;
    setPanels({builder:!focused,logic:!focused},{scroll:true});
  };
  window.addEventListener('resize',scheduleArenaSize,{passive:true});
  if(typeof ResizeObserver!=='undefined'){
    const observer=new ResizeObserver(scheduleArenaSize);
    observer.observe(document.querySelector('.match-hud'));
    observer.observe(document.querySelector('.arena-heading'));
    observer.observe(document.querySelector('.battle-controls'));
  }
  function freshSeed(previous=-1){const n=new Uint32Array(1);crypto.getRandomValues(n);const value=1+n[0]%999999;return value===previous?(value%999999)+1:value;}
  function newPreview(){
    clearResults();state=E.createPracticeBattle(config,botCount,seed,battleMode);
    $('seed-label').textContent=seed;lastEventId=-1;trails=Array.from({length:E.MAX_BOTS},()=>[]);renderPracticeRoster();
  }
  function syncRoster(){
    for(let i=1;i<E.MAX_BOTS;i++)$('opponent-row-'+i).hidden=botCount<=i;
  }
  function renderPracticeRoster(){
    syncRoster();
    for(let i=1;i<E.MAX_BOTS;i++){
      const r=state.robots[i],name=$('ai-name-'+i),spec=$('ai-spec-'+i);
      if(!r){name.textContent='';spec.textContent='';continue;}
      name.textContent=(r.team!=null?E.teamName(r.team)+(r.team===state.robots[0].team?' · ALLY / ':' · RIVAL / '):'')+r.config.name;name.style.color=robotColor(r);
      spec.textContent=E.BODIES[r.config.body].label+' · M'+r.config.motor+' / A'+r.config.armor+' · '+r.stats.cost+'/'+E.BUDGET+' pts';
      $('ai-tools-'+i).textContent=r.config.tools.map(t=>E.WEAPONS[t.type].label+' '+['L','S','H'][t.power-1]).join(' / ');
    }
  }
  function initRoster(){
    // Use identical contour coordinates in catalog icons, builder, and battles.
    for(const [id,g] of Object.entries(E.BODY_GEOMETRY)){
      const b=document.querySelector('[data-body="'+id+'"]'),path='M'+g.outline.map(p=>p.map(v=>16+v*13).join(',')).join(' L')+' Z';
      b.innerHTML='<svg viewBox="0 0 32 32" aria-hidden="true"><path d="'+path+'"/></svg>'+E.BODIES[id].label;
      b.title=E.BODIES[id].label+' chassis';
    }
    syncRoster();
  }
  function changeConfig(part){
    if(locked())return false;
    const original={...config,...part};
    if(E.cost(original)>E.BUDGET){toast('Over '+E.BUDGET+' points. Lower power, motor or armor, or remove a tool.');syncBuilder();return false;}
    config=E.normalizeConfig(original);selectedTool=Math.min(selectedTool,config.tools.length-1);
    if(selectedTool<0&&config.tools.length)selectedTool=0;
    save();syncBuilder();
    if(mode==='idle'||(mode==='local'&&state.status==='finished')){mode='idle';finishing=false;newPreview();setBanner('WORKSHOP UPDATED','Built to break the rules.','Tools and parts are fully restored for every battle.');}
    return true;
  }
  function syncBuilder(){
    $('robot-name').value=config.name;
    $('motor').value=config.motor;$('armor').value=config.armor;
    $('motor-value').textContent=config.motor+' / 5';$('armor-value').textContent=config.armor+' / 5';
    const s=E.stats(config);$('budget-value').textContent=s.cost;$('budget-limit').textContent=E.BUDGET;$('budget-bar').style.width=(s.cost/E.BUDGET*100)+'%';
    $('stat-mass').textContent=s.mass.toFixed(1)+' u';$('stat-speed').textContent=s.speed+' u/s';$('stat-hp').textContent=s.hp;
    document.querySelectorAll('[data-body]').forEach(b=>{const yes=b.dataset.body===config.body;b.classList.toggle('active',yes);b.setAttribute('aria-pressed',yes);});
    renderToolEditor();drawBuilder();
  }
  const toolIcons={
    ram:'<path d="M3 7h11v10H3z M14 12h15 M29 3v18 M33 3v18"/>',
    flipper:'<path d="M4 6h24l5 5 M4 18h24l5-5 M9 4v16"/>',
    plow:'<path d="M4 8 26 3 21 12 26 21 4 16 M21 12H4"/>',
    hammer:'<path d="M3 12h22 M24 4h10v16H24z M5 9v6"/>',
    saw:'<circle cx="23" cy="12" r="8"/><circle cx="23" cy="12" r="3"/><path d="M3 12h12 M23 1v3 M23 20v3 M12 12h3 M31 12h4 M15 4l3 3 M29 17l3 3 M15 20l3-3 M29 7l3-3"/>',
    drill:'<path d="M3 7h8v10H3z M11 6 34 12 11 18Z M15 7l-2 10 M21 9l-2 7 M27 10l-2 4"/>',
    flamethrower:'<path d="M3 6h8v12H3z M11 9h12v6H11 M23 9l10-6-3 9 4 8-11-5"/>',
    machinegun:'<path d="M3 7h13v10H3z M16 9h18 M16 12h18 M16 15h18 M8 17v5h7v-5"/>',
    rocket:'<path d="M3 7h22v10H3z M25 7l10 5-10 5 M7 7 4 3h9l3 4 M7 17l-3 4h9l3-4"/>'
  };
  function renderCatalog(){
    $('tool-catalog').replaceChildren();
    Object.entries(E.WEAPONS).forEach(([type,d])=>{
      const b=document.createElement('button');b.className='catalog-tool';b.dataset.addTool=type;
      b.innerHTML='<svg viewBox="0 0 38 24" aria-hidden="true">'+toolIcons[type]+'</svg><b>'+d.label+'</b><span class="catalog-damage">'+d.damage+' <small>BASE DMG</small></span><small>'+d.cooldown+'s CD · '+d.cost+' pts</small>';
      b.title=d.description;b.setAttribute('aria-label','Add '+d.label);
      b.onclick=()=>{if(locked())return;if(config.tools.length>=E.MAX_TOOLS){toast(E.MAX_TOOLS+' tools maximum. Remove one to make room.');return;}
        const placements=[[18,-11,0],[18,11,0],[-18,-11,180],[-18,11,180],[0,-22,270],[0,22,90]],at=placements[config.tools.length];
        const previous=selectedTool;selectedTool=config.tools.length;
        if(!changeConfig({tools:[...config.tools,{type,x:at[0],y:at[1],angle:at[2],power:1}]})){selectedTool=previous;syncBuilder();}
        else {$('loadout').value='custom';toast(d.label+' mounted. Drag it on your robot and set its angle.');}
      };$('tool-catalog').append(b);
    });
  }
  function renderToolEditor(rebuildSlots=true){
    $('tool-count').textContent=config.tools.length+' / '+E.MAX_TOOLS+' MOUNTED';
    if(rebuildSlots){$('tool-slots').replaceChildren();
    for(let i=0;i<E.MAX_TOOLS;i++){
      const t=config.tools[i],b=document.createElement('button');b.className='tool-slot'+(t?'':' empty')+(i===selectedTool?' active':'');
      b.textContent=String(i+1).padStart(2,'0');const label=document.createElement('span');label.textContent=t?E.WEAPONS[t.type].label:'Empty';b.append(label);
      b.setAttribute('aria-label',t?'Select tool '+(i+1)+' '+E.WEAPONS[t.type].label:'Empty tool slot '+(i+1));
      b.setAttribute('aria-pressed',String(i===selectedTool));b.disabled=!t||locked();
      b.dataset.toolIndex=String(i);
      if(t)b.title='Select '+dName(t)+'. Double-click to remove.';
      b.onclick=()=>{if(locked()||!t)return;selectedTool=i;renderToolEditor(false);drawBuilder();};
      b.ondblclick=ev=>{if(locked()||!t)return;ev.preventDefault();removeToolAt(i);};$('tool-slots').append(b);
    }}else document.querySelectorAll('#tool-slots .tool-slot').forEach((b,i)=>{
      b.classList.toggle('active',i===selectedTool);b.setAttribute('aria-pressed',String(i===selectedTool));
    });
    const t=config.tools[selectedTool];$('tool-editor').hidden=!t;if(!t)return;
    const d=E.WEAPONS[t.type],st=E.toolStats(t);
    $('selected-tool-label').textContent=String(selectedTool+1).padStart(2,'0')+' / '+d.label.toUpperCase();
    $('tool-x').value=t.x;$('tool-y').value=t.y;$('tool-angle').value=t.angle;$('tool-rotation').value=t.angle;$('tool-power').value=t.power;
    for(const key of ['tool-x','tool-y']){$(key).min=-E.BODIES[config.body].radius;$(key).max=E.BODIES[config.body].radius;}
    $('tool-specs').replaceChildren();
    [[d.damage,'BASE DMG'],[st.damage,'POWER DMG'],[st.cooldown+'s','COOLDOWN'],[st.reach+'u','RANGE'],[st.hp,'HP'],[st.energy,'ENERGY']].forEach(([value,label])=>{const span=document.createElement('span'),b=document.createElement('b');b.textContent=value;span.append(b,document.createTextNode(label));$('tool-specs').append(span);});
    const emission=t.type==='flamethrower'?' Emission: '+st.duration+' s.':t.type==='machinegun'?' Burst: '+E.MACHINEGUN_ROUNDS+' rounds over '+((E.MACHINEGUN_ROUNDS-1)*E.MACHINEGUN_INTERVAL).toFixed(1)+' s.':'';
    $('weapon-hint').textContent=d.description+emission+' '+st.cost+' pts. Higher power increases damage, range and cooldown.';
  }
  function changeTool(part){
    if(locked()||!config.tools[selectedTool])return;
    const tools=config.tools.map((t,i)=>i===selectedTool?{...t,...part}:t);
    if(changeConfig({tools}))$('loadout').value='custom';
  }
  function dName(t){return E.WEAPONS[t.type].label;}
  function removeToolAt(index){
    if(locked()||!config.tools[index])return false;
    const label=dName(config.tools[index]),previous=selectedTool;
    cancelBuilderGesture();toolClicks=[];hoverTool=-1;
    // Keep the same remaining selection when an earlier tool is removed.
    selectedTool=previous>index?previous-1:previous===index?Math.min(index,config.tools.length-2):previous;
    if(!changeConfig({tools:config.tools.filter((_,i)=>i!==index)})){selectedTool=previous;return false;}
    $('loadout').value='custom';toast(label+' removed. Build points restored.');return true;
  }
  function optionList(select, options, selected){Object.entries(options).forEach(([value,text])=>{const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o);});select.value=selected;}
  function renderRules(){
    $('rules').replaceChildren();
    config.rules.forEach((rule,index)=>{
      const card=document.createElement('div');card.className='rule';card.draggable=true;card.dataset.index=index;
      const top=document.createElement('div');top.className='rule-top';
      const number=document.createElement('span');number.textContent='⠿  '+String(index+1).padStart(2,'0');top.append(number);
      const tools=document.createElement('div');
      [['↑',-1,'Move rule up'],['↓',1,'Move rule down'],['×',0,'Delete rule']].forEach(([text,delta,label])=>{
        const button=document.createElement('button');button.textContent=text;button.title=label;button.setAttribute('aria-label',`${label} ${index+1}`);
        button.onclick=()=>{if(locked())return;if(delta){const j=index+delta;if(j<0||j>=config.rules.length)return;[config.rules[index],config.rules[j]]=[config.rules[j],config.rules[index]];}else{if(config.rules.length===1){toast('Your robot needs at least one rule.');return;}config.rules.splice(index,1);}rulesChanged(true);};tools.append(button);
      });top.append(tools);card.append(top);
      const fields=document.createElement('div');fields.className='rule-fields';
      [['IF','when',E.CONDITIONS],['DO','do',E.ACTIONS]].forEach(([label,key,options])=>{
        const l=document.createElement('label');l.textContent=label;l.htmlFor=`rule-${index}-${key}`;
        const select=document.createElement('select');select.id=l.htmlFor;select.setAttribute('aria-label',`${label}, rule ${index+1}`);optionList(select,options,rule[key]);
        select.onchange=()=>{if(locked())return;config.rules[index][key]=select.value;rulesChanged(false);};fields.append(l,select);
      });card.append(fields);
      card.addEventListener('dragstart',ev=>{if(locked()){ev.preventDefault();return;}dragRule=index;card.classList.add('dragging');ev.dataTransfer.effectAllowed='move';ev.dataTransfer.setData('text/plain',String(index));});
      card.addEventListener('dragend',()=>card.classList.remove('dragging'));
      card.addEventListener('dragover',ev=>{ev.preventDefault();ev.dataTransfer.dropEffect='move';});
      card.addEventListener('drop',ev=>{ev.preventDefault();if(locked()||dragRule<0||dragRule===index)return;const [r]=config.rules.splice(dragRule,1);config.rules.splice(index,0,r);dragRule=-1;rulesChanged(true);});
      $('rules').append(card);
    });
    $('rule-count').textContent=config.rules.length+' / '+E.MAX_RULES+' RULES';$('add-rule').disabled=config.rules.length>=E.MAX_RULES;applyLock();
  }
  function rulesChanged(rebuild){save();$('preset').value='custom';if(rebuild)renderRules();if(mode==='idle')newPreview();}
  function line(c,x1,y1,x2,y2){c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();}
  function polygon(c,points,fill=false){c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();if(fill)c.fill();c.stroke();}
  function drawTool(c,t,time=0,preview=false){
    c.save();c.translate(t.x,t.y);c.rotate(t.angle*Math.PI/180);
    const ext=(t.firing||0)>0?5:0;
    if(t.broken){c.globalAlpha*=.35;c.setLineDash([2,2]);line(c,0,0,8,0);c.setLineDash([]);line(c,4,-3,9,3);line(c,4,3,9,-3);c.restore();return;}
    c.beginPath();c.arc(0,0,2.4,0,Math.PI*2);c.stroke();
    if(t.type==='flipper'){
      for(const side of [-1,1]){line(c,0,side*5,24+ext,side*5);line(c,24+ext,side*5,27+ext,side*2);}line(c,4,-7,4,7);
    }else if(t.type==='ram'){
      c.strokeRect(1,-4,10,8);line(c,11,0,23+ext,0);line(c,23+ext,-9,23+ext,9);line(c,26+ext,-9,26+ext,9);
    }else if(t.type==='plow'){
      line(c,0,-5,19+ext,-13);line(c,0,5,19+ext,13);c.beginPath();c.moveTo(22+ext,-15);c.lineTo(18+ext,0);c.lineTo(22+ext,15);c.stroke();
    }else if(t.type==='hammer'){
      line(c,2,0,22+ext,0);line(c,2,2,22+ext,2);c.strokeRect(22+ext,-9,9,18);line(c,25+ext,-6,28+ext,-6);
    }else if(t.type==='saw'){
      line(c,2,0,16,0);c.save();c.translate(16,0);if(!preview)c.rotate(time*5);const pts=[];
      for(let j=0;j<24;j++){const a=j*Math.PI/12,rad=j%2?7:10;pts.push([Math.cos(a)*rad,Math.sin(a)*rad]);}polygon(c,pts);c.beginPath();c.arc(0,0,3,0,Math.PI*2);c.stroke();c.restore();
    }else if(t.type==='flamethrower'){
      c.strokeRect(0,-6,10,12);line(c,10,-3,24,-3);line(c,10,3,24,3);polygon(c,[[24,-5],[30,-4],[30,4],[24,5]]);
      if(ext){c.strokeStyle='#ffe283';c.lineWidth=1.2;line(c,30,-2,36,-3);line(c,30,2,36,3);}
    }else if(t.type==='machinegun'){
      c.strokeRect(0,-6,13,12);for(const y of [-3,0,3])line(c,13,y,32+ext,y);c.strokeRect(4,6,7,6);
    }else if(t.type==='rocket'){
      c.strokeRect(0,-6,24,12);polygon(c,[[24,-6],[33,0],[24,6]]);line(c,5,-6,1,-11);line(c,5,6,1,11);
    }else if(t.type==='drill'){
      c.strokeRect(0,-4,7,8);polygon(c,[[7,-6],[32+ext,0],[7,6]]);line(c,12,-4,10,5);line(c,19,-3,17,3);line(c,25,-1.5,24,1.5);
    }
    if(t.health!==undefined&&t.health<t.maxHealth){c.strokeStyle=toolIsCritical(t)?CRITICAL_TOOL_COLOR:'#e5aa7c';c.lineWidth=.9;c.beginPath();c.arc(0,0,4,-Math.PI/2,-Math.PI/2+Math.PI*2*(t.health/t.maxHealth));c.stroke();}
    c.restore();
  }
  function robotDrawing(c,r,time,preview=false){
    const cfg=r.config,st=r.stats||E.stats(cfg),color=robotColor(r),radius=st.radius,z=r.z||0;
    const x=r.x||0,y=r.y||0,angle=r.angle||0;
    if(!preview){
      c.save();c.translate(x,y+5);c.rotate(angle);c.fillStyle='#00000055';c.beginPath();c.ellipse(0,0,radius*(1+.003*z),radius*.7,0,0,Math.PI*2);c.fill();c.restore();
      if(z>8){c.save();c.strokeStyle=color+'55';c.setLineDash([2,5]);line(c,x,y,x,y-z*.32);c.setLineDash([]);c.fillStyle=color;c.font='8px monospace';c.fillText('↑ '+Math.round(z)+' u',x+radius+7,y-z*.32);c.restore();}
    }
    c.save();c.translate(x,y-z*.32);c.rotate(angle);c.scale(1+z*.0014,1+z*.0014);
    c.strokeStyle=r.flash>0?'#f5ead4':color;c.fillStyle=color+'09';c.lineWidth=preview?.8:1.5;c.lineCap='round';c.lineJoin='round';if(!r.alive)c.globalAlpha=r.exit&&!r.exit.done?.9:.5;
    for(const side of [-1,1]){
      const wy=side*(radius*.76+6),part=r.parts?.find(p=>p.id===(side<0?'driveL':'driveR'));
      c.save();if(part?.broken){c.globalAlpha*=.3;c.setLineDash([2,3]);}else if(part&&part.health/part.maxHealth<.4)c.strokeStyle='#dc9a76';
      c.strokeRect(-11,wy-3.8,19,7.6);if(!part?.broken)for(let j=-7;j<=5;j+=4)line(c,j,wy-3.8,j,wy+3.8);c.restore();
    }
    if(cfg.body==='wedge')polygon(c,[[-radius,-radius*.72],[radius,0],[-radius,radius*.72]],true);
    if(cfg.body==='box')polygon(c,[[-radius*.9,-radius*.72],[radius*.9,-radius*.72],[radius*.9,radius*.72],[-radius*.9,radius*.72]],true);
    if(cfg.body==='hex'){const p=[];for(let j=0;j<6;j++){const a=j*Math.PI/3;p.push([Math.cos(a)*radius,Math.sin(a)*radius]);}polygon(c,p,true);}
    if(cfg.body==='circle'){c.beginPath();c.arc(0,0,radius*.9,0,Math.PI*2);c.fill();c.stroke();}
    const geometry=E.BODY_GEOMETRY[cfg.body];
    if(geometry){
      polygon(c,geometry.outline.map(([x,y])=>[x*radius,y*radius]),true);
      c.save();c.globalAlpha*=.55;c.lineWidth=preview?.55:.85;
      for(const rib of geometry.ribs){c.beginPath();rib.forEach(([x,y],i)=>i?c.lineTo(x*radius,y*radius):c.moveTo(x*radius,y*radius));c.stroke();}
      c.restore();
    }
    if(cfg.body==='cross'){const a=radius*.4,b=radius*.94;polygon(c,[[-a,-b],[a,-b],[a,-a],[b,-a],[b,a],[a,a],[a,b],[-a,b],[-a,a],[-b,a],[-b,-a],[-a,-a]],true);}
    c.beginPath();c.arc(-4,0,6,0,Math.PI*2);c.stroke();line(c,-7,0,-1,0);line(c,-4,-3,-4,3);
    cfg.lines.forEach(l=>line(c,...l));
    // Four visible panel strips. Missing strips expose the chassis to full hits.
    for(let j=0;j<4;j++){
      const part=r.parts?.find(p=>p.id==='armor'+j);c.save();c.rotate(j*Math.PI/2);c.lineWidth=preview?1:2.2;
      if(part?.broken){c.strokeStyle='#664d47';c.setLineDash([1,3]);}else if(part&&part.health/part.maxHealth<.5)c.strokeStyle='#dfaa79';
      line(c,radius*.78,-7,radius*.78,7);c.restore();
    }
    const tools=r.tools||cfg.tools;
    for(const [i,t] of tools.entries()){
      c.save();c.globalAlpha*=t.broken?.15:.4;line(c,-4,0,t.x,t.y);c.restore();
      c.save();if(preview&&i===selectedTool){c.strokeStyle='#e2f4b9';c.lineWidth=1.1;}else if(preview&&i===hoverTool){c.strokeStyle='#c8e9e5';c.lineWidth=1;}if(t.bonus)c.strokeStyle=BONUS_TOOL_COLOR;if(t.flash>0)c.strokeStyle='#fff1ce';if(toolIsCritical(t)||t.broken)c.strokeStyle=CRITICAL_TOOL_COLOR;drawTool(c,t,time,preview);if(t.bonus&&!t.broken){c.lineWidth=1;if(toolIsCritical(t)){line(c,t.x,t.y-12,t.x,t.y-8);line(c,t.x,t.y-6,t.x,t.y-5);}else{line(c,t.x-3,t.y-8,t.x+3,t.y-8);line(c,t.x,t.y-11,t.x,t.y-5);}}c.restore();
      if(preview){c.save();c.fillStyle=i===selectedTool?'#e2f4b9':'#8bafae';c.font='3px monospace';c.textAlign='center';c.fillText(String(i+1).padStart(2,'0'),t.x,t.y-5);c.restore();}
    }
    c.fillStyle=color;c.beginPath();c.arc(radius*.35,0,1.7,0,Math.PI*2);c.fill();
    if(r.dash>0){c.strokeStyle=color+'aa';line(c,-radius-7,-6,-radius-18,0);line(c,-radius-7,6,-radius-18,0);}
    c.restore();
    if(!preview){c.save();c.fillStyle=color+'aa';c.font='8px monospace';c.textAlign='center';c.fillText((r.exit?'OUT / ':'')+(r.team!=null?String.fromCharCode(65+r.team)+' · ':'')+cfg.name,x,y+radius+24);c.restore();}
  }
  function builderScale(){
    if(dragScale!==null)return dragScale;
    let ex=35,ey=35;
    // Fit the complete mounted tools, including sideways and rear-facing heads.
    for(const t of config.tools){
      const a=t.angle*Math.PI/180,co=Math.cos(a),si=Math.sin(a);
      for(const x of [-5,38])for(const y of [-18,18]){
        ex=Math.max(ex,Math.abs(t.x+x*co-y*si));ey=Math.max(ey,Math.abs(t.y+x*si+y*co));
      }
    }
    return Math.min(4.3,(builder.width/2-24)/ex,(builder.height/2-36)/ey);
  }
  function drawBuilder(){
    const w=builder.width,h=builder.height,c=bctx;c.clearRect(0,0,w,h);c.fillStyle='#0c141a';c.fillRect(0,0,w,h);
    c.save();c.translate(w/2,h/2-12);c.scale(builderScale(),builderScale());c.fillStyle='#2c424e';
    for(let x=-64;x<=64;x+=8)for(let y=-40;y<=40;y+=8)c.fillRect(x-.18,y-.18,.36,.36);
    c.strokeStyle='#243b46';c.lineWidth=.25;c.setLineDash([1,2]);line(c,-66,0,66,0);line(c,0,-38,0,38);c.setLineDash([]);
    const radius=E.BODIES[config.body].radius;
    c.strokeStyle='#76d8cf25';c.setLineDash([1,2]);c.lineWidth=.3;c.strokeRect(-radius,-radius,radius*2,radius*2);c.setLineDash([]);
    robotDrawing(c,{config,stats:E.stats(config),id:0,x:0,y:0,angle:0,z:0,alive:true},0,true);
    const t=config.tools[selectedTool];
    if(!drawing&&t){c.save();c.translate(t.x,t.y);c.rotate(t.angle*Math.PI/180);c.strokeStyle='#e2f4b9';c.lineWidth=.5;c.beginPath();c.arc(0,0,4.6,0,Math.PI*2);c.stroke();c.strokeStyle='#e2f4b980';c.setLineDash([1,2]);line(c,0,0,Math.min(46,E.toolStats(t).reach),0);c.setLineDash([]);c.restore();}
    if(drawing){c.strokeStyle='#76d8cf33';c.setLineDash([1,1]);c.lineWidth=.25;c.strokeRect(-32,-32,64,64);c.setLineDash([]);}
    if(drawStart&&drawEnd){c.strokeStyle='#e6f3b4';c.lineWidth=.8;line(c,...drawStart,...drawEnd);}
    c.restore();
  }
  function drawHazard(c,h,t){
    const active=E.hazardActive(h,t),warning=E.hazardWarning(h,t),d=E.HAZARDS[h.type],color=d.color;
    c.save();c.translate(h.x,h.y);c.strokeStyle=warning?'#f5d49b':color+(active?'bc':'45');c.lineWidth=1;
    c.fillStyle=color+(active?'0d':'04');c.beginPath();c.arc(0,0,h.r,0,Math.PI*2);c.fill();
    c.setLineDash([2,5]);c.beginPath();c.arc(0,0,h.r+9,0,Math.PI*2);c.stroke();c.setLineDash([]);
    if(warning){c.save();c.globalAlpha=.3+.3*Math.sin(t*16);c.strokeStyle='#f5d49b';c.lineWidth=2;c.beginPath();c.arc(0,0,h.r+13,0,Math.PI*2);c.stroke();c.restore();}
    if(h.type==='fire'){
      c.strokeRect(-h.r*.69,-h.r*.69,h.r*1.38,h.r*1.38);
      for(let j=-1;j<=1;j++){
        const offset=Math.sin(t*5+j)*3;c.beginPath();c.moveTo(j*12-4,13);
        c.bezierCurveTo(j*12-13,1,j*12+8,-2,j*12-1,active?-16-offset:-3);
        c.bezierCurveTo(j*12+16,0,j*12+9,7,j*12+5,13);c.stroke();
      }
    }else if(h.type==='grinder'){
      c.save();c.rotate(t*1.6);const pts=[];
      for(let j=0;j<36;j++){const a=j*Math.PI*2/36,r=j%3===0?h.r:h.r*.76;pts.push([Math.cos(a)*r,Math.sin(a)*r]);}
      polygon(c,pts);c.beginPath();c.arc(0,0,h.r*.43,0,Math.PI*2);c.stroke();
      for(let j=0;j<4;j++){c.rotate(Math.PI/2);line(c,5,0,17,0);}c.restore();
      c.beginPath();c.arc(0,0,4,0,Math.PI*2);c.stroke();
    }else if(h.type==='spikes'){
      c.strokeRect(-h.r*.7,-h.r*.7,h.r*1.4,h.r*1.4);
      for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++){
        if(active)polygon(c,[[x*13-4,y*13+4],[x*13,y*13-6],[x*13+4,y*13+4]]);
        else{c.beginPath();c.arc(x*13,y*13,2,0,Math.PI*2);c.stroke();}
      }
    }else if(h.type==='electric'){
      polygon(c,[[0,-h.r],[h.r,0],[0,h.r],[-h.r,0]]);
      polygon(c,[[5,-18],[-10,3],[-1,3],[-5,18],[11,-4],[2,-4]]);
      if(active){c.save();c.rotate(t*.8);for(let j=0;j<4;j++){c.rotate(Math.PI/2);c.beginPath();c.moveTo(13,0);c.lineTo(20,-4*Math.sin(t*13+j));c.lineTo(25,3);c.stroke();}c.restore();}
    }else if(h.type==='acid'){
      c.save();c.setLineDash([4,3]);c.beginPath();c.ellipse(0,0,h.r*.9,h.r*.72,-.2,0,Math.PI*2);c.stroke();c.restore();
      for(let j=0;j<5;j++){const a=j*2.4+t*.2,rad=5+((t*.8+j*1.8)%5);c.beginPath();c.arc(Math.cos(a)*h.r*.43,Math.sin(a)*h.r*.38,rad,0,Math.PI*2);c.stroke();}
    }
    if(active&&h.type==='fire'){
      for(let j=0;j<8;j++){const life=(t*1.5+j*.173+h.id*.21)%1,a=j*2.4+h.id;
        const x=Math.cos(a)*h.r*.62,y=Math.sin(a)*h.r*.55-life*12;
        c.globalAlpha=(1-life)*.7;c.strokeStyle='#ffe283';c.lineWidth=.9;
        line(c,x,y,x+Math.sin(t*5+j)*2,y-3-life*4);
      }c.globalAlpha=1;
    }
    c.fillStyle=warning?'#f5d49b':color+'c0';c.font='7px monospace';c.textAlign='center';
    c.fillText(d.label.toUpperCase()+(h.period?(warning?' / !':active?' / ON':' / OFF'):''),0,h.r+23);c.restore();
  }
  function drawPickup(c,p,t){
    const repair=p.kind==='repair',color=repair?'#b9efb0':'#f0d18b',pulse=(Math.sin(t*3+p.id)+1)/2;
    c.save();c.translate(p.x,p.y);c.strokeStyle=color;c.lineWidth=1.1;c.fillStyle=repair?'#132c25':'#2c2819';
    c.beginPath();c.arc(0,0,15,0,Math.PI*2);c.fill();c.stroke();
    c.save();c.globalAlpha=.2+pulse*.25;c.setLineDash([2,4]);c.beginPath();c.arc(0,0,20+pulse*2,0,Math.PI*2);c.stroke();c.restore();
    if(repair){c.lineWidth=2.5;line(c,-7,0,7,0);line(c,0,-7,0,7);}
    else{c.save();c.scale(.66,.66);drawTool(c,{type:p.toolType,x:-12,y:0,angle:0},t,true);c.restore();}
    c.fillStyle=color;c.font='7px monospace';c.textAlign='center';c.fillText(repair?'+ REPAIR':'+ '+E.WEAPONS[p.toolType].label.toUpperCase(),0,32);
    c.restore();
  }
  // A ring-out must never zoom, pan, or resize the playable field. Keep the same
  // world-to-canvas transform for live play, exit coasts, replays, and inspection.
  // Off-screen debris, projectiles, and oversized tools clip at the canvas edge.
  const ARENA_VIEW=Object.freeze({min:0,size:800});
  function arenaView(){return ARENA_VIEW;}
  function drawArena(s, now){
    const c=ctx,w=arena.width,view=arenaView(s);c.save();c.fillStyle='#0b1319';c.fillRect(0,0,w,arena.height);c.scale(w/view.size,w/view.size);c.translate(-view.min,-view.min);
    // Ground grid and the immutable 632 × 632 playable square.
    c.fillStyle='#0e191f';c.fillRect(84,84,632,632);
    c.fillStyle='#21333c';for(let x=100;x<716;x+=24)for(let y=100;y<716;y+=24)c.fillRect(x-.55,y-.55,1.1,1.1);
    c.strokeStyle='#21333d';c.lineWidth=.7;c.setLineDash([3,9]);line(c,400,84,400,716);line(c,84,400,716,400);c.setLineDash([]);
    c.strokeStyle='#233740';c.beginPath();c.arc(400,400,71,0,Math.PI*2);c.stroke();c.beginPath();c.arc(400,400,9,0,Math.PI*2);c.stroke();
    line(c,385,400,415,400);line(c,400,385,400,415);
    c.font='8px monospace';c.fillStyle='#506873';c.textAlign='left';c.fillText('01 / FIXED ARENA',85,52);c.textAlign='right';c.fillText('632 × 632 u',715,52);
    c.textAlign='left';c.fillText('Z > 42 u  /  ABOVE THE WALL',85,757);c.textAlign='right';c.fillText('SIMULATION / 60 Hz',715,757);
    c.strokeStyle='#324853';c.lineWidth=1;
    for(const [x,y,dx,dy] of [[70,70,1,1],[730,70,-1,1],[70,730,1,-1],[730,730,-1,-1]]){line(c,x,y,x+dx*16,y);line(c,x,y,x,y+dy*16);}
    const t=s.time+(s.settleElapsed||0);
    s.hazards.forEach(h=>drawHazard(c,h,t));
    (s.pickups||[]).filter(p=>E.pickupAvailable(s,p)).forEach(p=>drawPickup(c,p,t));
    for(let i=0;i<s.robots.length;i++){
      const trail=trails[i];if(trail.length>1){c.strokeStyle=robotColor(s.robots[i])+'16';c.lineWidth=1;c.beginPath();trail.forEach((p,j)=>j?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.stroke();}
    }
    const observed=observedWall();
    s.walls.forEach((wall,index)=>{
      const [x1,y1,x2,y2,ox,oy]=E.wallEndpoints(wall),ux=(x2-x1)/E.BOUNDS.size*E.SEGMENTS,uy=(y2-y1)/E.BOUNDS.size*E.SEGMENTS;
      const hp=wall.health/wall.maxHealth;
      if(wall.broken){c.strokeStyle='#e79a7444';c.lineWidth=1;c.setLineDash([2,7]);line(c,x1+ux*4,y1+uy*4,x2-ux*4,y2-uy*4);c.setLineDash([]);}
      else {
        c.strokeStyle=wall.flash>0?'#f4e1ba':hp<.33?'#d98c74':hp<.7?'#d3b07d':'#627984';c.lineWidth=2.1;line(c,x1+ux*2,y1+uy*2,x2-ux*2,y2-uy*2);
        c.strokeStyle='#2a3e47';c.lineWidth=1;line(c,x1+ux*3+ox*7,y1+uy*3+oy*7,x2-ux*3+ox*7,y2-uy*3+oy*7);
        c.strokeStyle=hp<.7?'#d3b07d99':'#547b7a';line(c,x1+ux*3+ox*7,y1+uy*3+oy*7,x1+ux*(3+(E.BOUNDS.size/E.SEGMENTS-6)*hp)+ox*7,y1+uy*(3+(E.BOUNDS.size/E.SEGMENTS-6)*hp)+oy*7);
        if(hp<.7){const mx=(x1+x2)/2,my=(y1+y2)/2;c.strokeStyle='#e2bd8f';c.lineWidth=.8;c.beginPath();c.moveTo(mx-ux*4-ox*3,my-uy*4-oy*3);c.lineTo(mx+ox*3,my+oy*3);c.lineTo(mx+ux*4-ox*2,my+uy*4-oy*2);c.stroke();}
      }
      if(index===observed){c.strokeStyle='#c5ebad88';c.lineWidth=1;line(c,x1+ux*3+ox*13,y1+uy*3+oy*13,x2-ux*3+ox*13,y2-uy*3+oy*13);}
    });
    for(const d of s.debris||[]){c.save();c.translate(d.x,d.y);c.rotate(d.angle);c.globalAlpha=Math.max(.15,1-(s.time-d.born)/10);c.strokeStyle=robotColor(s.robots[d.owner])+'88';c.lineWidth=1;line(c,-4,-2,4,1);line(c,4,1,1,5);c.restore();}
    // Every bright bullet head is a real swept projectile; faint trailing dots
    // are cosmetic. Render from simulation time, so pause and replay are stable.
    for(const p of s.projectiles||[]){if(p.queued||p.delay>0)continue;
      c.save();c.translate(p.x,p.y-p.z*.32);c.rotate(p.angle);
      if(p.type==='rocket'){
        c.strokeStyle=robotColor(s.robots[p.owner]);c.lineWidth=1.6;polygon(c,[[-7,-3],[4,-3],[9,0],[4,3],[-7,3]]);
        for(let j=0;j<5;j++){c.globalAlpha=(1-j/5)*.85;c.fillStyle=j<2?'#ffe8a0':'#eea567';
          c.beginPath();c.arc(-10-j*4,Math.sin(t*35+p.id+j)*1.5,2-j*.25,0,Math.PI*2);c.fill();}
      }else{
        for(let j=3;j>=0;j--){c.globalAlpha=j===0?1:.45/(j+1);c.fillStyle=j===0?'#fff1b5':robotColor(s.robots[p.owner]);
          c.beginPath();c.arc(-j*4.5,0,j===0?2:1.3,0,Math.PI*2);c.fill();}
      }c.restore();
    }
    for(const f of s.effects||[]){const age=s.time+(s.settleElapsed||0)-f.born;if(age<0||age>.65)continue;
      c.save();c.translate(f.x,f.y);c.globalAlpha=Math.max(0,1-age/.65);
      if(f.kind==='explosion'){
        c.strokeStyle='#f1b174';c.lineWidth=1.1;c.beginPath();c.arc(0,0,f.radius*(.2+age*1.25),0,Math.PI*2);c.stroke();
        for(let j=0;j<20;j++){const a=j*2.399+f.born*4,rad=(5+age*(35+j*3));
          c.strokeStyle=j%3?'#ffd88a':'#eea477';c.lineWidth=j%3?1.2:1.7;
          line(c,Math.cos(a)*rad,Math.sin(a)*rad,Math.cos(a)*(rad+4+6*(1-age/.65)),Math.sin(a)*(rad+4+6*(1-age/.65)));
          if(j%2===0){c.fillStyle='#f3c26a';c.beginPath();c.arc(Math.cos(a)*rad*.7,Math.sin(a)*rad*.7,1.6,0,Math.PI*2);c.fill();}
        }
      }c.restore();
    }
    [...s.robots].sort((a,b)=>a.z-b.z).forEach(r=>robotDrawing(c,r,t));
    for(const f of s.flames||[]){
      if(!s.robots[f.owner]?.alive)continue;
      c.save();c.translate(f.x,f.y-(f.z||0)*.32);c.rotate(f.angle);
      const count=26+f.power*8,age=t-f.born;
      for(let j=0;j<count;j++){
        const lane=((j*0.61803398875+f.id*.17)%1),angle=(lane-.5)*.76;
        const ri=lane*8,lo=Math.floor(ri),hi=Math.min(8,lo+1),mix=ri-lo;
        const reach=(f.rays?.[lo]??f.reach)*(1-mix)+(f.rays?.[hi]??f.reach)*mix;
        // Space short strokes along moving trajectories rather than filling a cone.
        const u=(age*520/Math.max(f.reach,1)+j/count)%1;
        const distance=u*reach,length=Math.min(4+f.power*1.2+u*5,Math.max(0,reach-distance));
        if(length<.2)continue;
        c.globalAlpha=(.92-u*.62)*Math.min(1,(age+.04)*12);
        c.strokeStyle=j%3===0?'#f3bd45':'#ffe283';c.lineWidth=j%4===0?1.7:1.1;
        line(c,Math.cos(angle)*distance,Math.sin(angle)*distance,Math.cos(angle)*(distance+length),Math.sin(angle)*(distance+length));
      }c.restore();
    }
    for(const ev of s.events){
      const age=t-ev.t;if(age<0||age>1.1)continue;
      if(!['wall','wall-hit','part','hit','launch','destroy','land','pickup','repair','supply','collision'].includes(ev.type))continue;
      const color=ev.type==='wall'?'#e7bb85':['launch','repair','pickup','supply'].includes(ev.type)?'#b9efb0':'#c9d8d5';
      c.strokeStyle=color+Math.round((1-age/1.1)*170).toString(16).padStart(2,'0');c.lineWidth=1;
      const count=ev.type==='wall'||ev.type==='destroy'?18:ev.type==='collision'?12:9;
      for(let i=0;i<count;i++){const a=i*2.4+ev.id*.7,rad=7+age*(15+i*4);line(c,ev.x+Math.cos(a)*rad,ev.y+Math.sin(a)*rad,ev.x+Math.cos(a)*(rad+5),ev.y+Math.sin(a)*(rad+5));}
    }
    c.restore();
  }
  function setBanner(kicker,title,subtitle){const b=$('arena-banner');b.classList.remove('hidden','result-banner');b.style.removeProperty('--winner-color');b.children[0].textContent=kicker;b.children[1].textContent=title;b.children[2].textContent=subtitle;}
  function timeText(time){const t=Math.max(0,Math.ceil(time));return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');}
  function observedWall(){
    if(inspectWall>=0)return inspectWall;
    let index=0,best=Infinity;
    state.walls.forEach((w,i)=>{if(!w.broken&&w.health<best){best=w.health;index=i;}});return index;
  }
  function updateDamageUI(me){
    const wi=observedWall(),w=state.walls[wi];
    $('wall-label').textContent='WALL '+String(wi+1).padStart(2,'0')+' · '+(w.broken?'BREACHED':w.health<w.maxHealth?'DAMAGED':'REINFORCED');
    $('wall-health').textContent=Math.ceil(w.health)+' / '+w.maxHealth+' HP';$('wall-bar').style.width=(w.health/w.maxHealth*100)+'%';
    $('wall-auto').textContent=inspectWall<0?'Auto ✓':'Auto ↻';
    $('mobility').textContent=Math.round(E.driveFactor(me)*100)+'%';$('active-tools').textContent=me.tools.filter(t=>!t.broken).length+' / '+me.tools.length;
    $('damage-deck').replaceChildren();
    for(const r of state.robots){
      const card=document.createElement('div');card.className='damage-card';const name=document.createElement('strong');name.textContent='P'+(r.id+1)+' / '+r.config.name;name.style.color=robotColor(r);card.classList.toggle('eliminated',!r.alive);card.append(name);
      const chips=document.createElement('div');chips.className='component-chips';
      r.parts.forEach(p=>{const chip=document.createElement('span');chip.className='component-chip'+(p.broken?' broken':p.health/p.maxHealth<.5?' hurt':'');
        chip.textContent=p.id.startsWith('armor')?['FR','RT','BK','LT'][Number(p.id.slice(5))]:p.id==='driveL'?'L DRIVE':'R DRIVE';chip.title=p.label+': '+Math.ceil(p.health)+' / '+p.maxHealth+' HP';chips.append(chip);});card.append(chips);
      for(const [i,t] of r.tools.entries()){
        const p=document.createElement('p');p.className=toolStatusClasses(t).trim();p.dataset.toolId=t.id;const label=document.createElement('span'),v=document.createElement('b');
        label.textContent=(t.bonus?'＋ ':String(i+1).padStart(2,'0')+' ')+t.label;v.textContent=t.broken?'DESTROYED':(toolIsCritical(t)?'! ':'')+Math.ceil(t.health)+' / '+t.maxHealth+' HP';p.title=t.label+(toolIsCritical(t)?' — CRITICAL: 25% HP or less':'')+(t.bonus?' — field bonus':'');p.append(label,v);card.append(p);
      }
      if(!r.tools.length){const p=document.createElement('p');p.textContent='No tools mounted';card.append(p);}$('damage-deck').append(card);
    }
    $('tool-telemetry').replaceChildren();
    for(const [i,t] of me.tools.entries()){
      const row=document.createElement('div');row.className='cooldown-row'+toolStatusClasses(t);row.dataset.toolId=t.id;
      const top=document.createElement('div'),label=document.createElement('span'),status=document.createElement('b');
      label.textContent=(toolIsCritical(t)?'! ':'')+(t.bonus?'BONUS / ':String(i+1).padStart(2,'0')+' / ')+t.label;row.title=toolIsCritical(t)?'CRITICAL: 25% HP or less':'';
      status.textContent=t.broken?'DESTROYED':t.cooldown>0?t.cooldown.toFixed(1)+'s / '+t.stats.cooldown+'s':me.energy<t.stats.energy?'LOW ENERGY':'READY';top.append(label,status);
      const track=document.createElement('div');track.className='track';const bar=document.createElement('i');bar.style.width=(t.broken?0:(1-t.cooldown/t.stats.cooldown)*100)+'%';track.append(bar);row.append(top,track);$('tool-telemetry').append(row);
    }
    if(!me.tools.length){const p=document.createElement('p');p.className='hint';p.textContent='No tools mounted. Your robot can still push.';$('tool-telemetry').append(p);}
  }
  function updateTeams(){
    const strip=$('team-strip');strip.hidden=!state.teamCount;
    if(!state.teamCount)return;
    strip.replaceChildren();
    for(const team of E.buildTeamStandings(state).sort((a,b)=>a.id-b.id)){
      const chip=document.createElement('div');chip.className='team-chip';chip.style.setProperty('--team-color',COLORS[team.id]);
      const name=document.createElement('b');name.textContent=team.name;
      const hp=document.createElement('strong');hp.textContent=Math.ceil(team.health)+' HP';
      const alive=document.createElement('small');alive.textContent=team.aliveCount+'/'+team.size+' ALIVE';
      chip.append(name,hp,alive);strip.append(chip);
    }
  }
  function updateUI(){
    const me=state.robots[room||mode==='online'?onlineSlot:0]||state.robots[0];
    const hud=document.querySelector('.match-hud');hud.classList.toggle('multi',state.robots.length>2);hud.classList.toggle('three',state.robots.length===3);hud.classList.toggle('many',state.robots.length>4);hud.classList.toggle('five',state.robots.length===5);hud.classList.toggle('crowded',state.robots.length>=7);hud.classList.toggle('teams',!!state.teamCount);
    for(const [i,tag] of TAGS.entries()){
      const r=state.robots[i],card=$('fighter-'+tag);card.hidden=!r;if(!r)continue;
      card.classList.toggle('eliminated',!r.alive);
      const health=Math.ceil(E.clamp(r.health,0,r.stats.hp)),energy=Math.round(E.clamp(r.energy,0,100));
      const own=room||mode==='online'?onlineSlot:0;const role=(r.team!=null?String.fromCharCode(65+r.team)+' · ':'')+(r.placeholder?'OPEN':!r.alive?'OUT':r.id===own?'YOU':r.controller==='bot'?'BOT '+(r.id+1):'P'+(r.id+1));
      $('fighter-'+tag).style.setProperty('--fighter-color',robotColor(r));
      $('name-'+tag).textContent=r.config.name;$('seat-'+tag).textContent=role;
      const pickupWait=Math.ceil(Math.max(0,r.pickupCooldown||0)),pickupLabel=$('pickup-status-'+tag);
      pickupLabel.textContent=!r.alive?'BONUS —':pickupWait?'BONUS IN '+pickupWait+'s':'BONUS READY';
      pickupLabel.classList.toggle('waiting',r.alive&&pickupWait>0);
      pickupLabel.setAttribute('aria-label',r.config.name+(!r.alive?' is eliminated':pickupWait?' can collect another repair kit or tool in '+pickupWait+' seconds':' can collect a repair kit or tool'));
      $('hp-'+tag).style.width=E.clamp(r.health/r.stats.hp*100,0,100)+'%';
      $('health-'+tag).textContent=health;$('max-health-'+tag).textContent=r.stats.hp;
      $('energy-'+tag).textContent=energy;$('energy-bar-'+tag).style.width=E.clamp(r.energy,0,100)+'%';
      for(const [kind,value,max] of [['health',health,r.stats.hp],['energy',energy,100]]){
        const meter=$(kind+'-meter-'+tag);meter.setAttribute('aria-valuemax',max);meter.setAttribute('aria-valuenow',value);
        meter.setAttribute('aria-label',r.config.name+' ('+role.toLowerCase()+') '+kind);
        meter.setAttribute('aria-valuetext',value+' of '+max+(kind==='health'?' HP':' energy'));
      }
    }
    updateTeams();
    $('clock').textContent=timeText(E.MAX_SECONDS-state.time);
    $('match-state').textContent=mode==='idle'?'READY':mode==='replay'?'REPLAY':state.status==='finished'?'FINISHED':state.pendingResult?'SHOTS IN FLIGHT':paused?'PAUSED':countdown>0?'STARTING':'IN BATTLE';
    $('current-action').textContent=!me.alive?'Eliminated · spectating':mode==='idle'?'Standing by':me.recoveryUntil>state.time?'Reversing · wall recovery':E.ACTIONS[me.action];
    $('current-height').textContent=Math.round(me.z)+' u';$('broken-walls').textContent=state.walls.filter(w=>w.broken).length+' / 48';
    updateDamageUI(me);
    const available=(state.pickups||[]).filter(p=>E.pickupAvailable(state,p));
    $('field-summary').textContent=state.robots.filter(r=>r.alive).length+'/'+state.robots.length+' ALIVE · '+state.hazards.length+' HAZARDS / '+available.length+' BONUSES';
    const next=(Math.floor((state.time+.000001)/E.SUPPLY_INTERVAL)+1)*E.SUPPLY_INTERVAL;
    $('next-supply').textContent=next<E.MAX_SECONDS?'SUPPLY REFRESH IN '+Math.max(0,Math.ceil(next-state.time))+'s':'FINAL SUPPLY WAVE';
    $('bonus-tools').textContent=me.tools.filter(t=>t.bonus&&!t.broken).length+' / '+E.MAX_BONUS_TOOLS;
    $('repairs-collected').textContent=me.repairsCollected||0;
    $('pickup-cooldown').textContent=!me.alive?'Eliminated':me.pickupCooldown>0?me.pickupCooldown.toFixed(1)+'s / '+E.PICKUP_COOLDOWN+'s':'Ready';
    document.querySelectorAll('.rule').forEach((el,i)=>el.classList.toggle('active-rule',mode!=='idle'&&state.status==='running'&&me.ruleIndex===i));
    if(lastEventId!==state.eventCounter){
      lastEventId=state.eventCounter;$('events').replaceChildren();
      if(!state.events.length){const p=document.createElement('p');p.textContent='Battle events will appear here.';$('events').append(p);}
      state.events.slice(-6).reverse().forEach(ev=>{const p=document.createElement('p');if(['wall','part','out','destroy','launch','repair','pickup'].includes(ev.type))p.className='important';const t=document.createElement('time');t.textContent=ev.t.toFixed(1)+'s';p.append(t,document.createTextNode(ev.text));$('events').append(p);});
    }
  }
  function startLocal(){
    if(room)return;
    if(mode==='local'&&state.status==='running'){mode='idle';paused=false;countdown=0;newPreview();setBanner('BATTLE STOPPED','Back to the workshop.','Tune your robot and try another strategy.');$('start').innerHTML='<span>▷</span> Test battle';$('pause').disabled=true;applyLock();leaveBattleView();return;}
    seed=freshSeed(seed);mode='local';newPreview();history=[];paused=false;speed=1;accumulator=0;countdown=2.4;finishing=false;
    $('speed').textContent='1×';$('speed').disabled=false;$('pause').disabled=false;$('pause').textContent='Ⅱ';
    $('start').innerHTML='<span>□</span> Stop';$('replay').disabled=true;applyLock();enterBattleView();
  }
  function clearResults(){
    $('results-panel').hidden=true;
    $('arena-stage').classList.remove('has-results');
    $('arena-banner').classList.remove('result-banner');
    $('arena-banner').style.removeProperty('--winner-color');
    $('results-open').setAttribute('aria-expanded','false');
    $('results-shortcut').hidden=true;
  }
  function healthLabels(rows){
    // Show readable HP but never display different values as a false visual tie.
    const fixed=digits=>rows.map(r=>String(Number(r.health.toFixed(digits))));
    for(let digits=2;digits<=14;digits++){
      const labels=fixed(digits);
      if(!rows.some((a,i)=>rows.some((b,j)=>a.health!==b.health&&labels[i]===labels[j])))return labels;
    }
    return rows.map(r=>String(r.health));
  }
  function renderStandings(){
    const result=state.result,rows=result.standings,ownSlot=mode==='online'?onlineSlot:0;
    const names=resultNames(result);
    $('results-title').textContent=result.draw?'Exact HP tie.':'Battle decided.';
    $('results-summary').textContent=result.draw?names+' share first place.':names+' wins.';
    $('results-reason').textContent=result.reason;
    $('results-time').textContent=result.elapsed.toFixed(2)+'s / '+E.MAX_SECONDS+'s';
    $('results-teams').replaceChildren();$('results-teams').hidden=!state.teamCount;
    if(state.teamCount){
      const teams=result.teamStandings,hpLabels=healthLabels(teams);
      teams.forEach((team,i)=>{
        const entry=document.createElement('div');entry.className='team-result'+(team.winner?' leader':'');entry.style.setProperty('--team-color',COLORS[team.id]);
        const name=document.createElement('b');name.textContent=(team.tied?'=':'')+team.rank+' / '+team.name;
        const hp=document.createElement('strong');hp.textContent=hpLabels[i]+' HP';hp.title='Exact surviving team HP: '+team.health;
        const count=document.createElement('small');count.textContent=team.aliveCount+'/'+team.size+' alive';
        entry.append(name,hp,count);$('results-teams').append(entry);
      });
    }
    $('results-rows').replaceChildren();
    const labels=healthLabels(rows);
    rows.forEach((row,i)=>{
      const tr=document.createElement('tr');tr.dataset.robotId=row.id;tr.dataset.rank=row.rank;
      tr.className=row.winner?'winner-row':'';tr.style.setProperty('--robot-color',robotColor(state.robots[row.id]));
      const place=document.createElement('td');place.className='results-place';place.textContent=(row.tied?'=':'')+row.rank;
      const robot=document.createElement('td'),name=document.createElement('span');name.className='results-robot';name.textContent=(row.team!=null?E.teamName(row.team)+' · ':'')+(state.robots[row.id].controller==='bot'?'BOT ':'P')+(row.id+1)+' / '+row.name;robot.append(name);
      if(row.winner||row.id===ownSlot){const badge=document.createElement('span');badge.className='results-badge';badge.textContent=(row.winner?(result.draw?'SHARED 1ST':'WINNER'):'')+(row.id===ownSlot?(row.winner?' · YOU':'YOU'):'');robot.append(badge);}
      const hp=document.createElement('td');hp.className='results-hp';hp.textContent=labels[i];hp.title='Exact remaining HP: '+String(row.health);hp.dataset.exactHp=String(row.health);
      const max=document.createElement('small');max.textContent='/ '+row.maxHealth+' HP';hp.append(max);
      const status=document.createElement('td');status.className='results-status';
      status.textContent=row.alive?'SURVIVOR':row.reason==='Robot destroyed'?'DESTROYED':row.reason==='Forfeit'?'FORFEIT':'RING-OUT';
      if(!row.alive){status.append(document.createElement('br'),document.createTextNode(row.survived.toFixed(2)+'s'));}
      tr.append(place,robot,hp,status);$('results-rows').append(tr);
    });
    const online=mode==='online'||!!room;
    $('results-next').hidden=online;$('results-online-note').hidden=!online;
    $('results-replay').disabled=online||history.length<2;
    $('results-shortcut').hidden=false;
    $('results-panel').hidden=false;
    $('arena-stage').classList.add('has-results');
    $('results-open').setAttribute('aria-expanded','true');scheduleArenaSize();
  }
  function finish(){
    if(finishing)return;finishing=true;
    const result=state.result,winner=result.winner;
    const ownSlot=mode==='online'?onlineSlot:0;
    const names=resultNames(result);
    // A small, pointer-transparent winner banner, with the complete table beside the field.
    setBanner(result.draw?'DRAW':result.winners.includes(ownSlot)?'VICTORY':'DEFEAT',
      result.draw?names+' share first place.':names+' wins.',result.reason);
    $('arena-banner').classList.add('result-banner');
    $('arena-banner').style.setProperty('--winner-color',result.draw?'#b9efb0':robotColor(state.robots[winner]));
    $('start').innerHTML='<span>▷</span> Another battle';$('pause').disabled=true;
    $('replay').disabled=history.length<2;applyLock();updateUI();renderStandings();
    if(mode==='online'){$('online-status').textContent='Battle finished. Leave the room to edit your robot or create another room.';$('room-message').textContent='Battle finished. Create another room for a rematch.';$('launch-online').hidden=true;}
  }
  function recordFrame(){history.push(JSON.parse(JSON.stringify(state)));if(history.length>Math.ceil(E.MAX_SECONDS/(4*E.STEP))+180)history.shift();}
  function frame(now){
    const elapsed=Math.min((now-last)/1000,.15);last=now;
    if(mode==='local'&&!paused&&state.status==='running'){
      if(countdown>0){countdown-=elapsed;setBanner('BATTLE STARTING',String(Math.max(1,Math.ceil(countdown))),'Your programming takes control.');if(countdown<=0)$('arena-banner').classList.add('hidden');}
      else{accumulator+=elapsed*speed;while(accumulator>=E.STEP&&state.status==='running'){E.step(state);accumulator-=E.STEP;if(state.tick%4===0)recordFrame();}if(state.status==='finished'){recordFrame();finish();}}
    }else if(mode==='replay'&&!paused){
      replayClock+=elapsed*speed;
      while(replayClock>=4*E.STEP&&replayIndex<history.length-1){replayClock-=4*E.STEP;state=history[++replayIndex];}
      if(replayIndex>=history.length-1){mode='local';finishing=false;finish();}
    }
    if(mode!=='idle'&&now-lastUi>80){
      state.robots.forEach((r,i)=>{trails[i].push({x:r.x,y:r.y});if(trails[i].length>75)trails[i].shift();});
    }
    drawArena(state,now);
    if(now-lastUi>80){updateUI();lastUi=now;}
    requestAnimationFrame(frame);
  }
  // Builder and rule-editor wiring.
  $('robot-name').addEventListener('change',ev=>changeConfig({name:ev.target.value}));
  document.querySelectorAll('[data-body]').forEach(b=>b.onclick=()=>changeConfig({body:b.dataset.body}));
  $('loadout').onchange=ev=>{if(locked()||!E.loadouts[ev.target.value])return;selectedTool=0;changeConfig(E.loadouts[ev.target.value]);};
  for(const [id,key] of [['tool-x','x'],['tool-y','y'],['tool-angle','angle']])$(id).onchange=ev=>{const n=Number(ev.target.value);if(Number.isFinite(n))changeTool({[key]:n});};
  $('tool-power').onchange=ev=>changeTool({power:Number(ev.target.value)});
  $('tool-rotation').oninput=ev=>changeTool({angle:Number(ev.target.value)});
  $('rotate-left').onclick=()=>{const t=config.tools[selectedTool];if(t)changeTool({angle:t.angle-15});};
  $('rotate-right').onclick=()=>{const t=config.tools[selectedTool];if(t)changeTool({angle:t.angle+15});};
  $('remove-tool').onclick=()=>removeToolAt(selectedTool);
  ['motor','armor'].forEach(key=>$(key).oninput=ev=>changeConfig({[key]:Number(ev.target.value)}));
  $('add-rule').onclick=()=>{if(!locked()&&config.rules.length<E.MAX_RULES){config.rules.push({when:'always',do:'push'});rulesChanged(true);}};
  $('preset').onchange=ev=>{
    if(locked())return;
    if(ev.target.value==='balanced')config.rules=E.defaultRules();
    if(ev.target.value==='aggressive')config.rules=[{when:'near',do:'weapon'},{when:'far',do:'charge'},{when:'always',do:'push'}];
    if(ev.target.value==='careful')config.rules=[{when:'hazard',do:'avoid'},{when:'edge',do:'center'},{when:'repair',do:'repair'},{when:'pickup',do:'collect'},{when:'low',do:'retreat'},{when:'near',do:'weapon'},{when:'always',do:'push'}];
    if(ev.target.value==='scavenger')config.rules=[{when:'hazard',do:'avoid'},{when:'edge',do:'center'},{when:'repair',do:'repair'},{when:'pickup',do:'collect'},{when:'near',do:'weapon'},{when:'always',do:'collect'}];
    save();renderRules();if(mode==='idle')newPreview();
  };
  // Hit-test the actual tool silhouette, not just its mounting point. The world
  // coordinates are intentionally NOT clamped: barrels and heads extend off-grid.
  const toolHitPaths=new Map();
  function toolHitPath(type){
    if(toolHitPaths.has(type))return toolHitPaths.get(type);
    const p=new Path2D(),seg=(x1,y1,x2,y2)=>{p.moveTo(x1,y1);p.lineTo(x2,y2);};
    const poly=points=>{p.moveTo(...points[0]);points.slice(1).forEach(q=>p.lineTo(...q));p.closePath();};
    p.arc(0,0,2.4,0,Math.PI*2);
    if(type==='flipper'){poly([[0,-5],[24,-5],[27,-2],[27,2],[24,5],[0,5]]);seg(4,-7,4,7);}
    else if(type==='ram'){p.rect(1,-4,10,8);seg(11,0,23,0);p.rect(23,-9,3,18);}
    else if(type==='plow'){poly([[0,-5],[22,-15],[18,0],[22,15],[0,5]]);}
    else if(type==='hammer'){p.rect(2,0,20,2);p.rect(22,-9,9,18);}
    else if(type==='saw'){seg(2,0,16,0);p.moveTo(26,0);p.arc(16,0,10,0,Math.PI*2);}
    else if(type==='flamethrower'){p.rect(0,-6,10,12);p.rect(10,-3,14,6);poly([[24,-5],[30,-4],[30,4],[24,5]]);}
    else if(type==='machinegun'){p.rect(0,-6,13,12);p.rect(13,-3,19,6);p.rect(4,6,7,6);}
    else if(type==='rocket'){p.rect(0,-6,24,12);poly([[24,-6],[33,0],[24,6]]);seg(5,-6,1,-11);seg(5,6,1,11);}
    else if(type==='drill'){p.rect(0,-4,7,8);poly([[7,-6],[32,0],[7,6]]);}
    toolHitPaths.set(type,p);return p;
  }
  function builderPoint(ev){
    const rect=builder.getBoundingClientRect(),scale=builderScale();
    return [((ev.clientX-rect.left)/rect.width*builder.width-builder.width/2)/scale,
      ((ev.clientY-rect.top)/rect.height*builder.height-(builder.height/2-12))/scale];
  }
  function point(ev){return builderPoint(ev).map(n=>E.clamp(n,-32,32));}
  function toolAt(at,pointerType='mouse'){
    const pxPerUnit=builder.getBoundingClientRect().width/builder.width*builderScale();
    const tolerance=Math.max(.7,(pointerType==='touch'?6:3)/Math.max(.05,pxPerUnit));
    bctx.save();bctx.setTransform(1,0,0,1,0,0);bctx.lineWidth=tolerance*2;bctx.lineJoin='round';bctx.lineCap='round';bctx.setLineDash([]);
    let hit=-1;
    // Last drawn is frontmost. Identical or overlapping tools remain selectable
    // individually via their numbered slots; empty canvas never moves a tool.
    for(let i=config.tools.length-1;i>=0;i--){
      const t=config.tools[i],a=t.angle*Math.PI/180,dx=at[0]-t.x,dy=at[1]-t.y;
      const x=dx*Math.cos(a)+dy*Math.sin(a),y=-dx*Math.sin(a)+dy*Math.cos(a),path=toolHitPath(t.type);
      if(bctx.isPointInPath(path,x,y)||bctx.isPointInStroke(path,x,y)){hit=i;break;}
    }
    bctx.restore();return hit;
  }
  function releaseBuilderPointer(id){if(id!==undefined&&builder.hasPointerCapture(id))builder.releasePointerCapture(id);}
  function cancelBuilderGesture(){
    const pointer=dragTool?.pointerId;dragTool=null;dragScale=null;drawStart=drawEnd=null;
    releaseBuilderPointer(pointer);builder.style.cursor=drawing?'crosshair':hoverTool>=0?'grab':'default';drawBuilder();
  }
  $('draw-toggle').onclick=()=>{
    if(locked())return;cancelBuilderGesture();drawing=!drawing;toolClicks=[];hoverTool=-1;
    $('draw-toggle').classList.toggle('active',drawing);$('draw-toggle').setAttribute('aria-pressed',drawing);
    $('preview-mode').textContent=drawing?'DRAG TO DRAW':'DRAG TO MOUNT';builder.style.cursor=drawing?'crosshair':'default';drawBuilder();
  };
  builder.onpointerdown=ev=>{
    if(locked()||ev.button!==0||dragTool!==null)return;
    const at=builderPoint(ev);
    if(drawing){
      if(config.lines.length>=28){toast('Maximum 28 lines. Delete a line to keep drawing.');return;}
      dragScale=builderScale();drawStart=point(ev).map(n=>Math.round(n/2)*2);drawEnd=drawStart;
      builder.setPointerCapture(ev.pointerId);ev.preventDefault();drawBuilder();return;
    }
    const index=toolAt(at,ev.pointerType);
    if(index<0){toolClicks=[];hoverTool=-1;drawBuilder();return;}
    selectedTool=index;hoverTool=index;dragScale=builderScale();const t=config.tools[index];
    dragTool={index,pointerId:ev.pointerId,offsetX:at[0]-t.x,offsetY:at[1]-t.y,
      startX:ev.clientX,startY:ev.clientY,moved:false};
    // Selection alone must not move the mount or rescale the canvas.
    renderToolEditor(false);builder.setPointerCapture(ev.pointerId);builder.focus({preventScroll:true});
    builder.style.cursor='grabbing';ev.preventDefault();drawBuilder();
  };
  builder.onpointermove=ev=>{
    if(locked())return;
    if(drawStart){drawEnd=point(ev).map(n=>Math.round(n/2)*2);drawBuilder();}
    else if(dragTool!==null){
      if(ev.pointerId!==dragTool.pointerId)return;
      if(!dragTool.moved&&Math.hypot(ev.clientX-dragTool.startX,ev.clientY-dragTool.startY)<3)return;
      dragTool.moved=true;toolClicks=[];const at=builderPoint(ev);selectedTool=dragTool.index;
      changeTool({x:at[0]-dragTool.offsetX,y:at[1]-dragTool.offsetY});
    }else{
      const hit=drawing?-1:toolAt(builderPoint(ev),ev.pointerType);
      if(hit!==hoverTool){hoverTool=hit;drawBuilder();}
      builder.style.cursor=drawing?'crosshair':hit>=0?'grab':'default';
    }
  };
  builder.onpointerup=ev=>{
    if(locked()){cancelBuilderGesture();releaseBuilderPointer(ev.pointerId);return;}
    if(dragTool!==null&&dragTool.pointerId!==ev.pointerId)return;
    if(drawStart){
      drawEnd=point(ev).map(n=>Math.round(n/2)*2);
      if(Math.hypot(drawEnd[0]-drawStart[0],drawEnd[1]-drawStart[1])>=2)config.lines.push([...drawStart,...drawEnd]);
      drawStart=drawEnd=null;save();if(mode==='idle')newPreview();
    }else if(dragTool&&!dragTool.moved){
      toolClicks.push({index:dragTool.index,time:ev.timeStamp});toolClicks=toolClicks.slice(-2);
    }else toolClicks=[];
    dragTool=null;dragScale=null;releaseBuilderPointer(ev.pointerId);
    hoverTool=drawing?-1:toolAt(builderPoint(ev),ev.pointerType);
    builder.style.cursor=drawing?'crosshair':hoverTool>=0?'grab':'default';drawBuilder();
  };
  builder.onpointercancel=ev=>{toolClicks=[];cancelBuilderGesture();releaseBuilderPointer(ev.pointerId);};
  builder.onlostpointercapture=()=>{if(dragTool||drawStart){toolClicks=[];cancelBuilderGesture();}};
  builder.onpointerleave=()=>{if(!dragTool&&!drawStart){hoverTool=-1;drawBuilder();}};
  builder.ondblclick=ev=>{
    if(locked()||drawing||ev.button!==0)return;
    const index=toolAt(builderPoint(ev));
    // Both clicks must land on the same actual tool. Never delete the selected
    // tool as a fallback when the double-click was on empty canvas or a drag.
    if(index<0||toolClicks.length!==2||!toolClicks.every(c=>c.index===index)||ev.timeStamp-toolClicks[0].time>1200)return;
    ev.preventDefault();removeToolAt(index);
  };
  builder.addEventListener('wheel',ev=>{
    if(locked()||drawing||ev.ctrlKey||!ev.deltaY)return;
    const hit=toolAt(builderPoint(ev)),index=hit>=0?hit:selectedTool;
    if(!config.tools[index])return;
    ev.preventDefault();
    if(index!==wheelTarget||ev.timeStamp-lastWheelAt>240)wheelRemainder=0;
    wheelTarget=index;lastWheelAt=ev.timeStamp;
    wheelRemainder+=ev.deltaY*(ev.deltaMode===1?16:ev.deltaMode===2?400:1);
    // Fine trackpad deltas accumulate; one normal wheel notch rotates 15 degrees.
    if(Math.abs(wheelRemainder)<40)return;
    const direction=Math.sign(wheelRemainder);wheelRemainder%=40;
    selectedTool=index;changeTool({angle:config.tools[index].angle+direction*(ev.shiftKey?5:15)});
  },{passive:false});
  builder.addEventListener('keydown',ev=>{
    if(locked()||drawing||ev.ctrlKey||ev.metaKey)return;
    if(ev.key==='Delete'||ev.key==='Backspace'){ev.preventDefault();removeToolAt(selectedTool);}
    else if((ev.key==='ArrowLeft'||ev.key==='ArrowRight')&&config.tools[selectedTool]){
      ev.preventDefault();changeTool({angle:config.tools[selectedTool].angle+(ev.key==='ArrowLeft'?-1:1)*(ev.shiftKey?5:15)});
    }
  });
  function inspectAt(ev){
    const rect=arena.getBoundingClientRect(),view=arenaView(state),x=view.min+(ev.clientX-rect.left)/rect.width*view.size,y=view.min+(ev.clientY-rect.top)/rect.height*view.size;
    let best=18,index=-1;state.walls.forEach((w,i)=>{const[a,b,c,d]=E.wallEndpoints(w),px=E.clamp(x,Math.min(a,c),Math.max(a,c)),py=E.clamp(y,Math.min(b,d),Math.max(b,d)),dist=Math.hypot(x-px,y-py);if(dist<best){best=dist;index=i;}});
    if(index>=0)inspectWall=index;
  }
  arena.addEventListener('pointermove',inspectAt);arena.addEventListener('pointerdown',inspectAt);
  arena.addEventListener('keydown',ev=>{if(ev.key==='ArrowLeft'||ev.key==='ArrowRight'){ev.preventDefault();inspectWall=(observedWall()+(ev.key==='ArrowRight'?1:47))%48;}});
  $('wall-auto').onclick=()=>{inspectWall=-1;};
  $('undo-line').onclick=()=>{if(!locked()){config.lines.pop();save();drawBuilder();if(mode==='idle')newPreview();}};
  $('clear-lines').onclick=()=>{if(!locked()){config.lines=[];save();drawBuilder();if(mode==='idle')newPreview();}};
  $('start').onclick=startLocal;
  $('pause').onclick=()=>{if(mode==='online')return;paused=!paused;$('pause').textContent=paused?'▷':'Ⅱ';};
  $('speed').onclick=()=>{if(mode==='online')return;speed=speed===1?2:speed===2?.5:1;$('speed').textContent=speed+'×';};
  $('seed-button').onclick=()=>{if(locked())return;seed=freshSeed(seed);mode='idle';newPreview();setBanner('LAYOUT PREVIEW','New risks. New rewards.','Every battle rolls a fresh field. Replay keeps the original.');};
  $('bot-count').onchange=ev=>{if(locked()||battleMode!=='ffa')return;botCount=Number(ev.target.value);mode='idle';syncRoster();newPreview();setBanner('FREE-FOR-ALL',botCount+' robots. One survivor.','250 HP each. No teams.');};
  $('battle-mode').onchange=ev=>{
    if(locked())return;battleMode=ev.target.value;const m=E.modeInfo(battleMode);
    if(m.count)botCount=m.count;$('bot-count').value=String(botCount);
    $('battle-mode-note').textContent=m.teams?m.teams+' teams of '+m.teamSize+'. Shared colors · no weapon friendly fire · total surviving HP wins.':'Every robot for itself. Choose 2–8 participants.';
    mode='idle';newPreview();applyLock();
    setBanner(m.label.toUpperCase(),m.teams?'Fight for your team.':botCount+' robots. One survivor.',m.teams?'Your saved robot leads Team A. Only AI builds change.':'250 HP each. No teams.');
  };
  $('replay').onclick=()=>{if(history.length<2||room)return;clearResults();mode='replay';state=history[0];replayIndex=0;replayClock=0;paused=false;trails=Array.from({length:E.MAX_BOTS},()=>[]);lastEventId=-1;$('arena-banner').classList.add('hidden');$('pause').disabled=false;$('pause').textContent='Ⅱ';$('start').innerHTML='<span>▷</span> New battle';applyLock();enterBattleView();};
  $('export').onclick=()=>{const blob=new Blob([JSON.stringify({format:'cspire-arena-robot',version:2,robot:config},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='my-robot.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  $('import').onclick=()=>$('import-file').click();
  $('import-file').onchange=async ev=>{const file=ev.target.files[0];if(!file)return;if(locked()){ev.target.value='';toast('Leave the room or finish your battle before importing.');return;}try{if(file.size>65536)throw Error('The file exceeds 64 KB.');const raw=JSON.parse(await file.text());if(!['cspire-arena-robot','line-arena-robot'].includes(raw.format)||!raw.robot)throw Error('Use a file exported by CSPIRE//ARENA.');config=E.normalizeConfig(raw.robot);selectedTool=config.tools.length?0:-1;save();syncBuilder();renderRules();$('preset').value='custom';mode='idle';newPreview();toast('Robot imported: it replaces your single saved design.');}catch(err){toast(err.message||'Invalid file.');}finally{ev.target.value='';}};
  document.querySelectorAll('[data-scroll]').forEach(b=>b.onclick=()=>{
    document.querySelectorAll('.navitem').forEach(x=>x.classList.toggle('active',x===b));
    const id=b.dataset.scroll;
    if(id==='workshop')setPanels({builder:false});
    if(id==='brain')setPanels({logic:false});
    setTimeout(()=>$(id).scrollIntoView({behavior:reducedMotion()?'instant':'smooth',block:'start'}),reducedMotion()?0:590);
  });
  $('results-open').onclick=()=>{if(state.status==='finished'){
    renderStandings();$('results-panel').scrollIntoView({behavior:reducedMotion()?'instant':'smooth',block:'nearest'});
  }};
  document.querySelectorAll('[data-results-close]').forEach(b=>b.onclick=()=>{
    $('results-panel').hidden=true;$('arena-stage').classList.remove('has-results');
    $('results-open').setAttribute('aria-expanded','false');scheduleArenaSize();
    $('results-open').focus({preventScroll:true});
  });
  $('results-next').onclick=()=>{clearResults();startLocal();};
  $('results-replay').onclick=()=>$('replay').click();
  $('help-open').onclick=()=>$('help-dialog').showModal();
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
  document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',ev=>{if(ev.target===d){const r=d.getBoundingClientRect();if(ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom)d.close();}}));
  // Online: private rooms, opaque HttpOnly session cookie, SSE snapshots.
  async function api(path,method='GET',body){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{const res=await fetch(path,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal});const json=await res.json();if(!res.ok)throw Error(json.error||'Could not complete the request.');return json;}
    catch(err){if(err.name==='AbortError')throw Error('The server is not responding. Check your connection.');throw err;}finally{clearTimeout(timer);}
  }
  async function ensurePilot(){const data=await api('/api/session','POST',{alias:$('pilot-name').value.trim()||'Pilot',robot:config});pilotId=data.pilot.id;$('pilot-name').value=data.pilot.alias;return data;}
  function onlineError(err){$('online-error').textContent=err.message||'Could not connect.';}
  function roomUI(info){
    room=info;onlineSlot=room.players.findIndex(p=>p.id===pilotId);if(onlineSlot<0)onlineSlot=0;
    $('room-info').hidden=false;$('share-code').textContent=room.code;
    const m=E.modeInfo(room.mode||'ffa'),cap=room.capacity||E.MAX_BOTS,host=room.host===pilotId;
    $('room-mode').value=room.mode||'ffa';$('room-mode').disabled=!host||!['waiting','ready'].includes(room.status);
    $('room-mode-help').textContent=m.teams?m.label+' · '+cap+' players required. Alternating team assignment; no weapon friendly fire.':'Free-for-all · 2–8 players. The host may start with two or more.';
    $('room-message').textContent=room.status==='waiting'?(m.teams?'Waiting for '+(cap-room.players.length)+' more players for '+m.label+'…':'Waiting for another pilot…'):room.status==='ready'?m.label+' · '+room.players.length+' ready. The host may start.':room.status==='running'?m.label+' in progress.':'Battle finished.';
    $('room-roster').replaceChildren();
    room.players.forEach((p,i)=>{
      const row=document.createElement('div');row.className='room-player';row.style.setProperty('--team-color',COLORS[p.team??i]);
      const name=document.createElement('span');name.textContent=p.alias+(p.id===pilotId?' · YOU':'');
      const team=document.createElement('b');team.textContent=p.team!=null?E.teamName(p.team):'P'+(i+1);
      row.append(name,team);$('room-roster').append(row);
    });
    if(room.status==='waiting'||room.status==='ready'){
      clearResults();
      const configs=room.players.map(p=>p.robot);while(configs.length<(m.count||Math.max(2,configs.length)))configs.push({name:'OPEN SLOT '+(configs.length+1),tools:[]});
      state=E.createBattle(configs,room.seed,room.mode||'ffa');state.robots.forEach((r,i)=>r.placeholder=i>=room.players.length);lastEventId=-1;
      setBanner('ROOM '+room.code,room.players.length+' / '+cap+' pilots',room.status==='ready'?'The host can start with this roster.':'Share the code to invite other pilots.');
    }
    $('launch-online').hidden=!(room.host===pilotId&&room.status==='ready');
    $('create-room').disabled=true;$('join-room').disabled=true;$('pilot-name').disabled=true;
    $('online-status').textContent=`Room ${room.code} · ${room.players.length}/${cap} pilots · ${m.label}`;
    $('telemetry-mode').textContent='ONLINE';applyLock();
  }
  function connectRoom(info){
    if(stream)stream.close();roomUI(info);
    stream=new EventSource('/api/rooms/'+room.code+'/events');
    stream.onmessage=ev=>{
      let data;try{data=JSON.parse(ev.data);}catch(_){return;}
      if(data.type==='room'){roomUI(data.room);}
      if(data.type==='closed'){toast('The room was closed.');resetOnline();}
      if(data.type==='state'){
        const fresh=mode!=='online';mode='online';countdown=0;paused=false;state=data.state;roomUI(data.room);
        if(fresh){clearResults();history=[];trails=Array.from({length:E.MAX_BOTS},()=>[]);finishing=false;lastEventId=-1;$('online-dialog').close();enterBattleView();}
        $('seed-label').textContent=state.seed;$('pause').disabled=true;$('speed').disabled=true;$('replay').disabled=true;
        if(state.status==='running'){$('arena-banner').classList.add('hidden');finishing=false;}
        else finish();
      }
    };
    stream.onerror=()=>{$('online-status').textContent='Connection interrupted. Reconnecting to the same room…';};
  }
  function resetOnline(){if(stream)stream.close();stream=null;room=null;mode='idle';paused=false;finishing=false;$('room-info').hidden=true;$('create-room').disabled=!serverAvailable;$('join-room').disabled=!serverAvailable;$('pilot-name').disabled=false;$('room-mode').disabled=false;$('speed').disabled=false;$('telemetry-mode').textContent='LOCAL';$('online-status').textContent='Share a room and pit your robots against each other.';$('start').innerHTML='<span>▷</span> Test battle';newPreview();setBanner('READY FOR BATTLE','Let your robot decide.','No keyboard. No joystick. Just your strategy.');applyLock();leaveBattleView();}
  $('online-open').onclick=()=>{$('server-warning').hidden=serverAvailable;$('create-room').disabled=!serverAvailable||!!room;$('join-room').disabled=!serverAvailable||!!room;$('online-error').textContent='';if(!room){$('room-mode').disabled=false;$('room-mode').value=battleMode;}$('online-dialog').showModal();};
  $('create-room').onclick=async()=>{try{$('online-error').textContent='';$('create-room').disabled=true;await ensurePilot();const d=await api('/api/rooms','POST',{mode:$('room-mode').value});connectRoom(d.room);}catch(err){onlineError(err);}finally{$('create-room').disabled=!!room;}};
  $('join-room').onclick=async()=>{try{$('online-error').textContent='';const code=$('room-code').value.trim().toUpperCase();if(!/^[A-Z2-9]{6}$/.test(code))throw Error('Enter the six-character code.');$('join-room').disabled=true;await ensurePilot();const d=await api('/api/rooms/'+code+'/join','POST',{});connectRoom(d.room);}catch(err){onlineError(err);}finally{$('join-room').disabled=!!room;}};
  $('room-mode').onchange=async()=>{
    if(!room)return;try{$('online-error').textContent='';const d=await api('/api/rooms/'+room.code+'/settings','POST',{mode:$('room-mode').value});roomUI(d.room);}
    catch(err){$('room-mode').value=room.mode||'ffa';onlineError(err);}
  };
  $('launch-online').onclick=async()=>{try{$('launch-online').disabled=true;await api('/api/rooms/'+room.code+'/start','POST',{});}catch(err){onlineError(err);}finally{$('launch-online').disabled=false;}};
  $('leave-room').onclick=async()=>{try{if(room)await api('/api/rooms/'+room.code+'/leave','POST',{});resetOnline();}catch(err){onlineError(err);}};
  $('copy-room').onclick=async()=>{try{await navigator.clipboard.writeText(room.code);toast('Code copied.');}catch(_){toast('Room code: '+room.code);}};
  async function detectServer(){
    if(!/^https?:$/.test(location.protocol))return;
    try{const health=await api('/api/health');if(!['cspire-arena','line-arena'].includes(health.app))return;serverAvailable=true;$('connection-label').textContent='SERVER AVAILABLE';$('connection-dot').style.background='#b9efb0';
      const me=await api('/api/me');if(me.pilot){pilotId=me.pilot.id;$('pilot-name').value=me.pilot.alias;if(me.room)connectRoom(me.room);}
    }catch(_){}
  }
  initRoster();renderCatalog();newPreview();save();syncBuilder();renderRules();if(JSON.stringify(config.rules)!==JSON.stringify(E.defaultRules()))$('preset').value='custom';updateUI();detectServer();requestAnimationFrame(frame);
})();
