'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../public/engine');
const passive={tools:[],rules:[{when:'always',do:'brake'}]};
const blank=(n=2,config=passive)=>{const s=E.createBattle([config,...Array(n-1).fill(passive)],913);s.hazards=[];s.pickups=[];return s;};
const trap=(type='fire',x=200,y=400)=>({id:0,type,x,y,r:24,period:10,duty:.5,phase:0});
function timeout(s){s.time=E.MAX_SECONDS;E.finishIfNeeded(s);return s.result;}

test('Battle length is 120 seconds; supplies spawn at 0, 30, 60 and 90',()=>{
 assert.equal(E.MAX_SECONDS,120);
 for(const n of [2,3,4]){const s=E.createBattle(Array(n).fill(passive),113);
  assert.deepEqual([...new Set(s.pickups.map(p=>p.spawnAt))],[0,30,60,90]);assert.ok(s.pickups.every(p=>p.expiresAt<=120));}
});
test('Every pulsed trap is ignored when off, including its visual warning',()=>{
 for(const type of ['fire','spikes','electric']){const s=blank();s.hazards=[trap(type)];
  for(const time of [5,7,9.5]){s.time=time;assert.equal(E.hazardActive(s.hazards[0],time),false);
   assert.equal(E.sensors(s,s.robots[0],s.robots[1]).hazard,false);assert.equal(E.nearestHazard(s,s.robots[0]).hazard,null);}
  assert.equal(E.hazardWarning(s.hazards[0],9.5),true);
  s.time=1;assert.equal(E.sensors(s,s.robots[0],s.robots[1]).hazard,true);
 }
});
test('Inactive closer trap cannot mask a farther active trap',()=>{
 const s=blank();s.time=6;s.hazards=[trap('fire',195,400),{...trap('electric',240,400),id:1,phase:5}];
 assert.equal(E.nearestHazard(s,s.robots[0]).hazard.id,1);assert.equal(E.sensors(s,s.robots[0],s.robots[1]).hazard,true);
});
test('Permanent grinder and acid hazards remain detectable',()=>{
 for(const type of ['grinder','acid']){const s=blank();s.hazards=[{...trap(type),period:0}];
  for(const t of [0,6,19]){s.time=t;assert.equal(E.sensors(s,s.robots[0],s.robots[1]).hazard,true);}}
});
test('Hazard rules fall through and switch immediately at both activation edges',()=>{
 const s=blank(2,{...passive,rules:[{when:'hazard',do:'avoid'},{when:'always',do:'brake'}]});
 s.hazards=[trap()];s.time=4.97;E.step(s);assert.equal(s.robots[0].action,'avoid');
 // Neither next tick is the ordinary 0.1-second decision tick.
 E.step(s);assert.equal(s.robots[0].action,'brake');assert.equal(s.robots[0].ruleIndex,1);
 s.time=9.99;E.step(s);assert.equal(s.robots[0].action,'avoid');assert.equal(s.robots[0].ruleIndex,0);
});
test('Unconditional avoidance also falls through if every trap is inactive',()=>{
 const s=blank(2,{...passive,rules:[{when:'always',do:'avoid'},{when:'always',do:'brake'}]});
 s.time=6;s.hazards=[trap()];E.step(s);assert.equal(s.robots[0].action,'brake');
});
test('Inactive traps do not inflict damage or drain energy',()=>{
 for(const type of ['fire','spikes','electric']){const s=blank();s.time=6;s.hazards=[trap(type,190,400)];const r=s.robots[0];
  E.applyHazards(s,r,1);assert.equal(r.health,250);assert.equal(r.energy,100);assert.ok(r.parts.every(p=>p.health===p.maxHealth));}
});
test('Highest surviving exact HP wins a timed match, not an automatic draw',()=>{
 const s=blank(4);[117.3,122.7,98,43].forEach((hp,i)=>s.robots[i].health=hp);const result=timeout(s);
 assert.equal(s.status,'finished');assert.equal(result.winner,1);assert.equal(result.draw,false);assert.equal(result.trigger,'time');
 assert.deepEqual(result.standings.map(r=>r.id),[1,0,2,3]);assert.deepEqual(result.standings.map(r=>r.rank),[1,2,3,4]);
});
test('HP differences smaller than the visible rounded number do not draw',()=>{
 for(const difference of [.01,.000001,1e-12]){const s=blank();s.robots[0].health=100;s.robots[1].health=100+difference;
  const r=timeout(s);assert.equal(r.draw,false);assert.equal(r.winner,1);}
});
test('Exact first-place ties share the winning rank; lower ties do not make a draw',()=>{
 const s=blank(4);[100,100,40,40].forEach((h,i)=>s.robots[i].health=h);let r=timeout(s);
 assert.equal(r.draw,true);assert.equal(r.winner,null);assert.deepEqual(r.winners,[0,1]);assert.deepEqual(r.standings.map(x=>x.rank),[1,1,3,3]);
 const t=blank(4);[200,100,100,20].forEach((h,i)=>t.robots[i].health=h);r=timeout(t);
 assert.equal(r.draw,false);assert.equal(r.winner,0);assert.deepEqual(r.standings.map(x=>x.rank),[1,2,2,4]);
});
test('All four equal survivors can share first place',()=>{
 const s=blank(4),r=timeout(s);assert.equal(r.draw,true);assert.deepEqual(r.winners,[0,1,2,3]);
 assert.ok(r.standings.every(x=>x.rank===1&&x.winner&&x.tied));
});
test('Ring-outs cannot outrank surviving robots even with more remaining HP',()=>{
 const s=blank(4);s.robots[0].health=2;s.robots[1].health=3;
 for(const [i,time]of [[2,10],[3,20]])Object.assign(s.robots[i],{alive:false,reason:'Out of the arena',eliminatedAt:time,health:250});
 const r=timeout(s);assert.equal(r.winner,1);assert.deepEqual(r.standings.map(x=>x.id),[1,0,3,2]);
});
test('Victory before time includes every contestant and precise elimination time',()=>{
 const s=blank(4);s.time=12;for(const i of [1,2,3])s.robots[i].health=0;E.step(s);
 assert.equal(s.status,'finished');assert.equal(s.result.winner,0);assert.equal(s.result.trigger,'survivor');assert.equal(s.result.standings.length,4);
 assert.ok(s.result.standings.filter(x=>!x.alive).every(x=>x.survived===s.time));
});
test('Simultaneous final elimination ties only on exactly equal HP',()=>{
 const s=blank();Object.assign(s.robots[0],{alive:false,eliminatedAt:8,health:20});Object.assign(s.robots[1],{alive:false,eliminatedAt:8,health:21});s.time=8;
 E.finishIfNeeded(s);assert.equal(s.result.draw,false);assert.equal(s.result.winner,1);
 const t=blank();t.time=8;t.robots.forEach(r=>Object.assign(r,{alive:false,health:0,eliminatedAt:8}));E.finishIfNeeded(t);
 assert.equal(t.result.draw,true);assert.deepEqual(t.result.winners,[0,1]);
});
test('The clock stops exactly at 120 seconds and no later tick changes result or health',()=>{
 const s=blank();s.time=119.995;E.step(s);assert.equal(s.time,120);assert.equal(s.status,'finished');
 const before=JSON.stringify(s);for(let i=0;i<80;i++)E.step(s);assert.equal(JSON.stringify(s),before);
});
test('Timed results are identical after serializing a live match',()=>{
 const s=blank(4);s.time=119.98;s.robots[1].health=180.001;const copy=JSON.parse(JSON.stringify(s));
 for(let i=0;i<3;i++){E.step(s);E.step(copy);}assert.deepEqual(s.result,copy.result);
});
