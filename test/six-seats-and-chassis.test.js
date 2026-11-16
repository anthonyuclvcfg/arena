'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../public/engine');
const passive={tools:[],rules:[{when:'always',do:'brake'}]};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('All eight chassis are distinct and retain 300 HP and a 200-point budget',()=>{
 assert.equal(Object.keys(E.BODIES).length,8);
 const profiles=new Set();
 for(const body of Object.keys(E.BODIES)){
  const c=E.normalizeConfig({...passive,name:'CUSTOM',body,motor:3,armor:3});
  assert.equal(c.body,body);assert.equal(E.stats(c).hp,300);assert.ok(E.cost(c)<=200);
  profiles.add(JSON.stringify(E.BODIES[body]));
  const s=E.createBattle([c,c]);assert.equal(s.robots[0].config.body,body);
  assert.ok(Number.isFinite(E.stats(c).turn));
 }
 assert.equal(profiles.size,8);
});
test('Five and six seats face the center from equal-radius, nonoverlapping spawn points',()=>{
 for(const count of [5,6]){
  const s=E.createBattle(Array(count).fill(passive),555);
  assert.equal(s.robots.length,count);
  for(const r of s.robots){
   near(Math.hypot(r.x-400,r.y-400),225);
   near(E.angleDiff(r.angle,Math.atan2(400-r.y,400-r.x)),0);
   assert.ok(r.x-r.stats.radius>E.BOUNDS.min&&r.x+r.stats.radius<E.BOUNDS.max);
   assert.ok(r.y-r.stats.radius>E.BOUNDS.min&&r.y+r.stats.radius<E.BOUNDS.max);
   for(const other of s.robots)if(r!==other)assert.ok(Math.hypot(r.x-other.x,r.y-other.y)>200);
  }
 }
 for(const n of [0,1,9,2.5,NaN])assert.throws(()=>E.spawnsFor(n),RangeError);
});
test('Five/six-player fields leave every spawn clear over 200 seeds and remain reproducible',()=>{
 for(const n of [5,6])for(let seed=0;seed<200;seed++){
  const f=E.createField(seed,n),starts=E.spawnsFor(n);
  assert.equal(f.hazards.length,4);assert.equal(f.pickups.length,16);
  assert.deepEqual(f,E.createField(seed,n));
  for(const h of f.hazards){
   for(const r of starts)assert.ok(Math.hypot(h.x-r.x,h.y-r.y)>=82+h.r-1e-7);
   assert.ok(f.hazards.some(o=>o.type===h.type&&o.x===800-h.x&&o.y===800-h.y));
   for(const other of f.hazards)if(h!==other)assert.ok(Math.hypot(h.x-other.x,h.y-other.y)>=h.r+other.r+26-1e-7);
  }
  for(const p of f.pickups){
   for(const r of starts)assert.ok(Math.hypot(p.x-r.x,p.y-r.y)>=35+p.r-1e-7);
   for(const h of f.hazards)assert.ok(Math.hypot(p.x-h.x,p.y-h.y)>=p.r+h.r+35-1e-7);
  }
 }
});
test('All six human blueprints survive normalization; practice only randomizes the five AI seats',()=>{
 const users=Object.keys(E.BODIES).slice(2).map((body,i)=>E.normalizeConfig({...passive,name:'PLAYER '+i,body,motor:1+i%5}));
 const before=JSON.stringify(users);
 for(const seed of [51,52,53]){
  const s=E.createBattle(users,seed);assert.deepEqual(s.robots.map(r=>r.config),users);
  assert.ok(s.robots.every(r=>r.controller==='player'));
  const p=E.createPracticeBattle(users[0],6,seed);
  assert.deepEqual(p.robots[0].config,users[0]);assert.equal(p.robots.filter(r=>r.controller==='bot').length,5);
  assert.equal(new Set(p.robots.map(r=>r.config.name)).size,6);
  assert.ok(p.robots.every(r=>r.health===300&&E.cost(r.config)<=200));
 }
 assert.equal(JSON.stringify(users),before);
});
test('Random AI can choose all eight chassis; new shapes do not require explicit import flags',()=>{
 const used=new Set();
 for(let seed=0;seed<160;seed++)for(const b of E.generatePracticeBots(seed,5))used.add(b.body);
 assert.deepEqual([...used].sort(),Object.keys(E.BODIES).sort());
});
test('Six contestants rank by exact HP; fifth and sixth seats can win or tie',()=>{
 const s=E.createBattle(Array(6).fill(passive),555);s.hazards=[];s.pickups=[];
 s.time=E.MAX_SECONDS;s.robots.forEach((r,i)=>r.health=100+i);E.finishIfNeeded(s);
 assert.equal(s.result.winner,5);assert.equal(s.result.standings.length,6);
 assert.deepEqual(s.result.standings.map(r=>r.id),[5,4,3,2,1,0]);
 const t=E.createBattle(Array(6).fill(passive),555);t.time=E.MAX_SECONDS;
 t.robots.forEach((r,i)=>r.health=i>=4?190:100);E.finishIfNeeded(t);
 assert.equal(t.result.draw,true);assert.deepEqual(t.result.standings.filter(r=>r.winner).map(r=>r.id),[4,5]);
});
test('Six-seat elimination continues until a sole survivor; all six remain in standings',()=>{
 const s=E.createBattle(Array(6).fill(passive),555);s.hazards=[];s.pickups=[];
 for(let i=0;i<4;i++){s.robots[i].health=0;E.step(s);assert.equal(s.status,'running');}
 s.robots[4].health=0;E.step(s);assert.equal(s.status,'finished');assert.equal(s.result.winner,5);
 assert.equal(s.result.standings.length,6);
});
test('Complete 5–6 player randomized battles finish with finite state and deterministic replay',()=>{
 for(const n of [5,6])for(const seed of [701,702,703]){
  const s=E.createPracticeBattle(E.loadouts.ranged,n,seed),copy=JSON.parse(JSON.stringify(s));
  for(let i=0;i<8000&&s.status==='running';i++)E.step(s);
  for(let i=0;i<8000&&copy.status==='running';i++)E.step(copy);
  assert.equal(s.status,'finished');assert.deepEqual(s,copy);assert.equal(s.result.standings.length,n);
  for(const r of s.robots)assert.ok([r.x,r.y,r.health,r.energy,r.z].every(Number.isFinite));
 }
});
test('Reduced lift and longer streams preserve cooldown, range and capped total damage',()=>{
 near(E.FLIPPER_LIFT_MULTIPLIER,.6375);assert.equal(E.WALL_HP,150);
 assert.equal(E.MAX_SECONDS,120);assert.equal(E.MACHINEGUN_ROUNDS,12);near(E.MACHINEGUN_INTERVAL,.1);
 for(const power of [1,2,3]){
  const flame=E.toolStats({type:'flamethrower',power}),gun=E.toolStats({type:'machinegun',power});
  near(flame.duration,1.6+(power-1)*.2);near(flame.damage,22*(1+(power-1)*.5));
  near(gun.damage,15*(1+(power-1)*.5));
  assert.ok(gun.cooldown>1.1);assert.ok(flame.cooldown>flame.duration);
 }
});

test('Multiplayer fields keep four traps, fixed for the match and reproducible online',()=>{
 for(let seed=0;seed<300;seed++){
  const four=E.createField(seed,4),five=E.createField(seed,5),six=E.createField(seed,6);
  assert.equal(four.hazards.length,4);assert.equal(five.hazards.length,4);assert.equal(six.hazards.length,4);
  assert.ok(new Set(six.hazards.map(h=>h.type)).size===2);
  assert.equal(six.pickups.length,16);assert.equal(five.pickups.length,16);
 }
 const s=E.createBattle(Array(6).fill(passive),801);const before=JSON.stringify(s.hazards);
 s.robots[5].health=0;E.step(s);assert.equal(s.robots[5].alive,false);
 assert.equal(JSON.stringify(s.hazards),before);
});
test('Tool mount coordinates canonicalize signed zero for JSON replay snapshots',()=>{
 const c=E.normalizeConfig({...passive,tools:[{type:'ram',x:-.0000001,y:-.0000001,angle:0}]});
 assert.ok(!Object.is(c.tools[0].x,-0));assert.ok(!Object.is(c.tools[0].y,-0));
 assert.deepEqual(c,JSON.parse(JSON.stringify(c)));
});
