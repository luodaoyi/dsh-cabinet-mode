#!/usr/bin/env node
/**
 * dsh-cabinet-mode — fallback installer (Method B).
 *
 * Writes the Cabinet Mode preset insert into a DeepSeek Harness profile's user
 * patch layer: <DSH_HOME>/profiles/<profile>/cordis.patch.yml
 *
 * This is the cross-platform fallback for DSH installations that have no plugin
 * manager. The recommended method (Method A) is to install this package as a DSH
 * bundle through the plugin page or `dsh plugin --profile <profile> add <spec>`.
 * The two methods are mutually exclusive: both create `config.id: cabinet`, and
 * duplicate preset ids make the preset declaration fail to load.
 *
 * Safety:
 *  - dry run by default; --apply writes
 *  - refuses when the bundle is already installed in the target profile
 *  - refuses when the target already contains `preset-cabinet`
 *  - backs up next to the target and verifies size + SHA-256 before writing
 *  - handles empty / `[]` / comments-only targets by replacing the whole file
 *    instead of appending (appending would produce invalid YAML)
 *  - BEGIN/END markers, post-write structure checks, automatic restore on failure
 *
 * Usage:
 *   node scripts/install.mjs [--profile <name>] [--apply] [--dry-run] [--target <file>]
 *
 * Exit codes: 0 = success or dry run, 1 = failure, 2 = refused (already installed).
 */

