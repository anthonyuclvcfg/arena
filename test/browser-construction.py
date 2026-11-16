"""Focused construction-lobby canvas QA. Instrumentation exists only in test HTML."""
import json, os, math
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/staggered-crews-browser';OUT.mkdir(parents=True,exist_ok=True)
SOURCE=Path(os.environ.get('ARENA_HTML',str(ROOT/'cspire-arena.html')))
marker='  initRoster();renderCatalog();newPreview();save();'
source=SOURCE.read_text();assert source.count(marker)==1
hook=r'''
  const qaRAF=requestAnimationFrame;requestAnimationFrame=fn=>fn===frame?0:qaRAF(fn);
  let qaCapture=null,qaWorking=null,qaShellRobot=null,qaBuildingRobot=null,qaCargo=null,qaBadge=null;
  const qaRobot=robotDrawing,qaConstruction=drawConstruction,qaStatus=constructionStatus,qaTask=constructionTask,qaShell=constructionShell,qaDrawTool=drawTool,qaDrone=constructionDrone,qaWork=constructionWork,qaPart=constructionPart,qaLine=line,qaText=ctx.fillText.bind(ctx),qaFill=ctx.fill.bind(ctx),qaGradient=ctx.createLinearGradient.bind(ctx),qaRect=ctx.fillRect.bind(ctx);
  robotDrawing=function(c,r,t,preview){if(qaCapture&&c===ctx)qaCapture.robots.push({kind:'combat',id:r.id,name:r.config.name,x:r.x,y:r.y,angle:r.angle,team:r.team,tools:r.config.tools.length});return qaRobot(c,r,t,preview);};
  drawConstruction=function(c,r,now,...rest){const previous=qaBuildingRobot;qaBuildingRobot=r.id;try{return qaConstruction(c,r,now,...rest);}finally{qaBuildingRobot=previous;}};
  constructionStatus=function(c,r,radius,ready){const previous=qaBadge;qaBadge={robot:r.id,ready};try{return qaStatus(c,r,radius,ready);}finally{qaBadge=previous;}};
  ctx.createLinearGradient=function(...args){const gradient=qaGradient(...args);if(qaCapture&&qaBadge){const sample={...qaBadge,args,stops:[]},add=gradient.addColorStop.bind(gradient);qaCapture.badgeGradients.push(sample);gradient.addColorStop=function(offset,color){sample.stops.push({offset,color});return add(offset,color);};}return gradient;};
  ctx.fillRect=function(x,y,w,h){if(qaCapture&&qaBadge)qaCapture.badgeRects.push({...qaBadge,x,y,w,h,gradient:typeof ctx.fillStyle!=='string'});return qaRect(x,y,w,h);};
  constructionShell=function(c,r,radius,color,variant,...rest){if(qaCapture&&c===ctx)qaCapture.robots.push({kind:'shell',id:r.id,name:r.config.name,x:r.x,y:r.y,angle:r.angle,team:r.team,radius,body:variant.config.body,tools:r.config.tools.length});const previous=qaShellRobot;qaShellRobot=r.id;try{return qaShell(c,r,radius,color,variant,...rest);}finally{qaShellRobot=previous;}};
  drawTool=function(c,tool,time=0,preview=false){if(qaCapture&&c===ctx){const sample={robot:qaBuildingRobot,type:tool.type,x:tool.x,y:tool.y,angle:tool.angle,power:tool.power,time,preview};if(qaShellRobot!==null)qaCapture.catalogTools.push(sample);else if(qaCargo)qaCapture.cargoTools.push({...sample,id:qaCargo.id});else if(qaWorking)qaCapture.heldTools.push({...sample,saw:qaWorking.saw,working:qaWorking.working});}return qaDrawTool(c,tool,time,preview);};
  constructionTask=function(time,worker,model,angle=0,parked=false){const result=qaTask(time,worker,model,angle,parked);if(qaCapture&&qaBuildingRobot!==null)qaCapture.tasks.push({robot:qaBuildingRobot,worker,time,angle,parked,result});return result;};
  constructionDrone=function(c,x,y,t,moving,tilt=0,...rest){if(qaCapture&&c===ctx){const worker=qaCapture.drones.filter(d=>d.robot===qaBuildingRobot).length;qaCapture.drones.push({robot:qaBuildingRobot,worker,x,y,t,moving,tilt,kind:rest[0],baseX:rest[1],baseY:rest[2],loadX:rest[3],loadY:rest[4]});}return qaDrone(c,x,y,t,moving,tilt,...rest);};
  constructionWork=function(c,x,y,fromX,fromY,t,moving,saw,working){const tool={robot:qaBuildingRobot,worker:qaCapture?qaCapture.drones.filter(d=>d.robot===qaBuildingRobot).length-1:null,x,y,fromX,fromY,t,moving,saw,working};if(qaCapture&&c===ctx)qaCapture.work.push(tool);qaWorking=tool;try{return qaWork(c,x,y,fromX,fromY,t,moving,saw,working);}finally{qaWorking=null;}};
  constructionPart=function(c,x,y,part,color,angle=0,...rest){if(qaCapture&&c===ctx)qaCapture.parts.push({robot:qaBuildingRobot,id:part.id,kind:part.kind,type:part.tool?.type,x,y,angle});const previous=qaCargo;qaCargo=part;try{return qaPart(c,x,y,part,color,angle,...rest);}finally{qaCargo=previous;}};
  line=function(c,...args){if(qaCapture&&c===ctx){qaCapture.lines++;if(c.strokeStyle==='#edbd77'||c.strokeStyle==='#f3b667'){qaCapture.sparks++;if(qaWorking)qaCapture.emissions.push({saw:c.strokeStyle==='#f3b667',x:args[0],y:args[1],tool:qaWorking});}}return qaLine(c,...args);};
  ctx.fill=function(...args){if(qaCapture&&qaWorking&&ctx.fillStyle==='#e1faff')qaCapture.flames.push(qaWorking);return qaFill(...args);};
  ctx.fillText=function(text,x,y,...args){if(qaCapture){const metrics=ctx.measureText(text);qaCapture.text.push({text:String(text),x,y,font:ctx.font,align:ctx.textAlign,baseline:ctx.textBaseline,letterSpacing:ctx.letterSpacing,fillStyle:typeof ctx.fillStyle==='string'?ctx.fillStyle:'gradient',bounds:{left:x-metrics.actualBoundingBoxLeft,right:x+metrics.actualBoundingBoxRight,top:y-metrics.actualBoundingBoxAscent,bottom:y+metrics.actualBoundingBoxDescent}});}return qaText(text,x,y,...args);};
  const qaHash=()=>{let h=2166136261;const d=ctx.getImageData(0,0,arena.width,arena.height).data;for(const v of d)h=Math.imul(h^v,16777619);return h>>>0;};
  window.__lqa={
    fixture:(count,gameMode='ffa',occupied=count)=>{clearResults();mode='idle';onlineSlot=0;battleMembers=null;paused=false;countdown=0;finishing=false;leaveBattleView();
      const configs=Array.from({length:count},(_,i)=>E.normalizeConfig({name:'PUBLIC-'+String(i+1).padStart(2,'0'),body:'box',motor:1,armor:1,tools:[],lines:[],rules:[{when:'void',do:'brake'}]}));
      state=E.createBattle(configs,20261115,gameMode);state.lobbyConstruction=true;
      room={g:'fixture-lobby',status:'lobby',mode:gameMode,members:configs.slice(0,occupied).map((c,i)=>({id:'fixture-'+i,n:'Controller '+(i+1),rn:c.name,bot:i>1,ready:false,connected:true}))};
      state.robots.forEach((r,i)=>{r.placeholder=i>=occupied;if(i<occupied)r.construction={ready:false,phase:i*2.3};});
      trails=Array.from({length:E.MAX_BOTS},()=>[]);$('arena-banner').classList.add('hidden');applyLock();updateUI();
      return state.robots.map(r=>({id:r.id,name:r.config.name,x:r.x,y:r.y,angle:r.angle,team:r.team,placeholder:r.placeholder}));},
    models:()=>Array.from({length:8},(_,slot)=>{const m=constructionModel(slot);return{slot,config:JSON.parse(JSON.stringify(m.config)),radius:m.radius,outline:m.outline,crews:JSON.parse(JSON.stringify(m.crews)),initialWheelCount:m.initialWheelCount,cost:E.cost(m.config),budget:E.BUDGET,normalized:JSON.stringify(E.normalizeConfig(m.config))===JSON.stringify(m.config),types:m.config.tools.every(t=>Object.hasOwn(E.WEAPONS,t.type))};}),
    tasks:(slot,times,angle=0,parked=false)=>times.map(time=>({time,workers:[0,1].map(worker=>{const model=constructionModel(slot),task=qaTask(time,worker,model,angle,parked),owner=model.crews.findIndex(crew=>crew.parts.some(part=>part.id===task.part.id)),index=model.crews[owner].parts.findIndex(part=>part.id===task.part.id);return{...task,source:constructionSource(index,owner,model,angle)};})})),
    poses:(slot,times,angle=0,parked=false)=>{const model=constructionModel(slot);return times.map(time=>({time,parts:model.crews.flatMap((crew,owner)=>crew.parts.map((part,index)=>({id:part.id,kind:part.kind,initialMounted:!!part.initialMounted,source:constructionSource(index,owner,model,angle),target:{x:part.targetX,y:part.targetY,angle:part.angle},pose:constructionPose(time,part,model,angle,parked)})))}));},
    privateMutation:()=>{for(const r of state.robots){r.config.body='circle';r.config.tools=[{type:'rocket',x:22,y:0,angle:0,power:3}];r.config.rules=[{when:'always',do:'weapon'}];r.config.lines=[[0,0,30,30]];}},
    benchmark:()=>{for(let i=0;i<5;i++)drawArena(state,3500+i*16);const samples=[];for(let i=0;i<30;i++){const start=performance.now();drawArena(state,3600+i*16);samples.push(performance.now()-start);}samples.sort((a,b)=>a-b);return{samples:30,p50:samples[14],p95:samples[28],max:samples[29],units:'ms'};},
    frames:count=>{let steps=0;const original=E.step,before=JSON.stringify(state);E.step=(...args)=>{steps++;return original(...args);};try{const now=performance.now();for(let i=0;i<count;i++)frame(now+i*17);}finally{E.step=original;}return{steps,unchanged:before===JSON.stringify(state)};},
    rotate:angle=>{state.robots.forEach(r=>r.angle=angle);},
    phase:value=>{state.robots.forEach(r=>{if(r.construction)r.construction.phase=value;});},
    ready:ids=>{state.robots.forEach(r=>{if(r.construction)r.construction.ready=ids.includes(r.id);});room.members.forEach((m,i)=>m.ready=ids.includes(i));updateUI();},
    draw:now=>{const before=JSON.stringify(state);qaCapture={robots:[],catalogTools:[],cargoTools:[],heldTools:[],tasks:[],drones:[],parts:[],work:[],emissions:[],flames:[],text:[],badgeGradients:[],badgeRects:[],lines:0,sparks:0};drawArena(state,now);const calls=qaCapture;qaCapture=null;
      const expectedParts=[];for(const r of state.robots){if(!r.construction||r.placeholder)continue;const model=constructionModel(r.id),co=Math.cos(r.angle),si=Math.sin(r.angle),task=calls.tasks.find(t=>t.robot===r.id);if(!task)continue;model.crews.forEach((crew,owner)=>crew.parts.forEach((part,index)=>{const source=constructionSource(index,owner,model,r.angle),pose=constructionPose(task.time,part,model,r.angle,task.parked),initial=part.initialMounted?{x:part.targetX,y:part.targetY,angle:part.angle}:source;expectedParts.push({robot:r.id,id:part.id,kind:part.kind,x:pose.x*co-pose.y*si,y:pose.x*si+pose.y*co,angle:pose.angle+r.angle,sourceX:source.x*co-source.y*si,sourceY:source.x*si+source.y*co,sourceAngle:source.angle+r.angle,initialX:initial.x*co-initial.y*si,initialY:initial.x*si+initial.y*co,initialAngle:initial.angle+r.angle});}));}
      return{...calls,expectedParts,hash:qaHash(),unchanged:before===JSON.stringify(state)};},
    standalone:()=>{room=null;battleMembers=null;mode='idle';state=E.createPracticeBattle(config,4,20261115);trails=Array.from({length:E.MAX_BOTS},()=>[]);applyLock();updateUI();},
    battle:()=>{room=null;mode='local';paused=true;delete state.lobbyConstruction;state.robots.forEach(r=>{delete r.construction;r.placeholder=false;});enterBattleView();applyLock();updateUI();},
    cards:()=>TAGS.map(tag=>({hidden:$('fighter-'+tag).hidden,name:$('name-'+tag).textContent,seat:$('seat-'+tag).textContent})).filter(c=>!c.hidden),
    telemetry:()=>({active:$('active-tools').textContent,hint:$('tool-telemetry').textContent,rows:$('tool-telemetry').querySelectorAll('.cooldown-row').length,cards:[...$('damage-deck').children].map(c=>({name:c.querySelector('strong')?.textContent,pilot:c.querySelector('small')?.textContent,status:c.querySelector('p')?.textContent,components:c.querySelectorAll('.component-chip').length,tools:c.querySelectorAll('[data-tool-id]').length}))}),
    config:()=>JSON.parse(JSON.stringify(config)),
    winnerFont:()=>getComputedStyle($('arena-banner')).fontFamily,
    state:()=>JSON.parse(JSON.stringify(state)),
    hide:value=>{if(value)Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});else delete document.visibilityState;},
    size:()=>({width:arena.width,height:arena.height,overflow:document.documentElement.scrollWidth>innerWidth})
  };
'''
html=source.replace(marker,hook+marker,1)
checks=[];errors=[];details=[]
def check(name,ok):
 assert ok,name
 checks.append(name)
