'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../public/engine');
const passive={rules:[{when:'always',do:'brake'}]};
function match(){const s=E.createMatch(passive,passive,17);s.hazards=[];s.pickups=[];Object.assign(s.robots[0],{x:300,y:300});Object.assign(s.robots[1],{x:600,y:600});return s;}
function drop(kind='repair',options={}){return {id:0,kind,x:300,y:300,r:12,toolType:kind==='tool'?'saw':null,power:1,spawnAt:0,expiresAt:30,collectedBy:null,collectedAt:null,announced:true,...options};}
function give(s,kind,options={}){if(s.robots[0].pickupCooldown>0){s.time+=s.robots[0].pickupCooldown;s.robots[0].pickupCooldown=0;}const p=drop(kind,{id:s.pickups.length,spawnAt:s.time,expiresAt:s.time+30,...options});s.pickups.push(p);E.collectPickups(s);return p;}

test('Balance allows 200 points, six built tools, twelve rules, plus two battle-only tools',()=>{
 assert.equal(E.BUDGET,200);assert.equal(E.MAX_TOOLS,6);assert.equal(E.MAX_RULES,12);assert.equal(E.MAX_BONUS_TOOLS,2);
 const c=E.normalizeConfig(E.loadouts.arsenal);assert.equal(c.tools.length,6);assert.equal(E.cost(c),160);
 assert.ok(E.ACTIONS.tool5&&E.ACTIONS.tool6);
});
test('Chassis health is fixed at 250 at every armor level',()=>{
 for(let armor=1;armor<=5;armor++)assert.equal(E.stats(E.normalizeConfig({armor,tools:[]})).hp,250);
});
test('All tools, panels, and drive units double v0.3 durability after rounding',()=>{
 const s=match(),r=s.robots[0];
 for(const type of Object.keys(E.WEAPONS))for(let power=1;power<=3;power++)assert.equal(E.toolStats({type,power}).hp,2*Math.round((E.WEAPONS[type].hp+8*(power-1))*1.35));
 assert.equal(r.parts[0].maxHealth,2*Math.round((22+r.config.armor*10)*1.35));
 assert.equal(r.parts.find(p=>p.kind==='drive').maxHealth,2*Math.round((32+r.config.motor*4)*1.35));
});
test('One thousand generated fields have safe starts, nonoverlapping hazards, and all supply pairs',()=>{
 const seen=new Set();let sizes=new Set();
 for(let seed=0;seed<1000;seed++){
  const f=E.createField(seed);assert.ok([4,6].includes(f.hazards.length));assert.equal(f.pickups.length,16);sizes.add(f.hazards.length);
  assert.ok(new Set(f.hazards.map(h=>h.type)).size>=2);
  for(let i=0;i<f.hazards.length;i++){
   const h=f.hazards[i];seen.add(h.type);
   assert.ok(h.x-h.r>E.BOUNDS.min&&h.x+h.r<E.BOUNDS.max&&h.y-h.r>E.BOUNDS.min&&h.y+h.r<E.BOUNDS.max);
   for(const x of [190,610])assert.ok(Math.hypot(h.x-x,h.y-400)>=h.r+118);
   for(let j=i+1;j<f.hazards.length;j++)assert.ok(Math.hypot(h.x-f.hazards[j].x,h.y-f.hazards[j].y)>=h.r+f.hazards[j].r+38-1e-6);
  }
  for(const p of f.pickups)for(const h of f.hazards)assert.ok(Math.hypot(p.x-h.x,p.y-h.y)>=p.r+h.r+78-1e-6);
 }
 assert.equal(seen.size,5);assert.equal(sizes.size,2);
});
test('Both hazards and supplies are mirrored with equal tool type, power and timing',()=>{
 const f=E.createField(9988);
 for(const items of [f.hazards,f.pickups])for(let i=0;i<items.length;i+=2){
  const[a,b]=items.slice(i,i+2);assert.equal(a.x+b.x,800);assert.equal(a.y+b.y,800);assert.equal(a.r,b.r);
  assert.equal(a.type,b.type);assert.equal(a.phase,b.phase);assert.equal(a.period,b.period);
  assert.equal(a.kind,b.kind);assert.equal(a.toolType,b.toolType);assert.equal(a.power,b.power);assert.equal(a.spawnAt,b.spawnAt);
 }
});
test('Different seeds change type mix, geometry, timing, and tool rewards',()=>{
 const fields=Array.from({length:20},(_,i)=>E.createField(i));
 assert.equal(new Set(fields.map(f=>JSON.stringify(f))).size,20);
 assert.ok(new Set(fields.map(f=>f.hazards.map(h=>h.type).join(','))).size>5);
 assert.ok(new Set(fields.map(f=>f.pickups[2].toolType)).size>3);
 assert.deepEqual(E.createField(123),E.createField(123));
});
test('Supply refreshes at 30, 60 and 90 seconds, but not at the 120-second finish',()=>{
 const s=E.createMatch(passive,passive,91);
 for(const time of [0,29.99,30,59.99,60,89.99,90,119.99]){s.time=time;const available=s.pickups.filter(p=>E.pickupAvailable(s,p));assert.equal(available.length,4);assert.ok(available.every(p=>p.spawnAt===Math.floor(time/30)*30));}
 s.time=60;assert.equal(s.pickups.filter(p=>E.pickupAvailable(s,p)).length,4);
 s.time=120;assert.equal(s.pickups.filter(p=>E.pickupAvailable(s,p)).length,0);
});
test('Every roster and team mode has four safe mirrored supplies per wave without accumulation',()=>{
 const layouts=[...Array.from({length:7},(_,i)=>({mode:'ffa',count:i+2})),
  ...Object.entries(E.BATTLE_MODES).filter(([,m])=>m.teams).map(([mode,m])=>({mode,count:m.count}))];
 for(const {mode,count} of layouts)for(let seed=0;seed<40;seed++){
  const field=E.createField(seed,count,mode),starts=E.spawnsFor(count,mode);
  assert.deepEqual(field,E.createField(seed,count,mode));
  if(count===2)assert.ok([4,6].includes(field.hazards.length));
  else assert.equal(field.hazards.length,4);
  assert.equal(field.pickups.length,16);
  for(const time of [0,29.99,30,59.99,60,89.99,90,119.99]){
   const available=field.pickups.filter(p=>E.pickupAvailable({time},p));
   assert.equal(available.length,4,`${mode}/${count} seed ${seed} at ${time}s`);
   for(const kind of ['repair','tool']){
    const pair=available.filter(p=>p.kind===kind);assert.equal(pair.length,2);
    const [a,b]=pair;
    assert.equal(a.x+b.x,800);assert.equal(a.y+b.y,800);
    assert.equal(a.r,b.r);assert.equal(a.toolType,b.toolType);assert.equal(a.power,b.power);
    for(const p of pair){
     assert.equal(p.spawnAt,Math.floor(time/30)*30);assert.equal(p.expiresAt,p.spawnAt+30);
     assert.ok(p.x-p.r>E.BOUNDS.min&&p.x+p.r<E.BOUNDS.max&&p.y-p.r>E.BOUNDS.min&&p.y+p.r<E.BOUNDS.max);
     for(const start of starts)assert.ok(Math.hypot(p.x-start.x,p.y-start.y)>=p.r+(count>2?35:58)-1e-7);
     for(const h of field.hazards)assert.ok(Math.hypot(p.x-h.x,p.y-h.y)>=p.r+h.r+(count>2?35:78)-1e-7);
     for(const other of available)if(p!==other)assert.ok(Math.hypot(p.x-other.x,p.y-other.y)>=p.r+other.r+(count>2?35:78)-1e-7);
    }
   }
  }
  assert.equal(field.pickups.filter(p=>E.pickupAvailable({time:120},p)).length,0);
 }
});
test('All five hazard types damage the chassis and components while active',()=>{
 for(const type of Object.keys(E.HAZARDS)){
  const s=match(),r=s.robots[0];s.hazards=[{id:0,type,x:r.x,y:r.y,r:36,phase:0}];
  const hp=r.health,part=r.tools[0].health;E.applyHazards(s,r,1/60);
  assert.ok(r.health<hp,type);assert.ok(r.tools[0].health<part,type);
 }
});
test('Pulsing hazards show a warning and do no damage while inactive',()=>{
 for(const type of ['fire','spikes','electric']){
  const s=match(),r=s.robots[0],h={type,x:r.x,y:r.y,r:35,phase:0,period:6,duty:.3};s.hazards=[h];
  s.time=4;assert.equal(E.hazardActive(h,s.time),false);const before=r.health;E.applyHazards(s,r,.1);assert.equal(r.health,before);
  s.time=5.5;assert.equal(E.hazardWarning(h,s.time),true);s.time=6;assert.equal(E.hazardActive(h,s.time),true);
 }
});
test('Tesla pads drain energy and high airborne robots avoid floor hazards',()=>{
 const s=match(),r=s.robots[0];s.hazards=[{type:'electric',x:r.x,y:r.y,r:35,phase:0}];E.applyHazards(s,r,.1);assert.equal(r.energy,97.6);
 for(const type of Object.keys(E.HAZARDS)){s.hazards=[{type,x:r.x,y:r.y,r:35,phase:0}];r.z=80;const before=r.health;E.applyHazards(s,r,.1);assert.equal(r.health,before);}
});
test('A repair kit heals 30 percent of max HP and 25 percent of surviving component HP',()=>{
 const s=match(),r=s.robots[0];r.health=20;r.parts[0].health=1;r.tools[0].health=1;
 const p=give(s,'repair');assert.equal(r.health,20+r.stats.hp*.30);assert.equal(r.parts[0].health,1+r.parts[0].maxHealth*.25);assert.equal(r.tools[0].health,1+r.tools[0].maxHealth*.25);
 assert.equal(p.collectedBy,0);assert.equal(r.repairsCollected,1);assert.ok(s.events.some(e=>e.type==='repair'));
});
test('Healing never exceeds max health, revives broken parts, or repairs a destroyed robot',()=>{
 const s=match(),r=s.robots[0];r.health=r.stats.hp-1;E.damageComponent(s,r,r.tools[0],999);give(s,'repair');assert.equal(r.health,r.stats.hp);assert.equal(r.tools[0].health,0);assert.equal(r.tools[0].broken,true);
 r.health=0;const p=give(s,'repair');assert.equal(r.health,0);assert.equal(p.collectedBy,null);
});
test('Healthy robots leave repair kits for later but damaged components can consume them',()=>{
 const s=match(),r=s.robots[0],p=give(s,'repair');assert.equal(p.collectedBy,null);
 r.parts[0].health--;E.collectPickups(s);assert.equal(p.collectedBy,0);assert.equal(r.health,r.stats.hp);
});
test('Tool pickup mounts an extra tool without modifying the saved blueprint or spending points',()=>{
 const s=match(),r=s.robots[0],before=JSON.stringify(r.config),cost=r.stats.cost,mass=r.stats.mass,speed=r.stats.speed;
 const p=give(s,'tool',{toolType:'hammer',power:2}),bonus=r.tools.find(t=>t.bonus);
 assert.equal(JSON.stringify(r.config),before);assert.equal(r.stats.cost,cost);assert.equal(bonus.type,'hammer');assert.equal(bonus.power,2);assert.equal(p.collectedBy,0);
 assert.ok(Math.abs(bonus.x)<=r.stats.radius&&Math.abs(bonus.y)<=r.stats.radius);assert.ok(r.stats.mass>mass);assert.ok(r.stats.speed<speed);
 assert.equal(bonus.health,E.toolStats(bonus).hp);assert.equal(bonus.cooldown,.6);
});
test('A fully built six-tool robot can pick up two extras for eight combat tools',()=>{
 const s=E.createMatch(E.loadouts.arsenal,passive,12);s.pickups=[];const r=s.robots[0];Object.assign(r,{x:300,y:300});
 give(s,'tool');give(s,'tool',{toolType:'drill'});assert.equal(r.tools.length,8);assert.equal(r.config.tools.length,6);assert.equal(E.cost(r.config),160);
 const p=give(s,'tool');assert.equal(p.collectedBy,null);assert.equal(r.tools.length,8);
});
test('A broken bonus slot can be replaced without removing any original tool',()=>{
 const s=match(),r=s.robots[0];give(s,'tool');give(s,'tool',{toolType:'drill'});const b=r.tools.find(t=>t.bonus),id=b.id;
 E.damageComponent(s,r,b,999);const mass=r.stats.mass;give(s,'tool',{toolType:'ram'});
 assert.equal(r.tools.find(t=>t.id===id).type,'ram');assert.equal(r.tools.find(t=>t.id===id).broken,false);assert.ok(r.stats.mass>mass);assert.equal(r.tools.filter(t=>t.bonus).length,2);assert.equal(r.tools[0].id,'t1');
});
test('Pickup is contact-based; airborne robots and distant robots cannot collect',()=>{
 const s=match(),r=s.robots[0];r.health=1;r.z=20;const p=give(s,'repair');assert.equal(p.collectedBy,null);
 r.z=0;r.x=400;E.collectPickups(s);assert.equal(p.collectedBy,null);r.x=300;E.collectPickups(s);assert.equal(p.collectedBy,0);
});
test('A pickup is consumed only once, by the closest eligible robot',()=>{
 const s=match(),[a,b]=s.robots;a.health=1;b.health=1;Object.assign(b,{x:302,y:300});const p=give(s,'repair');
 assert.equal(p.collectedBy,0);assert.equal(b.health,1);const health=a.health;E.collectPickups(s);assert.equal(a.health,health);
});
test('Exact pickup ties are deterministic, not permanently biased to player zero',()=>{
 const winners=[];for(let seed=0;seed<2;seed++){
  const s=match();s.seed=seed;s.robots.forEach(r=>Object.assign(r,{x:300,y:300,health:1}));winners.push(give(s,'repair').collectedBy);
 }
 assert.deepEqual(winners.sort(),[0,1]);
});
test('Items cannot be collected before spawn or after expiry',()=>{
 const s=match(),r=s.robots[0];r.health=1;const p=give(s,'repair',{spawnAt:30,expiresAt:60});assert.equal(p.collectedBy,null);
 s.time=60;E.collectPickups(s);assert.equal(p.collectedBy,null);s.time=35;E.collectPickups(s);assert.equal(p.collectedBy,0);
});
test('New sensors identify useful repair kits, bonuses, and attached bonus tools',()=>{
 const s=match(),[a,b]=s.robots;s.pickups=[drop('repair',{x:400}),drop('tool',{id:1,x:350})];
 assert.equal(E.sensors(s,a,b).repair,false);assert.equal(E.sensors(s,a,b).pickup,true);a.health--;assert.equal(E.sensors(s,a,b).repair,true);
 a.x=350;E.collectPickups(s);assert.equal(E.sensors(s,a,b).bonus,true);
});
test('Visual collect and repair actions steer to the relevant item',()=>{
 for(const kind of ['tool','repair']){
  const s=match(),r=s.robots[0];r.health=30;r.config.rules=[{when:'always',do:kind==='tool'?'collect':'repair'}];s.pickups=[drop(kind,{x:390})];
  for(let i=0;i<240;i++)E.step(s);
  assert.equal(s.pickups[0].collectedBy,0);assert.ok(r.x>330);
 }
});
test('Activate all tools includes extras; bonus action selects extras; normal slots stay stable',()=>{
 const s=match(),[a,b]=s.robots;give(s,'tool',{toolType:'ram'});const t=a.tools.find(t=>t.bonus);Object.assign(t,{x:20,y:0,angle:0,cooldown:0});
 Object.assign(a,{x:370,y:400,angle:0,action:'bonus'});Object.assign(b,{x:425,y:400,angle:Math.PI});
 let hits=E.collectAttacks(s,a,b);assert.equal(hits.length,1);assert.equal(hits[0].tool.id,t.id);
 a.action='tool2';assert.equal(E.collectAttacks(s,a,b).length,0);
 a.action='weapon';assert.ok(E.collectAttacks(s,a,b).some(h=>h.tool.bonus));
 const energy=a.energy;E.resolveAttacks(s,[hits[0]]);assert.equal(a.energy,energy-t.stats.energy);assert.equal(t.cooldown,t.stats.cooldown);
});
test('Match reset removes loot, restores base components and keeps the unchanged saved design',()=>{
 const s=match(),r=s.robots[0],original=JSON.stringify(r.config);give(s,'tool');r.health=10;give(s,'repair');
 const next=E.createMatch(r.config,s.robots[1].config,99);assert.equal(JSON.stringify(r.config),original);assert.equal(next.robots[0].tools.length,r.config.tools.length);assert.equal(next.robots[0].bonusCollected,0);assert.equal(next.robots[0].health,next.robots[0].stats.hp);
});
test('Blueprint validation strips forged bonus flags, power, durability and runtime inventory',()=>{
 const raw={...E.loadouts.arsenal,bonusCollected:99,tools:Array(8).fill({id:'b1',type:'ram',bonus:true,power:99,x:999,y:999,health:999,stats:{damage:9999}})};
 const c=E.normalizeConfig(raw);assert.ok(c.tools.length<=6&&E.cost(c)<=E.BUDGET);assert.ok(c.tools.every(t=>!('bonus'in t)&&!('health'in t)&&!('stats'in t)));
});
test('Replay from a serialized snapshot preserves loot, repair, timing and full deterministic state',()=>{
 const a=match();a.robots[0].health=40;give(a,'repair');give(a,'tool');a.pickups.push(drop('tool',{id:3,x:340,spawnAt:1}));
 const b=JSON.parse(JSON.stringify(a));for(let i=0;i<180;i++){E.step(a);E.step(b);}assert.deepEqual(a,b);
});