import { copyFileSync, existsSync, readFileSync, readdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = 'dsh-cabinet-mode';
const PATCH_FILE = fileURLToPath(new URL('../cordis.patch.yml', import.meta.url));
const MARKER_BEGIN = '# >>> dsh-cabinet-mode: preset-cabinet BEGIN (installed by scripts/install.mjs; remove with scripts/uninstall.mjs) >>>';
const MARKER_END = '# <<< dsh-cabinet-mode: preset-cabinet END <<<';

function parseArgs(argv) {
  const opts = { profile: 'desktop', apply: false, dryRun: false, target: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--apply') opts.apply = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--profile' || arg === '-p') opts.profile = argv[++i];
    else if (arg.startsWith('--profile=')) opts.profile = arg.slice('--profile='.length);
    else if (arg === '--target') opts.target = argv[++i];
    else if (arg.startsWith('--target=')) opts.target = arg.slice('--target='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!opts.profile) throw new Error('--profile requires a value');
  return opts;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function resolveDshHome() {
  const fromEnv = (process.env.DSH_HOME ?? '').trim();
  return fromEnv.length > 0 ? fromEnv : join(homedir(), '.dsh');
}

function listProfiles(profilesDir) {
  try {
    return readdirSync(profilesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** True when the target patch file has no YAML entries at all. */
function isEmptyYamlTarget(text) {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed === '[]') return true;
  for (const line of text.split(/\r?\n/)) {
    const value = line.trim();
    if (value === '' || value.startsWith('#')) continue;
    return false;
  }
  return true;
}

/** First character that is not whitespace or a YAML comment. */
function firstSignificantChar(text) {
  for (const line of text.split(/\r?\n/)) {
    const value = line.trim();
    if (value === '' || value.startsWith('#')) continue;
    return value[0];
  }
  return '';
}

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

function isBundleInstalledInProfile(profileDir) {
  const manifestPath = join(profileDir, 'package.json');
  if (!existsSync(manifestPath)) return false;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const dependencies = Object.keys(manifest.dependencies ?? {});
    const bundles = manifest?.dsh?.profile?.bundles ?? [];
    return dependencies.includes(PACKAGE_NAME) || bundles.includes(PACKAGE_NAME);
  } catch {
    return false;
  }
}

function abort(message, code = 1) {
  console.error(`[FAIL] ${message}`);
  process.exit(code);
}

function printHelp() {
  console.log(`dsh-cabinet-mode fallback installer (default: dry run)

Usage:
  node scripts/install.mjs [options]

Options:
  --profile <name>  DSH profile name (default: desktop)
  --apply           Actually write the patch layer (default is dry run)
  --dry-run         Print the plan only (default)
  --target <file>   Override the target cordis.patch.yml path (advanced/testing)
  --help, -h        Show this help

This writes <DSH_HOME>/profiles/<profile>/cordis.patch.yml. Do not combine it
with a bundle installation of dsh-cabinet-mode.`);
}

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
} catch (error) {
  abort(error.message);
}
if (opts.help) {
  printHelp();
  process.exit(0);
}

const write = opts.apply && !opts.dryRun;

try {
  if (!existsSync(PATCH_FILE)) abort(`package patch file is missing: ${PATCH_FILE}`);
  const patchText = readFileSync(PATCH_FILE, 'utf8').trimEnd();
  if (patchText.length === 0) abort(`package patch file is empty: ${PATCH_FILE}`);
  if (!patchText.includes('preset-cabinet')) abort('package patch file does not mention preset-cabinet');
  if (!/^- insert:/m.test(patchText)) abort("package patch file has no top-level '- insert:' list");

  const dshHome = resolveDshHome();
  const profilesDir = join(dshHome, 'profiles');
  const profile = opts.profile;
  let target;
  if (opts.target) {
    target = opts.target;
  } else {
    const profileDir = join(profilesDir, profile);
    if (!existsSync(profileDir)) {
      const available = listProfiles(profilesDir);
      abort(
        `DSH profile "${profile}" not found under ${profilesDir}. ` +
          `Available profiles: ${available.length > 0 ? available.join(', ') : '(none)'}. ` +
          'Run DeepSeek Harness once to create the profile, or pass --profile <name>.'
      );
    }
    target = join(profileDir, 'cordis.patch.yml');
  }

  if (!existsSync(target)) {
    abort(`target patch file not found: ${target}. Initialize the profile in DeepSeek Harness first.`);
  }

  const profileDir = dirname(target);
  if (isBundleInstalledInProfile(profileDir)) {
    console.error(
      `[SKIP] ${PACKAGE_NAME} is already installed as a bundle in this profile (dependencies or dsh.profile.bundles).`
    );
    console.error('       The bundle install and this patch fallback are mutually exclusive; remove the bundle first.');
    process.exit(2);
  }

  const targetBuffer = readFileSync(target);
  const targetText = targetBuffer.toString('utf8');

  if (targetText.includes('preset-cabinet') || targetText.includes(MARKER_BEGIN)) {
    console.error(`[SKIP] target already contains preset-cabinet or this installer's marker: ${target}`);
    console.error('       Reinstall after running: node scripts/uninstall.mjs --apply');
    process.exit(2);
  }

  const replaceWholeFile = isEmptyYamlTarget(targetText);
  if (!replaceWholeFile) {
    const first = firstSignificantChar(targetText);
    if (first !== '-' && first !== '[') {
      abort(`target is not a top-level patch array (first significant character is "${first}"): ${target}`);
    }
  }

  const mode = replaceWholeFile
    ? 'replace whole file (target is empty / [] / comments-only)'
    : 'append (target has YAML entries)';
  const blockText = replaceWholeFile
    ? `${MARKER_BEGIN}\n${patchText}\n${MARKER_END}\n`
    : `\n${MARKER_BEGIN}\n${patchText}\n${MARKER_END}\n`;
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+$/, '')
    .replace('T', '-')
    .slice(0, 15); // YYYYMMDD-HHMMSS
  const suffix = Math.random().toString(16).slice(2, 6); // unique short suffix: rapid repeated runs never reuse a backup name
  const backupPath = `${target}.bak-${stamp}-${suffix}`;

  console.log('== dsh-cabinet-mode fallback installer ==');
  console.log(`  mode       : ${write ? 'APPLY (writes the profile patch)' : 'DRY RUN (default; nothing is written)'}`);
  console.log(`  write style: ${mode}`);
  console.log(`  dsh home   : ${dshHome}`);
  console.log(`  profile    : ${opts.target ? '(custom target)' : profile}`);
  console.log(`  target     : ${target}`);
  console.log(`  backup     : ${backupPath} (created only on --apply)`);
  console.log(`  block size : about ${blockText.split(/\r?\n/).length} lines with BEGIN/END markers`);
  console.log('');
  console.log('  preview (first 8 lines of the block):');
  for (const line of blockText.split(/\r?\n/).slice(0, 8)) console.log(`  | ${line}`);
  console.log('');

  if (!write) {
    console.log('Dry run finished: nothing was written.');
    console.log(`Apply with: node scripts/install.mjs --profile ${profile} --apply`);
    process.exit(0);
  }

  copyFileSync(target, backupPath);
  const backupBuffer = readFileSync(backupPath);
  if (backupBuffer.length !== targetBuffer.length || sha256(backupBuffer) !== sha256(targetBuffer)) {
    abort(`backup verification failed, refusing to write: ${backupPath}`);
  }
  console.log(`[PASS] backup created and verified: ${backupPath}`);

  let restored = false;
  const restore = (message) => {
    if (!restored) {
      copyFileSync(backupPath, target);
      restored = true;
    }
    abort(`${message} (restored from ${backupPath})`);
  };

  try {
    if (replaceWholeFile) writeFileSync(target, blockText, 'utf8');
    else appendFileSync(target, blockText, 'utf8');
  } catch (error) {
    restore(`write failed: ${error.message}`);
  }

  const afterText = readFileSync(target, 'utf8');
  const beginCount = countOccurrences(afterText, MARKER_BEGIN);
  const endCount = countOccurrences(afterText, MARKER_END);
  const firstAfter = firstSignificantChar(afterText);
  if (beginCount !== 1 || endCount !== 1 || afterText.indexOf(MARKER_BEGIN) > afterText.indexOf(MARKER_END)) {
    restore(`post-write check failed: BEGIN/END markers are not paired (${beginCount}/${endCount})`);
  }
  if (!afterText.includes('preset-cabinet') || !/^- insert:/m.test(afterText)) {
    restore('post-write check failed: insert block or preset-cabinet is missing');
  }
  if (firstAfter !== '-' && firstAfter !== '[') {
    restore(`post-write check failed: first significant character is "${firstAfter}" (invalid patch YAML)`);
  }
  if (sha256(readFileSync(target)) === sha256(targetBuffer)) {
    restore('post-write check failed: target did not change');
  }
  console.log(`[PASS] post-write check passed (markers paired, preset-cabinet present, first significant char "${firstAfter}")`);
  console.log('');
  console.log('[PASS] Cabinet Mode was written to the profile patch layer.');
  console.log('Next steps:');
  console.log('  1. Fully quit and restart DeepSeek Harness.');
  console.log('  2. Create a new session and pick "内阁模式" (id: cabinet) in the mode picker.');
  console.log(`  3. Roll back with: node scripts/uninstall.mjs --profile ${profile} --apply`);
  process.exit(0);
} catch (error) {
  abort(error.message);
}