def setup(browser,motion='no-preference',width=1560,height=1100):
 p=browser.new_page(viewport={'width':width,'height':height},reduced_motion=motion)
 p.on('pageerror',lambda e:errors.append(str(e)))
 p.route('http://arena.test/**',lambda r:r.fulfill(body=html,content_type='text/html'))
 p.goto('http://arena.test/');p.wait_for_function('typeof __lqa==="object"');return p
def texts(draw):return [t['text'] for t in draw['text']]
def close(a,b):return abs(a-b)<1e-6
def same_angle(a,b):return abs(math.atan2(math.sin(a-b),math.cos(a-b)))<1e-6
def same_pose(a,b):return close(a['x'],b['x']) and close(a['y'],b['y']) and same_angle(a['angle'],b['angle'])
def part_map(draw):return {(p['robot'],p['id']):p for p in draw['parts']}
def parts_match(draw):
 actual=part_map(draw)
 return len(actual)==len(draw['parts'])==len(draw['expectedParts']) and all((p['robot'],p['id']) in actual and all(close(actual[(p['robot'],p['id'])][k],p[k]) for k in ['x','y','angle']) for p in draw['expectedParts'])
def at_initial(draw):
 return parts_match(draw) and all(close(p['x'],p['initialX']) and close(p['y'],p['initialY']) and close(p['angle'],p['initialAngle']) for p in draw['expectedParts'])
