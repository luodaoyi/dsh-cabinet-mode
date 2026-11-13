// Real React component lifecycle; loopback synthetic session fixture, no model calls.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
const runtime=process.env.DSH_BROWSER_TEST_ROOT;
if(!runtime)throw Error('DSH_BROWSER_TEST_ROOT required');
const require=createRequire(runtime+'/package.json');
const source=fs.readFileSync(new URL('../client.js',import.meta.url),'utf8').replace('return { inject, apply };','return { DynamicSubagents, en, setOpener: fn => cabinetOpenSession = fn };');
const fixture=`
import React from 'react';import {createRoot} from 'react-dom/client';
window.__ModuleLoader__={load:({factory})=>window.cabinet=factory(()=>React)};
${source}
const roots=[createRoot(document.getElementById('one')),createRoot(document.getElementById('two'))];
const calls=[];window.subagentCalls=calls;cabinet.setOpener(v=>calls.push(v));
const catalog=[{id:'one-shot',mode:'one-shot',label:'One shot'},{id:'continuable',mode:'continuable'},{id:'external',mode:'external'},{id:'unknown',mode:'unknown'},{id:'bad-mode',mode:'bogus'},{id:'one-shot',mode:'continuable'},{id:'mate',mode:'continuable'},{id:'   '},{id:3},null];
const wait=()=>new Promise(r=>setTimeout(r,30));const assert=(v,m)=>{if(!v)throw Error(m)};
function mount(i,lead='lead',data=catalog){roots[i].render(React.createElement(cabinet.DynamicSubagents,{leadSessionId:lead,catalog:data,members:[{id:'mate'}],runningOf:()=>false,t:k=>cabinet.en[k]||k}))}
window.subagentMount=mount;
window.dispatchChecks=async()=>{
mount(0);mount(1);await wait();
const toggle=i=>document.querySelector('#'+i+' [data-cabinet-subagent-toggle]');
assert(toggle('one').textContent.includes('(5)'),'invalid, roster and duplicate IDs excluded');
assert(!document.querySelector('[data-cabinet-subagent-row]'),'initially collapsed');
toggle('one').click();await wait();assert(!document.querySelector('#two [data-cabinet-subagent-row]'),'instances isolated');
for(const mode of ['one-shot','continuable','unknown'])document.querySelector('#one [data-cabinet-child-id="'+mode+'"]').click();
assert(calls.length===3&&calls.every((v,i)=>v.mode===['one-shot','continuable','unknown'][i]&&v.parentSessionId==='lead'),'preserves actual protocol mode');
for(const id of ['external','bad-mode']){const el=document.querySelector('#one [data-cabinet-child-id="'+id+'"]');assert(el.disabled,'unsafe modes disabled');el.click()}
assert(calls.length===3,'external cannot navigate');
const savedWarn=console.warn;let warnings=0;console.warn=()=>warnings++;cabinet.setOpener(()=>{throw Error('isolated unavailable opener')});document.querySelector('#one [data-cabinet-child-id="one-shot"]').click();await wait();assert(calls.length===3&&warnings===1,'throwing host opener is caught');console.warn=savedWarn;cabinet.setOpener(v=>calls.push(v));
mount(0,'new-lead');await wait();assert(!document.querySelector('#one [data-cabinet-subagent-row]'),'lead change collapses immediately');
mount(0,'lead');await wait();assert(!document.querySelector('#one [data-cabinet-subagent-row]'),'returning lead stays collapsed');
mount(1,'lead',[]);await wait();assert(!document.querySelector('#two [data-cabinet-subagent-group]'),'empty catalog absent');
window.dispatchUnmount=async()=>{roots.forEach(r=>r.unmount());return {calls:calls.length}};
return 'PASS real React catalog isolation, lead switch, IDs, navigation modes and external rejection';
};
`;
const {code}=await require('esbuild').transform(fixture,{loader:'jsx',format:'esm'});
const bundle=await require('esbuild').build({stdin:{contents:code,resolveDir:runtime,loader:'js'},bundle:true,write:false,format:'iife',platform:'browser'});
const html='<div id="one"></div><div id="two"></div><script src="/fixture.js"></script>';
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?bundle.outputFiles[0].text:html)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port;
let browser,dom;
try{
 if(process.argv.includes('--headless')){
 browser=await require('playwright-core').chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});await page.goto(url);console.log(await page.evaluate(()=>window.dispatchChecks()));const toggle=page.locator('#one [data-cabinet-subagent-toggle]');await toggle.focus();await page.keyboard.press('Enter');await page.locator('#one [data-cabinet-child-id="one-shot"]').waitFor({state:'visible'});await page.locator('#one [data-cabinet-child-id="one-shot"]').focus();await page.keyboard.press('Enter');if(!await page.evaluate(()=>window.subagentCalls.length===4&&window.subagentCalls[3].mode==='one-shot'))throw Error('native mode navigation');await toggle.focus();await page.keyboard.press('Space');await page.locator('#one [data-cabinet-child-id="one-shot"]').waitFor({state:'hidden'});if(errors.length)throw Error('React/browser errors');console.log('PASS native disclosure Enter/Space and one-shot Enter navigation');console.log(await page.evaluate(()=>window.dispatchUnmount()));
 }else{
 const {JSDOM}=require('jsdom');dom=await JSDOM.fromURL(url,{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true});
 await new Promise((resolve,reject)=>{dom.window.addEventListener('load',resolve);setTimeout(()=>reject(Error('load timeout')),5000)});
 console.log(await dom.window.dispatchChecks());console.log(await dom.window.dispatchUnmount());console.log('BOUNDARY: DOM-only, not native browser or actual host');
 }
}finally{await browser?.close();dom?.window.close();await new Promise(r=>server.close(r));}
