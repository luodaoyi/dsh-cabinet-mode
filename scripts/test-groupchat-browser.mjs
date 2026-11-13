// Real React/DOM on loopback, synthetic session services, no user profile or models.
// Dependencies in DSH_BROWSER_TEST_ROOT: react, react-dom, esbuild (+ playwright-core for --headless).
// CHROME_PATH selects an existing Chromium for --headless; no browser download.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
const root=process.env.DSH_BROWSER_TEST_ROOT;
if(!root) throw Error('Set DSH_BROWSER_TEST_ROOT to isolated npm test dependencies');
const require=createRequire(root+'/package.json');
const source=fs.readFileSync(new URL('../client.js',import.meta.url),'utf8').replace('return { inject, apply };', 'return { inject, apply, CabinetPanel, STYLE_CSS, en, zh, AVATARS, setMemberConfig, memberListenersCount: () => MEMBER_LISTENERS.size, setSessions: s => { cabinetSessions = s; for (const fn of cabinetSessionsListeners) fn(); } };');
const fixture=`
import React from 'react';import {createRoot} from 'react-dom/client';
window.__ModuleLoader__={load:({factory})=>window.cabinet=factory(()=>React)};
${source}
const style=document.createElement('style');style.textContent=cabinet.STYLE_CSS;document.head.append(style);
const errors=[];window.addEventListener('error',e=>errors.push(e.message));
const root=createRoot(document.getElementById('panel'));
const timers=new Set(),originalSet=window.setInterval,originalClear=window.clearInterval;
window.setInterval=(fn,ms)=>{const id=originalSet(fn,ms);timers.add(id);return id};window.clearInterval=id=>{timers.delete(id);originalClear(id)};
const allMembers=[{id:'lead',name:'lead',role:'lead',phase:'active'},{id:'mate',name:'works',role:'teammate',phase:'active'}];
let activeTab='roster';let members=allMembers,mounted=true,language='en',service=null,retained=0,released=0,subscriptions=0;
const event=(type,seq,data,time=seq*1000)=>({type:'event',event:{type,seq,time,data}});
const content=text=>[{type:'text',text}];
const events=(prefix,offset=0)=>[
 event('user/message',1,{id:'u',role:'user',source:{kind:'user',rpcId:'fixture'},content:content(prefix+' user')},1000+offset),
 event('user/message',1.5,{id:'relay',role:'user',source:{kind:'relay'},content:content(prefix+' context')},1500+offset),
 event('assistant/message',2,{turn:1,step:1,message:{role:'assistant',content:[{type:'reasoning',text:'PRIVATE REASONING'},...content(prefix+' answer')]},stream:[]},2000+offset),
 event('tool/call',3,{turn:1,step:1,callId:prefix+'-a',name:'read_file',arguments:'{"path":"example.txt"}'},3000+offset),
 event('assistant/message',4,{turn:1,step:2,message:{role:'assistant',content:[{type:'tool-call',id:prefix+'-b',name:'search',arguments:'{}'}]},stream:[]},4000+offset),
 event('tool/call',5,{turn:1,step:2,callId:prefix+'-b',name:'search',arguments:'{}'},5000+offset)
];
function channel(entries){let revision=0;const listeners=new Set();return{getSnapshot(){if(this.fail)throw Error('read failed');return{entries,revision}},subscribe(fn){subscriptions++;listeners.add(fn);return()=>{subscriptions--;listeners.delete(fn)}},push(next){entries=next;revision++;for(const fn of listeners)fn()}}}
const deliveries=[];function createService({bad,delay=false}={}){const channels={lead:channel(events('Lead')),mate:channel(events('Works',500))},ready=[];return{channels,ready,refreshProjections:async()=>{},retain(id,options){if(id===bad)throw Error('unavailable '+id);if(typeof id!=='string'||options.source!=='cabinetGroupChat')throw Error('wrong retain contract');retained++;let stopped=false;return{ready:delay?new Promise(r=>ready.push(r)):Promise.resolve(),get binding(){if(stopped)throw Error('released');return{eventSource:channels[id],session:{prompt:async()=>{deliveries.push(id);throw Error('accepted but acknowledgement lost')}}}},release(){if(stopped)throw Error('double release');stopped=true;released++}}}}}
function render(){root.render(mounted?React.createElement(React.StrictMode,null,React.createElement(cabinet.CabinetPanel,{sessionId:'lead',activeTab,hideTabs:true,useSession:fn=>fn({}),useSessions:fn=>fn({projectionsBySession:{lead:{values:{agentTeam:{members,tasks:[]}}}}}),useSessionStatus:fn=>fn(new Map()),t:k=>cabinet[language][k]||k})):null)}
const wait=()=>new Promise(r=>setTimeout(r,70));
const assert=(v,m)=>{if(!v)throw Error(m)};
const tab=id=>({click(){activeTab=id;render()}});
const tools=()=>[...document.querySelectorAll('[data-cabinet-groupchat-tools]')];
const active=()=>retained-released;
const setService=async next=>{service=next;cabinet.setSessions(next);await wait()};
window.groupChecks=async()=>{const passed=[];try{
 render();await wait();assert(activeTab==='roster','roster remains default');assert(active()===0,'default no retention');passed.push('default roster');
 await setService(createService());tab('groupchat').click();await wait();assert(active()===2&&subscriptions===2,'active pair');assert(document.querySelectorAll('[data-cabinet-groupchat-row="user"]').length===2,'official user shape');assert(document.querySelector('[data-cabinet-groupchat-row="user"]').textContent.includes('user'),'human content');assert(!document.querySelector('[data-cabinet-groupchat-row="input"]'),'context rows hidden');assert(!document.getElementById('panel').textContent.includes('PRIVATE REASONING'),'reasoning hidden');passed.push('official-shaped text and identity');
 assert([...document.querySelectorAll('[data-cabinet-groupchat-row="assistant"]')].filter(row=>!row.querySelector('[data-cabinet-groupchat-text]')&&row.querySelector('[data-cabinet-groupchat-tools="1"]')).length===2,'tool-only step owns one call');assert(tools().length===4&&tools().reduce((n,b)=>n+Number(b.dataset.cabinetGroupchatTools),0)===4,'unique tool ownership');tools()[0].click();await wait();assert(document.querySelectorAll('[data-cabinet-groupchat-tool]').length===1,'tool expanded');const before=event('user/message',0,{id:'older',role:'user',source:{kind:'user',rpcId:'fixture'},content:content('older')},0);service.channels.lead.push([before,...events('Lead')]);await wait();assert(document.querySelector('[data-cabinet-groupchat-tool]').textContent.includes('read_file'),'row expansion stable after earlier insert');tools()[0].click();await wait();assert(!document.querySelector('[data-cabinet-groupchat-tool]'),'tool collapsed');passed.push('unique tools and repeated expand');
 const live=event('assistant/live-chunk',5.5,{attemptId:'attempt',turn:2,step:1,chunk:{type:'text-delta',text:'streaming'}});live.type='transient';service.channels.lead.push([...events('Lead'),live]);await wait();assert(document.querySelectorAll('[data-cabinet-groupchat-row="live"]').length===1,'live');service.channels.lead.push([...events('Lead'),live,event('assistant/message',6,{turn:2,step:1,message:{content:content('streaming')},stream:[]})]);await wait();assert(!document.querySelector('[data-cabinet-groupchat-row="live"]'),'no duplicate live');assert([...document.querySelectorAll('[data-cabinet-groupchat-text]')].filter(n=>n.textContent==='streaming').length===1,'settled once');passed.push('stream settlement');
 service.channels.mate.fail=true;service.channels.mate.push([]);await wait();assert(document.querySelector('[data-cabinet-groupchat-error]'),'read error visible with cached history');service.channels.mate.fail=false;service.channels.mate.push(events('Recovered'));await wait();assert(!document.querySelector('[data-cabinet-groupchat-error]'),'read recovery');passed.push('snapshot failure and recovery');
 await setService(null);assert(active()===0&&subscriptions===0,'service cleanup');assert(document.querySelectorAll('[data-cabinet-groupchat-error]').length===2,'service errors despite cached history');assert([...document.querySelectorAll('[data-cabinet-groupchat-row]')].slice(-2).every(n=>n.dataset.cabinetGroupchatRow==='error'),'errors last');passed.push('service loss visible');
 await setService(createService());assert(active()===2&&subscriptions===2&&!document.querySelector('[data-cabinet-groupchat-error]'),'reconnect');passed.push('reconnect');
 for(let i=0;i<3;i++){tab('roster').click();await wait();assert(active()===0&&subscriptions===0,'tab release');tab('groupchat').click();await wait();assert(active()===2&&subscriptions===2,'tab retain');}passed.push('three repeated tab switches');
 members=[allMembers[0]];render();await wait();assert(active()===1&&subscriptions===1,'member removed');assert(!document.getElementById('panel').textContent.includes('Works answer'),'no removed member history');members=allMembers;render();await wait();assert(active()===2,'member added');passed.push('roster replacement');
 await setService(createService({bad:'mate'}));assert(active()===1&&document.querySelectorAll('[data-cabinet-groupchat-error]').length===1,'one failed member');assert(document.getElementById('panel').textContent.includes('Lead answer'),'other member survives');passed.push('one member failure');
 const delayed=createService({delay:true});await setService(delayed);mounted=false;render();await wait();delayed.ready.forEach(r=>r());await wait();assert(active()===0&&subscriptions===0&&timers.size===0,'late ready/unmount');passed.push('unmount pending ready');
 mounted=true;members=allMembers;language='zh';render();await wait();await setService(createService());tab('groupchat').click();await wait();assert(document.querySelector('[data-cabinet-groupchat-row="user"]').textContent.includes('user'),'human text in Chinese UI');assert(!document.querySelector('[data-cabinet-groupchat-row="input"]'),'context remains hidden');passed.push('Chinese labels');
 // Same roster and phase: only the actual singleton config notification changes.
 const configActive=active(),configSubscriptions=subscriptions,configRetained=retained;
 const assistantNames=()=>[...document.querySelectorAll('[data-cabinet-groupchat-row="assistant"]')].map(row=>row.textContent).join(' ');
 cabinet.setMemberConfig({members:[{key:'works',name:'配置改名回归'}]});await wait();
 assert(assistantNames().includes('配置改名回归'),'saved alias invalidates bubble memo without roster change');
 cabinet.setMemberConfig({members:[{key:'works',name:'再次改名回归'}]});await wait();
 assert(assistantNames().includes('再次改名回归')&&!assistantNames().includes('配置改名回归'),'second config notification updates bubble');
 cabinet.setMemberConfig(undefined);await wait();
 assert(assistantNames().includes('工部尚书')&&!assistantNames().includes('再次改名回归'),'config reset restores bubble nickname');
 assert(active()===configActive&&subscriptions===configSubscriptions&&retained===configRetained,'nickname updates must not reacquire session references');passed.push('live singleton nickname notifications and reset');
 const panel=document.getElementById('panel');panel.style.width='340px';await wait();if(!window.fixtureDomOnly)assert(panel.scrollWidth<=panel.clientWidth+1,'narrow overflow');assert(!document.querySelector('button button'),'nested buttons');assert(errors.length===0,'browser errors '+errors.join(';'));passed.push(window.fixtureDomOnly?'DOM validity (layout not tested)':'340px width and DOM');
 window.deliveryStats=()=>deliveries.slice();window.groupStats=()=>({retained,released,subscriptions,timers:timers.size,errors});window.groupUnmount=async()=>{mounted=false;render();await wait();assert(active()===0&&subscriptions===0&&timers.size===0&&cabinet.memberListenersCount()===0,'final cleanup including config subscription');return window.groupStats()};
 document.getElementById('result').textContent='PASS '+passed.length+' '+passed.join('; ');return{passed,stats:window.groupStats()};
 }catch(e){document.getElementById('result').textContent='FAIL '+e.stack;throw e}};
document.getElementById('run').onclick=()=>window.groupChecks();render();
`;
const bundle=require('esbuild').buildSync({stdin:{contents:fixture,resolveDir:root},bundle:true,format:'iife',write:false}).outputFiles[0].contents;
const html='<!doctype html><meta charset="utf-8"><title>Cabinet group chat regression</title><style>body{font:14px system-ui;margin:20px}#panel{width:900px;max-width:100%;height:650px;overflow:auto}#result{white-space:pre-wrap;overflow-wrap:anywhere}</style><button id="run">Run group chat checks</button><pre id="result"></pre><div id="panel"></div><script src="/fixture.js"></script>';
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?bundle:html)});
if(!process.argv.includes('--dom')) await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=process.argv.includes('--dom')?'http://localhost/':'http://127.0.0.1:'+server.address().port;console.log(url);
if(process.argv.includes('--dom')){
 try{
  const {JSDOM}=require('jsdom');
  const dom=new JSDOM(html.replace('<script src="/fixture.js"></script>',''),{url,runScripts:'dangerously',pretendToBeVisual:true});
  dom.window.fixtureDomOnly=true;
  dom.window.ResizeObserver=class{observe(){} disconnect(){}};
  dom.window.eval(Buffer.from(bundle).toString());
  console.log('DOM ONLY (no layout/keyboard): '+JSON.stringify(await dom.window.groupChecks()));
  console.log(JSON.stringify(await dom.window.groupUnmount()));dom.window.close();
 }finally{server.close();}
}
if(process.argv.includes('--headless')){
 let browser,page,pageLoaded=false,failed=false;
 try{
  if(!process.env.CHROME_PATH) throw Error('Set CHROME_PATH to an existing Chromium');
  browser=await require('playwright-core').chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']});
  page=await browser.newPage({viewport:{width:1050,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(url);pageLoaded=true;const result=await page.evaluate(()=>window.groupChecks());
  // Native keyboard behavior (not synthetic click()).
  const button=page.locator('[data-cabinet-groupchat-tools]').first();await button.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('[data-cabinet-groupchat-tools]').getAttribute('aria-expanded')==='true');await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelector('[data-cabinet-groupchat-tools]').getAttribute('aria-expanded')==='false');
  // Send using native input and mention selection, not a synthetic handler call.
  const input=page.locator('[data-cabinet-groupchat-input]');
  await input.fill('@');await page.locator('[data-cabinet-mention-panel] button').last().click();
  await input.press('End');await input.pressSequentially(' audit delivery');
  const originalDraft=await input.inputValue();
  await page.locator('[data-cabinet-groupchat-send]').click();
  await page.waitForFunction(()=>window.deliveryStats().length===1 && document.querySelector('[data-cabinet-groupchat-send]').dataset.cabinetGroupchatSending==='0');
  await page.waitForTimeout(150);
  const delivery=await page.evaluate(()=>window.deliveryStats());
  if(delivery.length!==1||delivery[0]!=='mate'||await input.inputValue()!==originalDraft)throw Error('unknown acknowledgement must preserve draft and never forward to Lead');
  result.deliveryUnknownNoResend=true;
  if(process.env.CABINET_SCREENSHOT)await page.screenshot({path:process.env.CABINET_SCREENSHOT,fullPage:true});
  const stats=await page.evaluate(()=>window.groupUnmount());if(errors.length)throw Error(errors.join('\n'));console.log(JSON.stringify({...result,keyboard:true,final:stats}));
 }catch(error){
  failed=true;
  // Failure evidence is best-effort and must not replace the assertion error.
  if(pageLoaded&&process.env.CABINET_SCREENSHOT){
   try{await page.screenshot({path:process.env.CABINET_SCREENSHOT,fullPage:true});}catch{}
  }
  throw error;
 }finally{
  try{await browser?.close();}catch(error){if(!failed)throw error;}
  finally{server.close();}
 }
}
