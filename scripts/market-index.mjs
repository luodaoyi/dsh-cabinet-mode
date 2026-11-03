// Generate the DeepSeek Harness plugin market index (format 1) for dsh-cabinet-mode.
//
// DSH's plugin market reads one JSON index that lists installable bundles and their
// published versions:
//   https://raw.githubusercontent.com/luodaoyi/dsh-cabinet-mode/market-index/marketplace.json
//
// The npm registry is the source of truth for which versions exist and when they
// were published. The generated file is committed on the dedicated `market-index`
// branch (see scripts/publish-market-index.sh), never on `main`.
//
// Rules this generator follows (format 1, as implemented by the DSH reader
// @deepseek-ai/dsh-plugin-market-index@0.2.1-rc.5):
//   - `format` must be the number 1; `title.en` is required.
//   - `version` is an exact SemVer 2.0.0 string, unique within its plugin.
//   - `publishTimestamp` is an integer count of Unix seconds in [0, 10^11).
//   - `source` is `{ type: "npm", registry?: url }`; this index pins the public
//     npm registry.
//   - `engines` is optional. This package deliberately declares no `engines.dsh`
//     (the product decision recorded in CHANGELOG 0.1.1), so index entries carry
//     no `engines` member unless package.json starts declaring `engines.dsh`.
//   - `icon` is an https URL or a reference resolved against the index URL. The
//     relative `./icon.svg` below resolves to the icon on the same branch. The
//     32 KiB inline-icon limit applies to `data:` icons only, not to this
//     relative reference.
//   - Prereleases and deprecated versions are skipped: DSH refuses prereleases for
//     its default version, and listing a deprecated version only invites failed
//     installs.
//
// Ordering: the npm package must exist before an index can list it. The release
// workflow publishes `dsh-cabinet-mode` to npm first and regenerates the index
// only afterwards, so running this script before the first publish fails with
// the registry's 404 — that is expected.
//
// Usage:
//   node scripts/market-index.mjs          # write marketplace.json
//   node scripts/market-index.mjs --check  # compare the published index with the registry
//
// Test seams (defaults are production truth; override only for local tests):
//   MARKET_REGISTRY_BASE      registry base URL     (default https://registry.npmjs.org)
//   MARKET_REGISTRY_MANIFEST  a registry metadata JSON file; when set, read this file
//                             instead of fetching the registry
//   MARKET_INDEX_URL          published index URL, or a local path / file: URL; used by
//                             --check and to document where the index is served
//                             (default the raw.githubusercontent URL above)
//   MARKET_INDEX_OUT          generated file         (default marketplace.json)

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MANIFEST = JSON.parse(readFileSync('package.json', 'utf8'));
const REPO = 'https://github.com/luodaoyi/dsh-cabinet-mode';
const RAW_INDEX = 'https://raw.githubusercontent.com/luodaoyi/dsh-cabinet-mode/market-index';
const PUBLISHED_URL = `${RAW_INDEX}/marketplace.json`;
const REGISTRY = 'https://registry.npmjs.org';
const FETCH_TIMEOUT_MS = 15000;

const registryBase = (process.env.MARKET_REGISTRY_BASE ?? REGISTRY).replace(/\/+$/, '');
const manifestLocation = process.env.MARKET_REGISTRY_MANIFEST;
const indexUrl = process.env.MARKET_INDEX_URL ?? PUBLISHED_URL;
const outputPath = process.env.MARKET_INDEX_OUT ?? 'marketplace.json';

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function readLocation(location) {
  const path = location.startsWith('file:') ? fileURLToPath(location) : location;
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(`cannot read ${path}: ${error.code ?? error.message}`);
  }
}

assert.ok(isHttpUrl(registryBase), `MARKET_REGISTRY_BASE must be an absolute http(s) URL: ${registryBase}`);
assert.ok(
  isHttpUrl(indexUrl) || indexUrl.startsWith('file:') || !indexUrl.includes('://'),
  `MARKET_INDEX_URL must be an http(s) URL, a file: URL, or a local path: ${indexUrl}`,
);

