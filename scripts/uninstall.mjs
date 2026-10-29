#!/usr/bin/env node
/**
 * dsh-cabinet-mode — fallback uninstaller (Method B).
 *
 * Removes the block written by scripts/install.mjs from a DSH profile's user
 * patch layer: <DSH_HOME>/profiles/<profile>/cordis.patch.yml
 *
 * Safety:
 *  - dry run by default; --apply writes
 *  - only removes this installer's BEGIN/END marker block
 *  - refuses when `preset-cabinet` exists without the marker (bundle or manual install)
 *  - backs up next to the target and verifies size + SHA-256 before writing
 *  - when the patch layer becomes empty/comments-only, writes a valid `[]`
 *  - post-write check, automatic restore on failure
 *
 * Usage:
 *   node scripts/uninstall.mjs [--profile <name>] [--apply] [--dry-run] [--target <file>]
 *
 * Exit codes: 0 = success, skipped or dry run; 1 = failure; 2 = refused.
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

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

function firstSignificantChar(text) {
  for (const line of text.split(/\r?\n/)) {
    const value = line.trim();
    if (value === '' || value.startsWith('#')) continue;
    return value[0];
  }
  return '';
}

function hasYamlContent(lines) {
  return lines.some((line) => {
    const value = line.trim();
    return value !== '' && !value.startsWith('#');
  });
}

function abort(message, code = 1) {
  console.error(`[FAIL] ${message}`);
  process.exit(code);
}

function printHelp() {
  console.log(`dsh-cabinet-mode fallback uninstaller (default: dry run)

Usage:
  node scripts/uninstall.mjs [options]

Options:
  --profile <name>  DSH profile name (default: desktop)
  --apply           Actually write the patch layer (default is dry run)
  --dry-run         Print the plan only (default)
  --target <file>   Override the target cordis.patch.yml path (advanced/testing)
  --help, -h        Show this help`);
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
  const dshHome = resolveDshHome();
  const target = opts.target ?? join(dshHome, 'profiles', opts.profile, 'cordis.patch.yml');
  if (!existsSync(target)) abort(`target patch file not found: ${target}`);

  const rawBuffer = readFileSync(target);
  const raw = rawBuffer.toString('utf8');

  if (!raw.includes(MARKER_BEGIN)) {
    if (raw.includes('preset-cabinet')) {
      console.error(`[WARN] target contains preset-cabinet but not this installer's marker: ${target}`);
      console.error('       It may be a bundle or manual install. Remove it through the plugin page or by hand.');
      process.exit(2);
    }
    console.log(`[SKIP] nothing to remove: ${MARKER_BEGIN.split(' ')[2]} is not installed in ${target}`);
    process.exit(0);
  }

  const newline = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  const beginIndex = lines.indexOf(MARKER_BEGIN);
  const endIndex = lines.indexOf(MARKER_END);
  if (beginIndex < 0 || endIndex < beginIndex) {
    abort(`marker block is incomplete (BEGIN=${beginIndex} END=${endIndex}); restore from a backup instead`);
  }

  let removeFrom = beginIndex;
  if (beginIndex > 0 && lines[beginIndex - 1].trim() === '') removeFrom = beginIndex - 1;
  const removeCount = endIndex - removeFrom + 1;

  const rest = lines.filter((_line, index) => index < removeFrom || index > endIndex);
  while (rest.length > 0 && rest[rest.length - 1].trim() === '') rest.pop();
  const resultLines = hasYamlContent(rest) ? rest : ['[]'];
  const newText = resultLines.join(newline) + newline;

  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+$/, '')
    .replace('T', '-')
    .slice(0, 15); // YYYYMMDD-HHMMSS
  const suffix = Math.random().toString(16).slice(2, 6); // unique short suffix: rapid repeated runs never reuse a backup name
  const backupPath = `${target}.bak-${stamp}-${suffix}-pre-uninstall`;

  console.log('== dsh-cabinet-mode fallback uninstaller ==');
  console.log(`  mode       : ${write ? 'APPLY (writes the profile patch)' : 'DRY RUN (default; nothing is written)'}`);
  console.log(`  target     : ${target}`);
  console.log(`  backup     : ${backupPath} (created only on --apply)`);
  console.log(`  remove     : lines ${beginIndex + 1}..${endIndex + 1} (${removeCount} lines incl. markers)`);
  console.log(`  result     : ${hasYamlContent(rest) ? `${resultLines.length} patch lines` : '[] (empty patch array)'}`);
  console.log('');
  console.log('  preview (first 6 lines to remove):');
  for (const line of lines.slice(removeFrom, Math.min(endIndex + 1, removeFrom + 6))) console.log(`  | ${line}`);
  console.log('');

  if (!write) {
    console.log('Dry run finished: nothing was written.');
    console.log(`Apply with: node scripts/uninstall.mjs --profile ${opts.profile} --apply`);
    process.exit(0);
  }

  copyFileSync(target, backupPath);
  const backupBuffer = readFileSync(backupPath);
  if (backupBuffer.length !== rawBuffer.length || sha256(backupBuffer) !== sha256(rawBuffer)) {
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
    writeFileSync(target, newText, 'utf8');
  } catch (error) {
    restore(`write failed: ${error.message}`);
  }

  const after = readFileSync(target, 'utf8');
  const firstAfter = firstSignificantChar(after);
  const isBracketArray = after.trim() === '[]';
  const validShape = isBracketArray || firstAfter === '-' || firstAfter === '[';
  if (after.includes(MARKER_BEGIN) || after.includes('preset-cabinet') || !validShape) {
    restore(
      `post-write check failed (markers/preset-cabinet still present or invalid shape: "${firstAfter}")`
    );
  }
  console.log(`[PASS] post-write check passed (remaining shape: ${isBracketArray ? '[]' : firstAfter === '-' ? 'patch entries' : 'array'})`);
  console.log('');
  console.log('[PASS] Cabinet Mode was removed from the profile patch layer.');
  console.log('Next steps:');
  console.log('  1. Fully quit and restart DeepSeek Harness.');
  console.log('  2. "内阁模式" no longer appears for new sessions; already-running sessions keep their mode.');
  console.log(`  3. To restore the previous file: copy ${backupPath} over ${target}`);
  process.exit(0);
} catch (error) {
  abort(error.message);
}
