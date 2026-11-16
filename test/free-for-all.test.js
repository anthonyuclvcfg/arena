'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../public/engine');
const passive={tools:[],rules:[{when:'always',do:'brake'}]};
function blank(n=4){const s=E.createBattle(Array.from({length:n},()=>passive),83);s.hazards=[];s.pickups=[];return s;}
function fixture(type,targetType='ram'){
 const s=E.createBattle([{tools:[{type,x:20,y:0,angle:0,power:1}],rules:[{when:'always',do:'weapon'}]},
  {...passive,tools:[{type:targetType,x:-25,y:0,angle:0,power:1}],body:'box'}],1);
 s.hazards=[];s.pickups=[];const [a,b]=s.robots;Object.assign(a,{x:300,y:300,angle:0,action:'weapon'});Object.assign(b,{x:['machinegun','rocket','flamethrower'].includes(type)?410:360,y:300,angle:0});
 b.parts.forEach(p=>{p.broken=true;p.health=0});b.tools[0].health=b.tools[0].maxHealth=10000;return s;
}
function fire(s){const a=E.collectAttacks(s,s.robots[0]);assert.ok(a.length>0);E.resolveAttacks(s,a);return a;}
function fly(s){for(let i=0;i<600&&(s.projectiles.length||s.flames.length||s.robots.some(r=>r.tools.some(t=>t.contactTime>0)));i++){E.stepProjectiles(s,E.STEP);E.stepFlames(s,E.STEP);E.stepContact(s,E.STEP);}}

