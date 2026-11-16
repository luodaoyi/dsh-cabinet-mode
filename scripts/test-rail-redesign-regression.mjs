// Focused contracts for PR36. Plain component/reducer tests, not browser layout.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../client.js',import.meta.url),'utf8');
let client,slots=[],cursor=0;
const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:init=>{const i=cursor++;if(!(i in slots))slots[i]=init;return[slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value]}};
vm.runInNewContext(source.replace('return { inject, apply };','return { MemberCard, TaskLine, buildConnectorPaths, buildTaskEdges, taskEdgesEqual };'),{window:{__ModuleLoader__:{load:({factory})=>client=factory(()=>React)}}});
const all=node=>Array.isArray(node)?node.flatMap(all):!node||typeof node!=='object'?[]:[node,...all(node.children)];
const task={id:'task-active',subject:'Active task',status:'in_progress',blockedBy:[],description:'Task sheet',writeScopes:['isolated']};
const card=client.MemberCard({member:{id:'mate',name:'works',phase:'active'},activeTask:task,statusLabel:x=>x,t:x=>x,activity:{known:false}});
assert.ok(all(card).some(n=>n.props['data-cabinet-task']===task.id));
assert.ok(!all(card).some(n=>n.props['data-cabinet-activity-state']!==undefined),'unknown activity renders no placeholder line');
assert.ok(!JSON.stringify(all(card)).includes('活动'),'no 活动 text without data');
let opened=0;const renderTask=()=>{cursor=0;return client.TaskLine({task,blockerOf:()=>null,t:x=>x,taskLabel:x=>x,onOpenOwner:()=>opened++})};
let tree=renderTask(),button=all(tree).find(n=>n.props['data-cabinet-task-sheet-toggle']===task.id);
assert.equal(button.type,'button');assert.equal(button.props.type,'button');assert.equal(button.props['aria-expanded'],false);let stopped=0;button.props.onClick({stopPropagation(){stopped++}});tree=renderTask();button=all(tree).find(n=>n.props['data-cabinet-task-sheet-toggle']===task.id);assert.equal(button.props['aria-expanded'],true);assert.equal(opened,0);assert.equal(stopped,1);assert.ok(all(tree).some(n=>n.props['data-cabinet-task-sheet']==='description'));
console.log('PASS current-task anchor and native independent task-sheet toggle; unknown roster activity');
const rect={left:0,top:0,width:400,height:300},lead={left:20,top:0,width:100,height:40};
assert.equal(client.buildConnectorPaths({...rect,width:0},lead,[]),null);
assert.equal(client.buildConnectorPaths(rect,lead,[]).length,0);
// Exercise actual measureLinks callback: visible empty nodes must reach both
// drawing setters, not return early and leave stale dependency arrows behind.
const start=source.indexOf('const measureLinks = React.useCallback('),end=source.indexOf('// Re-measure after every commit',start);
let links=['old'],edges=['old'];
const ctx={React:{useCallback:fn=>fn},treeRef:{current:{getBoundingClientRect:()=>rect,querySelectorAll:()=>[]}},leadRef:{current:{getBoundingClientRect:()=>lead}},edgeDataRef:{current:{tasks:[],live:new Set()}},setLinkPaths:fn=>links=fn(links),setEdges:fn=>edges=fn(edges),setEdgeCards(){},buildConnectorPaths:client.buildConnectorPaths,buildTaskEdges:client.buildTaskEdges,taskEdgesEqual:client.taskEdgesEqual};
vm.runInNewContext(source.slice(start,end)+'measureLinks();',ctx);assert.equal(links.length,0);assert.equal(edges.length,0);console.log('PASS visible empty roster clears connector and dependency overlays');
const begin=source.indexOf("if (activeTab === 'timeline') {",source.indexOf('// 数据 = 群聊'));
const finish=source.indexOf('const isLeadTask =',begin);
function timeline(view){const body=[];const member={id:'mate',name:'works'};const c={activeTab:'timeline',chatMembers:[member],groupRows:view.error?[{kind:'error',time:0,seq:0,memberName:'works'}]:[],group:{views:()=>view},body,h:React.createElement,PANEL:{},INK2:'gray',memberLabel:x=>x,tt:x=>x,panelRef:{}};return vm.runInNewContext('(function(){'+source.slice(begin,finish)+'})()',c)}
for(const [view,state] of [[{fold:null,error:'failed'},'error'],[{fold:null,error:null},'pending']]){const nodes=all(timeline(view));assert.ok(nodes.some(n=>n.props['data-cabinet-timeline-state']===state));assert.ok(!nodes.some(n=>n.props['data-cabinet-timeline-empty']));assert.ok(JSON.stringify(nodes.find(n=>n.props['data-cabinet-timeline-count'])).includes('0 条记录'));}
assert.ok(all(timeline({fold:{rows:[]},error:null})).some(n=>n.props['data-cabinet-timeline-empty']));
console.log('PASS timeline distinguishes failed/pending history from genuinely empty history');
// Process status remains readable independently from task bookkeeping.
for (const [phase,running,expected] of [['active',true,'running'],['active',false,'inactive'],['failed',false,'failed'],['provisioning',false,'provisioning']]) {
  const nodes=all(client.MemberCard({member:{id:'m',name:'works',phase},running,statusLabel:s=>'status:'+s}));
  const label=nodes.find(n=>n.props['data-cabinet-member-status']===expected);
  assert.ok(label);
  assert.equal(label.children[0],'status:'+expected);
  // identity locale (t:x=>x) 下 tt('status.inactive') 原样透出；真中文由 test-client 的 zhT 卡锁。
  assert.equal(nodes.find(n=>n.props['data-cabinet-task-desc']).children[0],'member.noTask');
}
const stale=all(client.MemberCard({member:{id:'m',name:'works',phase:'active'},running:false,activeTask:task,statusLabel:s=>s}));
assert.ok(stale.some(n=>n.props['data-cabinet-member-status']==='inactive'));
assert.equal(stale[0].props['data-cabinet-sweep'],undefined);
// Hidden details duplicate an active task's anchor. They must not overwrite its
// visible compact-card anchor; expanded task rows may legitimately supersede it.
let lookedUp;
ctx.treeRef.current.querySelectorAll=selector=>selector==='[data-cabinet-task]'?[
  {getAttribute:()=>task.id,getBoundingClientRect:()=>({left:1,top:50,width:80,height:20})},
  {getAttribute:()=>task.id,getBoundingClientRect:()=>({left:0,top:0,width:0,height:0})}
]:[];
ctx.buildTaskEdges=(base,tasks,lookup)=>{lookedUp=lookup(task.id);return []};
vm.runInNewContext(source.slice(start,end)+'measureLinks();',{...ctx});
assert.equal(lookedUp.width,80);
console.log('PASS actual process status is readable; hidden task details cannot erase visible dependency anchors');

const mark=all(card).find(n=>n.props.className==='cabinet-task-mark');
assert.ok(mark);assert.match(mark.props.style.animation,/cabinetPulse/);
assert.match(source,/@media \(prefers-reduced-motion:reduce\)[^\n]*\.cabinet-task-mark\{animation:none!important\}/);
console.log('PASS task pulse has reduced-motion override for inline animation');