def grips_match(draw):
 robots={r['id']:r for r in draw['robots']}
 for drone in draw['drones']:
  task=next(t['result'] for t in draw['tasks'] if t['robot']==drone['robot'] and t['worker']==drone['worker'])
  angle=robots[drone['robot']]['angle'];co=math.cos(angle);si=math.sin(angle)
  if not (close(drone['loadX'],task['loadX']*co-task['loadY']*si) and close(drone['loadY'],task['loadX']*si+task['loadY']*co)):return False
 return True
def crane_racks_clear(draw):
 return all(d['baseY']>=max(p['sourceY'] for p in draw['expectedParts'] if p['robot']==d['robot'] and close(p['sourceX'],d['baseX']))+10 for d in draw['drones'] if d['kind']==2)
def clear_of_labels(draw):
 robots={r['id']:r for r in draw['robots']}
 return all(-robots[d['robot']]['radius']-31-1e-8<=d['y']<=robots[d['robot']]['radius']+20+1e-8 for d in draw['drones'])
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True)
 for count,game_mode in [(4,'ffa'),(4,'2v2'),(8,'ffa'),(8,'2v2v2v2')]:
  page=setup(browser);saved=page.evaluate('__lqa.config()')
  poses=page.evaluate('([n,m])=>__lqa.fixture(n,m)',[count,game_mode]);first=page.evaluate('__lqa.draw(3500)')
  label=str(count)+' '+game_mode
  check(label+' draws exactly one construction robot per occupied seat',len(first['robots'])==count and len({r['id'] for r in first['robots']})==count)
  check(label+' construction remains at the authoritative slot/team spawn',all(all(r[k]==poses[i][k] for k in ['id','x','y','angle','team']) for i,r in enumerate(first['robots'])))
  check(label+' each occupied robot displays its real public robot name once',all(texts(first).count((chr(65+r['team'])+' · ' if r['team'] is not None else '')+r['name'])==1 for r in poses))
  check(label+' controller labels remain beneath the robot name in native cards',[c['name'] for c in page.evaluate('__lqa.cards()')]==[r['name'] for r in poses] and [c['seat'] for c in page.evaluate('__lqa.cards()')]==[(chr(65+r['team'])+' · ' if r['team'] is not None else '')+('YOU' if i==0 else 'Controller 2' if i==1 else 'BOT '+str(i+1)) for i,r in enumerate(poses)])
  telemetry=page.evaluate('__lqa.telemetry()')
  check(label+' construction telemetry shows real robot names and separate controllers without fake component data',[c['name'] for c in telemetry['cards']]==[r['name'] for r in poses] and all(c['pilot'] and c['status']=='ASSEMBLING' and c['components']==c['tools']==0 for c in telemetry['cards']))
  check(label+' own active tool count comes from the actual saved build',telemetry['active']==str(len(saved['tools']))+' / '+str(len(saved['tools'])) and telemetry['rows']==0 and 'decorative' in telemetry['hint'])
  check(label+' every construction robot uses an incomplete generic shell instead of the combat blueprint',all(r['kind']=='shell' and r['tools']==0 for r in first['robots']))
  check(label+' every occupied robot has exactly two mechanical crew members',len(first['drones'])==count*2 and all(d['moving'] for d in first['drones']))
  check(label+' all six real spare parts appear exactly once per robot',texts(first).count('ASSEMBLING')==count and 'READY' not in texts(first) and len(first['parts'])==count*6 and parts_match(first))
  check(label+' unfinished status remains plain monospace without a READY band',not first['badgeRects'] and not first['badgeGradients'] and all(t['font']=='8px monospace' for t in first['text'] if t['text']=='ASSEMBLING'))
  check(label+' crews use varied fan drones trirotors and fixed cranes',{d['kind'] for d in first['drones']}=={0,1,2})
  check(label+' workshop tools activate only while a part is mounted',len(first['work'])<=count*2 and all(w['working'] and isinstance(w['saw'],bool) for w in first['work']))
  models=page.evaluate('__lqa.models()')
  check(label+' catalog tools are drawn as real unique parts instead of duplicated on the shell',not first['catalogTools'] and all(t['type'] in [tool['type'] for tool in models[t['robot']]['config']['tools']] for t in first['cargoTools']) and len(first['cargoTools'])==sum(len(m['config']['tools']) for m in models[:count]))
  check(label+' each occupied seat has its own distinct catalog chassis',len({r['body'] for r in first['robots']})==count and [r['body'] for r in first['robots']]==[m['config']['body'] for m in models[:count]])
  effect_samples=[page.evaluate('__lqa.draw(8000)'),page.evaluate('__lqa.draw(26000)')]
  check(label+' moving and mounted pieces retain their identity without a second rack copy',all(len(sample['parts'])==count*6 and parts_match(sample) and grips_match(sample) for sample in [first,*effect_samples]))
  check(label+' fixed crane bases stand below every inventory rack',all(crane_racks_clear(sample) for sample in [first,*effect_samples]))
  check(label+' welding flames appear only on active welding rods',all(not f['saw'] and f['working'] and f['moving'] for sample in effect_samples for f in sample['flames']) and any(sample['flames'] for sample in effect_samples))
  check(label+' sparks match the active tool and stay at its contact tip',all(e['saw']==e['tool']['saw'] and e['tool']['working'] and e['tool']['moving'] and (e['x']-e['tool']['x'])**2+(e['y']-e['tool']['y'])**2<22**2 for sample in effect_samples for e in sample['emissions']) and any(e['saw'] for sample in effect_samples for e in sample['emissions']) and any(not e['saw'] for sample in effect_samples for e in sample['emissions']))
  check(label+' held circular saws also reuse the actual catalog tool',all(t['type']=='saw' and t['saw'] for sample in effect_samples for t in sample['heldTools']) and any(sample['heldTools'] for sample in effect_samples))
  later=page.evaluate('__lqa.draw(3900)')
  check(label+' workers stay inside label-safe vertical bounds throughout travel and work',all(clear_of_labels(sample) for sample in [first,later,*effect_samples]))
  check(label+' visible workers animate without changing simulation state',first['hash']!=later['hash'] and first['unchanged'] and later['unchanged'])
  ready=list(range(0,count,2));page.evaluate('(ids)=>__lqa.ready(ids)',ready)
  mixed=page.evaluate('__lqa.draw(3500)')
  check(label+' READY updates labels while every construction worker continues',texts(mixed).count('READY')==len(ready) and texts(mixed).count('ASSEMBLING')==count-len(ready) and len(mixed['drones'])==count*2 and all(mixed[k]==first[k] for k in ['drones','parts','work','emissions','flames','cargoTools','heldTools']))
  winner_font=page.evaluate('__lqa.winnerFont()').replace('"','').replace("'",'')
  check(label+' READY matches the winner font and centered green typography',all(t['font'].replace('"','').replace("'",'')=='500 14px '+winner_font and t['align']=='center' and t['baseline']=='middle' and t['fillStyle']=='#b9efb0' and close(float(t['letterSpacing'].replace('px','')),-.3) for t in mixed['text'] if t['text']=='READY'))
  check(label+' each READY robot receives one larger band centered on its body',len(mixed['badgeRects'])==len(ready) and {b['robot'] for b in mixed['badgeRects']}==set(ready) and all(b['ready'] and b['gradient'] and b['w']==92 and b['h']==24 and close(b['x']+b['w']/2,poses[b['robot']]['x']) and close(b['y']+b['h']/2,poses[b['robot']]['y']) for b in mixed['badgeRects']))
  check(label+' READY bands fade at both edges with a translucent dark middle',len(mixed['badgeGradients'])==len(ready) and all(g['stops']==[{'offset':0,'color':'#0b131900'},{'offset':.2,'color':'#0b1319d9'},{'offset':.8,'color':'#0b1319d9'},{'offset':1,'color':'#0b131900'}] for g in mixed['badgeGradients']))
  public_names={(chr(65+r['team'])+' · ' if r['team'] is not None else '')+r['name'] for r in poses}
  check(label+' READY bands never cover another public robot name',all(not(b['x']<t['bounds']['right'] and b['x']+b['w']>t['bounds']['left'] and b['y']<t['bounds']['bottom'] and b['y']+b['h']>t['bounds']['top']) for b in mixed['badgeRects'] for t in mixed['text'] if t['text'] in public_names))
  page.evaluate('(n)=>__lqa.ready(Array.from({length:n},(_,i)=>i))',count)
  done=page.evaluate('__lqa.draw(3500)');done_later=page.evaluate('__lqa.draw(4500)')
  check(label+' everyone READY parks workers and restores every part to its initial pose',len(done['robots'])==count and texts(done).count('READY')==count and len(done['drones'])==count*2 and all(not d['moving'] for d in done['drones']) and at_initial(done))
  check(label+' everyone READY remains pixel-stable with no assembly motion',done['hash']==done_later['hash'])
  ready_work=page.evaluate('__lqa.draw(8000)')
  check(label+' everyone READY stops welding cutting and carry effects',not ready_work['work'] and not ready_work['emissions'] and not ready_work['flames'] and at_initial(ready_work))
  if count==8 and game_mode=='ffa':page.locator('#arena').screenshot(path=str(OUT/'8-ffa-all-ready.png'))
  page.evaluate('__lqa.ready([])');resumed=page.evaluate('__lqa.draw(3500)')
  check(label+' unready changes status without resetting the analytic work cycle',resumed['hash']==first['hash'] and len(resumed['drones'])==count*2)
  check(label+' construction never changes saved design or advances simulation',page.evaluate('__lqa.config()')==saved and page.evaluate('__lqa.state().tick')==0 and page.evaluate('__lqa.state().time')==0)
  frame_result=page.evaluate('__lqa.frames(20)')
  check(label+' rendering frames never call engine step or modify the lobby state',frame_result['steps']==0 and frame_result['unchanged'])
  if count==8 and game_mode=='ffa':details.append({'eightRobotDrawCost':page.evaluate('__lqa.benchmark()')})
  check(label+' canvas and native cards fit the viewport',not page.evaluate('__lqa.size().overflow'))
  page.evaluate('(ids)=>__lqa.ready(ids)',ready);page.evaluate('__lqa.draw(8000)')
  page.locator('#arena').screenshot(path=str(OUT/(str(count)+'-'+game_mode+'-ready.png')))
  if count==4 and game_mode=='ffa':
   ready_clip=page.evaluate('''()=>{const b=document.getElementById('arena').getBoundingClientRect(),r=__lqa.state().robots[0],k=b.width/800;return{x:b.x+(r.x-105)*k,y:b.y+(r.y-115)*k,width:210*k,height:225*k};}''')
   page.screenshot(path=str(OUT/'ready-banner-closeup.png'),clip=ready_clip)
   page.evaluate('__lqa.ready([]);__lqa.draw(8000)')
   clip=page.evaluate('''()=>{const b=document.getElementById('arena').getBoundingClientRect(),r=__lqa.state().robots[0],k=b.width/800;return{x:b.x+(r.x-105)*k,y:b.y+(r.y-115)*k,width:210*k,height:225*k};}''')
   page.screenshot(path=str(OUT/'worker-closeup.png'),clip=clip)
   page.evaluate('__lqa.draw(26000)');page.screenshot(path=str(OUT/'worker-swapped-closeup.png'),clip=clip)
   clip=page.evaluate('''()=>{const b=document.getElementById('arena').getBoundingClientRect(),r=__lqa.state().robots[1],k=b.width/800;return{x:b.x+(r.x-105)*k,y:b.y+(r.y-115)*k,width:210*k,height:225*k};}''')
   page.screenshot(path=str(OUT/'crane-rack-closeup.png'),clip=clip)
  details.append({'fixture':label,'poses':poses,'first':first,'mixed':mixed});page.close()
 # Static assembly models are buildable public examples, never copies of private builds.
 page=setup(browser);page.evaluate("__lqa.fixture(8,'ffa')");models=page.evaluate('__lqa.models()')
 check('Assembly palette includes all eight buildable catalog chassis exactly once',sorted(m['config']['body'] for m in models)==sorted(page.evaluate('Object.keys(CSpireArena.BODIES)')))
 check('Every public example obeys normalization budget and real tool constraints',all(m['normalized'] and m['cost']<=m['budget'] and m['types'] and 1<=len(m['config']['tools'])<=2 for m in models))
 check('All assembly outlines and physical radii are bounded and finite',all(0<m['radius']<=30 and len(m['outline'])>=3 and all(len(p)==2 and all(isinstance(v,(float,int)) and abs(v)<=40 for v in p) for p in m['outline']) for m in models))
 public=page.evaluate('__lqa.draw(8000)');saved=page.evaluate('__lqa.config()');page.evaluate('__lqa.privateMutation()');private=page.evaluate('__lqa.draw(8000)')
 check('Changing private body weapons programming and drawing never changes public assembly pixels',public['hash']==private['hash'] and public['cargoTools']==private['cargoTools'] and public['parts']==private['parts'])
 check('The public palette does not modify the saved player blueprint',page.evaluate('__lqa.config()')==saved)
 # Observe the coordinated schedule through two complete periods. Parts remain
 # installed between independent operations; the other worker later removes them.
 check('Every rack has three parts and every robot has six unique parts',all(len(m['crews'])==2 and all(len(c['parts'])==3 for c in m['crews']) and len({p['id'] for c in m['crews'] for p in c['parts']})==6 for m in models))
 check('The public spare-piece palette includes real tools drives and chassis sections',{'tool','wheel','chassis'}<={p['kind'] for m in models for c in m['crews'] for p in c['parts']})
 check('The eight examples vary between zero one and two initially mounted drives',[m['initialWheelCount'] for m in models]==[0,1,2,1,0,2,1,2])
 times=[i*.25 for i in range(577)];timeline_details=[]
 for slot in range(8):
  model=models[slot];parts=[part for crew in model['crews'] for part in crew['parts']]
  timeline=page.evaluate('([slot,times])=>__lqa.tasks(slot,times)',[slot,times]);crew_summary=[]
  pose_timeline=page.evaluate('([slot,times])=>__lqa.poses(slot,times)',[slot,times])
  events={part['id']:[] for part in parts};jobs=[]
  for step in range(6):
   for worker in range(2):
    at=step*12+worker*6;task=timeline[int(at*4)]['workers'][worker];event={'at':at,'worker':worker,'action':task['action'],'id':task['part']['id']}
    events[task['part']['id']].append(event);jobs.append(event)
  label='Seat '+str(slot+1)
  check(label+' assigns every part to two different workers with opposite operations',all(len(ev)==2 and ev[0]['worker']!=ev[1]['worker'] and {e['action'] for e in ev}=={'install','remove'} for ev in events.values()))
  check(label+' staggers the two crews by six seconds without repeated adjacent parts',all(b['at']-a['at']==6 and a['id']!=b['id'] for a,b in zip(jobs,jobs[1:])) and jobs[-1]['id']!=jobs[0]['id'])
  check(label+' leaves at least eighteen seconds between both operations on each part',all(min(ev[1]['at']-ev[0]['at'],72-ev[1]['at']+ev[0]['at'])>=18 for ev in events.values()))
  check(label+' never assigns both active workers to the same piece',all(row['workers'][0]['part']['id']!=row['workers'][1]['part']['id'] for row in timeline))
  check(label+' removes preinstalled drives first and installs other pieces first',all(events[p['id']][0]['action']==('remove' if p['initialMounted'] else 'install') for p in parts))
  initial=page.evaluate('(slot)=>__lqa.poses(slot,[0],0,true)[0]',slot)
  check(label+' parked poses match each initial wheel configuration and original rack',sum(p['kind']=='wheel' and p['pose']['mounted'] for p in initial['parts'])==model['initialWheelCount'] and all(same_pose(p['pose'],p['target'] if p['initialMounted'] else p['source']) for p in initial['parts']))
  held_between=[]
  for part in parts:
   if part['initialMounted']:continue
   ev=events[part['id']];middle=page.evaluate('([slot,time])=>__lqa.poses(slot,[time])[0]',[slot,ev[0]['at']+14])
   p=next(p for p in middle['parts'] if p['id']==part['id'])
   held_between.append(p['pose']['mounted'] and same_pose(p['pose'],p['target']))
  check(label+' leaves installed pieces in place while workers approach other operations',all(held_between) and len(held_between)>=4)
  for worker in range(2):
   samples=[{**s['workers'][worker],'time':s['time']} for s in timeline]
   worker_label=label+' worker '+str(worker+1)
   own_jobs=[j for j in jobs if j['worker']==worker]
   check(worker_label+' never repeats a piece in consecutive jobs including wrap',all(a['id']!=b['id'] for a,b in zip(own_jobs,own_jobs[1:]+own_jobs[:1])))
   check(worker_label+' handles all six pieces across both inventory racks',{p['part']['id'] for p in samples}==set(events) and {p['owner'] for p in samples}=={0,1})
   check(worker_label+' reserves four seconds for carrying and four for work',all(p['working']==((p['action']=='install' and 8<=p['elapsed']<12) or (p['action']=='remove' and 4<=p['elapsed']<8)) and p['carrying']==((p['action']=='install' and 4<=p['elapsed']<8) or (p['action']=='remove' and 8<=p['elapsed']<12)) for p in samples))
   check(worker_label+' welds installation and uses a saw only for removal',all(p['saw']==(p['action']=='remove') for p in samples if p['working']) and {p['action'] for p in samples if p['working']}=={'install','remove'})
   check(worker_label+' holds each piece at the real mount throughout its work',all(p['mounted'] and close(p['x'],p['part']['targetX']) and close(p['y'],p['part']['targetY']) and same_angle(p['partAngle'],p['part']['angle']) for p in samples if p['working']))
   check(worker_label+' carries the same visible piece with its grip',all(close(p['x'],p['loadX']) and close(p['y'],p['loadY']) for p in samples if p['carrying']))
   check(worker_label+' tracks the shared pose of its assigned part throughout the cycle',all(same_pose({'x':task['x'],'y':task['y'],'angle':task['partAngle']},next(p['pose'] for p in row['parts'] if p['id']==task['part']['id'])) for task,row in zip(samples,pose_timeline)))
   check(worker_label+' approaches pickup points empty without moving the piece',all(not p['carrying'] and not p['working'] and close(p['x'],p['part']['targetX'] if p['action']=='remove' else p['source']['x']) and close(p['y'],p['part']['targetY'] if p['action']=='remove' else p['source']['y']) for p in samples if p['elapsed']<4))
   repeated=['partIndex','part','owner','action','x','y','loadX','loadY','partAngle','baseX','baseY','kind','saw','mounted','carrying','working']
   check(worker_label+' repeats the same identities poses and operations after 72 seconds',all(all((close(a[k],b[k]) if isinstance(a[k],(int,float)) else a[k]==b[k]) for k in repeated) for a,b in zip(samples[:289],samples[288:])))
   crew_summary.append({'worker':worker,'parts':sorted({p['part']['id'] for p in samples}),'operationSeconds':12,'workSeconds':4,'carrySeconds':4,'periodSeconds':72})
  check(label+' keeps all part poses continuous during motion',all(math.hypot(a['pose']['x']-b['pose']['x'],a['pose']['y']-b['pose']['y'])<25 and abs(math.atan2(math.sin(a['pose']['angle']-b['pose']['angle']),math.cos(a['pose']['angle']-b['pose']['angle'])))<.5 for before,after in zip(pose_timeline,pose_timeline[1:]) for a,b in zip(before['parts'],after['parts'])))
  boundaries=[v for step in range(13) for v in [step*6-.001,step*6+.001]]
  boundary_tasks=page.evaluate('([slot,times])=>__lqa.tasks(slot,times)',[slot,boundaries]);boundary_poses=page.evaluate('([slot,times])=>__lqa.poses(slot,times)',[slot,boundaries])
  check(label+' hands off operations without teleporting either grip at any phase boundary',all(math.hypot(a['loadX']-b['loadX'],a['loadY']-b['loadY'])<.1 for before,after in zip(boundary_tasks[::2],boundary_tasks[1::2]) for a,b in zip(before['workers'],after['workers'])))
  check(label+' preserves continuous piece poses across handoffs and the loop boundary',all(math.hypot(a['pose']['x']-b['pose']['x'],a['pose']['y']-b['pose']['y'])<.1 and abs(math.atan2(math.sin(a['pose']['angle']-b['pose']['angle']),math.cos(a['pose']['angle']-b['pose']['angle'])))<.01 for before,after in zip(boundary_poses[::2],boundary_poses[1::2]) for a,b in zip(before['parts'],after['parts'])))
  check(label+' restores all six pieces exactly after the full loop',all(same_pose(a['pose'],b['pose']) and a['pose']['mounted']==b['pose']['mounted'] for a,b in zip(pose_timeline[0]['parts'],pose_timeline[288]['parts'])))
  timeline_details.append({'slot':slot,'events':events,'crews':crew_summary})
 scene=page.evaluate('__lqa.draw(3500)');repeat=page.evaluate('__lqa.draw(75500)')
 check('The complete eight-robot construction scene closes its 72-second loop',scene['hash']==repeat['hash'] and scene['parts']==repeat['parts'] and parts_match(scene) and parts_match(repeat))
 page.evaluate('__lqa.phase(0)')
 wrap_before=page.evaluate('__lqa.draw(71999)');wrap_after=page.evaluate('__lqa.draw(72001)')
 before_work=[w for w in wrap_before['work'] if w['worker']==1];after_work=[w for w in wrap_after['work'] if w['worker']==1]
 check('The second crew keeps working through the global loop boundary',len(before_work)==len(after_work)==8 and all(a['robot']==b['robot'] and a['saw']==b['saw'] and close(b['t']-a['t'],.002) and a['working'] and b['working'] for a,b in zip(before_work,after_work)))
 before_sparks=[e for e in wrap_before['emissions'] if e['tool']['worker']==1];after_sparks=[e for e in wrap_after['emissions'] if e['tool']['worker']==1]
 check('Work sparks continue smoothly without resetting at the global loop boundary',len(before_sparks)==len(after_sparks)>0 and all(a['saw']==b['saw'] and math.hypot(a['x']-b['x'],a['y']-b['y'])<.25 for a,b in zip(before_sparks,after_sparks)))
 check('Every visible part remains unique while a job crosses the loop boundary',parts_match(wrap_before) and parts_match(wrap_after) and len(wrap_before['parts'])==len(wrap_after['parts'])==48)
 long_periods=[1,50,1200,8400]
 for baseline in [1234.567,71999.999]:
  base=page.evaluate('(time)=>__lqa.draw(time)',baseline)
  for cycles in long_periods:
   later=page.evaluate('(time)=>__lqa.draw(time)',baseline+cycles*72000)
   check('Pixels and parts repeat after '+str(cycles)+' cycles at phase '+str(baseline)+' ms',base['hash']==later['hash'] and base['parts']==later['parts'] and base['drones']==later['drones'] and base['work']==later['work'] and later['unchanged'])
 details.append({'assemblyModels':models,'timelines':timeline_details});page.close()
 # Regression: diagonal FFA spawn poses must not carry drones across upright name labels.
 page=setup(browser);page.evaluate("__lqa.fixture(8,'ffa')")
 for angle in [i*math.pi/6 for i in range(12)]:
  page.evaluate('(angle)=>__lqa.rotate(angle)',angle)
  samples=[page.evaluate('(time)=>__lqa.draw(time)',time) for time in [500,3500,8000,17000,26000]]
  check('All eight chassis keep drones clear of labels at angle '+str(round(angle,3)),all(clear_of_labels(sample) and sample['unchanged'] for sample in samples))
 page.close()
 # Vacancies are not physical robots or workers while occupied blueprints stay generic.
 page=setup(browser);page.evaluate("__lqa.fixture(4,'ffa',3)");d=page.evaluate('__lqa.draw(3500)')
 check('Vacant slots create no robot drone construction status or public name',len(d['robots'])==3 and len(d['drones'])==6 and 'PUBLIC-04' not in texts(d) and texts(d).count('ASSEMBLING')==3)
 check('Vacant slots also stay out of construction telemetry',len(page.evaluate('__lqa.telemetry().cards'))==3)
 check('Decorative shells contain no real tools programming or custom drawing',page.evaluate('__lqa.state().robots.slice(0,3).every(r=>r.config.tools.length===0&&r.config.lines.length===0&&r.config.rules.every(q=>q.when==="void"))'))
 # The canvas makes no drawing calls when a construction lobby tab is hidden.
 page.evaluate('__lqa.hide(true)');hidden=page.evaluate('__lqa.draw(4500)');page.evaluate('__lqa.hide(false)')
 check('Hidden construction tab skips all canvas work',not hidden['robots'] and not hidden['drones'] and not hidden['parts'] and not hidden['work'] and not hidden['text'] and hidden['lines']==0 and hidden['hash']==d['hash'])
 check('Hidden-tab skip preserves simulation and resumes on visibility',hidden['unchanged'] and len(page.evaluate('__lqa.draw(4500)')['robots'])==3)
 page.evaluate('__lqa.ready([0,1,2])');parked=page.evaluate('__lqa.draw(4500)')
 check('All occupied players READY parks crews even when a vacant seat remains',len(parked['robots'])==3 and len(parked['drones'])==6 and all(not d['moving'] for d in parked['drones']) and at_initial(parked) and not parked['work'])
 page.evaluate('__lqa.standalone()');normal=page.evaluate('__lqa.draw(3500)')
 check('Standalone preview retains ordinary robots without construction decoration',len(normal['robots'])==4 and not normal['drones'] and not normal['parts'] and not normal['work'] and all(r['kind']=='combat' for r in normal['robots']) and not any(t in ['READY','ASSEMBLING'] for t in texts(normal)))
 page.evaluate("__lqa.fixture(4,'ffa');__lqa.battle()");battle=page.evaluate('__lqa.draw(3500)')
 check('Battle transition removes construction decoration and readiness labels',len(battle['robots'])==4 and not battle['drones'] and not battle['parts'] and not battle['work'] and all(r['kind']=='combat' for r in battle['robots']) and not any(t in ['READY','ASSEMBLING'] for t in texts(battle)))
 page.close()
 page=setup(browser,motion='reduce');page.evaluate("__lqa.fixture(8,'2v2v2v2')")
 still=page.evaluate('__lqa.draw(3500)');later=page.evaluate('__lqa.draw(6500)')
 check('Reduced motion preserves a static construction tableau for all eight seats',still['hash']==later['hash'] and len(still['drones'])==16 and all(not d['moving'] for d in still['drones']))
 check('Reduced motion eliminates welding sparks and preserves state',still['sparks']==later['sparks']==0 and not still['flames'] and not later['flames'] and still['unchanged'] and later['unchanged'])
 page.evaluate('__lqa.ready([0,1,2,3])');page.evaluate('__lqa.draw(3500)');page.locator('#arena').screenshot(path=str(OUT/'8-reduced-motion-ready.png'));page.close()
 page=setup(browser,width=390,height=1300);page.evaluate("__lqa.fixture(4,'ffa');__lqa.ready([0,2]);__lqa.draw(8000)")
 check('Phone construction preview remains inside the viewport',not page.evaluate('__lqa.size().overflow'))
 page.screenshot(path=str(OUT/'mobile-ready.png'),full_page=True);page.close();browser.close()
check('No JavaScript errors',not errors)
(OUT/'local-construction-result.json').write_text(json.dumps({'ok':True,'count':len(checks),'checks':checks,'errors':errors,'details':details,'source':str(SOURCE)},indent=2))
print(json.dumps({'ok':True,'count':len(checks),'errors':errors}),flush=True)
