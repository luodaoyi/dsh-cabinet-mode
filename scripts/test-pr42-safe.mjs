import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { memberBlock, DEFAULT_MEMBER_PROMPTS } from '../index.js';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
let api;
const react = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: value => [typeof value === 'function' ? value() : value, () => {}],
  useRef: value => ({ current: value }), useMemo: fn => fn(), useCallback: fn => fn,
  useEffect: () => {}, useLayoutEffect: () => {}, useId: () => 'safe-fixes',
};
runInNewContext(source.replace('return { inject, apply };', 'return { MemberCard, STYLE_CSS, DEFAULT_MEMBER_PROMPTS };'), {
  setTimeout, clearTimeout, console,
  window: { __ModuleLoader__: { load: ({ factory }) => { api = factory(name => {
    if (name !== 'react') throw new Error('optional host module unavailable');
    return react;
  }); } } },
});
const flatten = node => Array.isArray(node) ? node.flatMap(flatten)
  : node && typeof node === 'object' ? [node, ...flatten(node.children || [])] : [];
const text = node => Array.isArray(node) ? node.map(text).join('')
  : node && typeof node === 'object' ? text(node.children || []) : node ?? '';
const render = (phase, running, activeTask) => flatten(api.MemberCard({
  member: { id: 'works', name: 'works', phase }, running, activeTask, t: key => key,
}));
for (const [phase, running] of [['active', true], ['failed', false], ['provisioning', false]]) {
  const task = render(phase, running).find(n => n.props['data-cabinet-task-desc']);
  assert.equal(text(task), 'member.noTask', `${phase}/${running} without task is not idle`);
}
const idle = render('active', false, { id: 'task', status: 'in_progress', subject: 'Still assigned' });
const state = idle.find(n => n.props['data-cabinet-member-status'] === 'inactive');
assert.equal(text(state), 'status.inactive', 'idle state stays accessible even with a stale task');
assert.match(api.STYLE_CSS, /\[data-cabinet-dispatch\]:has\(\[data-cabinet-dispatch-input\]\).*?\{position:static\}/);
assert.match(api.STYLE_CSS, /\[data-cabinet-dispatch-input\]\{[^}]*max-width:100%;width:100%/);
const member = { role: 'teammate', name: 'tongzheng' };
assert.match(memberBlock({ associationMode: false }, member), /联想模式当前关闭（associationMode=false）/);
assert.match(memberBlock({ associationMode: true }, member), /联想模式当前开启（associationMode=true）/);
assert.equal(api.DEFAULT_MEMBER_PROMPTS.yushi, DEFAULT_MEMBER_PROMPTS.yushi);
assert.match(DEFAULT_MEMBER_PROMPTS.yushi, /每项缺陷各贴一处 path:line/);
console.log('PASS: PR42 safe state, prompt and expanded-dispatch regressions');
