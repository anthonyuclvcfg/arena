'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../public/engine');
const passive={body:'wedge',motor:1,armor:1,tools:[],rules:[{when:'always',do:'brake'}]};
const melee=['ram','flipper','plow','hammer','saw','drill'];
function fixture(type='saw',power=1){
 const s=E.createMatch({...passive,tools:[{type,power,x:20,y:0,angle:0}],rules:[{when:'always',do:'weapon'}]},passive,271);
 s.hazards=[];s.pickups=[];
 Object.assign(s.robots[0],{x:200,y:300,angle:0,action:'weapon'});
 Object.assign(s.robots[1],{x:500,y:500,angle:0});return s;
}
function fire(s){const hits=E.collectAttacks(s,s.robots[0]);assert.equal(hits.length,1);E.resolveAttacks(s,hits);if(['saw','drill'].includes(hits[0].tool.type))E.stepContact(s,E.STEP);return hits[0];}
function bare(r){for(const p of r.parts){p.health=0;p.broken=true;}}

test('A saw cuts the visible distal hammer head even when neither old center ray nor mount circle touches',()=>{
 const s=E.createMatch({...passive,tools:[{type:'saw',x:20,y:0}],rules:[{when:'always',do:'weapon'}]},
  {...passive,tools:[{type:'hammer',x:-24,y:-24,angle:270}]},271);
 Object.assign(s.robots[0],{x:200,y:300,angle:0,action:'weapon'});
 Object.assign(s.robots[1],{x:260,y:354,angle:0});
 // Visible saw disk: center (236,300), r10. Hammer head: x227..245,y299..308.
 const hit=fire(s),target=s.robots[1];assert.equal(hit.hit.component,target.tools[0]);
 assert.ok(target.tools[0].health<target.tools[0].maxHealth);assert.ok(target.health<300);
});

test('Saw lateral teeth contact an exposed circular chassis, and separating them stops damage',()=>{
 const s=fixture(),r=s.robots[1];r.config.body='circle';r.stats=E.stats({...passive,body:'circle'});
 Object.assign(r,{x:236,y:330});bare(r);
 // The visible circle has radius 20.7; saw's bottom at310 overlaps its top at309.3.
 fire(s);const hp=r.health;assert.ok(hp<300);
 r.y=331;E.stepContact(s,E.STEP);assert.equal(r.health,hp,'A real gap must stop the stream immediately');
});

for(const type of melee)test(type+': touching a visible tool head damages that tool and chassis, broken remnants do not intercept',()=>{
 const s=fixture(type),r=s.robots[0],target=s.robots[1];
 const x=({ram:25,flipper:25,plow:21,hammer:26,saw:16,drill:25})[type]+220;
 const copy=E.createMatch(passive,{...passive,tools:[{type:'hammer',x:-24,y:-24,angle:270}]});
 target.tools=copy.robots[1].tools;Object.assign(target,{x:x+24,y:354});
 const hit=fire(s);assert.equal(hit.hit.component,target.tools[0]);assert.ok(target.health<300);
 assert.ok(target.tools[0].health<target.tools[0].maxHealth);
 target.tools[0].health=0;target.tools[0].broken=true;r.tools[0].cooldown=0;r.tools[0].contactTime=0;
 assert.equal(E.collectAttacks(s,r).length,0,'Broken tool remnants are not solid hit zones');
});

for(const type of melee)test(type+': contact still requires activation permission, energy, cooldown, altitude and an enemy',()=>{
 for(const gate of ['energy','cooldown','rule','broken','airborne','target-altitude','ally','dead']){
  const s=fixture(type),r=s.robots[0],t=r.tools[0],target=s.robots[1];Object.assign(target,{x:250,y:300});
  assert.equal(E.collectAttacks(s,r).length,1,'Fixture must start in valid contact');
  if(gate==='energy')r.energy=t.stats.energy-.001;
  if(gate==='cooldown')t.cooldown=.1;
  if(gate==='rule')r.action='brake';
  if(gate==='broken')t.broken=true;
  if(gate==='airborne')r.z=9;
  if(gate==='target-altitude')target.z=24;
  if(gate==='ally')r.team=target.team=0;
  if(gate==='dead')target.alive=false;
  assert.equal(E.collectAttacks(s,r).length,0,gate);assert.equal(target.health,300,gate);
 }
});

