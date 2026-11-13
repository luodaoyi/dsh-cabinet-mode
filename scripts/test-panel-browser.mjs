// Isolated real-React browser fixture; no DSH process, profile or model access.
// DSH_BROWSER_TEST_ROOT must contain react, react-dom and esbuild from npm.
// Run with node, open the printed loopback URL, then Run lifecycle checks.
// --headless additionally needs playwright-core and CHROME_PATH (existing Chromium).
// CABINET_SCREENSHOT optionally captures the final page, including failures.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
const root = process.env.DSH_BROWSER_TEST_ROOT;
if (!root) throw Error('Set DSH_BROWSER_TEST_ROOT to isolated npm test dependencies');
const require = createRequire(root + '/package.json');
const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  .replace('return { inject, apply };', 'return { inject, apply, CabinetPanel, STYLE_CSS, en, setOpener: fn => cabinetOpenSession = fn, setSessions: s => { cabinetSessions = s; for (const fn of cabinetSessionsListeners) fn(); } };');
const fixture = `
import React from 'react'; import {createRoot} from 'react-dom/client';
window.__ModuleLoader__={load:({factory})=>window.cabinet=factory(()=>React)};
${source}
const style=document.createElement('style');style.textContent=cabinet.STYLE_CSS;document.head.append(style);
const errors=[];window.addEventListener('error',e=>errors.push(e.message));
let opens=[],calls=[],team,live=false,mounted=true;
const timers=new Set(),originalSet=window.setInterval,originalClear=window.clearInterval;
window.setInterval=(fn,ms)=>{const id=originalSet(fn,ms);timers.add(id);return id};
window.clearInterval=id=>{timers.delete(id);originalClear(id)};
const members=[{id:'lead',name:'lead',role:'lead',phase:'active'},{id:'mate',name:'works',role:'teammate',phase:'active'}];
// 未分派（不写 ownerName）：成员卡按用户规格「一卡只显当前任务、不挂任务列表」，
// 任务行只在组卡渲染——点击下钻断言依赖组卡的 TaskLine。
const tasks=[{id:'task',subject:'Open task session',status:'pending',blockedBy:['other']},{id:'other',subject:'Blocker task',status:'pending'}];
const root=createRoot(document.getElementById('panel'));
const stats=()=>document.getElementById('stats').textContent=JSON.stringify({opens,calls,timers:timers.size,errors});
cabinet.setOpener((...args)=>{opens.push(args);stats()});
const service={refreshProjections:async id=>{calls.push(id);stats()}};
function render(){root.render(mounted?React.createElement(cabinet.CabinetPanel,{sessionId:'lead',useSession:fn=>fn({}),useSessions:fn=>fn({projectionsBySession:{lead:{values:{agentTeam:team}},mate:{values:{tokenUsage:{outputTokens:1234},contextPressure:{projectedTokens:25,contextWindow:100},contextBreakdown:{systemTokens:1,toolsTokens:2,messageTokens:3}}}}}),useSessionStatus:fn=>fn(new Map([['mate',{running:live}]])),t:k=>cabinet.en[k]||k}):null)}
const wait=()=>new Promise(r=>setTimeout(r,80));
const assert=(condition,message)=>{if(!condition)throw Error(message)};
document.getElementById('show').onclick=()=>{team={members,tasks};cabinet.setSessions(service);render()};
document.getElementById('clear').onclick=()=>{opens=[];calls=[];stats()};
document.getElementById('width').onclick=()=>{const p=document.getElementById('panel');p.style.width=p.clientWidth>500?'340px':'900px'};
document.getElementById('run').onclick=async()=>{const passed=[];try{
  mounted=true;team=undefined;live=false;calls=[];cabinet.setSessions(null);render();await wait();
  assert(!errors.length,'empty render');passed.push('empty team');
  team={members,tasks};render();await wait();assert(document.querySelectorAll('.cabinet-card').length>=2,'team appears');assert(!calls.length,'no service');passed.push('team arrives without hook mismatch');
  cabinet.setSessions(service);await wait();assert(calls.includes('mate')&&calls.includes('lead'),'idle initial reads');passed.push('late service and idle initial reads');
  calls=[];live=true;render();await wait();assert(calls.includes('mate')&&timers.size===1,'running starts');passed.push('running transition');
  calls=[];live=false;render();await wait();assert(calls.includes('mate')&&timers.size===0,'settled read and cleanup');passed.push('stopped read and timer cleanup');
  team=undefined;render();await wait();assert(!errors.length,'team disappears');passed.push('team disappears');
  team={members,tasks};render();await wait();
  assert(!document.querySelector('button button'),'no nested buttons');passed.push('no nested buttons');
  // 新规格（用户：一卡一任务、任务行只在组卡）：组卡任务没有 member 会话可开
  // （TaskLine 注释明说 unassigned/foreign/lead-owner 一律 onOpenOwner===null），
  // subject 收成纯文本、行不可导航；点击行内只展开任务书 sheet。
  const subj=Array.from(document.querySelectorAll('#panel *')).find(e=>e.children.length===0&&e.textContent==='Open task session');
  assert(subj,'group task subject renders');
  assert(subj.tagName!=='BUTTON','group subject is plain text (no owner session to open), got '+subj.tagName);
  opens=[];subj.click();await wait();
  assert(opens.length===0,'plain subject does not navigate');
  assert(document.querySelector('[data-cabinet-task-sheet="description"]'),'subject click expands the task sheet; parentRow='+String(subj.parentElement.getAttribute('data-cabinet-task-row'))+' sheets='+document.querySelectorAll('[data-cabinet-task-sheet]').length);
  passed.push('group subject is plain and expands the sheet');
  const anchor=document.querySelector('[data-cabinet-task="task"]');
  assert(anchor,'the task row anchor renders for the edge overlay');
  assert(!String(anchor.className||'').includes('cabinet-clickable'),'an unassigned row carries no navigation opener');
  passed.push('unassigned row carries no opener');
  // 新规格锁死：任务行只在组卡（未分派等），成员卡内一个都不许有。
  const memberCards=Array.from(document.querySelectorAll('.cabinet-card')).filter(c=>c.querySelector('[data-cabinet-status]'));
  assert(memberCards.length>=1,'member cards render');
  assert(memberCards.every(c=>!c.querySelector('[data-cabinet-task]')),'member cards carry no task rows');
  assert(document.querySelectorAll('[data-cabinet-task]').length>=1,'the unassigned group card still lists tasks');
  passed.push('task rows live in group cards only');
  opens=[];const toggle=Array.from(document.querySelectorAll('#panel button')).find(e=>e.textContent.includes('blocked by'));toggle.click();assert(opens.length===0,'blocker toggle inert');passed.push('blocker toggle does not navigate');
  live=true;render();await wait();mounted=false;render();await wait();assert(timers.size===0,'unmount cleanup');assert(!errors.length,'no React errors');passed.push('unmount cleanup');
  mounted=true;live=false;render();await wait();document.getElementById('result').textContent='PASS '+passed.length+' '+passed.join('; ');stats();
}catch(e){document.getElementById('result').textContent='FAIL '+e.stack;stats()}};
window.panelUnmount=async()=>{mounted=false;render();await wait();assert(timers.size===0,'final unmount cleanup');stats();return{timers:timers.size,errors};};
render();stats();
`;
const bundle=require('esbuild').buildSync({stdin:{contents:fixture,resolveDir:root},bundle:true,format:'iife',write:false}).outputFiles[0].contents;
const html='<!doctype html><meta charset="utf-8"><title>Cabinet isolated React regression</title><style>body{font:14px system-ui;margin:20px}#panel{width:900px;max-width:100%;height:650px;overflow:auto}#stats,#result{white-space:pre-wrap;overflow-wrap:anywhere}button{margin:2px}</style><button id="run">Run lifecycle checks</button><button id="show">Show team</button><button id="clear">Clear counters</button><button id="width">Narrow / wide</button><pre id="result"></pre><pre id="stats"></pre><div id="panel"></div><script src="/fixture.js"></script>';
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?bundle:html)});
await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',resolve);
});
const url='http://127.0.0.1:'+server.address().port;
console.log(url);
if(process.argv.includes('--headless')){
  let browser,page,pageLoaded=false,failure;
  try{
    if(!process.env.CHROME_PATH)throw Error('Set CHROME_PATH to an existing Chromium');
    browser=await require('playwright-core').chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']});
    page=await browser.newPage({viewport:{width:1050,height:900}});
    page.setDefaultTimeout(30000);
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.goto(url);
    pageLoaded=true;
    await page.locator('#run').click();
    await page.waitForFunction(()=>/^(PASS|FAIL) /.test(document.getElementById('result').textContent));
    const result=await page.locator('#result').textContent();
    if(!result.startsWith('PASS '))throw Error(result);
    if(process.env.CABINET_SCREENSHOT)await page.screenshot({path:process.env.CABINET_SCREENSHOT,fullPage:true});
    const cleanup=await page.evaluate(()=>window.panelUnmount());
    if(errors.length||cleanup.errors.length)throw Error([...errors,...cleanup.errors].join('\n'));
    console.log(JSON.stringify({result,final:cleanup}));
  }catch(error){
    failure=error;
    if(pageLoaded&&process.env.CABINET_SCREENSHOT){
      try{await page.screenshot({path:process.env.CABINET_SCREENSHOT,fullPage:true});}catch{}
    }
  }finally{
    // Preserve the original failure while always releasing browser/server handles.
    if(pageLoaded){try{await page.evaluate(()=>window.panelUnmount?.());}catch(error){failure??=error;}}
    try{await browser?.close();}catch(error){failure??=error;}
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  }
  if(failure)throw failure;
}
