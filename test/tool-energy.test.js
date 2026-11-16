'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../public/engine');
const passive={motor:1,armor:1,tools:[],rules:[{when:'always',do:'brake'}]};
const costs={ram:[17.1,21.38,25.65],flipper:[21.38,26.72,32.06],plow:[10.26,12.83,15.39],hammer:[23.94,29.93,35.91],saw:[7.7,9.62,11.54],drill:[12.83,16.03,19.24],flamethrower:[20.52,25.65,30.78],machinegun:[13.68,17.1,20.52],rocket:[32.49,40.61,48.74]};
function duel(type='ram',power=1){
 const s=E.createBattle([{...passive,tools:[{type,power,x:20,y:0,angle:0}],rules:[{when:'always',do:'weapon'}]},passive],314);
 s.hazards=[];s.pickups=[];
 Object.assign(s.robots[0],{x:370,y:400,angle:0,action:'weapon'});Object.assign(s.robots[1],{x:425,y:400,angle:Math.PI});return s;
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
for(const [type,levels] of Object.entries(costs))for(let power=1;power<=3;power++){
 test(`${type} power ${power} spends the reduced rounded cost and rejects an insufficient budget`,()=>{
  const s=duel(type,power),r=s.robots[0],t=r.tools[0],cost=levels[power-1];assert.equal(t.stats.energy,cost);
  assert.ok(Math.abs(cost-E.WEAPONS[type].energy*(1+.25*(power-1))*.855)<=.00500001);
  r.energy=cost-.001;assert.equal(E.collectAttacks(s,r).length,0);assert.equal(t.cooldown,0);
  r.energy=cost;const attacks=E.collectAttacks(s,r);assert.equal(attacks.length,1);assert.equal(r.energy,cost,'Collecting intents cannot spend energy');
  E.resolveAttacks(s,attacks);assert.equal(r.energy,0);assert.equal(t.cooldown,t.stats.cooldown);
  assert.equal(E.collectAttacks(s,r).length,0,'Activation must still respect cooldown and energy');
 });
}
test('Shared energy budgets allow all tools only when their combined reduced cost is available',()=>{
 const s=duel('plow'),r=s.robots[0];r.tools.push({...r.tools[0],id:'t2',type:'ram',stats:E.toolStats({type:'ram',power:1})});
 r.energy=27.359;assert.deepEqual(E.collectAttacks(s,r).map(a=>a.tool.id),['t1']);
 r.energy=27.36;const attacks=E.collectAttacks(s,r);assert.equal(attacks.length,2);E.resolveAttacks(s,attacks);close(r.energy,0);
 assert.equal(r.tools[0].cooldown,1.4);assert.equal(r.tools[1].cooldown,2.7);
});
test('Supplied bonus tools use the same reduced energy as built tools',()=>{
 for(const [type,levels] of Object.entries(costs)){
  const s=E.createBattle([passive,passive],381),r=s.robots[0];s.hazards=[];
  s.pickups=[{id:1,kind:'tool',toolType:type,power:2,x:r.x,y:r.y,r:12,collectedBy:null,spawnAt:0,expiresAt:30}];
  E.collectPickups(s);assert.equal(r.tools.length,1);assert.equal(r.tools[0].bonus,true);assert.equal(r.tools[0].stats.energy,levels[1]);
 }
});
test('Flame, gun and contact streams charge once per activation, never per tick or round',()=>{
 for(const type of ['flamethrower','machinegun','saw','drill']){
  const s=duel(type,2),r=s.robots[0];r.energy=costs[type][1];E.resolveAttacks(s,E.collectAttacks(s,r));assert.equal(r.energy,0);
  for(let i=0;i<150;i++){s.time+=E.STEP;E.stepFlames(s,E.STEP);E.stepProjectiles(s,E.STEP);E.stepContact(s,E.STEP);}
  assert.equal(r.energy,0,type);assert.equal(s.projectileCounter,type==='machinegun'?12:0);
 }
});
test('Regeneration remains 12 per second, capped at 100, and Charge still consumes 36',()=>{
 const s=E.createBattle([passive,passive],44);s.hazards=[];s.pickups=[];s.robots[0].energy=10;
 for(let i=0;i<60;i++)E.step(s);close(s.robots[0].energy,22);
 s.robots[0].energy=99.9;E.step(s);assert.equal(s.robots[0].energy,100);
 for(const [energy,shouldCharge] of [[36,true],[35.79,false]]){
  const c=E.createBattle([{...passive,rules:[{when:'always',do:'charge'}]},passive],44);c.hazards=[];c.pickups=[];c.robots[0].energy=energy;E.step(c);
  close(c.robots[0].energy,energy+.2-(shouldCharge?36:0));assert.equal(c.robots[0].dash>0,shouldCharge);
 }
});
test('Fractional tool costs continue identically after a JSON checkpoint',()=>{
 const s=E.createBattle([E.loadouts.ranged,E.loadouts.arsenal],848);s.hazards=[];s.pickups=[];
 for(let i=0;i<100;i++)E.step(s);const restored=JSON.parse(JSON.stringify(s));
 for(let i=0;i<300;i++){E.step(s);E.step(restored);}assert.deepEqual(restored,s);
});