test('Every visible tool type can intercept a saw at its distal end, independent of its mount circle',()=>{
 const tip={ram:26,flipper:27,plow:22,hammer:31,saw:26,drill:32,flamethrower:30,machinegun:32,rocket:33};
 for(const [type,length] of Object.entries(tip)){
  const s=fixture(),target=s.robots[1];
  target.tools=E.createMatch(passive,{...passive,tools:[{type,x:-24,y:-24,angle:270}]}).robots[1].tools;
  Object.assign(target,{x:260,y:324+length});
  const hit=fire(s);assert.equal(hit.hit.component,target.tools[0],type);
  assert.ok(target.tools[0].health<target.tools[0].maxHealth,type);assert.ok(target.health<300,type);
 }
});

test('Melee head contact rotates with both robots and their mounts at every power tier',()=>{
 for(const type of melee)for(const power of [1,2,3])for(const angle of [0,.37,Math.PI/2,Math.PI,Math.PI*1.5]){
  const s=fixture(type,power),r=s.robots[0],target=s.robots[1];
  const headX=({ram:29,flipper:30,plow:24,hammer:31,saw:16,drill:25})[type];
  const x=20+headX+24,y=54,co=Math.cos(angle),si=Math.sin(angle);
  target.tools=E.createMatch(passive,{...passive,tools:[{type:'hammer',x:-24,y:-24,angle:270}]}).robots[1].tools;
  r.angle=angle;Object.assign(target,{x:r.x+x*co-y*si,y:r.y+x*si+y*co,angle});
  const hit=fire(s);assert.equal(hit.hit.component,target.tools[0],`${type}/${power}/${angle}`);
  assert.ok(target.health<300);
 }
});

test('Each exposed chassis outline receives contact at its visible edge without requiring a central ray',()=>{
 const left={wedge:[-1,-.72],box:[-.9,-.72],hex:[-1,0],circle:[-.9,0],diamond:[-1,-.12],octagon:[-.94,-.6],capsule:[-.96,-.68],cross:[-.94,-.4]};
 for(const [body,[x,y]] of Object.entries(left)){
  const s=fixture(),target=s.robots[1];target.config.body=body;target.stats=E.stats({...passive,body});bare(target);
  Object.assign(target,{x:246-target.stats.radius*x-.01,y:300-target.stats.radius*y});
  fire(s);assert.ok(target.health<300,body);
 }
});

test('A drill pointing into the empty corner of a Cross does not hit an invisible circular hull',()=>{
 const s=fixture('drill'),r=s.robots[0],target=s.robots[1];
 Object.assign(r,{x:390,y:390});Object.assign(r.tools[0],{x:0,y:0,angle:225});
 target.config.body='cross';target.stats=E.stats({...passive,body:'cross'});Object.assign(target,{x:350,y:350});bare(target);
 assert.equal(E.collectAttacks(s,r).length,0);assert.equal(target.health,300);
});

test('Intact armor and tools reduce chassis transfer but never absorb all valid contact damage',()=>{
 const armored=fixture(),exposed=fixture();
 for(const s of [armored,exposed]){
  const target=s.robots[1];target.config.body='circle';target.stats=E.stats({...passive,body:'circle'});Object.assign(target,{x:260,y:300});
 }
 bare(exposed.robots[1]);fire(armored);fire(exposed);
 const loss=300-armored.robots[1].health,full=300-exposed.robots[1].health;
 assert.ok(loss>0&&loss<full);assert.ok(armored.robots[1].parts.some(p=>p.health<p.maxHealth));
 for(let i=0;i<5;i++){
  const hp=armored.robots[1].health;E.stepContact(armored,E.STEP);assert.ok(armored.robots[1].health<hp);
 }
});

test('Lateral saw contact damages a parallel wall, then stops once the disk has a real gap',()=>{
 const s=fixture(),r=s.robots[0],t=r.tools[0];Object.assign(r,{x:687,y:400,action:'wall'});t.angle=90;
 const hit=fire(s);assert.equal(hit.hit.kind,'wall');const wall=hit.hit.wall;
 assert.ok(wall.health<wall.maxHealth);const hp=wall.health;
 r.x=685;E.stepContact(s,E.STEP);assert.equal(wall.health,hp);
});

