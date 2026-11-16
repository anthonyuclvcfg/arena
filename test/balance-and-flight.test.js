'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../public/engine');
const passive={tools:[],rules:[{when:'always',do:'brake'}]};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} vs ${b}`);
function fixture(type='rocket',power=1){
 const s=E.createBattle([{tools:[{type,power,x:20,y:0,angle:0}],rules:[{when:'always',do:'weapon'}]},passive],54);
 s.hazards=[];s.pickups=[];
 Object.assign(s.robots[0],{x:200,y:300,angle:0,action:'weapon'});
 Object.assign(s.robots[1],{x:400,y:300,angle:0});
 for(const r of s.robots){r.stats.acceleration=0;r.stats.speed=0;}
 s.robots[1].parts.forEach(p=>{p.health=0;p.broken=true});
 E.resolveAttacks(s,E.collectAttacks(s,s.robots[0]));assert.ok(s.projectiles.length);
 return s;
}
function settle(s){for(let i=0;i<300&&s.status==='running';i++)E.step(s);assert.equal(s.status,'finished');}

test('Requested balance: 120 seconds, 300 chassis HP, 150 wall HP, unchanged 200-point budget',()=>{
 assert.equal(E.MAX_SECONDS,120);assert.equal(E.CHASSIS_HP,300);assert.equal(E.WALL_HP,150);assert.equal(E.BUDGET,200);
 for(const body of Object.keys(E.BODIES))for(const armor of [1,3,5]){
  const s=E.createMatch({body,armor},passive);assert.equal(s.robots[0].health,300);assert.ok(s.walls.every(w=>w.health===150));
 }
});
test('Flamethrower streams last 1.6, 1.8 and 2.0 seconds with lower total damage and unchanged cooldown',()=>{
 const a=[1,2,3].map(power=>E.toolStats({type:'flamethrower',power}));
 assert.deepEqual(a.map(t=>t.duration),[1.6,1.8,2]);assert.deepEqual(a.map(t=>t.damage),[22,33,44]);
 assert.deepEqual(a.map(t=>t.cooldown),[3.2,4.48,5.76]);assert.deepEqual(a.map(t=>t.reach),[135,168.75,202.5]);
});
test('Twelve-round machine-gun activation spans 1.1 seconds and conserves total damage at every power',()=>{
 for(const power of [1,2,3]){const s=fixture('machinegun',power),t=s.robots[0].tools[0];
  assert.equal(s.projectiles.length,12);assert.equal(s.projectiles.at(-1).delay,1.1);
  close(s.projectiles.reduce((a,p)=>a+p.stats.damage,0),t.stats.damage);
  close(s.projectiles.reduce((a,p)=>a+p.stats.wallDamage,0),t.stats.wallDamage);
  assert.ok(t.cooldown>s.projectiles.at(-1).delay);
 }
});
test('Missed bullets and rockets leave the whole visible apron before bounded cleanup',()=>{
 for(const type of ['machinegun','rocket'])for(const power of [1,2,3]){
  const s=fixture(type,power),p=s.projectiles[0];s.projectiles=[p];
  s.walls.forEach(w=>{w.broken=true;w.health=0});s.robots[1].y=600;
  p.x=720;p.y=300;const start=p.x;
  E.stepProjectiles(s,E.STEP);assert.equal(s.projectiles.length,1);
  for(let i=0;i<300&&s.projectiles.length;i++)E.stepProjectiles(s,E.STEP);
  assert.equal(s.projectiles.length,0);assert.ok(p.x>E.PROJECTILE_BOUNDS.max);close(p.x-start,p.travel);
 }
});
test('Changing orders or destroying the shooter cannot delete an airborne bullet or rocket',()=>{
 for(const type of ['machinegun','rocket']){const s=fixture(type),p=s.projectiles[0],r=s.robots[0];
  r.action='brake';r.alive=false;r.health=0;r.eliminatedAt=0;r.tools[0].broken=true;
  E.stepProjectiles(s,E.STEP);assert.ok(s.projectiles.some(x=>x.id===p.id));assert.equal(s.projectiles.length,1);
  for(let i=0;i<120;i++)E.stepProjectiles(s,E.STEP);
  assert.equal(s.projectiles.length,0);assert.ok(s.robots[1].health<300);
 }
});
test('Last-survivor finish waits for launched shots, then includes their real damage',()=>{
 const s=fixture();Object.assign(s.robots[0],{alive:false,health:0,eliminatedAt:2,reason:'Robot destroyed'});s.time=2;
 E.finishIfNeeded(s);assert.equal(s.status,'running');assert.ok(s.pendingResult);assert.equal(s.result,null);
 settle(s);close(s.robots[1].health,300-48*1.2);assert.equal(s.result.standings[0].health,s.robots[1].health);
 assert.equal(s.result.winner,1);assert.equal(s.projectiles.length,0);assert.equal(s.time,2);
});
test('Shots fired before the timeout can decide the winner; clock stays at 120 with no new firing',()=>{
 const s=fixture();s.robots[0].health=70;s.robots[1].health=80;s.time=120;
 const count=s.projectileCounter,energy=s.robots[0].energy;
 E.finishIfNeeded(s);assert.equal(s.status,'running');settle(s);
 assert.equal(s.time,120);assert.equal(s.result.elapsed,120);assert.equal(s.result.winner,0);
 assert.equal(s.projectileCounter,count);assert.equal(s.robots[0].energy,energy);assert.ok(s.settleElapsed>0);
 assert.equal(s.projectiles.length,0);assert.equal(s.flames.length,0);
 const final=JSON.stringify(s);E.step(s);assert.equal(JSON.stringify(s),final);
});
test('End signal cancels only unlaunched queued rounds, not the first launched bullet',()=>{
 const s=fixture('machinegun');s.time=120;const p=s.projectiles[0];E.finishIfNeeded(s);
 assert.equal(s.projectiles.length,1);assert.equal(s.projectiles[0].id,p.id);settle(s);
 close(s.robots[1].health,300-1.25*.8);assert.equal(s.projectileCounter,12);
});
test('Settling projectile impacts stop at intact walls and apply exact wall damage once',()=>{
 for(const type of ['rocket','machinegun']){const s=fixture(type),p=s.projectiles[0];s.projectiles=[p];
  p.x=680;p.y=373;s.robots[1].y=600;s.time=120;
  const initial=s.walls.reduce((sum,w)=>sum+w.health,0);E.finishIfNeeded(s);settle(s);
  close(initial-s.walls.reduce((sum,w)=>sum+w.health,0),p.stats.wallDamage);assert.equal(s.projectiles.length,0);
 }
});
test('A settled rocket can eliminate the final robot without locking the game or losing standings',()=>{
 const s=fixture();s.time=5;s.robots[0].alive=false;s.robots[0].health=0;s.robots[0].eliminatedAt=4;s.robots[1].health=1;
 E.finishIfNeeded(s);settle(s);assert.ok(s.robots.every(r=>!r.alive));assert.equal(s.result.standings.length,2);
 assert.equal(s.projectiles.length,0);assert.equal(s.result.trigger,'elimination');
});
test('Pending-flight resolution stays deterministic across server/client JSON snapshots',()=>{
 const a=fixture('rocket',3);a.time=120;E.finishIfNeeded(a);E.step(a);const b=JSON.parse(JSON.stringify(a));
 settle(a);settle(b);assert.deepEqual(a,b);
});
