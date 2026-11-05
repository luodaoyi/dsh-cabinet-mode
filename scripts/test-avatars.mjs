import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { AVATARS, PLACEHOLDERS } from '../src/avatars.js';

const root = new URL('../', import.meta.url);
const keys = ['lead', 'hanlin', 'works', 'dali', 'yushi'];
const client = readFileSync(new URL('client.js', root), 'utf8');
const region = client.slice(client.indexOf('// #region avatars'), client.indexOf('// #endregion avatars'));
const embedded = vm.runInNewContext(`${region}\n({ AVATARS, AVATAR_PLACEHOLDERS })`);
assert.deepEqual(Object.keys(AVATARS), keys);
assert.equal(new Set(Object.values(AVATARS)).size, keys.length);
assert.equal(PLACEHOLDERS.length, 0);
assert.equal(embedded.AVATAR_PLACEHOLDERS.length, 0);
for (const key of keys) {
  assert.equal(embedded.AVATARS[key], AVATARS[key], `${key}: stale browser data URL`);
  const bytes = Buffer.from(AVATARS[key].split(',')[1], 'base64');
  assert.deepEqual(bytes, readFileSync(new URL(`src/avatars/${key}.png`, root)), `${key}: stale module data URL`);
  for (const path of [`src/avatars/${key}.png`, `docs/images/avatars/${key}.png`]) {
    const png = readFileSync(new URL(path, root));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', path);
    assert.equal(png.readUInt32BE(16), png.readUInt32BE(20), `${path}: non-square`);
    assert.ok(png.readUInt32BE(16) >= 128, `${path}: too small`);
  }
  assert.equal(bytes.readUInt32BE(16), 128);
}
console.log('Five distinct avatars: source dimensions, PNG bytes and both embedded modules agree.');
