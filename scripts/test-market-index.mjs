import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseMarketIndex, marketInstallTarget } from '@deepseek-ai/dsh-plugin-market-index';

const dir = mkdtempSync(join(tmpdir(), 'cabinet-market-contract-'));
const registry = join(dir, 'registry.json');
const baseline = join(dir, 'baseline.json');
const output = join(dir, 'marketplace.json');
const url = 'https://raw.githubusercontent.com/luodaoyi/dsh-cabinet-mode/market-index/marketplace.json';
writeFileSync(registry, JSON.stringify({
  versions: { '0.2.0': {}, '0.2.1': {}, '0.2.2-rc.1': {}, '0.1.0': { deprecated: 'old' } },
  time: Object.fromEntries(['0.2.0', '0.2.1', '0.2.2-rc.1', '0.1.0'].map(v => [v, '2026-11-05T00:00:00Z'])),
}));
function generate(extra = {}) {
  return spawnSync(process.execPath, ['scripts/market-index.mjs'], {
    encoding: 'utf8', timeout: 10000,
    env: { ...process.env, MARKET_REGISTRY_MANIFEST: registry, MARKET_INDEX_URL: baseline,
      MARKET_INDEX_OUT: output, MARKET_EXPECT_VERSION: '', MARKET_ALLOW_SHRINK: '0', ...extra },
  });
}
let result = generate();
assert.equal(result.status, 0, result.stderr);
const raw = JSON.parse(readFileSync(output, 'utf8'));
const parsed = parseMarketIndex(raw, url);
const plugin = parsed.plugins[0];
assert.deepEqual(plugin.versions.map(v => v.version), ['0.2.1', '0.2.0']);
assert.equal(plugin.icon, new URL('./icon.svg', url).href);
assert.deepEqual(marketInstallTarget(plugin.name, plugin.versions[0]), {
  spec: 'dsh-cabinet-mode@0.2.1', registry: 'https://registry.npmjs.org/',
});
assert.deepEqual(plugin.versions[0].engines, {});
assert.throws(() => parseMarketIndex({ payload: {} }, url), /\$\.format must be 1/);
// A lagging registry must never silently remove an already published version.
raw.plugins[0].versions.push({ ...raw.plugins[0].versions[0], version: '0.2.3' });
writeFileSync(baseline, JSON.stringify(raw));
result = generate();
assert.notEqual(result.status, 0, 'version-loss guard must reject a shrinking index');
assert.match(result.stderr, /0\.2\.3/);
// A release must wait for the registry instead of advertising an absent version.
result = generate({ MARKET_EXPECT_VERSION: '0.2.4', MARKET_EXPECT_TIMEOUT_MS: '30', MARKET_EXPECT_INTERVAL_MS: '10' });
assert.notEqual(result.status, 0);
assert.match(result.stderr, /registry did not list/);
console.log('PASS: official DSH parser, install target, version filtering, format rejection, version-loss and publication guards');
