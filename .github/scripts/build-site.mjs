import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const repository = process.env.GITHUB_REPOSITORY || 'luodaoyi/dsh-cabinet-mode';
// GitHub renders and sanitizes release Markdown; no browser-side API calls are needed.
const releases = JSON.parse(execFileSync('gh', [
  'api', '-H', 'Accept: application/vnd.github.html+json',
  `repos/${repository}/releases?per_page=100`,
], { encoding: 'utf8' }))
  .filter(release => !release.draft && !release.prerelease && /^v\d+\.\d+\.\d+$/.test(release.tag_name))
  .sort((a, b) => b.published_at.localeCompare(a.published_at))
  .slice(0, 5);
if (!releases.length) throw new Error('No published stable releases found');
const latest = releases[0];
const version = latest.tag_name.slice(1);
const date = latest.published_at.slice(0, 10);
if (!latest.assets.some(asset => asset.name === `dsh-cabinet-mode-${version}.tgz` && asset.state === 'uploaded')) {
  throw new Error(`The download asset for ${latest.tag_name} is missing`);
}
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const output = join(root, '_site');
mkdirSync(output, { recursive: true });
cpSync(join(root, 'site'), output, { recursive: true });
for (const [file, label] of [['index.html', '查看发布说明'], ['en/index.html', 'Release notes']]) {
  const timeline = releases.map(release => {
    const tag = escape(release.tag_name);
    const published = release.published_at.slice(0, 10);
    const url = `https://github.com/${repository}/releases/tag/${encodeURIComponent(release.tag_name)}`;
    const body = (release.body_html || '').replace(/<(\/?)(h[1-6])(?=[ >])/g, '<$1h4');
    return `<li><article><div class="release-meta"><h3>${tag}</h3><time datetime="${published}">${published}</time></div><div class="release-body">${body}</div><a href="${escape(url)}">${label} ${tag} →</a></article></li>`;
  }).join('\n');
  const template = readFileSync(join(root, 'site', file), 'utf8');
  if (!template.includes('<!-- release-notes -->') || !template.includes('__RELEASE_VERSION__') || !template.includes('__RELEASE_DATE__')) {
    throw new Error(`Release placeholders are missing in ${file}`);
  }
  writeFileSync(join(output, file), template
    .replaceAll('__RELEASE_VERSION__', version)
    .replaceAll('__RELEASE_DATE__', date)
    .replace('<!-- release-notes -->', timeline));
}
const llms = join(output, 'llms.txt');
writeFileSync(llms, readFileSync(llms, 'utf8')
  .replaceAll('__RELEASE_VERSION__', version).replaceAll('__RELEASE_DATE__', date));
console.log(`Built both site languages for ${latest.tag_name} with ${releases.length} published releases`);
