import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

let client;
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const exportPoint = 'return { inject, apply };';
// index.js 的提示词组装（memberBlock/leadBlock）在本文件直接断言两态。
const indexModule = await import(new URL('../index.js', import.meta.url));
assert.equal(source.split(exportPoint).length, 2);
// PR#22 coderabbit Major: client.js must not hardcode a machine home path.
assert.ok(!source.includes('/home/fslong'), 'client.js source carries no hardcoded home path');
// The card persists its optional local-source override in localStorage; both
// VM realms below get a minimal store so the save/clear paths are observable.
const pluginSpecStore = new Map();
const pluginSpecStorage = {
  getItem: (key) => (pluginSpecStore.has(key) ? pluginSpecStore.get(key) : null),
  setItem: (key, value) => { pluginSpecStore.set(key, String(value)); },
  removeItem: (key) => { pluginSpecStore.delete(key); },
};
const React = {
  useId: () => 'test-mask',
  createElement: (type, props, ...children) => ({ type, props, children }),
  useRef: () => ({ current: null }),
  // Persistent state is opt-in like useRef: only the re-render chain test needs
  // a setter that really changes the value the next render reads.
  // useMemo 的替身：按槽位保存上次的依赖数组，浅比较相同就复用上次结果
  // （生产代码用它收敛派生计算，测试也要能验证「同依赖不重算」）。
  // 与 useState 共用同一套调用顺序槽位（React 里所有 hook 共享顺序）。
  // 依赖浅比较相同则**不调用 factory**，这样才能断言「同依赖不重算」。
  useMemo: (factory, deps) => {
    const list = Array.isArray(deps) ? deps : [];
    if (persistentRefs === null) return factory();
    const index = hookStates.cursor++;
    const previous = hookStates.slots[index];
    const same = previous !== undefined && previous.__memo === true
      && previous.deps.length === list.length
      && previous.deps.every((item, i) => Object.is(item, list[i]));
    if (same) return previous.value;
    const value = factory();
    hookStates.slots[index] = { __memo: true, deps: list, value };
    return value;
  },
  useState: (initial) => {
    const value = typeof initial === 'function' ? initial() : initial;
    if (persistentRefs === null) return [value, () => {}];
    const index = hookStates.cursor++;
    if (!(index in hookStates.slots)) hookStates.slots[index] = value;
    return [hookStates.slots[index], (next) => {
      hookStates.slots[index] = typeof next === 'function' ? next(hookStates.slots[index]) : next;
    }];
  },
  useCallback: (callback) => callback,
  useLayoutEffect: () => {}, useEffect: (fn, deps) => { recordedEffects.push({ fn, deps }); },
};
// The panel decides whether to mount its usage ticker; the spy observes the real
// setInterval/clearInterval call the component makes (not a proxy assertion).
const recordedEffects = [];
const intervalSpy = { mounted: 0, cleared: 0, delays: [], lastTimer: null };
// A controllable clock: the 5s projection throttle is time-based, so the chain
// test advances this instead of sleeping.
const clockState = { now: 1000000 };
class RealmDate extends Date {
  constructor(...args) { super(...(args.length ? args : [clockState.now])); }
  static now() { return clockState.now; }
}
// A simulated re-render needs React's real useRef semantics (same ref across
// renders of one component). Opt-in only: while `persistentRefs` is null every
// render keeps the fresh-ref default, so no other harness changes behaviour.
let persistentRefs = null;
const hookStates = { cursor: 0, slots: [] };
const resetHookCursor = () => {
  if (persistentRefs !== null) {
    persistentRefs.cursor = 0;
    hookStates.cursor = 0;
  }
};
React.useRef = (initial) => {
  if (persistentRefs === null) return { current: initial };
  const arr = persistentRefs.slots;
  const index = persistentRefs.cursor++;
  if (!(index in arr)) arr[index] = { current: initial };
  return arr[index];
};


