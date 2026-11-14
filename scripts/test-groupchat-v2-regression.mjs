import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const dir=process.argv[2]||fileURLToPath(new URL('..',import.meta.url));
const src=fs.readFileSync(dir+'/client.js','utf8');
let api;
vm.runInNewContext(src.replace('return { inject, apply };','return { groupChatFold, cabinetSessionGroups, groupFoldToken };'),{window:{__ModuleLoader__:{load:({factory})=>api=factory(()=>({createElement(){}}))}}});
const memo=()=>{let prev,cache;return {useMemo(fn,deps){if(!prev||deps.some((x,i)=>x!==prev[i])){cache=fn();prev=deps;}return cache;}}};
const ev=(type,seq,data)=>({type:'event',event:{type,seq,time:seq*1000,data}});
const base=[ev('assistant/message',1,{message:{role:'assistant',content:[{type:'text',text:'working'}]}}),ev('tool/call',2,{callId:'c',name:'bash',arguments:'{}'})];
let fold=api.groupChatFold(base);
const updated=api.groupChatFold([...base,ev('tool/result',3,{message:{toolCallId:'c',content:[{type:'text',text:'DONE'}]}})]);
const part=src.slice(src.indexOf('const groupRowsSignature ='),src.indexOf('// A member without a live view',src.indexOf('const groupRowsSignature =')));
const ctx={chatMembers:[{id:'s',name:'lead'}],group:{views:()=>({fold})},groupFoldToken:api.groupFoldToken,mergeGroupChat:x=>x,React:memo()};
const render=()=>vm.runInNewContext('(function(){'+part+'return {signature:groupRowsSignature,rows:groupRows};})()',ctx);
const first=render();fold=updated;const second=render();
assert.notEqual(first.signature,second.signature);
assert.equal(second.rows[0].tools[0].text,'DONE');assert.equal(updated.rows[0].tools[0].text,'DONE');
const choices=[{id:'s',updatedAt:1}];
const groupCode=src.match(/const sessionGroups = React.useMemo\([^\n]+/)[0];
const groupCtx={React:memo(),choices,archivedSignature:'',workspaceSnapshot:{items:[{workspaceId:'A',title:'Alpha',sessionIds:['s']}],archivedSessionIds:[]},tt:()=>'',cabinetSessionGroups:api.cabinetSessionGroups};
const groups=()=>vm.runInNewContext('(function(){'+groupCode+'return sessionGroups;})()',groupCtx);
assert.equal(groups()[0].key,'A');groupCtx.workspaceSnapshot={items:[{workspaceId:'B',title:'Beta',sessionIds:['s']}],archivedSessionIds:[]};
assert.equal(groups()[0].key,'B');assert.equal(api.cabinetSessionGroups(choices,groupCtx.workspaceSnapshot,'')[0].key,'B');
console.log("PASS actual memo tool-result update and workspace move");

const wrapper=src.slice(src.indexOf('const promptSession = (id, content, mode)'),src.indexOf('React.useEffect(() => {',src.indexOf('const promptSession = (id, content, mode)')));
const submit=src.slice(src.indexOf('const submit = () => {',src.indexOf('const insertMention')),src.indexOf('const composer =',src.indexOf('const submit = () => {',src.indexOf('const insertMention'))));

for (const failure of ['rejection','transport','no-ack','gateway/internal','gateway/cancelled']) {
 const accepted=[],messages=[],clears=[];
 const ctx={Promise,sessionOf:id=>({prompt:async(content)=>{accepted.push({id,content});if(failure==='transport')throw Error('response lost after accept');if(failure==='no-ack')return undefined;if(failure.startsWith('gateway/'))return {ok:false,error:{code:failure,message:'carrier fault'}};return {ok:false,error:'rejected'};}}),draft:'@Member do task',sendingRef:{current:false},sendable:true,mentionTargetOf:()=>({id:'member',label:'Member'}),target:'lead',tt:k=>k==='groupchat.composer.failed'?'FAILED: {error}':k,setMentionNotice(){},setSending(){},setSendError:e=>messages.push(e),setDraft:v=>clears.push(v),setMentions(){},setMentionOpen(){}};
 vm.createContext(ctx);vm.runInContext(wrapper+'\nglobalThis.group={promptSession,canPrompt:()=>true};\n'+submit+'\nsubmit();',ctx);await new Promise(r=>setTimeout(r,20));
 assert.deepEqual(accepted.map(x=>x.id),['member']);assert.deepEqual(clears,[]);assert.equal(ctx.sendingRef.current,false);
 assert.ok(messages.some(m=>failure==='rejection'?String(m).includes('rejected'):String(m).includes('groupchat.composer.unknown')));
 console.log('PASS no automatic resend or draft clearing: '+failure);
}
