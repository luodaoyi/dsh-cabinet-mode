// Real React component lifecycle; loopback synthetic session fixture, no model calls.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
const runtime=process.env.DSH_BROWSER_TEST_ROOT;
if(!runtime)throw Error('DSH_BROWSER_TEST_ROOT required');
const require=createRequire(runtime+'/package.json');
const source=fs.readFileSync(new URL('../client.js',import.meta.url),'utf8').replace('return { inject, apply };','return { MemberDispatch, en };');
const fixture=`
import React from 'react';import {createRoot} from 'react-dom/client';
window.__ModuleLoader__={load:({factory})=>window.cabinet=factory(()=>React)};
${source}
const roots=[createRoot(document.getElementById('one')),createRoot(document.getElementById('two'))];
let retains=0,releases=0,calls=[],pending=[],opens=0;
const service={retain(id){retains++;let dead=false;return{ready:Promise.resolve(),get binding(){if(dead)throw Error('released');return{session:{prompt(content,mode){calls.push({id,content,mode});return new Promise(resolve=>pending.push(resolve))}}}},release(){if(dead)throw Error('double release');dead=true;releases++}}}};
const t=k=>cabinet.en[k]||k;
function mount(index,id){roots[index].render(React.createElement('div',{onClick:()=>opens++},React.createElement(cabinet.MemberDispatch,{memberId:id,running:true,service,t})))}
const wait=()=>new Promise(r=>setTimeout(r,30));
const until=async(fn)=>{let end=Date.now()+3000;while(!fn()){if(Date.now()>end)throw Error('wait timeout');await wait()}};
const q=(root,s)=>document.querySelector('#'+root+' '+s);
const selector=name=>'[data-cabinet-dispatch-'+name+']';
const click=(root,name)=>q(root,selector(name)).click();
function type(root,text){let el=q(root,selector('input'));Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,text);el.dispatchEvent(new Event('input',{bubbles:true}));}
const assert=(v,m)=>{if(!v)throw Error(m)};
window.dispatchChecks=async()=>{
mount(0,'a');mount(1,'b');await wait();
assert(retains===0,'collapsed does not retain');
click('one','open');await until(()=>q('one',selector('input')));
assert(!q('two',selector('input')),'separate instance expansion');assert(opens===0,'open must not navigate');
type('one','unique');await until(()=>!q('one',selector('send')).disabled);
const send=q('one',selector('send'));send.click();send.click();
q('one',selector('input')).dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
await wait();assert(calls.length===1,'pending duplicate submission');assert(opens===0,'input/send must not navigate');
pending.shift()({ok:false,unknown:true,error:'ACK lost'});await wait();
assert(document.getElementById('one').textContent.toLowerCase().includes('unknown'),'unknown visibly distinguished');
assert(q('one',selector('send')).disabled,'unknown blocks immediate retry');
click('one','open');await wait();assert(!q('one',selector('input')),'unknown editor can close');
click('one','open');await until(()=>q('one',selector('status')).getAttribute('data-cabinet-dispatch-phase')==='unknown');
assert(q('one',selector('send')).disabled,'reopening retains unknown protection');
click('one','confirm');await wait();assert(calls.length===1,'confirmation does not resend');
click('one','send');await wait();assert(calls.length===2,'explicit confirmed retry');
pending.shift()({ok:false,error:{code:'policy/rejected',message:'business rejection'}});await wait();
assert(q('one',selector('status')).getAttribute('data-cabinet-dispatch-phase')==='rejected','definite rejection distinguished from unknown');
assert(!q('one',selector('send')).disabled,'definite rejection permits explicit correction');
click('two','open');await until(()=>q('two',selector('input')));type('two','second');await until(()=>!q('two',selector('send')).disabled);
click('two','interrupt');await wait();assert(calls.length===3&&calls[2].id==='b'&&calls[2].mode==='steer','second instance sends to its own target');
pending.shift()({ok:true,value:{accepted:true}});await wait();
assert(q('one',selector('input')).value==='unique','other instance draft isolated');
assert(opens===0,'all dispatch operations stay inside card');
click('one','send');await wait();assert(calls.length===4,'pending before member switch');
mount(0,'new-target');await wait();assert(!q('one',selector('input')),'member switch closes and clears editor');
pending.shift()({ok:true,value:{accepted:true}});await wait();assert(!q('one',selector('input')),'late prior ACK cannot reopen switched member');
click('one','open');await until(()=>q('one',selector('input')));assert(q('one',selector('input')).value==='','new target never inherits old draft');
type('one','unmount-pending');await until(()=>!q('one',selector('send')).disabled);click('one','send');await wait();assert(calls.length===5,'one final request before unmount');

window.dispatchStats=()=>({retains,releases,calls:calls.length,opens});
window.dispatchUnmount=async()=>{roots.forEach(r=>r.unmount());await wait();assert(retains===releases,'all retained references released');pending.shift()?.({ok:true,value:{accepted:true}});await wait();return window.dispatchStats()};
return {result:'PASS initial roster entry, two-instance isolation, pending duplicate protection, no navigation, unknown outcome',stats:window.dispatchStats()};
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
 const page=await browser.newPage();await page.goto(url);console.log(await page.evaluate(()=>window.dispatchChecks()));console.log(await page.evaluate(()=>window.dispatchUnmount()));
 }else{
 const {JSDOM}=require('jsdom');dom=await JSDOM.fromURL(url,{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true});
 await new Promise((resolve,reject)=>{dom.window.addEventListener('load',resolve);setTimeout(()=>reject(Error('load timeout')),5000)});
 console.log(await dom.window.dispatchChecks());console.log(await dom.window.dispatchUnmount());console.log('BOUNDARY: DOM-only, not native browser or actual host');
 }
}finally{await browser?.close();dom?.window.close();await new Promise(r=>server.close(r));}
