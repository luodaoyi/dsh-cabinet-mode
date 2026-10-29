#!/usr/bin/env node
/**
 * dsh-cabinet-mode — repository and package verification.
 *
 * Structural checks (always):
 *  - package.json fields for npm + DSH bundle semantics, no runtime dependencies,
 *    no main/lib JavaScript (this is a pure YAML bundle)
 *  - cordis.patch.yml preset declaration, 22-row plugin list, dual-identity persona,
 *    cross-platform `!!js process.platform` guards, no absolute paths / template vars
 *  - fallback scripts present and documented markers intact
 *
 * Composition check (only when `dsh` is on PATH):
 *  - `dsh --profile web --patch ./cordis.patch.yml --dump-config`
 *    must exit 0, contain exactly one `preset-cabinet`, and keep the four shipped
 *    presets (standard/ptc/minimal/cordis) exactly once each.
 *
 * Usage: node scripts/verify.mjs
 * Exit codes: 0 = all checks pass, 1 = failures.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PATCH_PATH = join(ROOT, 'cordis.patch.yml');
const PACKAGE_PATH = join(ROOT, 'package.json');
const EXPECTED_PLUGINS = [
  'persona', 'agent-instructions', 'time-context', 'tool-bash', 'tool-pwsh',
  'tool-fs', 'tool-fs-search', 'tool-jobs', 'tool-schedule',
  'skill-filesystem', 'tool-skill', 'command-goal', 'tool-goal',
  'planning', 'compaction', 'delegation',
  'tool-ask-user', 'tool-todo', 'tool-web', 'present',
  'tool-plugin-manager', 'tool-plugin-market',
];

let pass = 0;
let fail = 0;
let warn = 0;
const failures = [];

function ok(name, detail = '') {
  pass++;
  console.log(`[PASS] ${name}${detail ? `  (${detail})` : ''}`);
}
function bad(name, detail = '') {
  fail++;
  failures.push(`${name}${detail ? `: ${detail}` : ''}`);
  console.log(`[FAIL] ${name}${detail ? `  (${detail})` : ''}`);
}
function warning(name, detail = '') {
  warn++;
  console.log(`[WARN] ${name}${detail ? `  (${detail})` : ''}`);
}
function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}
function firstSignificantChar(text) {
  for (const line of text.split(/\r?\n/)) {
    const value = line.trim();
    if (value === '' || value.startsWith('#')) continue;
    return value[0];
  }
  return '';
}
function findDsh() {
  const result = spawnSync('dsh --version', { shell: true, encoding: 'utf8', timeout: 30000, windowsHide: true });
  return result.status === 0 ? (result.stdout ?? '').trim() : null;
}

console.log('== dsh-cabinet-mode verification ==');
console.log(`  repository: ${ROOT}`);
console.log('');

// ---------- package.json ----------
let pkg = null;
try {
  pkg = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8'));
  ok('package.json parses as JSON');
} catch (error) {
  bad('package.json parses as JSON', error.message);
}

if (pkg) {
  const problems = [];
  if (pkg.name !== 'dsh-cabinet-mode') problems.push(`name is ${pkg.name}`);
  if (pkg.version !== '0.1.0') problems.push(`version is ${pkg.version}`);
  if (pkg.license !== 'MIT') problems.push('license is not MIT');
  if (pkg.private !== false) problems.push('private is not false');
  if (!pkg.description) problems.push('description missing');
  if (!pkg.repository?.url) problems.push('repository.url missing');
  if (!pkg.homepage) problems.push('homepage missing');
  if (!pkg.bugs?.url) problems.push('bugs.url missing');
  if (!Array.isArray(pkg.keywords) || pkg.keywords.length === 0) problems.push('keywords missing');
  if (!Array.isArray(pkg.files) || !pkg.files.includes('cordis.patch.yml')) problems.push('files does not include cordis.patch.yml');
  if (!/>=?\s*20/.test(String(pkg.engines?.node ?? ''))) problems.push('engines.node is not >=20');
  if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') problems.push('dsh.bundle.patch is not ./cordis.patch.yml');
  if (Object.keys(pkg.dependencies ?? {}).length > 0) problems.push('runtime dependencies are not empty');
  if (pkg.main || pkg.types || pkg.exports) problems.push('main/types/exports present; pure YAML bundle should not ship JS');
  if (problems.length === 0) ok('package.json fields (npm + DSH bundle, no runtime deps, no JS entry)');
  else bad('package.json fields', problems.join('; '));

  const libDir = join(ROOT, 'lib');
  if (existsSync(libDir) && readdirSync(libDir).length > 0) bad('no lib/ build output in repository');
  else ok('no lib/ build output in repository');
}

if (existsSync(PATCH_PATH)) ok('cordis.patch.yml exists');
else bad('cordis.patch.yml exists');

let patchText = '';
if (existsSync(PATCH_PATH)) {
  patchText = readFileSync(PATCH_PATH, 'utf8');

  const required = [
    ['top-level insert list', /^- insert:\s*$/m],
    ['preset declaration id', /^    - id: preset-cabinet\s*$/m],
    ['preset plugin package', /^      name: '@deepseek-ai\/dsh-agent-preset'\s*$/m],
    ['config id cabinet', /^        id: cabinet\s*$/m],
    ['config display name', /^        name: 内阁模式\s*$/m],
    ['config description', /^        description: \S+/m],
    ['config order 5', /^        order: 5\s*$/m],
    ['preset plugins list', /^        plugins:\s*$/m],
    ['persona plugin row', /^          - id: persona\s*$/m],
    ['persona package', /^            name: '@deepseek-ai\/dsh-persona'\s*$/m],
    ['persona prefix block', /^              prefix: \|-\s*$/m],
  ];
  const missing = required.filter(([, pattern]) => !pattern.test(patchText)).map(([label]) => label);
  if (missing.length === 0) ok('preset declaration fields');
  else bad('preset declaration fields', `missing: ${missing.join(', ')}`);

  const pluginIds = [];
  for (const line of patchText.split(/\r?\n/)) {
    const match = line.match(/^          - id: (\S+)\s*$/);
    if (match) pluginIds.push(match[1]);
  }
  if (pluginIds.join('|') === EXPECTED_PLUGINS.join('|')) {
    ok('22-row plugin list order matches DSH 0.2.1-rc.3 Standard Mode');
  } else {
    bad('22-row plugin list order', `actual: ${pluginIds.join(',')}`);
  }

  const personaChecks = [
    ['Lead identity phrase', 'You are the Team Lead named "lead".'],
    ['teammate identity phrase', 'You are teammate "<name>".'],
    ['teammate lead phrase', 'Your Team Lead is named "lead".'],
    ['forbids claiming Lead', '不得自称「首辅」'],
    ['Lead duties: investigate', '审题'],
    ['Lead duties: split work', '拟旨拆解'],
    ['Lead duties: assign', '分派'],
    ['Lead duties: adjudicate', '裁断'],
    ['Lead duties: summarize', '汇总'],
    ['Lead duties: close loop', '闭环'],
    ['research-only default', '默认只调研不改码'],
    ['no fabricated sources', '不编造数据来源'],
  ];
  const personaMissing = personaChecks.filter(([, needle]) => !patchText.includes(needle)).map(([label]) => label);
  if (personaMissing.length === 0) ok('dual-identity persona keywords');
  else bad('dual-identity persona keywords', personaMissing.join(', '));

  if (patchText.includes('{{')) bad('persona uses no {{...}} template variables');
  else ok('persona uses no {{...}} template variables');

  const guards = [
    ["tool-bash disabled on win32", "disabled: !!js process.platform === 'win32'"],
    ["tool-pwsh disabled on non-win32", "disabled: !!js process.platform !== 'win32'"],
  ];
  const guardMissing = guards.filter(([, needle]) => !patchText.includes(needle)).map(([label]) => label);
  if (guardMissing.length === 0) ok('cross-platform platform guards (bash/pwsh)');
  else bad('cross-platform platform guards', guardMissing.join(', '));

  const absolute = patchText.match(/[A-Z]:[\\/]|\/home\/|\/Users\/|\/root\/|%USERPROFILE%/i);
  if (absolute) bad('no absolute paths in patch', absolute[0]);
  else ok('no absolute paths in patch');

  const presetCount = countOccurrences(patchText, 'id: preset-cabinet');
  if (presetCount === 1) ok('exactly one preset-cabinet declaration');
  else bad('exactly one preset-cabinet declaration', `found ${presetCount}`);
}

// ---------- fallback scripts ----------
const scripts = ['install.mjs', 'uninstall.mjs', 'verify.mjs'];
const scriptProblems = [];
for (const script of scripts) {
  if (!existsSync(join(ROOT, 'scripts', script))) scriptProblems.push(`${script} missing`);
}
if (scriptProblems.length === 0) {
  const install = readFileSync(join(ROOT, 'scripts', 'install.mjs'), 'utf8');
  const uninstall = readFileSync(join(ROOT, 'scripts', 'uninstall.mjs'), 'utf8');
  if (!install.includes('--apply')) scriptProblems.push('install.mjs lacks --apply');
  if (!install.includes('isEmptyYamlTarget')) scriptProblems.push('install.mjs lacks empty-target handling');
  if (!uninstall.includes('--apply')) scriptProblems.push('uninstall.mjs lacks --apply');
  if (!install.includes('dsh-cabinet-mode: preset-cabinet BEGIN')) scriptProblems.push('install.mjs marker missing');
  if (!uninstall.includes('dsh-cabinet-mode: preset-cabinet BEGIN')) scriptProblems.push('uninstall.mjs marker missing');
}
if (scriptProblems.length === 0) ok('fallback scripts present (node, dry-run default, markers)');
else bad('fallback scripts', scriptProblems.join('; '));

// ---------- docs + release assets ----------
const docsPath = join(ROOT, 'docs', 'cross-platform.md');
if (existsSync(docsPath)) {
  const docs = readFileSync(docsPath, 'utf8');
  if (docs.includes('未实测') || /not tested/i.test(docs)) ok('docs/cross-platform.md marks untested platforms');
  else warning('docs/cross-platform.md', 'does not mention "未实测"/not tested');
} else {
  warning('docs/cross-platform.md', 'not present yet (owned by a parallel task)');
}
const workflowPath = join(ROOT, '.github', 'workflows', 'release.yml');
if (existsSync(workflowPath)) {
  const workflow = readFileSync(workflowPath, 'utf8');
  if (workflow.includes('npm pack') && workflow.includes('SHA256SUMS') && workflow.includes('GITHUB_TOKEN')) {
    ok('.github/workflows/release.yml has pack + checksums + token');
  } else bad('.github/workflows/release.yml incomplete');
} else bad('.github/workflows/release.yml exists');

// ---------- composition check (needs dsh) ----------
const dshVersion = findDsh();
if (!dshVersion) {
  warning('composition check skipped', 'dsh CLI not on PATH; structural checks only');
} else {
  console.log(`  dsh version: ${dshVersion}`);
  if (!dshVersion.includes('0.2.1-rc.3')) warning('dsh version', `expected 0.2.1-rc.3, got ${dshVersion}`);
  const patchArg = PATCH_PATH.includes(' ') ? `"${PATCH_PATH}"` : PATCH_PATH;
  const command = `dsh --profile web --patch ${patchArg} --dump-config`;
  const result = spawnSync(command, {
    shell: true,
    encoding: 'utf8',
    timeout: 180000,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    bad('dump-config composition', `exit=${result.status} ${(result.stderr ?? '').slice(0, 500)}`);
  } else {
    const output = `${result.stdout ?? ''}`;
    const count = countOccurrences(output, '- id: preset-cabinet');
    if (count === 1) ok('dump-config composition inserts preset-cabinet exactly once');
    else bad('dump-config composition', `preset-cabinet entries: ${count}`);
    const shipped = ['preset-standard', 'preset-ptc', 'preset-minimal', 'preset-cordis'];
    const missingShipped = shipped.filter((id) => countOccurrences(output, `- id: ${id}`) !== 1);
    if (missingShipped.length === 0) ok('dump-config keeps the four shipped presets');
    else bad('dump-config shipped presets', missingShipped.join(', '));
    if (output.includes('内阁模式')) ok('dump-config contains the Cabinet Mode display name');
    else bad('dump-config contains 内阁模式');
  }
}

console.log('');
console.log('='.repeat(60));
console.log(`Result: PASS=${pass} FAIL=${fail} WARN=${warn}`);
if (fail > 0) {
  console.log('Verification failed:');
  for (const item of failures) console.log(`  - ${item}`);
  process.exit(1);
}
console.log('Verification passed.');
process.exit(0);
