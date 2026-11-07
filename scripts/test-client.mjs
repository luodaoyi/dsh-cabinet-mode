import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

let client;
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const exportPoint = 'return { inject, apply };';
assert.equal(source.split(exportPoint).length, 2);
const React = {
  useId: () => 'test-mask',
  createElement: (type, props, ...children) => ({ type, props, children }),
  useRef: () => ({ current: null }),
  useState: (initial) => [initial, () => {}],
  useCallback: (callback) => callback,
  useLayoutEffect: () => {}, useEffect: () => {},
};
runInNewContext(source.replace(exportPoint,
  'return { inject, apply, avatarFor, displayName, CabinetPanel, MemberCard, TaskLine, TaskEdgeLayer, buildTaskEdges, taskEdgesEqual, zh, en, BUREAUX, AVATARS, setMemberConfig, memberLabel, configuredAvatar, configuredPrompt, factoryPromptFor, DEFAULT_MEMBER_PROMPTS, DEFAULT_LEAD_PROMPT };'), {
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
// --- task dependency edges: cross-member blockedBy wires with three states ---
const edgeRect = (left, top) => ({ left, top, right: left + 140, bottom: top + 26, width: 140, height: 26 });
const edgeRects = new Map([
  ['t-research', edgeRect(20, 200)], // hanlin, completed blocker
  ['t-build', edgeRect(300, 60)],    // works, in_progress blocker (owner running)
  ['t-audit', edgeRect(300, 200)],   // dali, pending blocker
  ['t-extra', edgeRect(20, 60)],     // yushi
  ['t-report', edgeRect(560, 60)],   // cross-row source sharing both endpoints
]);
const edgeTasks = [
  { id: 't-research', subject: '调研', ownerName: 'hanlin', status: 'completed' },
  { id: 't-build', subject: '实现', ownerName: 'works', status: 'in_progress', blockedBy: ['t-research', 't-ghost'] },
  { id: 't-audit', subject: '审核', ownerName: 'dali', status: 'pending', blockedBy: ['t-build'] },
  { id: 't-extra', subject: '归档', ownerName: 'yushi', status: 'pending', blockedBy: ['t-audit'] },
  { id: 't-report', subject: '复核', ownerName: 'hanlin', status: 'pending', blockedBy: ['t-research', 't-audit'] },
];
const edgeBase = { left: 0, top: 0, width: 800, height: 400 };
const edgeRectOf = (id) => edgeRects.get(id) || null;
const built = client.buildTaskEdges(edgeBase, edgeTasks, edgeRectOf, (id) => id === 't-build');
assert.equal(built.length, 5, 'one edge per resolvable blocker; t-ghost is missing and draws nothing');
assert.deepEqual(Array.from(built, (edge) => edge.key).sort(), [
  't-audit->t-build', 't-build->t-research', 't-extra->t-audit', 't-report->t-audit', 't-report->t-research',
], 'edges come from the vm realm; compare as host arrays');
const stateByKey = Object.fromEntries(built.map((edge) => [edge.key, edge.state]));
assert.equal(stateByKey['t-build->t-research'], 'done', 'completed blocker → done');
assert.equal(stateByKey['t-audit->t-build'], 'active', 'in_progress blocker → active');
assert.equal(stateByKey['t-extra->t-audit'], 'pending', 'pending blocker → pending');
const liveByKey = Object.fromEntries(built.map((edge) => [edge.key, edge.live]));
assert.equal(liveByKey['t-audit->t-build'], true, "blocker's owner running lights the flow edge");
assert.equal(liveByKey['t-build->t-research'], false, 'done edges never animate');
for (const edge of built) {
  assert.match(edge.d, /^M -?[\d.]+ -?[\d.]+ C -?[\d.]+ -?[\d.]+ -?[\d.]+ -?[\d.]+ -?[\d.]+ -?[\d.]+$/, edge.key);
  assert.equal(typeof edge.ex, 'number', edge.key);
  assert.equal(typeof edge.ey, 'number', edge.key);
}
// hidden panel (zero-size base) keeps the last drawing, like the org connectors
assert.equal(client.buildTaskEdges({ left: 0, top: 0, width: 0, height: 0 }, edgeTasks, edgeRectOf, () => false), null);
// a task removed from the board leaves no dangling edge to or from it
const withoutAudit = edgeTasks.filter((task) => task.id !== 't-audit');
const orphaned = client.buildTaskEdges(edgeBase, withoutAudit, edgeRectOf, () => false);
assert.equal(orphaned.length, 2, 'blocker rows that no longer exist are skipped, not crashed on');
assert.ok(orphaned.every((edge) => !edge.key.includes('t-audit->') && edge.key !== 't-extra->t-audit' && edge.key !== 't-report->t-audit'));
// duplicated blocker ids inside one task collapse into a single edge
const dup = client.buildTaskEdges(edgeBase,
  [{ id: 'a', subject: 'a', ownerName: 'hanlin', status: 'pending', blockedBy: ['b', 'b'] },
   { id: 'b', subject: 'b', ownerName: 'works', status: 'completed' }],
  (id) => edgeRects.get(id === 'a' ? 't-extra' : 't-build') || null, () => false);
assert.equal(dup.length, 1, 'duplicate blockedBy entries draw once');
// geometry freshness: <0.5px is noise, a real move or a state flip redraws
const rebuilt = client.buildTaskEdges(edgeBase, edgeTasks, edgeRectOf, (id) => id === 't-build');
assert.ok(client.taskEdgesEqual(built, rebuilt), 'identical rects need no redraw');
const nudgedRects = new Map(edgeRects);
nudgedRects.set('t-build', edgeRect(300.3, 60.2));
const nudged = client.buildTaskEdges(edgeBase, edgeTasks, (id) => nudgedRects.get(id) || null, (id) => id === 't-build');
assert.ok(client.taskEdgesEqual(built, nudged), 'a <0.5px rect change must not redraw');
const shiftedRects = new Map(edgeRects);
shiftedRects.set('t-build', edgeRect(340, 60));
const shifted = client.buildTaskEdges(edgeBase, edgeTasks, (id) => shiftedRects.get(id) || null, (id) => id === 't-build');
assert.ok(!client.taskEdgesEqual(built, shifted), 'a real move must trigger a redraw');
const progressed = edgeTasks.map((task) => (task.id === 't-audit' ? { ...task, status: 'in_progress' } : task));
const progressedEdges = client.buildTaskEdges(edgeBase, progressed, edgeRectOf, () => false);
assert.ok(!client.taskEdgesEqual(built, progressedEdges), 'a blocker status change must switch the edge state');
// rendered overlay: one path + one dot per edge, data attribute and state class
const layerEls = elements(client.TaskEdgeLayer({ edges: built }));
const edgePaths = layerEls.filter((node) => node.type === 'path');
assert.equal(edgePaths.length, 5, 'one path per dependency edge');
for (const path of edgePaths) {
  assert.match(path.props['data-cabinet-edge'], /^[^\s]+->[^\s]+$/, 'data-cabinet-edge is "<blockedId>-><blockerId>"');
  assert.ok(/^cabinet-edge cabinet-edge-(pending|active|done)\b/.test(path.props.className), path.props.className);
}
const classByKey = Object.fromEntries(edgePaths.map((path) => [path.props['data-cabinet-edge'], path.props.className]));
assert.ok(classByKey['t-build->t-research'].includes('cabinet-edge-done'), classByKey['t-build->t-research']);
assert.ok(classByKey['t-audit->t-build'].includes('cabinet-edge-active'), classByKey['t-audit->t-build']);
assert.ok(classByKey['t-audit->t-build'].includes('cabinet-edge-live'), 'running-owner flow edge is distinguishable');
assert.ok(classByKey['t-extra->t-audit'].includes('cabinet-edge-pending'), classByKey['t-extra->t-audit']);
const edgeDots = layerEls.filter((node) => node.type === 'circle');
assert.equal(edgeDots.length, 5, 'every edge ends in a dot on the blocked side');
assert.ok(edgeDots.every((dot) => dot.props['data-cabinet-edge-dot'].includes('->')));
assert.equal(client.TaskEdgeLayer({ edges: [] }), null, 'no edges → no overlay layer');
// panel render: cross-member tasks all expose measurement anchors, no premature edges
const depTeam = {
  members: [
    { id: 'm-lead', name: 'lead', role: 'lead', phase: 'active' },
    { id: 'm-hanlin', name: 'hanlin', role: 'mate', phase: 'active' },
    { id: 'm-works', name: 'works', role: 'mate', phase: 'active' },
  ],
  tasks: edgeTasks,
};
const depEls = elements(render(depTeam, client.zh));
const anchored = depEls.filter((node) => node.props && 'data-cabinet-task' in node.props);
assert.equal(anchored.length, edgeTasks.length, 'every task row carries a data-cabinet-task anchor');
assert.deepEqual(anchored.map((node) => node.props['data-cabinet-task']).sort(), edgeTasks.map((task) => task.id).sort());
assert.ok(!depEls.some((node) => node.props && 'data-cabinet-edge' in node.props),
  'edges are drawn only after measurement, never from stale render state');
// TaskLine forwards the anchor id through Row onto the row element
const depLine = client.TaskLine({
  task: edgeTasks[1],
  blockerOf: (id) => edgeTasks.find((task) => task.id === id),
  t: (key) => key,
  taskLabel: (status) => status,
});
const rowEl = elements(depLine).find((node) => node.props && 'data-cabinet-task' in node.props);
assert.equal(rowEl.props['data-cabinet-task'], 't-build');
// reduced-motion + palette: CSS keeps the static line, kills only the flow
const reducedLines = source.split('\n').filter((line) => line.includes('prefers-reduced-motion'));
const reducedMedia = reducedLines.find((line) => line.includes('@media'));
assert.ok(reducedMedia, 'a prefers-reduced-motion media query must exist');
assert.ok(reducedMedia.includes('.cabinet-edge-active') && reducedMedia.includes('animation:none'),
  'flow animation stands still under prefers-reduced-motion while the dashed line stays');
assert.ok(source.includes('.cabinet-edge-done{stroke:light-dark(#15803d,#4ade80)}'), 'done edge has theme-specific green contrast');
assert.ok(source.includes('.cabinet-edge-pending{stroke:light-dark(#6b7280,#9ca3af)'), 'pending edge is static grey');
assert.ok(source.includes('cabinetEdgeFlow'), 'active edge gets the dash-offset flow');
// --- direction: the path LEAVES the blocker's row and LANDS on the blocked
// task's row, dot included; the key still reads <blocked>-><blocker> because
// only the geometry flipped (首辅 → 阁臣) ---
const rectBoundary = (point, id) => {
  const rect = edgeRects.get(id);
  if (!rect) return false;
  const [x, y] = point;
  return ((x === rect.left || x === rect.right) && y >= rect.top && y <= rect.bottom)
    || ((y === rect.top || y === rect.bottom) && x >= rect.left && x <= rect.right);
};
const dPoints = (d) => d.split(/[MC]/).slice(1).map((part) => part.trim().split(/\s+/).map(Number));
const near = (a, b) => Math.abs(a - b) < 0.05;
for (const edge of built) {
  const [blockedId, blockerId] = edge.key.split('->');
  const [start, curve] = dPoints(edge.d);
  const end = curve.slice(-2);
  assert.ok(near(start[0], edge.s[0]) && near(start[1], edge.s[1]), `${edge.key}: M must sit on the start anchor`);
  assert.ok(near(end[0], edge.e[0]) && near(end[1], edge.e[1]), `${edge.key}: path end must sit on the end anchor`);
  assert.equal(edge.ex, edge.e[0], `${edge.key}: dot x is the path end`);
  assert.equal(edge.ey, edge.e[1], `${edge.key}: dot y is the path end`);
  assert.ok(rectBoundary(start, blockerId), `${edge.key}: start anchor lies on the BLOCKER row ${blockerId}`);
  assert.ok(rectBoundary(end, blockedId), `${edge.key}: end anchor lies on the BLOCKED row ${blockedId}`);
  assert.ok(!rectBoundary(start, blockedId), `${edge.key}: start is not on the blocked row — direction is blocker → blocked`);
  assert.ok(!rectBoundary(end, blockerId), `${edge.key}: end is not on the blocker row`);
}
// --- click-to-open: only a resolvable, non-inert target binds a handler ---
const openLog = [];
const recordOpen = (target) => { openLog.push(target); return true; };
const subjectOf = (line) => elements(line).find((node) => node.props?.key === 'subj');
const boundLine = subjectOf(client.TaskLine({ task: tasks[0], t: (key) => key, taskLabel: (status) => status, onOpenOwner: recordOpen }));
assert.equal(typeof boundLine.props.onClick, 'function', 'a resolved owner binds the subject span');
assert.equal(boundLine.props.style.cursor, 'pointer', 'a bound subject shows the pointer cursor');
boundLine.props.onClick();
assert.deepEqual(openLog, [tasks[0]], 'clicking the subject invokes the opener once with the task');
for (const task of [
  { id: 'k-lead', subject: 'lead work', ownerName: 'lead', status: 'pending' },
  { id: 'k-none', subject: 'nobody', status: 'pending' },
]) {
  const subject = subjectOf(client.TaskLine({ task, t: (key) => key, taskLabel: (status) => status, onOpenOwner: null }));
  assert.equal(subject.props.onClick, undefined, `${task.id}: no click binding without an opener`);
  assert.equal(subject.props.style.cursor, undefined, `${task.id}: no pointer cursor without an opener`);
}
// panel level: the resolver decides who gets an opener
const clickTeam = {
  members: [
    { id: 'lead-session', name: 'lead', role: 'lead', phase: 'active' },
    { id: 'm-works', name: 'works', role: 'mate', phase: 'active' },
    { id: 'm-dali', name: 'dali', role: 'mate', phase: 'failed' },
    { id: 'm-yushi', name: 'yushi', role: 'mate', phase: 'provisioning' },
  ],
  tasks: [
    { id: 'k-lead', subject: 'lead owns this', ownerName: 'lead', status: 'pending' },
    { id: 'k-none', subject: 'no owner', status: 'pending' },
    { id: 'k-works', subject: 'works owns this', ownerName: 'works', status: 'pending' },
    { id: 'k-dali', subject: 'dali owns this', ownerName: 'dali', status: 'pending' },
    { id: 'k-yushi', subject: 'yushi owns this', ownerName: 'yushi', status: 'pending' },
  ],
};
const clickEls = elements(render(clickTeam, client.zh));
const subjectByTitle = new Map();
for (const node of clickEls) if (node.props?.key === 'subj') subjectByTitle.set(node.props.title, node);
assert.equal(subjectByTitle.size, clickTeam.tasks.length, 'every task subject rendered');
assert.equal(subjectByTitle.get('lead owns this').props.onClick, undefined, 'lead task: panel hands no opener');
assert.equal(subjectByTitle.get('no owner').props.onClick, undefined, 'unassigned task: panel hands no opener');
assert.equal(typeof subjectByTitle.get('works owns this').props.onClick, 'function', 'teammate task binds');
assert.equal(subjectByTitle.get('dali owns this').props.onClick, undefined, 'failed-owner task: no opener');
assert.equal(subjectByTitle.get('yushi owns this').props.onClick, undefined, 'provisioning-owner task: no opener');
assert.equal(subjectByTitle.get('works owns this').props.style.cursor, 'pointer', 'clickable subject shows the pointer');
assert.equal(subjectByTitle.get('lead owns this').props.style.cursor, undefined, 'lead task keeps the plain cursor');
// a bound click with no uiWorkspace channel must degrade silently, never throw
assert.equal(subjectByTitle.get('works owns this').props.onClick(), false, 'missing channel → silent false, no throw');
// member cards: same inert rule as the native roster row (self / failed / provisioning)
const cardWho = (member, extra) => elements(client.MemberCard({
  member, statusLabel: (status) => status, ...extra,
})).find((node) => node.props?.key === 'who');
const activeWho = cardWho({ id: 'm-works', name: 'works', phase: 'active' }, { isCurrent: false, onOpen: recordOpen });
assert.equal(typeof activeWho.props.onClick, 'function', 'active non-current member binds');
assert.equal(activeWho.props.style.cursor, 'pointer', 'clickable member card shows the pointer');
assert.equal(activeWho.props.onClick(), true, 'click forwards to the opener');
for (const [label, member, extra] of [
  ['self', { id: 'lead-session', name: 'lead', phase: 'active' }, { isCurrent: true, onOpen: recordOpen }],
  ['failed', { id: 'm-dali', name: 'dali', phase: 'failed' }, { isCurrent: false, onOpen: recordOpen }],
  ['provisioning', { id: 'm-yushi', name: 'yushi', phase: 'provisioning' }, { isCurrent: false, onOpen: recordOpen }],
  ['no id', { name: 'works', phase: 'active' }, { isCurrent: false, onOpen: recordOpen }],
  ['no channel', { id: 'm-works', name: 'works', phase: 'active' }, { isCurrent: false }],
]) {
  const who = cardWho(member, extra);
  assert.equal(who.props.onClick, undefined, `${label}: no click binding`);
  assert.equal(who.props.style.cursor, undefined, `${label}: no pointer cursor`);
}
// panel level: exactly the one openable member card is bound
const whoNodes = clickEls.filter((node) => node.props?.key === 'who');
assert.equal(whoNodes.length, clickTeam.members.length, 'one who-row per member');
assert.deepEqual(whoNodes.map((node) => typeof node.props.onClick), ['undefined', 'function', 'undefined', 'undefined'],
  'lead(self)/failed/provisioning cards stay inert, the active mate binds');

console.log('PASS: avatars, stale-team warnings, and distinct member/owner/group identities; mocked React, not browser E2E');
console.log('PASS: task dependency edges — data attributes, three states, missing-blocker tolerance, reduced-motion CSS, geometry refresh gate');

// IDs are opaque; delimiter-bearing pairs must not collide or inject markup.
const special = client.buildTaskEdges(edgeBase, [
  {id:'a->b',blockedBy:['c','c']}, {id:'a',blockedBy:['b->c']},
  {id:'c'}, {id:'b->c'}, null, {id:'deleted',status:'deleted',blockedBy:['c']},
  {id:'self',blockedBy:['self']}
], () => edgeRect(20,20));
assert.equal(special.length,2);
assert.equal(new Set(special.map(e=>e.key)).size,2);
assert.equal(client.buildTaskEdges(edgeBase,[{id:'\ud800',blockedBy:['c']},{id:'c'}],()=>edgeRect(20,20)).length,1);
const masked = elements(client.TaskEdgeLayer({edges:built,cards:[{left:300,top:200,width:140,height:26}]}));
assert.ok(masked.filter(e=>e.type==='path').every(e=>e.props.mask==='url(#test-mask)'));
assert.ok(masked.some(e=>e.type==='rect' && e.props.fill==='black' && e.props.x===300));
console.log('PASS: opaque IDs, malformed/deleted/self dependency filtering and card-content masks');

const adjacent=client.buildTaskEdges(edgeBase,[{id:'top'},{id:'bottom',blockedBy:['top']}],id=>edgeRect(20,id==='top'?100:126));
assert.equal(adjacent.length,1);assert.notEqual(adjacent[0].s[1],adjacent[0].e[1]);
assert.ok(adjacent[0].c1[0]>adjacent[0].s[0]);
console.log('PASS: adjacent same-column rows retain a nonzero gutter curve');
console.log('PASS: edge direction blocker → blocked (start on blocker row, dot on blocked row) and click-to-open binding rules (lead/unassigned/inert never bind)');
