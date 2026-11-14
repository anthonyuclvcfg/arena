'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../public/engine');
const passive={tools:[],rules:[{when:'always',do:'brake'}]};
const close=(a,b,message='')=>assert.ok(Math.abs(a-b)<1e-6,`${message}: ${a} versus ${b}`);
function blank(config=passive,n=2){const s=E.createBattle([config,...Array.from({length:n-1},()=>passive)],83);s.hazards=[];s.pickups=[];return s;}
function run(s,seconds){for(let i=0;i<Math.ceil(seconds/E.STEP)&&s.status==='running';i++)E.step(s);return s;}
function fly(s,dt=E.STEP){for(let i=0;i<600&&(s.projectiles.length||s.flames.length);i++){E.stepProjectiles(s,dt);E.stepFlames(s,dt);}assert.equal(s.projectiles.length,0);assert.equal(s.flames.length,0);}
function fired(type,power=1,side=1,yIndex=5.5){
 const s=blank({body:'box',tools:[{type,x:20,y:0,angle:0,power}],rules:[{when:'always',do:'wall'}]});
 const r=s.robots[0],along=E.BOUNDS.min+E.BOUNDS.size/E.SEGMENTS*yIndex;
 const poses=[{x:along,y:170,angle:-Math.PI/2},{x:630,y:along,angle:0},{x:along,y:630,angle:Math.PI/2},{x:170,y:along,angle:Math.PI}];
 Object.assign(r,poses[side],{action:'wall'});Object.assign(s.robots[1],{x:400,y:400});
 const shots=E.collectAttacks(s,r);assert.equal(shots.length,1);assert.equal(shots[0].hit.kind,'wall');
 E.resolveAttacks(s,shots);return {s,r,t:r.tools[0],wall:shots[0].hit.wall};
}
const wallLoss=s=>s.walls.reduce((sum,w)=>sum+w.maxHealth-w.health,0);