test('Two, three and four contestants have fixed HP, unique seats and full energy',()=>{
 for(const n of [2,3,4]){const s=blank(n);assert.equal(s.robots.length,n);assert.equal(new Set(s.robots.map(r=>r.x+','+r.y)).size,n);
  s.robots.forEach((r,i)=>{assert.equal(r.id,i);assert.equal(r.stats.hp,300);assert.equal(r.health,300);assert.equal(r.energy,100);});}
 for(const n of [0,1,9])assert.throws(()=>E.createBattle(Array(n).fill(passive)),RangeError);
});
test('Nearest living opponent is chosen independently for every seat',()=>{
 const s=blank();s.robots.forEach(r=>assert.notEqual(E.nearestEnemy(s,r).id,r.id));s.robots[2].alive=false;
 for(const r of s.robots.filter(r=>r.alive))assert.notEqual(E.nearestEnemy(s,r).id,2);
 E.step(s);assert.ok(s.robots.filter(r=>r.alive).every(r=>r.targetId!==r.id&&r.targetId!==2));
});
test('Eliminating one or two robots does not stop a four-way battle',()=>{
 const s=blank();s.robots[0].health=0;E.step(s);assert.equal(s.status,'running');assert.equal(s.robots[0].alive,false);
 s.robots[1].health=0;E.step(s);assert.equal(s.status,'running');assert.equal(s.result,null);
 s.robots[2].health=0;E.step(s);assert.equal(s.status,'finished');assert.equal(s.result.winner,3);assert.equal(s.result.reason,'Last robot standing');
});
test('Seat three can win and simultaneous final eliminations draw',()=>{
 const s=blank();s.robots.forEach(r=>{if(r.id!==2)r.health=0});E.step(s);assert.equal(s.result.winner,2);
 const t=blank();t.robots.forEach(r=>r.health=0);E.step(t);assert.equal(t.result.winner,null);
});
test('Non-duel seats collide with each other and do not collide with eliminated robots',()=>{
 const s=blank();Object.assign(s.robots[2],{x:350,y:350,vx:100});Object.assign(s.robots[3],{x:365,y:350,vx:-100});E.collideRobots(s);
 assert.ok(Math.hypot(s.robots[2].x-s.robots[3].x,s.robots[2].y-s.robots[3].y)>=47);
 s.robots[3].alive=false;const x=s.robots[2].x;Object.assign(s.robots[3],{x,y:350});E.collideRobots(s);assert.equal(s.robots[2].x,x);
});
test('Four-way maps are safe and quarter-turn symmetric over 300 seeds',()=>{
 for(let seed=1;seed<=300;seed++){
  const s=E.createBattle(Array(4).fill(passive),seed);assert.equal(s.hazards.length,4);assert.equal(s.pickups.length,16);
  for(const h of s.hazards){for(const p of E.SPAWNS)assert.ok(Math.hypot(h.x-p.x,h.y-p.y)>=h.r+82-1e-6);
   assert.ok(s.hazards.some(j=>Math.abs(j.x-(800-h.y))<1e-6&&Math.abs(j.y-h.x)<1e-6&&j.type===h.type));}
  for(const p of s.pickups){for(const h of s.hazards)assert.ok(Math.hypot(p.x-h.x,p.y-h.y)>=p.r+h.r+35-1e-6);}
 }
});
test('New ranged loadout keeps all three tools inside the original 160-point budget',()=>{
 const c=E.normalizeConfig(E.loadouts.ranged);assert.equal(c.tools.length,3);assert.ok(E.cost(c)<=160);assert.equal(c.armor,3);
});
test('Machine gun emits exactly twelve delayed projectiles and one cooldown',()=>{
 const s=fixture('machinegun');fire(s);const r=s.robots[0],t=r.tools[0];
 assert.equal(s.projectiles.length,12);assert.equal(t.cooldown,t.stats.cooldown);assert.equal(r.energy,100-t.stats.energy);
 assert.deepEqual(s.projectiles.map(p=>p.delay),[0,.1,.2,.3,.4,.5,.6,.7,.8,.9,1,1.1]);assert.equal(s.robots[1].health,300);
 fly(s);assert.ok(s.robots[1].health<300);assert.equal(s.projectiles.length,0);assert.equal(E.collectAttacks(s,r).length,0);
});
test('Rocket damage occurs on projectile impact, not on launch',()=>{
 const s=fixture('rocket');fire(s);assert.equal(s.projectiles.length,1);assert.equal(s.robots[1].health,300);
 fly(s);assert.ok(s.robots[1].health<300);assert.ok(s.effects.some(f=>f.kind==='explosion'));
});
test('Rocket splash can hit another opponent and the shooter at close range',()=>{
 const s=E.createBattle([{...passive,tools:[{type:'rocket',x:20,y:0,angle:0,power:1}]},passive,passive],1);s.hazards=[];s.pickups=[];
 Object.assign(s.robots[0],{x:300,y:300,angle:0,action:'weapon'});Object.assign(s.robots[1],{x:360,y:300,angle:0});Object.assign(s.robots[2],{x:355,y:337,angle:0});
 fire(s);fly(s);assert.ok(s.robots[1].health<300);assert.ok(s.robots[2].health<300);assert.ok(s.robots[0].health<300);
});
test('A bullet burst hits the first robot in its path, not the one behind',()=>{
 const s=E.createBattle([{...passive,tools:[{type:'machinegun',x:20,y:0,angle:0,power:1}]},passive,passive],8);s.hazards=[];s.pickups=[];
 Object.assign(s.robots[0],{x:200,y:300,angle:0,action:'weapon'});Object.assign(s.robots[1],{x:300,y:300,angle:0});Object.assign(s.robots[2],{x:400,y:300,angle:0});
 fire(s);fly(s);assert.ok(s.robots[1].health<300);assert.equal(s.robots[2].health,300);
});
test('Flame cone hits more than one opponent but not a target behind the shooter',()=>{
 const s=E.createBattle([{...passive,tools:[{type:'flamethrower',x:20,y:0,angle:0,power:1}]},passive,passive,passive],8);s.hazards=[];s.pickups=[];
 Object.assign(s.robots[0],{x:300,y:300,angle:0,action:'weapon'});Object.assign(s.robots[1],{x:415,y:280,angle:0});Object.assign(s.robots[2],{x:415,y:320,angle:0});Object.assign(s.robots[3],{x:250,y:300,angle:0});
 fire(s);fly(s);assert.ok(s.robots[1].health<300);assert.ok(s.robots[2].health<300);assert.equal(s.robots[3].health,300);
 const before=s.robots[1].health;assert.equal(E.collectAttacks(s,s.robots[0]).length,0);assert.equal(before,s.robots[1].health);
});
test('Every tool has a real favorable and unfavorable matchup without changing displayed damage',()=>{
 const pairs={ram:['hammer','plow'],flipper:['ram','drill'],plow:['drill','hammer'],hammer:['plow','saw'],saw:['flipper','plow'],drill:['ram','saw'],flamethrower:['machinegun','hammer'],machinegun:['flamethrower','plow'],rocket:['hammer','ram']};
 for(const [type,[good,bad]]of Object.entries(pairs)){
  const values=[];for(const target of [good,bad]){
   const s=fixture(type,target);
   if(!E.WEAPONS[type].mode){
    // Isolate an actual distal-head contact. A receiver mounted inside the
    // hull must not intercept a strike merely because its old hit circle did.
    const head={ram:29,flipper:30,plow:24,hammer:31,saw:16,drill:25}[type];
    const tip={ram:26,flipper:27,plow:22,hammer:31,saw:26,drill:32}[target],b=s.robots[1];
    Object.assign(b,{x:345+head,y:325+tip});Object.assign(b.tools[0],{y:-25,angle:270});
   }
   fire(s);fly(s);values.push(10000-s.robots[1].tools[0].health);
  }
  assert.ok(values[0]>values[1],type+': '+values);assert.ok(values[1]>0,type+' must still inflict damage');
  assert.equal(E.toolStats({type,power:1}).damage,E.WEAPONS[type].damage);
 }
 assert.equal(E.MATCHUPS,undefined);
});
test('Walls intercept and absorb projectile damage over time',()=>{
 for(const type of ['machinegun','rocket']){const s=fixture(type);const a=s.robots[0];Object.assign(a,{x:650,y:400,angle:0,action:'wall'});s.robots[1].x=200;
  fire(s);assert.ok(s.walls.every(w=>w.health===E.WALL_HP));fly(s);assert.ok(s.walls.some(w=>w.health<E.WALL_HP&&w.health>0));}
});
test('Every extra weapon is collectable and shares the same cooldown rules',()=>{
 for(const type of ['flamethrower','machinegun','rocket']){const s=blank();const r=s.robots[0];s.pickups=[{id:0,kind:'tool',x:r.x,y:r.y,r:12,spawnAt:0,expiresAt:30,collectedBy:null,toolType:type,power:2}];
  E.collectPickups(s);assert.equal(r.tools[0].type,type);assert.ok(r.tools[0].bonus);assert.deepEqual(r.config.tools,[]);assert.ok(r.tools[0].stats.cooldown>E.WEAPONS[type].cooldown);}
});
test('Four-way simulation and active projectiles are deterministic after JSON replay',()=>{
 const configs=[E.loadouts.ranged,E.loadouts.breacher,E.loadouts.ranged,E.loadouts.arsenal];const a=E.createBattle(configs,782),b=E.createBattle(configs,782);
 for(let i=0;i<400;i++){E.step(a);E.step(b);}assert.deepEqual(a,b);const c=JSON.parse(JSON.stringify(a));
 for(let i=0;i<200;i++){E.step(a);E.step(c);}assert.deepEqual(a,c);
});
test('Forty mixed 2–4 robot matches finish with finite, bounded state',()=>{
 const counts=new Set();for(let k=0;k<40;k++){const n=2+k%3,configs=Array.from({length:n},(_,i)=>E.rivals[(i+k)%E.rivals.length]);const s=E.createBattle(configs,800+k);
  while(s.status==='running')E.step(s);counts.add(n);assert.ok(s.time<=E.MAX_SECONDS+E.STEP);
  for(const r of s.robots)assert.ok([r.x,r.y,r.vx,r.vy,r.z,r.health,r.energy].every(Number.isFinite)&&r.health>=0&&r.health<=300&&r.energy>=0&&r.energy<=100);
  assert.ok(s.result.winner===null||s.robots[s.result.winner].alive);}
 assert.equal(counts.size,3);
});
