'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../public/engine');
const passive={tools:[],rules:[{when:'always',do:'brake'}]};
const close=(a,b,msg='')=>assert.ok(Math.abs(a-b)<1e-7,msg+': '+a+' vs '+b);
function fixture(type='flamethrower',power=1){
 const config={tools:[{type,power,x:20,y:0,angle:0}],rules:[{when:'always',do:'weapon'}]};
 const s=E.createBattle([config,passive],31);s.hazards=[];s.pickups=[];
 Object.assign(s.robots[0],{x:200,y:300,angle:0,action:'weapon'});Object.assign(s.robots[1],{x:330,y:300,angle:0});
 s.robots[1].parts.forEach(p=>{p.broken=true;p.health=0});return s;
}
function fire(s){const attacks=E.collectAttacks(s,s.robots[0]);assert.equal(attacks.length,1);E.resolveAttacks(s,attacks);}
function emit(s,time){for(let i=0;i<Math.ceil(time/E.STEP);i++)E.stepFlames(s,E.STEP);}
function fly(s,time){for(let i=0;i<Math.ceil(time/E.STEP);i++)E.stepProjectiles(s,E.STEP);}

test('All nine tools increase damage, effective range, and cooldown at each power',()=>{
 for(const type of Object.keys(E.WEAPONS)){const levels=[1,2,3].map(power=>E.toolStats({type,power}));
  for(let i=0;i<2;i++){assert.ok(levels[i+1].damage>levels[i].damage,type);assert.ok(levels[i+1].reach>levels[i].reach,type);assert.ok(levels[i+1].cooldown>levels[i].cooldown,type);}
  close(levels[2].damage,levels[0].damage*2);close(levels[2].reach,levels[0].reach*1.5);
 }
});
test('Light, Standard and Heavy flames have the advertised range and total nominal damage',()=>{
 assert.deepEqual([1,2,3].map(power=>E.toolStats({type:'flamethrower',power}).reach),[135,168.75,202.5]);
 assert.deepEqual([1,2,3].map(power=>E.toolStats({type:'flamethrower',power}).damage),[22,33,44]);
});
test('Flame stream applies gradual, bounded damage rather than all damage on activation',()=>{
 const s=fixture();fire(s);assert.equal(s.robots[1].health,250);assert.equal(s.flames.length,1);
 E.stepFlames(s,E.STEP);const first=250-s.robots[1].health;assert.ok(first>0&&first<2);
 emit(s,2);close(250-s.robots[1].health,22*.85);assert.equal(s.flames.length,0);
 const hp=s.robots[1].health;emit(s,3);assert.equal(s.robots[1].health,hp);
});
test('Each flame power delivers exactly its nominal emission damage adjusted for chassis matchup',()=>{
 for(const power of [1,2,3]){const s=fixture('flamethrower',power);fire(s);emit(s,2);close(250-s.robots[1].health,E.toolStats({type:'flamethrower',power}).damage*.85);}
});
test('Partial contact receives partial flame damage and never an extra full activation',()=>{
 const s=fixture();fire(s);emit(s,.2);const loss=250-s.robots[1].health;
 Object.assign(s.robots[1],{x:600,y:650});emit(s,1);close(250-s.robots[1].health,loss);assert.ok(loss>0&&loss<22*.85);
});
test('Heavier flames reach targets that Light cannot reach',()=>{
 const light=fixture('flamethrower',1),heavy=fixture('flamethrower',3);
 for(const s of [light,heavy])s.robots[1].x=425;
 assert.equal(E.collectAttacks(light,light.robots[0]).length,0);fire(heavy);emit(heavy,1);assert.ok(heavy.robots[1].health<250);
});
test('Flame damage is timestep invariant and uses the actual nozzle orientation',()=>{
 const a=fixture(),b=fixture();fire(a);fire(b);E.stepFlames(a,.6);emit(b,.6);close(a.robots[1].health,b.robots[1].health);
 const s=fixture();fire(s);s.robots[0].angle=Math.PI;emit(s,1);assert.equal(s.robots[1].health,250);
});
test('Changing to a non-firing rule immediately stops a flame stream',()=>{
 const s=fixture();fire(s);emit(s,.1);const hp=s.robots[1].health;s.robots[0].action='avoid';emit(s,1);
 assert.equal(s.flames.length,0);assert.equal(s.robots[1].health,hp);assert.ok(s.robots[0].tools[0].cooldown>0);
});
test('A tool-specific rule cannot continue a different tool stream',()=>{
 const s=fixture();fire(s);s.robots[0].action='tool2';emit(s,1);assert.equal(s.flames.length,0);assert.equal(s.robots[1].health,250);
});
test('Flames stop after component destruction, elimination, lifting or loss of life',()=>{
 for(const cause of ['broken','dead','airborne','health']){const s=fixture();fire(s);const r=s.robots[0];
  if(cause==='broken')r.tools[0].broken=true;if(cause==='dead')r.alive=false;if(cause==='airborne')r.z=9;if(cause==='health')r.health=0;
  emit(s,1);assert.equal(s.flames.length,0);assert.equal(s.robots[1].health,250);}
});
test('Flame streams cannot damage through solid walls and their visual lanes are clipped',()=>{
 const s=fixture();Object.assign(s.robots[0],{x:630,y:373,action:'wall'});Object.assign(s.robots[1],{x:750,y:373});fire(s);
 E.stepFlames(s,E.STEP);assert.ok(s.flames[0].rays.every(d=>d<135));emit(s,2);assert.equal(s.robots[1].health,250);
 close(s.walls.reduce((sum,w)=>sum+w.maxHealth-w.health,0),8.5);
});
test('A breached wall does not block a flame stream',()=>{
 const s=fixture();Object.assign(s.robots[0],{x:630,y:373,action:'weapon'});Object.assign(s.robots[1],{x:750,y:373});
 s.walls.filter(w=>w.side===1).forEach(w=>{w.broken=true;w.health=0});fire(s);emit(s,1);assert.ok(s.robots[1].health<250);
});
test('Machine gun retains its short cooldown with lower damage per longer burst',()=>{
 const s=E.toolStats({type:'machinegun',power:1});assert.equal(s.cooldown,1.25);assert.ok(s.cooldown<1.6);assert.equal(s.damage,15);assert.equal(s.wallDamage,7.5);
});
test('Machine gun launches twelve physical bullets spaced in time from the current nozzle',()=>{
 const s=fixture('machinegun');fire(s);assert.equal(s.projectiles.length,12);assert.deepEqual(s.projectiles.map(p=>p.delay),[0,.1,.2,.3,.4,.5,.6,.7,.8,.9,1,1.1]);
 const oldX=s.projectiles[1].x;s.robots[0].x+=10;s.robots[0].angle=.12;fly(s,.11);
 const shot=s.projectiles.find(p=>p.round===1);assert.ok(shot&&!shot.queued);assert.ok(shot.x>oldX+10);close(shot.angle,.12-.016);
});
test('Switching rules cancels unlaunched rounds but never deletes bullets already flying',()=>{
 const s=fixture('machinegun');fire(s);const first=s.projectiles[0].id;s.robots[0].action='brake';E.stepProjectiles(s,E.STEP);
 assert.equal(s.projectiles.length,1);assert.equal(s.projectiles[0].id,first);assert.ok(s.projectiles[0].travel>0);
 fly(s,1);assert.ok(s.robots[1].health<250);close(250-s.robots[1].health,1.25*.8);
});
test('Destroyed guns cannot launch queued rounds',()=>{
 const s=fixture('machinegun');fire(s);s.robots[0].tools[0].broken=true;E.stepProjectiles(s,E.STEP);
 assert.equal(s.projectiles.length,1);assert.equal(s.projectiles[0].round,0);
});
test('Machine gun repeats immediately when ready, without bypassing cooldown or rules',()=>{
 const s=fixture('machinegun'),r=s.robots[0];r.stats.speed=0;r.stats.acceleration=0;
 s.robots[1].health=250;let activations=0,lastCooldown=0,times=[];
 for(let i=0;i<240;i++){const before=s.projectileCounter;E.step(s);if(s.projectileCounter>before){activations++;times.push(s.time);}lastCooldown=r.tools[0].cooldown;}
 assert.ok(activations>=3);for(let i=1;i<times.length;i++)assert.ok(times[i]-times[i-1]>=1.25-1e-7);
 assert.ok(times[1]-times[0]<1.3);assert.ok(lastCooldown>=0);
});
test('A higher-priority non-firing rule prevents automatic gunfire',()=>{
 const s=fixture('machinegun'),r=s.robots[0];r.config.rules=[{when:'always',do:'brake'},{when:'range',do:'weapon'}];
 for(let i=0;i<120;i++)E.step(s);assert.equal(s.projectileCounter,0);assert.equal(s.robots[1].health,250);
});
test('In-progress flame streams and queued bullets reproduce exactly after JSON serialization',()=>{
 for(const type of ['flamethrower','machinegun']){const a=fixture(type,2);fire(a);const b=JSON.parse(JSON.stringify(a));
  for(let i=0;i<70;i++){E.step(a);E.step(b);}assert.deepEqual(a,b);}
});
