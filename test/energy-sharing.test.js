'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../public/engine');
const passive={motor:1,armor:1,tools:[],rules:[{when:'always',do:'brake'}]};
function fixture(types=['machinegun','machinegun','machinegun','machinegun']){
 const tools=types.map((type,i)=>({type,power:1,x:20,y:(i-(types.length-1)/2)*4,angle:0}));
 const s=E.createBattle([{...passive,tools,rules:[{when:'always',do:'weapon'}]},passive],619);
 s.hazards=[];s.pickups=[];s.walls.forEach(w=>{w.broken=true;w.health=0;});
 const [r,target]=s.robots;Object.assign(r,{x:300,y:400,angle:0,action:'weapon'});Object.assign(target,{x:480,y:400,angle:0,health:1e9});
 r.stats.speed=0;target.stats.speed=0;target.stats.hp=1e9;
 for(const t of r.tools)t.stats.kick=0;
 for(const p of target.parts){p.broken=true;p.health=0;}
 return s;
}
function activated(s,last){return s.projectiles.filter(p=>p.id>last&&p.round===0).map(p=>p.toolId);}

test('Four machine guns start together, then share low energy without favoring the first slot',()=>{
 const s=fixture(),r=s.robots[0],counts=Object.fromEntries(r.tools.map(t=>[t.id,0])),order=[];
 E.step(s);assert.deepEqual(activated(s,0),['t1','t2','t3','t4']);
 for(let i=0;i<3600;i++){
  const last=s.projectileCounter;E.step(s);
  for(const id of activated(s,last)){counts[id]++;order.push(id);}
  assert.ok(r.energy>=0&&r.energy<=100&&Number.isFinite(r.energy));
 }
 const values=Object.values(counts);assert.ok(Math.min(...values)>=12,JSON.stringify(counts));
 assert.ok(Math.max(...values)-Math.min(...values)<=1,JSON.stringify(counts));
 assert.deepEqual(order.slice(-12),Array.from({length:12},(_,i)=>order[order.length-12+(i%4)]));
});

test('Low-energy scheduling saves for an expensive ready weapon rather than letting cheap guns starve it',()=>{
 const s=fixture(['machinegun','machinegun','rocket']),r=s.robots[0];r.energy=0;
 const counts={t1:0,t2:0,t3:0},order=[],rocketTimes=[];
 for(let i=0;i<3600;i++){
  const last=s.projectileCounter;E.step(s);
  for(const id of activated(s,last)){counts[id]++;order.push(id);if(id==='t3')rocketTimes.push(s.time);}
 }
 assert.ok(counts.t3>=5,JSON.stringify(counts));assert.ok(counts.t1>=8&&counts.t2>=8);
 assert.ok(rocketTimes.every((time,i)=>i===0||time-rocketTimes[i-1]<12),'The ready rocket must not starve behind the faster guns');
 assert.ok(Math.max(counts.t1,counts.t2)-Math.min(counts.t1,counts.t2)<=1,JSON.stringify(counts));
 assert.deepEqual(order.slice(0,3),['t1','t2','t3']);
});

test('A ready expensive priority tool reserves regeneration even when cheaper guns could fire',()=>{
 const s=fixture(['machinegun','machinegun','rocket']),r=s.robots[0];r.energyCursor=2;r.energy=20;
 const before=JSON.stringify(s);assert.equal(E.collectAttacks(s,r).length,0);assert.equal(JSON.stringify(s),before);
 r.energy=r.tools[2].stats.energy;const attacks=E.collectAttacks(s,r);
 assert.deepEqual(attacks.map(a=>a.tool.id),['t3']);E.resolveAttacks(s,attacks);assert.equal(r.energyCursor,0);assert.equal(r.energy,0);
});

test('Energy below every eligible cost returns without changing state or inspecting collision geometry',()=>{
 const s=fixture(),r=s.robots[0];r.energy=.1;r.energyCursor=2;
 const before=JSON.stringify(s),walls=s.walls;
 Object.defineProperty(s,'walls',{get(){throw Error('An empty battery must not query collision geometry');},configurable:true});
 assert.deepEqual(E.collectAttacks(s,r),[]);Object.defineProperty(s,'walls',{value:walls,writable:true,enumerable:true,configurable:true});
 assert.equal(JSON.stringify(s),before);
});

