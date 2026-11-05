import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {sectionText, bureauOf, Config, DEFAULT_MEMBER_PROMPTS, memberModel, modelRoute, clampModel, MAX_MODEL_LENGTH, apply} from '../index.js';
let client;
const source=readFileSync(new URL('../client.js',import.meta.url),'utf8');
const sandbox = {
  window:{__ModuleLoader__:{load:({factory})=>{client=factory(()=>({createElement(){}}));}}},
};
vm.runInNewContext(source.replace('return { inject, apply };','return { createMemberEditor, setMemberConfig, configuredPrompt, memberLabel, avatarFor, memberAvatarOf, clampMemberModel, modelOptionsOf, BUREAUX, AVATARS };'),sandbox);
function form(value, revision='1') {
  let s={value,revision,writable:value!==undefined,status:value===undefined?'loading':'ready'}; const listeners=new Set();
  const f={writes:[],getSnapshot:()=>s,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
    publish(value,revision){s={value,revision,writable:value!==undefined,status:value===undefined?'loading':'ready'};for(const fn of listeners)fn();},
    async mutate(ops,expected){f.writes.push({ops,expected});if(expected!==s.revision)return false;const v=structuredClone(s.value);for(const op of ops)v[op.path[0]]=structuredClone(op.value);f.publish(v,String(Number(s.revision)+1));return true;}};
  return f;
}
const f=form(undefined);const editor=client.createMemberEditor(f,()=>{});const close=editor.connect();
editor.update('works',{name:'too-early'});assert.equal(editor.state.draft.works.name,'');
f.publish({members:[{key:'hanlin',name:'SAVED-HANLIN'}]},'1');assert.equal(editor.state.draft.hanlin.name,'SAVED-HANLIN');
editor.update('works',{name:'NEW-WORKS'});assert.equal(await editor.save(),true);assert.equal(f.getSnapshot().value.members.find(x=>x.key==='hanlin').name,'SAVED-HANLIN');
editor.update('works',{name:'stale'});f.publish({members:[{key:'hanlin',name:'OTHER-TAB'}]},'3');
assert.equal(editor.state.conflict,true);const writes=f.writes.length;assert.equal(await editor.save(),false);assert.equal(f.writes.length,writes);
editor.cancel();assert.equal(editor.state.draft.hanlin.name,'OTHER-TAB');assert.equal(editor.state.draft.works.name,'');
for(const key of ['lead','hanlin','works','dali','yushi'])editor.avatar(key,client.AVATARS[key]);
assert.equal(await editor.save(),true);editor.reset();
for(const key of ['lead','hanlin','works','dali','yushi']){assert.equal(editor.state.avatars[key],'');assert.equal(editor.state.draft[key].mode,'');}
assert.equal(await editor.save(),true);assert.equal(f.writes.at(-1).ops.length,6,'one atomic mutation resets every field');
for(const key of ['Lead','Hanlin','Works','Dali','Yushi'])assert.equal(f.getSnapshot().value['avatar'+key],'');
editor.update('works',{name:'discard'});close();assert.equal(await editor.save(),false);assert.notEqual(f.getSnapshot().value.members.find(x=>x.key==='works').name,'discard');
const reopened=client.createMemberEditor(f,()=>{});reopened.connect();assert.equal(reopened.state.draft.works.name,'');
const otherProfile=form({members:[{key:'works',name:'other-profile'}]});const independent=client.createMemberEditor(otherProfile,()=>{});independent.connect();
reopened.update('works',{name:'this-profile'});await reopened.save();assert.equal(independent.state.draft.works.name,'other-profile');

