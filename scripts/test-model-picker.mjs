import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
let client, cursor=0, effects=[];
const hooks=[];
const React={
 createElement:(type,props,...children)=>({type,props:props||{},children}),
 useState(initial){const i=cursor++;hooks[i]??={value:initial};return[hooks[i].value,v=>{hooks[i].value=typeof v==='function'?v(hooks[i].value):v;}];},
 useRef(initial){const i=cursor++;return(hooks[i]??={current:initial});},
 useEffect(fn,deps){const i=cursor++,old=hooks[i];if(!old||deps.some((v,k)=>v!==old.deps[k])){const entry=hooks[i]={deps};effects.push(()=>{old?.cleanup?.();entry.cleanup=fn();});}}
};
let value={members:[{key:'lead',model:'old/kept'}]},revision='1';const listeners=new Set();
const form={getSnapshot:()=>({status:'ready',writable:true,value,revision}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},async mutate(ops,expected){assert.equal(expected,revision);for(const op of ops)value[op.path[0]]=op.value;revision=String(+revision+1);for(const fn of listeners)fn();return true;}};
let response={ok:true,value:{groups:[]}},calls=0;
const remote={session:{modelCatalog:async()=>{calls++;return response;}}};
const source=readFileSync(new URL('../client.js',import.meta.url),'utf8');
vm.runInNewContext(source.replace('return { inject, apply };','return { CabinetMemberSettings, zh, en, setup(form,remote) { memberWriter=form; memberRemote=remote; } };'),{window:{__ModuleLoader__:{load:({factory})=>client=factory(()=>React)}}});
client.setup(form,remote);
let locale='en';
const render=()=>{cursor=0;return client.CabinetMemberSettings({t:key=>client[locale][key]??key});};
const settle=async()=>{let tree;for(let i=0;i<4;i++){tree=render();const jobs=effects;effects=[];for(const job of jobs)job();await new Promise(r=>setImmediate(r));}return tree;};
const nodes=tree=>{const all=[];function walk(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(walk);return;}all.push(n);n.children?.forEach(walk);}walk(tree);return all;};
const pickers=tree=>nodes(tree).filter(n=>n.props.key==='mi');
let tree=render();
// Setup only: the model fields now live on the models tab, so this click puts
// the UI in the state every assertion below assumes. No assertion body changes.
nodes(tree).find(n=>n.props['data-cabinet-settings-tab']==='models').props.onClick();
tree=render();
assert.ok(pickers(tree).every(n=>n.type==='input'&&n.props.disabled));
assert.equal(nodes(tree).filter(n=>n.props.key==='mh').length,0,'loading is not unavailable');
tree=await settle();assert.equal(pickers(tree).length,5);assert.ok(pickers(tree).every(n=>n.type==='input'&&!n.props.disabled));assert.equal(pickers(tree)[0].props.value,'old/kept');
assert.equal(nodes(tree).filter(n=>n.props.key==='mh').length,5,'completed empty catalog shows fallback hint');
async function refresh(next){response=next;nodes(tree).find(n=>n.props.key==='catalog').props.onClick();tree=await settle();}
await refresh({ok:true,value:{groups:[],failures:[{id:'offline'}]}});assert.ok(pickers(tree).every(n=>n.type==='input'));assert.equal(pickers(tree)[0].props.value,'old/kept');
await refresh({ok:true,value:{groups:[{id:'local',models:[{id:'model+variant'}]}]}});assert.ok(pickers(tree).every(n=>n.type==='select'));assert.equal(pickers(tree)[0].props.value,'old/kept');assert.ok(nodes(pickers(tree)[0]).some(n=>n.type==='option'&&n.props.value==='old/kept'));
await refresh({ok:false,error:{message:'offline'}});assert.ok(pickers(tree).every(n=>n.type==='input'));assert.equal(pickers(tree)[0].props.value,'old/kept');
pickers(tree)[0].props.onChange({target:{value:'manual/model+id'}});tree=await settle();await nodes(tree).find(n=>n.props.key==='save').props.onClick();tree=await settle();assert.equal(value.members[0].model,'manual/model+id');
await refresh({ok:true,value:{groups:[]}});assert.equal(pickers(tree)[0].props.value,'manual/model+id');assert.equal(calls,5);
pickers(tree)[0].props.onChange({target:{value:'invalid-route'}});tree=await settle();await nodes(tree).find(n=>n.props.key==='save').props.onClick();
for(locale of ['en','zh']) {
 tree=await settle();const error=nodes(tree).find(n=>n.props.key==='e');
 assert.equal(error.children[0],client[locale]['member.error.model']);
 assert.notEqual(error.children[0],'member.error.model','display translated copy, not the key');
}
assert.equal(value.members[0].model,'manual/model+id','invalid Save does not overwrite persisted selection');
for(const hook of hooks)hook?.cleanup?.();
console.log('PASS model picker render: loading hint, empty/failure fallback, refresh, retained choices, manual Save and Chinese/English error translation');
