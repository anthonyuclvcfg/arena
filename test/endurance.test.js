'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../public/engine');

test('Every chassis starts at exactly 250 HP for all shapes and armor levels', () => {
  assert.equal(E.DURABILITY_MULTIPLIER, 2);
  for (const body of Object.keys(E.BODIES)) for (let armor=1; armor<=5; armor++) {
    const config = {body, armor, motor:1, tools:[]};
    const match = E.createMatch(config, config, 1);
    for (const robot of match.robots) {
      assert.equal(robot.stats.hp, 250);
      assert.equal(robot.health, robot.stats.hp);
      assert.equal(robot.energy, 100);
    }
  }
});

test('Component doubling retains v0.3 integer rounding including odd values', () => {
  for (const type of Object.keys(E.WEAPONS)) for (let power=1; power<=3; power++) {
    const before = Math.round((E.WEAPONS[type].hp+8*(power-1))*1.35);
    assert.equal(E.toolStats({type,power}).hp, before*2);
  }
  for (let motor=1;motor<=5;motor++) for(let armor=1;armor<=5;armor++) {
    const r=E.createMatch({motor,armor,tools:[]},{},3).robots[0];
    for (const part of r.parts) {
      const before = part.kind==='armor' ? Math.round((22+armor*10)*1.35) : Math.round((32+motor*4)*1.35);
      assert.equal(part.maxHealth, before*2);assert.equal(part.health, before*2);
    }
  }
  assert.equal(E.toolStats({type:'ram',power:1}).hp, 114);
  assert.equal(E.toolStats({type:'saw',power:1}).hp, 78);
});

test('Build budget is 200; other limits, melee stats, energy and cooldowns stay unchanged', () => {
  assert.equal(E.BUDGET,200);assert.equal(E.MAX_TOOLS,6);assert.equal(E.MAX_BONUS_TOOLS,2);assert.equal(E.MAX_RULES,12);
  assert.equal(E.WALL_HP,180);assert.equal(E.MAX_IMPACT_DAMAGE,72);assert.equal(E.MAX_SECONDS,120);
  assert.equal(E.REPAIR_FRACTION,.30);assert.equal(E.PART_REPAIR_FRACTION,.25);
  const s=E.toolStats({type:'hammer',power:3});
  assert.equal(s.damage,60);assert.equal(s.wallDamage,92);assert.equal(s.energy,42);assert.equal(s.cooldown,7.92);
});

test('Exported blueprints keep their existing format and do not persist runtime health', () => {
  for(const name of ['arsenal','breacher','dual','sidewinder']) {
    const original=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples',name+'.json'),'utf8'));
    const raw=original.robot||original.config||original;
    const config=E.normalizeConfig(raw);
    assert.equal(config.name, raw.name);assert.equal(E.cost(config), E.cost(raw));
    assert.equal(config.tools.length,raw.tools.length);
    assert.deepEqual(E.normalizeConfig(config),config);
    assert.ok(!('health' in config));assert.ok(config.tools.every(t=>!('health' in t)));
  }
});

test('Large left/right health and energy HUD appears above workshop and arena, without duplicate IDs', () => {
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  assert.ok(html.indexOf('class="match-hud"')<html.indexOf('class="intro"'));
  for(const tag of ['a','b','c','d','e','f','g','h']) for(const prefix of ['fighter','seat','health','max-health','energy','hp','energy-bar','health-meter','energy-meter']) {
    assert.equal(html.split(`id="${prefix}-${tag}"`).length-1,1,`${prefix}-${tag}`);
  }
  assert.equal((html.match(/role="meter"/g)||[]).length,16);
  assert.ok(html.includes('Tool HP ≤ 25%'));
});
