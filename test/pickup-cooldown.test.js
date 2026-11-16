'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../public/engine');
const passive={tools:[],rules:[{when:'always',do:'brake'}]};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture(n=2){const s=E.createBattle(Array(n).fill(passive),552);s.hazards=[];s.pickups=[];return s;}
function drop(s,r,kind='repair',extra={}){const p={id:s.pickups.length,kind,x:r.x,y:r.y,r:12,toolType:kind==='tool'?'saw':null,power:1,spawnAt:s.time,expiresAt:120,collectedBy:null,collectedAt:null,announced:true,...extra};s.pickups.push(p);return p;}
function ticks(s,n){for(let i=0;i<n;i++)E.step(s);}

test('New robots have no pickup delay, including all six players and new matches',()=>{
 assert.equal(E.PICKUP_COOLDOWN,10);
 const s=fixture(6);assert.ok(s.robots.every(r=>r.pickupCooldown===0));
 const r=s.robots[0];r.health=100;drop(s,r);E.collectPickups(s);assert.equal(r.pickupCooldown,10);
 assert.equal(E.createMatch(r.config,r.config).robots[0].pickupCooldown,0);
});
for(const first of ['repair','tool'])for(const second of ['repair','tool'])test(`${first} pickup blocks a subsequent ${second} for ten simulation seconds`,()=>{
 const s=fixture(),r=s.robots[0];r.health=100;
 const p=drop(s,r,first);E.collectPickups(s);assert.equal(p.collectedBy,r.id);assert.equal(r.pickupCooldown,10);
 const q=drop(s,r,second);E.collectPickups(s);assert.equal(q.collectedBy,null);
 ticks(s,599);assert.equal(q.collectedBy,null);assert.ok(r.pickupCooldown>0);assert.equal(E.canCollect(r,q),false);
 ticks(s,1);assert.equal(q.collectedBy,r.id);close(q.collectedAt-p.collectedAt,10);assert.equal(r.pickupCooldown,10);
});
test('Overlapping supplies cannot grant two pickups to one robot in the same tick',()=>{
 const s=fixture(),r=s.robots[0];r.health=10;for(const kind of ['repair','tool','repair','tool'])drop(s,r,kind);
 E.collectPickups(s);assert.equal(s.pickups.filter(p=>p.collectedBy===r.id).length,1);
 for(let i=0;i<5;i++)E.collectPickups(s);
 assert.equal(s.pickups.filter(p=>p.collectedBy===r.id).length,1);assert.equal(r.pickupCooldown,10);
});
test('Six robots have independent pickup timers, even on the same simulation tick',()=>{
 const s=fixture(6);s.robots.forEach(r=>{r.health=1;drop(s,r);});E.collectPickups(s);
 assert.equal(s.pickups.filter(p=>p.collectedBy!==null).length,6);assert.ok(s.robots.every(r=>r.pickupCooldown===10));
});
test('A nearby eligible opponent can take an item the closest robot cannot collect',()=>{
 const s=fixture(),[a,b]=s.robots;a.health=b.health=1;drop(s,a);E.collectPickups(s);
 Object.assign(b,{x:a.x+2,y:a.y});const p=drop(s,a);E.collectPickups(s);
 assert.equal(p.collectedBy,b.id);assert.equal(b.pickupCooldown,10);
});
test('A useless repair kit does not start cooldown or stop useful tool collection',()=>{
 const s=fixture(),r=s.robots[0],p=drop(s,r);E.collectPickups(s);
 assert.equal(r.pickupCooldown,0);assert.equal(p.collectedBy,null);
 const q=drop(s,r,'tool');E.collectPickups(s);assert.equal(q.collectedBy,r.id);assert.equal(p.collectedBy,null);
});
test('Component-only repairs start the shared cooldown without increasing chassis HP',()=>{
 const s=fixture(),r=s.robots[0];r.parts[0].health--;const p=drop(s,r);E.collectPickups(s);
 assert.equal(p.collectedBy,r.id);assert.equal(r.health,300);assert.equal(r.pickupCooldown,10);
});
test('Full bonus slots do not start a delay or consume the loose tool',()=>{
 const s=fixture(),r=s.robots[0];drop(s,r,'tool');E.collectPickups(s);ticks(s,600);
 drop(s,r,'tool');E.collectPickups(s);ticks(s,600);
 const p=drop(s,r,'tool');E.collectPickups(s);assert.equal(p.collectedBy,null);assert.equal(r.pickupCooldown,0);
});
test('Airborne and eliminated robots cannot start a pickup cooldown',()=>{
 const s=fixture(),r=s.robots[0];r.health=10;r.z=20;const p=drop(s,r);E.collectPickups(s);
 assert.equal(p.collectedBy,null);assert.equal(r.pickupCooldown,0);
 r.z=0;r.alive=false;E.collectPickups(s);assert.equal(p.collectedBy,null);assert.equal(r.pickupCooldown,0);
});
test('Expired and future items never trigger the cooldown',()=>{
 const s=fixture(),r=s.robots[0];r.health=1;drop(s,r,'repair',{expiresAt:0});drop(s,r,'tool',{spawnAt:50});E.collectPickups(s);
 assert.ok(s.pickups.every(p=>p.collectedBy===null));assert.equal(r.pickupCooldown,0);
});
test('Pickup sensors ignore both kinds during cooldown, then detect them when ready',()=>{
 const s=fixture(),[r,e]=s.robots;r.health=1;drop(s,r);E.collectPickups(s);
 const q=drop(s,r,'tool',{x:r.x+100}),p=drop(s,r,'repair',{x:r.x+120});
 assert.equal(E.nearestPickup(s,r).pickup,null);assert.equal(E.sensors(s,r,e).repair,false);assert.equal(E.sensors(s,r,e).pickup,false);
 ticks(s,600);assert.equal(E.nearestPickup(s,r).pickup,q);assert.equal(E.sensors(s,r,e).repair,true);assert.equal(E.sensors(s,r,e).pickup,true);
 assert.equal(p.collectedBy,null);
});
test('Pickup cooldown does not alter weapon cooldown or energy regeneration',()=>{
 const s=E.createBattle([{...passive,tools:[{type:'ram'}]},passive],55);s.hazards=[];s.pickups=[];
 const r=s.robots[0];r.health=10;r.energy=10;r.tools[0].cooldown=2;drop(s,r);E.collectPickups(s);ticks(s,60);
 close(r.pickupCooldown,9);close(r.tools[0].cooldown,1);close(r.energy,22);
});
test('Paused/no-op steps do not consume cooldown; it is bounded to zero after expiry',()=>{
 const s=fixture(),r=s.robots[0];r.health=1;drop(s,r);E.collectPickups(s);
 E.step(s,0);assert.equal(r.pickupCooldown,10);
 ticks(s,1200);assert.equal(r.pickupCooldown,0);
});
test('Snapshots preserve cooldown and exact pickup outcomes after serialization',()=>{
 const s=fixture(),r=s.robots[0];r.health=1;drop(s,r);E.collectPickups(s);drop(s,r,'tool');ticks(s,157);
 const copy=JSON.parse(JSON.stringify(s));
 for(let i=0;i<600;i++){E.step(s);E.step(copy);}assert.deepEqual(s,copy);assert.equal(s.pickups[1].collectedBy,0);
});
test('Imported blueprints cannot provide forged pickup cooldowns or inventory',()=>{
 const c=E.normalizeConfig({...passive,pickupCooldown:-100,pickupReadyAt:-100,bonusCollected:99});
 assert.ok(!('pickupCooldown' in c));assert.equal(E.createMatch(c,c).robots[0].pickupCooldown,0);
});