function compareSemver(left, right) {
  const a = left.split('-')[0].split('.').map(Number);
  const b = right.split('-')[0].split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

async function fetchText(url, accept) {
  const response = await fetch(url, {
    headers: accept ? { accept } : {},
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

let registryManifest;
if (manifestLocation !== undefined && manifestLocation !== '') {
  registryManifest = JSON.parse(readLocation(manifestLocation));
} else {
  const registryPath = `${registryBase}/${encodeURIComponent(MANIFEST.name).replace(/^%40/, '@')}`;
  try {
    registryManifest = JSON.parse(await fetchText(registryPath, 'application/json'));
  } catch (error) {
    throw new Error(
      `${error.message}\n` +
        `The registry must already serve ${MANIFEST.name}: the first tagged release publishes it to npm, ` +
        'and only then can the market index list it.',
    );
  }
}

const published = Object.entries(registryManifest.time ?? {})
  .filter(([version]) => version !== 'created' && version !== 'modified')
  .map(([version, time]) => ({ version, time }));

const versions = [];
const skipped = [];
for (const { version, time } of published.sort((left, right) => compareSemver(left.version, right.version))) {
  const entry = registryManifest.versions?.[version];
  assert.ok(entry, `registry manifest lacks metadata for published version ${version}`);
  if (version.includes('-')) {
    skipped.push(`${version} (prerelease)`);
    continue;
  }
  if (entry.deprecated) {
    skipped.push(`${version} (deprecated)`);
    continue;
  }
  const publishTimestamp = Math.floor(Date.parse(time) / 1000);
  assert.ok(Number.isInteger(publishTimestamp) && publishTimestamp >= 0, `bad publish time for ${version}: ${time}`);

  // `engines.dsh` is optional in format 1 and this package keeps the no-version-gate
  // product decision, so only a declared range is copied into the index entry.
  const engines = entry.engines ?? {};
  if (engines.dsh !== undefined) {
    assert.equal(typeof engines.dsh, 'string', `${version} declares a non-string engines.dsh`);
    assert.ok(!engines.dsh.startsWith('workspace:'), `${version} declares a workspace: engines.dsh`);
  }

  versions.push({
    version,
    publishTimestamp,
    source: { type: 'npm', registry: registryBase },
    ...(engines.dsh === undefined ? {} : { engines: { dsh: engines.dsh } }),
  });
}

assert.ok(versions.length > 0, 'no installable versions found in the registry');
versions.sort((left, right) => compareSemver(right.version, left.version));
for (let index = 1; index < versions.length; index += 1) {
  assert.notEqual(versions[index - 1].version, versions[index].version, 'duplicate version in the index');
}

const index = {
  format: 1,
  title: { en: 'Cabinet Mode', zh: '内阁模式' },
  description: {
    en: 'Cabinet Mode (内阁模式) for DeepSeek Harness: a declarative dual-identity Lead/teammate agent preset for a Ming-dynasty cabinet team.',
    zh: 'DeepSeek Harness 的内阁模式：声明式双身份首辅/阁臣 agent preset，复刻大明科研司内阁分工。',
  },
  metadata: {
    categories: {
      preset: { title: { en: 'Agent presets', zh: '智能体预设' } },
    },
  },
  plugins: [
    {
      name: MANIFEST.name,
      title: { en: 'Cabinet Mode', zh: '内阁模式' },
      description: {
        en: 'Adds the “内阁模式” preset: one persona shared by the Lead and the bureau members (翰林院 / 工部 / 大理寺 / 都察院), research-first rules, and evidence-anchored reporting. Pure YAML bundle, no runtime dependencies.',
        zh: '新增「内阁模式」preset：首辅与阁臣（翰林院 / 工部 / 大理寺 / 都察院）共享同一段 persona，默认只调研不改码、结论必须锚定证据。纯 YAML bundle，无运行时依赖。',
      },
      icon: './icon.svg',
      author: MANIFEST.author,
      homepage: `${REPO}#readme`,
      repository: { url: `${REPO}.git` },
      metadata: {
        category: 'preset',
        keywords: ['cabinet-mode', '内阁模式', 'agent-preset', 'agent-team', 'persona', 'dsh-bundle', 'research-team'],
      },
      versions,
    },
  ],
};

// Structural self-check of the document this generator is about to publish.
assert.equal(index.format, 1, 'format must be 1');
assert.ok(Object.hasOwn(index.title, 'en'), 'title.en is required');
assert.ok(index.plugins.length > 0, 'the index must list at least one plugin');
for (const plugin of index.plugins) {
  assert.match(plugin.name, /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/, 'invalid npm package name');
  assert.ok(plugin.title?.en, `${plugin.name} needs title.en`);
  assert.ok(plugin.icon === './icon.svg', `${plugin.name} icon must be the relative branch icon`);
  assert.ok(plugin.versions.every((entry) => entry.source.type === 'npm'), 'only npm sources are generated');
  assert.ok(
    plugin.versions.every(
      (entry) =>
        Number.isInteger(entry.publishTimestamp) &&
        entry.publishTimestamp >= 0 &&
        entry.publishTimestamp < 1e11,
    ),
    'publishTimestamp must be integer Unix seconds in [0, 10^11)',
  );
  assert.equal(
    new Set(plugin.versions.map((entry) => entry.version)).size,
    plugin.versions.length,
    'duplicate version in the index',
  );
  for (let position = 1; position < plugin.versions.length; position += 1) {
    assert.ok(
      compareSemver(plugin.versions[position - 1].version, plugin.versions[position].version) > 0,
      'versions must be sorted in descending SemVer order',
    );
  }
}

const body = `${JSON.stringify(index, null, 2)}\n`;
const summary = `${versions.length} version(s)${skipped.length ? `; skipped: ${skipped.join(', ')}` : ''}`;

if (process.argv.includes('--check')) {
  // Compare with the published copy so a stale index is visible: the registry moved
  // ahead of the branch, or the market-index job never ran after a release.
  const remote = isHttpUrl(indexUrl) ? await fetchText(indexUrl) : readLocation(indexUrl);
  assert.equal(remote, body, `the published index at ${indexUrl} is stale; refresh the market-index branch`);
  console.log(`published index matches the registry: ${summary}`);
} else {
  writeFileSync(outputPath, body);
  console.log(`Wrote ${outputPath}: ${summary}`);
  console.log(`Publish URL: ${PUBLISHED_URL} (the release workflow force-pushes this file to the market-index branch)`);
}