// 左列有 30 天新鲜度过滤（CABINET_SESSION_MAX_AGE_DAYS）：页面 fixture 的
// updatedAt 必须落在窗口内。统一用相对基准，保留原先的大小顺序。
const PAGE_NOW = Date.now();
// ageOf 保序：原值越大 ⇒ 时间越新，且所有映射结果都落在最近 ~12 天内
// （小于 30 天窗口，不会触发新鲜度过滤），既有排序断言的语义不变。
const ageOf = (value) => PAGE_NOW - (1000000 - value);
const exportList = 'return { inject, apply, avatarFor, displayName, chatBubbleName, chatBubbleNames, bureauOf, CabinetPanel, MemberCard, TaskLine, TaskEdgeLayer, buildTaskEdges, taskEdgesEqual, zh, en, BUREAUX, AVATARS, setMemberConfig, memberLabel, configuredAvatar, configuredPrompt, factoryPromptFor, DEFAULT_MEMBER_PROMPTS, DEFAULT_LEAD_PROMPT, CabinetMemberSettings, MemoryPluginCard, memoryPluginInstalledOf, SETTINGS_TABS, formatTokenCount, formatElapsed, tokenTotalOf, usageFor, planProjectionRequests, teamUsageOf, groupChatFold, markdownBlocksOf, markdownBlocksCached, inlineMarkdownTokens, markdownLinkHref, modelOptionsOf, modelCatalogNotice, modelSelectionOf, cabinetSessionChoices, cabinetSessionFilters, cabinetSessionGroups, defaultCabinetSession, CabinetMarkdown, CabinetPage, CabinetPanelIcon, GroupChatRow, STYLE_CSS, cabinetGroupMemberStates, mergeGroupChat, cabinetChatViewRows, chatStampNeeded, nearChatBottom, scrollChatToBottom, scrollFollowingTail, cabinetScopeRows, openCabinetSession };';
runInNewContext(source.replace(exportPoint, exportList), {
  setTimeout: (fn, ms) => setTimeout(fn, ms === 120000 ? 20 : ms), clearTimeout,
  Date: RealmDate,
  setInterval: (fn, ms) => { intervalSpy.mounted += 1; intervalSpy.delays.push(ms); intervalSpy.lastTimer = { fn, ms }; return intervalSpy.lastTimer; },
  clearInterval: () => { intervalSpy.cleared += 1; },
  // The group-chat retain effect aborts its subscription when the tab switches;
  // the VM realm has no web globals, so the host AbortController stands in.
  AbortController,
  console,
  localStorage: pluginSpecStorage, window: { __ModuleLoader__: { load: ({ factory }) => {
    client = factory((name) => {
      // The web boot seeds the primitives table; this harness deliberately does
      // not, and lets the require throw, so the plugin must take the fallback
      // path without crashing (the factory-top try/catch).
      if (name === '@deepseek-ai/dsh-client-ui-primitives') throw new Error('primitives not seeded in this harness');
      assert.equal(name, 'react');
      return React;
    });
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
    assert.equal(client.avatarFor(name), client.AVATARS[bureau.key] || client.AVATARS.neutral, name);
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
for (const key of ['hanlin', 'works', 'dali', 'yushi', 'tongzheng']) {
  assert.ok(client.factoryPromptFor(key).length > 0, `${key} must have a factory duty prompt`);
  assert.ok(client.factoryPromptFor(key).length <= 400, `${key} factory prompt must stay under 400 chars`);
}
assert.ok(client.DEFAULT_LEAD_PROMPT.includes('御下术'));
for (const clause of ['监控纠偏', '中断返回不代表', '写入停止后', '不并发增加第二写入者', '没有该机制不得承诺定时自动唤醒']) {
  assert.ok(client.DEFAULT_LEAD_PROMPT.includes(clause), `lead prompt carries the monitoring/correction clause: ${clause}`);
}
assert.ok(client.DEFAULT_LEAD_PROMPT.includes('新建团队任务的 description 须写明目标、交付物、验收标准与写入范围'), 'lead prompt requires a task-sheet description');
assert.ok(client.DEFAULT_LEAD_PROMPT.length <= 4000, 'lead prompt stays under MAX_PROMPT_LENGTH');
for (const key of ['hanlin', 'works', 'dali', 'yushi']) {
  assert.ok(!client.DEFAULT_MEMBER_PROMPTS[key].includes('新建团队任务的 description'), `${key} prompt stays unchanged`);
}
assert.equal(client.avatarFor('tongzheng'), client.AVATARS.neutral, 'tongzheng uses the existing neutral portrait');
assert.equal(client.AVATARS.tongzheng, undefined, 'AVATARS has no tongzheng key and no seventh data URL');
assert.equal(client.displayName('tongzheng'), '通政使 · tongzheng');
assert.equal(client.displayName('通政'), '通政使 · 通政');
// Removed spawn names are not silently accepted as the sixth office.
assert.equal(client.displayName('lianxiang'), 'lianxiang');
assert.equal(client.avatarFor('lianxiang'), client.AVATARS.neutral, 'the removed name maps to no office');
assert.ok(!client.DEFAULT_LEAD_PROMPT.includes('联想模式'), 'the association switch is not frozen into the factory Lead prompt');
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

// --- 内阁 Bot section removed: the roster cards are the only member view ----
// The standing-office list (office row, 现役/未上朝/工作中, 派活 button, live step
// block) is gone; the 品字形 member cards carry roster, usage and tasks. The
// 通政使 office itself stays: its label, avatar fallback and duty prompt are
// still part of the member model.
const rosterTeam = { members: [
  { id: 'lead-session', name: 'lead', role: 'lead', phase: 'active' },
  { id: 'm-works', name: 'works', role: 'mate', phase: 'active' },
], tasks: [] };
const rosterPanel = () => client.CabinetPanel({
  sessionId: 'lead-session',
  useSession: (select) => select({}),
  useSessions: (select) => select({ projectionsBySession: { 'lead-session': { values: { agentTeam: rosterTeam } } } }),
  useSessionStatus: (select) => select(new Map([['m-works', { running: true }]])),
  t: (key) => client.zh[key] || key,
});
const rosterNodes = elements(rosterPanel());
const rosterJson = JSON.stringify(rosterNodes);
assert.ok(!rosterNodes.some((node) => node.props?.['data-cabinet-bot-section'] === '1'), 'the 内阁 Bot section no longer renders');
assert.ok(!rosterNodes.some((node) => node.props?.['data-cabinet-bot-row'] !== undefined), 'no standing-office rows render');
assert.ok(!rosterNodes.some((node) => node.props?.['data-cabinet-bot-state'] !== undefined), 'no 现役/未上朝 state cells render');
assert.ok(!rosterNodes.some((node) => node.props?.['data-cabinet-bot-dispatch'] !== undefined), 'no 派活 button renders');
assert.ok(!rosterNodes.some((node) => node.props?.['data-cabinet-bot-association'] !== undefined), 'no 联想 开/关 cell renders');
assert.ok(!rosterNodes.some((node) => node.props?.['data-cabinet-live'] !== undefined), 'no live working block renders');
assert.ok(rosterJson.includes(client.zh['section.roster']), 'the roster section title still renders');
assert.ok(rosterNodes.some((node) => node.props?.['data-cabinet-task'] !== undefined || node.props?.key === 'usage'), 'member cards still carry usage/task content');
// The office itself is untouched: ignore-only state, label, avatar and prompt.
assert.equal(client.zh['member.tongzheng'], '通政使', '通政使 label stays in the dictionary');
assert.equal(client.avatarFor('tongzheng'), client.AVATARS.neutral, '通政使 keeps using the neutral portrait');
assert.equal(client.displayName('tongzheng'), '通政使 · tongzheng', '通政使 keeps its display name');
assert.ok(client.factoryPromptFor('tongzheng').includes('通政使'), '通政使 keeps its duty prompt');

// --- click-through: whole card, whole task row and Owner tag are targets ---
// One click must open exactly one session. Every nested target stops the event,
// so the enclosing handler (row inside card, subject/Owner inside row) cannot
// forward the same click a second time.
const eventLog = [];
const fakeEvent = () => ({ stopped: false, stopPropagation() { this.stopped = true; eventLog.push('stopped'); } });
const cardOf = (member, extra) => elements(client.MemberCard({
  member, statusLabel: (status) => status, ...extra,
})).find((node) => typeof node.props?.className === 'string' && node.props.className.split(' ').includes('cabinet-card'));
const opens = [];
const openRecorder = (target) => { opens.push(target); return true; };

// 1) the task row itself binds, shows the pointer, and stops the click
const rowLine = client.TaskLine({ task: tasks[0], t: (key) => key, taskLabel: (status) => status, onOpenOwner: openRecorder });
const rowNode = elements(rowLine).find((node) => node.props?.['data-cabinet-task'] === tasks[0].id);
assert.equal(typeof rowNode.props.onClick, 'function', 'the whole task row binds a resolved opener');
assert.equal(rowNode.props.style.cursor, 'pointer', 'the whole task row shows the pointer cursor');
assert.ok(rowNode.props.className.split(' ').includes('cabinet-clickable'), 'the clickable row carries the hover class');
const rowEvent = fakeEvent();
assert.equal(rowNode.props.onClick(rowEvent), true, 'the row forwards to the opener');
assert.deepEqual(opens, [tasks[0]], 'one click on the row opens once');
assert.equal(rowEvent.stopped, true, 'the row stops the click so the enclosing card cannot also open');

// 2) the Owner tag binds and stops the click instead of double-opening
// Tag drops the element key when it renders its span, so locate the Owner tag by
// its label text (same probe the identity test above uses).
const ownerTag = (line) => elements(line).find((node) => ['span', 'button'].includes(node.type)
  && node.children.flat().some((text) => typeof text === 'string' && text.startsWith('Owner: ')));
const boundOwner = ownerTag(client.TaskLine({ task: tasks[0], t: (key) => key, taskLabel: (status) => status, onOpenOwner: openRecorder }));
assert.equal(boundOwner.type, 'button', 'Owner is a native keyboard button');
assert.equal(boundOwner.props.type, 'button');
assert.equal(typeof boundOwner.props.onClick, 'function', 'the Owner tag binds a resolved opener');
assert.equal(boundOwner.props.style.cursor, 'pointer', 'the Owner tag shows the pointer cursor');
opens.length = 0;
const ownerEvent = fakeEvent();
assert.equal(boundOwner.props.onClick(ownerEvent), true, 'the Owner tag forwards to the opener');
assert.deepEqual(opens, [tasks[0]], 'one click on the Owner tag opens once');
assert.equal(ownerEvent.stopped, true, 'the Owner tag stops the click so the row cannot also open');

// 3) the subject keeps working and also stops the click
const subjectNode = elements(client.TaskLine({ task: tasks[0], t: (key) => key, taskLabel: (status) => status, onOpenOwner: openRecorder }))
  .find((node) => node.props?.key === 'subj');
opens.length = 0;
assert.equal(subjectNode.type, 'button', 'Subject is a native keyboard button');
const subjectEvent = fakeEvent();
subjectNode.props.onClick(subjectEvent);
assert.deepEqual(opens, [tasks[0]], 'the subject still opens once with an event argument');
assert.equal(subjectEvent.stopped, true, 'the subject stops the click so the row cannot also open');

// 4) a task row inside a member card: card binds, row stops, card handler is not
//    reachable from the row click (React propagation ends at stopPropagation)
const hybridCard = cardOf({ id: 'm-works', name: 'works', phase: 'active' },
  { isCurrent: false, onOpen: openRecorder, children: [client.TaskLine({ task: tasks[0], t: (key) => key, taskLabel: (status) => status, onOpenOwner: openRecorder })] });
assert.equal(typeof hybridCard.props.onClick, 'function', 'the card around a task row still binds');
const hybridRow = elements(hybridCard).find((node) => node.props?.['data-cabinet-task'] === tasks[0].id);
assert.equal(typeof hybridRow.props.onClick, 'function', 'the nested task row binds independently');
opens.length = 0;
const nestedEvent = fakeEvent();
hybridRow.props.onClick(nestedEvent);
assert.equal(nestedEvent.stopped, true, 'the nested row stops before the card handler can run');
assert.deepEqual(opens, [tasks[0]], 'clicking a task inside a card opens the task target once, never the member');

// Nested member identity is a native button and prevents its card from firing.
const who = elements(hybridCard).find(node => node.props?.key === 'who');
assert.equal(who.type, 'button');
opens.length = 0;
const whoEvent = fakeEvent();
who.props.onClick(whoEvent);
if (!whoEvent.stopped) hybridCard.props.onClick(whoEvent);
assert.equal(opens.length, 1);

// 5) inert members stay inert on the CARD too (self / failed / provisioning / no id / no channel)
for (const [label, member, extra] of [
  ['self', { id: 'lead-session', name: 'lead', phase: 'active' }, { isCurrent: true, onOpen: openRecorder }],
  ['failed', { id: 'm-dali', name: 'dali', phase: 'failed' }, { isCurrent: false, onOpen: openRecorder }],
  ['provisioning', { id: 'm-yushi', name: 'yushi', phase: 'provisioning' }, { isCurrent: false, onOpen: openRecorder }],
  ['no id', { name: 'works', phase: 'active' }, { isCurrent: false, onOpen: openRecorder }],
  ['no channel', { id: 'm-works', name: 'works', phase: 'active' }, { isCurrent: false }],
]) {
  const card = cardOf(member, extra);
  assert.equal(card.props.onClick, undefined, `${label}: the whole card stays unbound`);
  assert.equal(card.props.style.cursor, undefined, `${label}: the whole card keeps the plain cursor`);
  assert.ok(!card.props.className.includes('cabinet-card-clickable'), `${label}: no hover affordance on an inert card`);
}

// 6) tasks without a resolved opener stay plain on the row and the Owner tag
for (const task of [
  { id: 'k-lead', subject: 'lead work', ownerName: 'lead', status: 'pending' },
  { id: 'k-none', subject: 'nobody', status: 'pending' },
]) {
  const line = client.TaskLine({ task, t: (key) => key, taskLabel: (status) => status, onOpenOwner: null });
  const row = elements(line).find((node) => node.props?.['data-cabinet-task'] === task.id);
  assert.equal(row.props.onClick, undefined, `${task.id}: no row click binding without an opener`);
  assert.equal(row.props.style.cursor, undefined, `${task.id}: no pointer cursor on the row`);
  assert.ok(!String(row.props.className || '').includes('cabinet-clickable'), `${task.id}: no hover affordance without an opener`);
  if (task.ownerName) {
    const owner = ownerTag(line);
    assert.equal(owner.props.onClick, undefined, `${task.id}: no Owner-tag click binding without an opener`);
    assert.equal(owner.props.style.cursor, undefined, `${task.id}: no pointer cursor on the Owner tag`);
  }
}

// 7) panel level: the whole card of the one openable member is bound, the rest inert
const memberCardNodes = clickEls.filter((node) => typeof node.props?.className === 'string' && node.props.className.split(' ').includes('cabinet-card'));
// The panel also paints bucket cards (unassigned / foreign owner) next to the
// member cards, so count clickable cards instead of assuming one per member.
const boundCardNodes = memberCardNodes.filter((node) => typeof node.props.onClick === 'function');
assert.equal(boundCardNodes.length, 1, 'exactly one card in the panel is clickable: the single openable member');
assert.ok(boundCardNodes[0].props.className.includes('cabinet-card-clickable'), 'the clickable card carries the hover affordance');
assert.deepEqual(memberCardNodes.filter((node) => node !== boundCardNodes[0]).map((node) => node.props.onClick), memberCardNodes.filter((node) => node !== boundCardNodes[0]).map(() => undefined),
  'every other card — inert member and bucket alike — stays unbound');

console.log('PASS: avatars, stale-team warnings, and distinct member/owner/group identities; mocked React, not browser E2E');
console.log('PASS: click-through targets — whole card, whole task row and Owner tag bind only with a resolved opener, nested clicks stop propagation so one click opens one session, inert members stay inert');

// --- member usage: token total, elapsed time, context pressure (projections) ---
// Projection field names come from the DSH session schema; nothing here invents
// one. A missing projection must render the em dash, never throw.
assert.equal(client.formatTokenCount(842), '842', 'sub-thousand tokens stay exact');
assert.equal(client.formatTokenCount(1500), '1.5K', 'thousands collapse to one decimal');
assert.equal(client.formatTokenCount(3300000), '3.3M', 'millions collapse to one decimal');
assert.equal(client.formatTokenCount(undefined), undefined, 'missing total has no string');
assert.equal(client.formatTokenCount(Number.NaN), undefined, 'non-finite total has no string');
assert.equal(client.formatElapsed(12000), '12s');
assert.equal(client.formatElapsed(192000), '3m12s');
assert.equal(client.formatElapsed(3900000), '1h05m');
assert.equal(client.formatElapsed(undefined), undefined, 'missing timing has no string');

const fullValues = {
  tokenUsage: { uncachedInputTokens: 1000, outputTokens: 2000, cacheReadTokens: 3000000, cacheWriteTokens: 4000 },
  subagentTiming: { settledMs: 5000, active: { since: 100000, through: 180000 } },
  contextPressure: { projectedTokens: 120000, contextWindow: 400000 },
  contextBreakdown: { systemTokens: 2000, toolsTokens: 6000, messageTokens: 2000 },
};
const full = client.usageFor(fullValues, 112000);
assert.equal(full.tokens, 3007000, 'token total sums the four durable buckets');
assert.equal(full.elapsedMs, 17000, 'a running member adds now − active.since to settledMs');
assert.equal(full.context.percent, 30, 'context percent is projectedTokens / contextWindow');
assert.deepEqual(Array.from(full.context.segments, (segment) => segment.key), ['system', 'tools', 'message'], 'segments follow the projection breakdown order');
assert.deepEqual(Array.from(full.context.segments, (segment) => Math.round(segment.ratio * 100)), [20, 60, 20], 'segments follow the projection breakdown');
const settledOnly = client.usageFor({ ...fullValues, subagentTiming: { settledMs: 42000 } }, 112000);
assert.equal(settledOnly.elapsedMs, 42000, 'an inactive member shows settledMs');
const closedActive = client.usageFor({ subagentTiming: { settledMs: 5000, active: { since: 100000, through: 180000 } } }, 112000, false);
assert.equal(closedActive.elapsedMs, 85000, 'an inactive member ends the active window at active.through, not at now (native parity)');
const openActive = client.usageFor({ subagentTiming: { settledMs: 5000, active: { since: 100000, through: 180000 } } }, 112000, true);
assert.equal(openActive.elapsedMs, 17000, 'a running member keeps counting to now');
const noWindow = client.usageFor({ contextPressure: { projectedTokens: 120000 }, contextBreakdown: { systemTokens: 1 } }, 0);
assert.equal(noWindow.context.percent, undefined, 'no contextWindow → no ratio, numbers only');
assert.deepEqual(noWindow.context.segments.length, 1, 'breakdown still renders without a window');
const empty = client.usageFor(undefined, 112000);
assert.equal(empty.tokens, undefined);
assert.equal(empty.elapsedMs, undefined);
assert.equal(empty.context, undefined, 'a missing projection yields no context, and no throw');
assert.equal(client.formatTokenCount(empty.tokens) ?? '—', '—', 'the card prints the em dash for a missing total');
assert.equal(client.formatElapsed(empty.elapsedMs) ?? '—', '—', 'the card prints the em dash for a missing time');

// Throttle is TIME based, not once-per-mount: a running card must keep moving.
// A live id is skipped inside the 5s window and eligible again once it passes;
// a member that stopped is simply never passed in (panel filters on running).
const REQUEST_LOG = new Map([['m-works', 1000], ['m-dali', 2500]]);
assert.deepEqual(Array.from(client.planProjectionRequests(['m-works', 'm-dali', 'm-yushi', 'm-yushi', '', null], REQUEST_LOG, 3000, 5000)),
  ['m-yushi'], 'inside the 5s window a requested id is skipped; unknown ids and duplicates collapse');
assert.deepEqual(Array.from(client.planProjectionRequests(['m-works', 'm-dali'], REQUEST_LOG, 5999, 5000)), [],
  'just under the window nothing is re-requested — the number is not double-fetched');
assert.deepEqual(Array.from(client.planProjectionRequests(['m-works', 'm-dali'], REQUEST_LOG, 7500, 5000)), ['m-works', 'm-dali'],
  'past the window both ids are eligible again — a running card refreshes');
assert.deepEqual(Array.from(client.planProjectionRequests(['m-works'], undefined, 9000, 5000)), ['m-works'],
  'a missing request log still plans the id, never throws');

// Team total on the lead card = the sum of its members.
const teamSum = client.teamUsageOf([{ tokens: 1000, elapsedMs: 60000 }, { tokens: 2000, elapsedMs: 5000 }, undefined, {}]);
assert.equal(teamSum.tokens, 3000, 'team tokens sum the members');
assert.equal(teamSum.elapsedMs, 65000, 'team time sums the members');
const emptyTeam = client.teamUsageOf(undefined);
assert.equal(emptyTeam.tokens, undefined, 'no members → no team tokens');
assert.equal(emptyTeam.elapsedMs, undefined, 'no members → no team time');

// Card render: a projection paints the usage line, a missing one paints dashes.
const zhT = (key) => client.zh[key] || key;
const usageCard = elements(client.MemberCard({
  member: { id: 'm-works', name: 'works', phase: 'active' },
  statusLabel: (status) => status,
  t: zhT,
  usage: full,
  teamUsage: teamSum,
})).find((node) => node.props?.key === 'usage');
assert.ok(usageCard, 'the card renders a usage line');
const usageText = JSON.stringify(usageCard);
assert.ok(usageText.includes(client.zh['usage.tokens'] + ' 3M'), 'token total is rendered compactly: ' + usageText.slice(0, 160));
assert.ok(usageText.includes(client.zh['usage.elapsed'] + ' 17s'), 'elapsed time is rendered');
assert.ok(usageText.includes('30%'), 'context percent is rendered');
assert.ok(usageText.includes(client.zh['usage.team'] + ' 3K'), 'the lead card shows the team total');
const bars = elements(usageCard).filter((node) => node.props?.className === 'cabinet-ctxbar-system');
assert.equal(bars.length, 1, 'the context bar carries one segment per breakdown part');
const dashCard = elements(client.MemberCard({
  member: { id: 'm-dali', name: 'dali', phase: 'active' },
  statusLabel: (status) => status,
  t: zhT,
  usage: empty,
})).find((node) => node.props?.key === 'usage');
const dashText = JSON.stringify(dashCard);
assert.ok(dashText.includes(client.zh['usage.tokens'] + ' ' + client.zh['usage.none']), 'a missing token projection renders the em dash');
assert.ok(dashText.includes(client.zh['usage.elapsed'] + ' ' + client.zh['usage.none']), 'a missing timing projection renders the em dash');
assert.ok(!dashText.includes('cabinet-ctxbar'), 'no context bar without a pressure projection');
const noUsageCard = elements(client.MemberCard({ member: { name: 'works', phase: 'active' }, statusLabel: (status) => status, t: (key) => key }))
  .filter((node) => node.props?.key === 'usage');
assert.equal(noUsageCard.length, 0, 'a member without a session id renders no usage line at all');

// Panel wiring: the usage line appears for a member whose projection exists.
const usagePanel = elements(client.CabinetPanel({
  sessionId: 'lead-session',
  useSession: (select) => select({}),
  useSessions: (select) => select({ projectionsBySession: {
    'lead-session': { values: { tokenUsage: { outputTokens: 1000 }, agentTeam: { members: [{ id: 'm-works', name: 'works', role: 'mate', phase: 'active' }], tasks: [] } } },
    'm-works': { values: { tokenUsage: { outputTokens: 2000 }, subagentTiming: { settledMs: 42000 } } },
  } }),
  useSessionStatus: (select) => select(new Map()),
  t: (key) => client.zh[key] || key,
}));
assert.ok(elements(usagePanel).some((node) => node.props?.key === 'usage'), 'the panel hands projections to the member cards');
const panelTeam = elements(usagePanel)
  .filter((node) => node.props?.key === 'usage')
  .map((node) => JSON.stringify(node))
  .find((text) => text.includes(client.zh['usage.team']));
assert.ok(panelTeam, 'the lead card renders a team total');
assert.ok(panelTeam.includes(client.zh['usage.team'] + ' 3K'), 'the team total includes the lead itself (1K lead + 2K mate)');

// A blocker chip is information, not navigation: it must stop the click before
// the task row's opener runs.
const chipOpenLog = [];
const chipLine = client.TaskLine({
  task: { id: 't-chip', subject: 'rows', ownerName: 'works', status: 'pending', blockedBy: ['t-blocker'] },
  blockerOf: (id) => (id === 't-blocker' ? { subject: 'upstream work', status: 'pending' } : undefined),
  t: (key) => key,
  taskLabel: (status) => status,
  onOpenOwner: (task) => { chipOpenLog.push(task); return true; },
});
const chipNode = elements(chipLine).find((node) => node.props?.title === 'upstream work');
assert.ok(chipNode, 'the blocker chip renders');
assert.equal(typeof chipNode.props.onClick, 'function', 'a blocker chip is its own click target');
const chipEvent = { stopped: false, stopPropagation() { this.stopped = true; } };
chipNode.props.onClick(chipEvent);
assert.equal(chipEvent.stopped, true, 'the chip stops the click so the task row does not navigate');
assert.deepEqual(chipOpenLog, [], 'clicking a blocker chip never opens the owner session');

// Facts: refreshProjections reads a session once and resolves without reading
// once that load is `ready` (manager.js:268-272); later changes come from Host
// pushed frames (control.js:9-19) into the store the panel renders from.
// React semantics for the double: an effect whose deps array is shallow-equal
// to the previous render's deps does not run again (the panel's request-state
// reset effect must not wipe its Map on every unrelated re-render).
const depSlots = [];
const sameDeps = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const factsRunEffects = () => {
  const queued = recordedEffects.splice(0, recordedEffects.length);
  const cleanups = [];
  let index = 0;
  for (const entry of queued) {
    const previous = depSlots[index];
    if (previous !== undefined && sameDeps(previous.deps, entry.deps)) {
      if (typeof previous.cleanup === 'function') cleanups.push(previous.cleanup);
      index += 1;
      continue;
    }
    const cleanup = entry.fn();
    depSlots[index] = { deps: entry.deps, cleanup };
    if (typeof cleanup === 'function') cleanups.push(cleanup);
    index += 1;
  }
  depSlots.length = index;
  return () => { for (const cleanup of cleanups) cleanup(); };
};
const factsCalls = [];
const factsReads = [];
const factsReady = new Set();
const factsSessions = {
  refreshProjections: (id) => {
    factsCalls.push(id);
    if (factsReady.has(id)) return Promise.resolve(); // ready → short circuit, no read
    factsReady.add(id);
    factsReads.push(id);
    return Promise.resolve();
  },
};
client.apply({
  locale: { register: () => {}, bind: () => (key) => key },
  effect: (fn) => { try { return fn(); } catch (error) { return undefined; } },
  inject: (names, callback) => {
    if (Array.isArray(names) && names.includes('sessions')) callback({ sessions: factsSessions, effect: (fn) => { try { return fn(); } catch (error) { return undefined; } } });
  },
});
const factsPanel = (mateTokens, extra) => elements(client.CabinetPanel({
  sessionId: 'lead-session',
  useSession: (select) => select({}),
  useSessions: (select) => select({ projectionsBySession: {
    'lead-session': { values: { tokenUsage: { outputTokens: 1000 }, agentTeam: { members: [
      { id: 'm-works', name: 'works', role: 'mate', phase: 'active' },
      ...((extra && extra.members) || []),
    ], tasks: [] } } },
    'm-works': { values: { tokenUsage: { outputTokens: mateTokens } } },
  } }),
  useSessionStatus: (select) => select(new Map((extra && extra.status) || [['m-works', { running: true }]])),
  t: (key) => client.zh[key] || key,
}));
const factsUsageText = (nodes) => nodes
  .filter((node) => node.props?.key === 'usage')
  .map((node) => JSON.stringify(node))
  .join('|');

clockState.now = 2000000;
recordedEffects.length = 0;
persistentRefs = { cursor: 0, slots: [] };
factsCalls.length = 0; factsReads.length = 0; factsReady.clear();
resetHookCursor();
const factsFirst = factsPanel(2000);
const factsStop = factsRunEffects();
assert.deepEqual(Array.from(factsReads).sort(), ['lead-session', 'm-works'], 'the first pass ensures every member once (an idle one included)');
assert.ok(factsUsageText(factsFirst).includes(' 2K'), 'the first read paints the member total');
const factsCallsAfterFirst = factsCalls.length;
const factsReadsAfterFirst = factsReads.length;
await new Promise((resolve) => setTimeout(resolve, 0));

// One 5s tick: the bounded retry asks again, but the manager is `ready`, so
// nothing is read. This is the fact the old "every 5s re-read" story got wrong.
clockState.now += 5001;
intervalSpy.lastTimer.fn();
resetHookCursor();
factsPanel(2000);
factsRunEffects();
// The tick re-renders on the retry cadence; whatever it does, it must not read
// the session again — that is the ready short-circuit this suite used to miss.
assert.deepEqual(factsCalls.slice(factsCallsAfterFirst), ['m-works'], 'a tick retries only the running member');
assert.equal(factsReads.length, factsReadsAfterFirst, 'no re-read after a tick: the ready load short-circuits (manager.js:268-272)');

// A Host push frame changes the store the panel renders from: the number moves
// with no further read and no further ensure call.
clockState.now += 1000;
const factsCallsBeforePush = factsCalls.length;
resetHookCursor();
const factsPushed = factsPanel(5000);
factsRunEffects();
assert.ok(factsUsageText(factsPushed).includes(' 5K'), 'a Host-pushed projection frame updates the card to the new total');
assert.ok(!factsUsageText(factsPushed).includes(' 2K'), 'the card shows the pushed value, not the stale one');
assert.equal(factsReads.length, factsReadsAfterFirst, 'the update came from the push, not from re-reading the session');
assert.equal(factsCalls.length, factsCallsBeforePush, 'a push never re-reads or re-requests on its own');
factsStop();

// An idle member is ensured once when the panel first sees it (never-loaded
// stores get filled), then not re-requested inside the window.
factsCalls.length = 0; factsReads.length = 0; factsReady.clear();
clockState.now = 3000000;
recordedEffects.length = 0;
persistentRefs = { cursor: 0, slots: [] };
const idleFacts = () => factsPanel(2000, {
  members: [{ id: 'm-dali', name: 'dali', role: 'mate', phase: 'active' }],
  status: [['m-works', { running: true }]],
});
resetHookCursor();
idleFacts();
const idleStop = factsRunEffects();
assert.ok(factsCalls.includes('m-dali'), 'an idle, never-loaded member still gets one ensure call');
resetHookCursor();
clockState.now += 1000;
idleFacts();
factsRunEffects();
assert.equal(factsCalls.filter((id) => id === 'm-dali').length, 1, 'an idle member is not re-requested inside the window');
idleStop();
persistentRefs = null;

// Stateful lifecycle, initial/settled loads and timer cleanup are exercised
// with real React DOM by scripts/test-panel-browser.mjs, not this hook double.
console.log('PASS: member usage formatting, missing data, throttle helpers, active.through parity, blocker chips that do not navigate, team total including the lead, and the projection facts — a ready load short-circuits (the retry call reads nothing) while a Host push frame updates the card without another read; lifecycle is tested separately with real React DOM');
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

// --- settings page: four tabs + the memory-plugin card ----------------------
// The shared React double above keeps useState inert; this second instance gives
// the settings page a stateful double so a tab click can be observed by
// re-rendering the same component with the updated state store.
let settingsClient;
const settingsState = [];
let settingsCursor = 0;
const SettingsReact = {
  ...React,
  useState: (initial) => {
    const index = settingsCursor++;
    if (!(index in settingsState)) settingsState[index] = initial;
    return [settingsState[index], (next) => { settingsState[index] = typeof next === 'function' ? next(settingsState[index]) : next; }];
  },
};
runInNewContext(source.replace(exportPoint, exportList), {
  setTimeout: (fn, ms) => setTimeout(fn, ms === 120000 ? 20 : ms), clearTimeout, localStorage: pluginSpecStorage, window: { __ModuleLoader__: { load: ({ factory }) => { settingsClient = factory((name) => { assert.equal(name, 'react'); return SettingsReact; }); } } },
});
const mountSettings = (props) => {
  settingsState.length = 0;
  settingsCursor = 0;
  return () => { settingsCursor = 0; return elements(settingsClient.CabinetMemberSettings(props)); };
};
const tabButton = (nodes, id) => nodes.find((node) => node.props?.['data-cabinet-settings-tab'] === id);

const renderSettings = mountSettings({ t: (key) => key });
let nodes = renderSettings();
assert.deepEqual(['members', 'avatars', 'models', 'prompts', 'plugin'].map((id) => tabButton(nodes, id)?.props['data-cabinet-settings-tab']),
  ['members', 'avatars', 'models', 'prompts', 'plugin'], 'the settings page exposes five tabs in order');
assert.equal(tabButton(nodes, 'members').props['data-cabinet-settings-active'], '1', 'the members tab starts active');
assert.ok(nodes.some((node) => node.props?.key === 'name'), 'members tab shows the name field');
assert.ok(!nodes.some((node) => node.props?.key === 'pi'), 'prompt textarea is not on the members tab');
assert.ok(!nodes.some((node) => node.props?.key === 'builtin'), 'avatar row is not on the members tab');
assert.ok(nodes.some((node) => node.props?.key === 'head'), 'row head stays visible so members remain identifiable');
// The card lives inside the plugin tab now: absent by default, shown while the
// tab is active, and it is still the content directly above save/cancel there.
assert.equal(nodes.findIndex((node) => node.props?.['data-cabinet-plugin-card']), -1, 'the memory-plugin card is not on the default members tab');
tabButton(nodes, 'plugin').props.onClick();
nodes = renderSettings();
const cardAt = nodes.findIndex((node) => node.props?.['data-cabinet-plugin-card']);
const saveAt = nodes.findIndex((node) => node.props?.key === 'save');
assert.ok(cardAt >= 0, 'clicking the plugin tab shows the memory-plugin card');
assert.ok(saveAt > cardAt, 'the card sits directly above the save/cancel row while its tab is active');
assert.ok(!nodes.some((node) => node.props?.key === 'fields'), 'the plugin tab renders no members fieldset: its own content is the plugin card, and member shells without their sections would only be empty head rows');
tabButton(nodes, 'members').props.onClick();
nodes = renderSettings();
assert.ok(!nodes.some((node) => node.props?.['data-cabinet-plugin-card']), 'leaving the plugin tab hides the card again');
assert.ok(nodes.some((node) => node.props?.key === 'cancel'), 'cancel survives the restructure');

tabButton(nodes, 'models').props.onClick();
nodes = renderSettings();
assert.equal(tabButton(nodes, 'models').props['data-cabinet-settings-active'], '1', 'clicking a tab activates it');
assert.ok(nodes.some((node) => node.props?.['data-cabinet-settings-refresh'] === '1'), 'the catalog refresh moved into the models tab');
assert.ok(nodes.some((node) => node.props?.key === 'ml'), 'models tab shows the model field');
assert.ok(!nodes.some((node) => node.props?.key === 'name'), 'name field is not on the models tab');

tabButton(nodes, 'prompts').props.onClick();
nodes = renderSettings();
assert.ok(nodes.some((node) => node.props?.key === 'pi'), 'prompts tab shows the prompt textarea');
assert.ok(!nodes.some((node) => node.props?.key === 'ml'), 'model field is not on the prompts tab');

tabButton(nodes, 'avatars').props.onClick();
nodes = renderSettings();
assert.ok(nodes.some((node) => node.props?.key === 'builtin'), 'avatars tab shows the portrait row');
assert.ok(!nodes.some((node) => node.props?.key === 'pi'), 'prompt textarea is not on the avatars tab');
assert.ok(nodes.some((node) => node.props?.key === 'head'), 'row head stays visible on every member tab');

// Memory-plugin card: no channel degrades loudly, the installed state offers
// update (never one-click install), specs stay off the card face, the version
// falls back to the local source package.json, and failures echo verbatim.
settingsState.length = 0; settingsCursor = 0;
let cardNodes = elements(settingsClient.MemoryPluginCard({ t: (key) => key }));
assert.ok(cardNodes.some((node) => node.props?.['data-cabinet-plugin-state'] === 'unavailable'), 'a missing channel is stated, not silent');
const deadButton = cardNodes.find((node) => node.props?.['data-cabinet-plugin-action'] === 'install');
assert.ok(deadButton && deadButton.props.disabled === true, 'the install button stays disabled without a channel');
const faceTextOf = (rendered) => JSON.stringify(rendered.map((node) => node.props));
assert.ok(!faceTextOf(cardNodes).includes('file:'), 'the local file: spec is never rendered on the card');
assert.ok(!faceTextOf(cardNodes).includes('@rsrsai/dsh@'), 'the registry spec is never rendered on the card');
assert.ok(cardNodes.some((node) => node.props?.['data-cabinet-plugin-hint'] !== undefined), 'the highlight list renders on the card face');

settingsState.length = 0; settingsCursor = 0;
cardNodes = elements(settingsClient.MemoryPluginCard({ t: (key) => key, initialInstalled: { name: '@rsrsai/dsh', version: '0.1.13', enabled: true } }));
assert.ok(cardNodes.some((node) => node.props?.['data-cabinet-plugin-state'] === 'installed'), 'the installed state is announced');
assert.ok(!cardNodes.some((node) => node.props?.['data-cabinet-plugin-action'] === 'install'), 'the installed state shows no one-click install button');
const updateButton = cardNodes.find((node) => node.props?.['data-cabinet-plugin-action'] === 'update');
assert.ok(updateButton && updateButton.props.disabled === true, 'the installed state offers an update button, disabled without a channel');
const versionNode = cardNodes.find((node) => node.props?.['data-cabinet-plugin-version'] !== undefined);
assert.ok(versionNode && String(versionNode.children.flat().join('')).includes('0.1.13'), 'the installed version is visible on the card');
assert.ok(!faceTextOf(cardNodes).includes('file:'), 'the file: spec stays hidden in the installed state');
assert.ok(!faceTextOf(cardNodes).includes('@rsrsai/dsh@'), 'the registry spec stays hidden in the installed state');

settingsState.length = 0; settingsCursor = 0;
cardNodes = elements(settingsClient.MemoryPluginCard({ t: (key) => key, initialInstalled: { name: '@rsrsai/dsh', version: '', enabled: true } }));
const fallbackVersionNode = cardNodes.find((node) => node.props?.['data-cabinet-plugin-version'] !== undefined);
assert.ok(fallbackVersionNode && !String(fallbackVersionNode.children.flat().join('')).includes('0.1.13'), 'unknown installed version must not claim the source version');
assert.ok(fallbackVersionNode && String(fallbackVersionNode.children.flat().join('')).includes('settings.plugin.versionFallback'), 'the version fallback is marked on the card');

const mappedInstalled = settingsClient.memoryPluginInstalledOf([{ name: '@rsrsai/dsh', installed: true, version: '0.1.13', enabled: true }]);
// Field-by-field: the module lives in its own realm, so deepStrictEqual would
// compare a foreign Object.prototype and fail on identical fields.
assert.equal(mappedInstalled && mappedInstalled.name, '@rsrsai/dsh', 'listBundles shape maps to the card state');
assert.equal(mappedInstalled && mappedInstalled.version, '0.1.13', 'the installed version is carried through');
assert.equal(mappedInstalled && mappedInstalled.enabled, true, 'the enabled flag is carried through');
assert.equal(settingsClient.memoryPluginInstalledOf([{ name: 'other', installed: true }]), null, 'other bundles never count as ours');
assert.equal(settingsClient.memoryPluginInstalledOf('junk'), null, 'malformed replies never throw');

settingsState.length = 0; settingsCursor = 0;
const failingManager = {
  inspect: async () => ({ ok: false, error: { message: 'boom: registry unreachable' } }),
  installBundle: async () => ({ ok: false, error: { message: 'unreachable' } }),
  listBundles: async () => ({ok:true,value:[]}),
};
cardNodes = elements(settingsClient.MemoryPluginCard({ t: (key) => key, manager: failingManager }));
const installButton = cardNodes.find((node) => node.props?.['data-cabinet-plugin-action'] === 'install');
assert.ok(installButton && installButton.props.disabled === false, 'a live channel offers the install button');
installButton.props.onClick();
await new Promise((resolve) => setTimeout(resolve, 0));
settingsCursor = 0;
cardNodes = elements(settingsClient.MemoryPluginCard({ t: (key) => key, manager: failingManager }));
const errorNode = cardNodes.find((node) => node.props?.['data-cabinet-plugin-state'] === 'error');
assert.ok(errorNode, 'a failed install is visible');
assert.ok(String(errorNode.children.flat().join('')).includes('boom: registry unreachable'), 'the raw error text is echoed verbatim');

settingsState.length = 0; settingsCursor = 0;
const updateInstalled = { name: '@rsrsai/dsh', version: '0.1.13', enabled: true };
cardNodes = elements(settingsClient.MemoryPluginCard({ t: (key) => key, manager: failingManager, initialInstalled: updateInstalled }));
const updateClick = cardNodes.find((node) => node.props?.['data-cabinet-plugin-action'] === 'update');
assert.ok(updateClick, 'the installed state wires the update action');
assert.ok(updateClick && updateClick.props.disabled === false, 'a live channel enables the update action');
updateClick.props.onClick();
await new Promise((resolve) => setTimeout(resolve, 0));
settingsCursor = 0;
cardNodes = elements(settingsClient.MemoryPluginCard({ t: (key) => key, manager: failingManager, initialInstalled: updateInstalled }));
const updateError = cardNodes.find((node) => node.props?.['data-cabinet-plugin-state'] === 'error');
assert.ok(updateError && String(updateError.children.flat().join('')).includes('boom: registry unreachable'), 'the update button reuses the install chain and echoes its failure verbatim');

// PR#22 coderabbit Major follow-up: no hardcoded machine path — the card reads
// its optional local-source override from localStorage (cabinet.memoryPluginSpec),
// tries it before the registry default, falls back once, and notes the specs.
pluginSpecStore.clear();
settingsState.length = 0; settingsCursor = 0;
let specCard = elements(settingsClient.MemoryPluginCard({ t: (key) => key, manager: failingManager }));
const specInput = specCard.find((node) => node.props?.['data-cabinet-plugin-spec-input']);
assert.ok(specInput, 'the card renders the optional local-source input');
assert.equal(specInput.props.value, '', 'the input starts empty with no stored override');
specInput.props.onChange({ target: { value: '/tmp/local-source' } });
assert.equal(pluginSpecStore.get('cabinet.memoryPluginSpec'), '/tmp/local-source', 'typing saves the override to localStorage');
settingsState.length = 0; settingsCursor = 0;
specCard = elements(settingsClient.MemoryPluginCard({ t: (key) => key, manager: failingManager }));
assert.equal(specCard.find((node) => node.props?.['data-cabinet-plugin-spec-input']).props.value, '/tmp/local-source', 'a stored override is shown on the card');
const specClear = specCard.find((node) => node.props?.['data-cabinet-plugin-spec-clear']);
assert.ok(specClear && specClear.props.disabled === false, 'the clear button is offered once a value is stored');
specClear.props.onClick();
assert.equal(pluginSpecStore.has('cabinet.memoryPluginSpec'), false, 'clearing removes the key instead of persisting an empty string');

// Spec selection: no override goes straight to the registry default; a stored
// override is tried first and the registry default is the single fallback.
const specCalls = [];
const specRefusingManager = {
  inspect: async (spec) => { specCalls.push(spec); return { ok: false, error: { message: 'refused: ' + spec } }; },
  installBundle: async (spec) => { specCalls.push(spec); return { ok: false, error: { message: 'unreachable' } }; },
  listBundles: async () => ({ ok: true, value: [] }),
};
settingsState.length = 0; settingsCursor = 0;
specCard = elements(settingsClient.MemoryPluginCard({ t: (key) => key, manager: specRefusingManager }));
specCard.find((node) => node.props?.['data-cabinet-plugin-action'] === 'install').props.onClick();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.deepEqual(specCalls.slice(), ['@rsrsai/dsh@0.1.13'], 'without an override the run chain goes straight to the registry default');
settingsCursor = 0;
specCard = elements(settingsClient.MemoryPluginCard({ t: (key) => key, manager: specRefusingManager }));
const defaultError = specCard.find((node) => node.props?.['data-cabinet-plugin-state'] === 'error');
const defaultErrorText = String(defaultError.children.flat().join(''));
assert.ok(defaultErrorText.includes('refused: @rsrsai/dsh@0.1.13'), 'the single-spec failure is echoed verbatim');
assert.ok(defaultErrorText.includes('[spec: @rsrsai/dsh@0.1.13]'), 'the failure notes the spec it tried');

pluginSpecStore.set('cabinet.memoryPluginSpec', '/tmp/local-source');
specCalls.length = 0;
settingsState.length = 0; settingsCursor = 0;
specCard = elements(settingsClient.MemoryPluginCard({ t: (key) => key, manager: specRefusingManager }));
specCard.find((node) => node.props?.['data-cabinet-plugin-action'] === 'install').props.onClick();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.deepEqual(specCalls.slice(), ['/tmp/local-source', '@rsrsai/dsh@0.1.13'], 'a failing override falls back to the registry default exactly once, in order');
settingsCursor = 0;
specCard = elements(settingsClient.MemoryPluginCard({ t: (key) => key, manager: specRefusingManager }));
const fallbackError = specCard.find((node) => node.props?.['data-cabinet-plugin-state'] === 'error');
const fallbackErrorText = String(fallbackError.children.flat().join(''));
assert.ok(fallbackErrorText.includes('refused: /tmp/local-source'), 'the override error is echoed verbatim');
assert.ok(fallbackErrorText.includes('/tmp/local-source') && fallbackErrorText.includes('@rsrsai/dsh@0.1.13'), 'both tried specs are noted when both attempts fail');

// A successful override must not trigger the fallback at all.
pluginSpecStore.set('cabinet.memoryPluginSpec', '/tmp/ok-source');
const okSpecCalls = [];
let localInstalled = false;
const okSpecManager = {
  inspect: async (spec) => { okSpecCalls.push(spec); return { ok: true, value: { status: 'accepted', name: '@rsrsai/dsh', bundle: true } }; },
  installBundle: async (spec) => { localInstalled = true; okSpecCalls.push(spec); return { ok: true, value: { application: 'applied', bundle: '@rsrsai/dsh', version: '0.1.13' } }; },
  setBundleEnabled: async () => ({ ok: true, value: { application: 'applied' } }),
  listBundles: async () => ({ ok: true, value: localInstalled ? [{ name: '@rsrsai/dsh', installed: true, version: '0.1.13', enabled: true }] : [] }),
};
settingsState.length = 0; settingsCursor = 0;
specCard = elements(settingsClient.MemoryPluginCard({ t: (key) => key, manager: okSpecManager }));
specCard.find((node) => node.props?.['data-cabinet-plugin-action'] === 'install').props.onClick();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(okSpecCalls.length, 2, 'inspect and actual install both run');
assert.ok(localInstalled, 'installation changes inventory');
assert.ok(okSpecCalls.length > 0 && okSpecCalls.every((spec) => spec === '/tmp/ok-source'), 'a successful override never touches the registry fallback');

// A displayed override remains authoritative even when storage rejects writes.
for (const scenario of ['storage', 'installed', 'enable-failed']) {
  pluginSpecStore.clear(); settingsState.length = 0; settingsCursor = 0;
  let added = false; const calls = [];
  const manager = {
    listBundles: async () => ({ok:true,value: (added || scenario === 'installed') ? [{name:'@rsrsai/dsh',installed:true,version:'0.1.13',enabled:false}] : []}),
    inspect: async spec => { calls.push(['inspect',spec]); return {ok:true,value:{status:'accepted',name:'@rsrsai/dsh',bundle:true}}; },
    installBundle: async spec => { calls.push(['install',spec]); added=true;return {ok:true,value:{application:'applied',version:'0.1.13'}}; },
    setBundleEnabled: async () => { calls.push(['enable']); return {ok:true,value:{application:'failed',error:{message:'enable refused'}}}; }
  };
  let nodes=elements(settingsClient.MemoryPluginCard({manager,t:k=>k}));
  const write=pluginSpecStorage.setItem; pluginSpecStorage.setItem=()=>{throw Error('storage denied')};
  nodes.find(n=>n.props?.['data-cabinet-plugin-spec-input']).props.onChange({target:{value:'/tmp/session-only'}});
  pluginSpecStorage.setItem=write; settingsCursor=0;
  nodes=elements(settingsClient.MemoryPluginCard({manager,t:k=>k}));
  nodes.find(n=>n.props?.['data-cabinet-plugin-action']).props.onClick();
  await new Promise(r=>setTimeout(r,0));
  if(scenario==='installed') assert.deepEqual(calls,[], 'local update refuses before any inspection/mutation');
  else assert.deepEqual(calls,[['inspect','/tmp/session-only'],['install','/tmp/session-only'],['enable']], 'current input survives failed persistence; enable failure never retries');
}

// Pending or rejected inspection promises must never start a fallback mutation.
for (const outcome of ['late-accepted', 'late-refused', 'rejected']) {
  pluginSpecStore.set('cabinet.memoryPluginSpec', '/tmp/pending-source');
  settingsState.length=0;settingsCursor=0;
  const calls=[];let resolveInspection;
  const manager={
    listBundles:async()=>({ok:true,value:[]}),
    inspect:spec=>{calls.push(['inspect',spec]);return outcome==='rejected'?Promise.reject(Error('transport failed')):new Promise(resolve=>{resolveInspection=resolve});},
    installBundle:async()=>{calls.push(['install']);throw Error('must not install');},
    setBundleEnabled:async()=>{calls.push(['enable']);throw Error('must not enable');}
  };
  let nodes=elements(settingsClient.MemoryPluginCard({manager,t:k=>k}));
  nodes.find(n=>n.props?.['data-cabinet-plugin-action']).props.onClick();
  await new Promise(r=>setTimeout(r,50));
  assert.deepEqual(calls,[['inspect','/tmp/pending-source']],outcome+' causes no registry fallback');
  settingsCursor=0;nodes=elements(settingsClient.MemoryPluginCard({manager,t:k=>k}));
  assert.ok(nodes.some(n=>n.props?.['data-cabinet-plugin-state']==='error'), 'failure is visible');
  resolveInspection?.({ok:true,value:{status:outcome==='late-accepted'?'accepted':'refused',name:'@rsrsai/dsh',bundle:true}});
  await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(calls,[['inspect','/tmp/pending-source']], 'late response cannot resume installation');
}
console.log('PASS: inspection timeout, late acceptance/refusal and transport rejection cause no fallback mutation');

// Fallback remains visible after success or failure; installed source is host evidence.
for(const succeeds of [true,false]) {
  pluginSpecStore.set('cabinet.memoryPluginSpec','/tmp/custom-local');
  settingsState.length=0;settingsCursor=0;let installed=false;const calls=[];
  const manager={
    listBundles:async()=>({ok:true,value:installed?[{name:'@rsrsai/dsh',installed:true,enabled:true,version:'0.1.13',source:'@rsrsai/dsh@0.1.13'}]:[]}),
    inspect:async spec=>{calls.push(spec);return {ok:true,value:spec.startsWith('/tmp')?{status:'refused',reason:'missing local'}:{status:'accepted',name:'@rsrsai/dsh',bundle:true}}},
    installBundle:async()=>{installed=succeeds;return {ok:true,value:succeeds?{application:'applied',version:'0.1.13'}:{application:'failed',error:{message:'registry failed'}}}},
    setBundleEnabled:async()=>({ok:true,value:{application:'applied'}})
  };
  let nodes=elements(settingsClient.MemoryPluginCard({manager,t:k=>settingsClient.en[k]||k}));
  nodes.find(n=>n.props?.['data-cabinet-plugin-action']).props.onClick();await new Promise(r=>setTimeout(r,0));
  settingsCursor=0;nodes=elements(settingsClient.MemoryPluginCard({manager,t:k=>settingsClient.en[k]||k}));
  const notice=nodes.find(n=>n.props?.['data-cabinet-plugin-fallback']);
  assert.ok(String(notice.children.flat()).includes('/tmp/custom-local → @rsrsai/dsh@0.1.13'),'actual source switch remains visible');
  if(succeeds)assert.ok(String(nodes.find(n=>n.props?.['data-cabinet-plugin-source']).children.flat()).includes('@rsrsai/dsh@0.1.13'),'success shows host inventory source');
  else assert.ok(nodes.some(n=>n.props?.['data-cabinet-plugin-state']==='error'),'failure remains an error, not success');
  assert.deepEqual(calls,['/tmp/custom-local','@rsrsai/dsh@0.1.13']);
  settingsCursor=0;const other=elements(settingsClient.MemoryPluginCard({manager:{listBundles:async()=>{throw Error('new connection failed')}},t:k=>k}));
  assert.equal(other.some(n=>n.props?.['data-cabinet-plugin-fallback']),false,'existing fallback notice cannot cross connection');
  assert.equal(other.some(n=>n.props?.['data-cabinet-plugin-source']),false,'existing source cannot cross connection');
}

pluginSpecStore.delete('cabinet.memoryPluginSpec');

// Both dictionaries carry the same settings.* keys (nothing may exist in one
// language only) and every tab id is translatable.
const zhSettingsKeys = Object.keys(client.zh).filter((key) => key.startsWith('settings.'));
const enSettingsKeys = Object.keys(client.en).filter((key) => key.startsWith('settings.'));
assert.ok(zhSettingsKeys.length >= 17, 'settings copy exists in zh, got ' + zhSettingsKeys.length);


assert.deepEqual(zhSettingsKeys.slice().sort(), enSettingsKeys.slice().sort(), 'zh and en settings keys must match exactly');
for (const id of ['members', 'avatars', 'models', 'prompts', 'plugin']) {
  assert.ok(zhSettingsKeys.includes('settings.tab.' + id), 'tab label present in zh: ' + id);
}
for (const key of ['settings.plugin.install', 'settings.plugin.installing', 'settings.plugin.installed', 'settings.plugin.update', 'settings.plugin.versionFallback', 'settings.plugin.restartRequired', 'settings.plugin.unavailable']) {
  assert.ok(zhSettingsKeys.includes(key), 'plugin card copy present: ' + key);
}
for (const n of [1, 2, 3, 4, 5]) {
  const key = 'settings.plugin.hint' + n;
  assert.ok(zhSettingsKeys.includes(key), 'highlight line copy present: ' + key);
  assert.ok(enSettingsKeys.includes(key), 'highlight line copy present in en: ' + key);
}
for (const key of ['settings.plugin.specLabel', 'settings.plugin.specPlaceholder', 'settings.plugin.specClear']) {
  assert.ok(zhSettingsKeys.includes(key), 'local-source copy present: ' + key);
  assert.ok(enSettingsKeys.includes(key), 'local-source copy present in en: ' + key);
}
console.log('PASS: five settings tabs switch by section; the plugin card keeps specs off its face, renders highlight lines and the local-source override box, offers update with a visible version, falls back from a failing override to the registry default, and echoes failures verbatim with the tried specs; bilingual settings keys match');

// Installation state machine uses the real remote Result envelope.
for (const scenario of ['success','install-failed','enable-failed','missing-wait','timeout','restart','update','missing-enable','wait-null','wait-failed']) {
  settingsState.length=0;settingsCursor=0;
  let installs=0,enabled=false,installed=scenario==='update', version=scenario==='update'?'0.1.12':'0.1.13';
  const ok=value=>({ok:true,value});
  const manager={
    listBundles:async()=>ok(installed?[{name:'@rsrsai/dsh',installed:true,version,enabled}]:[]),
    inspect:async(spec)=>{assert.equal(spec,'@rsrsai/dsh@0.1.13');return ok({status:'accepted',name:'@rsrsai/dsh',bundle:true});},
    installBundle:async(spec)=>{installs++;assert.equal(spec,'@rsrsai/dsh@0.1.13');
      if(scenario==='timeout')return new Promise(()=>{});
      if(['missing-wait','wait-null','wait-failed'].includes(scenario))return {ok:false,error:{message:'lost reply'}};
      if(scenario==='install-failed')return ok({application:'failed',error:{message:'install failed'}});
      installed=true;return ok({application:'applied',version:'0.1.13'});
    },
    updateBundle:async(name,target)=>{assert.equal(name,'@rsrsai/dsh');assert.equal(target,'0.1.13');version=target;return ok({result:{application:'restart-required',version:target}});},
    setBundleEnabled:async()=>{if(scenario==='enable-failed')return {ok:false,error:{message:'enable failed'}};enabled=true;return ok({application:scenario==='restart'?'restart-required':'applied'});}
  };
  if(scenario==='missing-enable')delete manager.setBundleEnabled;
  if(scenario==='wait-null')manager.waitForInstall=async()=>ok(null);
  if(scenario==='wait-failed')manager.waitForInstall=async()=>ok({application:'failed'});
  const render=()=>{settingsCursor=0;return elements(settingsClient.MemoryPluginCard({manager,t:key=>key}));};
  const initial=render();initial.find(n=>n.props?.['data-cabinet-plugin-action']==='install').props.onClick();
  await new Promise(r=>setTimeout(r,45));
  const result=render();const error=result.find(n=>n.props?.['data-cabinet-plugin-state']==='error');
  assert.equal(!!error,!['success','restart','update'].includes(scenario),scenario);
  assert.equal(enabled,['success','restart','update'].includes(scenario),scenario);
  assert.equal(!!result.find(n=>n.props?.['data-cabinet-plugin-state']==='restart'),['restart','update'].includes(scenario));
  if(['timeout','missing-wait'].includes(scenario)) {result.find(n=>n.props?.['data-cabinet-plugin-action']==='install').props.onClick();await new Promise(r=>setTimeout(r,0));assert.equal(installs,1,'unknown operation cannot be duplicated');}
}
console.log('PASS: install/enable success, failure, missing wait, deadline, unknown-result duplicate guard and restart state (mock remote)');
// Lifecycle double executes effects and preserves refs; unlike the tab-only
// renderer above, this detects broken first inventory reads. Browser evidence
// remains separate and uses real React.
function memoryCardHarness() {
  let hooks=[],cursor=0,effects=[],api,tree;
  const react={...React,
    useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]={value:typeof initial==='function'?initial():initial};return [hooks[i].value,v=>{hooks[i].value=typeof v==='function'?v(hooks[i].value):v;}];},
    useRef(initial){const i=cursor++;return hooks[i]??(hooks[i]={current:initial});},
    useEffect(fn,deps){const i=cursor++,old=hooks[i];if(!old||deps.some((v,n)=>v!==old.deps[n])){hooks[i]={deps,cleanup:old?.cleanup};effects.push(()=>{hooks[i].cleanup?.();hooks[i].cleanup=fn();});}}
  };
  runInNewContext(source.replace(exportPoint,exportList),{setTimeout,clearTimeout,window:{__ModuleLoader__:{load:({factory})=>{api=factory(()=>react);}}}});
  return {render(manager){cursor=0;effects=[];tree=elements(api.MemoryPluginCard({manager,t:k=>k}));for(const effect of effects)effect();return tree;},unmount(){for(const hook of hooks)hook.cleanup?.();hooks=[];},};
}
const inventory=version=>({ok:true,value:[{name:'@rsrsai/dsh',installed:true,enabled:true,version}]});
const tick=()=>new Promise(r=>setTimeout(r,0));
const versionOf=nodes=>nodes.find(n=>n.props?.['data-cabinet-plugin-version']!==undefined)?.props['data-cabinet-plugin-version'];
{
  const h=memoryCardHarness();const manager={listBundles:async()=>inventory('0.1.13')};
  h.render(manager);await tick();assert.equal(versionOf(h.render(manager)),'0.1.13','first mount reads actual remote inventory');
  h.unmount();h.render(manager);await tick();assert.equal(versionOf(h.render(manager)),'0.1.13','remount reads inventory without initialInstalled');h.unmount();
}
{
  const h=memoryCardHarness();let resolve;
  const old={listBundles:()=>new Promise(r=>resolve=r)},current={listBundles:async()=>inventory('0.1.14')};
  h.render(old);h.render(current);await tick();resolve(inventory('0.1.12'));await tick();assert.equal(versionOf(h.render(current)),'0.1.14','old channel cannot overwrite the new inventory');h.unmount();
}
for(const version of ['0.1.14','0.2.0','1.0.0','','broken','0.1.13-rc.1','9007199254740993.0.0']) {
  const h=memoryCardHarness();let mutations=0;
  const manager={listBundles:async()=>inventory(version),inspect:async()=>{throw Error('must reject before inspect')},installBundle:async()=>{mutations++},updateBundle:async()=>{mutations++},setBundleEnabled:async()=>{mutations++}};
  h.render(manager);await tick();h.render(manager).find(n=>n.props?.['data-cabinet-plugin-action']==='update').props.onClick();await tick();
  assert.equal(mutations,0,version);assert.ok(h.render(manager).some(n=>n.props?.['data-cabinet-plugin-state']==='error'),version);h.unmount();
}
console.log('PASS: effectful inventory first mount/remount/channel replacement and seven conservative non-downgrade cases; hook double, not browser E2E');
// An initial inventory read that finishes after a clicked operation is stale.
{
  const h=memoryCardHarness();let resolve,reads=0;
  const manager={listBundles:async()=>++reads===1?new Promise(r=>resolve=r):inventory('0.1.13'),inspect:async()=>({ok:true,value:{status:'accepted',name:'@rsrsai/dsh',bundle:true}}),installBundle:async()=>{throw Error('already installed')},setBundleEnabled:async()=>({ok:true,value:{application:'applied'}})};
  h.render(manager).find(n=>n.props?.['data-cabinet-plugin-action']==='install').props.onClick();await tick();resolve({ok:true,value:[]});await tick();assert.equal(versionOf(h.render(manager)),'0.1.13','epoch rejects pre-operation inventory response');h.unmount();
}
console.log('PASS: late initial inventory cannot overwrite a completed operation');

{
  const h=memoryCardHarness();
  const a={listBundles:async()=>({ok:true,value:[{name:'@rsrsai/dsh',installed:true,enabled:true,version:'0.1.13',source:'registry-A'}]})};
  const b={listBundles:async()=>{throw Error('unavailable')}};
  const sourceOf=n=>n.find(x=>x.props?.['data-cabinet-plugin-source'])?.children.flat().join('');
  h.render(a);await tick();assert.ok(sourceOf(h.render(a)).includes('registry-A'));
  assert.equal(sourceOf(h.render(b)),undefined,'new connection hides old source immediately');await tick();assert.equal(sourceOf(h.render(b)),undefined,'failed inventory never exposes previous source');
  const c={listBundles:async()=>inventory('0.1.13')};h.render(c);await tick();assert.ok(sourceOf(h.render(c)).includes('settings.plugin.sourceUnknown'),'missing provenance is unknown');
  h.unmount();h.render(a);await tick();assert.ok(sourceOf(h.render(a)).includes('registry-A'),'remount reloads host provenance');h.unmount();
}

// Switching connections during inspection never locks the new connection or mutates the old one.
{
 const h=memoryCardHarness();let finish,mutations=0;
 const a={listBundles:async()=>({ok:true,value:[]}),inspect:()=>new Promise(r=>finish=r),installBundle:async()=>{mutations++;return {ok:true,value:{application:'applied'}}}};
 const b={listBundles:async()=>{throw Error('new inventory failed')},inspect:async()=>{},installBundle:async()=>{}};
 const action=n=>n.find(x=>x.props?.['data-cabinet-plugin-action']);
 h.render(a);await tick();action(h.render(a)).props.onClick();await tick();assert.equal(action(h.render(a)).props.disabled,true);
 assert.equal(action(h.render(b)).props.disabled,false,'new connection is not locked by old work');await tick();
 finish({ok:true,value:{status:'accepted',name:'@rsrsai/dsh',bundle:true}});await tick();
 assert.equal(action(h.render(b)).props.disabled,false,'late completion cannot lock new UI');assert.equal(mutations,0,'late inspection cannot start installation after connection changed');h.unmount();
}

{
 const h=memoryCardHarness();let finish,enabled=0;
 const a={listBundles:async()=>({ok:true,value:[]}),inspect:async()=>({ok:true,value:{status:'accepted',name:'@rsrsai/dsh',bundle:true}}),installBundle:()=>new Promise(r=>finish=r),setBundleEnabled:async()=>{enabled++;return {ok:true,value:{application:'applied'}}}};
 const b={listBundles:async()=>({ok:true,value:[]})};const action=n=>n.find(x=>x.props?.['data-cabinet-plugin-action']);
 h.render(a);await tick();action(h.render(a)).props.onClick();await tick();assert.equal(typeof finish,'function');
 assert.equal(action(h.render(b)).props.disabled,false);await tick();
 finish({ok:true,value:{application:'applied',version:'0.1.13'}});await tick();
 const nodes=h.render(b);assert.equal(action(nodes).props.disabled,false);assert.equal(versionOf(nodes),undefined);assert.equal(enabled,0,'old installation completion must not enable after switching');h.unmount();
}

// Both public projection encodings are accepted; malformed counters remain unknown.
assert.equal(client.usageFor({tokenUsage:{totals:{outputTokens:42}},contextBreakdown:{breakdown:{systemTokens:1,toolsTokens:2,messageTokens:3}}},0).tokens,42);
assert.equal(client.usageFor({tokenUsage:{outputTokens:-1},contextPressure:{contextWindow:Infinity,projectedTokens:-1}},0).tokens,undefined);

// Task rows show the stored description and writeScopes. Missing fields stay absent.
{
  const sheetNode = (tree, field) => elements(tree).find((node) => node.props?.['data-cabinet-task-sheet'] === field);
  const shown = (node) => node.children.flat().filter((child) => typeof child === 'string').join('');
  const longBody = '目标交付验收范围'.repeat(12);
  assert.ok([...longBody].length > 80, 'fixture is longer than the rail clamp');
  const filled = client.TaskLine({
    task: {
      id: 'sheet-1',
      subject: '做面板',
      status: 'pending',
      ownerName: 'works',
      description: '  ' + longBody + '尾',
      writeScopes: ['index.js', '  ', 'client.js', 1],
    },
    t: (key) => client.zh[key] || key,
    taskLabel: (status) => status,
  });
  const descriptionNode = sheetNode(filled, 'description');
  const scopeNode = sheetNode(filled, 'writeScopes');
  assert.equal([...shown(descriptionNode)].length, 81, 'clamped description is 80 code points plus an ellipsis');
  assert.ok(shown(descriptionNode).endsWith('…'));
  assert.ok(!shown(descriptionNode).includes('尾'), 'the clamp drops the tail from the row');
  assert.equal(descriptionNode.props.title, longBody + '尾', 'the title keeps the stored description');
  assert.equal(shown(scopeNode), 'index.js, client.js');
  assert.equal(scopeNode.props.title, 'index.js, client.js');
  const blank = client.TaskLine({
    task: { id: 'blank', subject: '只有标题', status: 'pending', description: '   ', writeScopes: ['  ', 7] },
    t: (key) => client.zh[key] || key,
    taskLabel: (status) => status,
  });
  assert.equal(shown(sheetNode(blank, 'description')), '未记载');
  assert.equal(shown(sheetNode(blank, 'writeScopes')), '未记载');
  assert.equal(sheetNode(blank, 'description').props.title, undefined);
  assert.ok(!shown(sheetNode(blank, 'description')).includes('只有标题'), 'a missing sheet is not filled from the subject');
  const omitted = client.TaskLine({
    task: { id: 'omitted', subject: '缺字段', status: 'in_progress', description: '完成了但没跑', writeScopes: 'index.js' },
    t: (key) => client.zh[key] || key,
    taskLabel: (status) => status,
  });
  assert.equal(shown(sheetNode(omitted, 'description')), '完成了但没跑');
  assert.equal(shown(sheetNode(omitted, 'writeScopes')), '未记载', 'a non-array writeScopes value is absent, not split');
  const rendered = elements(omitted).flatMap((node) => node.children.flat()).filter((child) => typeof child === 'string').join('');
  assert.ok(!rendered.includes('未验证'), 'wording in the description does not add an unverified label');
  const panel = JSON.stringify(render({
    members: [{ id: 'm-works', name: 'works', role: 'mate', phase: 'active' }],
    tasks: [{ id: 'panel-1', subject: '面板任务', status: 'pending', ownerName: 'works', description: '目标：改右栏', writeScopes: ['client.js'] }],
  }, client.zh));
  assert.ok(panel.includes('目标：改右栏'));
  assert.ok(panel.includes('client.js'));
  const english = client.TaskLine({
    task: { id: 'en-1', subject: 'sheet', status: 'pending' },
    t: (key) => client.en[key] || key,
    taskLabel: (status) => status,
  });
  assert.equal(shown(sheetNode(english, 'description')), 'not recorded');
  assert.equal(shown(sheetNode(english, 'writeScopes')), 'not recorded');
}

// The dispatch button is gone, so an injected workspace channel must not resurrect
// any member-list anchor either: opening a member goes through the cards only.
const openedAfterRemoval = [];
client.apply({
  locale: { register: () => {}, bind: () => (key) => key },
  effect: (fn) => { try { return fn(); } catch (error) { return undefined; } },
  inject: (names, callback) => {
    if (Array.isArray(names) && names.includes('uiWorkspace')) {
      callback({ uiWorkspace: { openSession: (target) => { openedAfterRemoval.push(target); } }, effect: (fn) => { try { return fn(); } catch (error) { return undefined; } } });
    }
  },
});
const rosterWithChannel = elements(rosterPanel());
assert.ok(!rosterWithChannel.some((node) => node.props?.['data-cabinet-bot-dispatch'] !== undefined), 'a workspace channel does not bring the dispatch button back');
assert.ok(!rosterWithChannel.some((node) => node.props?.['data-cabinet-bot-section'] === '1'), 'a workspace channel does not bring the section back');
assert.deepEqual(openedAfterRemoval, [], 'rendering alone opens nothing');
// One reverse assertion guards against resurrecting the deleted live API.
assert.equal(client.liveViewOf, undefined, 'liveViewOf is gone from the client exports');
console.log('PASS 内阁 Bot section removal: no section box, office rows, 现役/未上朝 state, 派活 button, 联想 cell or live block renders, with or without a workspace opener; the roster section, member cards and the 通政使 office model (label/avatar/display name/duty prompt) stay');


// --- 群聊 tab: merged member messages, official retain contract ---------------
// The read channel is `sessions.retain(<SessionId string>, {source:'cabinetGroupChat'})`
// (contract/sessions.d.ts:52; the manager resolves target.childSessionId,
// manager.js:63-66). A `{sessionId}` wrapper would retain `undefined`, so the
// suite asserts the first argument is a plain string — the contract guard.
{
  const makeWindow = (entries, revision) => ({ entries, hasMore: false, revision: revision ?? 1, change: { kind: 'replace', entries } });
  // Fold probe: the pure reducer, called exactly like the hook calls it.
  const foldOf = (id) => client.groupChatFold(sources[id].getSnapshot().entries);
  const durable = (type, seq, time, data) => ({ type: 'event', event: { type, seq, time, data } });
  const transient = (seq, time, data) => ({ type: 'transient', event: { type: 'assistant/live-chunk', seq, time, data } });
  const groupTeam = { members: [
    { id: 'lead-session', name: 'lead', role: 'lead', phase: 'active' },
    { id: 'm-works', name: 'works', role: 'mate', phase: 'active' },
  ], tasks: [] };
  const groupMembers = groupTeam.members;
  const makeSource = (entries) => {
    const listeners = new Set();
    // Every push publishes a new revision, exactly like MutableSessionEventSource
    // (events.js publish(): snapshot.revision + 1). The group-chat fold cache
    // keys on this number, so a frozen revision would hide new messages.
    let revision = 1;
    let window = makeWindow(entries, revision);
    return {
      getSnapshot: () => window,
      subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
      push: (entries2) => { revision += 1; window = makeWindow(entries2, revision); for (const listener of Array.from(listeners)) listener(); },
    };
  };
  const leadEntries = [
    durable('tool/call', 1, 1000, { callId: 'c-lead', name: 'bash', arguments: '{"cmd":"ls"}' }),
    durable('user/message', 2, 2000, { role: 'user', content: [{ type: 'text', text: '请调研' }] }),
    durable('assistant/message', 3, 3000, { message: { role: 'assistant', content: [{ type: 'text', text: '调研结论A' }] } }),
  ];
  const worksEntries = [
    durable('user/message', 1, 2500, { role: 'user', content: [{ type: 'text', text: '请实现' }] }),
    durable('tool/call', 2, 2600, { callId: 'c-works', name: 'read', arguments: '{"path":"client.js"}' }),
    transient(2.5, 2900, { attemptId: 'att-1', turn: 1, step: 1, chunk: { type: 'text-delta', text: '实现中' } }),
    transient(2.6, 2950, { attemptId: 'att-1', turn: 1, step: 1, chunk: { type: 'text-delta', text: '…' } }),
    durable('tool/result', 3, 2970, { message: { role: 'tool', toolCallId: 'c-works', content: [{ type: 'text', text: 'file contents' }] } }),
    // Official settlements match the live suffix by turn/step, without attemptId.
    durable('assistant/message', 4, 4000, { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '实现完成B' }] } }),
  ];
  const sources = { 'lead-session': makeSource(leadEntries), 'm-works': makeSource(worksEntries) };
  const releases = [];
  // The composer's only public send channel is the retained reference's own
  // SessionFace.prompt(content, mode) (contract/session.d.ts ISession.prompt).
  const promptCalls = [];
  // uiWorkspace.openSession targets recorded by the injected stub (drill-down).
  const openedTargets = [];
  const makeReference = (id) => {
    const ref = {
      sessionId: id,
      releaseCount: 0,
      // The contract: `binding` is a getter that throws after release
      // (service.js:94-115) and `release()` is once-only (service.js:126-134).
      get binding() {
        if (ref.releaseCount > 0) throw new Error('Session reference "' + id + '" is released');
        return {
          sessionId: id,
          eventSource: { getSnapshot: () => sources[id].getSnapshot(), subscribe: () => () => {} },
          session: {
            prompt: (content, mode) => { promptCalls.push({ id, content, mode }); return Promise.resolve({ ok: true, value: { accepted: true } }); },
          },
        };
      },
      ready: new Promise((resolve) => { pendingReady.set(id, resolve); }),
      // The real controller tears the reference down eagerly inside release()
      // (service.js:126-134); a second release is a no-op, never a throw.
      release() { if (ref.releaseCount > 0) return; ref.releaseCount += 1; releases.push(id); },
    };
    return ref;
  };
  const retainCalls = [];
  const pendingReady = new Map();
  const groupService = {
    refreshProjections: async () => {}, // the panel's own channel guard (client.js:5433)
    retain: (target, options) => {
      retainCalls.push({ target, options });
      if (target === 'm-bad') throw new Error('retain refused');
      return makeReference(target);
    },
  };
  client.apply({
    locale: { register: () => {}, bind: () => (key) => key },
    effect: (fn) => { try { return fn(); } catch (error) { return undefined; } },
    inject: (names, callback) => {
      if (Array.isArray(names) && names.includes('sessions')) callback({ sessions: groupService, effect: (fn) => { try { return fn(); } catch (error) { return undefined; } } });
    },
  });
  assert.equal(typeof groupService.retain, 'function', 'the group service is injected');
  const rawApply = client.apply;
  client.apply = (ctx) => rawApply({ ...ctx, inject: (names, callback) => {
    if (Array.isArray(names) && names.includes('sessions')) callback({ sessions: groupService, effect: (fn) => { try { return fn(); } catch (error) { return undefined; } } });
    if (Array.isArray(names) && names.includes('uiWorkspace')) callback({ uiWorkspace: { openSession: (target) => { openedTargets.push(target); } }, effect: (fn) => { try { return fn(); } catch (error) { return undefined; } } });
    if (Array.isArray(names) && names.includes('configForms')) { /* no settings mirror needed here */ }
  } });
  // Same effect/dep machinery as factsRunEffects above (hook slots are keyed by
  // render order, so a fresh slot array starts each group-chat render clean).
  const groupSlots = [];
  const groupDepSlots = [];
  const runGroupEffects = () => {
    const queued = recordedEffects.splice(0, recordedEffects.length);
    // The runner is one render's commit: an effect whose deps changed runs its
    // PREVIOUS cleanup first (exactly like React), then the new body. Cleanups
    // from effects whose deps did not change are not collected here — they stay
    // attached to their slots and run when those effects change or unmount.
    // A commit that registers a different number of hooks (the 群聊 pane mounts
    // its own state) shifts every later slot index, so the "already ran its
    // previous cleanup" bookkeeping below cannot be trusted for this pass.
    const layoutChanged = queued.length !== groupDepSlots.length;
    const changedIndexes = new Set();
    let index = 0;
    for (const entry of queued) {
      const previous = groupDepSlots[index];
      if (previous !== undefined && sameDeps(previous.deps, entry.deps)) {
        index += 1;
        continue;
      }
      changedIndexes.add(index);
      if (previous !== undefined && typeof previous.cleanup === 'function') previous.cleanup();
      const cleanup = entry.fn();
      groupDepSlots[index] = { deps: entry.deps, cleanup };
      index += 1;
    }
    groupDepSlots.length = index;
    let ran = false;
    return () => {
      if (ran) return;
      ran = true;
      // Effects whose deps changed already ran their previous cleanup above
      // (React runs the OLD cleanup before the NEW body); running those slots
      // again would double-release.
      const changed = layoutChanged ? new Set() : new Set(changedIndexes);
      for (let i = 0; i < groupDepSlots.length; i++) {
        const slot = groupDepSlots[i];
        if (slot && typeof slot.cleanup === 'function' && !changed.has(i)) slot.cleanup();
      }
      groupDepSlots.length = 0;
    };
  };
  // The panel tab is simulated the way a click drives it: a fresh render with
  // the new active state (a re-render alone cannot move useState).
  let groupTab = 'roster';
  const groupPanel = (overrides) => {
    const raw = client.CabinetPanel({

    sessionId: 'lead-session',
    useSession: (select) => select({}),
    useSessions: (select) => select({ projectionsBySession: { 'lead-session': { values: { agentTeam: (overrides && overrides.team) || groupTeam } } } }),
    useSessionStatus: (select) => select(new Map()),
    t: (key) => ((overrides && overrides.dictionary) || client.zh)[key] || key,
      activeTab: overrides && typeof overrides.activeTab === 'string' ? overrides.activeTab : groupTab,
    });
    const tree = elements(raw);
    return tree;
  };
  // The effect runner compares dep slots like React does: a tab switch changes
  // one effect's deps (so that effect re-runs) while the rest keep theirs, and
  // the previous cleanup runs first. A full slot reset would simulate an
  // unmount/remount instead, which is what `stop()` is for.
  let groupRenderCalls = 0;
  const groupRender = (overrides) => {
    groupRenderCalls += 1;
    // No slot truncation: `groupSlots` is this tab's commit slot array, so a
    // later render must find the refs the previous commit wrote (a real panel
    // keeps its refs across renders; truncating here would hand every render a
    // fresh stateRef and repaint every row from an empty map).
    persistentRefs = { cursor: 0, slots: groupSlots };
    resetHookCursor();
    const tree = elements(groupPanel(overrides));
    const stop = runGroupEffects();
    return { tree, stop };
  };
  // Host elements carry nested children; the group-chat node lives at any depth.
  const findNodes = (nodes, match) => {
    const seen = new Set();
    const walk = (list) => list.flatMap((node) => {
      if (!node || typeof node !== 'object' || seen.has(node)) return [];
      seen.add(node);
      const kids = Array.isArray(node.children) ? node.children : [];
      const flat = kids.flat(Infinity).filter((child) => child && typeof child === 'object' && typeof child.type !== 'undefined');
      const self = match(node) ? [node] : [];
      return [...self, ...walk(flat)];
    });
    return walk(nodes);
  };
  // A markdown body nests text inside block elements, so collect strings at
  // any depth (plain-text rows still yield the same concatenation as before).
  const deepText = (node) => {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(deepText).join('');
    if (!node || typeof node !== 'object') return '';
    // elements() leaves function children unexpanded in the original node, so
    // resolve the (hook-free) markdown renderer here as well.
    if (typeof node.type === 'function') {
      const props = { ...node.props };
      if (node.children.length) props.children = node.children.flat();
      return deepText(node.type(props));
    }
    const kids = Array.isArray(node.children) ? node.children : [];
    return kids.map(deepText).join('');
  };
  const textsOf = (nodes) => {
    const all = findNodes(nodes, (node) => node.props?.['data-cabinet-groupchat-text'] !== undefined)
      .map((node) => deepText(node));
    // This harness renders the panel more than once into a single tree, so the
    // same row object set can appear several times. Deduplicate while keeping
    // first-seen order: the assertion is about which messages appear and in
    // what order, not about how many times the fixture re-rendered them.
    return all.filter((text, index) => all.indexOf(text) === index);
  };
  const rowsOf = (tree) => findNodes(tree, (node) => typeof node.props?.['data-cabinet-groupchat-row'] === 'string');
  // The group-chat pane as a standalone render (default tab = 群聊) — for the
  // empty state, which needs a view with no member messages at all.
  const groupChatViewOf = (team, dictionary) => {
    recordedEffects.length = 0;
    persistentRefs = { cursor: 0, slots: groupSlots };
    groupSlots.length = 0;
    resetHookCursor();
    const raw = client.CabinetPanel({
      sessionId: 'lead-session',
      useSession: (select) => select({}),
      useSessions: (select) => select({ projectionsBySession: { 'lead-session': { values: { agentTeam: team } } } }),
      useSessionStatus: (select) => select(new Map()),
      t: (key) => (dictionary || client.zh)[key] || key,
      activeTab: 'groupchat',
    });
    const tree = elements(raw);
    const stop = runGroupEffects();
    return { tree, stop };
  };

  // 1) Right pane: roster only. 群聊 now lives in the 左侧「内阁」整页
  //    (`activeTab: 'groupchat'`), so the two surfaces no longer show the same
  //    conversation; the roster keeps the five-tab settings section intact.
  const first = groupRender();
  const tabNodes = findNodes(first.tree, (node) => node.props?.['data-cabinet-panel-tab'] !== undefined);
  assert.deepEqual(tabNodes.map((node) => node.props['data-cabinet-panel-tab']), ['roster'], 'the right pane keeps the roster tab only');
  assert.ok(!tabNodes.some((node) => node.props['data-cabinet-panel-tab'] === 'groupchat'), 'the right pane exposes no 群聊 tab');
  assert.equal(tabNodes[0].props['data-cabinet-panel-active'], '1', 'the roster view stays the default');
  assert.equal(findNodes(first.tree, (node) => node.props?.['data-cabinet-groupchat'] !== undefined).length, 0, 'the right pane no longer hosts the group chat');
  assert.equal(findNodes(first.tree, (node) => node.props?.['data-cabinet-groupchat-input'] !== undefined).length, 0, 'the right pane carries no composer');
  assert.equal(findNodes(first.tree, (node) => node.props?.['data-cabinet-groupchat-row'] !== undefined).length, 0, 'the right pane renders no chat rows');
  assert.ok(findNodes(first.tree, (node) => node.props?.['data-cabinet-node'] !== undefined).length > 0, 'the roster tree still renders on the default tab');
  assert.deepEqual(Array.from(client.SETTINGS_TABS), ['members', 'avatars', 'models', 'prompts', 'plugin'], 'the five settings tabs are untouched');
  first.stop();
  assert.equal(retainCalls.length, 0, 'the roster view retains nothing');

  // 2) The 群聊 body is the one the 左侧「内阁」整页 mounts (CabinetPage passes
  //    `activeTab: 'groupchat'` + `hideTabs`). Retain's first argument is a plain
  //    SessionId string (never a wrapper object) and the source label is ours.
  groupTab = 'groupchat';
  const active = groupRender();
  assert.ok(retainCalls.length >= 2, 'both members are retained while the tab is active, got ' + JSON.stringify(retainCalls.map((call) => call.target)) + ' releases=' + JSON.stringify(releases));
  for (const call of retainCalls) {
    assert.equal(typeof call.target, 'string', 'retain first argument must be a SessionId string, got ' + JSON.stringify(call.target));
    assert.equal(call.options.source, 'cabinetGroupChat', 'the reference source identifies this feature');
  }
  // `ready` settles like the real reference: only now does the first fold land
  // inside the effect (the window is read on commit, exactly like the browser).
  for (const resolve of pendingReady.values()) resolve({});
  pendingReady.clear();
  const settled = groupRender();
  // The merge assertion must see the FOLD, not the first paint: render again
  // after `ready` settled (the browser reads the window on commit).
  const merged = groupRender();
  const mergedProbe = findNodes(merged.tree, (n) => n.props?.['data-cabinet-groupchat'] !== undefined).length;
  // The fold has landed for every member; a fresh render is what the browser
  // does on the next commit and reuses the very same groupSlots refs.
  assert.deepEqual(textsOf(merged.tree), ['请调研', '请实现', '调研结论A', '实现完成B'], 'messages merge across members in time order (lead 2000 < works 2500 < lead 3000 < works 4000)');
  const mergedRows = rowsOf(merged.tree);
  // The avatar element stays unexpanded in this host tree (no function
  // components are invoked inside rows), so assert on the props the row feeds
  // it: the raw office key plus the chat-sized portrait. The user's own line is
  // the newest addition and carries no portrait, so the portrait assertion
  // targets the first officer row (assistant) instead of row 0.
  const firstOfficerRow = mergedRows.find((node) => node.props['data-cabinet-groupchat-row'] === 'assistant');
  assert.ok(firstOfficerRow, 'the merged view carries an officer row');
  assert.ok(findNodes([firstOfficerRow], (node) => node.props?.size === 28 && node.props?.name === 'lead').length > 0, 'the first officer row carries the officer portrait');
  // A/B/C 回归：三个不同成员各一条消息，行上解析出的中文昵称与头像必须各不相同，
  // 且都不是 lead；用户自己的行不显示名字节点。
  const trioNames = ['hanlin-bianxiu', 'gongbu-shangshu-2', 'dalisi-qing'];
  const trioRows = trioNames.map((name, index) => {
    const row = elements(client.GroupChatRow({
      row: { kind: 'assistant', text: name + ' 汇报', time: 1000 + index, seq: index + 1, tools: [] },
      member: { id: 'm-' + index, name, phase: 'active' },
      t: (key) => client.zh[key] || key,
    }));
    const nameNode = findNodes(row, (node) => node.props?.key === 'name')[0];
    // Avatar 是函数组件，elements() 已展开成 img：直接按 src 比对；
    // 同时记录 bureauOf 解析出的头像键（头像就是按它取的）。
    const avatarNode = findNodes(row, (node) => node.type === 'img')[0];
    const avatarName = client.bureauOf(name).key;
    return { name, nickname: nameNode ? deepText(nameNode) : null, fullTitle: nameNode ? nameNode.props.title : null, avatarName, avatarSrc: avatarNode ? avatarNode.props.src : client.avatarFor(name) };
  });
  const nicknames = trioRows.map((row) => row.nickname);
  assert.equal(new Set(nicknames).size, 3, 'each officer row shows a distinct Chinese nickname, got ' + JSON.stringify(nicknames));
  assert.ok(nicknames.every((value) => typeof value === 'string' && value !== '' && value !== client.chatBubbleName('lead')), 'no officer row falls back to the Lead nickname, got ' + JSON.stringify(nicknames));
  assert.equal(JSON.stringify(nicknames), JSON.stringify(['翰林院编修', '工部尚书（2）', '大理寺卿']), 'the nicknames are the Chinese office labels, got ' + JSON.stringify(nicknames));
  assert.equal(new Set(trioRows.map((row) => row.avatarName)).size, 3, 'each row keys its avatar to its own member, got ' + JSON.stringify(trioRows.map((row) => row.avatarName)));
  assert.equal(new Set(trioRows.map((row) => row.avatarSrc)).size, 3, 'the three officers resolve to three different portraits');
  assert.ok(trioRows.every((row) => typeof row.fullTitle === 'string' && row.fullTitle.includes(' · ')), 'the full identity stays reachable through the name title');
  const userRowForName = elements(client.GroupChatRow({ row: { kind: 'user', text: '我的话', time: 1000, seq: 1, tools: [] }, t: (key) => client.zh[key] || key }));
  assert.equal(findNodes([userRowForName], (node) => node.props?.key === 'name' && deepText(node) !== client.zh['groupchat.you']).length, 0, 'the user line never shows an officer name');
  // B) 同名成员必须可区分：chatBubbleName 是单名计算，不同原始名可能撞名，
  // chatBubbleNames 在同一份成员表内保证唯一（自定义名优先、后缀稳定）。
  assert.equal(client.chatBubbleName('gongbu-shangshu'), '工部尚书', 'the plain slug maps to the office label');
  assert.notEqual(client.chatBubbleName('gongbu-shangshu'), client.chatBubbleName('gongbu-shangshu-2'), 'slug and slug-2 already differ on their own, got ' + client.chatBubbleName('gongbu-shangshu-2'));
  // 真正撞名的情形：slug 与中文名指向同一 office，单名计算给出同一个结果。
  assert.equal(client.chatBubbleName('gongbu-shangshu'), client.chatBubbleName('工部尚书'), 'this pair collides under single-name computation');
  const collideMembers = [{ id: 'a', name: 'gongbu-shangshu' }, { id: 'b', name: '工部尚书' }];
  const collideTable = client.chatBubbleNames(collideMembers);
  const collideNames = [collideTable.get('gongbu-shangshu'), collideTable.get('工部尚书')];
  assert.equal(new Set(collideNames).size, 2, 'two members that would collide still get distinct nicknames, got ' + JSON.stringify(collideNames));
  assert.equal(collideNames[0], '工部尚书', 'the first (sorted) member keeps the plain label, got ' + JSON.stringify(collideNames));
  assert.equal(collideNames[1], '工部尚书2', 'the second colliding member gets a numeric suffix, got ' + JSON.stringify(collideNames));
  // 同一份成员表、不同顺序 → 结果一致（后缀稳定，不会因成员重排闪变）。
  const reordered = client.chatBubbleNames([{ id: 'b', name: '工部尚书' }, { id: 'a', name: 'gongbu-shangshu' }]);
  assert.equal(reordered.get('gongbu-shangshu'), collideTable.get('gongbu-shangshu'), 'the suffix does not depend on member order');
  assert.equal(reordered.get('工部尚书'), collideTable.get('工部尚书'), 'both sides stay stable after reordering');
  // 相似 id 的两个成员也互不相同。
  const similarTable = client.chatBubbleNames([{ id: 'a', name: 'gongbu-shangshu' }, { id: 'b', name: 'gongbu-shangshu-2' }]);
  assert.notEqual(similarTable.get('gongbu-shangshu'), similarTable.get('gongbu-shangshu-2'), 'gongbu-shangshu and gongbu-shangshu-2 render different nicknames, got ' + JSON.stringify([...similarTable]));
  // 自定义名优先于自动后缀。
  client.setMemberConfig({ members: [{ key: 'works', name: '工部尚书·甲' }] });
  const customTable = client.chatBubbleNames([{ id: 'a', name: 'gongbu-shangshu' }, { id: 'b', name: '工部尚书' }]);
  assert.equal(customTable.get('gongbu-shangshu'), '工部尚书·甲', 'a custom name wins over the automatic nickname, got ' + String(customTable.get('gongbu-shangshu')));
  assert.notEqual(customTable.get('gongbu-shangshu'), customTable.get('工部尚书'), 'the other member still gets a distinct nickname');
  client.setMemberConfig({ members: [] });

  // D) 联想模式开关：全局、可见、默认关、切换生效、带 token 用量提示。
  const associationNodes = mountSettings({ t: (key) => client.zh[key] || key })();
  const associationRow = findNodes(associationNodes, (node) => node.props?.['data-cabinet-association-row'] !== undefined)[0];
  assert.ok(associationRow, 'the member settings expose the association-mode row outside the prompts tab');
  const associationSwitch = findNodes(associationNodes, (node) => node.props?.['data-cabinet-association-switch'] !== undefined)[0];
  assert.ok(associationSwitch, 'the association-mode switch renders');
  assert.equal(associationSwitch.props.type, 'checkbox', 'the association mode is a checkbox');
  assert.equal(associationSwitch.props.checked, false, 'association mode defaults to off');
  const associationCopy = findNodes(associationNodes, (node) => node.props?.['data-cabinet-association-row'] !== undefined).map((node) => deepText(node)).join('');
  assert.ok(associationCopy.includes(client.zh['member.association']), 'the row is labelled 联想模式');
  assert.ok(/token/i.test(client.zh['member.association.hint']), 'the hint mentions token usage, got ' + client.zh['member.association.hint']);
  assert.ok(/token/i.test(client.en['member.association.hint']), 'the English hint mentions token usage too');

  // 气泡上方显示中文昵称（微信式），完整身份（含原始 id）留在 title 上：
  // 名字取 displayName 的中文部分，title 仍是 displayName 全量。
  const leadNameNode = findNodes(merged.tree, (node) => node.props?.key === 'name' && node.children.flat().includes(client.chatBubbleName('lead')))[0];
  assert.ok(leadNameNode, 'the officer row carries the Chinese nickname');
  assert.equal(leadNameNode.props.title, client.displayName('lead'), 'the full identity (with raw id) stays reachable via title');
  assert.equal(client.chatBubbleName('lead'), '内阁首辅', 'the bubble nickname is the Chinese office name only');
  // This harness renders the panel several times into one tree, so rows repeat
  // as distinct objects; deduplicate by (kind,text) before counting.
  const rowSignature = (node) => {
    const text = findNodes([node], (child) => child.props?.['data-cabinet-groupchat-text'] !== undefined)
      .map((child) => deepText(child)).join('');
    // 上游 ed51fb3 的 member 前缀（同文不同成员不算重复行）；头像尺寸按本分支
    // 气泡实现取 20→28。
    const member = findNodes([node], (child) => child.props?.size === 28)[0]?.props?.name;
    return member + '|' + node.props['data-cabinet-groupchat-row'] + '|' + text;
  };
  const seenRows = new Set();
  const uniqueRows = mergedRows.filter((node) => {
    const signature = rowSignature(node);
    if (seenRows.has(signature)) return false;
    seenRows.add(signature);
    return true;
  });
  const toolsButtons = uniqueRows
    .flatMap((row) => findNodes([row], (node) => node.props?.['data-cabinet-groupchat-tools'] !== undefined));
  // Every tool call folds into a row-level count instead of its own line; the
  // two calls belong to two different members, so the counts total two.
  assert.equal(toolsButtons.reduce((sum, node) => sum + Number(node.props['data-cabinet-groupchat-tools']), 0), 2, 'the two tool calls collapse into counted rows');
  const toolsButton = toolsButtons[0];

  for (const node of toolsButtons) {
    assert.equal(node.children.flat().filter((part) => typeof part === 'string').join(''), node.props['data-cabinet-groupchat-tools'] + ' 个工具', 'each collapsed row reads 「N 个工具」');
  }
  assert.ok(findNodes(merged.tree, (node) => node.props?.['data-cabinet-groupchat-tool'] !== undefined).length === 0, 'individual tool calls never render until expanded');
  settled.stop();
  merged.stop();
  assert.deepEqual(releases.slice().sort(), ['lead-session', 'm-works'], 'the unmount after settling releases every reference exactly once');
  assert.equal(releases.length, new Set(releases).size, 'release runs exactly once per reference');
  // The roster tab never retains anything: the retain channel belongs to the
  // 群聊 pane alone, so switching tabs adds no references to release (the
  // unmount path above already proved every reference is released exactly once).
  const retainedBeforeRoster = retainCalls.length;
  groupTab = 'roster';
  const offRender = groupRender({ activeTab: 'roster' });
  assert.equal(retainCalls.length, retainedBeforeRoster, 'switching away from 群聊 retains nothing new, got ' + JSON.stringify(retainCalls.map((call) => call.target)));
  assert.equal(releases.length, new Set(releases).size, 'release runs exactly once per reference');
  releases.length = 0;
  offRender.stop();
  assert.deepEqual(releases, [], 'stopping the roster view releases nothing new');
  groupTab = 'groupchat';

  // The failed member and the empty state are separate renders below.
  const badTeam = { members: [...groupMembers, { id: 'm-bad', name: 'dali', role: 'mate', phase: 'active' }], tasks: [] };
  const badRender = () => {
    recordedEffects.length = 0;
    persistentRefs = { cursor: 0, slots: groupSlots };
    resetHookCursor();
    const tree = elements(client.CabinetPanel({
      sessionId: 'lead-session',
      useSession: (select) => select({}),
      useSessions: (select) => select({ projectionsBySession: { 'lead-session': { values: { agentTeam: badTeam } } } }),
      useSessionStatus: (select) => select(new Map()),
      t: (key) => client.zh[key] || key,
      activeTab: 'groupchat',
    }));
    const stop = runGroupEffects();
    return { tree, stop };
  };
  // The reference only settles on a later microtask, so the first pass paints
  // nothing; resolve `ready` exactly like the real reference and render again.
  // The reference only settles on a later microtask, so keep the hook slots
  // across passes and drive `ready` exactly like the real reference does.
  const badFirst = badRender();
  for (const resolve of pendingReady.values()) resolve({});
  pendingReady.clear();
  const bad = badRender();
  for (const resolve of pendingReady.values()) resolve({});
  pendingReady.clear();
  const badSettled = badRender();
  badFirst.stop();
  bad.stop();
  const badRows = rowsOf(badSettled.tree);
  const badIndex = badRows.findIndex((row) => row.props['data-cabinet-groupchat-error'] === '1');
  assert.ok(badIndex >= 0, 'a failed member renders its own row, got ' + JSON.stringify(badRows.map((row) => row.props['data-cabinet-groupchat-row'])));
  assert.deepEqual(textsOf([badRows[badIndex]]), ['不可用'], 'the failed member degrades to 不可用, not an exception');
  // Unavailable members follow the other members' messages in time order.
  assert.deepEqual(textsOf(badSettled.tree), ['请调研', '请实现', '调研结论A', '实现完成B', '不可用'], 'one failed member never blanks the others');
  badSettled.stop();


  // 5) Unmount releases every reference exactly once. (The tab switch above
  //    already proved the pairing; this pass proves the panel unmount does too.)
  const retainsBeforeMount = retainCalls.length;
  const mounted = groupRender();
  assert.ok(retainCalls.length >= 4, 'the 群聊 tab retains again after a switch back');
  releases.length = 0;
  const retainsForUnmount = retainCalls.slice(retainsBeforeMount);
  mounted.stop();
  // The invariant that matters: every retain this harness ever issued is
  // matched by exactly one release — an unmount never leaves a reference held.
  const retainTotals = {};
  for (const call of retainsForUnmount) retainTotals[call.target] = (retainTotals[call.target] || 0) + 1;
  const releaseTotals = {};
  for (const id of releases) releaseTotals[id] = (releaseTotals[id] || 0) + 1;
  assert.deepEqual(releaseTotals, { 'lead-session': retainTotals['lead-session'], 'm-works': retainTotals['m-works'] }, 'unmount releases every retained member, got ' + JSON.stringify(releases));
  assert.equal(releases.length, new Set(releases).size, 'release runs exactly once per reference');
  releases.length = 0;

  // 6) Incremental append: the next window adds one more message without
  //    another retain, and the 5s tick folds it into the merged view.
  sources['lead-session'].push([...leadEntries, durable('user/message', 4, 5000, { role: 'user', content: [{ type: 'text', text: '追加消息' }] })]);
  const ticked = groupRender();
  // The unmount above ended the previous mount, so this render mounts again
  // (one retain per member); the very next render with the same roster must
  // not add any more.
  const retainsAfterMount = retainCalls.length;
  const tickedSame = groupRender();
  assert.ok(retainCalls.length === retainsAfterMount, 'a re-render with the same roster never re-retains, got ' + JSON.stringify(retainCalls.map((call) => call.target)));
  const syncTimer = intervalSpy.lastTimer;
  assert.ok(syncTimer && syncTimer.ms === 5000, 'the group chat reuses the 5s tick, no new polling loop');
  syncTimer.fn();
  const afterTick = groupRender();
  assert.ok(textsOf(afterTick.tree).includes('追加消息'), 'the tick folds the appended window into the merged view');
  ticked.stop();
  afterTick.stop();
  assert.equal(releases.length, new Set(releases).size, 'every later unmount stays paired');

  // 7) Incremental delta concatenation inside ONE message: two text-delta frames
  //    of one attempt fold into a single row before its settlement arrives.
  const deltaSource = makeSource([
    transient(1, 6000, { attemptId: 'att-2', chunk: { type: 'text-delta', text: '前半' } }),
    transient(2, 6100, { attemptId: 'att-2', chunk: { type: 'text-delta', text: '后半' } }),
  ]);
  sources['lead-session'] = makeSource(leadEntries);
  sources['m-works'] = makeSource(worksEntries);
  // A fresh commit slot array resets the hook state that the panel owns
  // (draft, paging, fold state) without touching the effect-slot pairing: each
  // new section starts from a clean component state, exactly like a remount.
  const remountGroup = (overrides) => {
    groupSlots.length = 0;
    hookStates.slots.length = 0;
    return groupRender(overrides);
  };
  const rowTextOf = (node) => findNodes([node], (child) => child.props?.['data-cabinet-groupchat-text'] !== undefined)
    .map((child) => deepText(child)).join('');
  const settleReady = () => {
    for (const resolve of pendingReady.values()) resolve({});
    pendingReady.clear();
  };
  const composerInputOf = (tree) => findNodes(tree, (node) => node.props?.['data-cabinet-groupchat-input'] !== undefined);
  const sendButtonOf = (tree) => findNodes(tree, (node) => node.props?.['data-cabinet-groupchat-send'] !== undefined);

  // 8) The user's own words. A durable user/message carries role/content on
  //    `data` (live journal), not under `data.message`; only source.kind 'user'
  //    is the user speaking. The line reads 「你」 with no office label and no
  //    cabinet portrait.
  sources['lead-session'] = makeSource([
    ...leadEntries,
    // kind:'user' + rpcId: a real submission from the person (Host marks it).
    durable('user/message', 5, 7000, { role: 'user', content: [{ type: 'text', text: '真实用户发言' }], source: { kind: 'user', rpcId: 'rpc-1' } }),
    // kind:'user' without rpcId: the Lead's spawn prompt / relayed machine text.
    durable('user/message', 6, 7500, { role: 'user', content: [{ type: 'text', text: '派活机器文本' }], source: { kind: 'user' } }),
    durable('user/message', 7, 8000, { role: 'user', content: [{ type: 'text', text: '系统注入不该出现' }], source: { kind: 'respire' } }),
  ]);
  sources['m-works'] = makeSource(worksEntries);
  const userFoldRows = client.groupChatFold(sources['lead-session'].getSnapshot().entries).rows
    .filter((row) => row.kind === 'user').map((row) => row.text);
  assert.ok(userFoldRows.includes('真实用户发言'), 'a durable user/message (role/content on data) folds into a user row, got ' + JSON.stringify(userFoldRows));
  assert.ok(!userFoldRows.includes('派活机器文本'), 'kind:user WITHOUT rpcId is machine dispatch, never the person speaking');
  assert.ok(!userFoldRows.includes('系统注入不该出现'), 'a non-user source.kind is not the user speaking');
  const userMount = remountGroup();
  settleReady();
  const userView = groupRender();
  const userRows = rowsOf(userView.tree).filter((row) => row.props['data-cabinet-groupchat-row'] === 'user');
  assert.ok(userRows.length > 0, 'the user line reaches the merged view');
  const realUserRow = userRows.find((row) => rowTextOf(row).includes('真实用户发言'));
  assert.ok(realUserRow, 'the real prompt renders as a user row, got ' + JSON.stringify(userRows.map(rowTextOf)));
  assert.equal(realUserRow.props['data-cabinet-groupchat-self'], '1', 'the user row is marked as the reader');
  assert.equal(realUserRow.props['data-cabinet-groupchat-author'], 'self', 'the user row carries no cabinet author');
  // 微信式：自己的气泡不显示昵称 —— 名字节点完全不存在，可访问性标识留在
  // header 的 aria-label 上，self 标记照旧可识别。
  assert.deepEqual(findNodes([realUserRow], (node) => node.props?.key === 'name'), [], 'the user line renders no name node at all');
  const userHead = findNodes([realUserRow], (node) => node.props?.['data-cabinet-groupchat-head'] !== undefined)[0];
  assert.ok(userHead, 'the user row still has a header container for its accessibility label');
  assert.equal(userHead.props['aria-label'], client.zh['groupchat.you'], 'the accessibility label still identifies the user line as 「你」');
  assert.equal(realUserRow.props['data-cabinet-groupchat-self'], '1', 'the self marker survives the name removal');
  const officerHead = findNodes([firstOfficerRow], (node) => node.props?.['data-cabinet-groupchat-head'] !== undefined)[0];
  assert.ok(findNodes([officerHead], (node) => node.props?.key === 'name').length > 0, 'officer rows still render their name node');
  assert.equal(findNodes([realUserRow], (node) => node.props?.size === 20).length, 0, 'the user line carries no cabinet portrait');
  assert.deepEqual(findNodes([realUserRow], (node) => node.props?.size === 20), [], 'no avatar node hides in the user row');
  userView.stop();

  // 9) Composer: the 群聊 footer sends to the Lead session through the
  //    retained SessionFace.prompt(parts, 'queue'). The draft survives an
  //    external re-render; a send disables the composer; duplicates are refused.
  sources['lead-session'] = makeSource([...leadEntries]);
  sources['m-works'] = makeSource(worksEntries);
  // 4) Empty state: no minister messages must render a CONTENTFUL, centered
  //    empty state (icon + explanation + actionable hint), never one bare line
  //    over a blank pane (真机截图里那约 800px 空白就是这条退化出来的)。
  // 空白会话的真实形状：没有成员、自身窗口也是空的（真机 respire 那种会话）。
  // 现在 lead 自身也会被 retain，所以必须显式给一个空窗口才会进入空态。
  const savedLeadSource = sources['lead-session'];
  sources['lead-session'] = makeSource([]);
  for (const language of [client.zh, client.en]) {
    const tag = language === client.zh ? 'zh' : 'en';
    groupTab = 'groupchat';
    const emptyTeam = { members: [], tasks: [] };
    const emptyMount = remountGroup({ team: emptyTeam, dictionary: language });
    settleReady();
    const emptyView = groupRender({ team: emptyTeam, dictionary: language });
    const emptyNode = emptyView.tree.find((node) => node.props?.['data-cabinet-groupchat-empty'] !== undefined);
    assert.ok(emptyNode, 'the empty state renders its own container');
    // 容器自带居中布局与最小高度：不是一行贴着顶部的空话。
    assert.equal(emptyNode.props.style.display, 'flex', 'the empty state container is a flex column (' + tag + ')');
    assert.equal(emptyNode.props.style.alignItems, 'center', 'the empty state is horizontally centered (' + tag + ')');
    assert.equal(emptyNode.props.style.justifyContent, 'center', 'the empty state is vertically centered (' + tag + ')');
    assert.equal(emptyNode.props.style.textAlign, 'center', 'the empty state text is centered (' + tag + ')');
    // 4) 空态要撑满可用高度并双向居中（不是固定 200px 小高度贴在顶上）。
    //    真机实测：父盒只有 216px、空态 topGap 86 / bottomGap 865 ⇒「只给自己写
    //    minHeight:100%」无效，必须父盒撑满 + 自己 flex 撑满，两层都要断言。
    assert.equal(emptyNode.props.style.minHeight, '100%', 'the empty state fills the available height instead of a fixed small box (' + tag + ')');
    assert.equal(emptyNode.props.style.flex, '1 1 auto', 'the empty state grows into the remaining flex space (' + tag + ')');
    assert.equal(typeof emptyNode.props.style.minHeight, 'string', 'the empty state height is a fill declaration, not a fixed pixel number (' + tag + ')');
    // 父容器：撑满右栏的 flex 列（display:flex + column + 撑满 + minHeight:0），
    // 并且关掉自己的滚动（overflow:hidden），滚动只由气泡容器负责。
    const scrollHost = emptyView.tree.find((node) => node.props?.['data-cabinet-groupchat-scroll'] !== undefined);
    assert.ok(scrollHost, 'the bubble container exists (' + tag + ')');
    assert.equal(scrollHost.props.style.flex, '1 1 auto', 'the bubble container grows into the remaining pane height (' + tag + ')');
    assert.equal(scrollHost.props.style.minHeight, 0, 'the bubble container can shrink below content height (minHeight:0) (' + tag + ')');
    assert.equal(scrollHost.props.style.overflowY, 'auto', 'the bubble container owns the chat scrolling (' + tag + ')');
    // 承载面板：由它提供「撑满右栏的 flex 列」，滚动交给气泡容器。
    // （测试树是扁平节点数组，没有父链，所以靠面板根上的稳定 hook 断言。）
    const pane = emptyView.tree.find((node) => node.props?.['data-cabinet-groupchat-pane'] !== undefined);
    assert.ok(pane, 'the group-chat pane root is marked (' + tag + ')');
    assert.equal(pane.props.style.display, 'flex', 'the pane hosting the bubbles is a flex box (' + tag + ')');
    assert.equal(pane.props.style.flexDirection, 'column', 'the hosting pane is a flex column so flex:1 means "remaining height" (' + tag + ')');
    assert.equal(pane.props.style.overflow, 'hidden', 'the hosting pane never becomes a second scroll container (' + tag + ')');
    // 全树只有一个滚动容器：overflow:auto / overflowY:auto 的节点只应是气泡容器。
    // 扁平数组里同一节点可能被重复收集，按对象引用去重后再数。
    const scrollers = new Set();
    for (const node of emptyView.tree) {
      if (!node || typeof node !== 'object') continue;
      const st = node.props && node.props.style ? node.props.style : {};
      if (st.overflow === 'auto' || st.overflowY === 'auto') scrollers.add(node);
    }
    assert.equal(scrollers.size, 1, 'exactly one scroll container exists (no nested scrollbars), got ' + String(scrollers.size) + ' (' + tag + ')');
    assert.equal([...scrollers][0], scrollHost, 'that single scroll container is the bubble container itself (' + tag + ')');
    // 有图标 + 有说明文案，文案里含可操作提示。
    const iconNode = findNodes([emptyNode], (node) => node.props?.['data-cabinet-groupchat-empty-icon'] !== undefined)[0];
    const textNode = findNodes([emptyNode], (node) => node.props?.['data-cabinet-groupchat-empty-text'] !== undefined)[0];
    assert.ok(iconNode, 'the empty state carries a visual marker (' + tag + ')');
    assert.ok(textNode, 'the empty state carries a text node (' + tag + ')');
    assert.equal(textNode.children.flat().join(''), language['groupchat.empty'], 'the empty text is translated (' + tag + ')');
    const copy = language['groupchat.empty'];
    assert.ok(copy.includes('\n'), 'the empty copy is two lines: what happened + what to do (' + tag + ')');
    const actionable = tag === 'zh' ? copy.includes('左侧') : /pick a session/i.test(copy);
    assert.ok(actionable, 'the empty copy tells the user what to do next (' + tag + ')');
    emptyView.stop();
  }
  sources['lead-session'] = savedLeadSource;
  promptCalls.length = 0;
  const composerMount = remountGroup();
  settleReady();
  const composerView = groupRender();
  const composerInput = composerInputOf(composerView.tree);
  assert.equal(composerInput.length, 1, 'the 群聊 pane renders exactly one composer input');
  assert.equal(composerInput[0].props.disabled, false, 'a retained Lead SessionFace makes the composer writable');
  composerInput[0].props.onChange({ target: { value: '你好首辅' } });
  const draftedView = groupRender();
  const draftedInput = composerInputOf(draftedView.tree)[0];
  assert.equal(draftedInput.props.value, '你好首辅', 'an external re-render keeps the draft');
  assert.equal(promptCalls.length, 0, 'typing alone sends nothing');
  draftedInput.props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault: () => {} });
  assert.equal(promptCalls.length, 1, 'Enter submits one prompt');
  assert.equal(JSON.stringify(promptCalls[0].content), JSON.stringify([{ type: 'text', text: '你好首辅' }]), 'the draft is sent as one text part');
  assert.equal(promptCalls[0].mode, 'queue', 'the group chat queues instead of steering the running turn');
  assert.equal(promptCalls[0].id, 'lead-session', 'the prompt targets the Lead session');
  const sendingView = groupRender();
  assert.equal(composerInputOf(sendingView.tree)[0].props.disabled, true, 'a sending composer is disabled');
  assert.equal(composerInputOf(sendingView.tree)[0].props['data-cabinet-groupchat-composer-disabled'], '1');
  assert.equal(findNodes(sendingView.tree, (node) => node.props?.['data-cabinet-groupchat-sending'] === '1').length, 1, 'the send button reports the in-flight state');
  sendButtonOf(sendingView.tree)[0].props.onClick();
  assert.equal(promptCalls.length, 1, 'a second submit while sending is refused');
  await new Promise((resolve) => setTimeout(resolve, 0));
  const idleView = groupRender();
  assert.equal(composerInputOf(idleView.tree)[0].props.value, '', 'a successful send clears the draft');
  assert.equal(findNodes(idleView.tree, (node) => node.props?.['data-cabinet-groupchat-sending'] === '1').length, 0, 'the sending flag clears after settlement');
  idleView.stop();

  // 9b) No send channel: a service whose references expose no SessionFace
  //     leaves the composer disabled with a hint; clicking it never throws.
  const noSessionService = {
    refreshProjections: async () => {},
    retain: (target) => ({
      sessionId: target,
      ready: Promise.resolve(),
      release: () => {},
      get binding() { return { sessionId: target, eventSource: { getSnapshot: () => makeWindow([]), subscribe: () => () => {} } }; },
    }),
  };
  const applyWithSessions = (sessions) => rawApply({
    locale: { register: () => {}, bind: () => (key) => key },
    effect: (fn) => { try { return fn(); } catch (error) { return undefined; } },
    inject: (names, callback) => {
      if (Array.isArray(names) && names.includes('sessions')) callback({ sessions, effect: (fn) => { try { return fn(); } catch (error) { return undefined; } } });
    },
  });
  applyWithSessions(noSessionService);
  const unavailableMount = remountGroup();
  settleReady();
  const unavailableView = groupRender();
  const unavailableInput = composerInputOf(unavailableView.tree)[0];
  assert.equal(unavailableInput.props.disabled, true, 'without a SessionFace the composer is disabled');
  assert.equal(unavailableInput.props['data-cabinet-groupchat-composer-disabled'], '1');
  assert.deepEqual(findNodes(unavailableView.tree, (node) => node.props?.['data-cabinet-groupchat-composer-hint'] !== undefined)
    .map((node) => node.children.flat().join('')), [client.zh['groupchat.composer.unavailable']], 'the disabled composer explains the missing channel');
  // 同一句「发送通道不可用」只出现一次：placeholder 不再重复提示行文案。
  assert.equal(unavailableInput.props.placeholder, '', 'the disabled composer placeholder stays neutral instead of repeating the hint, got ' + JSON.stringify(unavailableInput.props.placeholder));
  // 精确判据（JSON 序列化会重复计数，不作数）：placeholder 不再携带该文案，
  // 且提示行只有一个节点、文案恰好一次。
  assert.notEqual(unavailableInput.props.placeholder, client.zh['groupchat.composer.unavailable'], 'the placeholder never repeats the unavailable copy');
  assert.equal(unavailableInput.props.placeholder, '', 'the placeholder is empty while unavailable');
  assert.equal(findNodes(unavailableView.tree, (node) => node.props?.['data-cabinet-groupchat-composer-hint'] !== undefined).length, 1, 'exactly one hint node states the reason');
  sendButtonOf(unavailableView.tree)[0].props.onClick();
  assert.equal(promptCalls.length, 1, 'a disabled composer never sends');
  unavailableView.stop();
  applyWithSessions(groupService);

  // 9c) 空白会话（没有 agentTeam 成员）：retain 目标必须包含当前会话的 lead 自身，
  //     否则 sessionOf 拿不到 reference ⇒ 输入框禁用（真机 respire 空白会话实证）。
  //     并且同一 session 不得被重复 retain。
  sources['lead-session'] = makeSource([]);
  const blankTeamView = (() => {
    const blankTeam = { members: [], tasks: [] };
    retainCalls.length = 0;
    groupTab = 'groupchat';
    const mount = remountGroup({ team: blankTeam });
    settleReady();
    return { ...groupRender({ team: blankTeam }), mount };
  })();
  const blankTargets = retainCalls.map((call) => call.target);
  assert.ok(blankTargets.includes('lead-session'), 'a blank session (no agentTeam members) still retains its own Lead session, got ' + JSON.stringify(blankTargets));
  assert.equal(blankTargets.length, new Set(blankTargets).size, 'retain targets are de-duplicated (no session retained twice), got ' + JSON.stringify(blankTargets));
  assert.equal(blankTargets.filter((target) => target === 'lead-session').length, 1, 'the Lead session is retained exactly once for a blank session');
  const blankComposer = composerInputOf(blankTeamView.tree);
  assert.equal(blankComposer.length, 1, 'a blank session still renders its composer');
  assert.equal(blankComposer[0].props.disabled, false, 'a blank session can still send to its own Lead session (no more disabled composer)');
  blankTeamView.stop();
  // 名册成员与 lead 重叠时也不重复（lead 已在 members 内 = 会话 id）。
  const overlapTeam = { members: [{ id: 'lead-session', name: 'lead', role: 'lead', phase: 'active' }, { id: 'm-overlap', name: 'works', role: 'teammate', phase: 'active' }], tasks: [] };
  retainCalls.length = 0;
  const overlapMount = remountGroup({ team: overlapTeam });
  settleReady();
  const overlapView = groupRender({ team: overlapTeam });
  const overlapTargets = retainCalls.map((call) => call.target);
  assert.equal(overlapTargets.length, new Set(overlapTargets).size, 'lead-in-roster overlap does not double-retain, got ' + JSON.stringify(overlapTargets));
  assert.equal(overlapTargets.filter((target) => target === 'lead-session').length, 1, 'the Lead session appears once even when it is also a roster member');
  overlapView.stop();
  sources['lead-session'] = makeSource([...leadEntries]);

  // 10) Long replies fold: >12 lines or >600 chars collapse to a preview with
  //     「展开/收起」 and stable data hooks; short messages never fold.
  const longBody = Array.from({ length: 20 }, (_, index) => '第' + (index + 1) + '行').join('\n');
  sources['lead-session'] = makeSource([
    ...leadEntries,
    durable('assistant/message', 5, 7100, { message: { role: 'assistant', content: [{ type: 'text', text: longBody }] } }),
    durable('assistant/message', 6, 7200, { message: { role: 'assistant', content: [{ type: 'text', text: 'x'.repeat(601) }] } }),
    durable('assistant/message', 7, 7300, { message: { role: 'assistant', content: [{ type: 'text', text: '短消息不折叠' }] } }),
  ]);
  sources['m-works'] = makeSource(worksEntries);
  const longMount = remountGroup();
  settleReady();
  const longView = groupRender();
  const rowWithText = (tree, needle) => rowsOf(tree).filter((row) => rowTextOf(row).includes(needle));
  // ---- 性能：memo 生效 + markdown 解析缓存 ----
  // 1) 生产代码确实用 useMemo 收敛了重派生（否则「群聊很卡」的根因没被处理）。
  const memoUses = (source.match(/React\.useMemo\(/g) || []).length;
  assert.ok(memoUses >= 4, 'the heavy derivations are memoised, expected at least 4 useMemo calls, got ' + memoUses);
  for (const target of ['chatBubbleNames(members)', 'mergeGroupChat(chatMembers.flatMap', 'cabinetSessionFilters(cabinetSessionChoices(list)', 'cabinetSessionGroups(choices']) {
    assert.ok(source.includes('React.useMemo(() => ' + target), target + ' is wrapped in a React.useMemo');
  }
  // 2) markdown 解析缓存：同一文本第二次走缓存、返回同一份 blocks（不重新解析）。
  const cachedText = '缓存测试 **粗体** 与 ![图](https://x/y.png)';
  const blocksFirst = client.markdownBlocksCached(cachedText);
  const blocksSecond = client.markdownBlocksCached(cachedText);
  assert.ok(Object.is(blocksFirst, blocksSecond), 'the same markdown text returns the cached blocks object instead of re-parsing');
  assert.ok(blocksFirst.length > 0, 'the cached value is the parsed block list');
  // 3) 缓存上限存在（防止无界增长）：塞满后仍可正常返回。
  for (let i = 0; i < 260; i += 1) client.markdownBlocksCached('填充 ' + i);
  assert.ok(Object.is(client.markdownBlocksCached(cachedText), client.markdownBlocksCached(cachedText)), 'the cache still works after exceeding its limit');
  const longRow = rowWithText(longView.tree, '第20行')[0];
  assert.ok(longRow, 'the long reply renders');
  const longTextNode = findNodes([longRow], (node) => node.props?.['data-cabinet-groupchat-text'] !== undefined)[0];
  assert.equal(longTextNode.props['data-cabinet-groupchat-long'], '1', 'a 20-line reply is over the fold threshold');
  assert.equal(longTextNode.props['data-cabinet-groupchat-collapsed'], '1', 'a long reply starts folded');
  // D2：折叠预览高度按内容行高定量（1.55em × 10 行），不是与行高无关的死值；
  // 旧值 10.5em 会截在小数行上，露出半行空带。
  assert.equal(longTextNode.props.style.maxHeight, 'calc(1.55em * 10)', 'the folded preview height is expressed in content line-heights, got ' + String(longTextNode.props.style.maxHeight));
  assert.ok(!String(longTextNode.props.style.maxHeight).includes('10.5em'), 'the folded preview no longer uses the line-height-agnostic 10.5em');
  assert.equal(longTextNode.props.style.overflow, 'hidden', 'the folded preview clips instead of reserving a fixed box');
  const wideRow = rowWithText(longView.tree, 'x'.repeat(601))[0];
  assert.ok(wideRow, 'the wide reply renders');
  assert.equal(findNodes([wideRow], (node) => node.props?.['data-cabinet-groupchat-text'] !== undefined)[0].props['data-cabinet-groupchat-long'], '1', '600+ chars folds even on one line');
  const shortRow = rowWithText(longView.tree, '短消息不折叠')[0];
  assert.ok(shortRow, 'the short reply renders');
  assert.equal(findNodes([shortRow], (node) => node.props?.['data-cabinet-groupchat-text'] !== undefined)[0].props['data-cabinet-groupchat-long'], '0', 'a short reply is never marked long');
  assert.equal(findNodes([shortRow], (node) => node.props?.['data-cabinet-groupchat-fold'] !== undefined).length, 0, 'a short reply carries no toggle');
  const longToggle = findNodes([longRow], (node) => node.props?.['data-cabinet-groupchat-fold'] !== undefined)[0];
  assert.equal(longToggle.props['data-cabinet-groupchat-fold'], 'expand', 'the collapsed toggle offers 展开');
  assert.equal(longToggle.children.flat().join(''), client.zh['groupchat.fold.expand']);
  longToggle.props.onClick();
  const expandedView = groupRender();
  const expandedRow = rowWithText(expandedView.tree, '第20行')[0];
  assert.ok(expandedRow, 'the row survives its own toggle');
  assert.equal(findNodes([expandedRow], (node) => node.props?.['data-cabinet-groupchat-text'] !== undefined)[0].props['data-cabinet-groupchat-collapsed'], '0', '展开 removes the fold');
  const collapseToggle = findNodes([expandedRow], (node) => node.props?.['data-cabinet-groupchat-fold'] !== undefined)[0];
  assert.equal(collapseToggle.props['data-cabinet-groupchat-fold'], 'collapse');
  assert.equal(collapseToggle.children.flat().join(''), client.zh['groupchat.fold.collapse']);
  expandedView.stop();

  // 11) Long histories page: the newest 30 rows render by default, 「显示更早」
  //     adds one page, and the hidden count is exposed for the assertion.
  const manyEntries = [
    durable('user/message', 1, 1000, { message: { role: 'user', content: [{ type: 'text', text: '最早一句' }] } }),
    ...Array.from({ length: 34 }, (_, index) => durable('assistant/message', index + 2, 2000 + index, {
      message: { role: 'assistant', content: [{ type: 'text', text: '批量' + index }] },
    })),
  ];
  sources['lead-session'] = makeSource(manyEntries);
  // No tool rows in this fixture: the page assertion counts message rows only.
  sources['m-works'] = makeSource([]);
  const pageMount = remountGroup();
  settleReady();
  const pageView = groupRender();
  const uniqueGroupRows = (tree) => {
    const seen = new Set();
    const out = [];
    for (const row of rowsOf(tree)) {
      const signature = row.props['data-cabinet-groupchat-row'] + '|' + rowTextOf(row);
      if (seen.has(signature)) continue;
      seen.add(signature);
      out.push(row);
    }
    return out;
  };
  const totalRows = client.groupChatFold(manyEntries).rows.length;
  assert.ok(totalRows > 30, 'the fixture exceeds one page, got ' + totalRows);
  assert.equal(uniqueGroupRows(pageView.tree).length, 30, 'only the newest page mounts by default');
  const olderButtons = findNodes(pageView.tree, (node) => node.props?.['data-cabinet-groupchat-older'] !== undefined);
  assert.ok(olderButtons.length >= 1, 'the paging button renders');
  assert.equal(olderButtons[0].props['data-cabinet-groupchat-hidden'], String(totalRows - 30), 'the button counts the hidden rows');
  assert.equal(olderButtons[0].children.flat().join(''), client.zh['groupchat.older'].replace('{n}', String(totalRows - 30)));
  olderButtons[0].props.onClick();
  const pagedView = groupRender();
  assert.equal(uniqueGroupRows(pagedView.tree).length, totalRows, '显示更早 expands exactly one batch');
  assert.equal(findNodes(pagedView.tree, (node) => node.props?.['data-cabinet-groupchat-older'] !== undefined).length, 0, 'the button disappears once everything is shown');
  pagedView.stop();

  // 12) Fold cache: the fold is keyed on the window's own revision, so a 5s
  //     tick with an unchanged window never re-reads the entry list; a new
  //     revision refolds once.
  let entriesReads = 0;
  let cacheRevision = 7;
  const cacheEntries = [...leadEntries];
  sources['lead-session'] = {
    getSnapshot: () => ({
      get entries() { entriesReads += 1; return cacheEntries; },
      hasMore: false,
      revision: cacheRevision,
      change: { kind: 'replace', entries: cacheEntries },
    }),
    subscribe: () => () => {},
  };
  sources['m-works'] = makeSource(worksEntries);
  const cacheMount = remountGroup();
  settleReady();
  const cacheView = groupRender();
  const readsAfterReady = entriesReads;
  assert.ok(readsAfterReady >= 1, 'the first commit folds the window');
  const cacheTimer = intervalSpy.lastTimer;
  assert.ok(cacheTimer && cacheTimer.ms === 5000, 'the paging view keeps the 5s tick');
  cacheTimer.fn();
  cacheTimer.fn();
  const cacheTicked = groupRender();
  assert.equal(entriesReads, readsAfterReady, 'an unchanged revision reuses the cached fold instead of re-reading entries');
  cacheEntries.push(durable('assistant/message', 9, 9000, { message: { role: 'assistant', content: [{ type: 'text', text: '缓存后到达' }] } }));
  cacheRevision += 1;
  cacheTimer.fn();
  const cacheFresh = groupRender();
  assert.ok(entriesReads > readsAfterReady, 'a new window revision refolds');
  assert.ok(textsOf(cacheFresh.tree).includes('缓存后到达'), 'the new revision reaches the merged view');
  // 14) 微信式气泡、时间戳聚合、贴底滚动、@成员派活。
  {
    // Bubble structure: 别人靠左浅色气泡（头像在气泡外），自己靠右绿气泡（无头像）。
    const otherRow = elements(client.GroupChatRow({ row: { kind: 'assistant', text: '**粗** 正文', time: 30000, seq: 1, tools: [] }, member: { name: 'works' }, t: (key) => client.zh[key] || key }));
    const selfRow = elements(client.GroupChatRow({ row: { kind: 'user', text: '我来问', time: 31000, seq: 2, tools: [] }, member: { name: 'lead' }, t: (key) => client.zh[key] || key }));
    const otherBubble = otherRow.find((node) => node.props?.['data-cabinet-bubble'] === 'other');
    const selfBubble = selfRow.find((node) => node.props?.['data-cabinet-bubble'] === 'self');
    assert.ok(otherBubble && selfBubble, 'both bubble kinds render (data-cabinet-bubble self|other)');
    const chatCss = Array.isArray(client.STYLE_CSS) ? client.STYLE_CSS.join('\n') : String(client.STYLE_CSS || '');
    assert.equal(otherBubble.props.style.maxWidth, '70%', 'the other bubble caps its width near 70%');
    assert.ok(String(otherBubble.props.className).includes('cabinet-chat-other'), 'the other bubble takes the themed other-bubble class');
    assert.ok(String(selfBubble.props.className).includes('cabinet-chat-self'), 'the self bubble takes the themed self-bubble class');
    assert.ok(/border-radius:2px 10px 10px 10px/.test(chatCss), 'the other bubble is rounded');
    assert.ok(/padding:6px 10px/.test(chatCss), 'the bubble carries a compact inner padding');
    assert.ok(/95EC69/.test(chatCss), 'the self bubble uses the WeChat green (light scheme)');
    assert.ok(/light-dark\(#95EC69, #2c5a2f\)/.test(chatCss) && /light-dark\(#0f1115, #eaf6e8\)/.test(chatCss), 'bubble background and text are a light-dark pair, never a fixed white with theme text');
    assert.ok(String(selfBubble.props.style.color).includes('light-dark'), 'the self bubble pins a paired text colour inline');
    assert.ok(otherRow.some((node) => node.type === 'img'), 'the other row keeps a portrait beside the bubble');
    assert.equal(selfRow.filter((node) => node.type === 'img').length, 0, 'the self row has no portrait');
    assert.equal(selfRow.find((node) => node.props?.['data-cabinet-groupchat-row'] === 'user').props.style.alignItems, 'flex-end', 'the self row is right-aligned');
    assert.ok(otherRow.some((node) => node.props?.['data-cabinet-markdown'] === '1'), 'markdown still renders inside the bubble');
    const toolRow = elements(client.GroupChatRow({ row: { kind: 'assistant', text: '带工具', time: 32000, seq: 3, tools: [{ name: 'read_file', args: 'a.js' }] }, member: { name: 'works' }, t: (key) => client.zh[key] || key }));
    const toolBubble = toolRow.find((node) => node.props?.['data-cabinet-bubble'] === 'other');
    assert.ok(findNodes([toolBubble], (node) => node.props?.['data-cabinet-groupchat-tools'] === '1').length > 0, 'the tool fold stays inside the bubble');

    // Timestamps + grouping: pure view-row mapping gives a centered stamp on the
    // first line and after a ≥5min gap, and compacts same-author lines.
    const tt0 = (key) => client.zh[key] || key;
    const stampRow = elements(client.GroupChatRow({ row: { kind: 'assistant', text: '第一句', time: 100000, seq: 1, tools: [] }, member: { name: 'works' }, t: tt0, showTime: true }));
    const stampNode = stampRow.find((node) => node.props?.['data-cabinet-groupchat-time'] !== undefined);
    assert.ok(stampNode, 'a centered timestamp node renders when the view row asks for one');
    assert.equal(String(stampNode.props.style.alignSelf), 'center', 'the timestamp sits centered above the bubble');
    const compactRow = elements(client.GroupChatRow({ row: { kind: 'assistant', text: '第二句', time: 110000, seq: 2, tools: [] }, member: { name: 'works' }, t: tt0, compact: true }));
    assert.equal(findNodes(compactRow, (node) => node.props?.key === 'name').length, 0, 'a compact same-author line omits the name');
    const compactBubble = compactRow.find((node) => node.props?.['data-cabinet-bubble'] !== undefined);
    assert.equal(compactBubble.props['data-cabinet-bubble-compact'], '1', 'the compact flag reaches the bubble');
    const viewRows = client.cabinetChatViewRows([
      { kind: 'assistant', time: 100000, memberName: 'works' },
      { kind: 'assistant', time: 110000, memberName: 'works' },
      { kind: 'assistant', time: 410000, memberName: 'works' },
      { kind: 'assistant', time: 420000, memberName: 'lead' },
      { kind: 'user', time: 430000 },
      { kind: 'user', time: 440000 },
    ]);
    assert.deepEqual(viewRows.map((entry) => entry.showTime), [true, false, true, false, false, false], 'stamps appear on the first line and after a 5-minute gap, not on every line');
    assert.deepEqual(viewRows.map((entry) => entry.compact), [false, true, true, false, false, true], 'consecutive same-author lines are compact');

    const mountSettled = async () => {
      remountGroup();
      settleReady();
      // `ready` is a real promise: let its .then fold the window before the
      // asserting render, exactly like the browser's next commit.
      await new Promise((resolve) => setTimeout(resolve, 0));
      groupRender();
      return groupRender();
    };

    // Scroll: the container exposes a callback ref that scrolls to the bottom on
    // mount, a follow flag that drops when the reader scrolls up, and pure
    // helpers with no timers.
    assert.equal(client.nearChatBottom({ scrollTop: 0, scrollHeight: 1000, clientHeight: 400 }, 24), false, 'scrolled up is not near the bottom');
    assert.equal(client.nearChatBottom({ scrollTop: 576, scrollHeight: 1000, clientHeight: 400 }, 24), true, 'within 24px of the bottom counts as near');
    const fakeScroller = { scrollTop: 0, scrollHeight: 1200, clientHeight: 400, scrollTo: function (options) { this.called = (this.called || 0) + 1; this.lastTop = options.top; } };
    assert.equal(client.scrollChatToBottom(fakeScroller), true);
    assert.equal(fakeScroller.called, 1, 'scrollChatToBottom asks the node to scroll once');
    assert.equal(fakeScroller.lastTop, 1200, 'it scrolls to scrollHeight');
    // 前面的缓存测试把 lead 源换成了不带 push 的假对象，这里换回真实窗口源。
    sources['lead-session'] = makeSource([...leadEntries]);
    sources['m-works'] = makeSource(worksEntries);
    const scrolled = await mountSettled();
    const container = findNodes(scrolled.tree, (node) => node.props?.['data-cabinet-groupchat'] !== undefined)[0];
    assert.equal(container.props['data-cabinet-groupchat-scroll'], '1', 'the chat container carries a stable scroll hook');
    assert.equal(typeof container.props.ref, 'function', 'the chat container has a callback ref');
    assert.equal(typeof container.props.onScroll, 'function', 'the chat container tracks scroll position');
    assert.equal(container.props['data-cabinet-groupchat-follow'], '1', 'the view starts in follow mode');
    // 稳定 ref：同一实例再渲染一次，取到的 ref 函数引用必须相同（内联箭头会变）。
    const rerendered = groupRender();
    const containerAgain = findNodes(rerendered.tree, (node) => node.props?.['data-cabinet-groupchat'] !== undefined)[0];
    assert.equal(containerAgain.props.ref, container.props.ref, 'the scroll container ref is a stable function across renders');
    const scroller = { scrollTop: 0, scrollHeight: 900, clientHeight: 300, scrollTo: function () { this.called = (this.called || 0) + 1; } };
    containerAgain.props.ref(scroller);
    assert.equal(scroller.called, 1, 'attaching the ref on mount scrolls to the bottom exactly once');
    containerAgain.props.ref(scroller);
    assert.equal(scroller.called, 1, 'a repeated ref attach does not scroll again');
    // 用户上滚：follow 关闭；此后新消息/重渲染都不得把视图拽回底部。
    containerAgain.props.onScroll({ target: { scrollTop: 0, scrollHeight: 900, clientHeight: 300 } });
    const afterUp = groupRender();
    const upContainer = findNodes(afterUp.tree, (node) => node.props?.['data-cabinet-groupchat'] !== undefined)[0];
    assert.equal(upContainer.props['data-cabinet-groupchat-follow'], '0', 'scrolling up turns follow mode off');
    const callsBeforePush = scroller.called;
    const leadTail = [...leadEntries, durable('assistant/message', 97, 9700, { message: { role: 'assistant', content: [{ type: 'text', text: '新尾部一' }] } })];
    sources['lead-session'].push(leadTail);
    const afterPush = groupRender();
    const afterPushContainer = findNodes(afterPush.tree, (node) => node.props?.['data-cabinet-groupchat'] !== undefined)[0];
    assert.equal(scroller.called, callsBeforePush, 'a new tail does not scroll while the reader is scrolled up');
    assert.equal(afterPushContainer.props['data-cabinet-groupchat-follow'], '0', 'a re-render does not silently re-enable follow');
    // 回到底部：贴底读者在新尾部到达时恰好滚一次。
    afterPushContainer.props.onScroll({ target: { scrollTop: 600, scrollHeight: 900, clientHeight: 300 } });
    const afterBottom = groupRender();
    const bottomContainer = findNodes(afterBottom.tree, (node) => node.props?.['data-cabinet-groupchat'] !== undefined)[0];
    assert.equal(bottomContainer.props['data-cabinet-groupchat-follow'], '1', 'scrolling back to the bottom re-enables follow');
    const callsSticky = scroller.called;
    sources['lead-session'].push([...leadTail, durable('assistant/message', 98, 9800, { message: { role: 'assistant', content: [{ type: 'text', text: '新尾部二' }] } })]);
    groupRender();
    // 跟随决策函数（effect 直接调用它）：非贴底不滚，贴底滚一次。
    assert.equal(client.scrollFollowingTail(scroller, false), false, 'the follow decision refuses to scroll while the reader is scrolled up');
    assert.equal(scroller.called, callsSticky, 'a refused follow leaves the scroll position alone');
    assert.equal(client.scrollFollowingTail(scroller, true), true, 'the follow decision scrolls when the reader is at the bottom');
    assert.equal(scroller.called, callsSticky + 1, 'a sticky reader follows the new tail with exactly one scroll');
    assert.ok(source.includes('scrollFollowingTail(scrollNodeRef.current, followBottomRef.current)'), 'the tail effect goes through the follow decision, not an unconditional scroll');
    // 源码级：滚动只由 ref/尾部 + follow 触发，绝无定时器驱动。
    const scrollSource = source.slice(source.indexOf('function scrollChatToBottom'), source.indexOf('function cabinetChatViewRows'));
    assert.ok(!/setInterval|setTimeout/.test(scrollSource), 'scrollChatToBottom schedules no timer');
    assert.ok(!/set(?:Interval|Timeout)[\s\S]{0,160}scrollChatToBottom/.test(source), 'no timer is scheduled around a bottom scroll');
    afterBottom.stop();
    afterUp.stop();
    rerendered.stop();
    scrolled.stop();

    // @ mentions: typing @ opens the roster picker, choosing one stores a target
    // separate from the body, and Enter delivers to that member's session.
    sources['lead-session'] = makeSource([...leadEntries]);
    sources['m-works'] = makeSource(worksEntries);
    promptCalls.length = 0;
    let mentionView = await mountSettled();
    composerInputOf(mentionView.tree)[0].props.onChange({ target: { value: '帮我查 @' } });
    mentionView = groupRender();
    const mentionPanel = findNodes(mentionView.tree, (node) => node.props?.['data-cabinet-mention-panel'] !== undefined);
    assert.equal(mentionPanel.length, 1, 'typing @ opens the member picker');
    const options = findNodes(mentionView.tree, (node) => typeof node.props?.['data-cabinet-mention-option'] === 'string');
    assert.ok(options.some((node) => node.props['data-cabinet-mention-option'] === 'm-works'), 'the picker lists the in-register officer');
    assert.ok(options.some((node) => node.props['data-cabinet-mention-option'] === 'lead-session'), 'the picker lists the Lead');
    options.find((node) => node.props['data-cabinet-mention-option'] === 'm-works').props.onClick();
    mentionView = groupRender();
    const mentionedInput = composerInputOf(mentionView.tree)[0];
    assert.ok(String(mentionedInput.props.value).includes('@' + client.memberLabel('works')), 'choosing a member inserts a resolvable @office marker');
    const chip = findNodes(mentionView.tree, (node) => node.props?.['data-cabinet-mention-target'] === 'm-works');
    assert.equal(chip.length, 1, 'the target is stored separately from the body');
    promptCalls.length = 0;
    mentionedInput.props.onKeyDown({ key: 'Enter', preventDefault() {} });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(promptCalls.length, 1, 'a mentioned send goes out once, got ' + JSON.stringify(promptCalls.map((call) => call.id)));
    assert.equal(promptCalls[0].id, 'm-works', 'the message is delivered to the mentioned member session');
    assert.equal(promptCalls[0].mode, 'queue');
    assert.equal(promptCalls[0].content[0].text, '帮我查', 'the body no longer carries the @ marker when the member is the addressee');
    mentionView.stop();

    // Explicit degradation: without a member SessionFace the send falls back to
    // the Lead, keeps the @ marker in the body, and says so in the UI.
    const leadOnlyService = {
      refreshProjections: async () => {},
      retain: (target, options) => {
        retainCalls.push({ target, options });
        const reference = makeReference(target);
        if (target !== 'lead-session') {
          const original = reference.binding;
          Object.defineProperty(reference, 'binding', { configurable: true, get: () => ({ sessionId: original.sessionId, eventSource: original.eventSource }) });
        }
        return reference;
      },
    };
    applyWithSessions(leadOnlyService);
    let degradedView = await mountSettled();
    composerInputOf(degradedView.tree)[0].props.onChange({ target: { value: '帮我查 @' } });
    degradedView = groupRender();
    findNodes(degradedView.tree, (node) => node.props?.['data-cabinet-mention-option'] === 'm-works')[0].props.onClick();
    degradedView = groupRender();
    promptCalls.length = 0;
    composerInputOf(degradedView.tree)[0].props.onKeyDown({ key: 'Enter', preventDefault() {} });
    await new Promise((resolve) => setTimeout(resolve, 0));
    degradedView = groupRender();
    assert.equal(promptCalls.length, 1, 'the degraded send goes out once');
    assert.equal(promptCalls[0].id, 'lead-session', 'without a member face the message is sent to the Lead');
    assert.ok(String(promptCalls[0].content[0].text).includes('@' + client.memberLabel('works')), 'the fallback body keeps the @ marker');
    const fallbackNote = findNodes(degradedView.tree, (node) => node.props?.['data-cabinet-mention-fallback'] !== undefined);
    assert.equal(fallbackNote.length, 1, 'the UI states the fallback instead of pretending the member was dispatched');
    degradedView.stop();
    applyWithSessions(groupService);
    persistentRefs = null;
  }
  cacheFresh.stop();

  // 13) The conversation now lives in the 左侧「内阁」整页: the page path keeps
  //     the retain/release contract (the right pane no longer hosts 群聊).
  {
    groupSlots.length = 0;
    hookStates.slots.length = 0;
    persistentRefs = { cursor: 0, slots: groupSlots };
    recordedEffects.length = 0;
    const retainsBeforePage = retainCalls.length;
    const pageList = {
      ids: ['lead-session'],
      byId: { 'lead-session': { title: '首辅会话', updatedAt: ageOf(9) } },
      // 左列准入要求「有 lead 之外的阁臣」，否则会话被 A 条件滤掉、页面无群聊可渲染。
      projectionsBySession: { 'lead-session': { values: { agentTeam: { members: [{ name: 'lead', role: 'lead', id: 'lead-session' }, { name: 'works', role: 'mate', id: 'm-works' }], tasks: [] } } } },
    };
    const pageProps = { useSessions: (select) => select(pageList), useSessionStatus: (select) => select(new Map()), t: (key) => client.zh[key] || key };
    const pageRender = () => { resetHookCursor(); return elements(client.CabinetPage(pageProps)); };
    const pageTree = pageRender();
    const stopPage = runGroupEffects();
    settleReady();
    const pageSettled = pageRender();
    assert.ok(findNodes(pageSettled, (node) => node.props?.['data-cabinet-page'] !== undefined).length > 0, 'the page renders');
    assert.ok(findNodes(pageSettled, (node) => node.props?.['data-cabinet-groupchat'] !== undefined).length > 0, 'the page carries the group chat');
    assert.ok(composerInputOf(pageSettled).length > 0, 'the page carries the composer');
    assert.ok(sendButtonOf(pageSettled).length > 0, 'the page carries the send button');
    const pageRetains = retainCalls.slice(retainsBeforePage);
    assert.ok(pageRetains.length >= 1, 'mounting the page retains its session, got ' + JSON.stringify(pageRetains));
    // 群聊会 retain 选中会话 + 每位阁臣（本轮 fixture 多了一个阁臣 m-works）：
    // 断言来源一致、且目标只可能是这两个。
    assert.ok(pageRetains.every((call) => call.options.source === 'cabinetGroupChat'), 'every retain goes through our source');
    assert.ok(pageRetains.some((call) => call.target === 'lead-session'), 'the page retains the selected SessionId, got ' + JSON.stringify(pageRetains));
    assert.ok(pageRetains.every((call) => call.target === 'lead-session' || call.target === 'm-works'), 'only the selected session and its ministers are retained, got ' + JSON.stringify(pageRetains));
    stopPage();
    assert.ok(releases.includes('lead-session'), 'unmounting the page releases the retained session, got ' + JSON.stringify(releases.slice(-3)));
    persistentRefs = null;
    groupTab = 'roster';
  }
}
console.log('PASS 群聊 tab: the right pane keeps the roster only (no 群聊 tab, rows or composer) while the group chat is mounted through the standalone 内阁 page, which retains/releases its selected SessionId, settings tabs untouched, retain first argument is a SessionId string with source cabinetGroupChat, messages merge in time order with officer portrait/name and body, the user\'s own durable prompt renders as 「你」 with no bureau name or portrait while injected user-role rows are filtered, the composer queues prompt(parts,\'queue\') to the Lead session and keeps its draft across re-renders, refuses duplicates while sending and degrades to a disabled hint without a SessionFace, long replies (>12 lines or 600+ chars) fold with 展开/收起 and short ones do not, only the newest 30 rows mount until 显示更早, the fold cache reuses an unchanged window revision instead of re-reading entries, two tool calls collapse to 「2 个工具」, a failed member degrades to 不可用, the bilingual empty state renders, a tab switch and unmount each release every reference exactly once, the 5s tick folds an appended window, and two text-delta frames concatenate inside one message');

// ── task-47: markdown subset, model catalog states, standalone 内阁 page ──
{
  // Markdown: block split + inline tokens; refused URLs never become links.
  const md = '# 标题\n\n- 甲\n- 乙\n\n```js\nconst a = 1;\n```\n\n行内 `code` 与 **粗体** 与 [站](https://example.com) 与 [坏](javascript:alert(1))';
  assert.equal(JSON.stringify(client.markdownBlocksOf(md).map((block) => block.kind)), JSON.stringify(['heading', 'ul', 'code', 'paragraph']), 'markdown blocks split into heading/list/code/paragraph');
  const inline = client.inlineMarkdownTokens('`c` **b** [ok](https://e.co) [bad](javascript:1)');
  const inlineLinks = inline.filter((token) => token.kind === 'link');
  assert.equal(inlineLinks.length, 1, 'only the http link becomes a link token');
  assert.equal(inlineLinks[0].href, 'https://e.co');
  assert.ok(inline.some((token) => token.kind === 'code' && token.text === 'c'), 'inline code is a code token');
  assert.ok(inline.some((token) => token.kind === 'strong' && token.text === 'b'), 'bold is a strong token');
  assert.ok(inline.map((token) => token.text).join(' ').includes('[bad](javascript:1)'), 'the refused URL stays plain text');
  assert.equal(client.markdownLinkHref('javascript:alert(1)'), null, 'javascript: is refused by the whitelist');
  // 3) markdown 图片：合法 http(s) 渲染成 img；非法协议与裸路径安全退化、且不显示原文。
  const imageTokens = client.inlineMarkdownTokens('看图 ![截图](https://x/y.png) 完');
  const imageToken = imageTokens.find((token) => token.kind === 'image');
  assert.ok(imageToken, 'an image token is produced for ![alt](url), got ' + JSON.stringify(imageTokens));
  assert.equal(imageToken.src, 'https://x/y.png', 'the image keeps its url');
  assert.equal(imageToken.alt, '截图', 'the image keeps its alt text');
  const imageTree = elements(client.CabinetMarkdown({ text: '看图 ![截图](https://x/y.png) 完', t: (key) => client.zh[key] || key }));
  const imageNode = imageTree.find((node) => node.props?.['data-cabinet-markdown-image'] !== undefined);
  assert.ok(imageNode, 'the markdown renderer emits an img node');
  assert.equal(imageNode.props.src, 'https://x/y.png', 'the img carries the url');
  assert.equal(imageNode.props.alt, '截图', 'the img keeps alt for accessibility');
  assert.equal(imageNode.props.title, '截图', 'the img uses the alt as its hover title');
  assert.equal(imageNode.props.style.maxWidth, '100%', 'the image never overflows the bubble');
  assert.ok(imageNode.props.style.borderRadius > 0, 'the image is rounded like the rest of the bubble');
  for (const bad of ['![a](javascript:alert(1))', '![a](/local/path.png)', '![a](file:///tmp/x.png)']) {
    const badTokens = client.inlineMarkdownTokens(bad);
    assert.ok(!badTokens.some((token) => token.kind === 'image'), 'no img token for ' + bad);
    const flat = badTokens.map((token) => token.text || '').join('');
    assert.ok(!flat.includes(']('), 'the raw markdown never leaks as text for ' + bad + ', got ' + JSON.stringify(flat));
    // 递归原始渲染树（children 可能是嵌套数组），并统计其中的 img 节点。
    const badTree = client.CabinetMarkdown({ text: bad, t: (key) => client.zh[key] || key });
    const textOf = (node) => {
      if (typeof node === 'string') return node;
      if (Array.isArray(node)) return node.map(textOf).join('');
      if (!node || typeof node !== 'object') return '';
      return (Array.isArray(node.children) ? node.children : []).map(textOf).join('');
    };
    const imgNodes = [];
    const collect = (node) => {
      if (Array.isArray(node)) { node.forEach(collect); return; }
      if (!node || typeof node !== 'object') return;
      if (node.type === 'img') imgNodes.push(node);
      for (const child of Array.isArray(node.children) ? node.children : []) collect(child);
    };
    collect(badTree);
    const rendered = textOf(badTree);
    assert.equal(imgNodes.length, 0, 'no img node for ' + bad);
    assert.ok(!rendered.includes(']('), 'the rendered text shows no raw image markdown for ' + bad + ', got ' + JSON.stringify(rendered));
    assert.ok(rendered.includes('[图片]'), 'the refused image degrades to a readable placeholder for ' + bad);
  }
  const mixedTree = elements(client.CabinetMarkdown({ text: '[链](https://a.b) **粗** `code`\n\n```js\nlet a=1\n```', t: (key) => client.zh[key] || key }));
  assert.equal(mixedTree.filter((node) => node.props?.['data-cabinet-markdown-link'] !== undefined).length, 1, 'links still render');
  assert.equal(mixedTree.filter((node) => node.props?.['data-cabinet-markdown-strong'] !== undefined).length, 1, 'bold still renders');
  assert.equal(mixedTree.filter((node) => node.props?.['data-cabinet-markdown-inline-code'] !== undefined).length, 1, 'inline code still renders');
  assert.equal(mixedTree.filter((node) => node.props?.['data-cabinet-markdown-code'] !== undefined).length, 1, 'fenced code still renders');
  assert.equal(client.markdownLinkHref('file:///etc/passwd'), null, 'only http/https passes the whitelist');
  const mdTree = elements(client.CabinetMarkdown({ text: md, t: (key) => client.zh[key] || key }));
  assert.ok(mdTree.some((node) => node.props?.['data-cabinet-markdown'] === '1'), 'a markdown body renders its own root');
  assert.ok(mdTree.some((node) => node.props?.['data-cabinet-markdown-heading'] === '1'), 'a heading renders a heading block');
  assert.ok(mdTree.some((node) => node.type === 'pre' && node.props?.['data-cabinet-markdown-code'] === '1'), 'a fenced block renders <pre>');
  assert.ok(mdTree.some((node) => node.type === 'li'), 'list items render as <li>');
  assert.ok(mdTree.some((node) => node.type === 'code' && node.props?.['data-cabinet-markdown-inline-code'] === '1'), 'inline code renders <code>');
  assert.ok(mdTree.some((node) => node.type === 'strong'), 'bold renders <strong>');
  const link = mdTree.find((node) => node.type === 'a');
  assert.equal(link.props.href, 'https://example.com', 'the http link keeps its href');
  assert.equal(link.props.rel, 'noopener noreferrer nofollow');
  assert.equal(link.props.target, '_blank');
  assert.ok(!mdTree.some((node) => node.type === 'a' && String(node.props.href).startsWith('javascript')), 'no javascript: link is ever produced');
  const plainTree = elements(client.CabinetMarkdown({ text: '纯文本一行', t: (key) => key }));
  assert.equal(JSON.stringify(plainTree.filter((node) => node.props?.['data-cabinet-markdown-paragraph'] === '1').map((node) => node.children.flat().join(''))), JSON.stringify(['纯文本一行']), 'plain text degrades to a single paragraph of text');
  // 用户截图里的两种残留必须真被渲染（不许原样漏字）：
  // ① 圆点列表 `• x`（不是标准 `- `）→ ul/li；② 粗体内带单个星号 → strong。
  const bulletDots = elements(client.CabinetMarkdown({ text: '今日\n• 甲项\n• 乙项\n• 丙项', t: (key) => key }));
  assert.equal(bulletDots.filter((node) => node.type === 'ul' && node.props?.['data-cabinet-markdown-list'] === 'ul').length, 1, 'a `•` bullet list renders one <ul>, not literal paragraphs');
  assert.equal(bulletDots.filter((node) => node.type === 'li').length, 3, 'three `•` bullets become three <li>');
  assert.ok(!bulletDots.some((node) => node.type === 'p' && node.children.flat().join('').includes('•')), 'no literal bullet character survives into a paragraph');
  assert.equal(JSON.stringify(client.markdownBlocksOf('a\n• b\n• c').map((block) => block.kind)), JSON.stringify(['paragraph', 'ul']), '`•` bullets fold into a ul block');
  const innerStar = elements(client.CabinetMarkdown({ text: '这是 **重要 *强调* 文字** 结束', t: (key) => key }));
  assert.equal(innerStar.filter((node) => node.type === 'strong').length, 1, 'bold with a nested single star still renders <strong>');
  assert.equal(innerStar.filter((node) => node.type === 'strong')[0].children.flat().join(''), '重要 *强调* 文字', 'the strong body keeps its inner text verbatim');
  assert.ok(!innerStar.some((node) => node.type === 'p' && node.children.flat().join('').includes('**')), 'no literal `**` survives into a paragraph');
  const unclosed = elements(client.CabinetMarkdown({ text: '**未闭合 开头', t: (key) => key }));
  assert.equal(unclosed.filter((node) => node.type === 'strong').length, 0, 'an unpaired `**` never fabricates a strong');
  assert.ok(unclosed.some((node) => node.type === 'p' && node.children.flat().join('').includes('**未闭合 开头')), 'an unpaired `**` keeps its literal text instead of swallowing it');
  const emptySafe = elements(client.CabinetMarkdown({ text: 'a\n\n\nb', t: (key) => key }));
  assert.equal(emptySafe.filter((node) => node.props?.['data-cabinet-markdown-paragraph'] === '1' && node.children.flat().join('') === '').length, 0, 'blank lines never produce an empty paragraph inside a bubble');

  // A group-chat line renders through the subset when the host module table has
  // no primitives (this main instance throws on that spec on purpose).
  const mdRowBody = { row: { kind: 'assistant', text: '# 小标题\n- 项', time: 7000, seq: 9, tools: [] }, member: { name: 'lead' }, t: (key) => client.zh[key] || key, expanded: true };
  const mdRow = elements(client.GroupChatRow(mdRowBody));
  assert.equal(typeof client.apply, 'function', 'a throwing primitives require never crashes the plugin');
  assert.ok(mdRow.some((node) => node.props?.['data-cabinet-markdown'] === '1'), 'without the host component the local subset renders the body');
  assert.ok(mdRow.some((node) => node.props?.['data-cabinet-markdown-heading'] === '1'), 'a chat heading is a heading, not literal text');
  assert.equal(mdRow.filter((node) => node.type === 'host-markdown').length, 0, 'the fallback never invokes a host markdown component');
  // Safety red lines for the local renderer: no innerHTML, http(s)-only links
  // with a safe rel/target, and refused schemes kept as plain text.
  const clientCode = source.split('\n').filter((line) => {
    const text = line.trim();
    return !text.startsWith('//') && !text.startsWith('*') && !text.startsWith('/*');
  }).join('\n');
  assert.ok(!clientCode.includes('innerHTML') && !clientCode.includes('dangerouslySetInnerHTML'), 'no markdown path builds raw HTML');
  // Host path: when the module table serves MarkdownText (as the web boot does),
  // the row body must be that component with the documented props.
  let hostMarkdownClient;
  runInNewContext(source.replace(exportPoint, exportList), {
    window: { __ModuleLoader__: { load: ({ factory }) => {
      const HostMarkdown = (props) => ({ type: 'host-markdown', props, children: [] });
      hostMarkdownClient = factory((name) => {
        if (name === '@deepseek-ai/dsh-client-ui-primitives') return { MarkdownText: HostMarkdown };
        assert.equal(name, 'react');
        return React;
      });
    } } },
  });
  const hostRow = elements(hostMarkdownClient.GroupChatRow(mdRowBody));
  const hostBody = hostRow.filter((node) => node.type === 'host-markdown');
  assert.equal(hostBody.length, 1, 'the host MarkdownText renders the chat body when the seed serves it');
  assert.equal(hostBody[0].props.text, mdRowBody.row.text, 'the host component receives the message text verbatim');
  assert.equal(hostBody[0].props.streaming, false, 'a settled message is not streamed');
  assert.equal(hostBody[0].props.labels.code.copyLabel, '复制代码', 'the host component receives the code labels');
  assert.equal(hostBody[0].props.labels.footnotes, '脚注', 'the host component receives the footnotes label');
  assert.equal(hostRow.filter((node) => node.props?.['data-cabinet-markdown'] === '1').length, 0, 'the host path does not also render the local subset');

  // Model catalog: the real shape flattens, and every empty/failed state says why.
  const realCatalog = { default: { provider: 'magpie', model: 'flash' }, routableProviders: ['magpie'], groups: [{ id: 'magpie', name: 'Magpie', models: [{ id: 'flash', name: 'Flash' }] }], failures: [] };
  assert.equal(JSON.stringify(client.modelOptionsOf(realCatalog).map((option) => option.value)), JSON.stringify(['magpie/flash']), 'real groups flatten to provider/model options');
  assert.equal(client.modelCatalogNotice(realCatalog, (key) => client.zh[key] || key), null, 'a healthy catalog has no notice');
  const noAdapter = client.modelCatalogNotice({ groups: [], failures: [] }, (key) => client.zh[key] || key);
  assert.equal(noAdapter.kind, 'empty', 'empty groups + no failures is the no-adapter state');
  assert.ok(noAdapter.text.includes('未检测到已注册的模型 provider'), 'the no-adapter state names the missing provider explicitly');
  const failed = client.modelCatalogNotice({ groups: [], failures: [{ id: 'x', message: 'boom' }] }, (key) => client.zh[key] || key);
  assert.equal(failed.kind, 'failures');
  assert.ok(failed.text.includes('boom'), 'a catalog failure echoes its message');
  assert.equal(client.modelCatalogNotice(null, (key) => key).kind, 'error', 'a missing remote is an explicit error');
  // The old 「仅展示、未生效」 claim was false: the plugin host applies the saved
  // member model (index.js:310-545, agent.model.select at :486). No copy may
  // repeat it, the applied note must be present, and the fail-closed risk is
  // stated rather than hidden.
  assert.ok(!source.includes('未生效'), 'no source copy claims the saved model is not applied');
  assert.ok(!source.includes('data-cabinet-model-effect'), 'the old none-effect test hook is gone');
  assert.ok(source.includes("'data-cabinet-model-active': '1'") && source.includes("'data-cabinet-model-risk': 'fail-closed'"), 'the picker exposes applied + fail-closed hooks');
  assert.ok(client.zh['member.model.effectActive'].includes('生效'), 'the model note says the choice takes effect');
  assert.ok(client.zh['member.model.failClosed'].includes('fail-closed'), 'the fail-closed failure mode is spelled out');
  const renderModelTab = mountSettings({ t: (key) => client.zh[key] || key });
  let settingsNodes = renderModelTab();
  tabButton(settingsNodes, 'models').props.onClick();
  settingsNodes = renderModelTab();
  const appliedNode = settingsNodes.find((node) => node.props?.['data-cabinet-model-active'] === '1');
  const riskNode = settingsNodes.find((node) => node.props?.['data-cabinet-model-risk'] === 'fail-closed');
  assert.ok(appliedNode && appliedNode.children.flat().join('').includes('生效'), 'the settings UI states the choice takes effect');
  assert.ok(riskNode && riskNode.children.flat().join('').includes('fail-closed'), 'the settings UI states the fail-closed risk');
  assert.equal(settingsNodes.filter((node) => node.children.flat().join('').includes('未生效')).length, 0, 'no settings copy repeats the false claim');
  assert.equal(JSON.stringify(client.modelSelectionOf({ s1: { values: { modelSelection: { lastUsed: { provider: 'p', model: 'a' }, next: { provider: 'p', model: 'b' } } } } }, 's1')), JSON.stringify({ next: 'p/b', last: 'p/a' }), 'current model reads the modelSelection projection, not the catalog default');

  // Standalone 内阁 page: own session picker, agentTeam session preferred.
  const sessionList = {
    ids: ['s-old', 's-lead', 's-new'],
    byId: {
      's-old': { title: '旧会话', updatedAt: ageOf(100) },
      's-lead': { title: '首辅会话', updatedAt: ageOf(50) },
      // s-new 也要过「有阁臣」准入，否则下拉手选后会被过滤掉、选中值回退；
      // 它的 updatedAt 故意比 s-lead 旧，默认选中仍是 s-lead（见下方断言）。
      's-new': { title: '新会话', updatedAt: ageOf(40) },
    },
    projectionsBySession: {
      's-lead': { values: { agentTeam: { members: [{ name: 'lead', role: 'lead', id: 's-lead' }, { name: 'works', role: 'teammate', id: 's-mate' }], tasks: [] } } },
      's-new': { values: { agentTeam: { members: [{ name: 'lead', role: 'lead', id: 's-new' }, { name: 'works', role: 'teammate', id: 's-mate-2' }], tasks: [] } } },
    },
  };
  const choices = client.cabinetSessionChoices(sessionList);
  assert.equal(JSON.stringify(choices.map((choice) => choice.id)), JSON.stringify(['s-old', 's-lead', 's-new']), 'the picker lists the sessions snapshot');
  // O2：默认 = 最近更新且**有成员**的会话。本 fixture 里 s-lead 有 1 名成员、s-new 没有，
  // 所以默认是 s-lead（不是最新；也不是因为「有投影」，而是因为名册非空）。
  assert.equal(client.defaultCabinetSession(choices), 's-lead', 'the default is the most recently updated session that actually has members');
  // 左列只放顶层会话：子 agent 会话（parentSessionId 或 origin:subagent）一律不入列。
  const withChildren = {
    ids: ['s-lead', 's-child-a', 's-child-b', 's-child-c', 's-other'],
    byId: {
      's-lead': { title: '首辅会话', updatedAt: 500 },
      's-child-a': { title: '你 是内阁工部尚书…', updatedAt: 900, parentSessionId: 's-lead' },
      's-child-b': { title: '你 是内阁大理寺卿…', updatedAt: 800, parentSessionId: 's-lead', origin: 'subagent' },
      's-child-c': { title: '你 是内阁翰林院编修…', updatedAt: 700, origin: 'subagent' },
      's-other': { title: '另一个顶层会话', updatedAt: 200 },
    },
    projectionsBySession: {},
  };
  const topOnly = client.cabinetSessionChoices(withChildren);
  assert.equal(JSON.stringify(topOnly.map((choice) => choice.id)), JSON.stringify(['s-lead', 's-other']), 'the left column holds only top-level sessions: every subagent row (parentSessionId or origin:subagent) is filtered out, got ' + JSON.stringify(topOnly.map((choice) => choice.id)));
  // 跨 realm 数组不能 deepStrictEqual（VM 内构造的 Array 原型不同），按 JSON 比较。
  assert.equal(JSON.stringify(topOnly.map((choice) => choice.id)), JSON.stringify(['s-lead', 's-other']), 'left-column id set == top-level session set');
  assert.equal(client.defaultCabinetSession(client.cabinetSessionChoices({ ids: [], byId: {} })), '', 'no sessions yields no default');
  // O2 兜底：最新顶层若是刚建的空会话（无成员），默认必须落到最近的有成员会话，
  // 否则右侧是一片空白群聊，用户会以为又坏了。
  const blankNewest = {
    ids: ['s-team-old', 's-blank-new'],
    byId: {
      's-team-old': { title: '有成员的会话', updatedAt: 100 },
      's-blank-new': { title: '刚建的空会话', updatedAt: 9000 },
    },
    projectionsBySession: {
      's-team-old': { values: { agentTeam: { members: [{ name: 'lead', role: 'lead', id: 's-team-old' }, { name: 'works', role: 'teammate', id: 's-mate-old' }, { name: 'censor', role: 'teammate', id: 's-mate-old-2' }], tasks: [] } } },
      's-blank-new': { values: { agentTeam: { members: [], tasks: [] } } },
    },
  };
  const blankChoices = client.cabinetSessionChoices(blankNewest);
  assert.equal(client.defaultCabinetSession(blankChoices), 's-team-old', 'a session with members wins over a newer blank one, got ' + client.defaultCabinetSession(blankChoices));
  // 投影存在但成员为空 == 没有成员（子会话正是这种形状）。
  assert.equal(blankChoices.find((choice) => choice.id === 's-blank-new').hasTeam, true, 'a projection with an empty roster still counts as hasTeam');
  assert.equal(blankChoices.find((choice) => choice.id === 's-blank-new').hasMembers, false, 'a projection with an empty roster is NOT hasMembers');
  // 全都没有成员：不抛异常，退回最近更新者。
  const allBlank = {
    ids: ['s-b1', 's-b2'],
    byId: { 's-b1': { title: '空一', updatedAt: 10 }, 's-b2': { title: '空二', updatedAt: 20 } },
    projectionsBySession: { 's-b1': { values: { agentTeam: { members: [], tasks: [] } } } },
  };
  let allBlankPick = null;
  assert.doesNotThrow(() => { allBlankPick = client.defaultCabinetSession(client.cabinetSessionChoices(allBlank)); }, 'defaulting with no memberful session never throws');
  assert.equal(allBlankPick, 's-b2', 'when nobody has members the most recently updated session still wins, got ' + String(allBlankPick));
  // 「只有 lead 自己在 members 里」不算有阁臣 —— 正是这个误判让默认选中退化。
  const leadOnly = {
    ids: ['s-lead-only'],
    byId: { 's-lead-only': { title: '只有首辅', updatedAt: 500 } },
    projectionsBySession: { 's-lead-only': { values: { agentTeam: { members: [{ name: 'lead', role: 'lead', id: 's-lead-only' }], tasks: [] } } } },
  };
  const leadOnlyChoice = client.cabinetSessionChoices(leadOnly)[0];
  assert.equal(leadOnlyChoice.hasTeam, true, 'a lead-only session still carries an agentTeam projection');
  assert.equal(leadOnlyChoice.hasMembers, false, 'the lead itself is in members, so a lead-only roster is NOT hasMembers (this exact miss made the default fall back to "newest")');
  // 首辅要求的实证 fixture：最新会话只有 lead，次新会话含 lead + 两名阁臣 → 默认落次新。
  const newestLeadOnly = {
    ids: ['s-mates', 's-lead-newest'],
    byId: {
      's-mates': { title: '有阁臣的会话', updatedAt: 100 },
      's-lead-newest': { title: '最新但只有首辅', updatedAt: 9000 },
    },
    projectionsBySession: {
      's-mates': { values: { agentTeam: { members: [{ name: 'lead', role: 'lead', id: 's-mates' }, { name: 'gongbu', role: 'teammate', id: 's-m1' }, { name: 'dalisi', role: 'teammate', id: 's-m2' }], tasks: [] } } },
      's-lead-newest': { values: { agentTeam: { members: [{ name: 'lead', role: 'lead', id: 's-lead-newest' }], tasks: [] } } },
    },
  };
  const newestChoices = client.cabinetSessionChoices(newestLeadOnly);
  assert.equal(client.defaultCabinetSession(newestChoices), 's-mates', 'the newest session with only a lead loses to an older session that has ministers, got ' + client.defaultCabinetSession(newestChoices));
  // 所有会话都只有 lead：不抛，退回最近更新者。
  const allLeadOnly = {
    ids: ['s-lo-1', 's-lo-2'],
    byId: { 's-lo-1': { title: '只有首辅一', updatedAt: 10 }, 's-lo-2': { title: '只有首辅二', updatedAt: 20 } },
    projectionsBySession: {
      's-lo-1': { values: { agentTeam: { members: [{ name: 'lead', role: 'lead', id: 's-lo-1' }], tasks: [] } } },
      's-lo-2': { values: { agentTeam: { members: [{ name: 'lead', role: 'lead', id: 's-lo-2' }], tasks: [] } } },
    },
  };
  let allLeadPick = null;
  assert.doesNotThrow(() => { allLeadPick = client.defaultCabinetSession(client.cabinetSessionChoices(allLeadOnly)); }, 'defaulting when every session is lead-only never throws');
  assert.equal(allLeadPick, 's-lo-2', 'when no session has ministers the newest one still wins, got ' + String(allLeadPick));
  // ---- 左列按 Workspace 分组（用户拍板；口径对齐宿主原生侧栏）----
  const wsList = {
    ids: ['s-w1-old', 's-w1-new', 's-w2', 's-loose'],
    byId: {
      's-w1-old': { title: '一区旧会话', updatedAt: ageOf(100) },
      's-w1-new': { title: '一区新会话', updatedAt: ageOf(500) },
      's-w2': { title: '二区会话', updatedAt: ageOf(300) },
      's-loose': { title: '无归属会话', updatedAt: ageOf(900) },
    },
    // 每个会话都要有 lead 之外的阁臣，否则会被左列准入（A 条件）全部滤掉。
    projectionsBySession: {
      's-w1-old': { values: { agentTeam: { members: [{ name: 'lead', role: 'lead', id: 's-w1-old' }, { name: 'works', role: 'mate', id: 'm-w1' }], tasks: [] } } },
      's-w1-new': { values: { agentTeam: { members: [{ name: 'lead', role: 'lead', id: 's-w1-new' }, { name: 'works', role: 'mate', id: 'm-w1' }], tasks: [] } } },
      's-w2': { values: { agentTeam: { members: [{ name: 'lead', role: 'lead', id: 's-w2' }, { name: 'works', role: 'mate', id: 'm-w2' }], tasks: [] } } },
      's-loose': { values: { agentTeam: { members: [{ name: 'lead', role: 'lead', id: 's-loose' }, { name: 'works', role: 'mate', id: 'm-loose' }], tasks: [] } } },
    },
  };
  const wsSnapshot = {
    items: [
      { workspaceId: 'ws-1', path: '/tmp/one', title: '工作区一', sessionIds: ['s-w1-old', 's-w1-new', 's-child'], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
      { workspaceId: 'ws-2', path: '/tmp/two', title: '工作区二', sessionIds: ['s-w2'], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
      { workspaceId: 'ws-empty', path: '/tmp/empty', title: '空工作区', sessionIds: ['s-not-visible'], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
    ],
    archivedSessionIds: [],
    pinnedSessionIds: [],
    state: 'idle',
    phase: 'ready',
    error: null,
  };
  const wsChoices = client.cabinetSessionChoices(wsList);
  const wsGroups = client.cabinetSessionGroups(wsChoices, wsSnapshot, client.zh['conversation.all']);
  // 组顺序 = 宿主 items 顺序；空工作区（无可见顶层会话）不占位。
  assert.equal(JSON.stringify(wsGroups.map((group) => group.key)), JSON.stringify(['ws-1', 'ws-2', '']), 'groups follow the host workspace order and skip empty workspaces, got ' + JSON.stringify(wsGroups.map((group) => group.key)));
  assert.equal(wsGroups[0].title, '工作区一', 'a group is titled by the workspace title');
  assert.equal(JSON.stringify(wsGroups[0].sessions.map((choice) => choice.id)), JSON.stringify(['s-w1-new', 's-w1-old']), 'sessions inside a group sort by updatedAt descending, got ' + JSON.stringify(wsGroups[0].sessions.map((choice) => choice.id)));
  assert.equal(wsGroups[2].ungrouped, true, 'sessions outside every workspace land in the ungrouped bucket');
  assert.equal(wsGroups[2].title, '未分组', 'the ungrouped bucket is titled by the reused locale key');
  assert.equal(JSON.stringify(wsGroups[2].sessions.map((choice) => choice.id)), JSON.stringify(['s-loose']), 'only the loose session is ungrouped');
  const allGrouped = wsGroups.flatMap((group) => group.sessions.map((choice) => choice.id));
  assert.equal(allGrouped.length, new Set(allGrouped).size, 'no session appears in two groups, got ' + JSON.stringify(allGrouped));
  assert.equal(JSON.stringify(allGrouped.slice().sort()), JSON.stringify(wsChoices.map((choice) => choice.id).sort()), 'every top-level session appears exactly once across groups');
  assert.doesNotThrow(() => client.cabinetSessionGroups(wsChoices, null, '未分组'), 'grouping without a workspace snapshot never throws');
  // ---- 归档过滤（会话级：WorkspaceSnapshot.archivedSessionIds）----
  // 归档会话不得出现在任何组（含兜底组）；归档导致组为空则整组不渲染。
  const archivedSnapshot = {
    items: wsSnapshot.items,
    archivedSessionIds: ['s-w1-new', 's-w2', 's-loose'],
    pinnedSessionIds: [],
    state: 'idle',
    phase: 'ready',
    error: null,
  };
  const archivedGroups = client.cabinetSessionGroups(wsChoices, archivedSnapshot, '未分组');
  const archivedRendered = archivedGroups.flatMap((group) => group.sessions.map((choice) => choice.id));
  assert.ok(!archivedRendered.includes('s-w1-new'), 'an archived session never appears in its workspace group, got ' + JSON.stringify(archivedRendered));
  assert.ok(!archivedRendered.includes('s-w2'), 'an archived session never appears in its workspace group (second one)');
  assert.ok(!archivedRendered.includes('s-loose'), 'an archived session never appears in the ungrouped bucket either');
  assert.equal(JSON.stringify(archivedGroups.map((group) => group.key)), JSON.stringify(['ws-1']), 'a workspace whose sessions are all archived renders no section, got ' + JSON.stringify(archivedGroups.map((group) => group.key)));
  assert.equal(JSON.stringify(archivedGroups[0].sessions.map((choice) => choice.id)), JSON.stringify(['s-w1-old']), 'the surviving session stays in its group');
  // 兜底组全是归档 → 兜底组不渲染。
  const onlyLooseArchived = {
    items: [wsSnapshot.items[0]],
    archivedSessionIds: ['s-loose', 's-w2'],
    pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  };
  const noBucket = client.cabinetSessionGroups(wsChoices, onlyLooseArchived, '未分组');
  assert.equal(JSON.stringify(noBucket.map((group) => group.key)), JSON.stringify(['ws-1']), 'an all-archived ungrouped bucket renders no section, got ' + JSON.stringify(noBucket.map((group) => group.key)));
  // 归档集为空时不过滤（服务缺席时的等价语义由下一条断言覆盖）。
  const emptyArchive = client.cabinetSessionGroups(wsChoices, { items: wsSnapshot.items, archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null }, '未分组');
  assert.equal(emptyArchive.flatMap((group) => group.sessions).length, wsChoices.length, 'an empty archive set filters nothing');


  assert.equal(client.cabinetSessionGroups(wsChoices, null, '未分组').length, 1, 'without a snapshot every session lands in the single ungrouped group');

  // ---- 左列准入四条件（A 有阁臣 / B 非空白 / C 非子会话非归档 / D 30 天内）----
  const FILTER_NOW = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const mate = (id) => ({ name: 'lead', role: 'lead', id: id + '-lead' });
  const filterList = {
    ids: ['s-ok', 's-noteam', 's-blank', 's-old', 's-child', 's-archived'],
    byId: {
      's-ok': { title: '完全合格', updatedAt: FILTER_NOW - 1000 },
      's-noteam': { title: '没有阁臣', updatedAt: FILTER_NOW - 1000 },
      's-blank': { title: '空白会话', updatedAt: FILTER_NOW - 1000, blank: true },
      's-old': { title: '31 天前', updatedAt: FILTER_NOW - 31 * DAY_MS },
      's-child': { title: '子会话', updatedAt: FILTER_NOW - 1000, parentSessionId: 's-ok' },
      's-archived': { title: '已归档', updatedAt: FILTER_NOW - 1000 },
    },
    projectionsBySession: {
      's-ok': { values: { agentTeam: { members: [mate('s-ok'), { name: 'works', role: 'teammate', id: 'm-ok' }], tasks: [] } } },
      's-blank': { values: { agentTeam: { members: [mate('s-blank'), { name: 'works', role: 'teammate', id: 'm-blank' }], tasks: [] } } },
      's-old': { values: { agentTeam: { members: [mate('s-old'), { name: 'works', role: 'teammate', id: 'm-old' }], tasks: [] } } },
      's-archived': { values: { agentTeam: { members: [mate('s-archived'), { name: 'works', role: 'teammate', id: 'm-arch' }], tasks: [] } } },
    },
  };
  const filterSnapshot = { items: [], archivedSessionIds: ['s-archived'], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null };
  const eligible = client.cabinetSessionFilters(client.cabinetSessionChoices(filterList), filterSnapshot, FILTER_NOW);
  assert.equal(JSON.stringify(eligible.map((choice) => choice.id)), JSON.stringify(['s-ok']), 'only the fully eligible session survives all four filters, got ' + JSON.stringify(eligible.map((choice) => choice.id)));
  assert.ok(!eligible.some((choice) => choice.id === 's-noteam'), 'A: a session with no minister besides the Lead is filtered out');
  assert.ok(!eligible.some((choice) => choice.id === 's-blank'), 'B: a blank session (SessionSummary.blank) is filtered out');
  assert.ok(!eligible.some((choice) => choice.id === 's-old'), 'D: a session whose last update is older than the 30-day window is filtered out');
  assert.ok(!eligible.some((choice) => choice.id === 's-child'), 'C: a sub-session never reaches the list');
  assert.ok(!eligible.some((choice) => choice.id === 's-archived'), 'C: an archived session never reaches the list');
  // 29 天前的会话仍然合格（阈值边界）。
  const almostOld = client.cabinetSessionFilters(client.cabinetSessionChoices({ ids: ['s-29'], byId: { 's-29': { title: '29 天前', updatedAt: FILTER_NOW - 29 * DAY_MS } }, projectionsBySession: { 's-29': { values: { agentTeam: { members: [mate('s-29'), { name: 'works', role: 'teammate', id: 'm-29' }], tasks: [] } } } } }), null, FILTER_NOW);
  assert.equal(almostOld.length, 1, '29 days is still inside the 30-day window');
  // 服务缺席（无快照）：不做归档过滤，其余三条照旧。
  const noSnapshotEligible = client.cabinetSessionFilters(client.cabinetSessionChoices(filterList), null, FILTER_NOW);
  assert.ok(noSnapshotEligible.some((choice) => choice.id === 's-archived'), 'without a workspace snapshot the archive filter does not run');

  // 列表排序不受默认规则影响：仍按 updatedAt 倒序（空会话排在前面）。
  const blankOrder = client.cabinetSessionChoices(blankNewest).slice().sort((a, b) => (b.updatedAt - a.updatedAt) || (a.id < b.id ? -1 : 1)).map((choice) => choice.id);
  assert.equal(JSON.stringify(blankOrder), JSON.stringify(['s-blank-new', 's-team-old']), 'the list order stays newest-first even though the default is a memberful session, got ' + JSON.stringify(blankOrder));
  persistentRefs = { cursor: 0, slots: [] };
  resetHookCursor();
  const pageProps = { useSessions: (select) => select(sessionList), useSessionStatus: (select) => select(new Map()), t: (key) => client.zh[key] || key };
  const page = elements(client.CabinetPage(pageProps));
  const selectNode = page.find((node) => node.props?.['data-cabinet-page-session'] !== undefined);
  assert.ok(selectNode, 'the page carries its own session picker');
  assert.equal(selectNode.props.value, 's-lead', 'the picker defaults to the newest session that has members');
  const leadOption = page.find((node) => node.type === 'option' && node.props?.value === 's-lead');
  assert.ok(leadOption && JSON.stringify(leadOption).includes('首辅会话'), 'the lead session option is labelled');
  assert.ok(page.some((node) => node.props?.['data-cabinet-page-side'] !== undefined), 'the page renders its settings column');
  assert.ok(page.some((node) => node.props?.['data-cabinet-page-main'] !== undefined), 'the page renders its main column');
  const settingsEntry = page.find((node) => node.props?.['data-cabinet-conversation-settings'] !== undefined);
  // 2) 设置入口在左列顶部吸顶（会话多时不用滚到底），且 DOM 顺序在列表之前。
  assert.equal(settingsEntry.props.style.position, 'sticky', 'the settings entry is sticky so it stays visible, got ' + JSON.stringify(settingsEntry.props.style.position));

  assert.equal(settingsEntry.props.style.top, 0, 'it sticks to the top of the left column');
  const entryAt = page.findIndex((node) => node.props?.['data-cabinet-conversation-settings'] !== undefined);
  const listAt = page.findIndex((node) => node.props?.['data-cabinet-conversations'] !== undefined);
  assert.ok(entryAt >= 0 && listAt >= 0 && entryAt < listAt, 'the settings entry comes before the conversation list in DOM order, got entry@' + entryAt + ' list@' + listAt);
  assert.ok(settingsEntry, 'the page folds member settings into one left-column entry');
  const settingsColumn = page.find((node) => node.props?.['data-cabinet-page-settings'] !== undefined);
  const listColumn = page.find((node) => node.props?.['data-cabinet-page-list'] !== undefined);
  assert.equal(settingsColumn.props.style.display, 'none', 'member settings do not occupy the left column by default');
  assert.equal(listColumn.props.style.display, 'flex', 'the conversation list owns the left column by default');
  settingsEntry.props.onClick();
  resetHookCursor();
  const settingsOpen = elements(client.CabinetPage(pageProps));
  assert.ok(settingsOpen.some((node) => node.props?.['data-cabinet-settings-tab'] === 'members'), 'the entry opens the member settings inside the page');
  assert.equal(settingsOpen.find((node) => node.props?.['data-cabinet-page-settings'] !== undefined).props.style.display, 'flex', 'opening the entry swaps the left column to settings');
  assert.equal(settingsOpen.find((node) => node.props?.['data-cabinet-page-list'] !== undefined).props.style.display, 'none', 'the conversation list steps aside while settings are open');
  const closeSettings = settingsOpen.find((node) => node.props?.['data-cabinet-settings-close'] !== undefined);
  assert.ok(closeSettings, 'the settings view carries a close control');
  closeSettings.props.onClick();
  resetHookCursor();
  const closedAgain = elements(client.CabinetPage(pageProps));
  assert.equal(closedAgain.find((node) => node.props?.['data-cabinet-page-list'] !== undefined).props.style.display, 'flex', 'closing settings returns to the conversation list');
  selectNode.props.onChange({ target: { value: 's-new' } });
  resetHookCursor();
  const picked = elements(client.CabinetPage(pageProps));
  assert.equal(picked.find((node) => node.props?.['data-cabinet-page-session'] !== undefined).props.value, 's-new', 'a manual pick is remembered in session-local state');
  persistentRefs = null;

  // 第七批 B/C：成员消息全部可见 + 气泡配色与间距。
  {
    const tt = (key) => client.zh[key] || key;
    const eventText = (text, time) => [{ type: 'event', event: { type: 'assistant/message', seq: 1, time, data: { message: { role: 'assistant', content: [{ type: 'text', text }] } } } }];
    // 四个成员各一条 durable 消息：合并流里必须都能看到。
    const four = ['lead', 'hanlin', 'gongbu', 'dalisi'].map((name, index) => ({
      name,
      rows: client.groupChatFold(eventText(name + ' 发言', 1000 + index)).rows,
    }));
    const merged = client.mergeGroupChat(four.flatMap((entry) => entry.rows));
    assert.equal(merged.length, 4, 'four members fold into four rows, got ' + merged.length);
    for (const entry of four) {
      assert.ok(merged.some((row) => row.text.includes(entry.name + ' 发言')), entry.name + ' keeps its message in the merged stream');
    }
    // scope 过滤（页面传空 focus 时=合并流；按 id/名字兜底，绝不误吞行）。
    const scopeFixture = [
      { kind: 'assistant', text: 'a', memberName: 'works', member: { id: 'm-works' } },
      { kind: 'assistant', text: 'b', memberName: 'lead', member: { id: 's-lead' } },
      { kind: 'assistant', text: 'c', memberName: 'gongbu' },
      { kind: 'user', text: 'mine' }
    ];
    assert.equal(JSON.stringify(client.cabinetScopeRows(scopeFixture, 'm-works', 's-lead').map((row) => row.text)), JSON.stringify(['a']), 'a member conversation shows only that member rows');
    assert.equal(JSON.stringify(client.cabinetScopeRows(scopeFixture, 's-lead', 's-lead').map((row) => row.text)), JSON.stringify(['b', 'mine']), 'the Lead conversation owns the user line too');
    assert.equal(JSON.stringify(client.cabinetScopeRows(scopeFixture, 'gongbu-id', 's-lead', 'gongbu').map((row) => row.text)), JSON.stringify(['c']), 'a row without a member object falls back to its member name instead of being dropped');
    assert.equal(client.cabinetScopeRows(scopeFixture, '', 's-lead').length, 4, '全部/群聊 keeps the merged stream intact');
    // D2：等待中行也受同一套 focus 过滤（选中单成员时不冒出别人的等待行）。
    const pendingFixture = [
      { kind: 'pending', text: '等待 works', memberName: 'works', member: { id: 'm-works' } },
      { kind: 'pending', text: '等待 gongbu', memberName: 'gongbu', member: { id: 'm-gongbu' } }
    ];
    assert.equal(JSON.stringify(client.cabinetScopeRows(pendingFixture, 'm-works', 's-lead', 'works').map((row) => row.member.id)), JSON.stringify(['m-works']), 'a pending row follows the same focus filter as ordinary rows');
    assert.equal(client.cabinetScopeRows(pendingFixture, '', 's-lead', '').length, 2, '全部/群聊 still shows every pending row');

    // A) 真实形状 fixture：首辅 + 两阁臣，各自 assistant/message（source.kind='model'）
    // 与 user/message，逐成员喂 groupChatFold → mergeGroupChat → cabinetScopeRows，
    // 断言该会话 agentTeam 的每个成员都至少有一条消息进流（用户可见性红线）。
    const realMemberIds = ['ses-lead', 'ses-hanlin', 'ses-gongbu'];
    const memberEvent = (sid, seq, text) => ([
      { event: { type: 'assistant/message', seq, time: 1000 + seq, data: { attemptId: sid, message: { role: 'assistant', content: [{ type: 'text', text }] }, source: { kind: 'model' } } } }
    ]);
    const perMember = realMemberIds.map((sid, index) => {
      const fold = client.groupChatFold(memberEvent(sid, index + 1, sid + ' 的回复'));
      return { member: { id: sid, name: index === 0 ? 'lead' : ('mate-' + index) }, fold };
    });
    const realTeamMembers = perMember.map((entry) => entry.member);
    const realMerged = client.mergeGroupChat(perMember.flatMap((entry) => entry.fold.rows.map((row) => ({ ...row, member: entry.member }))));
    assert.equal(realMerged.length, realMemberIds.length, 'every roster member contributes at least one row to the merged group chat, got ' + realMerged.length);
    for (const id of realMemberIds) {
      assert.ok(realMerged.some((row) => row.member && row.member.id === id), 'member ' + id + ' has at least one message in the merged stream');
    }
    assert.equal(client.cabinetScopeRows(realMerged, '', 'ses-lead').length, realTeamMembers.length, 'with no focus the merged stream keeps every member row');
    // 成员 assistant/message 的 source.kind 实际是 'model'（真实日志实测），
    // groupChatFold 不得因 kind 判定把成员消息当注入行丢掉。
    assert.ok(realMerged.every((row) => typeof row.text === 'string' && row.text !== ''), 'member assistant text survives the kind filter');
    // 成员通道状态：ok / pending / error 一个都不许缺，缺通道的不静默消失。
    const states = client.cabinetGroupMemberStates(
      [{ id: 'a', name: 'lead' }, { id: 'b', name: 'hanlin' }, { id: 'c', name: 'gongbu' }, { id: 'd', name: 'dalisi' }],
      (id) => (id === 'a' ? { fold: { rows: [] }, error: null } : id === 'b' ? { fold: null, error: null } : id === 'c' ? { fold: null, error: 'boom' } : undefined)
    );
    assert.equal(JSON.stringify(states.map((entry) => entry.id + ':' + entry.state)), JSON.stringify(['a:ok', 'b:pending', 'c:error', 'd:pending']), 'every in-register member carries an explicit channel state');
    assert.ok(source.includes('data-cabinet-groupchat-members') && source.includes("kind: 'pending'"), 'the panel exposes the per-member state and renders 等待中 rows for members without a window');
    assert.ok(String(client.zh['groupchat.pending']).includes('等待中'), 'the pending row text says the member session is still loading');
    // C) 样式：主题成对配色、首尾 margin 归零、工具行紧凑单行。
    const css = Array.isArray(client.STYLE_CSS) ? client.STYLE_CSS.join('\n') : String(client.STYLE_CSS || '');
    assert.ok(/\.cabinet-bubble-body > :first-child\{margin-top:0 !important\}/.test(css), 'the first block inside a bubble loses its top margin');
    assert.ok(/\.cabinet-bubble-body > :last-child\{margin-bottom:0 !important\}/.test(css), 'the last block inside a bubble loses its bottom margin');
    assert.ok(/\.cabinet-bubble-body p\{margin:0 !important\}/.test(css), 'markdown paragraphs carry no vertical margin inside a bubble');
    // 嵌套层首末 margin 也要清（宿主 MarkdownText 把段落包在它自己的容器里）。
    assert.ok(/\.cabinet-bubble-body > \* > :first-child\{margin-top:0 !important\}/.test(css), 'the first block of a nested markdown wrapper loses its top margin too');
    assert.ok(/\.cabinet-bubble-body > \* > :last-child\{margin-bottom:0 !important\}/.test(css), 'the last block of a nested markdown wrapper loses its bottom margin too');
    assert.ok(!/\.cabinet-tool-line\{[^}]*height:18px/.test(css), 'the tool line no longer pins a fixed 18px height');
    assert.ok(/\.cabinet-tool-line\{[^}]*height:auto/.test(css), 'the tool line height follows its content');
    // D2：空段落 / 空 div 不许占高度（空白带的可回归形态）。
    assert.ok(/\.cabinet-bubble-body p:empty\{display:none\}/.test(css) || /\.cabinet-bubble-body p:empty,[^{]*\{display:none\}/.test(css), 'an empty paragraph inside a bubble is not rendered at all');
    assert.ok(/\.cabinet-bubble-body > div:empty\{display:none\}/.test(css) || /\.cabinet-bubble-body[^{]*div:empty[^{]*\{display:none\}/.test(css), 'an empty div inside a bubble is not rendered at all');
    assert.ok(/\.cabinet-chat-bubble\.cabinet-chat-other\{[^}]*color:var\(--dsw-alias-label-primary/.test(css), 'the light bubble uses the theme label colour');
    assert.ok(/\.cabinet-chat-bubble\.cabinet-chat-self\{[^}]*light-dark\(#95EC69, #2c5a2f\)[^}]*light-dark\(#0f1115, #eaf6e8\)/.test(css), 'the self bubble pairs its background and text colours in both schemes');
    // D1 增强：插件用到的每个 --dsw-* 变量都必须在宿主产物里真实存在（读装机前端）。
    // 环境自适应（不删断言）：本机装有资产 → 逐个严格核对（本地保护价值不变）；
    // CI 等无资产环境 → 显式打一行 SKIP，绝不静默通过。DSH_TEST_HOST_ASSETS=absent
    // 可短路探测路径，用于模拟无资产环境的自测。
    const hostDirs = process.env.DSH_TEST_HOST_ASSETS === 'absent'
      ? []
      : [
          '/var/opt/node24/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets',
          process.env.HOME + '/.dsh/profiles/web/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets',
        ];
    const hostFiles = [];
    for (const dir of hostDirs) {
      if (!existsSync(dir)) continue;
      // 目录存在就必须能读：读失败直接抛（响亮失败，不用 catch 吞掉）。
      for (const file of readdirSync(dir)) {
        if (/^index-.*\.(css|js)$/.test(file)) {
          const text = readFileSync(dir + '/' + file, 'utf8');
          if (text.length > 0) hostFiles.push(text);
        }
      }
    }
    const hostText = hostFiles.join('');
    const pluginVars = Array.from(new Set((source.match(/--dsw-[a-z0-9-]+/g) || [])));
    assert.ok(pluginVars.length >= 4, 'the plugin names its theme variables');
    if (hostText.length > 0) {
      // 有资产才要求可读量与逐变量命中——断言本体一字未删。
      assert.ok(hostText.length > 1000, 'the installed frontend assets are readable for the variable check');
      const missingVars = pluginVars.filter((name) => !hostText.includes(name + ':') && !hostText.includes(name + ',') && !hostText.includes(name + ')'));
      assert.equal(missingVars.length, 0, 'every --dsw-* variable the plugin uses exists in the installed frontend, missing: ' + JSON.stringify(missingVars));
      console.log('OK host variable cross-check: ' + pluginVars.length + ' --dsw-* names verified against ' + hostFiles.length + ' installed asset file(s), ' + hostText.length + ' bytes read');
    } else {
      console.log('SKIP host variable cross-check: installed frontend assets are not present on this machine (hostDirs=' + JSON.stringify(hostDirs) + '), --dsw-* names were NOT verified here');
    }
    for (const ghost of ['--dsw-alias-bg-l2', '--dsw-alias-bubble-self', '--dsw-alias-bubble-self-ink', '--dsw-alias-label-link']) {
      assert.ok(!source.includes(ghost), ghost + ' (invented in an earlier batch) must not come back');
    }
    assert.ok(/var\(--dsw-alias-bg-layer-1, light-dark\(#ffffff, #26292d\)\)/.test(css), 'the other bubble uses the real bg-layer-1 token with a paired fallback');
// 1) 原生 select/option 必须成对配色 —— 插件内**所有** select 走同一套 token。
//    根因（真机白底浅字）：select 的 background:'transparent' 让原生弹层退回
//    UA 白底，文字仍是主题浅色。这里既断言共用样式的定义，也断言渲染出来的
//    每个 select/option 节点都带成对背景与字色，且不再出现 transparent。
const selectStyleBlock = source.slice(source.indexOf('const CABINET_SELECT_STYLE ='), source.indexOf('const CABINET_OPTION_STYLE ='));
const optionStyleBlock = source.slice(source.indexOf('const CABINET_OPTION_STYLE ='), source.indexOf('const CABINET_OPTION_STYLE =') + 400);
for (const [label, block] of [['select', selectStyleBlock], ['option', optionStyleBlock]]) {
  assert.ok(/background:\s*'var\(--dsw-alias-bg-layer-1, light-dark\(#ffffff, #26292d\)\)'/.test(block), 'the shared ' + label + ' style sets a themed background');
  assert.ok(/color:\s*'var\(--dsw-alias-label-primary, light-dark\(#0f1115, #f9fafb\)\)'/.test(block), 'the shared ' + label + ' style sets a themed text colour');
  assert.ok(/colorScheme:\s*'light dark'/.test(block), 'the shared ' + label + ' style also opts into the page color-scheme, so Chromium paints the popup for the right theme');
}
// 两处 select 复用同一个对象（不是复制一份）。
assert.equal((source.match(/style:\s*\{\s*\.\.\.CABINET_SELECT_STYLE/g) || []).length, 2, 'both selects spread the one shared style object');
// 每个 option 都用共用样式（会话下拉 1 个 + 模型下拉 3 个），且没有遗留的局部样式名。
assert.ok((source.match(/style:\s*CABINET_OPTION_STYLE/g) || []).length >= 4, 'every option uses the one shared option style, got ' + (source.match(/style:\s*CABINET_OPTION_STYLE/g) || []).length);
assert.equal((source.match(/style:\s*optionStyle/g) || []).length, 0, 'no leftover local optionStyle remains');
// 源码层面：任何 select 都不许再用 transparent 背景（这正是本次根因）。
assert.ok(!/h\('select'[\s\S]{0,400}?background:\s*'transparent'/.test(source), 'no select falls back to a transparent background');
assert.ok(!/background:\s*'(#fff|white)'/.test(source), 'no bare white background is hardcoded anywhere in the source');

    assert.ok(!/background:[^;,}]*\b#fff\b/i.test(css) && !/background:[^;,}]*#ffffff\b(?!\s*,)/i.test(css), 'no bubble/panel background falls back to a bare white');
    for (const rule of ['.cabinet-chat-bubble.cabinet-chat-self{', '.cabinet-chat-bubble.cabinet-chat-other{', '.cabinet-tool-line{']) {
      const at = css.indexOf(rule);
      assert.ok(at >= 0, rule + ' exists');
      const body = css.slice(at, css.indexOf('}', at) + 1);
      assert.ok(/background:[^;}]*light-dark\(/i.test(body), rule + ' pairs its background in both schemes');
      if (rule !== '.cabinet-tool-line{') assert.ok(/color:[^;}]*light-dark\(|color:var\(--dsw-alias-label-primary/i.test(body), rule + ' pairs its text colour');
    }
    const styledRow = elements(client.GroupChatRow({ row: { kind: 'assistant', text: '带工具', time: 1, seq: 1, tools: [{ name: 'read', args: 'a.js' }] }, member: { name: 'works', id: 'm-works' }, t: tt }));
    const toolButton = styledRow.find((node) => node.props?.['data-cabinet-groupchat-tools'] !== undefined);
    assert.equal(toolButton.props['data-cabinet-tool-compact'], '1', 'the tool fold is a compact single-line control');
    assert.equal(toolButton.props.style.height, 18, 'the tool line is 18px tall, not a block');
    assert.equal(toolButton.props.style.whiteSpace, 'nowrap', 'the tool line does not wrap into a block');
    const otherStyled = styledRow.find((node) => node.props?.['data-cabinet-bubble'] === 'other');
    assert.ok(String(otherStyled.props.style.color).includes('label-primary') || String(otherStyled.props.style.color).includes('light-dark'), 'the bubble text colour is explicit, never transparent/inherit');
  }

  // 第六批 A/B：左列会话列表 + 点消息进成员完整会话。
  {
    // 用独立实例渲染整页，避免前序 block 的模块状态/快照串味。
    let pageClient = null;
    // 右栏宽度的测试替身：localStorage（持久化）与 document（拖拽监听挂 document）。
    const railStore = new Map();
    const railStorage = {
      getItem: (key) => (railStore.has(key) ? railStore.get(key) : null),
      setItem: (key, value) => { railStore.set(key, String(value)); },
      removeItem: (key) => { railStore.delete(key); },
    };
    const railDocListeners = { mousemove: [], mouseup: [] };
    const railDocument = {
      body: { style: {} },
      addEventListener: (type, fn) => { if (Array.isArray(railDocListeners[type])) railDocListeners[type].push(fn); },
      removeEventListener: (type, fn) => {
        if (Array.isArray(railDocListeners[type])) railDocListeners[type] = railDocListeners[type].filter((item) => item !== fn);
      },
      // injectStyles 认得 document 后会走这两条路：给静默替身，不真插样式。
      getElementById: () => null,
      createElement: () => ({ id: '', textContent: '', style: {}, append: () => {} }),
      head: { append: () => {} },
    };
    runInNewContext(source.replace(exportPoint, 'return { apply, CabinetPage, GroupChatRow, zh, memberLabel, cabinetScopeRows, openCabinetSession, STYLE_CSS, PANEL, clampRailWidth, parseRailWidth, readRailWidth, persistRailWidth, CABINET_RAIL_DEFAULT_WIDTH, CABINET_RAIL_MIN_WIDTH, CABINET_RAIL_MAX_WIDTH, CABINET_RAIL_WIDTH_KEY };'), {
      window: { __ModuleLoader__: { load: ({ factory }) => {
        pageClient = factory((name) => {
          if (name === '@deepseek-ai/dsh-client-ui-primitives') throw new Error('primitives not seeded');
          assert.equal(name, 'react');
          return React;
        });
      } } },
      console,
      localStorage: railStorage,
      document: railDocument,
    });
    // 状态在 hookStates（useState）里，ref 在 persistentRefs（useRef）里：两者都要清。
    persistentRefs = { cursor: 0, slots: [] };
    hookStates.slots.length = 0;
    hookStates.cursor = 0;
    const teamList = {
      ids: ['s-lead'],
      byId: { 's-lead': { title: '首辅会话', updatedAt: ageOf(50) } },
      projectionsBySession: { 's-lead': { values: { agentTeam: { members: [
        { name: 'lead', role: 'lead', id: 's-lead' },
        { name: 'works', role: 'mate', id: 'm-works' }
      ], tasks: [] } } } }
    };
    const teamProps = { useSessions: (select) => select(teamList), useSessionStatus: (select) => select(new Map()), t: (key) => pageClient.zh[key] || key };
    const items = (tree) => tree.filter((node) => node.props?.['data-cabinet-conversation-item'] !== undefined);
    // 左列默认全折叠（用户要求「不要默认把会话展开」）：这些用例先点开所有组标题，
    // 再按既有语义断言会话项。onClick 用函数式 state 更新，旧树上的节点可连续点。
    const groupsOf = (tree) => tree.filter((node) => node.props?.['data-cabinet-conversation-group'] !== undefined);
    const titlesOf = (tree) => tree.filter((node) => node.props?.['data-cabinet-conversation-group-title'] !== undefined);
    const openAllGroups = (props) => {
      // 每次点开一个仍折叠的组，然后重渲染再取下一个（旧树上的节点只对当次渲染有效）。
      let tree = null;
      for (let round = 0; round < 12; round += 1) {
        resetHookCursor();
        tree = elements(pageClient.CabinetPage(props));
        const collapsedTitle = titlesOf(tree).find((title) => {
          const group = groupsOf(tree).find((node) => node.props['data-cabinet-conversation-group'] === title.props['data-cabinet-conversation-group-title']);
          return group !== undefined && group.props['data-cabinet-conversation-group-collapsed'] === '1';
        });
        if (collapsedTitle === undefined) break;
        collapsedTitle.props.onClick();
      }
      resetHookCursor();
      return elements(pageClient.CabinetPage(props));
    };
    // 原生会话打开通道（uiWorkspace.openSession）由 apply 注入；这里记录调用。
    const openedSessions = [];
    const rightbarCalls = [];
    const sidebarCalls = [];
    const injectLog = [];
    try {
      pageClient.apply({
        effect: (fn) => { try { const cleanup = fn(); return typeof cleanup === 'function' ? cleanup : () => {}; } catch (error) { return () => {}; } },
        locale: { register: () => {}, bind: () => (key) => pageClient.zh[key] || key },
        inject: (names, callback) => {
          injectLog.push(JSON.stringify(names));
          if (Array.isArray(names) && names.includes('uiWorkspace')) callback({ uiWorkspace: { openSession: (target) => openedSessions.push(target) }, effect: (fn) => { fn(); return () => {}; } });
          if (Array.isArray(names) && names.includes('layout')) callback({ layout: { openRightbar: (track, fullscreen) => rightbarCalls.push(['open', track, fullscreen]), closeRightbar: () => rightbarCalls.push(['close']) }, effect: (fn) => { fn(); return () => {}; } });
          if (Array.isArray(names) && names.includes('sidebarRight')) callback({ sidebarRight: { openTab: (kind, options) => sidebarCalls.push(['openTab', kind, options === undefined ? null : JSON.stringify(options)]), active: () => undefined, close: (tabId) => sidebarCalls.push(['close', tabId]) }, effect: (fn) => { fn(); return () => {}; } });
        },
      });
    } catch (error) { /* optional services may be missing in this stub */ }

    // ---- 分栏按钮 → 右栏复用 CabinetPanel 名册视图（第三栏）----
    // 用户口径「直接复用」：容器与开合保留，内容换成 CabinetPanel 的 roster tab；
    // 自绘名册/任务行已删——反向断言 data-cabinet-rail-member/-task 不再存在。
    {
      const railTextOf = (node) => {
        if (typeof node === 'string') return node;
        if (Array.isArray(node)) return node.map(railTextOf).join('');
        if (!node || typeof node !== 'object') return '';
        return (Array.isArray(node.children) ? node.children : []).map(railTextOf).join('');
      };
      const railMembers = [
        { name: 'lead', role: 'lead', id: 's-rail', phase: 'active' },
        { name: 'dalisi-qing', role: 'teammate', id: 'm-a', phase: 'active' },
        { name: 'dalisi-qing2', role: 'teammate', id: 'm-b', phase: 'active' },
      ];
      const railList = {
        ids: ['s-rail'],
        byId: { 's-rail': { title: '内阁右栏测试', updatedAt: ageOf(10) } },
        projectionsBySession: { 's-rail': { values: { agentTeam: { members: railMembers, tasks: [] } } } },
      };
      const railProps = {
        useSessions: (select) => select(railList),
        useSessionStatus: (select) => select(new Map()),
        t: (key) => pageClient.zh[key] || key,
      };
      resetHookCursor();
      const railTree = elements(pageClient.CabinetPage(railProps));
      const railNode = railTree.find((node) => node.props?.['data-cabinet-cabinet-rail'] !== undefined);
      assert.ok(railNode, 'the cabinet rail exists as the third column');
      assert.equal(railNode.props['data-cabinet-rail-open'], '1', 'the rail starts open');
      const splitBtn = railTree.find((node) => node.props?.['data-cabinet-split-toggle'] !== undefined);
      assert.ok(splitBtn, 'the split toggle exists in the page toolbar');
      assert.equal(splitBtn.props['data-cabinet-split-state'], '1', 'the toggle reports the open rail');
      assert.equal(splitBtn.props['aria-pressed'], 'true', 'aria-pressed follows the open state');
      const openGlyph = splitBtn.children.flat().filter((item) => typeof item === 'string').join('');
      assert.equal(openGlyph, '▦', 'the open state shows the filled grid glyph, got ' + openGlyph);
      // 三栏结构：左列/中列钩子保留，主列可收缩且无负边距，右栏定宽带分隔线。
      assert.ok(railTree.find((node) => node.props?.['data-cabinet-page-side'] !== undefined), 'the side column hook survives');
      const mainCol = railTree.find((node) => node.props?.['data-cabinet-page-main'] !== undefined);
      assert.ok(mainCol, 'the main column hook survives');
      assert.equal(mainCol.props.style.minWidth, 0, 'the centre column may shrink beside the rail');
      assert.ok(!JSON.stringify(mainCol.props.style).includes('-'), 'no negative margin tricks in the centre column');
      assert.equal(railNode.props.style.width, 360, 'the rail defaults to 360px (roster grid needs the room); was fixed 288');
      assert.equal(railNode.props.style.flex, 'none', 'the rail never grows');
      assert.ok(railNode.props.style.borderLeft, 'a divider separates the rail from the centre column');
      // 内容 = CabinetPanel roster 视图：名册 tab（hideTabs:false 才有）与名册段文案。
      const rosterTabs = railTree.filter((node) => node.props?.['data-cabinet-panel-tab'] === 'roster');
      assert.equal(rosterTabs.length, 1, 'exactly one roster tab renders (only the rail hides nothing)');
      assert.equal(railTextOf(rosterTabs[0]), pageClient.zh['panel.tab.roster'], 'the tab reads 名册');
      const wholeText = railTree.map(railTextOf).join('');
      assert.ok(wholeText.includes(pageClient.zh['section.roster']), 'the roster section 首辅与阁臣 · 派活与任务 renders');
      // 反向：自绘名册行/任务行已删干净。
      const selfDrawn = railTree.filter((node) => node.props?.['data-cabinet-rail-member'] !== undefined || node.props?.['data-cabinet-rail-task'] !== undefined);
      assert.equal(selfDrawn.length, 0, 'no self-drawn roster/task row survives, got ' + selfDrawn.length);
      // 空会话：右栏只出提示行，不渲染面板。
      const emptyProps = {
        useSessions: (select) => select({ ids: [], byId: {}, projectionsBySession: {} }),
        useSessionStatus: (select) => select(new Map()),
        t: (key) => pageClient.zh[key] || key,
      };
      resetHookCursor();
      const emptyTree = elements(pageClient.CabinetPage(emptyProps));
      const emptyRail = emptyTree.find((node) => node.props?.['data-cabinet-cabinet-rail'] !== undefined);
      assert.ok(emptyRail, 'the rail container still renders without a session');
      const railNote = emptyTree.find((node) => node.props?.['data-cabinet-rail-note'] !== undefined);
      assert.ok(railNote, 'the empty session shows the rail note');
      assert.ok(railTextOf(railNote).includes(pageClient.zh['page.noSession']), 'the note reuses the page.noSession copy');
      assert.equal(emptyTree.filter((node) => node.props?.['data-cabinet-panel-tab'] !== undefined).length, 0, 'no panel renders in the empty rail');
      assert.equal(emptyTree.filter((node) => node.props?.['data-cabinet-groupchat'] !== undefined).length, 0, 'no panel renders in the empty page body either');
      // 点按钮 → 右栏收起：状态/glyph/aria-pressed 跟随，rail 隐藏；再点回到开。
      splitBtn.props.onClick();
      resetHookCursor();
      const closedTree = elements(pageClient.CabinetPage(railProps));
      const closedRail = closedTree.find((node) => node.props?.['data-cabinet-cabinet-rail'] !== undefined);
      assert.equal(closedRail.props['data-cabinet-rail-open'], '0', 'the rail state flips to closed');
      assert.equal(closedRail.props.style.display, 'none', 'the closed rail is hidden');
      const closedBtn = closedTree.find((node) => node.props?.['data-cabinet-split-toggle'] !== undefined);
      assert.equal(closedBtn.props['data-cabinet-split-state'], '0', 'the toggle state follows');
      assert.equal(closedBtn.props['aria-pressed'], 'false', 'aria-pressed follows the closed state');
      const closedGlyph = closedBtn.children.flat().filter((item) => typeof item === 'string').join('');
      assert.equal(closedGlyph, '◫', 'the closed state shows the empty grid glyph, got ' + closedGlyph);
      assert.notEqual(closedGlyph, openGlyph, 'the glyph changes with state');
      closedBtn.props.onClick();
      resetHookCursor();
      const reopenTree = elements(pageClient.CabinetPage(railProps));
      assert.equal(reopenTree.find((node) => node.props?.['data-cabinet-cabinet-rail'] !== undefined).props['data-cabinet-rail-open'], '1', 'toggling again reopens the rail');
      // 反向断言：点击从不触碰宿主原生右栏通道，且插件不再注入它们。
      assert.deepEqual(rightbarCalls, [], 'the toggle never calls openRightbar/closeRightbar, got ' + JSON.stringify(rightbarCalls));
      assert.deepEqual(sidebarCalls, [], 'the toggle never calls sidebarRight.openTab, got ' + JSON.stringify(sidebarCalls));
      assert.ok(!injectLog.some((entry) => entry.includes('"layout"') || entry.includes('"sidebarRight"')), 'the plugin no longer injects the native rightbar services, got ' + JSON.stringify(injectLog));
    }

    // ---- 右栏宽度：常量、限幅/解析纯函数、localStorage 持久化、拖拽手柄 ----
    {
      const WIDTH_KEY = 'dsh-cabinet:rail-width';
      // 常量：默认 360（roster 两列 grid，288 装不下），限幅 [260, 720]，键名固定。
      assert.equal(pageClient.CABINET_RAIL_DEFAULT_WIDTH, 360, 'default width is 360');
      assert.equal(pageClient.CABINET_RAIL_MIN_WIDTH, 260, 'min width is 260');
      assert.equal(pageClient.CABINET_RAIL_MAX_WIDTH, 720, 'max width is 720');
      assert.equal(pageClient.CABINET_RAIL_WIDTH_KEY, WIDTH_KEY, 'storage key is dsh-cabinet:rail-width');
      // clampRailWidth 纯函数单测：越界钳住、合值直通、非数值回默认。
      assert.equal(pageClient.clampRailWidth(100), 260, '100 clamps up to 260');
      assert.equal(pageClient.clampRailWidth(9999), 720, '9999 clamps down to 720');
      assert.equal(pageClient.clampRailWidth(400), 400, '400 stays 400');
      assert.equal(pageClient.clampRailWidth('abc'), 360, 'a non-number falls back to the default');
      // parseRailWidth 纯函数单测：合法值生效、非法/缺失回默认、越界存储值钳住。
      assert.equal(pageClient.parseRailWidth('450'), 450, 'a stored legal width takes effect');
      assert.equal(pageClient.parseRailWidth(null), 360, 'missing storage falls back to default');
      assert.equal(pageClient.parseRailWidth(undefined), 360, 'undefined falls back to default');
      assert.equal(pageClient.parseRailWidth(''), 360, 'empty string falls back to default');
      assert.equal(pageClient.parseRailWidth('abc'), 360, 'garbage falls back to default');
      assert.equal(pageClient.parseRailWidth(' 480 '), 480, 'surrounding whitespace is tolerated');
      assert.equal(pageClient.parseRailWidth('100'), 260, 'an out-of-range stored value clamps, keeping user intent');
      assert.equal(pageClient.parseRailWidth('9999'), 720, 'an over-range stored value clamps too');
      // localStorage 读写（railStorage 替身，键共享 pageClient 沙箱里的 globalThis）。
      railStore.delete(WIDTH_KEY);
      assert.equal(pageClient.readRailWidth(), 360, 'readRailWidth: missing key → default');
      railStore.set(WIDTH_KEY, '450');
      assert.equal(pageClient.readRailWidth(), 450, 'readRailWidth: legal stored value wins');
      railStore.set(WIDTH_KEY, 'abc');
      assert.equal(pageClient.readRailWidth(), 360, 'readRailWidth: illegal stored value → default');
      railStore.delete(WIDTH_KEY);
      assert.equal(pageClient.persistRailWidth(500), true, 'persistRailWidth succeeds with storage available');
      assert.equal(railStore.get(WIDTH_KEY), '500', 'persistRailWidth writes the width');
      pageClient.persistRailWidth(9999);
      assert.equal(railStore.get(WIDTH_KEY), '720', 'persistRailWidth clamps before writing');
      // 渲染层：清槽位强制首渲染重读 storage。
      const widthProps = {
        useSessions: (select) => select({ ids: ['s-w'], byId: { 's-w': { title: '宽度', updatedAt: ageOf(9) } }, projectionsBySession: {} }),
        useSessionStatus: (select) => select(new Map()),
        t: (key) => pageClient.zh[key] || key,
      };
      const railOf = (tree) => tree.find((node) => node.props?.['data-cabinet-cabinet-rail'] !== undefined);
      railStore.delete(WIDTH_KEY);
      hookStates.slots.length = 0;
      resetHookCursor();
      const freshTree = elements(pageClient.CabinetPage(widthProps));
      assert.equal(railOf(freshTree).props.style.width, 360, 'an empty store renders the 360 default');
      const freshHandle = freshTree.find((node) => node.props?.['data-cabinet-rail-handle'] !== undefined);
      assert.ok(freshHandle, 'the drag handle node exists');
      assert.equal(freshHandle.props.style.width, 6, 'the handle is 6px wide');
      assert.equal(freshHandle.props.style.cursor, 'col-resize', 'the handle uses the col-resize cursor');
      assert.equal(typeof freshHandle.props.onMouseDown, 'function', 'the handle has a mousedown handler');
      const railCss = Array.isArray(pageClient.STYLE_CSS) ? pageClient.STYLE_CSS.join('\n') : String(pageClient.STYLE_CSS || '');
      assert.ok(railCss.includes('[data-cabinet-rail-handle]:hover'), 'a hover rule highlights the handle');
      railStore.set(WIDTH_KEY, '450');
      hookStates.slots.length = 0;
      resetHookCursor();
      assert.equal(railOf(elements(pageClient.CabinetPage(widthProps))).props.style.width, 450, 'a stored 450 renders after refresh (slot cleared)');
      railStore.delete(WIDTH_KEY);
      hookStates.slots.length = 0;
      resetHookCursor();
      // 拖拽：mousedown 注册 document 监听 + body 光标；mousemove 改宽；mouseup 解绑+持久化。
      const dragTree = elements(pageClient.CabinetPage(widthProps));
      const dragHandle = dragTree.find((node) => node.props?.['data-cabinet-rail-handle'] !== undefined);
      railDocListeners.mousemove.length = 0;
      railDocListeners.mouseup.length = 0;
      dragHandle.props.onMouseDown({ clientX: 600, preventDefault() {} });
      assert.equal(railDocListeners.mousemove.length, 1, 'mousemove is bound on document (not on the handle)');
      assert.equal(railDocListeners.mouseup.length, 1, 'mouseup is bound on document');
      assert.equal(railDocument.body.style.cursor, 'col-resize', 'body cursor locks during the drag');
      assert.equal(railDocument.body.style.userSelect, 'none', 'body selection is disabled during the drag');
      railDocListeners.mousemove[0]({ clientX: 550 });
      resetHookCursor();
      const draggedTree = elements(pageClient.CabinetPage(widthProps));
      assert.equal(railOf(draggedTree).props.style.width, 410, 'dragging left from the left edge widens: 360 - (550-600) = 410');
      railDocListeners.mouseup[0]();
      assert.equal(railDocListeners.mousemove.length, 0, 'mouseup unbinds mousemove (no dangling listener)');
      assert.equal(railDocListeners.mouseup.length, 0, 'mouseup unbinds mouseup');
      assert.equal(railDocument.body.style.cursor, '', 'body cursor is restored');
      assert.equal(railDocument.body.style.userSelect, '', 'body selection is restored');
      assert.equal(railStore.get(WIDTH_KEY), '410', 'mouseup persists the settled width');
      // 卸载解绑：找到挂 railDragCleanupRef 的 effect，执行其 cleanup 等于组件卸载。
      // 取最后一条登记（与即将渲染的这棵同批闭包）：recordedEffects 跨块累积，首条是旧渲染的旧 ref。
      const unmountEntry = recordedEffects.filter((entry) => String(entry.fn).includes('railDragCleanupRef')).pop();
      assert.ok(unmountEntry, 'the unmount-cleanup effect is registered');
      resetHookCursor();
      const unmountTree = elements(pageClient.CabinetPage(widthProps));
      const unmountHandle = unmountTree.find((node) => node.props?.['data-cabinet-rail-handle'] !== undefined);
      unmountHandle.props.onMouseDown({ clientX: 600, preventDefault() {} });
      assert.equal(railDocListeners.mousemove.length, 1, 'listeners attached before the simulated unmount');
      const unmountCleanup = unmountEntry.fn();
      assert.equal(typeof unmountCleanup, 'function', 'the effect returns a cleanup');
      unmountCleanup();
      assert.equal(railDocListeners.mousemove.length, 0, 'unmount detaches mousemove');
      assert.equal(railDocListeners.mouseup.length, 0, 'unmount detaches mouseup');
      assert.equal(railDocument.body.style.cursor, '', 'unmount restores the body cursor');
      // 反向：整段拖拽从不触碰宿主原生右栏通道。
      assert.deepEqual(rightbarCalls, [], 'dragging never calls openRightbar/closeRightbar, got ' + JSON.stringify(rightbarCalls));
      assert.deepEqual(sidebarCalls, [], 'dragging never calls sidebarRight.openTab, got ' + JSON.stringify(sidebarCalls));
      // 收尾：清 storage、槽位回默认宽 360，保持与前序块一致的落点。
      railStore.delete(WIDTH_KEY);
      hookStates.slots.length = 0;
      resetHookCursor();
      assert.equal(railOf(elements(pageClient.CabinetPage(widthProps))).props.style.width, 360, 'teardown leaves the default width');
    }

    // ---- 名册横向溢出修复：面板根/grid/单元包装的 minWidth、minmax(0,1fr)、光环盒子 ----
    {
      // 面板根（PANEL）是右栏里的 flex 子项又是滚动根：minWidth:0 才不会被内容撑开。
      assert.equal(pageClient.PANEL.minWidth, 0, 'the panel root carries minWidth:0 (flex child must shrink)');
      const overflowProps = {
        useSessions: (select) => select({
          ids: ['s-of'],
          byId: { 's-of': { title: '溢出修复', updatedAt: ageOf(8) } },
          projectionsBySession: { 's-of': { values: { agentTeam: {
            members: [
              { name: 'lead', role: 'lead', id: 's-of', phase: 'active' },
              { name: 'gongbu-shangshu-2', role: 'mate', id: 'm-of', phase: 'active' }
            ],
            tasks: [{ id: 't-of', subject: '一个很长很长很长的任务书标题用来撑宽度验证省略号', status: 'pending', ownerName: 'gongbu-shangshu-2' }]
          } } } }
        }),
        useSessionStatus: (select) => select(new Map()),
        t: (key) => pageClient.zh[key] || key
      };
      hookStates.slots.length = 0;
      resetHookCursor();
      const ofTree = elements(pageClient.CabinetPage(overflowProps));
      const ofRail = ofTree.find((node) => node.props?.['data-cabinet-cabinet-rail'] !== undefined);
      assert.equal(ofRail.props.style.minWidth, 0, 'the rail container keeps minWidth:0');
      assert.equal(ofRail.props.style.overflow, 'hidden', 'the rail container clips instead of stretching');
      const gridNode = ofTree.find((node) => typeof node.props?.style?.gridTemplateColumns === 'string' && node.props.style.gridTemplateColumns.includes('auto-fill'));
      assert.ok(gridNode, 'the roster grid renders with members');
      assert.ok(gridNode.props.style.gridTemplateColumns.includes('auto-fill'), 'the roster grid auto-fills columns by container width, got ' + gridNode.props.style.gridTemplateColumns);
      assert.ok(gridNode.props.style.gridTemplateColumns.includes('minmax(140px'), 'roster grid columns floor at 140px, got ' + gridNode.props.style.gridTemplateColumns);
      const cellNodes = ofTree.filter((node) => node.props?.['data-cabinet-node'] !== undefined);
      assert.ok(cellNodes.length > 0, 'roster grid cells render');
      for (const cell of cellNodes) assert.equal(cell.props.style?.minWidth, 140, 'every grid cell wrapper carries the 140px card floor');
      // 成员名必须单行省略——竖排 = whiteSpace 没锁（御史第15轮实测症状）。
      const nameSpans = ofTree.filter((node) => node.props?.style?.fontSize === 13 && node.props?.style?.fontWeight === 600 && typeof node.props?.title === 'string' && node.props.title.includes('·'));
      assert.ok(nameSpans.length > 0, 'roster member name spans render');
      for (const nameSpan of nameSpans) {
        assert.equal(nameSpan.props.style.whiteSpace, 'nowrap', 'roster member names stay on one line (nowrap), never stacked per character');
        assert.equal(nameSpan.props.style.overflow, 'hidden', 'roster member names clip');
        assert.equal(nameSpan.props.style.textOverflow, 'ellipsis', 'roster member names ellipsize');
      }
      // 群聊气泡的发送者名（同一 memberLabel，窄栏里同样会竖排）也必须单行省略。
      const senderSpans = ofTree.filter((node) => node.props?.style?.fontSize === 11.5 && node.props?.style?.fontWeight === 600 && typeof node.props?.title === 'string' && node.props.title.includes('·'));
      for (const senderSpan of senderSpans) {
        assert.equal(senderSpan.props.style.whiteSpace, 'nowrap', 'chat sender names stay on one line, got ' + senderSpan.props.title);
        assert.equal(senderSpan.props.style.textOverflow, 'ellipsis', 'chat sender names ellipsize, got ' + senderSpan.props.title);
      }
      // Owner 标签（带成员名的长文本）必须可收缩 + 单行省略，否则窄卡内被固有宽度撑破。
      const ownerTags = ofTree.filter((node) => node.props?.style?.fontSize === 10 && typeof node.props?.title === 'string' && node.props.title.includes('·'));
      assert.ok(ownerTags.length > 0, 'the Owner tag carrying a member name renders');
      for (const ownerTag of ownerTags) {
        assert.equal(ownerTag.props.style.minWidth, 0, 'the Owner tag can shrink (minWidth:0)');
        assert.equal(ownerTag.props.style.whiteSpace, 'nowrap', 'the Owner tag stays one line');
        assert.equal(ownerTag.props.style.textOverflow, 'ellipsis', 'the Owner tag ellipsizes');
      }
      const ofCss = Array.isArray(pageClient.STYLE_CSS) ? pageClient.STYLE_CSS.join('\n') : String(pageClient.STYLE_CSS || '');
      // 卡片内部本就允许收缩（配合 140 卡最小宽）。
      assert.ok(ofCss.includes('.cabinet-card{box-sizing:border-box;display:flex;flex-direction:column;gap:4px;min-width:0'), 'the card interior keeps min-width:0 so content can shrink');
      assert.ok(ofCss.includes('.cabinet-avatar-slot{position:relative;display:inline-flex;flex:none;line-height:0;padding:3px;margin:-3px}'), 'the avatar slot box absorbs the 3px live-ring overhang (padding + negative margin)');
      assert.ok(ofCss.includes('cabinet-ring-live::before{content:"";position:absolute;inset:0'), 'the live ring sits inside the padding box so scrollWidth==clientWidth');
      // 反向：本块渲染同样不碰宿主原生右栏通道。
      assert.deepEqual(rightbarCalls, [], 'the overflow fix never calls openRightbar/closeRightbar, got ' + JSON.stringify(rightbarCalls));
      assert.deepEqual(sidebarCalls, [], 'the overflow fix never calls sidebarRight.openTab, got ' + JSON.stringify(sidebarCalls));
      // 收尾：清槽位后用「无成员」的简单布局重渲染，把槽位基线还原成与前序
      // 宽度块收尾同构的残留——后续区块不清槽位直接渲染，会读到本块布局的
      // 残留值（带任务行的布局会让后者的 useMemo 撞上前者的 useState(null)）。
      hookStates.slots.length = 0;
      resetHookCursor();
      elements(pageClient.CabinetPage({
        useSessions: (select) => select({ ids: ['s-of'], byId: { 's-of': { title: '溢出修复', updatedAt: ageOf(8) } }, projectionsBySession: {} }),
        useSessionStatus: (select) => select(new Map()),
        t: (key) => pageClient.zh[key] || key
      }));
    }

    // ---- 联想开关两态：配置项控制，提示词本体两态逐字相同（对齐上游 ed51fb3）----
    // leadBlock 两态由 scripts/test-member-settings.mjs 的 associationLine/sectionText
    // 断言覆盖；这里断言成员提示词层与 client 侧同款开关零改动。
    {
      const offCfg = { associationMode: false, members: [] };
      const onCfg = { associationMode: true, members: [] };
      const tz = { role: 'teammate', name: 'tongzheng' };
      const offText = indexModule.memberBlock(offCfg, tz);
      const onText = indexModule.memberBlock(onCfg, tz);
      assert.equal(onText, offText, 'the association switch leaves the member prompt text identical in both states');
      assert.ok(offText.includes(indexModule.DEFAULT_MEMBER_PROMPTS.tongzheng), 'the factory tongzheng prompt is embedded verbatim (section header aside)');
      assert.ok(offText.includes('去找与旧事、旁证、相邻经验的联系'), 'the duty clause stays verbatim, got: ' + offText.slice(0, 160));
      assert.ok(!offText.includes('联想模式已关闭'), 'no closure sentence is ever injected');
      assert.equal(indexModule.associationLine(offCfg), '', 'association-off renders nothing at all');
      assert.match(indexModule.associationLine(onCfg), /派活通政使/, 'association-on renders the dispatch-enable line');
      // client 侧 configuredPrompt 两态同文（开关不改提示词，只由配置项决定）。
      client.setMemberConfig({ associationMode: false });
      const clientOff = client.configuredPrompt('tongzheng');
      client.setMemberConfig({ associationMode: true });
      const clientOn = client.configuredPrompt('tongzheng');
      assert.equal(clientOn, clientOff, 'the client prompt is identical in both association states');
      assert.ok(clientOff.includes('去找与旧事、旁证、相邻经验的联系'), 'the client prompt keeps the duty clause, got: ' + clientOff.slice(0, 160));
      assert.ok(!clientOff.includes('联想模式已关闭'), 'the client prompt carries no closure sentence');
      client.setMemberConfig(undefined);
    }
    resetHookCursor();
    const collapsedTree0 = elements(pageClient.CabinetPage(teamProps));
    // 默认全折叠：首屏只有组标题与计数，没有任何会话行。
    assert.equal(items(collapsedTree0).length, 0, 'every group starts collapsed, so the left column renders no session row at first, got ' + JSON.stringify(items(collapsedTree0).map((node) => node.props['data-cabinet-conversation-id'])));
    const collapsedBucketTitle = collapsedTree0.find((node) => node.props?.['data-cabinet-conversation-group-title'] === 'ungrouped');
    assert.ok(collapsedBucketTitle, 'the ungrouped bucket still shows its title while collapsed');
    assert.equal(collapsedTree0.find((node) => node.props?.['data-cabinet-conversation-group'] === 'ungrouped').props['data-cabinet-conversation-group-collapsed'], '1', 'the bucket reports the collapsed state');
    // 展开唯一的一组（此处没有 workspace 快照，全部会话都在兜底组）再继续原有断言。
    collapsedBucketTitle.props.onClick();
    resetHookCursor();
    const tree0 = elements(pageClient.CabinetPage(teamProps));
    const itemIds = items(tree0).map((node) => node.props['data-cabinet-conversation-id']);
    assert.equal(JSON.stringify(itemIds), JSON.stringify(['s-lead']), 'the left column is the workspace session list only — no synthetic 全部/群聊 entry, got ' + JSON.stringify(itemIds));
    assert.equal(items(tree0)[0].props['data-cabinet-conversation-selected'], '1', 'the most recently updated session is selected by default');
    assert.ok(items(tree0).some((node) => String(node.props['data-cabinet-conversation-name']).includes('首辅会话')), 'a session row shows its snapshot title');
    assert.ok(tree0.some((node) => node.props?.['data-cabinet-groupchat'] !== undefined), 'the merged group chat is still reachable through the page');
    // 点左列项 = 在本页选中该会话（右侧切到它的群聊），不再跳原生视图。
    openedSessions.length = 0;
    items(tree0).find((node) => node.props['data-cabinet-conversation-id'] === 's-lead').props.onClick();
    assert.deepEqual(openedSessions, [], 'clicking a session row selects it in place instead of navigating away, got ' + JSON.stringify(openedSessions));
    resetHookCursor();
    const tree1 = elements(pageClient.CabinetPage(teamProps));
    assert.equal(items(tree1)[0].props['data-cabinet-conversation-selected'], '1', 'the clicked session stays selected, so its group chat stays on screen');

    // ---- 次级入口：「在原生视图打开」（走 uiWorkspace.openSession 既有通道）----
    {
      const nativeEntry = tree1.find((node) => node.props?.['data-cabinet-open-native'] !== undefined);
      assert.ok(nativeEntry, 'each conversation row carries a native-view entry');
      assert.equal(nativeEntry.props['data-cabinet-open-native'], 's-lead', 'the entry is keyed by its session id');
      assert.equal(nativeEntry.props.title, '在原生视图打开', 'the entry explains what it does');
      // 点入口 → 恰一次 openSession，带该会话 id（与群聊气泡下钻同通道 payload）。
      openedSessions.length = 0;
      nativeEntry.props.onClick();
      assert.deepEqual(openedSessions, ['s-lead'], 'clicking the entry opens the native view for exactly that session');
      // 点入口后选中态不被破坏（入口不改 chosen）。
      resetHookCursor();
      const treeAfterNative = elements(pageClient.CabinetPage(teamProps));
      assert.equal(items(treeAfterNative)[0].props['data-cabinet-conversation-selected'], '1', 'the native-view entry does not disturb the in-page selection');
      // 降级：无 uiWorkspace 服务 → 入口不渲染，行照常（不抛错、不留死按钮）。
      let noOpenerClient = null;
      runInNewContext(source.replace(exportPoint, 'return { apply, CabinetPage, zh };'), {
        window: { __ModuleLoader__: { load: ({ factory }) => {
          noOpenerClient = factory((name) => {
            if (name === '@deepseek-ai/dsh-client-ui-primitives') throw new Error('primitives not seeded');
            return React;
          });
        } } },
        console,
      });
      noOpenerClient.apply({
        effect: (fn) => { try { const cleanup = fn(); return typeof cleanup === 'function' ? cleanup : () => {}; } catch (error) { return () => {}; } },
        locale: { register: () => {}, bind: () => (key) => noOpenerClient.zh[key] || key },
        inject: () => { /* no uiWorkspace: opener stays null */ },
      });
      const expandOnce = (clientInstance, props) => {
        let tree = null;
        for (let round = 0; round < 12; round += 1) {
          resetHookCursor();
          tree = elements(clientInstance.CabinetPage(props));
          const collapsedTitle = tree.find((node) => node.type === 'button' && node.props?.['data-cabinet-conversation-group-title'] !== undefined
            && tree.find((other) => other.props?.['data-cabinet-conversation-group'] === node.props['data-cabinet-conversation-group-title'] && other.props?.['data-cabinet-conversation-group-collapsed'] === '1') !== undefined);
          if (collapsedTitle === undefined) break;
          collapsedTitle.props.onClick();
        }
        resetHookCursor();
        return elements(clientInstance.CabinetPage(props));
      };
      const noOpenerTree = expandOnce(noOpenerClient, teamProps);
      assert.equal(noOpenerTree.find((node) => node.props?.['data-cabinet-conversation-item'] !== undefined) !== undefined, true, 'rows still render without the opener service');
      assert.equal(noOpenerTree.find((node) => node.props?.['data-cabinet-open-native'] !== undefined), undefined, 'the native-view entry is not rendered when no opener service exists');
    }
    // 子会话绝不出现在左列（真实形状：parentSessionId / origin:subagent）。
    const mixedList = {
      ids: ['s-lead', 's-sub-a', 's-sub-b'],
      byId: {
        's-lead': { title: '首辅会话', updatedAt: ageOf(50) },
        's-sub-a': { title: '你 是内阁工部尚书…', updatedAt: ageOf(500), parentSessionId: 's-lead' },
        's-sub-b': { title: '你 是内阁翰林院编修…', updatedAt: ageOf(400), origin: 'subagent' },
      },
      // 顶层会话要有 lead 之外的阁臣，否则会被左列准入（A 条件）滤掉。
      projectionsBySession: { 's-lead': { values: { agentTeam: { members: [{ name: 'lead', role: 'lead', id: 's-lead' }, { name: 'works', role: 'mate', id: 'm-works' }], tasks: [] } } } }
    };
    // 前面的用例改过折叠 state：重置成干净挂载，保证「默认折叠 → 点开」的语义。
    persistentRefs = { cursor: 0, slots: [] };
    hookStates.slots.length = 0;
    hookStates.cursor = 0;
    resetHookCursor();
    const mixedCollapsed = elements(pageClient.CabinetPage({ ...teamProps, useSessions: (select) => select(mixedList) }));

    mixedCollapsed.filter((node) => node.props?.['data-cabinet-conversation-group-title'] !== undefined).forEach((node) => node.props.onClick());
    resetHookCursor();
    const mixedTree = elements(pageClient.CabinetPage({ ...teamProps, useSessions: (select) => select(mixedList) }));
    const mixedIds = items(mixedTree).map((node) => node.props['data-cabinet-conversation-id']);
    assert.equal(JSON.stringify(mixedIds), JSON.stringify(['s-lead']), 'a subagent session never appears in the left column, got ' + JSON.stringify(mixedIds));
    assert.equal(items(mixedTree)[0].props['data-cabinet-conversation-selected'], '1', 'with children filtered out the lead is the only and therefore selected row');
    // 下拉与左列必须共用一个选中状态（真机里左列已选中而下拉仍显示旧会话）。
    const syncList = {
      ids: ['s-a', 's-b'],
      byId: { 's-a': { title: '会话甲', updatedAt: ageOf(100) }, 's-b': { title: '会话乙', updatedAt: ageOf(300) } },
      // 两个会话都要过「有阁臣」准入，否则左列/下拉都是空的。
      projectionsBySession: {
        's-a': { values: { agentTeam: { members: [{ name: 'lead', role: 'lead', id: 's-a' }, { name: 'works', role: 'mate', id: 'm-a' }], tasks: [] } } },
        's-b': { values: { agentTeam: { members: [{ name: 'lead', role: 'lead', id: 's-b' }, { name: 'works', role: 'mate', id: 'm-b' }], tasks: [] } } },
      },
    };
    const syncProps = { ...teamProps, useSessions: (select) => select(syncList) };
    persistentRefs = { cursor: 0, slots: [] };
    hookStates.slots.length = 0;
    hookStates.cursor = 0;
    resetHookCursor();
    const syncCollapsed = elements(pageClient.CabinetPage(syncProps));
    syncCollapsed.filter((node) => node.props?.['data-cabinet-conversation-group-title'] !== undefined).forEach((node) => node.props.onClick());
    resetHookCursor();
    const syncTree0 = elements(pageClient.CabinetPage(syncProps));
    const syncSelect = (tree) => tree.find((node) => node.props?.['data-cabinet-page-session'] !== undefined);
    assert.equal(syncSelect(syncTree0).props.value, 's-b', 'the dropdown starts on the default (newest) session');
  // 顶部会话下拉（真机截图里那个）：select 本体与每个 option 都必须成对配色，
  // 不许再出现 transparent/裸白底（这正是白底浅字的根因）。
  const pickerStyle = syncSelect(syncTree0).props.style;
  assert.ok(String(pickerStyle.background).includes('bg-layer-1'), 'the session picker select carries the themed background, got ' + String(pickerStyle.background));
  assert.ok(String(pickerStyle.color).includes('label-primary'), 'the session picker select carries the themed text colour, got ' + String(pickerStyle.color));
  assert.equal(pickerStyle.colorScheme, 'light dark', 'the session picker select opts into the page color-scheme');
  assert.ok(!String(pickerStyle.background).includes('transparent'), 'the session picker select is not transparent');
  const pickerOptions = syncTree0.filter((node) => node.type === 'option');
  assert.ok(pickerOptions.length >= 2, 'the picker renders its options');
  for (const option of pickerOptions) {
    assert.ok(String(option.props.style?.background).includes('bg-layer-1'), 'every picker option sets the themed background');
    assert.ok(String(option.props.style?.color).includes('label-primary'), 'every picker option sets the themed text colour');
    assert.equal(option.props.style?.colorScheme, 'light dark', 'every picker option opts into the color-scheme too');
  }
  // 模型下拉（成员设置里）同样成对。
  const modelSettingsNodes = mountSettings({ t: (key) => client.zh[key] || key })();
  const modelSelect = modelSettingsNodes.filter((node) => node.type === 'select')[0];
  if (modelSelect !== undefined) {
    assert.ok(String(modelSelect.props.style?.background).includes('bg-layer-1'), 'the model select shares the themed background');
    assert.ok(String(modelSelect.props.style?.color).includes('label-primary'), 'the model select shares the themed text colour');
    assert.equal(modelSelect.props.style?.colorScheme, 'light dark', 'the model select opts into the color-scheme');
    const modelOptions = modelSettingsNodes.filter((node) => node.type === 'option');
    assert.ok(modelOptions.length >= 1, 'the model select renders options');
    for (const option of modelOptions) {
      assert.ok(String(option.props.style?.background).includes('bg-layer-1'), 'every model option sets the themed background');
      assert.ok(String(option.props.style?.color).includes('label-primary'), 'every model option sets the themed text colour');
    }
  }
    // 点左列 → 下拉跟随
    items(syncTree0).find((node) => node.props['data-cabinet-conversation-id'] === 's-a').props.onClick();
    resetHookCursor();
    const syncTree1 = elements(pageClient.CabinetPage(syncProps));
    assert.equal(syncSelect(syncTree1).props.value, 's-a', 'clicking a left-column session moves the dropdown to it, got ' + String(syncSelect(syncTree1).props.value));
    assert.equal(items(syncTree1).find((node) => node.props['data-cabinet-conversation-id'] === 's-a').props['data-cabinet-conversation-selected'], '1', 'the clicked row stays selected');
    // 切下拉 → 左列跟随
    syncSelect(syncTree1).props.onChange({ target: { value: 's-b' } });
    resetHookCursor();
    const syncTree2 = elements(pageClient.CabinetPage(syncProps));
    assert.equal(syncSelect(syncTree2).props.value, 's-b', 'the dropdown keeps its own choice');
    assert.equal(items(syncTree2).find((node) => node.props['data-cabinet-conversation-id'] === 's-b').props['data-cabinet-conversation-selected'], '1', 'changing the dropdown moves the left-column selection to the same session');
    assert.equal(items(syncTree2).find((node) => node.props['data-cabinet-conversation-id'] === 's-a').props['data-cabinet-conversation-selected'], '0', 'the previously selected row is deselected');
    // 左列分组渲染：每组一个标题节点 + 组内会话项；组顺序 = 宿主 items 顺序。
    const groupProps = { ...teamProps, useSessions: (select) => select(wsList), workspaceSnapshot: wsSnapshot };
    // 前面的归档用例已通过 openAllGroups 改动过折叠 state；这里重置到干净挂载，
    // 才能断言「默认全折叠」。
    persistentRefs = { cursor: 0, slots: [] };
    hookStates.slots.length = 0;
    hookStates.cursor = 0;
    resetHookCursor();
    const groupTree = elements(pageClient.CabinetPage(groupProps));
    const groupNodes = groupTree.filter((node) => node.props?.['data-cabinet-conversation-group'] !== undefined);
    assert.equal(groupNodes.length, 3, 'the left column renders one section per workspace plus the ungrouped bucket, got ' + JSON.stringify(groupNodes.map((node) => node.props['data-cabinet-conversation-group'])));
    assert.equal(JSON.stringify(groupNodes.map((node) => node.props['data-cabinet-conversation-group'])), JSON.stringify(['ws-1', 'ws-2', 'ungrouped']), 'group order follows the host workspace order');
    const titles = groupTree.filter((node) => node.props?.['data-cabinet-conversation-group-title'] !== undefined);
    assert.equal(titles.length, 3, 'every group carries a title node');
    assert.equal(JSON.stringify(titles.map((node) => node.props['data-cabinet-conversation-group-title'])), JSON.stringify(['ws-1', 'ws-2', 'ungrouped']), 'each title node is keyed by its group');
    assert.ok(JSON.stringify(titles[0]).includes('工作区一'), 'the first group title shows its workspace name');
    assert.ok(JSON.stringify(titles[1]).includes('工作区二'), 'the second group title shows its workspace name');
    assert.ok(JSON.stringify(titles[2]).includes(client.zh['conversation.all']), 'the ungrouped bucket title uses the locale label');
    // 归档过滤（页面层）：最近更新的会话已归档时，默认选中必须落到下一个
    // 未归档且有阁臣的会话（不能选到已被过滤掉的 id）。
    const archivedNewestList = {
      ids: ['s-live-team', 's-archived-newest', 's-noteam'],
      byId: {
        's-live-team': { title: '未归档有阁臣', updatedAt: ageOf(100) },
        's-archived-newest': { title: '最新但已归档', updatedAt: ageOf(9000) },
        's-noteam': { title: '未归档无阁臣', updatedAt: ageOf(50) },
      },
      projectionsBySession: {
        's-live-team': { values: { agentTeam: { members: [{ name: 'lead', role: 'lead', id: 's-live-team' }, { name: 'works', role: 'teammate', id: 's-mate-live' }], tasks: [] } } },
        's-archived-newest': { values: { agentTeam: { members: [{ name: 'lead', role: 'lead', id: 's-archived-newest' }, { name: 'works', role: 'teammate', id: 's-mate-arch' }], tasks: [] } } },
      },
    };
    const archivedNewestSnapshot = { items: [{ workspaceId: 'ws-a', path: '/tmp/a', title: '归档样例', sessionIds: ['s-live-team', 's-archived-newest', 's-noteam'], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' }], archivedSessionIds: ['s-archived-newest'], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null };
    const archivedPickTree = openAllGroups({ ...teamProps, useSessions: (select) => select(archivedNewestList), workspaceSnapshot: archivedNewestSnapshot });
    const archivedPickSelect = archivedPickTree.find((node) => node.props?.['data-cabinet-page-session'] !== undefined);
    assert.equal(archivedPickSelect.props.value, 's-live-team', 'the default selection skips an archived newest session and lands on the newest visible one with ministers, got ' + String(archivedPickSelect.props.value));
    const archivedPickIds = archivedPickTree.filter((node) => node.props?.['data-cabinet-conversation-item'] !== undefined).map((node) => node.props['data-cabinet-conversation-id']);
    assert.ok(!archivedPickIds.includes('s-archived-newest'), 'the archived session renders no row in the left column');
    assert.ok(archivedPickIds.includes('s-live-team'), 'the surviving session renders its row');
    // 服务缺席（无快照）：不过滤、不抛，全部会话照常出现。
    const noSnapshotTree = openAllGroups({ ...teamProps, useSessions: (select) => select(archivedNewestList), workspaceSnapshot: null });
    // ① 默认全折叠（用户要求「不要默认把会话展开」）：所有组 collapsed=1，
    //    首屏只有组标题与计数，没有任何会话项、也没有 items 容器。
    assert.equal(JSON.stringify(groupNodes.map((node) => node.props['data-cabinet-conversation-group-collapsed'])), JSON.stringify(['1', '1', '1']), 'every group — workspace groups included — starts collapsed');
    assert.equal(groupTree.filter((node) => node.props?.['data-cabinet-conversation-item'] !== undefined).length, 0, 'no session row renders while every group is collapsed');
    assert.equal(groupTree.filter((node) => node.props?.['data-cabinet-conversation-group-items'] !== undefined).length, 0, 'a collapsed group mounts no items container');
    assert.equal(titles.length, 3, 'all group titles stay visible while collapsed');
    assert.equal(groupNodes[0].props['data-cabinet-conversation-group-count'], '2', 'a collapsed group still shows its item count');
    assert.equal(groupNodes[2].props['data-cabinet-conversation-group-count'], '1', 'the collapsed bucket shows its count too');
    assert.equal(titles[0].props['aria-expanded'], 'false', 'a collapsed group reports aria-expanded=false');
    // ② 展开其中一个组：只有它的会话项出现，其他组仍折叠。
    // ② 之前的归档用例改过折叠 state，先恢复干净挂载再验证「手动展开只影响自己」。
    persistentRefs = { cursor: 0, slots: [] };
    hookStates.slots.length = 0;
    hookStates.cursor = 0;
    resetHookCursor();
    titles[0].props.onClick();
    resetHookCursor();
    const oneOpen = elements(pageClient.CabinetPage(groupProps));
    const oneOpenGroups = groupsOf(oneOpen);
    assert.equal(JSON.stringify(oneOpenGroups.map((node) => node.props['data-cabinet-conversation-group-collapsed'])), JSON.stringify(['0', '1', '1']), 'expanding one group leaves the others collapsed');
    const oneOpenIds = items(oneOpen).map((node) => node.props['data-cabinet-conversation-id']);
    assert.deepEqual(oneOpenIds.slice().sort(), ['s-w1-new', 's-w1-old'], 'only the expanded group renders its sessions, got ' + JSON.stringify(oneOpenIds));
    // ③ 手动态记住：再次重渲染不得回落到默认折叠。
    resetHookCursor();
    const stillOpen = elements(pageClient.CabinetPage(groupProps));
    assert.equal(JSON.stringify(groupsOf(stillOpen).map((node) => node.props['data-cabinet-conversation-group-collapsed'])), JSON.stringify(['0', '1', '1']), 'the manual expansion survives a re-render');
    assert.ok(items(stillOpen).some((node) => node.props['data-cabinet-conversation-id'] === 's-w1-new'), 'its session is still rendered after a re-render');
    // ④ 点开全部组后，会话项齐了（也是后面用例的展开入口）。
    const expandedTree = openAllGroups(groupProps);
    assert.equal(items(expandedTree).length, wsChoices.length, 'expanding every group restores all sessions');
    assert.equal(groupsOf(expandedTree).every((node) => node.props['data-cabinet-conversation-group-collapsed'] === '0'), true, 'every group is expanded after clicking all titles');
    // ④ 兜底组为 0 项时整组不渲染。
    const noLooseList = {
      ids: ['s-w1-new', 's-w2'],
      byId: { 's-w1-new': { title: '一区新会话', updatedAt: ageOf(500) }, 's-w2': { title: '二区会话', updatedAt: ageOf(300) } },
      projectionsBySession: {
        's-w1-new': { values: { agentTeam: { members: [{ name: 'lead', role: 'lead', id: 's-w1-new' }, { name: 'works', role: 'mate', id: 'm-w1' }], tasks: [] } } },
        's-w2': { values: { agentTeam: { members: [{ name: 'lead', role: 'lead', id: 's-w2' }, { name: 'works', role: 'mate', id: 'm-w2' }], tasks: [] } } },
      },
    };
    resetHookCursor();
    const noLooseTree = elements(pageClient.CabinetPage({ ...teamProps, useSessions: (select) => select(noLooseList), workspaceSnapshot: wsSnapshot }));
    const noLooseGroups = noLooseTree.filter((node) => node.props?.['data-cabinet-conversation-group'] !== undefined);
    assert.equal(noLooseGroups.length, 2, 'an empty ungrouped bucket renders no section at all, got ' + JSON.stringify(noLooseGroups.map((node) => node.props['data-cabinet-conversation-group'])));
    assert.ok(!noLooseTree.some((node) => node.props?.['data-cabinet-conversation-group-title'] === 'ungrouped'), 'no ungrouped title node exists when the bucket is empty');
    // 全部被滤掉时左列给一行说明，不能是一片空白。
    const allFilteredList = {
      ids: ['s-empty-a', 's-empty-b'],
      byId: { 's-empty-a': { title: '无阁臣甲', updatedAt: ageOf(100) }, 's-empty-b': { title: '无阁臣乙', updatedAt: ageOf(200) } },
      projectionsBySession: {},
    };
    persistentRefs = { cursor: 0, slots: [] };
    hookStates.slots.length = 0;
    hookStates.cursor = 0;
    resetHookCursor();
    const allFilteredTree = elements(pageClient.CabinetPage({ ...teamProps, useSessions: (select) => select(allFilteredList), workspaceSnapshot: wsSnapshot }));
    assert.equal(items(allFilteredTree).length, 0, 'a fully filtered left column renders no session row');
    const filteredEmpty = allFilteredTree.find((node) => node.props?.['data-cabinet-conversations-empty'] !== undefined);
    assert.ok(filteredEmpty, 'the left column explains itself instead of going blank');
    const emptyTextOf = (node) => (typeof node === 'string' ? node : (!node || typeof node !== 'object' ? '' : (node.children || []).map(emptyTextOf).join('')));
    assert.ok(emptyTextOf(filteredEmpty).includes(pageClient.zh['conversation.emptyFiltered']), 'the explanation uses the locale copy, got ' + JSON.stringify(emptyTextOf(filteredEmpty)));
    // 排序：多会话按 updatedAt 倒序。
    const sortedList = {
      ids: ['s-a', 's-b', 's-c'],
      byId: { 's-a': { title: 'A', updatedAt: ageOf(100) }, 's-b': { title: 'B', updatedAt: ageOf(300) }, 's-c': { title: 'C', updatedAt: ageOf(200) } },
      projectionsBySession: { 's-b': { values: { agentTeam: { members: [{ name: 'lead', role: 'lead', id: 's-b' }], tasks: [] } } } }
    };
    assert.equal(JSON.stringify(client.cabinetSessionChoices(sortedList).map((choice) => choice.id)), JSON.stringify(['s-a', 's-b', 's-c']), 'the snapshot keeps its own order (useSessions is the source)');
    const sortedIds = client.cabinetSessionChoices(sortedList).slice().sort((a, b) => (b.updatedAt - a.updatedAt) || (a.id < b.id ? -1 : 1)).map((choice) => choice.id);
    assert.equal(JSON.stringify(sortedIds), JSON.stringify(['s-b', 's-c', 's-a']), 'the left column sorts sessions by updatedAt descending');
    // 通道缺失：提示而不是死链/异常。
    let noChannelClient = null;
    runInNewContext(source.replace(exportPoint, 'return { apply, CabinetPage, GroupChatRow, zh, memberLabel, cabinetScopeRows, openCabinetSession };'), {
      window: { __ModuleLoader__: { load: ({ factory }) => {
        noChannelClient = factory((name) => { if (name === '@deepseek-ai/dsh-client-ui-primitives') throw new Error('primitives not seeded'); return React; });
      } } },
      console,
    });
    persistentRefs = { cursor: 0, slots: [] };
    hookStates.slots.length = 0;
    const noChannelProps = { useSessions: (select) => select(teamList), useSessionStatus: (select) => select(new Map()), t: (key) => noChannelClient.zh[key] || key };
    resetHookCursor();
    const noChannelCollapsed = elements(noChannelClient.CabinetPage(noChannelProps));
    // 默认全折叠：先展开唯一的一组，才能取到会话行。
    noChannelCollapsed.filter((node) => node.props?.['data-cabinet-conversation-group-title'] !== undefined).forEach((node) => node.props.onClick());
    resetHookCursor();
    const noChannelTree = elements(noChannelClient.CabinetPage(noChannelProps));
    noChannelTree.filter((node) => node.props?.['data-cabinet-conversation-item'] !== undefined).find((node) => node.props['data-cabinet-conversation-id'] === 's-lead').props.onClick();
    resetHookCursor();
    const noChannelAfter = elements(noChannelClient.CabinetPage(noChannelProps));
    // 没有 uiWorkspace 打开通道也必须能用：左列选中仍在本页切换右侧群聊。
    assert.equal(noChannelAfter.filter((node) => node.props?.['data-cabinet-open-unavailable'] !== undefined).length, 0, 'without a workspace opener the page still switches the right pane in place and shows no dead-link hint');
    assert.equal(noChannelAfter.filter((node) => node.props?.['data-cabinet-conversation-item'] !== undefined).length, 1, 'the session list still renders its single top-level row without a workspace opener');
    assert.ok(noChannelAfter.some((node) => node.props?.['data-cabinet-page-main'] !== undefined), 'the right pane is still mounted without a workspace opener');
    persistentRefs = null;

    // B) 点消息进完整会话：复用既有 uiWorkspace 下钻通道。
    const openCalls = [];
    const openableRow = elements(pageClient.GroupChatRow({
      row: { kind: 'assistant', text: '看这里', time: 1000, seq: 1, tools: [] },
      member: { name: 'works', id: 'm-works', phase: 'active' },
      t: (key) => pageClient.zh[key] || key,
      onOpenSession: (target) => openCalls.push(target.id)
    }));
    const hotZone = openableRow.find((node) => node.props?.['data-cabinet-open-session'] === 'm-works');
    assert.ok(hotZone, 'the message header/avatar is a drill-down hot zone for its session');
    assert.equal(hotZone.props.style.cursor, 'pointer', 'the hot zone shows a pointer cursor');
    assert.ok(String(hotZone.props.title).includes('DSH'), 'the hot zone explains it opens the full DSH session');
    hotZone.props.onClick();
    assert.deepEqual(openCalls, ['m-works'], 'clicking the hot zone asks for that member session');
    const failedRow = elements(pageClient.GroupChatRow({
      row: { kind: 'assistant', text: 'x', time: 1, seq: 1, tools: [] },
      member: { name: 'works', id: 'm-works', phase: 'failed' },
      t: (key) => pageClient.zh[key] || key,
      onOpenSession: () => { throw new Error('must not be bound'); }
    }));
    const disabledHotZone = failedRow.find((node) => node.props?.['data-cabinet-open-disabled'] === '1');
    assert.ok(disabledHotZone, 'a failed member degrades the hot zone to disabled');
    assert.equal(disabledHotZone.props.onClick, undefined, 'the disabled hot zone binds no handler');
    assert.ok(String(disabledHotZone.props.title).includes('不可打开'), 'the disabled hot zone explains why');
    const anonRow = elements(pageClient.GroupChatRow({
      row: { kind: 'assistant', text: 'y', time: 1, seq: 1, tools: [] },
      member: { name: 'works' },
      t: (key) => pageClient.zh[key] || key,
      onOpenSession: () => {}
    }));
    assert.equal(anonRow.filter((node) => node.props?.['data-cabinet-open-session'] !== undefined).length, 0, 'without a session id there is no hot zone at all');
    // 通道本身：成员走 childSessionId + continuable，首辅走 plain 字符串；无服务时不抛异常。
    assert.equal(noChannelClient.openCabinetSession('m-works', 's-lead'), false, 'without a uiWorkspace service the channel degrades to false, not an exception');
    assert.equal(pageClient.openCabinetSession('m-works', 's-lead'), true, 'the member drill-down succeeds through the injected workspace');
    assert.equal(JSON.stringify(openedSessions[openedSessions.length - 1]), JSON.stringify({ parentSessionId: 's-lead', childSessionId: 'm-works', mode: 'continuable' }), 'the same payload the native roster uses for a teammate');
    assert.equal(pageClient.openCabinetSession('s-lead', 's-lead'), true, 'the Lead session takes the plain-string branch');
    assert.equal(openedSessions[openedSessions.length - 1], 's-lead', 'the Lead opens its own session id directly');
    assert.equal(pageClient.openCabinetSession('', 's-lead'), false, 'a missing session id degrades to false instead of throwing');
  }

  // Registrations: sidebar entry + main page exist, the settings duplicate is gone.
  const registrations = [];
  client.apply({
    locale: { register: () => {}, bind: () => (key) => key },
    effect: (fn) => { try { const cleanup = fn(); return typeof cleanup === 'function' ? cleanup : () => {}; } catch (error) { return () => {}; } },
    inject: (names, callback) => {
      if (Array.isArray(names) && names.includes('sessions')) callback({ sessions: { refreshProjections: () => Promise.resolve() }, effect: () => () => {} });
      return () => {};
    },
    get: () => undefined,
    slots: {
      inject: (name, callback) => { callback(); return () => {}; },
      register: (options, component) => { registrations.push({ name: options.name, key: options.key, id: options.id, order: options.order, label: options.label, component }); return () => {}; },
    },
    sidebarRightTabs: { register: () => () => {} },
  });
  const names = registrations.map((entry) => entry.name);
  assert.ok(names.includes('sidebar.panellist'), 'the sidebar panel list gets the 内阁 entry');
  assert.ok(names.includes('main'), 'the root main slot gets the 内阁 page');
  assert.ok(registrations.some((entry) => entry.name === 'sidebar.panellist' && entry.id === 'cabinet' && typeof entry.label === 'function'), 'the panellist entry carries id and a label thunk');
  assert.ok(registrations.some((entry) => entry.name === 'main' && entry.key === 'cabinet'), 'the main page is keyed to the same id');
  const panellistEntry = registrations.find((entry) => entry.name === 'sidebar.panellist');
  assert.equal(panellistEntry.order, 60, 'the panellist entry declares order 60');
  const iconActive = elements(panellistEntry.component({ size: 18, active: true }));
  const iconIdle = elements(panellistEntry.component({ size: 20, active: false }));
  assert.equal(iconActive[0].props.width, 18, 'the icon reads its size prop');
  assert.equal(iconActive[0].props.height, 18, 'the icon is square at the requested size');
  assert.equal(iconActive[0].props['data-cabinet-panel-icon'], '1', 'the icon reads its active prop');
  assert.equal(iconIdle[0].props['data-cabinet-panel-icon'], '0', 'an inactive panel icon is marked idle');
  assert.ok(!names.includes('settings.section'), 'the old settings members section is gone (no second entry)');
  assert.equal(typeof registrations.find((entry) => entry.name === 'sidebar.panellist').component, 'function', 'the panellist registers an icon component');
}
console.log('PASS 第七批：左列只放顶层会话（useSessions 快照过滤 parentSessionId/origin:subagent、按 updatedAt 倒序、标题/时间/内阁群聊标记，点击在本页选中该会话并切换右侧群聊，无 uiWorkspace 通道也照常工作且不弹死链提示）、群聊成员可见性（四成员各一条 durable 消息都进合并流，成员通道 ok/pending/error 状态挂容器，未就绪成员渲染等待中行而非静默消失，scope 过滤按 memberName 兜底，空态是有内容有提示的居中块而非一行空话）、气泡/打字框样式（light-dark 成对配色、用到的每个 --dsw-* 变量都在装机前端真实存在、无伪造变量、气泡底回退不是单值白、首末 margin 归零（含嵌套层）、段落 margin 0、空段落/空 div 不占高、工具行高度随内容不留占位、折叠区按行高定量）、等待中行跟随会话过滤');
console.log('PASS 第六批：左列改会话列表（无合成项、顶层 DSH 会话按 updatedAt 倒序，标题/时间/内阁群聊标记，默认选中最近更新且**有阁臣**（除 lead 外还有成员）的会话（全无阁臣时退回最近更新），点击在本页选中并切换右侧群聊、无通道也照常工作）、成员设置收成左列单入口（默认不占位，点开替换左列、关闭回列表）、点消息头/头像经既有 uiWorkspace 通道（openCabinetSession → childSessionId + continuable / 首辅 plain id）进成员完整会话，无 id 或成员失败时退化为不可点并给提示，无服务时返回 false 不抛异常');
console.log('PASS 第五批：微信式气泡（别人左侧浅色/自己右侧 #95EC69 绿、圆角内边距、maxWidth 70%、头像 28px、气泡内 markdown 与工具折叠仍在）、时间戳与连续同人聚合（首行与 ≥5 分钟/跨天显示、同人紧凑省名）、进入即贴底（ref 挂载滚到底、贴底跟随状态 data-cabinet-groupchat-follow 随滚动切换、纯函数无定时器）、@成员派活（输入 @ 弹首辅与阁臣候选、插入可解析 @官职名 标记、目标与正文分离、投递到成员会话、无成员通道时显式降级为发首辅并保留 @标记且 UI 说明）');
console.log('PASS 第二批：markdown 双路径（宿主 MarkdownText 可解析时用组件、seed 缺失或 require 抛错时降级自绘且不炸插件；子集标题/列表/代码块/行内代码/粗体/链接/裸文本 + 无 innerHTML + javascript:/file: 拒绝）、模型目录真实 groups 与「本机无 adapter」显式提示、当前模型读 modelSelection 投影、模型保存后生效说明与 fail-closed 风险提示（且全源无「未生效」字样）、独立内阁整页自带会话选择器（默认最近更新且有阁臣、子会话不入列、会话内记忆）、sidebar.panellist + main 注册且设置页旧 members section 已清理');