test('Wall and chassis balance match v0.5.6; build budget remains unchanged',()=>{
 assert.equal(E.WALL_HP,180);assert.equal(E.CHASSIS_HP,250);assert.equal(E.BUDGET,200);
 assert.equal(E.MAX_IMPACT_DAMAGE,72);assert.equal(E.MAX_BOTS,8);
 assert.ok(E.MAX_IMPACT_DAMAGE*2<E.WALL_HP);assert.ok(E.MAX_IMPACT_DAMAGE*3>=E.WALL_HP);
});
for(const type of ['machinegun','rocket'])for(const power of [1,2,3]){
 test(`${type} power ${power}: exact wall damage on every side, once per projectile`,()=>{
  for(let side=0;side<4;side++){
   const {s,r,t,wall}=fired(type,power,side);assert.equal(wallLoss(s),0,'no instant damage on launch');
   close(t.cooldown,E.WEAPONS[type].cooldown*(1+(power-1)*.4));
   fly(s);close(wallLoss(s),t.stats.wallDamage);close(wall.health,E.WALL_HP-t.stats.wallDamage);
   assert.equal(wall.hits,type==='machinegun'?12:1);assert.equal(wall.broken,false);
   assert.equal(r.tools[0].cooldown,t.stats.cooldown);assert.equal(E.collectAttacks(s,r).length,0);
  }
 });
}
test('Bullet burst crossing a seam does not double-hit adjacent wall segments',()=>{
 const {s,t}=fired('machinegun',3,1,6);s.projectiles=[];const r=s.robots[0];r.x=570;r.energy=100;t.cooldown=0;E.resolveAttacks(s,E.collectAttacks(s,r));fly(s);close(wallLoss(s),t.stats.wallDamage);
 assert.equal(s.walls.reduce((n,w)=>n+w.hits,0),E.MACHINEGUN_ROUNDS);
 assert.equal(s.walls.filter(w=>w.hits).length,2);
});
test('A diagonal mount cannot spawn bullets or rockets through a solid wall',()=>{
 for(const type of ['machinegun','rocket']){
  const s=blank({tools:[{type,x:24,y:24,angle:45,power:1}]});const r=s.robots[0];
  Object.assign(r,{x:E.BOUNDS.max-r.stats.radius-2,y:373,angle:-Math.PI/4,action:'wall'});
  assert.ok(E.toolPose(r,r.tools[0]).x>E.BOUNDS.max,'fixture muzzle protrudes beyond the wall');
  const shots=E.collectAttacks(s,r);assert.equal(shots.length,1);E.resolveAttacks(s,shots);
  assert.ok(s.projectiles.every(p=>p.x<E.BOUNDS.max));fly(s);close(wallLoss(s),r.tools[0].stats.wallDamage);
 }
});
test('Swept collisions still hit a wall when a projectile crosses it in a long step',()=>{
 for(const type of ['machinegun','rocket']){const {s,t}=fired(type,1);fly(s,.5);close(wallLoss(s),t.stats.wallDamage);}
});
test('Walls absorb an incoming rocket from outside too',()=>{
 const {s,t}=fired('rocket');Object.assign(s.projectiles[0],{x:750,y:373,angle:Math.PI,vx:-270,vy:0});
 fly(s);close(wallLoss(s),t.stats.wallDamage);assert.ok(s.walls.filter(w=>w.hits).every(w=>w.side===1));
});
test('Projectiles pass through a breached segment without damaging invisible walls',()=>{
 for(const type of ['machinegun','rocket']){
  const {s,wall}=fired(type);wall.health=0;wall.broken=true;fly(s);
  assert.equal(wall.hits,0);assert.ok(s.walls.filter(w=>w!==wall).every(w=>w.health===E.WALL_HP));
 }
});
test('Projectiles above the wall height do not inflict phantom wall damage',()=>{
 for(const type of ['machinegun','rocket']){const {s}=fired(type);s.robots[0].z=E.WALL_HEIGHT+1;s.projectiles.forEach(p=>p.z=E.WALL_HEIGHT+1);fly(s);assert.equal(wallLoss(s),0);}
});
test('Four base rockets breach one wall, and the last hit is capped at remaining HP',()=>{
 const {s,r,wall}=fired('rocket');fly(s);
 for(let i=1;i<4;i++){r.energy=100;r.tools[0].cooldown=0;E.resolveAttacks(s,E.collectAttacks(s,r));fly(s);if(i<3)assert.equal(wall.broken,false);}
 assert.equal(wall.health,0);assert.equal(wall.hits,4);assert.equal(wall.broken,true);
 close(s.events.filter(e=>e.wall===wall.side*E.SEGMENTS+wall.i).reduce((a,e)=>a+e.damage,0),180);
});
test('Every tool applies its own wall coefficient at all three power levels',()=>{
 for(const type of Object.keys(E.WEAPONS))for(const power of [1,2,3]){
  const s=blank({tools:[{type,x:20,y:0,angle:0,power}]});const r=s.robots[0];
  Object.assign(r,{x:110,y:373,angle:Math.PI,action:'wall'});s.robots[1].x=500;
  const hits=E.collectAttacks(s,r);assert.equal(hits.length,1,type);E.resolveAttacks(s,hits);fly(s);
  close(wallLoss(s),r.tools[0].stats.wallDamage,type+' power '+power);
 }
});

