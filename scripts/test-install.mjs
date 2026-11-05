import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const bundle = readFileSync(join(root, 'cordis.patch.yml'), 'utf8');
assert.match(bundle, /- id: cabinet-ui\r?\n\s+name: dsh-cabinet-mode/);
const run = (script, target, args = []) => spawnSync(process.execPath,
  [join(root, 'scripts', script), '--target', target, ...args],
  { encoding: 'utf8', windowsHide: true });

for (const initial of ['', '[]\n', '# existing comment\n', '- remove: existing-plugin\n']) {
  const dir = mkdtempSync(join(tmpdir(), 'cabinet-install-test-'));
  const target = join(dir, 'cordis.patch.yml');
  writeFileSync(target, initial);
  assert.equal(run('install.mjs', target).status, 0);
  assert.equal(readFileSync(target, 'utf8'), initial, 'dry run must not write');
  assert.equal(readdirSync(dir).length, 1, 'dry run must not create backups');
  const result = run('install.mjs', target, ['--apply']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const installed = readFileSync(target, 'utf8');
  assert.equal((installed.match(/id: preset-cabinet/g) || []).length, 1);
  assert.doesNotMatch(installed, /id: cabinet-ui|name: dsh-cabinet-mode/);
  assert.match(installed, /name: '@deepseek-ai\/dsh-agent-preset'/);
  const backup = readdirSync(dir).find((name) => name.includes('.bak-'));
  assert.equal(readFileSync(join(dir, backup), 'utf8'), initial);
  assert.equal(run('install.mjs', target, ['--apply']).status, 2);
  assert.equal(readFileSync(target, 'utf8'), installed);
  const removed = run('uninstall.mjs', target, ['--apply']);
  assert.equal(removed.status, 0, removed.stdout + removed.stderr);
  assert.doesNotMatch(readFileSync(target, 'utf8'), /preset-cabinet|cabinet-ui/);
  if (initial.startsWith('-')) assert.equal(readFileSync(target, 'utf8'), initial);
}

for (const manifest of [
  { dependencies: { 'dsh-cabinet-mode': '0.2.0' } },
  { dsh: { profile: { bundles: ['dsh-cabinet-mode'] } } },
]) {
  const dir = mkdtempSync(join(tmpdir(), 'cabinet-install-test-'));
  const target = join(dir, 'cordis.patch.yml');
  writeFileSync(target, '[]\n');
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest));
  assert.equal(run('install.mjs', target, ['--apply']).status, 2);
  assert.equal(readFileSync(target, 'utf8'), '[]\n');
  assert.equal(readdirSync(dir).length, 2);
}
console.log('PASS: fallback install/uninstall (4 target shapes), dry runs, backups, duplicate and bundle guards');
