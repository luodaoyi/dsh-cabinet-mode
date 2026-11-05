#!/usr/bin/env node
/**
 * dsh-cabinet-mode — repository and package verification.
 *
 * Structural checks (always):
 *  - package.json fields for npm + DSH bundle semantics, no runtime dependencies,
 *    no `main`/`types` entries (the browser half ships through `exports."./client"`
 *    plus `dsh.client`, which the DSH client-plugin loader requires), and no DSH
 *    version gate
 *    (no `engines.dsh`, no DSH `peerDependencies`)
 *  - cordis.patch.yml preset declaration, 22-row plugin list, dual-identity persona,
 *    cross-platform `!!js process.platform` guards, no absolute paths / template vars
 *  - fallback scripts present and documented markers intact
 *  - README/docs consistency: DSH-side constraints sections, no hard DSH version
 *    gate, generalization of local paths, release URL matching package.version,
 *    CHANGELOG section for package.version
 *
 * Composition check (only when `dsh` is on PATH):
 *  - Install this checkout in a temporary DSH_HOME, then run
 *    `dsh --profile web --dump-config` (never uses the user profile).
 *    must exit 0, contain exactly one `preset-cabinet`, and keep the four shipped
 *    presets (standard/ptc/minimal/cordis) exactly once each.
 *  - The DSH version is printed informationally only. This repository declares no
 *    DSH version gate: running a different DSH version must not fail verification.
 *
 * Usage: node scripts/verify.mjs
 * Exit codes: 0 = all checks pass, 1 = failures.
 */

import { existsSync, readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PATCH_PATH = join(ROOT, 'cordis.patch.yml');
const PACKAGE_PATH = join(ROOT, 'package.json');
const TESTS_ON = '0.2.1-rc.3';
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
function findDsh() {
  const result = spawnSync('dsh --version', { shell: true, encoding: 'utf8', timeout: 30000, windowsHide: true });
  return result.status === 0 ? (result.stdout ?? '').trim() : null;
}

console.log('== dsh-cabinet-mode verification ==');
console.log(`  repository: ${ROOT}`);
console.log(`  DSH reference version (tested, NOT enforced): ${TESTS_ON}`);
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
  if (pkg.license !== 'MIT') problems.push('license is not MIT');
  if (pkg.private !== false) problems.push('private is not false');
  if (!pkg.description) problems.push('description missing');
  if (!pkg.repository?.url) problems.push('repository.url missing');
  if (!pkg.homepage) problems.push('homepage missing');
  if (!pkg.bugs?.url) problems.push('bugs.url missing');
  if (!Array.isArray(pkg.keywords) || pkg.keywords.length === 0) problems.push('keywords missing');
  if (!Array.isArray(pkg.files) || !pkg.files.includes('cordis.patch.yml')) problems.push('files does not include cordis.patch.yml');
  if (!existsSync(join(ROOT, 'icon.svg'))) problems.push('icon.svg missing at package root');
  if (pkg.icon !== './icon.svg') problems.push(`package.json icon is ${JSON.stringify(pkg.icon) ?? 'missing'}, expected './icon.svg'`);
  if (Array.isArray(pkg.files) && !pkg.files.includes('icon.svg')) problems.push('files does not include icon.svg');
  if (!/>=?\s*20/.test(String(pkg.engines?.node ?? ''))) problems.push('engines.node is not >=20');
  if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') problems.push('dsh.bundle.patch is not ./cordis.patch.yml');
  if (Object.keys(pkg.dependencies ?? {}).length > 0) problems.push('runtime dependencies are not empty');
  if (pkg.main || pkg.types) problems.push('main/types entry present; the browser half must ship through exports."./client" + dsh.client, not a main/types entry');
  if (problems.length === 0) ok('package.json fields (npm + DSH bundle, no runtime deps, no main/types entry; exports + dsh.client allowed)');
  else bad('package.json fields', problems.join('; '));

  // No DSH version gate: docs claim the bundle declares no DSH version dependency.
  const gateFields = [];
  if (pkg.engines && pkg.engines.dsh) gateFields.push('engines.dsh');
  if (pkg.peerDependencies && Object.keys(pkg.peerDependencies).length > 0) gateFields.push('peerDependencies');
  if (gateFields.length === 0) ok('no DSH version gate declared (no engines.dsh / DSH peerDependencies)');
  else bad('no DSH version gate declared', gateFields.join(', '));

  const libDir = join(ROOT, 'lib');
  if (existsSync(libDir) && readdirSync(libDir).length > 0) bad('no lib/ build output in repository');
  else ok('no lib/ build output in repository');
}

