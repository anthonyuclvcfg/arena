'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../public/engine');
const passive={body:'box',motor:1,armor:1,tools:[],rules:[{when:'always',do:'brake'}]};
const close=(a,b,message='')=>assert.ok(Math.abs(a-b)<1e-7,`${message}: ${a} vs ${b}`);
function fixture(type='grinder',extra={}){
 const s=E.createBattle([{...passive,tools:[{type:'ram',x:25,y:0,angle:0}]},passive],47);
 s.hazards=[{id:0,type,x:400,y:400,r:36,phase:0,...extra}];s.pickups=[];
 Object.assign(s.robots[0],{x:400,y:400,angle:0});return s;
}
function exposure(s,seconds,dt=E.STEP){
 let elapsed=0;while(elapsed<seconds-1e-9){const slice=Math.min(dt,seconds-elapsed);E.applyHazards(s,s.robots[0],slice);s.time+=slice;elapsed+=slice;}
}

test('Grinders alternate exactly two seconds cutting and three seconds cooling',()=>{
 assert.equal(E.HAZARDS.grinder.period,5);assert.equal(E.HAZARDS.grinder.duty,.4);
 const h=fixture().hazards[0];
 for(const time of [0,1,1.999,5,6.999,10])assert.equal(E.hazardActive(h,time),true,String(time));
 for(const time of [2,3,4.999,7,9.999])assert.equal(E.hazardActive(h,time),false,String(time));
 assert.equal(E.hazardWarning(h,4),false);assert.equal(E.hazardWarning(h,4.5),true);
 let generated=0;
 for(let seed=1;seed<=60;seed++)for(const count of [2,4,8]){
  const field=E.createField(seed,count);
  for(const g of field.hazards.filter(h=>h.type==='grinder')){generated++;assert.equal(g.period,5);assert.equal(g.duty,.4);}
 }
 assert.ok(generated>60);
});

for(const type of Object.keys(E.HAZARDS))test(type+': chassis and contacted components lose only the current tick damage',()=>{
 const s=fixture(type),r=s.robots[0],d=E.HAZARDS[type];
 for(let tick=0;tick<12;tick++){
  const hp=r.health,parts=[...r.tools,...r.parts].map(p=>p.health);
  E.applyHazards(s,r,E.STEP);s.time+=E.STEP;close(hp-r.health,d.damage*E.STEP);
  [...r.tools,...r.parts].forEach((p,i)=>close(parts[i]-p.health,d.partDamage*E.STEP));
 }
});

test('Every trap stops damage on leaving contact, then resumes only one tick on reentry',()=>{
 for(const type of Object.keys(E.HAZARDS)){
  const s=fixture(type),r=s.robots[0],d=E.HAZARDS[type];exposure(s,.1);r.x=650;
  const hp=r.health,parts=[...r.tools,...r.parts].map(p=>p.health);exposure(s,.2);
  assert.equal(r.health,hp);assert.deepEqual([...r.tools,...r.parts].map(p=>p.health),parts);
  r.x=400;E.applyHazards(s,r,E.STEP);close(hp-r.health,d.damage*E.STEP);
 }
});

test('Inactive traps, including warning windows, change no HP, components, velocity or energy',()=>{
 for(const type of ['fire','grinder','spikes','electric']){
  const s=fixture(type),r=s.robots[0],d=E.HAZARDS[type];Object.assign(r,{vx:80,vy:-60});
  for(const time of [d.period*d.duty+.1,d.period-.4]){
   s.time=time;const before=JSON.stringify(r);E.applyHazards(s,r,.1);assert.equal(JSON.stringify(r),before,type);
  }
 }
});

test('Grinder cooldown does not accrue deferred HP or component damage',()=>{
 const s=fixture(),r=s.robots[0];s.time=2;
 const hp=r.health,parts=[...r.tools,...r.parts].map(p=>p.health);exposure(s,3);
 close(r.health,hp);parts.forEach((hp,i)=>close([...r.tools,...r.parts][i].health,hp));
 E.applyHazards(s,r,E.STEP);close(hp-r.health,E.HAZARDS.grinder.damage*E.STEP);
 parts.forEach((hp,i)=>close(hp-[...r.tools,...r.parts][i].health,E.HAZARDS.grinder.partDamage*E.STEP));
});

test('Partial pulse-edge exposure is exact and independent of the chosen dt',()=>{
 for(const type of ['fire','grinder','spikes','electric']){
  const d=E.HAZARDS[type],a=fixture(type),b=fixture(type);a.time=b.time=d.period*d.duty-.04;
  exposure(a,.1,.1);exposure(b,.1,.01);close(a.robots[0].health,b.robots[0].health);close(300-a.robots[0].health,d.damage*.04);
  a.robots[0].parts.forEach((p,i)=>close(p.health,b.robots[0].parts[i].health));
  const c=fixture(type);c.time=d.period-.04;exposure(c,.1,.1);close(300-c.robots[0].health,d.damage*.06);
 }
});

test('Main simulation integrates the elapsed contact interval rather than a whole pulse-edge tick',()=>{
 const s=fixture(),r=s.robots[0];s.time=1.995;
 E.step(s);close(300-r.health,58*.005);assert.equal(E.hazardActive(s.hazards[0],s.time),false);
 const hp=r.health;E.step(s);assert.equal(r.health,hp);
});