test('Ranged robots recover from each corner with every chassis, including damaged drives',()=>{
 for(const body of Object.keys(E.BODIES))for(const [sx,sy] of [[1,1],[-1,1],[-1,-1],[1,-1]])for(const broken of [0,2]){
  const s=blank({body,tools:[{type:'machinegun',x:20,y:0}],rules:[{when:'always',do:'weapon'}]});const [r,e]=s.robots;
  const inset=r.stats.radius+2,x=sx===1?E.BOUNDS.min+inset:E.BOUNDS.max-inset,y=sy===1?E.BOUNDS.min+inset:E.BOUNDS.max-inset;
  Object.assign(r,{x,y,angle:Math.atan2(-sy,-sx)});r.tools[0].cooldown=999;
  Object.assign(e,{x:x+50*sx,y:y+50*sy});r.parts.filter(p=>p.kind==='drive').slice(0,broken).forEach(p=>{p.broken=true;p.health=0});
  run(s,5);assert.ok(r.recoveries>=1,`${body}/${sx},${sy}/${broken} did not recover`);
  assert.ok(Math.hypot(r.x-x,r.y-y)>18,`${body} did not move away`);assert.ok(r.alive);assert.equal(r.health,250);
  assert.ok(r.x>E.BOUNDS.min&&r.x<E.BOUNDS.max&&r.y>E.BOUNDS.min&&r.y<E.BOUNDS.max);
 }
});
test('A ranged robot backed against any straight wall repositions without teleporting',()=>{
 for(let side=0;side<4;side++){
  const s=blank({tools:[{type:'machinegun'}],rules:[{when:'always',do:'weapon'}]}),[r,e]=s.robots;
  const n=[[0,1],[-1,0],[0,-1],[1,0]][side],distance=r.stats.radius+2;
  const x=side===1?E.BOUNDS.max-distance:side===3?E.BOUNDS.min+distance:373;
  const y=side===0?E.BOUNDS.min+distance:side===2?E.BOUNDS.max-distance:373;
  Object.assign(r,{x,y,angle:Math.atan2(-n[1],-n[0])});Object.assign(e,{x:x+n[0]*75,y:y+n[1]*75});r.tools[0].cooldown=999;
  for(let i=0;i<240;i++){const oldX=r.x,oldY=r.y;E.step(s);assert.ok(Math.hypot(r.x-oldX,r.y-oldY)<12,'no teleport');}
  assert.ok(r.recoveries>0);assert.ok((r.x-x)*n[0]+(r.y-y)*n[1]>18);assert.ok(r.alive);
 }
});
test('Retreat and avoidance cannot select unreachable targets outside corners',()=>{
 for(const action of ['retreat','avoid','orbit']){
  const s=blank({tools:[],rules:[{when:'always',do:action}]});const r=s.robots[0];Object.assign(r,{x:690,y:690,angle:Math.PI/4});Object.assign(s.robots[1],{x:500,y:500});
  if(action==='avoid')s.hazards=[{id:0,type:'fire',x:610,y:650,r:24,phase:4,period:100,duty:1}];
  run(s,4);assert.ok(r.alive);assert.ok(Math.hypot(r.x-690,r.y-690)>18);assert.equal(r.health,250);
 }
});
test('Deliberate braking and attacking a wall do not trigger recovery',()=>{
 for(const action of ['brake','wall']){
  const s=blank({tools:[{type:'hammer'}],rules:[{when:'always',do:action}]}),r=s.robots[0];
  Object.assign(r,{x:110,y:110,angle:Math.PI*1.25});r.tools[0].cooldown=999;run(s,5);
  assert.equal(r.recoveries,0);assert.ok(r.alive);assert.ok(s.walls.every(w=>w.health===E.WALL_HP));
 }
});
test('All four solid corners resolve penetration without false ring-outs or duplicate impact damage',()=>{
 for(const [sx,sy] of [[1,1],[-1,1],[-1,-1],[1,-1]]){
  const s=blank(),r=s.robots[0];Object.assign(r,{x:sx===1?E.BOUNDS.min-1:E.BOUNDS.max+1,y:sy===1?E.BOUNDS.min-1:E.BOUNDS.max+1,vx:-500*sx,vy:-500*sy});
  E.collideWalls(s,r);assert.ok(r.x>=E.BOUNDS.min+r.stats.radius&&r.x<=E.BOUNDS.max-r.stats.radius);
  assert.ok(r.y>=E.BOUNDS.min+r.stats.radius&&r.y<=E.BOUNDS.max-r.stats.radius);
  assert.ok(s.walls.every(w=>w.hits<=1&&!w.broken));E.step(s);assert.ok(r.alive);
 }
});
test('Sliding along wall seams preserves tangential velocity',()=>{
 const s=blank(),r=s.robots[0];Object.assign(r,{x:E.BOUNDS.min+r.stats.radius+1,y:400,vx:-50,vy:100});
 E.collideWalls(s,r);close(r.vy,100);assert.ok(r.x>=E.BOUNDS.min+r.stats.radius+2);assert.equal(wallLoss(s),0);
});

