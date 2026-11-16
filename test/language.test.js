'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../public/engine');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('The English page declares its language and translates key controls', () => {
  const html = read('public/index.html');
  assert.match(html, /<html lang="en">/);
  for (const text of ['Design. Program. Survive.', 'Battle rules', 'Draw lines',
    'Balanced logic', 'Create room', 'Start online battle', 'Leave room',
    'Robot drawing editor', 'Room code', 'Undo last line']) {
    assert.ok(html.includes(text), `Missing English label: ${text}`);
  }
  assert.ok(read('public/app.js').includes("['IF','when',E.CONDITIONS]"));
  assert.ok(read('public/app.js').includes("['DO','do',E.ACTIONS]"));
});

test('All visual conditions, actions, chassis, and tools use English labels', () => {
  assert.deepEqual(Object.values(E.CONDITIONS), [
    'An active hazard is nearby', 'Opponent is in tool range', 'Opponent is nearby', 'Opponent is in front',
    'I am near the edge', 'My integrity is low', 'I have enough energy',
    'A tool is ready', 'A component is broken', 'Repair kit nearby', 'Useful bonus nearby', 'I have a bonus tool', 'Opponent is far away', 'Always', 'VOID · Skip this rule'
  ]);
  assert.deepEqual(Object.values(E.ACTIONS), [
    'Avoid the active hazard', 'Activate all tools', 'Use tool 1', 'Use tool 2', 'Use tool 3', 'Use tool 4', 'Use tool 5', 'Use tool 6',
    'Attack nearest wall', 'Chase and push', 'Charge',
    'Circle the opponent', 'Return to center', 'Retreat from opponent', 'Brake',
    'Collect nearest bonus', 'Find a repair kit', 'Activate bonus tools'
  ]);
  assert.deepEqual(Object.values(E.BODIES).map(x => x.label), ['Wedge', 'Rectangle', 'Hexagon', 'Circle', 'Manta', 'Bastion', 'Twin Hull', 'Cross']);
  assert.deepEqual(Object.values(E.WEAPONS).map(x => x.label), ['Ram', 'Flipper', 'Plow', 'Hammer', 'Saw', 'Drill', 'Flamethrower', 'Machine gun', 'Rocket launcher']);
  assert.deepEqual(E.rivals.map(x => x.name), ['BLOCK-09', 'MANTIS-02', 'ORBIT-07', 'EMBER-04']);
});

test('Translated source files contain no leftover Spanish interface phrases', () => {
  const unwanted = [
    'GUARDADO LOCAL', 'Probar combate', 'Crear sala', 'Tu robot', 'regla ',
    'Hay un peligro', 'El rival', 'EN COMBATE', 'Muros destruidos',
    'Combate en marcha', 'No se pudo', 'destruido', 'pilotos', 'daño por'
  ];
  for (const file of ['public/index.html', 'public/app.js', 'public/engine.js',
    'server.js', 'build.js', 'package.json']) {
    const text = read(file);
    for (const phrase of unwanted) assert.ok(!text.includes(phrase), `${file}: ${phrase}`);
    assert.ok(!/[áéíóúÁÉÍÓÚñÑ¿¡]/.test(text), `${file}: untranslated Spanish characters`);
  }
});

test('Existing robot fields and user-entered names remain compatible', () => {
  const old = {
    name: 'Mi robot', body: 'hex', weapon: 'plow', mount: 'left', motor: 3, armor: 2,
    lines: [[-4, 2, 8, 6]], rules: [{when: 'near', do: 'weapon'}, {when: 'always', do: 'orbit'}]
  };
  const upgraded=E.normalizeConfig(old);
  for(const key of ['name','body','motor','armor','lines','rules'])assert.deepEqual(upgraded[key],old[key]);
  assert.equal(upgraded.tools[0].type,'plow');assert.equal(upgraded.tools[0].angle,270);
  const app = read('public/app.js');
  assert.ok(app.includes("['cspire-arena-robot','line-arena-robot'].includes(raw.format)"));
  assert.ok(app.includes("const KEY='line-arena.robot.v1'"));
  assert.ok(app.includes("format:'cspire-arena-robot',version:2"));
  assert.ok(app.includes("a.download='my-robot.json'"));
});

test('The self-contained English build exactly matches the source files', () => {
  let expected = read('public/index.html');
  expected = expected.replace('<link rel="stylesheet" href="style.css">',
    '<style>\n' + read('public/style.css') + '\n</style>');
  expected = expected.replace('<script src="engine.js"></script><script src="app.js"></script>',
    ['engine.js', 'app.js'].map(name => '<script>\n' + read('public/' + name).replace(/<\/script/gi, '<\\/script') + '\n</script>').join(''));
  assert.equal(read('cspire-arena.html'), expected);
});

test('Project documentation and package description are in English', () => {
  assert.ok(read('README.md').includes('English edition'));
  assert.ok(read('README.md').includes('Visual programming'));
  assert.ok(read('TESTING.md').startsWith('# Delivery verification'));
  assert.match(JSON.parse(read('package.json')).description, /Pure JavaScript, no dependencies/);
});