test('Every tool keeps the same bounded immutable silhouette at all power tiers',()=>{
 for(const type of Object.keys(E.WEAPONS))for(const power of [1,2,3])for(const active of [false,true]){
  const t={type,power},geometry=E.toolGeometry(t,active),light=E.toolGeometry({type,power:1},active);
  assert.equal(E.toolScale(t),1);assert.deepEqual(geometry,light);assert.ok(geometry.length>=1&&geometry.length<=5);assert.ok(Object.isFrozen(geometry));
  assert.equal(E.toolGeometry(t,active),geometry,'Static shapes are cached, never rebuilt each frame');
  assert.deepEqual(E.toolGeometry(t,active,true),E.toolGeometry({type,power:1},active,true),'Working heads also stay at their visible size');
  for(const shape of geometry){
   assert.ok(Object.isFrozen(shape));for(const n of (shape.circle||shape.polygon.flat()))assert.ok(Number.isFinite(n));
  }
 }
 const circle=E.toolGeometry({type:'saw',power:3},true,true)[0].circle;
 assert.deepEqual(circle,[16,0,10]);
});

test('Power preserves nominal damage and cooldown changes without reaching beyond the fixed saw silhouette',()=>{
 const losses=[];
 for(const power of [1,2,3]){
  const s=fixture('saw',power),r=s.robots[0],target=s.robots[1],t=r.tools[0];
  target.config.body='circle';target.stats=E.stats({...passive,body:'circle'});bare(target);
  Object.assign(target,{x:236,y:330});
  assert.equal(t.stats.damage,E.WEAPONS.saw.damage*(1+.5*(power-1)));
  assert.equal(t.stats.cooldown,+(E.WEAPONS.saw.cooldown*(1+.4*(power-1))).toFixed(2));
  fire(s);losses.push(300-target.health);const hp=target.health;
  target.y=331;E.stepContact(s,E.STEP);assert.equal(target.health,hp,'Higher power cannot bridge a visible gap');
  t.cooldown=0;t.contactTime=0;r.energy=100;
  assert.equal(E.collectAttacks(s,r).length,0,'A fresh activation also needs real contact');
 }
 assert.ok(losses[1]>losses[0]&&losses[2]>losses[1],'Higher nominal damage still affects contact ticks');
});

test('A slow ring-out clears every fixed-size Heavy tool silhouette from all four sides',()=>{
 for(const type of melee)for(let side=0;side<4;side++){
  const s=fixture(type,3),r=s.robots[0];r.action='brake';r.config.rules=[{when:'always',do:'brake'}];
  r.tools[0].x=24;s.walls.forEach(w=>{w.broken=true;w.health=0;});
  const poses=[{x:400,y:E.BOUNDS.min-.01,angle:Math.PI/2},{x:E.BOUNDS.max+.01,y:400,angle:Math.PI},
   {x:400,y:E.BOUNDS.max+.01,angle:-Math.PI/2},{x:E.BOUNDS.min-.01,y:400,angle:0}];
  Object.assign(r,poses[side]);E.step(s);assert.equal(r.alive,false);assert.ok(r.exit);
  for(let i=0;i<60;i++)E.step(s);assert.ok(r.exit.done);
  const pose=E.toolPose(r,r.tools[0]),co=Math.cos(pose.angle),si=Math.sin(pose.angle);
  for(const shape of E.toolGeometry(r.tools[0],false)){
   const points=shape.polygon||[[shape.circle[0]-shape.circle[2],shape.circle[1]],
    [shape.circle[0]+shape.circle[2],shape.circle[1]],[shape.circle[0],shape.circle[1]-shape.circle[2]],
    [shape.circle[0],shape.circle[1]+shape.circle[2]]];
   for(const [x,y] of points){
    const wx=pose.x+x*co-y*si,wy=pose.y+x*si+y*co;
    if(side===0)assert.ok(wy<=E.BOUNDS.min-E.EXIT_CLEARANCE+1e-7,type);
    if(side===1)assert.ok(wx>=E.BOUNDS.max+E.EXIT_CLEARANCE-1e-7,type);
    if(side===2)assert.ok(wy>=E.BOUNDS.max+E.EXIT_CLEARANCE-1e-7,type);
    if(side===3)assert.ok(wx<=E.BOUNDS.min-E.EXIT_CLEARANCE+1e-7,type);
   }
  }
 }
});