for(let side=0;side<4;side++){
 test(`Ring-out side ${side}: committed elimination, followed by complete visible exit`,()=>{
  const s=blank({tools:[{type:'rocket',x:-24,y:24,angle:180}],rules:[{when:'always',do:'center'}]}),r=s.robots[0];
  s.walls.filter(w=>w.side===side).forEach(w=>{w.health=0;w.broken=true});
  const poses=[{x:373,y:E.BOUNDS.min+.5,vx:0,vy:-200},{x:E.BOUNDS.max-.5,y:373,vx:200,vy:0},{x:373,y:E.BOUNDS.max-.5,vx:0,vy:200},{x:E.BOUNDS.min+.5,y:373,vx:-200,vy:0}];
  Object.assign(r,poses[side]);E.step(s);
  assert.equal(r.alive,false);assert.equal(r.reason,'Out of the arena');assert.ok(r.exit&&!r.exit.done);assert.equal(s.status,'running');assert.equal(s.result,null);
  assert.equal(E.collectAttacks(s,r).length,0);assert.equal(E.nearestEnemy(s,s.robots[1]),null);
  const time=s.time,energy=r.energy;run(s,1);
  assert.ok(r.exit.done);assert.equal(s.status,'finished');assert.equal(s.result.winner,1);assert.equal(s.time,time);assert.equal(r.energy,energy);
  const f=E.footprint(r);
  if(side===0)assert.ok(r.y+f.maxY<=E.BOUNDS.min-E.EXIT_CLEARANCE+1e-6);
  if(side===1)assert.ok(r.x+f.minX>=E.BOUNDS.max+E.EXIT_CLEARANCE-1e-6);
  if(side===2)assert.ok(r.y+f.minY>=E.BOUNDS.max+E.EXIT_CLEARANCE-1e-6);
  if(side===3)assert.ok(r.x+f.maxX<=E.BOUNDS.min-E.EXIT_CLEARANCE+1e-6);
 });
}
test('A slow crossing still coasts fully outside instead of freezing on the edge',()=>{
 const s=blank(),r=s.robots[0];s.walls.filter(w=>w.side===3).forEach(w=>{w.broken=true;w.health=0});
 r.x=E.BOUNDS.min-.01;r.vx=0;E.step(s);assert.equal(r.alive,false);run(s,1);
 assert.ok(r.x+E.footprint(r).maxX<E.BOUNDS.min);assert.equal(r.vx,0);assert.equal(s.result.winner,1);
});
test('Only the center crossing commits elimination; an overhanging tool alone is not out',()=>{
 const s=blank({tools:[{type:'rocket',x:-24,y:0,angle:180}],rules:passive.rules}),r=s.robots[0];
 s.walls.filter(w=>w.side===3).forEach(w=>{w.broken=true;w.health=0});r.x=E.BOUNDS.min+2;r.vx=0;E.step(s);assert.ok(r.alive);assert.equal(r.exit,null);
});
test('An aerial ring-out finishes beyond the intact wall and lands in its exit animation',()=>{
 const s=blank(),r=s.robots[0];Object.assign(r,{x:E.BOUNDS.max-.5,y:373,z:90,vx:220});E.step(s);
 assert.equal(r.reason,'Aerial ring-out');assert.ok(s.walls.every(w=>!w.broken));run(s,1);
 assert.equal(r.z,0);assert.ok(r.x+E.footprint(r).minX>E.BOUNDS.max);assert.equal(s.result.winner,1);
});
test('Three survivors keep fighting while an eliminated fourth robot exits',()=>{
 const s=blank(passive,4),r=s.robots[0];Object.assign(r,{x:E.BOUNDS.min-.01,z:80});E.step(s);
 assert.equal(r.alive,false);assert.equal(s.pendingResult,undefined);const before=s.time;run(s,1);
 assert.equal(s.status,'running');assert.ok(s.time>before);assert.ok(r.exit.done);assert.ok(s.robots.slice(1).every(r=>r.alive));
});
test('Active recovery and ring-out states survive deterministic JSON snapshots',()=>{
 const s=blank(passive,4);Object.assign(s.robots[0],{x:E.BOUNDS.min-1,z:80});E.step(s);
 s.robots[1].recoveryUntil=s.time+.8;const clone=JSON.parse(JSON.stringify(s));
 for(let i=0;i<100;i++){E.step(s);E.step(clone);}assert.deepEqual(clone,s);
});
