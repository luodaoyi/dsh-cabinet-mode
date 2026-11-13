import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('../client.js',import.meta.url),'utf8');
const code=src.slice(src.indexOf('\t\tfunction useCabinetGroupChat('),src.indexOf('\n\t\t// ---------- markdown:',src.indexOf('\t\tfunction useCabinetGroupChat(')));
let slots=[],i=0,pending=[],sources=new Map(),releases=0;
const React={useState(init){const n=i++;slots[n]??={v:init};return [slots[n].v,x=>{slots[n].v=typeof x==='function'?x(slots[n].v):x}]},useRef(init){const n=i++;return slots[n]??={current:init}},useEffect(fn,deps){const n=i++;const old=slots[n];if(!old||deps.some((x,j)=>x!==old.deps[j]))pending.push(()=>{old?.cleanup?.();slots[n]={deps,cleanup:fn()}})}};
const ctx={React,AbortController,Promise,Map,JSON,Array,groupChatEmptyView:()=>({fold:null,error:null}),groupChatFold:entries=>({entries,liveText:''}),GROUP_UNAVAILABLE:'unavailable',cabinetGroupRetain:id=>{const source=sources.get(id);return {get binding(){if(source.bindingError)throw Error('binding gone');return {eventSource:source,session:{prompt:source.prompt||(()=>Promise.reject(Error('ack lost')))}}},ready:Promise.resolve(),release(){releases++}}}};
vm.createContext(ctx);vm.runInContext(code+'\nthis.hook=useCabinetGroupChat;',ctx);
const service={};let group;
async function render(ids,tab='groupchat',svc=service){i=0;pending=[];group=ctx.hook(ids.map(id=>({id})),tab,svc);pending.forEach(f=>f());await Promise.resolve();await Promise.resolve();return group}
const source=(text,revision=1)=>({revision,text,getSnapshot(){if(this.fail)throw Error('snapshot gone');return {revision:this.revision,entries:[this.text]}},subscribe(){return ()=>{}}});
sources.set('a',source('old'));await render(['a']);assert.equal(group.views('a').fold.entries[0],'old');
sources.get('a').fail=true;group.forceSync();assert.equal(group.views('a').fold,null);assert.match(group.views('a').error,/snapshot gone/);console.log('PASS snapshot error clears stale content');
sources.get('a').fail=false;sources.get('a').bindingError=true;group.forceSync();assert.equal(group.views('a').fold,null);assert.match(group.views('a').error,/binding gone/);console.log('PASS binding error clears stale content');
sources.get('a').bindingError=false;group.forceSync();assert.equal(group.views('a').fold.entries[0],'old');assert.equal(group.views('a').error,null);await render(['a'],'roster');assert.equal(group.views('a').fold,null);sources.set('a',source('NEW',1));await render(['a']);assert.equal(group.views('a').fold.entries[0],'NEW');console.log('PASS new reference with same revision shows new content');
const oldTimerCallback=()=>groupOld.forceSync();const groupOld=group;sources.set('b',source('B1'));await render(['a','b']);sources.get('b').revision=2;sources.get('b').text='B2';oldTimerCallback();assert.equal(group.views('b').fold.entries[0],'B2');console.log('PASS original timer refreshes new membership');
let calls=0;sources.get('b').prompt=()=>{calls++;return Promise.reject(Error('ack lost'))};const result=await group.promptSession('b',[],'queue');assert.equal(calls,1);assert.equal(result.unknown,true);console.log('PASS rejected acknowledgement invokes prompt once and returns unknown=true');
console.log('release count',releases);

await render(['a'],'roster');assert.equal(releases,4);assert.equal(group.views('b').fold,null);console.log('PASS references release once and cleanup removes views');