// Browser half + avatars: the client plugin must ship, parse, and carry five avatars.
{
  const AVATAR_KEYS = ['lead', 'hanlin', 'works', 'dali', 'yushi'];
  const clientJsPath = join(ROOT, 'client.js');
  const avatarsJsPath = join(ROOT, 'src', 'avatars.js');

  const missingHalf = ['index.js', 'client.js'].filter((file) => !existsSync(join(ROOT, file)));
  if (missingHalf.length > 0) bad('browser half files exist', `missing ${missingHalf.join(', ')}`);
  else {
    const syntaxErrors = ['index.js', 'client.js'].map((file) => {
      const result = spawnSync(process.execPath, ['--check', join(ROOT, file)], { encoding: 'utf8', timeout: 30000, windowsHide: true });
      if (result.status === 0) return null;
      return `${file}: ${String(result.stderr || result.stdout || '').trim().split('\n')[0]}`;
    }).filter(Boolean);
    if (syntaxErrors.length > 0) bad('index.js/client.js pass node --check', syntaxErrors.join(' | '));
    else ok('index.js/client.js present and pass node --check');
  }

  if (existsSync(clientJsPath) && existsSync(avatarsJsPath)) {
    const clientSrc = readFileSync(clientJsPath, 'utf8');
    const avatarsSrc = readFileSync(avatarsJsPath, 'utf8');
    const dataUrlCount = (clientSrc.match(/data:image\/png;base64/g) ?? []).length;
    const clientKeys = AVATAR_KEYS.filter((key) => new RegExp(`\\b${key}:\\s*'data:image/png;base64`, 'u').test(clientSrc));
    const moduleKeys = AVATAR_KEYS.filter((key) => new RegExp(`export const ${key} = 'data:image/png;base64`, 'u').test(avatarsSrc));
    if (dataUrlCount !== AVATAR_KEYS.length) bad('client.js avatar data URLs', `found ${dataUrlCount}, expected ${AVATAR_KEYS.length}`);
    else if (clientKeys.length !== moduleKeys.length) bad('avatar key parity (client.js vs src/avatars.js)', `client.js=${clientKeys.length}, src/avatars.js=${moduleKeys.length}`);
    else ok(`client.js carries ${dataUrlCount} avatar data URLs; key count matches src/avatars.js (${moduleKeys.length})`);
  } else bad('client.js and src/avatars.js present for the avatar check', 'one of the two files is missing');

  const pngSize = (path) => {
    const buffer = readFileSync(path);
    if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) return null;
    return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
  };
  const resizedProblems = [];
  const sourceProblems = [];
  for (const key of AVATAR_KEYS) {
    const resizedPath = join(ROOT, 'src', 'avatars', `${key}.png`);
    const sourcePath = join(ROOT, 'docs', 'images', 'avatars', `${key}.png`);
    const dimension = existsSync(resizedPath) ? pngSize(resizedPath) : null;
    if (!dimension) resizedProblems.push(`${key}.png missing or not a PNG`);
    else if (dimension[0] !== 128 || dimension[1] !== 128) resizedProblems.push(`${key}.png is ${dimension[0]}x${dimension[1]}`);
    if (!existsSync(sourcePath) || readFileSync(sourcePath).length === 0) sourceProblems.push(`${key}.png missing or empty`);
  }
  if (resizedProblems.length === 0) ok('src/avatars/ has five 128x128 PNGs');
  else bad('src/avatars/ five 128x128 PNGs', resizedProblems.join('; '));
  if (sourceProblems.length === 0) ok('docs/images/avatars/ has five source PNGs');
  else bad('docs/images/avatars/ five source PNGs', sourceProblems.join('; '));
}

