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
// only afterwards. npm may keep serving an older packument (for example a
// placeholder version only) for a few minutes after the publish, so the release
// job sets MARKET_EXPECT_VERSION and this script polls the registry until the
// pushed version is listed.
//
// Registry fetches send `cache-control: no-cache` / `pragma: no-cache` and carry a
// one-shot `?t=` cache-buster. Before writing, the script compares the generated
// version set with the currently published index and refuses to replace a larger
// index with a smaller one unless MARKET_ALLOW_SHRINK=1 is set.
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
//                             --check, by the rollback guard, and to document where
//                             the index is served (default the raw.githubusercontent URL above)
//   MARKET_INDEX_OUT          generated file         (default marketplace.json)
//   MARKET_EXPECT_VERSION     wait until this exact version is listed (the release
//                             job passes the pushed tag's version)
//   MARKET_EXPECT_INTERVAL_MS poll interval while waiting       (default 15000)
//   MARKET_EXPECT_TIMEOUT_MS  maximum wait while waiting        (default 600000)
//   MARKET_ALLOW_SHRINK       set to 1 to allow the generated index to drop versions
//                             the published index still lists   (default: refuse)

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
const expectVersion = (process.env.MARKET_EXPECT_VERSION ?? '').trim();
const allowShrink = process.env.MARKET_ALLOW_SHRINK === '1';

function positiveIntegerEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  assert.ok(Number.isInteger(value) && value > 0, `${name} must be a positive integer: ${raw}`);
  return value;
}

const expectIntervalMs = positiveIntegerEnv('MARKET_EXPECT_INTERVAL_MS', 15000);
const expectTimeoutMs = positiveIntegerEnv('MARKET_EXPECT_TIMEOUT_MS', 600000);

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
    // Keep the code: the rollback guard distinguishes "no baseline yet" (ENOENT)
    // from "the baseline exists but cannot be read".
    const wrapped = new Error(`cannot read ${path}: ${error.code ?? error.message}`);
    wrapped.code = error.code;
    throw wrapped;
  }
}

async function readPublishedIndexForGuard() {
  try {
    // Cache-buster: raw.githubusercontent serves the branch copy with a 5-minute
    // max-age, and a stale baseline would let a lagging registry shrink the index.
    const location = isHttpUrl(indexUrl) ? withCacheBuster(indexUrl) : indexUrl;
    const text = isHttpUrl(location) ? await fetchText(location) : readLocation(location);
    return JSON.parse(text);
  } catch (error) {
    if (error?.status === 404 || error?.code === 'ENOENT') {
      // First release (no branch yet): there is nothing to protect.
      console.log(`rollback guard skipped: the published index does not exist yet (${error.message})`);
      return null;
    }
    // Anything else (network failure, unreadable baseline, unparsable JSON) is a
    // real problem: publishing now could replace a newer index with a smaller one.
    const message =
      `cannot read the published index at ${indexUrl} (${error.message}); refusing to publish ` +
      'without the rollback check';
    if (!allowShrink) throw new Error(`${message} (set MARKET_ALLOW_SHRINK=1 to override)`);
    console.log(`warning: ${message} (MARKET_ALLOW_SHRINK=1)`);
    return null;
  }
}