// Host uses live composition, never a guessed session/default-preset field.
let preset='standard',member={role:'lead',name:'lead'};
const agent={ctx:{}};
const ctx={get:key=>key==='agentPresets'?{composedPreset:c=>{assert.equal(c,agent.ctx);return preset;}}:key==='agentTeams'?{tryMembership:()=>member}:undefined};
assert.equal(sectionText(ctx,{},agent),'');preset='cabinet';assert.match(sectionText(ctx,{},agent),/御下术/);
preset='minimal';assert.equal(sectionText(ctx,{},agent),'');preset=undefined;assert.equal(sectionText(ctx,{},agent),'');preset='cabinet';
assert.equal(sectionText(ctx,{},undefined),'');
for(const bureau of client.BUREAUX)for(const alias of [bureau.label,...bureau.aliases])for(const name of [alias,alias+'2',alias+'-一',alias.replaceAll('-','_'),alias.replaceAll('-','.')]){
  assert.equal(bureauOf(name).key,bureau.key,name);
  const config={members:[{key:bureau.key,name:'CUSTOM',prompt:'PROMPT-'+bureau.key,mode:'custom'}],['avatar'+bureau.key[0].toUpperCase()+bureau.key.slice(1)]:client.AVATARS.works};
  client.setMemberConfig(config);assert.equal(client.avatarFor(name),client.AVATARS.works,name);assert.ok(client.memberLabel(name).includes(name));assert.ok(client.memberLabel(name).includes('CUSTOM'));
  member={role:bureau.key==='lead'?'lead':'teammate',name};assert.ok(sectionText(ctx,config,agent).includes('PROMPT-'+bureau.key),name);
}
for(const name of ['hanlinx','jiancha-yushix','dalisiX','x-dalisi','CUSTOM']){
  assert.equal(bureauOf(name).key,'');member={role:'teammate',name};assert.equal(sectionText(ctx,{},agent),'');assert.equal(client.avatarFor(name),client.AVATARS.neutral);
}
member={role:'teammate',name:'lead'};assert.equal(sectionText(ctx,{},agent),'','a teammate cannot inherit Lead policy by naming itself lead');
for(const key of ['lead','hanlin','works','dali','yushi'])for(const mode of ['off','custom','']){
  const config={members:[{key,mode,prompt:''}]};member={role:key==='lead'?'lead':'teammate',name:key};client.setMemberConfig(config);
  if(mode!==''){assert.equal(sectionText(ctx,config,agent),'');assert.equal(client.configuredPrompt(key),'');}
  else assert.ok(sectionText(ctx,config,agent).length>0);
}
for (const raw of [{members: 'bad',avatarLead:42},{avatarLead:'data:image/svg+xml;base64,AAAA'},{avatarLead:'data:image/png;base64,'+'A'.repeat(50000)}]) { Config(raw); client.setMemberConfig(raw); assert.equal(client.avatarFor('lead'),client.AVATARS.lead); }
assert.ok(DEFAULT_MEMBER_PROMPTS.works.includes('工部尚书'));
console.log('PASS member editor: late snapshots, revision conflicts, atomic reset, cancel/unmount, profile independence; host preset/role/alias/default/off boundaries (mock contracts)');

client.setMemberConfig({avatarLead:client.AVATARS.works});
assert.equal(client.memberAvatarOf('lead',{lead:''}),client.AVATARS.lead,'draft reset previews default before Save');
assert.ok(!JSON.stringify(Config).includes('callback'),'wire schema must not require dynamic callbacks');

// Async decoding cannot revive cancelled/reset/unmounted edits or overwrite a newer pick.
const pending=[];
sandbox.createImageBitmap=()=>new Promise(resolve=>pending.push(resolve));
sandbox.document={createElement:()=>({getContext:()=>({drawImage(){}}),toDataURL:()=>client.AVATARS.works})};
const bitmap=()=>({width:128,height:128,close(){}});
for(const action of ['cancel','reset','close','newer']) {
  const f=form({});const e=client.createMemberEditor(f,()=>{});const unmount=e.connect();
  const upload=e.upload('hanlin',{type:'image/png',size:100});
  if(action==='close')unmount();else if(action==='newer')e.avatar('hanlin',client.AVATARS.dali);else e[action]();
  pending.shift()(bitmap());await upload;
  assert.equal(e.state.avatars.hanlin,action==='newer'?client.AVATARS.dali:'');
  assert.equal(f.writes.length,0);
}
console.log('PASS async upload lifecycle: cancel, reset, unmount and newer choice reject stale decode results');

