'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../public/engine');
const idle={body:'box',motor:1,armor:1,tools:[],rules:[{when:'always',do:'brake'}]};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} vs ${b}`);
function fixture(count=4,tools=[{type:'drill',x:20,y:0,angle:0,power:2}]){
 const s=E.createBattle([{...idle,tools},...Array(count-1).fill(idle)],88);s.hazards=[];s.pickups=[];
 Object.assign(s.robots[0],{x:400,y:400,angle:.2});return s;
}
function kill(s,id=0){const r=s.robots[id];r.health=1;r.parts.forEach(p=>{p.broken=true;p.health=0;});E.damageRobot(s,r,null,2,1,1,'test');E.step(s);assert.equal(r.reason,'Robot destroyed');return r;}
function land(s,owner=s.robots[0]){s.time=owner.destruction.born+E.WRECK_SCATTER_SECONDS;}
function positionAtTool(s,robot=1,owner=0,index=0){const r=s.robots[owner],p=E.wreckToolPose(r,r.tools[index],index,99);Object.assign(s.robots[robot],{x:p.x,y:p.y,z:0});return p;}
function supply(s,r,type='tool',extra={}){
 const p={id:s.pickups.length,kind:type,toolType:'saw',power:1,x:r.x,y:r.y,r:12,spawnAt:0,expiresAt:120,collectedBy:null,...extra};s.pickups.push(p);return p;
}

test('A lethal chassis hit records destruction once without altering any surviving tool health',()=>{
 const s=fixture(4,[{type:'drill',x:20,power:2},{type:'saw',x:-20,power:1}]),r=s.robots[0];
 r.tools[0].health=17.1234567890123;r.tools[0].firing=1.2;r.tools[0].contactTime=.5;r.tools[1].health=.00000123;const before=r.tools.map(t=>({health:t.health,maxHealth:t.maxHealth,type:t.type,power:t.power}));
 kill(s);assert.deepEqual(r.destruction,{born:s.time});assert.equal(r.alive,false);assert.equal(r.health,0);
 assert.deepEqual(r.tools.map(t=>({health:t.health,maxHealth:t.maxHealth,type:t.type,power:t.power})),before);
 assert.ok(r.tools.every(t=>!t.broken&&t.firing===0));assert.equal(s.events.filter(e=>e.type==='destroy').length,1);
 assert.equal(r.tools[0].contactTime,0);
 const corpse=JSON.stringify(r);for(let i=0;i<15;i++)E.step(s);assert.equal(JSON.stringify(r),corpse);
 assert.equal(s.events.filter(e=>e.type==='destroy').length,1);assert.equal(s.debris.length,0,'Body fragments are analytic, not a replicated particle array');
});

test('Scatter starts at the original mount, settles in 0.9 seconds and remains deterministic after finish',()=>{
 const s=fixture(),r=kill(s),t=r.tools[0];Object.assign(r,{vx:120,vy:-80,z:24});
 assert.equal(E.DESTRUCTION_FADE_SECONDS,3);assert.equal(E.WRECK_SCATTER_SECONDS,.9);
 assert.deepEqual(E.wreckToolPose(r,t,0,0),{...E.toolPose(r,t),z:r.z});
 const middle=E.wreckToolPose(r,t,0,.45),end=E.wreckToolPose(r,t,0,.9);assert.ok(middle.z>0);assert.equal(end.z,0);
 assert.ok(Math.hypot(end.x-r.x,end.y-r.y)>25);assert.deepEqual(E.wreckToolPose(r,t,0,30),end);
 assert.deepEqual(E.wreckToolPose(JSON.parse(JSON.stringify(r)),JSON.parse(JSON.stringify(t)),0,.45),middle);
 s.status='finished';const snapshot=JSON.stringify(s);E.wreckToolPose(r,t,0,4);E.step(s);assert.equal(JSON.stringify(s),snapshot);
});

test('Ring-outs and forfeits retain their body and never create salvage',()=>{
 const s=fixture();s.walls.forEach(w=>{w.health=0;w.broken=true;});Object.assign(s.robots[0],{x:E.BOUNDS.max+1,y:400});E.step(s);
 assert.equal(s.robots[0].reason,'Out of the arena');assert.equal(s.robots[0].destruction,undefined);
 assert.equal(E.wreckToolVisible(s.robots[0],s.robots[0].tools[0]),false);
 const t=fixture();Object.assign(t.robots[0],{alive:false,health:0,reason:'Forfeit',eliminatedAt:0});E.step(t);assert.equal(t.robots[0].destruction,undefined);
});

test('A lethal wall impact or landing takes precedence over a same-tick boundary crossing',()=>{
 for(const cause of ['impact','landing']){
  const s=fixture(),r=s.robots[0];Object.assign(r,{x:E.BOUNDS.max-1,y:373,angle:0,vx:650,health:.1});
  if(cause==='impact')s.walls.filter(w=>w.side===1).forEach(w=>w.health=1);
  else {s.walls.forEach(w=>w.broken=true);Object.assign(r,{z:.01,vz:-5,peakZ:100});}
  E.step(s);assert.equal(r.reason,'Robot destroyed',cause);assert.ok(r.destruction,cause);assert.equal(r.exit,null,cause);
  assert.ok(r.x>E.BOUNDS.max,cause);assert.equal(s.events.some(e=>e.type==='out'),false,cause);
 }
});

test('A lethal shot during final settlement stamps the absolute visual time and retains inventory',()=>{
 const s=E.createBattle([{...idle,tools:[{type:'rocket',x:20,angle:0}]},{...idle,tools:[{type:'drill',x:20,angle:0}]}],22);s.hazards=[];s.pickups=[];
 const [a,b]=s.robots;Object.assign(a,{x:200,y:300,angle:0,action:'weapon'});Object.assign(b,{x:400,y:300,health:1,angle:0});b.parts.forEach(p=>{p.broken=true;p.health=0;});
 b.tools[0].health=12.345678901;E.resolveAttacks(s,E.collectAttacks(s,a));s.time=120;E.finishIfNeeded(s);
 for(let i=0;i<300&&s.status==='running';i++)E.step(s);
 assert.equal(s.status,'finished');assert.equal(b.reason,'Robot destroyed');assert.ok(b.destruction.born>120);close(b.destruction.born,120+s.settleElapsed);
 assert.equal(b.tools[0].health,12.345678901);assert.equal(E.wreckToolVisible(b,b.tools[0]),true);
});

test('A landed tool is collected once into a bonus slot with exact residual HP and max HP',()=>{
 const s=fixture(),source=s.robots[0].tools[0],collector=s.robots[1];source.health=13.123456789;source.maxHealth=109.987654321;
 const config=JSON.stringify(collector.config),mass=collector.stats.mass;kill(s);positionAtTool(s);E.collectPickups(s);
 assert.equal(collector.tools.length,0,'Cannot collect during scatter');assert.equal(source.salvagedBy,undefined);
 land(s);assert.equal(E.wreckToolAvailable(s,s.robots[0],source,0),true);E.collectPickups(s);
 const t=collector.tools[0];assert.equal(t.bonus,true);assert.equal(t.salvaged,true);assert.equal(t.health,source.health);assert.equal(t.maxHealth,source.maxHealth);assert.equal(t.power,source.power);assert.equal(t.type,source.type);
 assert.equal(source.salvagedBy,collector.id);assert.equal(source.health,13.123456789);assert.equal(source.maxHealth,109.987654321);
 assert.equal(E.wreckToolVisible(s.robots[0],source),false);assert.equal(collector.pickupCooldown,10);assert.equal(t.cooldown,.6);
 assert.equal(JSON.stringify(collector.config),config);assert.ok(collector.stats.mass>mass);assert.equal(collector.stats.cost,E.cost(collector.config));
 E.collectPickups(s);assert.equal(collector.tools.length,1);assert.equal(s.pickups.length,0);
});

test('Broken and nonpositive-health tools never become collectible or resurrect',()=>{
 const s=fixture(4,[{type:'saw',x:10},{type:'ram',x:-10},{type:'plow',x:0}]),r=s.robots[0];E.damageComponent(s,r,r.tools[0],999);r.tools[1].health=0;r.tools[2].health=-.1;
 kill(s);land(s);for(let index=0;index<3;index++){positionAtTool(s,1,0,index);E.collectPickups(s);assert.equal(E.wreckToolVisible(r,r.tools[index]),false);}
 assert.equal(s.robots[1].tools.length,0);assert.ok(r.tools.every(t=>t.health<=0&&t.salvagedBy==null));
});

test('Salvage obeys the same shared pickup cooldown, including existing repair and supply pickups',()=>{
 for(const kind of ['repair','tool']){
  const s=fixture(),r=s.robots[1];kill(s);land(s);positionAtTool(s);r.health=100;supply(s,r,kind);E.collectPickups(s);
  assert.equal(r.pickupCooldown,10);assert.equal(s.robots[0].tools[0].salvagedBy,undefined);
  s.pickups=[];r.pickupCooldown=0;E.collectPickups(s);assert.equal(s.robots[0].tools[0].salvagedBy,r.id);
  const p=supply(s,r,'repair');E.collectPickups(s);assert.equal(p.collectedBy,null);
 }
});

test('Full bonus slots reject salvage; a broken bonus slot can be replaced without changing six built tools',()=>{
 const s=fixture(),r=s.robots[1];kill(s);land(s);positionAtTool(s);
 r.config=E.normalizeConfig(E.loadouts.arsenal);const base=E.createBattle([r.config,idle],1).robots[0];r.tools=base.tools;r.stats=base.stats;
 for(let i=0;i<2;i++){supply(s,r);r.pickupCooldown=0;E.collectPickups(s);}assert.equal(r.tools.length,8);r.pickupCooldown=0;s.pickups=[];
 E.collectPickups(s);assert.equal(s.robots[0].tools[0].salvagedBy,undefined);assert.equal(r.pickupCooldown,0);
 E.damageComponent(s,r,r.tools[6],999);E.collectPickups(s);assert.equal(s.robots[0].tools[0].salvagedBy,r.id);
 assert.equal(r.tools.length,8);assert.equal(r.config.tools.length,6);assert.equal(r.tools[6].salvaged,true);assert.equal(r.tools[7].salvaged,undefined);
});

test('Salvage appears in pickup sensing and collect steering only after landing and while eligible',()=>{
 const s=fixture(),r=s.robots[1];kill(s);positionAtTool(s);r.x-=80;
 assert.equal(E.nearestPickup(s,r).pickup,null);land(s);
 const found=E.nearestPickup(s,r);assert.equal(found.pickup.salvaged,true);assert.equal(found.pickup.kind,'tool');assert.equal(E.sensors(s,r,s.robots[2]).pickup,true);
 assert.equal(E.nearestPickup(s,r,'repair').pickup,null);r.pickupCooldown=1;assert.equal(E.nearestPickup(s,r).pickup,null);r.pickupCooldown=0;
 r.config.rules=[{when:'pickup',do:'collect'},{when:'always',do:'brake'}];s.tick=0;E.step(s);assert.equal(r.action,'collect');assert.ok(Math.hypot(r.vx,r.vy)>0);
});

test('A salvaged tool can drop and be salvaged again with its newly damaged HP',()=>{
 const s=fixture(),first=s.robots[1],second=s.robots[2];kill(s);land(s);positionAtTool(s);E.collectPickups(s);
 const t=first.tools[0];t.health=8.765432109;kill(s,1);land(s,first);positionAtTool(s,2,1,0);E.collectPickups(s);
 assert.equal(second.tools[0].health,8.765432109);assert.equal(second.tools[0].maxHealth,t.maxHealth);assert.equal(t.health,8.765432109);assert.equal(t.salvagedBy,second.id);
 assert.equal(s.robots[0].tools[0].salvagedBy,first.id);assert.equal(second.tools[0].salvagedBy,undefined);
});

test('Competing collectors resolve one deterministic claim and checkpoint replay reproduces it exactly',()=>{
 const a=fixture();kill(a);land(a);const p=positionAtTool(a);Object.assign(a.robots[2],{x:p.x,y:p.y});const b=JSON.parse(JSON.stringify(a));
 E.collectPickups(a);E.collectPickups(b);assert.deepEqual(a,b);assert.equal(a.robots.slice(1).filter(r=>r.tools.some(t=>t.salvaged)).length,1);
 for(let i=0;i<100;i++){E.step(a);E.step(b);}assert.deepEqual(a,b);
});

test('Airborne collectors and wrecks outside the arena cannot collect, and scatter never teleports inward',()=>{
 const s=fixture(),r=kill(s);land(s);positionAtTool(s);s.robots[1].z=20;E.collectPickups(s);assert.equal(r.tools[0].salvagedBy,undefined);
 r.x=E.BOUNDS.max-1;r.angle=0;r.vx=650;const end=E.wreckToolPose(r,r.tools[0],0,.9);assert.ok(end.x>E.BOUNDS.max);
 assert.equal(E.wreckToolAvailable(s,r,r.tools[0],0),false);assert.equal(E.nearestPickup(s,s.robots[2]).pickup,null);
});

test('Eight full inventories remain bounded at 64 tools without replicated wreck arrays or gameplay RNG',()=>{
 const configs=Array.from({length:8},()=>E.loadouts.arsenal),s=E.createBattle(configs,99);s.hazards=[];s.pickups=[];
 for(const r of s.robots){for(let i=0;i<2;i++){r.pickupCooldown=0;supply(s,r);E.collectPickups(s);}s.pickups=[];r.health=0;}
 E.step(s);assert.ok(s.robots.every(r=>r.destruction));assert.equal(s.robots.reduce((n,r)=>n+r.tools.length,0),64);
 assert.equal(s.wreckage,undefined);assert.equal(s.debris.length,0);assert.equal(s.pickups.length,0);
 const copy=JSON.parse(JSON.stringify(s));s.robots.forEach((r,i)=>r.tools.forEach((t,j)=>assert.deepEqual(E.wreckToolPose(r,t,j,1.2),E.wreckToolPose(copy.robots[i],copy.robots[i].tools[j],j,1.2))));
});