function publishedVersions(indexDocument) {
  const plugin = indexDocument?.plugins?.find((entry) => entry?.name === MANIFEST.name);
  if (plugin === undefined || !Array.isArray(plugin.versions)) return [];
  return plugin.versions
    .map((entry) => entry?.version)
    .filter((version) => typeof version === 'string');
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
  const headers = { 'cache-control': 'no-cache', pragma: 'no-cache' };
  if (accept) headers.accept = accept;
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    const error = new Error(`${url} answered ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.text();
}

function withCacheBuster(url) {
  // Any origin in this script (registry, raw.githubusercontent) serves a cached copy
  // for minutes; an unknown query parameter gives the request its own cache key.
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}t=${Date.now()}`;
}

function registryPackumentUrl() {
  // The registry ignores unknown query parameters; the one-shot value defeats a
  // stale CDN or proxy entry for a packument that just changed.
  return `${registryBase}/${encodeURIComponent(MANIFEST.name).replace(/^%40/, '@')}?t=${Date.now()}`;
}

async function loadRegistryManifest() {
  if (manifestLocation !== undefined && manifestLocation !== '') {
    return JSON.parse(readLocation(manifestLocation));
  }
  try {
    return JSON.parse(await fetchText(registryPackumentUrl(), 'application/json'));
  } catch (error) {
    throw new Error(
      `${error.message}\n` +
        `The registry must already serve ${MANIFEST.name}: the first tagged release publishes it to npm, ` +
        'and only then can the market index list it.',
    );
  }
}

const waitStartedAt = Date.now();
let registryManifest = await loadRegistryManifest();
if (expectVersion !== '') {
  // The generator indexes `time` entries, so wait for both halves of the record:
  // a packument can briefly list the version before its publish time lands.
  const hasVersion = (manifest) =>
    Boolean(manifest.versions?.[expectVersion]) && typeof manifest.time?.[expectVersion] === 'string';
  while (!hasVersion(registryManifest)) {
    const elapsed = Date.now() - waitStartedAt;
    const seen = Object.keys(registryManifest.versions ?? {}).join(', ') || '(none)';
    const remaining = expectTimeoutMs - elapsed;
    if (remaining <= 0) {
      throw new Error(
        `registry did not list ${MANIFEST.name}@${expectVersion} after waiting ${elapsed} ms ` +
          `(timeout ${expectTimeoutMs} ms); last seen versions: ${seen}`,
      );
    }
    console.log(
      `waiting for ${MANIFEST.name}@${expectVersion} in the registry ` +
        `(${elapsed} ms elapsed; last seen: ${seen})`,
    );
    await new Promise((resolve) => setTimeout(resolve, Math.min(expectIntervalMs, remaining)));
    registryManifest = await loadRegistryManifest();
  }
  console.log(`registry lists ${MANIFEST.name}@${expectVersion} after ${Date.now() - waitStartedAt} ms`);
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
        en: 'Adds the “内阁模式” preset: one persona shared by the Lead and the bureau members (翰林院 / 工部 / 大理寺 / 都察院), research-first rules, and evidence-anchored reporting. Includes the Cabinet sidebar and member avatars, with no third-party runtime dependencies.',
        zh: '新增「内阁模式」preset：首辅与阁臣（翰林院 / 工部 / 大理寺 / 都察院）共享同一段 persona，默认只调研不改码、结论必须锚定证据。包含内阁侧边栏与成员头像，无第三方运行时依赖。',
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
  const remote = isHttpUrl(indexUrl) ? await fetchText(withCacheBuster(indexUrl)) : readLocation(indexUrl);
  assert.equal(remote, body, `the published index at ${indexUrl} is stale; refresh the market-index branch`);
  console.log(`published index matches the registry: ${summary}`);
} else {
  // Rollback guard: the registry can lag behind the already-published index (CDN or
  // propagation), and writing that smaller index would make DSH forget released
  // versions and offer a downgrade. Refuse unless explicitly allowed.
  const publishedIndex = await readPublishedIndexForGuard();
  if (publishedIndex !== null) {
    const generated = new Set(versions.map((entry) => entry.version));
    const missing = publishedVersions(publishedIndex).filter((version) => !generated.has(version));
    if (missing.length > 0) {
      const message =
        `registry is behind the published index at ${indexUrl}: ${missing.join(', ')} ` +
        'would disappear from the generated index; refusing to overwrite the index with a smaller one';
      if (!allowShrink) throw new Error(`${message} (set MARKET_ALLOW_SHRINK=1 to override)`);
      console.log(`warning: ${message} (MARKET_ALLOW_SHRINK=1)`);
    }
  }
  writeFileSync(outputPath, body);
  console.log(`Wrote ${outputPath}: ${summary}`);
  console.log(`Publish URL: ${PUBLISHED_URL} (the release workflow force-pushes this file to the market-index branch)`);
}
