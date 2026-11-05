import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

let client;
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const exportPoint = 'return { inject, apply };';
assert.equal(source.split(exportPoint).length, 2);
const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useRef: () => ({ current: null }),
  useState: (initial) => [initial, () => {}],
  useCallback: (callback) => callback,
  useLayoutEffect: () => {}, useEffect: () => {},
};
runInNewContext(source.replace(exportPoint,
  'return { inject, apply, avatarFor, displayName, CabinetPanel, MemberCard, TaskLine, zh, en, BUREAUX, AVATARS, setMemberConfig, memberLabel, configuredAvatar, configuredPrompt, factoryPromptFor, DEFAULT_MEMBER_PROMPTS, DEFAULT_LEAD_PROMPT };'), {
  window: { __ModuleLoader__: { load: ({ factory }) => {
    client = factory((name) => { assert.equal(name, 'react'); return React; });
  } } },
});
for (const [english, chinese] of [
  ['lead', '首辅'], ['lead', '内阁首辅'], ['hanlin', '翰林院编修'],
  ['works', '工部尚书'], ['dali', '大理寺卿'], ['yushi', '都察院御史'],
]) assert.equal(client.avatarFor(english), client.avatarFor(' ' + chinese + '-一 '));
assert.equal(client.avatarFor('unknown'), client.AVATARS.neutral);
assert.equal(client.avatarFor(null), client.AVATARS.neutral);
for (const [name, expected] of [
  ['gongbu2', '工部尚书2 · gongbu2'],
  ['works-ui', '工部尚书（ui） · works-ui'],
  ['works_ui', '工部尚书（ui） · works_ui'],
  ['works.ui', '工部尚书（ui） · works.ui'],
  ['翰林院编修-一', '翰林院编修（一） · 翰林院编修-一'],
  ['工部尚书', '工部尚书'],
  ['hanlinx', 'hanlinx'], ['works-', 'works-'], ['gongbu2x', 'gongbu2x'],
]) assert.equal(client.displayName(name), expected);
for (const name of ['hanlinx', 'works-', 'gongbu2x', 'jiancha-yushix', 'dalisiX', 'x-dalisi']) {
  assert.equal(client.avatarFor(name), client.AVATARS.neutral, name);
  assert.equal(client.displayName(name), name);
}
for (const bureau of client.BUREAUX) for (const alias of [bureau.label, ...bureau.aliases]) {
  for (const name of [alias, alias.toUpperCase(), ' ' + alias + ' ', alias + '2', alias + '2-ui',
    alias + '-一', alias.replaceAll('-', '_'), alias.replaceAll('-', '.'), alias.replaceAll('-', ' ')]) {
    assert.equal(client.avatarFor(name), client.AVATARS[bureau.key], name);
    assert.ok(client.displayName(name).includes(name.trim()), 'raw identity: ' + name);
  }
}
for (const [name, key] of [['dalisi-pingshi','dali'], ['dalisi-qing','dali'], ['dalisi2','dali'],
  ['jiancha-yushi','yushi'], ['jiancha_yushi','yushi'], ['jiancha.yushi','yushi'],
  ['jianchayushi','yushi'], ['hanlinyuan-bianxiu','hanlin'], ['duchayuan-yushi','yushi'],
  ['zuoduyushi','yushi'], ['zuodu-yushi','yushi']]) assert.equal(client.avatarFor(name), client.AVATARS[key]);
assert.equal(client.avatarFor('gongbu2'), client.avatarFor('works'));
// Display Chinese offices without changing the original runtime identity.
for (const [key, title] of [
  ['lead', '内阁首辅'], ['hanlin', '翰林院编修'], ['works', '工部尚书'],
  ['dali', '大理寺卿'], ['yushi', '左都御史'],
]) {
  assert.equal(client.displayName(key), title + ' · ' + key);
  assert.equal(client.displayName(title), title);
  assert.equal(client.avatarFor(key), client.avatarFor(title));
}
assert.equal(client.displayName('都察院御史'), '左都御史 · 都察院御史');
assert.equal(client.avatarFor('都察院御史-一'), client.avatarFor('左都御史-一'));
for (const [oldTitle, newTitle] of [
  ['工部主事', '工部尚书'], ['大理寺评事', '大理寺卿'], ['监察御史', '左都御史'],
]) {
  assert.equal(client.displayName(oldTitle), newTitle + ' · ' + oldTitle);
  assert.equal(client.avatarFor(oldTitle + '-一'), client.avatarFor(newTitle + '-一'));
  assert.notEqual(client.displayName(oldTitle), client.displayName(newTitle));
}
for (const language of [client.zh, client.en]) assert.equal(language['lead.tag'], '内阁首辅');

// --- a saved avatar must win over the built-in portrait on the render path ---
const CUSTOM_AVATAR = 'data:image/png;base64,aGVsbG8=';
assert.match(client.avatarFor('lead'), /^data:image\/png;base64,/);
client.setMemberConfig({ members: [], avatarLead: CUSTOM_AVATAR });
assert.equal(client.avatarFor('lead'), CUSTOM_AVATAR, 'configured avatar must reach the panel/roster path');
assert.equal(client.avatarFor('首辅'), CUSTOM_AVATAR, 'alias-mapped names resolve to the configured avatar');
assert.notEqual(client.avatarFor('hanlin'), CUSTOM_AVATAR, 'unconfigured members keep the built-in avatar');
client.setMemberConfig({ members: [], avatarLead: 'data:image/svg+xml;base64,NOT_ALLOWED' });
assert.notEqual(client.avatarFor('lead'), 'data:image/svg+xml;base64,NOT_ALLOWED', 'non-whitelisted image types are ignored');
client.setMemberConfig({ members: [] });

