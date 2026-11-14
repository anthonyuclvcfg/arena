#!/usr/bin/env node
'use strict';
// Read-only local setup check; never installs software or edits user settings.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${label}${detail ? ': ' + detail : ''}`);
  if (!ok) failures++;
}
console.log('CSPIRE//ARENA — local project check\n' + root + '\n');
check('Node.js >= 20', Number(process.versions.node.split('.')[0]) >= 20, process.version);
for (const file of ['AGENTS.md', 'PROJECT_CONTEXT.md', 'package.json', 'build.js', 'server.js',
  'public/engine.js', 'public/app.js', 'public/index.html', 'public/style.css', 'cspire-arena.html']) {
  check(file, fs.existsSync(path.join(root, file)));
}
try {
  const E = require(path.join(root, 'public/engine.js'));
  check('Simulation loads', typeof E.step === 'function');
  console.log(`\nGame ${E.VERSION} | ${E.CHASSIS_HP} HP | ${E.BUDGET} points | ${E.MAX_SECONDS}s | up to ${E.MAX_BOTS} robots`);
} catch (error) {
  check('Simulation loads', false, error.message);
}
console.log('\nRuntime packages: none. Use npm test, npm run build, and npm start.');
console.log('UI tests are optional and need Python Playwright + Chromium (npm run test:ui).');
console.log('This check does not register the folder in the Codex desktop app.');
process.exitCode = failures ? 1 : 0;