// ---- per-member model selection: schema clamp, waterfall injection, catalog ----
// Schema validation, four samples: valid route, missing slash, wrong type, over-long.
const modelSamples = [
  {input:'prov-a/model-one', route:{provider:'prov-a',model:'model-one'}},
  {input:'no-slash-here', route:undefined},
  {input:12345, route:undefined},
  {input:'p/'+'x'.repeat(300), route:undefined}
];
for (const sample of modelSamples) {
  assert.equal(clampModel(sample.input), sample.route===undefined?'':sample.input, 'clamp '+JSON.stringify(sample.input));
  assert.deepEqual(modelRoute(sample.input), sample.route, 'route '+JSON.stringify(sample.input));
}
assert.ok(MAX_MODEL_LENGTH>=200,'model bound exported');
assert.equal(memberModel({members:[{key:'works',model:'prov/m'}]},'works').provider,'prov','configured member resolves');
assert.equal(memberModel({members:[{key:'works',model:42}]},'works'),undefined,'corrupt stored value degrades to inherit');

// Real waterfall ordering/signal correlation is covered by test-model-selection.cjs.

// Settings half: adopt/save round trip and corrupt-value fallback.
const mf=form({members:[{key:'works',name:'',prompt:'',mode:'',model:'prov/ok'}]});
const me=client.createMemberEditor(mf,()=>{});me.connect();
assert.equal(me.state.draft.works.model,'prov/ok','adopt reads the stored model');
me.update('works',{model:'prov/other'});
assert.equal(await me.save(),true);
assert.equal(mf.getSnapshot().value.members.find(x=>x.key==='works').model,'prov/other','save persists the model');
assert.equal(client.clampMemberModel('bad value!'),'','browser clamp rejects corrupt input');
assert.equal(client.clampMemberModel('prov/m'),'prov/m','browser clamp keeps a valid route');

// Enumeration is data-driven: catalog -> options, and no hard-coded model ids.
assert.ok(!/(deepseek-v4|opencode-go|gpt-4o|claude-3-5)/.test(source),'client.js carries no hard-coded model id');
const opts=JSON.parse(JSON.stringify(client.modelOptionsOf({groups:[{id:'prov-a',models:[{id:'m1',name:'Model One'}]}]})));
assert.deepEqual(opts,[{value:'prov-a/m1',label:'prov-a/m1 — Model One'}],'catalog flattens to provider/id options');
assert.equal(client.modelOptionsOf(null).length,0,'no catalog yields no options (picker degrades to text)');
assert.equal(client.modelOptionsOf({groups:'bad'}).length,0,'malformed catalog yields no options');
console.log('PASS per-member model: schema clamp (4 samples), settings round trip, data-driven catalog');

for (const id of ['model+variant','@org/model','model normal','org/model',' trailing ']) {
 const value='local/'+id;
 assert.equal(clampModel(value),value);assert.equal(client.clampMemberModel(value),value);
 assert.deepEqual(modelRoute(value),{provider:'local',model:id});
 const options=client.modelOptionsOf({groups:[{id:'local',models:[{id}]}],failures:[{id:'broken'}]});
 assert.equal(options[0].value,value);
 me.update('works',{model:value});assert.equal(await me.save(),true);assert.equal(mf.getSnapshot().value.members.find(x=>x.key==='works').model,value);
}
me.update('works',{model:'not-a-route'});assert.equal(await me.save(),false);assert.equal(me.state.errors.works,'member.error.model');
me.cancel();assert.notEqual(me.state.draft.works.model,'not-a-route');
me.update('works',{model:''});assert.equal(await me.save(),true);assert.equal(mf.getSnapshot().value.members.find(x=>x.key==='works').model,'');
console.log('PASS opaque IDs round-trip, failed providers isolated, invalid route rejects Save, cancel and clear persist');
