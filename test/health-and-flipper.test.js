'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../public/engine');
const idle={body:'box',motor:1,armor:1,tools:[],rules:[{when:'always',do:'brake'}]};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} vs ${b}`);
function directHit(power=1){
 const config={...idle,tools:[{type:'flipper',power,x:20,y:0,angle:0}],rules:[{when:'always',do:'weapon'}]};
 const s=E.createBattle([config,idle],17),[a,b]=s.robots;
 Object.assign(a,{x:300,y:400,angle:0,action:'weapon'});Object.assign(b,{x:355,y:400,angle:Math.PI});
 const attacks=E.collectAttacks(s,a);assert.equal(attacks.length,1);assert.equal(attacks[0].hit.target,b);
 E.resolveAttacks(s,attacks);return {s,a,b,hit:attacks[0].hit};
}
test('300 HP applies to human and generated AI seats; repairs restore 90 and stop at 300',()=>{
 const s=E.createPracticeBattle(idle,8,341);assert(s.robots.every(r=>r.health===300&&r.stats.hp===300));
 const r=s.robots[0];s.hazards=[];r.health=100;
 const repair=()=>{s.pickups=[{id:1,kind:'repair',x:r.x,y:r.y,r:12,spawnAt:0,expiresAt:30,collectedBy:null}];E.collectPickups(s);};
 repair();assert.equal(r.health,190);assert.equal(r.pickupCooldown,10);
 r.health=290;r.pickupCooldown=0;repair();assert.equal(r.health,300);
 r.pickupCooldown=0;repair();assert.equal(r.health,300);assert.equal(s.pickups[0].collectedBy,null);assert.equal(r.pickupCooldown,0);
});
test('Flipper launches and recoil are 25 percent weaker at every power, preserving damage and cooldown',()=>{
 for(const power of [1,2,3]){
  const {s,a,b,hit}=directHit(power),ratio=E.clamp(a.stats.mass/b.stats.mass,.65,1.5);
  const previousLift=(340+(power-1)*30)*.85*Math.sqrt(ratio);
  const previousKick=165*(1+.22*(power-1))*ratio;
  near(b.vz,previousLift*.75);near(b.vx,hit.dx*previousKick*.75);near(b.vy,hit.dy*previousKick*.75);
  near(a.vx,-b.vx*.13);near(a.vy,-b.vy*.13);assert.equal(b.z,2);
  const stats=a.tools[0].stats;near(stats.damage,7*(1+.5*(power-1)));near(stats.cost,24+6*(power-1));
  near(a.tools[0].cooldown,+(3.7*(1+.4*(power-1))).toFixed(2));assert(s.events.some(e=>e.type==='launch'));
 }
});
test('The Flipper tuning leaves other weapon force, damage and cooldown unchanged',()=>{
 const before={ram:[300,16,2.7],plow:[140,8,1.4],hammer:[95,30,4.4],saw:[42,12,.85],drill:[90,18,1.8],flamethrower:[12,22,3.2],machinegun:[22,15,1.25],rocket:[145,48,6]};
 for(const [type,[kick,damage,cooldown]] of Object.entries(before))for(const power of [1,2,3]){
  const stats=E.toolStats({type,power}),p=power-1;
  near(stats.kick,kick*(1+.22*p));near(stats.damage,damage*(1+.5*p));near(stats.cooldown,+(cooldown*(1+.4*p)).toFixed(2));
 }
});
