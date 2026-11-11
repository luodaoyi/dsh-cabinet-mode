// Pure client regressions using the published Session event shapes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8');
let client;
const React = { createElement: (type, props, ...children) => ({type, props, children}), useState: () => [false, () => {}] };
vm.runInNewContext(source.replace('return { inject, apply };', 'return { groupChatFold, mergeGroupChat, GroupChatRow, cabinetGroupRetain, zh, en };'), {window:{__ModuleLoader__:{load:({factory}) => {client=factory(()=>React);}}}});
const event=(type,seq,data,time=seq*1000)=>({type:'event',event:{type,seq,time,data}});
const text=content=>[{type:'text',text:content}];
const user=(seq,value,kind='user')=>event('user/message',seq,{id:'u'+seq,role:'user',source:{kind},content:text(value)});
const assistant=(seq,value,turn=1,step=seq)=>event('assistant/message',seq,{turn,step,message:{role:'assistant',content:text(value)},stream:[]});
const call=(seq,id,turn=1,step=seq-1)=>event('tool/call',seq,{callId:id,name:'read',arguments:'{}',turn,step});
const fold=entries=>client.groupChatFold(entries);
const plain=value=>JSON.parse(JSON.stringify(value));
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS '+name);}
check('official direct user shape and context attribution',()=>{
 const rows=fold([user(1,'human'),user(2,'notice','context'),event('user/message',3,{role:'user',content:text('unknown origin')})]).rows;
 assert.deepEqual(plain(rows.map(r=>[r.kind,r.text])),[['user','human'],['input','notice'],['input','unknown origin']]);
});
check('only plain text blocks, never reasoning or arbitrary block.text',()=>{
 const a=assistant(1,'answer');a.event.data.message.content.unshift({type:'reasoning',text:'hidden'},{type:'unknown',text:'hidden2'});
 assert.equal(fold([a]).rows[0].text,'answer');
});
check('two same-step tools belong once to their own assistant, not human or prior steps',()=>{
 const rows=fold([user(1,'request'),assistant(2,'A',1,1),call(3,'a',1,1),assistant(4,'B',1,2),call(5,'b',1,2)]).rows;
 assert.deepEqual(plain(rows.map(r=>r.tools.map(t=>t.callId))),[[],['a'],['b']]);
 assert.equal(new Set(rows.flatMap(r=>r.tools.map(t=>t.callId))).size,2);
});
check('empty assistant with tool blocks retains exact step ownership',()=>{
 const a=assistant(1,'',3,4);a.event.data.message.content=[{type:'tool-call',id:'c',name:'read',arguments:'{}'}];
 const rows=fold([a,call(2,'c',3,4)]).rows;assert.equal(rows.length,1);assert.equal(rows[0].tools[0].callId,'c');
});
check('call identity not clock window, timestamps may coincide or span ten minutes',()=>{
 const a=assistant(2,'A',1,1),b=assistant(3,'B',1,2),c=call(4,'a',1,1);c.event.time=9e8;
 assert.deepEqual(plain(fold([a,b,c]).rows.map(r=>r.tools.map(t=>t.callId))),[['a'],[]]);
});
check('orphan calls keep actual chronology and never attach to user',()=>{
 const rows=fold([call(1,'orphan',7,7),user(2,'request'),assistant(3,'answer',1,1)]).rows;
 assert.equal(rows[0].kind,'tools');assert.equal(rows[0].time,1000);assert.equal(rows[1].tools.length,0);
});
check('legacy fallback does not cross user-message boundaries',()=>{
 const c=call(4,'c');delete c.event.data.turn;delete c.event.data.step;
 const rows=fold([assistant(1,'A'),user(2,'new'),c]).rows;
 assert.equal(rows.find(r=>r.kind==='assistant').tools.length,0);assert.equal(rows.find(r=>r.kind==='tools').tools.length,1);
});
check('duplicate tool calls count once',()=>{
 const rows=fold([assistant(1,'A',1,1),call(2,'c',1,1),call(3,'c',1,1)]).rows;
 assert.equal(rows[0].tools.length,1);
});
check('known but missing step remains independent',()=>{
 const rows=fold([assistant(1,'A',1,1),call(2,'c',1,2)]).rows;
 assert.equal(rows.find(r=>r.kind==='assistant').tools.length,0);
 assert.equal(rows.find(r=>r.kind==='tools').tools[0].callId,'c');
});
check('same step number in distinct turns cannot merge',()=>{
 const rows=fold([assistant(1,'A',1,1),assistant(2,'B',2,1),call(3,'c',2,1)]).rows;
 assert.deepEqual(plain(rows.map(r=>r.tools.map(t=>t.callId))),[[],['c']]);
});
check('image-only user input still breaks legacy ownership',()=>{
 const u=user(2,'');u.event.data.content=[{type:'image',url:'fixture'}];
 const c=call(3,'c');delete c.event.data.turn;delete c.event.data.step;
 const rows=fold([assistant(1,'A'),u,c]).rows;
 assert.equal(rows.find(r=>r.kind==='assistant').tools.length,0);
 assert.equal(rows.find(r=>r.kind==='tools').tools.length,1);
});
check('result arriving before retained call still pairs by ID',()=>{
 const r=event('tool/result',1,{message:{toolCallId:'c',content:text('done')}});
 assert.equal(fold([r,call(2,'c')]).rows[0].tools[0].text,'done');
});
const live=(attempt,seq,turn,step,value)=>({type:'transient',event:{type:'assistant/live-chunk',seq,time:1000+seq,data:{attemptId:attempt,turn,step,chunk:{type:'text-delta',text:value}}}});
check('durable official turn/step supersedes live suffix without attemptId',()=>{
 const rows=fold([live('a',.5,1,1,'answer'),assistant(1,'answer',1,1)]).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].kind,'assistant');
});
check('other live attempt preserved, fractional seq not rounded',()=>{
 const value=fold([live('a',.5,1,1,'a'),live('b',.75,2,1,'b'),assistant(1,'a',1,1)]);
 assert.equal(value.liveText,'b');assert.equal(value.rows.find(r=>r.kind==='live').seq,.75);
});
check('re-fold after aborted live is empty, no state retained by reducer',()=>{fold([live('a',.5,1,1,'partial')]);assert.equal(fold([]).liveText,'');assert.equal(fold([]).rows.length,0);});
const nodes=node=>node && typeof node==='object' ? [node,...(node.children||[]).flat(Infinity).flatMap(nodes)] : [];
check('human/context headers never impersonate member identity',()=>{
 for(const [kind,label] of [['user','User'],['input','Context input']]){
  const row=client.GroupChatRow({row:{kind,text:'input',tools:[],time:1},member:{name:'works'},t:k=>client.en[k]});const all=nodes(row);
  assert.ok(all.some(n=>n.props?.name==='neutral' && n.props?.size===20));assert.ok(all.some(n=>n.props?.key==='name'&&n.children[0].startsWith(label+' · ')));
 }
});
// Execute the actual headless runner with controlled browser failures. This
// verifies diagnostic cleanup only; it is not browser/layout acceptance.
const browserSource=fs.readFileSync(new URL('./test-groupchat-browser.mjs',import.meta.url),'utf8');
const headlessStart=browserSource.indexOf("if(process.argv.includes('--headless')){");
assert.notEqual(headlessStart,-1,'headless runner exists');
for(const scenario of [
 {name:'normal screenshot',screenshots:1},
 {name:'group assertion failure',fail:'group',screenshots:1},
 {name:'keyboard assertion failure',fail:'keyboard',screenshots:1},
 {name:'failed diagnostic screenshot preserves group error',fail:'group',badScreenshot:true,screenshots:1},
 {name:'failed diagnostic screenshot preserves keyboard error',fail:'keyboard',badScreenshot:true,screenshots:1},
 {name:'no screenshot configured',noScreenshot:true,screenshots:0},
 {name:'no screenshot configured on assertion failure',fail:'group',noScreenshot:true,screenshots:0},
 {name:'navigation failure before page load',fail:'goto',screenshots:0},
 {name:'browser close failure preserves assertion and closes server',fail:'group',badClose:true,screenshots:1},
 {name:'screenshot and browser close failures preserve assertion',fail:'keyboard',badScreenshot:true,badClose:true,screenshots:1},
 {name:'browser close failure is reported without a primary error',badClose:true,screenshots:1},
]){
 const original=Error(scenario.name),closeError=Error('browser close failed'),shots=[];let evaluated=0,closed=0,serverClosed=0;
 const page={on(){},async goto(){if(scenario.fail==='goto')throw original},
  async evaluate(){if(++evaluated===1){if(scenario.fail==='group')throw original;return{passed:['fixture']}}return{}},
  locator(){return{first(){return{async focus(){}}}}},keyboard:{async press(){}},
  async waitForFunction(){if(scenario.fail==='keyboard')throw original},
  async screenshot(options){shots.push(options);if(scenario.badScreenshot)throw Error('diagnostic screenshot failed')},
 };
 let caught;
 try{await vm.runInNewContext('(async()=>{'+browserSource.slice(headlessStart)+'})()',{
  process:{argv:['--headless'],env:{CHROME_PATH:'/fixture/chromium',...(!scenario.noScreenshot&&{CABINET_SCREENSHOT:'/fixture/evidence.png'})}},
  require(){return{chromium:{async launch(){return{async newPage(){return page},async close(){closed++;if(scenario.badClose)throw closeError}}}}}},
  server:{close(){serverClosed++}},url:'http://fixture.invalid',console:{log(){}},
 })}catch(error){caught=error}
 assert.equal(caught,scenario.fail?original:scenario.badClose?closeError:undefined,scenario.name+' preserves original outcome');
 assert.equal(shots.length,scenario.screenshots,scenario.name+' screenshot attempts');
 for(const shot of shots){assert.equal(shot.path,'/fixture/evidence.png');assert.equal(shot.fullPage,true)}
 assert.equal(closed,1);assert.equal(serverClosed,1);checks++;console.log('PASS runner cleanup: '+scenario.name);
}
console.log('PASS group-chat regressions: '+checks);