// --- factory prompts: every member keeps a duty prompt unless the user clears it ---
assert.equal(client.factoryPromptFor('lead'), client.DEFAULT_LEAD_PROMPT);
for (const key of ['hanlin', 'works', 'dali', 'yushi']) {
  assert.ok(client.factoryPromptFor(key).length > 0, `${key} must have a factory duty prompt`);
  assert.ok(client.factoryPromptFor(key).length <= 400, `${key} factory prompt must stay under 400 chars`);
}
assert.ok(client.DEFAULT_LEAD_PROMPT.includes('御下术'));
client.setMemberConfig({ members: [{ key: 'hanlin', name: '张翰林', prompt: '', mode: '' }] });
assert.equal(client.memberLabel('hanlin'), '张翰林 · hanlin');
assert.equal(client.configuredPrompt('hanlin'), client.factoryPromptFor('hanlin'), 'unconfigured mode keeps the factory prompt');
assert.equal(client.configuredPrompt('lead'), client.DEFAULT_LEAD_PROMPT, 'the Lead keeps 御下术 by default');
client.setMemberConfig({ members: [{ key: 'hanlin', name: '', prompt: '只写这一句', mode: 'custom' }] });
assert.equal(client.configuredPrompt('hanlin'), '只写这一句', 'custom prompt replaces the factory text');
client.setMemberConfig({ members: [{ key: 'hanlin', name: '', prompt: 'x', mode: 'off' }] });
assert.equal(client.configuredPrompt('hanlin'), '', 'a cleared member injects nothing');
client.setMemberConfig({ members: [{ key: 'hanlin', name: 123, prompt: null, mode: 7 }] });
assert.equal(client.memberLabel('hanlin'), '翰林院编修 · hanlin', 'wrong-typed fields fall back to defaults, never throw');
client.setMemberConfig({ members: 'oops-not-an-array' });
assert.equal(client.configuredPrompt('lead'), client.DEFAULT_LEAD_PROMPT, 'a corrupt members value degrades to defaults, not to silence');
client.setMemberConfig({ members: [] });

const render = (team, language) => client.CabinetPanel({
  sessionId: 'lead-session',
  useSession: (select) => select({}),
  useSessions: (select) => select({ projectionsBySession: {
    'lead-session': { values: { agentTeam: team } },
  } }),
  useSessionStatus: (select) => select(new Map()),
  t: (key) => language[key] || key,
});
for (const language of [client.zh, client.en]) {
  const stale = JSON.stringify(render({ failure: { message: '<unsafe>' }, members: [], tasks: [] }, language));
  assert.ok(stale.includes(language['team.stale']));
  assert.ok(stale.includes('"role":"alert"'));
  assert.ok(!stale.includes('<unsafe>'));
  assert.ok(!JSON.stringify(render({ members: [], tasks: [] }, language)).includes(language['team.stale']));
  assert.ok(!JSON.stringify(render(undefined, language)).includes(language['team.stale']));
}
// Inspect rendered host elements, including the member and owner leaf components.
function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== 'object') return [];
  if (typeof tree.type === 'function') {
    const props = { ...tree.props };
    if (tree.children.length) props.children = tree.children.flat();
    return elements(tree.type(props));
  }
  return [tree, ...tree.children.flatMap(elements)];
}
const names = ['works', 'gongbu', 'zhushi', 'works-ui', 'works_ui', 'works.ui'];
const labels = [];
const tasks = names.map((name, i) => ({ id: String(i), subject: 'Task ' + i, ownerName: name, status: 'pending' }));
for (const name of names) {
  const card = client.MemberCard({ member: { name, phase: 'active' }, statusLabel: (status) => status });
  const label = elements(card).find((node) => node.props?.key === 'n');
  assert.ok(label.children[0].includes(name), 'member label must retain raw name: ' + name);
  assert.equal(label.props.title, label.children[0], 'truncated member label needs full tooltip');
  labels.push(label.children[0]);
  const task = tasks.find((task) => task.ownerName === name);
  const line = client.TaskLine({ task, t: (key) => key, taskLabel: (status) => status });
  const owner = elements(line).find((node) => node.type === 'span' && node.children.flat().some((text) => typeof text === 'string' && text.startsWith('Owner: ')));
  assert.ok(owner.children.flat().includes('Owner: ' + label.children[0]));
  assert.equal(owner.props.title, label.children[0]);
}
assert.equal(new Set(labels).size, names.length, 'aliases and separators must remain distinguishable');
const groups = elements(render({ members: [], tasks }, client.zh)).filter((node) => node.props?.key === 'title');
assert.equal(groups.length, names.length);
for (const [i, group] of groups.entries()) {
  assert.equal(group.children[0], labels[i]);
  assert.equal(group.props.title, labels[i]);
}
// The actual panel leaf renderer uses the same asset for every supported alias.
for (const name of ['lead', 'hanlin-bianxiu', 'gongbu-zhushi', 'dalisi-pingshi', 'jiancha-yushi', 'unknown-person']) {
  const card = elements(client.MemberCard({member:{name,phase:'active'},statusLabel:s=>s}));
  assert.ok(card.some(n=>n.type==='img' && n.props.src===client.avatarFor(name)), name);
}
console.log('PASS: avatars, stale-team warnings, and distinct member/owner/group identities; mocked React, not browser E2E');
