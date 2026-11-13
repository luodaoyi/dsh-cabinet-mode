// CabinetPage integration in real Chromium, isolated synthetic host services only.
// --dom is a preflight, NOT browser/layout validation.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
const root=process.env.DSH_BROWSER_TEST_ROOT;
if(!root)throw Error('Set DSH_BROWSER_TEST_ROOT to isolated React/esbuild/playwright-core dependencies');
const require=createRequire(root+'/package.json');
const source=fs.readFileSync(new URL('../client.js',import.meta.url),'utf8').replace('return { inject, apply };','return { inject, apply, CabinetPage, STYLE_CSS, en };');
const fixture=`
import React from 'react';import {createRoot} from 'react-dom/client';
window.__ModuleLoader__={load:({factory})=>window.cabinet=factory(()=>React)};
${source}
const style=document.createElement('style');style.textContent=cabinet.STYLE_CSS;document.head.append(style);
const errors=[];window.addEventListener('error',e=>errors.push(e.message));
const assert=(v,m)=>{if(!v)throw Error(m)};
const wait=()=>new Promise(r=>setTimeout(r,90));
const now=Date.now(),ids=['a','b','archived','blank','child','old','orphan'];
const team=id=>({members:[{id,name:'lead',role:'lead',phase:'active'},{id:id+'-mate',name:'works',role:'teammate',phase:'active'}],tasks:[]});
let list={ids,byId:Object.fromEntries(ids.map((id,i)=>[id,{id,title:'Session '+id,updatedAt:now-i*1000,blank:id==='blank',...(id==='child'?{parentSessionId:'a'}:{}),...(id==='old'?{updatedAt:now-40*86400000}:{})}])),projectionsBySession:Object.fromEntries(ids.map(id=>[id,{values:{agentTeam:team(id)}}]))};
let ws={items:[{workspaceId:'w1',title:'Alpha',sessionIds:['a','archived','blank','child','old']},{workspaceId:'w2',title:'Beta',sessionIds:['b']}],archivedSessionIds:['archived'],pinnedSessionIds:[]};
const wsListeners=new Set(),opens=[],cleanups=[];let retained=0,released=0,subscriptions=0;
const workspaces={list:{getSnapshot:()=>ws,subscribe:fn=>{wsListeners.add(fn);return()=>wsListeners.delete(fn)}}};
const sessions={refreshProjections:async()=>{},retain(id){retained++;let stopped=false;const channel={getSnapshot:()=>({revision:1,entries:[]}),subscribe:()=>{subscriptions++;return()=>subscriptions--}};return{ready:Promise.resolve(),binding:{eventSource:channel},release(){assert(!stopped,'double release');stopped=true;released++}}}};
const services={workspaces,sessions,uiWorkspace:{openSession:target=>opens.push(target)}};
// Exercise actual optional service-injection callbacks. Skip unrelated slot/locale effects.
cabinet.apply({effect(){},locale:{bind:()=>key=>cabinet.en[key]||key},inject(names,fn){if(names.length===1&&services[names[0]])fn({...services,effect(run){const off=run();if(typeof off==='function')cleanups.push(off)}})}});
const root=createRoot(document.getElementById('page'));let mounted=true;
function render(){root.render(mounted?React.createElement(React.StrictMode,null,React.createElement(cabinet.CabinetPage,{useSessions:fn=>fn(list),useSessionStatus:fn=>fn(new Map()),t:key=>cabinet.en[key]||key})):null)}
const q=s=>document.querySelector(s);const click=s=>{assert(q(s),'missing '+s);q(s).click()};
window.pageFixture={
 async mount(){mounted=true;render();await wait()},
 async unmount(){mounted=false;render();await wait();assert(retained===released&&subscriptions===0,'retained references cleaned');assert(document.body.style.cursor===''&&document.body.style.userSelect==='','drag styles cleaned');},
 async dispose(){await this.unmount();cleanups.reverse().forEach(fn=>fn());assert(wsListeners.size===0,'workspace subscription cleanup');},
 stats:()=>({retained,released,subscriptions,workspaceSubscriptions:wsListeners.size,opens:opens.slice(),errors}),
 async checks(){const passed=[];render();await wait();
 assert(q('[data-cabinet-page-session]').value==='a','default newest visible session');
 assert(document.querySelectorAll('[data-cabinet-conversation-group]').length===3,'two workspaces and ungrouped');
 assert([...document.querySelectorAll('[data-cabinet-conversation-group]')].every(n=>n.dataset.cabinetConversationGroupCollapsed==='1'),'groups initially collapsed');
 click('[data-cabinet-conversation-group-title="w1"]');click('[data-cabinet-conversation-group-title="w2"]');await wait();
 assert(q('[data-cabinet-conversation-id="a"]')&&q('[data-cabinet-conversation-id="b"]'),'visible workspace members');
 for(const id of ['archived','blank','child','old'])assert(!q('[data-cabinet-conversation-id="'+id+'"]'),'filtered '+id);passed.push('workspace grouping and filters');
 click('[data-cabinet-conversation-id="b"]');await wait();assert(q('[data-cabinet-page-session]').value==='b','row selection syncs dropdown');assert(opens.length===0,'select does not navigate');
 const select=q('[data-cabinet-page-session]');select.value='a';select.dispatchEvent(new Event('change',{bubbles:true}));await wait();assert(q('[data-cabinet-conversation-id="a"]').dataset.cabinetConversationSelected==='1','dropdown syncs row');passed.push('selection synchronization');
 click('[data-cabinet-open-native="b"]');await wait();assert(opens.length===1&&opens[0]==='b','native opener exactly once');passed.push('native navigation target');
 const rail=q('[data-cabinet-cabinet-rail]');assert(rail.dataset.cabinetRailOpen==='1','rail default open');click('[data-cabinet-split-toggle]');await wait();assert(rail.dataset.cabinetRailOpen==='0'&&rail.style.display==='none','rail closes');click('[data-cabinet-split-toggle]');await wait();assert(rail.dataset.cabinetRailOpen==='1','rail reopens');passed.push('rail open/close');
 // No forced rerender or workspaceSnapshot prop: this must flow through host subscription.
 ws={...ws,items:[{...ws.items[0],title:'Renamed Alpha',sessionIds:['orphan']},{...ws.items[1],sessionIds:['a','b']}]};wsListeners.forEach(fn=>fn());await wait();
 assert(q('[data-cabinet-conversation-group-items="w2"] [data-cabinet-conversation-id="a"]'),'workspace move arrives without unrelated render');assert(q('[data-cabinet-conversation-group-title="w1"]').textContent.includes('Renamed Alpha'),'workspace rename arrives without unrelated render');passed.push('live workspace move and rename');
 ws={...ws,archivedSessionIds:['archived','a']};wsListeners.forEach(fn=>fn());await wait();assert(!q('[data-cabinet-conversation-id="a"]'),'new archive disappears');assert(q('[data-cabinet-page-session]').value!=='a','archived selection replaced');passed.push('live archive selection fallback');
 assert(errors.length===0,'React errors '+errors.join(';'));return passed;
 }
};
render();
`;
const bundle=require('esbuild').buildSync({stdin:{contents:fixture,resolveDir:root},bundle:true,format:'iife',write:false}).outputFiles[0].contents;
const html='<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;font:14px system-ui}#page{height:800px;width:1400px}</style><div id="page"></div><script src="/fixture.js"></script>';
if(process.argv.includes('--dom')){
 const {JSDOM}=require('jsdom');const dom=new JSDOM(html.replace('<script src="/fixture.js"></script>',''),{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true});
 try{dom.window.ResizeObserver=class{observe(){}disconnect(){}};dom.window.eval(Buffer.from(bundle).toString());console.log('DOM ONLY: '+JSON.stringify(await dom.window.pageFixture.checks()));await dom.window.pageFixture.dispose();}finally{dom.window.close()}
}else{
 const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?bundle:html)});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 const url='http://127.0.0.1:'+server.address().port;console.log(url);
 if(process.argv.includes('--headless')){
 let browser,page,failure;
 try{
 if(!process.env.CHROME_PATH)throw Error('Set CHROME_PATH to existing Chromium');
 browser=await require('playwright-core').chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']});page=await browser.newPage({viewport:{width:1450,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});await page.goto(url);
 const passed=await page.evaluate(()=>window.pageFixture.checks());
 const handle=page.locator('[data-cabinet-rail-handle]');let box=await handle.boundingBox();if(!box)throw Error('missing resize handle');
 await page.mouse.move(box.x+3,box.y+60);await page.mouse.down();await page.mouse.move(box.x-97,box.y+60,{steps:5});await page.mouse.up();
 await page.waitForFunction(()=>localStorage.getItem('dsh-cabinet:rail-width')==='460');
 const width=await page.locator('[data-cabinet-cabinet-rail]').evaluate(n=>n.getBoundingClientRect().width);if(Math.abs(width-460)>1)throw Error('real rail geometry mismatch '+width);passed.push('native drag geometry and persistence');
 await page.evaluate(async()=>{await window.pageFixture.unmount();await window.pageFixture.mount()});
 if(await page.locator('[data-cabinet-cabinet-rail]').evaluate(n=>n.getBoundingClientRect().width)!==460)throw Error('remount lost persisted width');
 box=await handle.boundingBox();await page.mouse.move(box.x+3,box.y+60);await page.mouse.down();await page.mouse.move(box.x-17,box.y+60);await page.evaluate(()=>window.pageFixture.unmount());await page.mouse.up();
 const saved=await page.evaluate(()=>localStorage.getItem('dsh-cabinet:rail-width'));if(saved!=='460')throw Error('unmounted drag listener persisted a new width');passed.push('unmount during drag cleans listeners');
 await page.evaluate(()=>window.pageFixture.mount());if(process.env.CABINET_SCREENSHOT)await page.screenshot({path:process.env.CABINET_SCREENSHOT,fullPage:true});
 await page.evaluate(()=>window.pageFixture.dispose());if(errors.length)throw Error(errors.join('\n'));console.log(JSON.stringify({passed,stats:await page.evaluate(()=>window.pageFixture.stats())}));
 }catch(error){failure=error;if(page&&process.env.CABINET_SCREENSHOT){try{await page.screenshot({path:process.env.CABINET_SCREENSHOT,fullPage:true})}catch{}}}
 finally{try{await browser?.close()}catch(e){failure??=e}server.closeAllConnections();await new Promise(r=>server.close(r));}
 if(failure)throw failure;
 }
}