test('An unaffordable tool without contact never reserves energy or prevents a valid later shot',()=>{
 const s=fixture(['rocket','machinegun']),r=s.robots[0];r.tools[0].angle=180;r.energy=r.tools[1].stats.energy;
 const attacks=E.collectAttacks(s,r);assert.deepEqual(attacks.map(a=>a.tool.id),['t2']);
 assert.equal(r.energyCursor,0,'Collecting intents must not change priority');
 E.resolveAttacks(s,attacks);assert.equal(r.energy,0);assert.equal(r.energyCursor,0);
});

test('Unavailable or disabled priority slots do not block the next eligible tool',()=>{
 for(const reason of ['broken','cooldown','contact','flame','rule']){
  const s=fixture(['machinegun','machinegun']),r=s.robots[0],t=r.tools[0];r.energy=100;
  if(reason==='broken')t.broken=true;
  if(reason==='cooldown')t.cooldown=1;
  if(reason==='contact')t.contactTime=1;
  if(reason==='flame')s.flames=[{owner:r.id,toolId:t.id}];
  if(reason==='rule')r.action='tool2';
  assert.deepEqual(E.collectAttacks(s,r).map(a=>a.tool.id),['t2'],reason);
 }
});

test('A specific tool rule takes precedence over the shared rotation',()=>{
 const s=fixture(),r=s.robots[0];r.energyCursor=3;r.action='tool2';
 const attacks=E.collectAttacks(s,r);assert.deepEqual(attacks.map(a=>a.tool.id),['t2']);
 E.resolveAttacks(s,attacks);assert.equal(r.energyCursor,2);assert.ok(r.tools[1].cooldown>0);
 assert.ok(r.tools.filter(t=>t.id!=='t2').every(t=>t.cooldown===0));
});

test('Collected tools join shared activation rotation and a broken bonus replacement keeps working',()=>{
 const s=fixture(['machinegun']),r=s.robots[0];r.tools.push({...r.tools[0],id:'bonus1',bonus:true});
 r.energyCursor=1;r.energy=r.tools[1].stats.energy;
 let attacks=E.collectAttacks(s,r);assert.deepEqual(attacks.map(a=>a.tool.id),['bonus1']);E.resolveAttacks(s,attacks);
 r.tools[1]={...r.tools[1],type:'rocket',stats:E.toolStats({type:'rocket',power:1}),cooldown:0};
 r.energyCursor=1;r.energy=r.tools[1].stats.energy;r.action='bonus';
 attacks=E.collectAttacks(s,r);assert.deepEqual(attacks.map(a=>a.tool.id),['bonus1']);E.resolveAttacks(s,attacks);
 assert.equal(r.energyCursor,0);assert.equal(r.energy,0);
});

test('The next-slot priority advances only on actual activation and never consumes an extra stream cost',()=>{
 const s=fixture(),r=s.robots[0];r.energy=0;r.energyCursor=2;
 assert.equal(E.collectAttacks(s,r).length,0);assert.equal(r.energyCursor,2);
 r.energy=r.tools[2].stats.energy;const attacks=E.collectAttacks(s,r);
 assert.equal(r.energyCursor,2);assert.deepEqual(attacks.map(a=>a.tool.id),['t3']);
 E.resolveAttacks(s,attacks);assert.equal(r.energyCursor,3);assert.equal(r.energy,0);
 for(let i=0;i<70;i++){s.time+=E.STEP;E.stepProjectiles(s,E.STEP);}
 assert.equal(r.energyCursor,3);assert.equal(r.energy,0);assert.equal(s.projectileCounter,12);
});

test('Low-energy firing order resumes exactly from a JSON checkpoint with a nonzero cursor',()=>{
 const s=fixture();s.robots[0].energy=0;
 while(s.robots[0].energyCursor!==2&&s.tick<600)E.step(s);
 assert.equal(s.robots[0].energyCursor,2);const restored=JSON.parse(JSON.stringify(s));
 for(let i=0;i<1800;i++){E.step(s);E.step(restored);}
 assert.deepEqual(restored,s);
});

test('Checkpoints without a cursor safely start from the first eligible slot',()=>{
 const s=fixture(),r=s.robots[0];delete r.energyCursor;r.energy=r.tools[0].stats.energy;
 const attacks=E.collectAttacks(s,r);assert.deepEqual(attacks.map(a=>a.tool.id),['t1']);E.resolveAttacks(s,attacks);
 assert.equal(r.energyCursor,1);assert.ok(Number.isInteger(r.energyCursor));
});