test('Exposed mounted parts can touch a trap without phantom chassis damage',()=>{
 for(const type of Object.keys(E.HAZARDS)){
  const s=fixture(type),r=s.robots[0],tool=r.tools[0],pos=E.componentPosition(r,tool);
  Object.assign(s.hazards[0],{x:pos.x+2,y:pos.y,r:3});const hp=tool.health;
  E.applyHazards(s,r,E.STEP);assert.equal(r.health,300);close(hp-tool.health,E.HAZARDS[type].partDamage*E.STEP);
 }
});

test('Hazards cannot damage eliminated robots, uncontacted parts or robots above their height',()=>{
 for(const type of Object.keys(E.HAZARDS))for(const cause of ['airborne','dead','outside']){
  const s=fixture(type),r=s.robots[0];if(cause==='airborne')r.z=E.HAZARDS[type].height+1;if(cause==='dead')r.alive=false;if(cause==='outside')r.y=650;
  const before=JSON.stringify(r);E.applyHazards(s,r,.1);assert.equal(JSON.stringify(r),before,type+' '+cause);
 }
 const s=fixture('acid'),r=s.robots[0];s.hazards[0].r=.1;E.applyHazards(s,r,E.STEP);
 assert.ok(r.health<300);assert.ok([...r.parts,...r.tools].every(p=>p.health===p.maxHealth));
});

test('Grinder activation and cooldown immediately update sensing and prioritized avoidance',()=>{
 const s=fixture(),r=s.robots[0];r.config.rules=[{when:'hazard',do:'avoid'},{when:'always',do:'brake'}];s.time=1.97;
 E.step(s);assert.equal(r.action,'avoid');E.step(s);assert.equal(r.action,'brake');assert.equal(E.sensors(s,r,s.robots[1]).hazard,false);
 s.time=4.99;E.step(s);assert.equal(r.action,'avoid');assert.equal(E.sensors(s,r,s.robots[1]).hazard,true);
});

test('VOID preserves its action and slot during normalization, supported import envelopes and checkpoint replay',()=>{
 const rules=[{when:'void',do:'weapon'},{when:'always',do:'push'},{when:'void',do:'retreat'}];
 const raw={...passive,rules};assert.equal(E.CONDITIONS.void,'VOID · Skip this rule');assert.deepEqual(E.normalizeConfig(raw).rules,rules);
 for(const format of ['line-arena-robot','cspire-arena-robot']){
  const payload=JSON.parse(JSON.stringify({format,version:2,robot:raw}));assert.deepEqual(E.normalizeConfig(payload.robot).rules,rules);
 }
 const a=E.createBattle([raw,passive],38);a.hazards=[];a.pickups=[];E.step(a);assert.equal(a.robots[0].action,'push');assert.equal(a.robots[0].ruleIndex,1);
 const b=JSON.parse(JSON.stringify(a));for(let i=0;i<240;i++){E.step(a);E.step(b);}assert.deepEqual(a,b);
 assert.deepEqual(a.robots[0].config.rules,rules);
});

test('Eight or twelve VOID slots brake without firing; the twelve-rule limit remains unchanged',()=>{
 assert.equal(E.MAX_RULES,12);assert.equal(E.defaultRules().length,8);
 for(const count of [8,12,30]){
  const c=E.normalizeConfig({tools:[{type:'machinegun'}],rules:Array.from({length:count},()=>({when:'void',do:'weapon'}))});
  assert.equal(c.rules.length,Math.min(count,12));assert.ok(c.rules.every(r=>r.when==='void'));
  const s=E.createBattle([c,passive],39);s.hazards=[];s.pickups=[];
  for(let i=0;i<120;i++)E.step(s);
  assert.equal(s.robots[0].ruleIndex,-1);assert.equal(s.robots[0].action,'brake');assert.equal(s.projectileCounter,0);assert.equal(s.robots[0].energy,100);
 }
});

test('VOID skips every action, while lower rules retain their original priority',()=>{
 for(const action of Object.keys(E.ACTIONS)){
  const s=E.createBattle([{...passive,rules:[{when:'void',do:action},{when:'always',do:'center'},{when:'always',do:'retreat'}]},passive],40);
  s.hazards=[];s.pickups=[];assert.equal(E.sensors(s,s.robots[0],s.robots[1]).void,false);E.step(s);
  assert.equal(s.robots[0].action,'center');assert.equal(s.robots[0].ruleIndex,1);
 }
});

test('Walls now have 150 HP without changing weapon wall damage, collision cap or simulation clock',()=>{
 const s=E.createBattle([passive,passive],41);assert.equal(E.WALL_HP,150);assert.ok(s.walls.every(w=>w.health===150&&w.maxHealth===150));
 assert.deepEqual(Object.fromEntries(Object.entries(E.WEAPONS).map(([type,w])=>[type,w.wallDamage])),{ram:34,flipper:8,plow:12,hammer:46,saw:7,drill:26,flamethrower:8.5,machinegun:7.5,rocket:58});
 assert.equal(E.MAX_IMPACT_DAMAGE,72);assert.equal(E.START_COUNTDOWN_SECONDS,5);assert.equal(s.tick,0);E.step(s);assert.equal(s.tick,1);close(s.time,E.STEP);
});
