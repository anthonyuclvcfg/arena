'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../public/engine');
const passive={rules:[{when:'always',do:'brake'}]};
function match(seed=1234){return E.createMatch(passive,passive,seed);}
function finish(m){let count=0;while(m.status==='running'&&count++<Math.ceil((E.MAX_SECONDS+5)/E.STEP))E.step(m);return m;}
const tool=(type='ram',power=1,x=20,y=0,angle=0)=>({type,power,x,y,angle});
function duel(tools=[tool()],enemyTools=[]){
 const a={motor:1,armor:1,tools,rules:[{when:'always',do:'weapon'}]},b={motor:1,armor:1,tools:enemyTools,...passive};
 const s=E.createMatch(a,b,1);s.hazards=[];
 Object.assign(s.robots[0],{x:370,y:400,angle:0,action:'weapon'});Object.assign(s.robots[1],{x:425,y:400,angle:Math.PI,action:'brake'});
 return s;
}

test('Validates a bounded, non-executable configuration and rejects prototype keys',()=>{
 const c=E.normalizeConfig({name:'<script>\nRobot',body:'__proto__',weapon:'constructor',mount:'toString',motor:100,armor:100,
 lines:[[Infinity,0,0,0],[99,-99,1,2]],rules:[{when:'always',do:'eval'},{when:'near',do:'weapon'}]});
 assert.ok(E.cost(c)<=E.BUDGET);assert.equal(c.body,'wedge');assert.equal(c.tools[0].type,'flipper');assert.equal(c.tools[0].angle,0);
 assert.deepEqual(c.lines,[[32,-32,2,2]]);assert.equal(c.rules.length,1);assert.ok(!/[<>\n]/.test(c.name));
});
test('Limits configurations to six tools, twelve rules and 28 decorative lines',()=>{
 const c=E.normalizeConfig({motor:1,armor:1,tools:Array(99).fill(tool('plow')),rules:Array(99).fill({when:'always',do:'push'}),lines:Array(100).fill([0,0,2,2])});
 assert.equal(c.tools.length,6);assert.equal(c.rules.length,12);assert.equal(c.lines.length,28);
});
test('Normalizes invalid numbers, rotations, duplicate IDs and mounting coordinates',()=>{
 const c=E.normalizeConfig({tools:[{id:'same',type:'__proto__',x:Infinity,y:-999,angle:-95,power:20},{id:'same',type:'ram',x:999,y:NaN,angle:999999,power:NaN}],motor:1,armor:1});
 assert.equal(c.tools[0].type,'ram');assert.equal(c.tools[0].y,-24);assert.equal(c.tools[0].angle,265);
 assert.equal(c.tools[1].x,24);assert.equal(c.tools[1].power,1);assert.notEqual(c.tools[0].id,c.tools[1].id);
 assert.ok(c.tools.every(t=>[t.x,t.y,t.angle,t.power].every(Number.isFinite)));
});
test('Free XY mounts and arbitrary angles survive normalization',()=>{
 const c=E.normalizeConfig({tools:[tool('drill',2,-7.5,11.2,137.5)],motor:1,armor:1});
 assert.equal(c.tools[0].x,-7.5);assert.equal(c.tools[0].y,11.2);assert.equal(c.tools[0].angle,137.5);
 assert.deepEqual(E.normalizeConfig(c),c,'Normalization is idempotent');
});
test('Migration maps all four legacy mounts to equivalent tool orientations',()=>{
 for(const [mount,angle] of [['front',0],['right',90],['back',180],['left',270]]){
  const c=E.normalizeConfig({name:'Original robot',body:'hex',weapon:'plow',mount,motor:3,armor:2,...passive});
  assert.equal(c.tools[0].angle,angle);assert.equal(c.tools[0].type,'plow');assert.equal(c.name,'Original robot');assert.deepEqual(c.rules,passive.rules);
 }
});
test('All catalog tools have increasing damage, cost, mass and cooldown with power',()=>{
 assert.equal(Object.keys(E.WEAPONS).length,9);
 for(const type of Object.keys(E.WEAPONS))for(const p of [1,2]){
  const lo=E.toolStats(tool(type,p)),hi=E.toolStats(tool(type,p+1));
  for(const key of ['damage','wallDamage','cost','mass','cooldown','hp','energy'])assert.ok(hi[key]>lo[key],type+': '+key);
 }
});
test('Every preset fits the same 200-point budget without silent adjustment',()=>{
 for(const l of Object.values(E.loadouts)){
  const c=E.normalizeConfig(l);assert.ok(E.cost(c)<=E.BUDGET);assert.equal(c.tools.length,l.tools.length);assert.equal(c.armor,l.armor);assert.equal(c.motor,l.motor);
 }
});
test('Untrusted over-budget arsenals are bounded deterministically',()=>{
 const raw={body:'hex',motor:5,armor:5,tools:Array(6).fill(tool('hammer',3))};
 const c=E.normalizeConfig(raw);assert.ok(E.cost(c)<=E.BUDGET);assert.deepEqual(E.normalizeConfig(raw),c);assert.ok(c.motor>=1&&c.armor>=1);
});
test('A robot can have no mounted tools and still move or push',()=>{
 const c=E.normalizeConfig({tools:[]});assert.equal(c.tools.length,0);assert.ok(E.stats(c).speed>0);
 const s=E.createMatch({...c,rules:[{when:'always',do:'push'}]},passive);for(let i=0;i<120;i++)E.step(s);assert.ok(s.robots[0].x>190);
});
test('Same seed and blueprints produce identical full simulation including damage',()=>{
 const a=finish(E.createMatch(E.loadouts.dual,E.rivals[0],888)),b=finish(E.createMatch(E.loadouts.dual,E.rivals[0],888));
 assert.deepEqual(a,b);assert.equal(a.status,'finished');assert.ok(a.robots.some(r=>[...r.parts,...r.tools].some(p=>p.broken)), 'Broken components persist even after their log events expire');
});
test('Hazards remain reproducible and rotationally symmetric',()=>{
 const s=match(99);assert.notDeepEqual(s.hazards,match(100).hazards);
 for(const [a,b] of [[s.hazards[0],s.hazards[1]],[s.hazards[2],s.hazards[3]]]){
  assert.ok(Math.abs(a.x+b.x-800)<1e-8);assert.ok(Math.abs(a.y+b.y-800)<1e-8);assert.equal(a.phase,b.phase);
 }
 assert.equal(s.walls.length,48);assert.ok(s.walls.every(w=>w.health===E.WALL_HP));
});
test('First matching rule wins; unmatched rules brake',()=>{
 const s=match();s.robots[0].config.rules=[{when:'always',do:'retreat'},{when:'always',do:'push'}];
 E.step(s);assert.equal(s.robots[0].action,'retreat');assert.equal(s.robots[0].ruleIndex,0);
 s.robots[0].config.rules=[{when:'low',do:'push'}];s.tick=6;E.step(s);assert.equal(s.robots[0].action,'brake');
});
test('Readiness and damaged-component sensors use real state',()=>{
 const s=duel(),[a,b]=s.robots;assert.equal(E.sensors(s,a,b).ready,true);assert.equal(E.sensors(s,a,b).damaged,false);
 a.tools[0].cooldown=1;assert.equal(E.sensors(s,a,b).ready,false);
 E.damageComponent(s,a,a.tools[0],999);assert.equal(E.sensors(s,a,b).damaged,true);
});
test('A successful attack consumes energy, damages health and starts its own cooldown',()=>{
 const s=duel(),[a,b]=s.robots,hp=b.health,energy=a.energy;
 const hits=E.collectAttacks(s,a,b);assert.equal(hits.length,1);E.resolveAttacks(s,hits);
 assert.ok(b.health<hp);assert.equal(a.energy,energy-a.tools[0].stats.energy);assert.equal(a.tools[0].cooldown,a.tools[0].stats.cooldown);
 assert.equal(E.collectAttacks(s,a,b).length,0);
});
test('The same tool cannot strike again before its cooldown ends',()=>{
 const s=duel(),[a,b]=s.robots;E.resolveAttacks(s,E.collectAttacks(s,a,b));
 a.tools[0].cooldown=.001;assert.equal(E.collectAttacks(s,a,b).length,0);a.tools[0].cooldown=0;assert.equal(E.collectAttacks(s,a,b).length,1);
});
test('Mounted tools have independent cooldowns and independent health',()=>{
 const s=duel([tool('ram',1,20,-5),tool('saw',1,20,5)]),[a,b]=s.robots;a.tools[0].cooldown=3;
 const hits=E.collectAttacks(s,a,b);assert.equal(hits.length,1);assert.equal(hits[0].tool.type,'saw');
 const other=a.tools[1].health;E.damageComponent(s,a,a.tools[0],999);assert.equal(a.tools[1].health,other);assert.equal(a.tools[1].broken,false);
});
test('An individual slot action only fires that mounted tool',()=>{
 const s=duel([tool('ram',1,20,-5),tool('saw',1,20,5)]),[a,b]=s.robots;a.action='tool2';
 const hits=E.collectAttacks(s,a,b);assert.equal(hits.length,1);assert.equal(hits[0].tool.id,'t2');a.action='tool4';assert.equal(E.collectAttacks(s,a,b).length,0);
});
test('Tool placement and full-angle rotation change what an attack can reach',()=>{
 const s=duel(),[a,b]=s.robots;assert.equal(E.collectAttacks(s,a,b).length,1);
 a.tools[0].angle=180;assert.equal(E.collectAttacks(s,a,b).length,0);
 a.tools[0].angle=0;a.tools[0].y=-24;b.y=425;assert.equal(E.collectAttacks(s,a,b).length,0);
 a.tools[0].y=24;assert.equal(E.collectAttacks(s,a,b).length,1);
});
test('Low energy and out-of-range targets do not create attacks or cooldowns',()=>{
 const s=duel(),[a,b]=s.robots;a.energy=0;assert.equal(E.collectAttacks(s,a,b).length,0);a.energy=100;b.x=600;
 assert.equal(E.collectAttacks(s,a,b).length,0);assert.equal(a.tools[0].cooldown,0);
});
test('Broken tools stop attacking but do not destroy an otherwise healthy robot',()=>{
 const s=duel(),[a,b]=s.robots,hp=a.health;E.damageComponent(s,a,a.tools[0],999,'test');
 assert.equal(a.health,hp);assert.equal(a.alive,true);assert.equal(E.collectAttacks(s,a,b).length,0);
 assert.ok(s.events.some(e=>e.type==='part'));assert.equal(s.debris.length,1);E.damageComponent(s,a,a.tools[0],999);assert.equal(s.debris.length,1);
});
test('A mounted enemy tool physically intercepts a hit and can be destroyed',()=>{
 const s=duel([tool('hammer',3)],[tool('saw')]),[a,b]=s.robots;
 // Fixed-size active hammer head: x417..426. The receiver's visible saw disk
 // is centered at424 with radius10, ahead of its hull; power adds no reach.
 b.x=460;
 const hits=E.collectAttacks(s,a,b);assert.equal(hits[0].hit.component.kind,'tool');E.resolveAttacks(s,hits);
 assert.equal(b.tools[0].broken,false,'Doubled tool HP survives the first heavy hit');
 assert.ok(b.tools[0].health<b.tools[0].maxHealth);a.tools[0].cooldown=0;a.energy=100;
 E.resolveAttacks(s,E.collectAttacks(s,a,b));
 assert.equal(b.tools[0].broken,true);assert.ok(b.health<b.stats.hp);assert.ok(b.health>0);
});
test('Destroyed armor increases damage to the exposed chassis',()=>{
 const s=duel(),b=s.robots[1],plate=b.parts[0];
 const start=b.health;E.damageRobot(s,b,plate,10,0,1,'test',b.x-20,b.y);const shielded=start-b.health;
 E.damageComponent(s,b,plate,999);const before=b.health;E.damageRobot(s,b,null,10,0,1,'test',b.x-20,b.y);
 assert.ok(before-b.health>shielded);assert.equal(before-b.health,10);
});
test('Broken drive units reduce movement without pretending to simulate drivetrain mechanics',()=>{
 const s=duel(),a=s.robots[0];assert.equal(E.driveFactor(a),1);
 E.damageComponent(s,a,a.parts.find(p=>p.id==='driveL'),999);assert.equal(E.driveFactor(a),.65);
 E.damageComponent(s,a,a.parts.find(p=>p.id==='driveR'),999);assert.ok(Math.abs(E.driveFactor(a)-.3)<1e-9);
});
test('Simultaneous collected attacks both land even if a weapon breaks that tick',()=>{
 const s=duel([tool('hammer',3)],[tool('hammer',3)]),[a,b]=s.robots;b.action='weapon';
 const hits=[...E.collectAttacks(s,a,b),...E.collectAttacks(s,b,a)];assert.equal(hits.length,2);E.resolveAttacks(s,hits);
 assert.ok(a.health<a.stats.hp&&b.health<b.stats.hp);assert.ok(a.tools[0].cooldown>0&&b.tools[0].cooldown>0);
});
test('The flipper still launches an opponent and has its own cooldown',()=>{
 const s=duel([tool('flipper')]),[a,b]=s.robots;E.resolveAttacks(s,E.collectAttacks(s,a,b));
 assert.ok(b.vz>200&&b.vz<250);assert.ok(b.z>0);assert.equal(a.tools[0].cooldown,3.7);assert.ok(s.events.some(e=>e.type==='launch'));
});
test('Intact walls stop low-speed contact without taking continuous contact damage',()=>{
 const s=match(),r=s.robots[0];r.x=E.BOUNDS.min+r.stats.radius+1;r.y=400;r.vx=-70;
 E.step(s);assert.ok(s.walls.every(w=>!w.broken&&w.health===E.WALL_HP));assert.ok(r.x>=E.BOUNDS.min+r.stats.radius);assert.equal(r.alive,true);
});
test('Wall impact damage scales with speed and mass and is capped below full wall HP',()=>{
 assert.equal(E.impactDamage(30,80),0);assert.ok(E.impactDamage(30,220)>E.impactDamage(30,120));
 assert.ok(E.impactDamage(40,150)>E.impactDamage(20,150));assert.equal(E.impactDamage(100,650),E.MAX_IMPACT_DAMAGE);assert.ok(E.MAX_IMPACT_DAMAGE<E.WALL_HP);
});
test('A wall withstands several strong impacts, then its damage becomes a permanent gap',()=>{
 const s=match(),r=s.robots[0],w=s.walls.find(w=>w.side===3&&w.i===5),y=E.BOUNDS.min+E.BOUNDS.size/E.SEGMENTS*5.5;
 const hitsToBreak=Math.ceil(E.WALL_HP/E.MAX_IMPACT_DAMAGE);
 for(let i=0;i<hitsToBreak;i++){
  Object.assign(r,{x:E.BOUNDS.min+r.stats.radius+1,y,vx:-480,vy:0});E.collideWalls(s,r);
  if(i<hitsToBreak-1)assert.equal(w.broken,false);if(i===0)assert.equal(w.health,E.WALL_HP-E.MAX_IMPACT_DAMAGE);
 }
 assert.equal(w.broken,true);assert.equal(w.health,0);assert.equal(w.hits,hitsToBreak);E.step(s);assert.equal(w.broken,true);
});
test('Tools damage walls according to tool type and power, not collision velocity',()=>{
 for(const type of ['hammer','saw','ram']){
  const s=duel([tool(type,1)]),[a,b]=s.robots;Object.assign(a,{x:110,y:373,angle:Math.PI,action:'wall'});b.x=600;
  const hits=E.collectAttacks(s,a,b);assert.equal(hits.length,1);assert.equal(hits[0].hit.kind,'wall');
  E.resolveAttacks(s,hits);if(type==='saw')E.stepContact(s,a.tools[0].stats.cooldown);assert.equal(hits[0].hit.wall.health,E.WALL_HP-E.toolStats(tool(type)).wallDamage);
 }
 assert.ok(E.toolStats(tool('hammer',3)).wallDamage>E.toolStats(tool('hammer',1)).wallDamage);
});
test('Repeated heavy-hammer activations can breach a wall without body impacts',()=>{
 const s=duel([tool('hammer',3)]),[a,b]=s.robots;Object.assign(a,{x:110,y:373,angle:Math.PI,action:'wall'});b.x=600;
 const initial=E.collectAttacks(s,a,b)[0].hit.wall;
 const hits=Math.ceil(E.WALL_HP/a.tools[0].stats.wallDamage);
 for(let i=0;i<hits;i++){a.tools[0].cooldown=0;a.energy=100;E.resolveAttacks(s,E.collectAttacks(s,a,b));if(i<hits-1)assert.equal(initial.broken,false);}
 assert.equal(initial.broken,true);assert.equal(initial.health,0);
});
test('Damaged walls retain damage but a new battle restores all walls and components',()=>{
 const s=duel(),r=s.robots[0],w=s.walls[0];E.damageWall(s,w,50,100,84);E.damageComponent(s,r,r.tools[0],999);E.step(s);
 assert.equal(w.health,E.WALL_HP-50);assert.equal(r.tools[0].broken,true);
 const fresh=E.createMatch(r.config,s.robots[1].config);assert.ok(fresh.walls.every(w=>w.health===E.WALL_HP));assert.ok(fresh.robots[0].tools.every(t=>!t.broken&&t.health===t.maxHealth));
});
test('Crossing above an intact wall remains a valid aerial ring-out',()=>{
 const s=match(),r=s.robots[0];Object.assign(r,{x:E.BOUNDS.min+1,y:400,z:85,vx:-300});E.step(s);
 for(let i=0;i<60&&s.status==='running';i++)E.step(s);assert.equal(s.result.winner,1);assert.equal(s.robots[0].reason,'Aerial ring-out');assert.ok(s.walls.every(w=>!w.broken));
});
test('An open gap allows a ground ring-out',()=>{
 const s=match(),r=s.robots[0];s.walls.filter(w=>w.side===3).forEach(w=>{w.broken=true;w.health=0;});
 r.x=E.BOUNDS.min+1;r.vx=-300;E.step(s);for(let i=0;i<60&&s.status==='running';i++)E.step(s);assert.equal(s.result.winner,1);assert.equal(s.robots[0].reason,'Out of the arena');
});
test('Grinders damage mounted tools as well as the core',()=>{
 const s=match(),r=s.robots[0],h=s.hazards.find(h=>h.type==='grinder');h.phase=0;r.x=h.x;r.y=h.y;const hp=r.tools[0].health;E.step(s);
 assert.ok(r.health<r.stats.hp);assert.ok(r.tools[0].health<hp);r.health=1;for(let i=0;i<3;i++)E.step(s);assert.equal(s.robots[0].reason,'Robot destroyed');
});
test('Airborne robots and tools clear grinders',()=>{
 const s=match(),r=s.robots[0],h=s.hazards.find(h=>h.type==='grinder');r.x=h.x;r.y=h.y;r.z=70;
 const before=r.health,toolHP=r.tools[0].health;E.step(s);assert.equal(r.health,before);assert.equal(r.tools[0].health,toolHP);
});
test('Simultaneous elimination is a draw',()=>{
 const s=match();s.robots.forEach(r=>{r.health=0;});E.step(s);assert.equal(s.result.winner,null);assert.equal(s.result.reason,'Final elimination · exact HP tie');
});
test('Time limit with exactly equal survivor health is a draw',()=>{
 const s=match();s.time=E.MAX_SECONDS-E.STEP/2;E.step(s);assert.equal(s.result.winner,null);assert.match(s.result.reason,/Time expired/);
});
test('Finished matches and zero-duration steps do not advance',()=>{
 const s=match();E.step(s,0);assert.equal(s.tick,0);s.robots[0].health=0;E.step(s);const tick=s.tick,time=s.time;E.step(s);assert.equal(s.tick,tick);assert.equal(s.time,time);
});
test('Thirty mixed-arsenal matches finish with finite state and bounded health',()=>{
 let destroyed=0,launches=0,damagedWalls=0;
 for(let j=0;j<30;j++){
  const s=finish(E.createMatch(Object.values(E.loadouts)[j%3],E.rivals[j%3],200+j));assert.equal(s.status,'finished');
  for(const r of s.robots){assert.ok([r.x,r.y,r.z,r.vx,r.vy,r.health,r.energy].every(Number.isFinite));assert.ok(r.health>=0&&r.health<=r.stats.hp);assert.ok(r.energy>=0&&r.energy<=100);
   for(const p of [...r.parts,...r.tools])assert.ok(p.health>=0&&p.health<=p.maxHealth);destroyed+=r.tools.filter(t=>t.broken).length;}
  launches+=s.events.filter(e=>e.type==='launch').length;damagedWalls+=s.walls.filter(w=>w.health<E.WALL_HP).length;
 }
 assert.ok(destroyed>0);assert.ok(launches>0);assert.ok(damagedWalls>0);
});


test('Cycling fire damages exposed components only during its active phase',()=>{
 const s=match(),r=s.robots[0],h={id:0,type:'fire',x:300,y:300,r:35,phase:3.5,period:6,duty:.52};s.hazards=[h];s.pickups=[];r.x=h.x;r.y=h.y;
 const core=r.health,hp=r.tools[0].health;E.step(s);assert.equal(r.health,core);assert.equal(r.tools[0].health,hp);
 h.phase=0;E.step(s);assert.ok(r.health<core);assert.ok(r.tools[0].health<hp);
});
test('A rounded full-circle angle normalizes back to zero',()=>{
 const c=E.normalizeConfig({tools:[tool('ram',1,5,5,359.99)]});assert.equal(c.tools[0].angle,0);
});
