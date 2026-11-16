'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../public/engine');
const passive={tools:[],rules:[{when:'always',do:'brake'}]};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} vs ${b}`);
function fixture(type,power=1){
 const s=E.createBattle([{tools:[{type,power,x:20,y:0}],rules:[{when:'always',do:'weapon'}]},passive],19);
 s.hazards=[];s.pickups=[];Object.assign(s.robots[0],{x:150,y:300,angle:0,action:'weapon'});Object.assign(s.robots[1],{x:350,y:300});
 s.robots[1].parts.forEach(p=>{p.health=0;p.broken=true});
 const attacks=E.collectAttacks(s,s.robots[0]);assert.equal(attacks.length,1);E.resolveAttacks(s,attacks);return s;
}
function fly(s){let ticks=0;while(s.projectiles.length&&ticks<600){E.stepProjectiles(s,E.STEP);ticks++;}assert.equal(s.projectiles.length,0);return ticks;}
test('Launched bullets and rockets hit a later target beyond their former acquisition range',()=>{
 for(const type of ['machinegun','rocket']){
  const s=fixture(type),p=s.projectiles[0];s.projectiles=[p];s.robots[1].x=675;s.robots[0].action='brake';
  const start=p.x,formerReach=s.robots[0].tools[0].stats.reach;
  while(p.travel<=formerReach){E.stepProjectiles(s,E.STEP);assert.ok(s.projectiles.includes(p));assert.equal(s.robots[1].health,300);}
  fly(s);assert.ok(p.x-start>formerReach);close(300-s.robots[1].health,p.stats.damage*(type==='rocket'?1.2:.8));
  const hp=s.robots[1].health;E.stepProjectiles(s,1);assert.equal(s.robots[1].health,hp);assert.equal(s.events.filter(e=>e.type==='hit').length,1);
 }
});
test('Missed shots continue to the first solid wall beyond their old range and stop exactly once',()=>{
 for(const type of ['machinegun','rocket']){
  const s=fixture(type),p=s.projectiles[0];s.projectiles=[p];s.robots[1].y=600;
  const sum=()=>s.walls.reduce((n,w)=>n+w.maxHealth-w.health,0);fly(s);
  assert.ok(p.travel>s.robots[0].tools[0].stats.reach);close(sum(),p.stats.wallDamage);
  E.stepProjectiles(s,2);close(sum(),p.stats.wallDamage);assert.equal(s.events.filter(e=>e.type==='hit').length,1);
 }
});
test('Only rounds still queued are cancelled when the shooter or tool disappears',()=>{
 for(const type of ['machinegun','rocket'])for(const cause of ['rule','broken','dead','airborne']){
  const s=fixture(type),p=s.projectiles[0],r=s.robots[0];s.robots[1].x=675;
  if(cause==='rule')r.action='brake';if(cause==='broken')r.tools[0].broken=true;if(cause==='dead'){r.alive=false;r.health=0;}if(cause==='airborne')r.z=90;
  E.stepProjectiles(s,E.STEP);assert.deepEqual(s.projectiles.map(p=>p.id),[p.id]);fly(s);
  close(300-s.robots[1].health,p.stats.damage*(type==='rocket'?1.2:.8));
 }
});
test('Off-screen cleanup bounds every missed projectile angle and power to less than 4.6 seconds',()=>{
 for(const type of ['machinegun','rocket'])for(const power of [1,2,3])for(let i=0;i<16;i++){
  const s=fixture(type,power),p=s.projectiles[0],angle=i*Math.PI/8,speed=type==='rocket'?270:630;
  s.projectiles=[p];s.walls.forEach(w=>w.broken=true);s.robots[1].alive=false;
  Object.assign(p,{x:E.PROJECTILE_BOUNDS.min+.001,y:E.PROJECTILE_BOUNDS.min+.001,angle,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,travel:0});
  const ticks=fly(s);assert.ok(ticks*E.STEP<4.6);
  assert.ok(p.x<E.PROJECTILE_BOUNDS.min||p.x>E.PROJECTILE_BOUNDS.max||p.y<E.PROJECTILE_BOUNDS.min||p.y>E.PROJECTILE_BOUNDS.max);
 }
});
test('A shot can finish beyond its old range after 120 seconds without exceeding the settlement budget',()=>{
 for(const type of ['machinegun','rocket']){
  const a=fixture(type);a.robots[1].x=675;a.time=120;a.tick=120/E.STEP;E.finishIfNeeded(a);const b=JSON.parse(JSON.stringify(a)),count=a.projectileCounter;
  assert.ok(a.pendingResult);assert.equal(a.projectiles.length,1);
  for(let i=0;i<600&&a.status==='running';i++){E.step(a);E.step(b);}
  assert.equal(a.status,'finished');assert.deepEqual(a,b);assert.ok(a.robots[1].health<300);
  assert.equal(a.projectileCounter,count);assert.equal(a.time,120);assert.ok(a.settleElapsed<4.6);assert.ok(a.tick<7800);
 }
});
