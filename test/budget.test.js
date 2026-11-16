
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../public/engine');
const full={name:'200 POINTS',body:'hex',motor:4,armor:3,
 tools:[{type:'machinegun',power:3,x:18,y:-10,angle:0},{type:'rocket',power:3,x:18,y:10,angle:0},{type:'flamethrower',power:3,x:0,y:0,angle:0}]};
test('200-point budget accepts the exact maximum without downgrading the build',()=>{
 assert.equal(E.BUDGET,200);assert.equal(E.cost(full),200);
 const c=E.normalizeConfig(full);assert.equal(E.cost(c),200);assert.equal(c.body,'hex');
 assert.equal(c.motor,4);assert.equal(c.armor,3);assert.deepEqual(c.tools.map(t=>t.power),[3,3,3]);
 assert.deepEqual(E.normalizeConfig(c),c);
});
test('200-point budget still clamps over-budget imports deterministically',()=>{
 const raw={...full,armor:4};assert.equal(E.cost(raw),206);
 const c=E.normalizeConfig(raw);assert.ok(E.cost(c)<=200);assert.deepEqual(c,E.normalizeConfig(raw));
});
test('200-point build keeps 300 HP, four bot seats and the same tool limits',()=>{
 const s=E.createBattle([full,full,full,full],12345);
 assert.equal(s.robots.length,4);assert.ok(s.robots.every(r=>r.health===300&&r.stats.hp===300&&E.cost(r.config)===200));
 assert.equal(E.MAX_TOOLS,6);assert.equal(E.MAX_BONUS_TOOLS,2);assert.equal(E.MAX_SECONDS,120);
});
