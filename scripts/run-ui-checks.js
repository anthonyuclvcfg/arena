#!/usr/bin/env node
'use strict';
// Run the existing browser suites with the current Python environment.
// No runtime dependencies, automatic downloads, or shell interpolation.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const candidates = process.env.PYTHON ? [[process.env.PYTHON]] :
  (process.platform === 'win32' ? [['py', '-3'], ['python'], ['python3']] : [['python3'], ['python']]);
let python = null;
for (const cmd of candidates) {
  const result = spawnSync(cmd[0], [...cmd.slice(1), '-c', 'import playwright.sync_api'],
    { cwd: root, encoding: 'utf8', timeout: 15000, windowsHide: true });
  if (!result.error && result.status === 0) { python = cmd; break; }
}
if (!python) {
  console.error('Python with Playwright was not found. No packages were installed.');
  console.error('In a Python virtual environment, run:');
  console.error('  python -m pip install playwright');
  console.error('  python -m playwright install chromium');
  console.error('Then run npm run test:ui. Set PYTHON to an interpreter path when needed.');
  process.exit(1);
}
const build = spawnSync(process.execPath, ['build.js'], { cwd: root, stdio: 'inherit' });
if (build.error || build.status !== 0) process.exit(1);
const output = path.join(root, 'artifacts', 'qa');
fs.mkdirSync(output, { recursive: true });
const suites = [
  ['browser-ui.py', 'browser-results.json'],
  ['browser-results.py', 'browser-results-panel.json'],
  ['browser-focus.py', 'browser-focus-results.json'],
  ['browser-editor-six.py', 'browser-editor-six-results.json'],
  ['browser-teams-camera.py', 'browser-teams-camera-results.json']
];
const report = { gameVersion: require('../public/engine.js').VERSION,
  startedAt: new Date().toISOString(), python, suites: [] };
let failed = false;
for (const [file, reportFile] of suites) {
  console.log(`\n=== ${file} ===`);
  // Remove prior output so a failure cannot be mistaken for a historic pass.
  fs.rmSync(path.join(root, reportFile), { force: true });
  const result = spawnSync(python[0], [...python.slice(1), path.join('test', file)],
    { cwd: root, env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONUTF8: '1' },
      encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  const text = (result.stdout || '') + (result.stderr || '') + (result.error ? '\n' + result.error.message : '');
  process.stdout.write(text);
  fs.writeFileSync(path.join(output, file + '.log'), text);
  let checks = [], pageErrors = [], parseError = null;
  try {
    const detail = JSON.parse(fs.readFileSync(path.join(root, reportFile), 'utf8'));
    checks = detail.checks || []; pageErrors = detail.errors || [];
  } catch (error) { parseError = error.message; }
  const pass = !result.error && result.status === 0 && !parseError && checks.length > 0 &&
    checks.every(check => check.passed === true) && pageErrors.length === 0;
  report.suites.push({ file, passed: pass, exitCode: result.status,
    checks: checks.length, passedChecks: checks.filter(c => c.passed === true).length,
    pageErrors, reportError: parseError });
  if (!pass) failed = true;
}
report.finishedAt = new Date().toISOString();
report.passed = !failed;
report.totalChecks = report.suites.reduce((n, suite) => n + suite.checks, 0);
fs.writeFileSync(path.join(output, 'ui-summary.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`\nUI verification: ${failed ? 'FAILED' : 'PASSED'}, ${report.totalChecks} checks. See artifacts/qa/ui-summary.json.`);
process.exitCode = failed ? 1 : 0;
