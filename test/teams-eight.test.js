'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../public/engine');
const passive={name:'HUMAN',tools:[],rules:[{when:'always',do:'brake'}]};
const make=(mode='2v2',seed=12)=>E.createBattle(Array(E.BATTLE_MODES[mode].count||8).fill(passive),seed,mode);
const empty=s=>{s.hazards=[];s.pickups=[];s.walls.forEach(w=>{w.broken=true;w.health=0;});return s;};

test('Eight seats retain 300 HP, 200 budget, 120 seconds, 150 walls, and 10s pickup lock',()=>{
 assert.equal(E.MAX_BOTS,8);assert.equal(E.CHASSIS_HP,300);assert.equal(E.BUDGET,200);assert.equal(E.MAX_SECONDS,120);assert.equal(E.WALL_HP,150);assert.equal(E.PICKUP_COOLDOWN,10);
 for(const n of [7,8]){const s=E.createPracticeBattle(passive,n,16);assert.equal(s.robots.length,n);assert.equal(s.robots.filter(r=>r.controller==='bot').length,n-1);assert.equal(s.hazards.length,4);assert.deepEqual(s.robots[0].config,E.normalizeConfig(passive));}
 for(const n of [0,1,9,1.5,NaN])assert.throws(()=>E.spawnsFor(n),RangeError);
});
test('Complex replacement bodies preserve IDs and profiles; Cross remains unchanged',()=>{
 const labels={diamond:'Manta',octagon:'Bastion',capsule:'Twin Hull'};
 assert.deepEqual(E.BODIES.cross,{label:'Cross',cost:30,mass:21,radius:26,turn:.94});
 for(const [id,label] of Object.entries(labels)){
  assert.equal(E.BODIES[id].label,label);assert.equal(E.normalizeConfig({...passive,body:id}).body,id);
  const g=E.BODY_GEOMETRY[id];assert.ok(g.outline.length>=16);assert.ok(g.ribs.length>=3);
  assert.ok(g.outline.flat().every(v=>Number.isFinite(v)&&Math.abs(v)<=1));
  assert.equal(new Set(g.outline.map(p=>p.join(','))).size,g.outline.length);
 }
 assert.deepEqual(Object.keys(E.BODY_GEOMETRY),['diamond','octagon','capsule']);
});
for(const [mode,m] of Object.entries(E.BATTLE_MODES))test(mode+': balanced deterministic rosters, unchanged human designs, and safe spawns',()=>{
 const count=m.count||8,configs=Array.from({length:count},(_,i)=>E.normalizeConfig({...passive,name:'PLAYER '+i,body:Object.keys(E.BODIES)[i],motor:2+i%4}));
 const s=E.createBattle(configs,456,mode);assert.deepEqual(s,E.createBattle(configs,456,mode));assert.deepEqual(s.robots.map(r=>r.config),configs);
 assert.ok(s.robots.every(r=>r.controller==='player'));
 if(m.teams)for(let t=0;t<m.teams;t++)assert.equal(s.robots.filter(r=>r.team===t).length,m.teamSize);
 else assert.ok(s.robots.every(r=>r.team===null));
 for(const r of s.robots){assert.ok(r.x-r.stats.radius>E.BOUNDS.min&&r.x+r.stats.radius<E.BOUNDS.max&&r.y-r.stats.radius>E.BOUNDS.min&&r.y+r.stats.radius<E.BOUNDS.max);
  for(const other of s.robots)if(other!==r)assert.ok(Math.hypot(r.x-other.x,r.y-other.y)>r.stats.radius+other.stats.radius+50);
 }
 if(m.count)assert.throws(()=>E.createBattle(configs.slice(1),5,mode),RangeError);
 for(let seed=0;seed<45;seed++){
  const f=E.createField(seed,count,mode),spawns=E.spawnsFor(count,mode);
  if(count>=6)assert.equal(f.hazards.length,4);
  assert.deepEqual(f,E.createField(seed,count,mode));
  for(const h of f.hazards)for(const r of spawns)assert.ok(Math.hypot(r.x-h.x,r.y-h.y)>=82+h.r-1e-7);
 }
});
test('Invalid modes and hostile team fields cannot bypass mode or budget validation',()=>{
 for(const mode of ['__proto__','constructor','invalid',null,{},[]])assert.throws(()=>E.createBattle([passive,passive],3,mode),RangeError);
 const s=E.createBattle(Array(4).fill({...passive,team:99}),12,'2v2');assert.deepEqual(s.robots.map(r=>r.team),[0,1,0,1]);
 assert.ok(s.robots.every(r=>!Object.hasOwn(r.config,'team')));
});
test('Nearest enemy ignores a much closer living teammate',()=>{
 const s=make(),[r,a,b,c]=s.robots;Object.assign(r,{x:400,y:400});Object.assign(b,{x:402,y:400});Object.assign(a,{x:470,y:400});Object.assign(c,{x:650,y:650});
 assert.equal(E.nearestEnemy(s,r),a);a.alive=false;assert.equal(E.nearestEnemy(s,r),c);c.alive=false;assert.equal(E.nearestEnemy(s,r),null);
});
for(const type of Object.keys(E.WEAPONS))test(type+': no targeting, damage, or launch impulse against allies',()=>{
 const attacker={name:'ATTACKER',tools:[{type,x:20,y:0,angle:0,power:1}],rules:[{when:'always',do:'weapon'}]};
 const s=empty(E.createBattle([attacker,passive,passive,passive],12,'2v2')),[r,e,ally,other]=s.robots;
 Object.assign(r,{x:350,y:400,angle:0,action:'weapon'});Object.assign(e,{x:415,y:400});Object.assign(ally,{x:415,y:400});Object.assign(other,{x:640,y:640});
 const before=JSON.stringify(ally),attacks=E.collectAttacks(s,r);
 assert.ok(attacks.length>0,type+' has a target');assert.ok(attacks.every(a=>a.hit.target!==ally));E.resolveAttacks(s,attacks);
 for(let i=0;i<125;i++){E.stepProjectiles(s,E.STEP);E.stepFlames(s,E.STEP);E.stepContact(s,E.STEP);}
 assert.equal(JSON.stringify(ally),before,type+' must not affect teammate');assert.ok(e.health<300||e.parts.some(p=>p.health<p.maxHealth),type+' hits enemy');
});
test('Rocket splash protects nearby allies and shooter in teams, but damages enemies',()=>{
 const s=empty(E.createBattle([{tools:[{type:'rocket',x:20,y:0}],rules:[{when:'always',do:'weapon'}]},passive,passive,passive],9,'2v2'));
 const [r,e,ally,other]=s.robots;Object.assign(r,{x:350,y:400,angle:0,action:'weapon'});Object.assign(e,{x:418,y:400});Object.assign(ally,{x:410,y:420});Object.assign(other,{x:425,y:420});
 const a=JSON.stringify(ally),hp=r.health;E.resolveAttacks(s,E.collectAttacks(s,r));for(let i=0;i<50;i++)E.stepProjectiles(s,E.STEP);
 assert.equal(JSON.stringify(ally),a);assert.equal(r.health,hp);assert.ok(other.health<300);assert.ok(e.health<300);
});
test('Allied bodies remain solid but their mutual collision does not deal HP damage',()=>{
 const s=empty(make());const a=s.robots[0],b=s.robots[2];Object.assign(a,{x:350,y:400,vx:300});Object.assign(b,{x:390,y:400,vx:-300});
 E.collideRobots(s);assert.equal(a.health,300);assert.equal(b.health,300);assert.ok(b.x-a.x>=a.stats.radius+b.stats.radius-1e-8);assert.ok(a.vx<300&&b.vx>-300);
});
test('Hazards remain dangerous in team modes and pickup cooldowns remain individual',()=>{
 const s=make(),a=s.robots[0],b=s.robots[2];a.health=b.health=100;s.hazards=[{type:'grinder',x:a.x,y:a.y,r:35}];E.applyHazards(s,a,1);assert.ok(a.health<100);
 s.pickups=[a,b].map((r,i)=>({id:i,kind:'repair',x:r.x,y:r.y,r:12,spawnAt:0,expiresAt:30,collectedBy:null}));E.collectPickups(s);
 assert.equal(a.pickupCooldown,10);assert.equal(b.pickupCooldown,10);assert.equal(s.pickups.filter(p=>p.collectedBy!==null).length,2);
});
test('Team victory waits for the whole opposing team, not one eliminated robot',()=>{
 const s=make();s.robots[1].alive=false;s.robots[1].eliminatedAt=4;E.finishIfNeeded(s);assert.equal(s.status,'running');
 s.robots[3].alive=false;s.robots[3].eliminatedAt=5;s.time=5;E.finishIfNeeded(s);assert.equal(s.status,'finished');assert.equal(s.result.draw,false);assert.equal(s.result.winnerTeam,0);assert.deepEqual(s.result.winners,[0,2]);
});
test('Winning teammates share victory even when one was eliminated earlier',()=>{
 const s=make();for(const i of [1,2,3]){s.robots[i].alive=false;s.robots[i].eliminatedAt=i;s.robots[i].reason='Out of the arena';}
 s.time=5;E.finishIfNeeded(s);assert.deepEqual(s.result.winners,[0,2]);assert.equal(s.result.teamStandings[0].health,300);assert.equal(s.result.teamStandings[0].aliveCount,1);
});
test('Time ranks teams by surviving total HP, not strongest robot or survivor count',()=>{
 const s=make('4v4');[250,120,1,120,1,120,1,120].forEach((hp,i)=>s.robots[i].health=hp);s.time=120;E.finishIfNeeded(s);
 assert.equal(s.result.winnerTeam,1);assert.equal(s.result.teamStandings[0].health,480);assert.equal(s.result.draw,false);assert.equal(s.result.standings.length,8);
});
test('Exact team-health ties share first; no rounding can manufacture a tie',()=>{
 const a=make();[100,140,100,60].forEach((hp,i)=>a.robots[i].health=hp);a.time=120;E.finishIfNeeded(a);assert.equal(a.result.draw,true);assert.deepEqual(a.result.winnerTeams,[0,1]);
 const b=make();[100,140.00000001,100,60].forEach((hp,i)=>b.robots[i].health=hp);b.time=120;E.finishIfNeeded(b);assert.equal(b.result.draw,false);assert.equal(b.result.winnerTeam,1);
});
test('Eliminated robots do not contribute surviving team HP',()=>{
 const s=make();s.robots[0].health=300;s.robots[0].alive=false;s.robots[0].eliminatedAt=50;s.robots[2].health=50;s.robots[1].health=60;s.robots[3].health=60;s.time=120;E.finishIfNeeded(s);
 assert.equal(s.result.winnerTeam,1);assert.equal(s.result.teamStandings.find(t=>t.id===0).health,50);
});
test('Three and four teams keep fighting until only one team remains',()=>{
 for(const mode of ['2v2v2','2v2v2v2']){const s=make(mode);s.robots.filter(r=>r.team===0).forEach(r=>r.alive=false);E.finishIfNeeded(s);assert.equal(s.status,'running');
  s.robots.filter(r=>r.team!==1).forEach(r=>r.alive=false);E.finishIfNeeded(s);assert.equal(s.status,'finished');assert.equal(s.result.winnerTeam,1);assert.equal(s.result.draw,false);
 }
});
test('Team metadata survives JSON snapshots and all eight players remain human outside practice',()=>{
 const a=make('4v4'),b=JSON.parse(JSON.stringify(a));for(let i=0;i<120;i++){E.step(a);E.step(b);}assert.deepEqual(a,b);assert.ok(a.robots.every(r=>r.controller==='player'));
});
test('Every team mode can finish a full random match with finite physics and complete standings',()=>{
 for(const [mode,m] of Object.entries(E.BATTLE_MODES)){
  for(const seed of [4,41]){const s=E.createPracticeBattle(passive,m.count||8,seed,mode);let steps=0;while(s.status==='running'&&steps++<7800)E.step(s);
   assert.equal(s.status,'finished',mode);assert.equal(s.result.standings.length,m.count||8);assert.ok(s.robots.every(r=>[r.x,r.y,r.health,r.energy,r.angle].every(Number.isFinite)));if(m.teams)assert.equal(s.result.teamStandings.length,m.teams);
  }
 }
});
