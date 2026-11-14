'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../public/engine');
const player=E.normalizeConfig({name:'MY REAL ROBOT',body:'hex',motor:3,armor:2,
 tools:[{type:'rocket',power:2,x:12,y:3,angle:7},{type:'ram',power:3,x:18,y:-9,angle:0}],
 lines:[[-8,2,4,6]],rules:[{when:'hazard',do:'avoid'},{when:'near',do:'tool1'},{when:'always',do:'push'}]});
function freeze(o){Object.freeze(o);for(const v of Object.values(o))if(v&&typeof v==='object'&&!Object.isFrozen(v))freeze(v);return o;}

test('Random practice never changes the human name, chassis, tools, strength, drawing or programming',()=>{
 const original=JSON.stringify(player);freeze(player);
 for(const count of [2,3,4])for(const seed of [1,2,45,999999]){
  const s=E.createPracticeBattle(player,count,seed);
  assert.equal(s.robots.length,count);assert.equal(s.robots[0].controller,'player');assert.deepEqual(s.robots[0].config,player);
  assert.ok(s.robots.slice(1).every(r=>r.controller==='bot'));assert.equal(JSON.stringify(player),original);
  assert.notEqual(s.robots[0].config,player);
 }
});
test('Only explicit practice creation generates AI: human-only battles retain all provided designs',()=>{
 const users=['REAL ONE','REAL TWO','REAL THREE','REAL FOUR'].map((name,i)=>E.normalizeConfig({...player,name,motor:i+1}));
 const original=JSON.stringify(users);
 for(const seed of [1,2,3]){
  const s=E.createBattle(users,seed);assert.deepEqual(s.robots.map(r=>r.config),users);
  assert.ok(s.robots.every(r=>r.controller==='player'));
 }
 assert.equal(JSON.stringify(users),original);
});
test('Every new seed varies AI names and complete loadouts, with unique names in the battle',()=>{
 const names=new Set(),fingerprints=new Set();
 for(let seed=1;seed<=200;seed++){
  const bots=E.generatePracticeBots(seed,3);assert.equal(new Set(bots.map(b=>b.name)).size,3);
  for(const b of bots){assert.ok(!names.has(b.name));names.add(b.name);fingerprints.add(JSON.stringify(b));}
 }
 assert.equal(fingerprints.size,600);
});
test('AI randomization covers all chassis, weapon types, power tiers, motor/armor settings and mount directions',()=>{
 const bodies=new Set(),tools=new Set(),powers=new Set(),motors=new Set(),armor=new Set(),angles=new Set(),rules=new Set();
 for(let seed=1;seed<=300;seed++)for(const b of E.generatePracticeBots(seed,3)){
  bodies.add(b.body);motors.add(b.motor);armor.add(b.armor);rules.add(JSON.stringify(b.rules));
  b.tools.forEach(t=>{tools.add(t.type);powers.add(t.power);angles.add(t.angle);});
 }
 assert.equal(bodies.size,8);assert.equal(tools.size,9);assert.equal(powers.size,3);
 assert.ok(motors.size>=3);assert.ok(armor.size>=3);assert.equal(angles.size,4);assert.equal(rules.size,3);
});
test('All generated bots obey normal budget, health, mounting and tool-count constraints',()=>{
 for(let seed=0;seed<400;seed++){
  const s=E.createPracticeBattle(player,4,seed);
  for(const r of s.robots.slice(1)){
   const b=r.config;assert.ok(E.cost(b)<=200);assert.equal(r.health,250);assert.equal(r.stats.hp,250);
   assert.ok(b.tools.length>=1&&b.tools.length<=6);assert.equal(b.name.length<=18,true);
   assert.deepEqual(E.normalizeConfig(b),b);assert.equal(r.tools.some(t=>t.bonus),false);
   for(const t of b.tools){assert.ok(Math.abs(t.x)<=E.BODIES[b.body].radius);assert.ok(Math.abs(t.y)<=E.BODIES[b.body].radius);}
  }
 }
});
test('AI builds and terrain reproduce exactly for a replay seed without mutating standard presets',()=>{
 const presets=JSON.stringify(E.rivals);const a=E.createPracticeBattle(player,4,34),b=E.createPracticeBattle(player,4,34);
 assert.deepEqual(a,b);for(let i=0;i<350;i++){E.step(a);E.step(b);}assert.deepEqual(a,b);
 assert.equal(JSON.stringify(E.rivals),presets);
});
test('A JSON snapshot keeps AI/human identity and deterministic state for replay',()=>{
 const a=E.createPracticeBattle(player,4,65);for(let i=0;i<90;i++)E.step(a);
 const b=JSON.parse(JSON.stringify(a));for(let i=0;i<160;i++){E.step(a);E.step(b);}assert.deepEqual(a,b);
});
test('Generated configurations are independent objects with no shared editable tools or rules',()=>{
 const a=E.generatePracticeBots(11,3),b=E.generatePracticeBots(11,3);a[0].tools[0].power=0;a[0].rules[0].do='brake';
 assert.notDeepEqual(a,b);assert.deepEqual(b,E.generatePracticeBots(11,3));assert.ok(a[1].tools[0].power>=1);
});
test('Invalid practice sizes reject safely rather than adding bots to human matches',()=>{
 for(const n of [-1,0,1,9,2.5,NaN])assert.throws(()=>E.createPracticeBattle(player,n,5),RangeError);
 for(const n of [0,8,1.5,NaN])assert.throws(()=>E.generatePracticeBots(5,n),RangeError);
});
test('Random AI battles remain finite and terminate with full standings',()=>{
 for(const count of [2,3,4])for(const seed of [19,47,101]){
  const s=E.createPracticeBattle(player,count,seed);let steps=0;
  while(s.status==='running'&&steps++<7800)E.step(s);
  assert.equal(s.status,'finished');assert.equal(s.result.standings.length,count);assert.ok(s.time<=120);
  for(const r of s.robots)assert.ok([r.x,r.y,r.health,r.energy,r.angle].every(Number.isFinite));
 }
});
