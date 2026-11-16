'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../public/engine');
const passive={tools:[],rules:[{when:'always',do:'brake'}]};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} vs ${b}`);
function fixture(type,power=1){
 const s=E.createBattle([{tools:[{type,power,x:20,y:0,angle:0}],rules:[{when:'always',do:'weapon'}]},passive],17);
 s.hazards=[];s.pickups=[];Object.assign(s.robots[0],{x:200,y:300,angle:0,action:'weapon'});
 Object.assign(s.robots[1],{x:type==='saw'||type==='drill'?250:330,y:300,angle:0});
 s.robots[1].parts.forEach(p=>{p.health=0;p.broken=true});return s;
}
function fire(s){const attacks=E.collectAttacks(s,s.robots[0]);assert.equal(attacks.length,1);E.resolveAttacks(s,attacks);return s.robots[0].tools[0];}
function advance(s,seconds){let elapsed=0;while(elapsed<seconds-1e-9){const dt=Math.min(E.STEP,seconds-elapsed);E.stepContact(s,dt);elapsed+=dt;}}

for(const type of ['saw','drill'])test(type+': each power spends its damage budget gradually during contact',()=>{
 for(const power of [1,2,3]){
  const s=fixture(type,power),t=fire(s),r=s.robots[0],target=s.robots[1],modifier=type==='saw'?.9:1.25;
  assert.equal(target.health,300);assert.equal(r.energy,100-t.stats.energy);assert.equal(t.cooldown,t.stats.cooldown);
  const expected=t.stats.damage*modifier;let ticks=0;
  while(t.contactTime>0){const before=target.health,remaining=t.contactTime;E.stepContact(s,E.STEP);
   const loss=before-target.health;assert.ok(loss>0);close(loss,expected*Math.min(E.STEP,remaining)/t.stats.cooldown);ticks++;
  }
  assert.ok(ticks>=50);close(300-target.health,expected);close(target.vx,t.stats.kick*E.clamp(r.stats.mass/target.stats.mass,.65,1.5));
  assert.equal(s.events.filter(e=>e.type==='hit').length,1);const hp=target.health;advance(s,2);assert.equal(target.health,hp);
 }
});
for(const type of ['saw','drill'])test(type+': losing contact immediately stops damage and never stores missed damage',()=>{
 const s=fixture(type),t=fire(s),target=s.robots[1],expected=t.stats.damage*(type==='saw'?.9:1.25);
 advance(s,.2);const hp=target.health;target.y=500;advance(s,.2);assert.equal(target.health,hp);
 target.y=300;E.stepContact(s,E.STEP);close(hp-target.health,expected*E.STEP/t.stats.cooldown);
 advance(s,3);close(300-target.health,expected*(1-.2/t.stats.cooldown));
});
for(const type of ['saw','drill'])test(type+': rules, broken tools, dead or airborne owners cancel active contact',()=>{
 for(const cause of ['rule','other-tool','broken','dead','health','airborne']){
  const s=fixture(type),t=fire(s),r=s.robots[0];advance(s,.1);const hp=s.robots[1].health;
  if(cause==='rule')r.action='brake';if(cause==='other-tool')r.action='tool2';if(cause==='broken')t.broken=true;
  if(cause==='dead')r.alive=false;if(cause==='health')r.health=0;if(cause==='airborne')r.z=9;
  E.stepContact(s,E.STEP);assert.equal(t.contactTime,0,cause);assert.equal(s.robots[1].health,hp,cause);
  r.action='weapon';r.alive=true;r.health=300;r.z=0;t.broken=false;advance(s,2);assert.equal(s.robots[1].health,hp,cause);
 }
});
test('Saw and drill apply wall damage per contact tick, without damaging a robot behind the wall',()=>{
 for(const type of ['saw','drill'])for(const power of [1,2,3]){
  const s=fixture(type,power),r=s.robots[0];Object.assign(r,{x:690,y:373,action:'wall'});Object.assign(s.robots[1],{x:750,y:373});
  const t=fire(s),sum=()=>s.walls.reduce((n,w)=>n+w.maxHealth-w.health,0);
  assert.equal(sum(),0);E.stepContact(s,E.STEP);close(sum(),t.stats.wallDamage*E.STEP/t.stats.cooldown);
  advance(s,4);close(sum(),t.stats.wallDamage);assert.equal(s.robots[1].health,300);
  assert.equal(s.events.filter(e=>e.type==='wall-hit').length,1);
 }
});
test('Continuous tool damage is timestep invariant, checkpointable and cannot reactivate early',()=>{
 for(const type of ['saw','drill']){
  const a=fixture(type,3),t=fire(a),b=JSON.parse(JSON.stringify(a));E.stepContact(a,.4);advance(b,.4);close(a.robots[1].health,b.robots[1].health);
  t.cooldown=0;assert.equal(E.collectAttacks(a,a.robots[0]).length,0);
  const replay=JSON.parse(JSON.stringify(a));for(let i=0;i<120;i++){E.step(a);E.step(replay);}assert.deepEqual(a,replay);
 }
});
test('End signals cancel sustained tools and cannot apply deferred contact damage',()=>{
 for(const type of ['saw','drill']){
  const s=fixture(type),t=fire(s);advance(s,.1);s.time=120;const hp=s.robots[1].health;E.finishIfNeeded(s);
  assert.equal(t.contactTime,0);assert.equal(t.firing,0);advance(s,3);assert.equal(s.robots[1].health,hp);
 }
});
test('Flame contact changes health on every simulation tick and stops on contact loss',()=>{
 for(const power of [1,2,3]){
  const s=fixture('flamethrower',power),t=fire(s),slice=t.stats.damage*.85*E.STEP/t.stats.duration;
  for(let i=0;i<12;i++){const hp=s.robots[1].health;E.stepFlames(s,E.STEP);close(hp-s.robots[1].health,slice);}
  const hp=s.robots[1].health;s.robots[1].y=600;for(let i=0;i<12;i++)E.stepFlames(s,E.STEP);assert.equal(s.robots[1].health,hp);
  s.robots[1].y=300;E.stepFlames(s,E.STEP);close(hp-s.robots[1].health,slice);
 }
});
test('A hull overlapping the flame edge burns even with its center outside the cone',()=>{
 const s=fixture('flamethrower');Object.assign(s.robots[1],{x:350,y:350});
 const pose=E.firingPose(s,s.robots[0],s.robots[0].tools[0]);assert.ok(Math.atan2(350-pose.y,350-pose.x)>.38);
 fire(s);E.stepFlames(s,E.STEP);assert.ok(s.robots[1].health<300);
 const hp=s.robots[1].health;s.robots[1].y=380;E.stepFlames(s,E.STEP);assert.equal(s.robots[1].health,hp);
});
test('Machine-gun HP changes correspond exactly to individual bullet impacts',()=>{
 for(const power of [1,2,3]){
  const s=fixture('machinegun',power),t=fire(s);let impacted=0,damageFrames=0;
  for(let i=0;i<180;i++){
   const before=s.robots[1].health;E.stepProjectiles(s,E.STEP);
   const count=s.events.filter(e=>e.type==='hit'&&e.text.includes('bullet impact')).length;
   const loss=before-s.robots[1].health;close(loss,(count-impacted)*t.stats.damage/12*.8);
   if(loss>0)damageFrames++;impacted=count;
  }
  assert.equal(impacted,12);assert.equal(damageFrames,12);close(300-s.robots[1].health,t.stats.damage*.8);assert.equal(s.projectiles.length,0);
 }
});