// ---------- member settings + runtime prompt injection (0.3.0, additive) ----------
{
  const indexSrc = existsSync(join(ROOT, 'index.js')) ? readFileSync(join(ROOT, 'index.js'), 'utf8') : '';
  const clientSrc = existsSync(join(ROOT, 'client.js')) ? readFileSync(join(ROOT, 'client.js'), 'utf8') : '';
  const problems = [];
  if (!/export\s*\{[^}]*\bConfig\b/.test(indexSrc)) problems.push('index.js does not export Config');
  if (!/systemPrompt\.section\s*\(/.test(indexSrc)) problems.push('index.js does not register a systemPrompt section');
  if (!/GET x/.test(indexSrc) && !/tryMembership/.test(indexSrc)) problems.push('index.js does not use tryMembership for team membership');
  if (!/interpolate:\s*false/.test(indexSrc)) problems.push('index.js member section does not disable interpolation');
  if (!/cabinet:member/.test(indexSrc)) problems.push('index.js is missing the cabinet:member section name');
  if (/DSH_HOME/.test(indexSrc)) problems.push('index.js hardcodes a DSH_HOME-relative import fallback');
  if (problems.length === 0) ok('index.js: Config + cabinet:member section (per-assembly text, no interpolation, tryMembership, no DSH_HOME path fallback)');
  else bad('index.js member injection', problems.join('; '));

  const injectUi = Array.isArray(pkg?.dsh?.client?.inject) && pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings');
  if (injectUi) ok('package.json dsh.client.inject includes @deepseek-ai/dsh-client-ui-settings');
  else bad('package.json dsh.client.inject', 'missing @deepseek-ai/dsh-client-ui-settings');

  if (Object.keys(pkg?.dependencies ?? {}).length === 0) ok('runtime dependencies stay empty (settings base comes from the Host)');
  else bad('runtime dependencies', 'dependencies must stay empty');

  // G1: the Lead's factory prompt is product copy and must exist byte-identically
  // in both halves; scripts/verify.mjs owns the cross-file equality check.
  const extract = (source) => {
    const match = source.match(/const DEFAULT_LEAD_PROMPT = `([\s\S]*?)`;/);
    return match === null ? null : match[1];
  };
  const hostDefault = extract(indexSrc);
  const browserDefault = extract(clientSrc);
  if (hostDefault === null) bad('Lead default prompt in index.js', 'DEFAULT_LEAD_PROMPT not found');
  else if (browserDefault === null) bad('Lead default prompt in client.js', 'DEFAULT_LEAD_PROMPT not found');
  else if (hostDefault !== browserDefault) bad('Lead default prompt parity (index.js vs client.js)', `host ${hostDefault.length} chars, browser ${browserDefault.length} chars`);
  else {
    const missing = ['【御下术·仅首辅适用】', '立威', '画饼', '施压', '打压', '拉踩', '情绪收放', '牵制互查', '责任到人', '反制糊弄', '收束', '红线', '绝不对陛下（用户）使用'];
    const absent = missing.filter((needle) => !hostDefault.includes(needle));
    if (absent.length > 0) bad('Lead default prompt copy', `missing: ${absent.join(', ')}`);
    else if (hostDefault.length > 2000) bad('Lead default prompt length', `${hostDefault.length} chars (max 2000)`);
    else ok(`Lead default prompt: identical in both halves, ${hostDefault.length} chars, carries 御下术 copy and red lines`);
  }

  // The Lead default must not be smuggled into the static persona in the patch.
  const patchForLead = existsSync(PATCH_PATH) ? readFileSync(PATCH_PATH, 'utf8') : '';
  if (patchForLead.includes('御下术')) bad('persona static prefix', 'contains 御下术; the Lead policy must only be injected at runtime');
  else ok('persona static prefix carries no 御下术 (runtime injection only)');
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
    ok(`22-row plugin list order matches the DSH ${TESTS_ON} reference Standard Mode`);
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
for (const test of ['test-install.mjs', 'test-client.mjs']) {
  const result = spawnSync(process.execPath, [join(ROOT, 'scripts', test)], {
    encoding: 'utf8', timeout: 30000, windowsHide: true,
  });
  if (result.status === 0) ok(test);
  else bad(test, result.stderr || result.stdout || String(result.error));
}
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
  if (!install.includes('slice(0, 15)')) scriptProblems.push('install.mjs backup timestamp is not second-granularity');
  if (!uninstall.includes('slice(0, 15)')) scriptProblems.push('uninstall.mjs backup timestamp is not second-granularity');
}
if (scriptProblems.length === 0) ok('fallback scripts present (node, dry-run default, markers, second-granularity backups)');
else bad('fallback scripts', scriptProblems.join('; '));

// ---------- docs + READMEs + release assets ----------
const docsPath = join(ROOT, 'docs', 'cross-platform.md');
let docsText = '';
if (existsSync(docsPath)) {
  docsText = readFileSync(docsPath, 'utf8');
  if (docsText.includes('未实测') || /not tested/i.test(docsText)) ok('docs/cross-platform.md marks untested platforms');
  else warning('docs/cross-platform.md', 'does not mention "未实测"/not tested');
  const docsProblems = [];
  if (!docsText.includes('<DSH_HOME>')) docsProblems.push('no <DSH_HOME> placeholder');
  if (/[A-Z]:[\\/](Users|sources)/i.test(docsText)) docsProblems.push('contains a local absolute path');
  if (docsProblems.length === 0) ok('docs/cross-platform.md generalizes local paths to <DSH_HOME>/<repo>');
  else bad('docs/cross-platform.md paths', docsProblems.join('; '));
} else {
  warning('docs/cross-platform.md', 'not present');
}

const readmePath = join(ROOT, 'README.md');
const readmeZhPath = join(ROOT, 'README.zh.md');
if (existsSync(readmePath) && existsSync(readmeZhPath)) {
  const readme = readFileSync(readmePath, 'utf8');
  const readmeZh = readFileSync(readmeZhPath, 'utf8');
  const consistency = [];
  if (!readme.includes('DSH-side constraints')) consistency.push('README.md lacks the "DSH-side constraints" section');
  if (!readmeZh.includes('DSH 侧限制与说明')) consistency.push('README.zh.md lacks the "DSH 侧限制与说明" section');
  if (!readme.includes('no hard DSH version gate')) consistency.push('README.md lacks the no-hard-DSH-version-gate statement');
  if (!readmeZh.includes('无 DSH 版本硬限制')) consistency.push('README.zh.md lacks the no-DSH-version-gate statement');
  if (pkg && pkg.version) {
    const url = `releases/download/v${pkg.version}/dsh-cabinet-mode-${pkg.version}.tgz`;
    if (!readme.includes(url)) consistency.push(`README.md release URL is not v${pkg.version}`);
    if (!readmeZh.includes(url)) consistency.push(`README.zh.md release URL is not v${pkg.version}`);
  }
  if (consistency.length === 0) ok('READMEs: constraints sections, no version gate, release URL matches package.version');
  else bad('README consistency', consistency.join('; '));
} else bad('README.md/README.zh.md exist');

if (existsSync(join(ROOT, 'CHANGELOG.md')) && pkg?.version) {
  const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
  if (changelog.includes(`## [${pkg.version}]`)) ok(`CHANGELOG has a [${pkg.version}] section`);
  else bad('CHANGELOG version section', `missing [${pkg.version}]`);
} else bad('CHANGELOG.md exists');

const workflowPath = join(ROOT, '.github', 'workflows', 'release.yml');
if (existsSync(workflowPath)) {
  const workflow = readFileSync(workflowPath, 'utf8');
  if (workflow.includes('npm pack') && workflow.includes('SHA256SUMS') && workflow.includes('GITHUB_TOKEN')) {
    ok('.github/workflows/release.yml has pack + checksums + token');
  } else bad('.github/workflows/release.yml incomplete');
  if (/dsh[\s._-]*version/i.test(workflow) || workflow.includes('allow-version')) {
    bad('.github/workflows/release.yml has no DSH version gate');
  } else ok('.github/workflows/release.yml has no DSH version gate');
} else bad('.github/workflows/release.yml exists');

// ---------- composition check (needs dsh) ----------
const dshVersion = findDsh();
if (!dshVersion) {
  warning('composition check skipped', 'dsh CLI not on PATH; structural checks only');
} else {
  console.log(`  dsh version (informational only, no gate): ${dshVersion}`);
  if (dshVersion.includes(TESTS_ON)) {
    console.log(`  matches the tested reference DSH ${TESTS_ON}`);
  } else {
    warning('dsh version differs from the tested reference', `${TESTS_ON} tested, running ${dshVersion}; informational only, no version gate and no failure`);
  }
  // Install this checkout into an isolated profile: existing profiles can contain
  // older bundles, and dump-config can write to them.
  const testHome = mkdtempSync(join(tmpdir(), 'cabinet-compose-'));
  console.log('  isolated DSH_HOME: ' + testHome);
  const runDsh = (command) => spawnSync(command, {
    shell: true, cwd: ROOT, env: { ...process.env, DSH_HOME: testHome },
    encoding: 'utf8', timeout: 180000, windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  let result = runDsh('dsh --profile web --dump-config');
  if (result.status === 0) result = runDsh('dsh plugin --profile web add .');
  if (result.status === 0) result = runDsh('dsh --profile web --dump-config');
  if (result.status !== 0) {
    bad('dump-config composition', `exit=${result.status} ${(result.stderr ?? '').slice(0, 500)}`);
  } else {
    const output = `${result.stdout ?? ''}`;
    const count = countOccurrences(output, '- id: preset-cabinet');
    if (count === 1) ok('dump-config composition inserts preset-cabinet exactly once');
    else bad('dump-config composition', `preset-cabinet entries: ${count}`);
    if (countOccurrences(output, '- id: cabinet-ui') === 1) ok('dump-config loads cabinet-ui exactly once');
    else bad('dump-config cabinet-ui declaration');
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
