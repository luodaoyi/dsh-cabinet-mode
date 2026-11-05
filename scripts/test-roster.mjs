import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Minimal native DOM model: tests production injection, reuse and disposal.
class Element {
  constructor(tag) { this.tagName=tag.toUpperCase(); this.children=[]; this.attrs={}; this.dataset={}; this.style={}; this.className=''; this.textContent=''; this.srcWrites=0; }
  set src(v) { this.attrs.src=v; this.srcWrites++; }
  get src() { return this.attrs.src; }
  get parentElement() { return this.parentNode; }
  get firstChild() { return this.children[0]; }
  setAttribute(k,v) { this.attrs[k]=v; }
  getAttribute(k) { return this.attrs[k]??null; }
  append(child) { child.parentNode=this; this.children.push(child); }
  insertBefore(child,before) { child.parentNode=this; const i=this.children.indexOf(before); this.children.splice(i<0?this.children.length:i,0,child); }
  removeChild(child) { this.children.splice(this.children.indexOf(child),1); child.parentNode=null; }
  closest(tag) { for(let n=this;n;n=n.parentNode) if(n.tagName===tag.toUpperCase()) return n; return null; }
  matches(selector) {
    if(selector==='img') return this.tagName==='IMG';
    if(selector==='[data-cabinet-avatar]') return this.dataset.cabinetAvatar==='1';
    if(selector==='[data-cabinet-avatar-img]') return this.attrs['data-cabinet-avatar-img']==='1';
    const cls=/^\[class\*="(.+)"\]$/.exec(selector);
    return !!cls && this.className.includes(cls[1]);
  }
  querySelectorAll(selector) { return this.children.flatMap(c=>[...(c.matches(selector)?[c]:[]),...c.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0]??null; }
}
const body=new Element('body');
const doc={body,createElement:tag=>new Element(tag),querySelectorAll:s=>body.querySelectorAll(s)};
let observer;
class Observer {
  constructor(callback) { this.callback=callback; observer=this; }
  observe(node,options) { this.options=options; }
  disconnect() { this.disconnected=true; }
}
const timers=new Map(); let serial=0;
const flush=()=>{const callbacks=[...timers.values()];timers.clear();callbacks.forEach(f=>f());};
let client;
const source=readFileSync(new URL('../client.js',import.meta.url),'utf8');
runInNewContext(source.replace('return { inject, apply };','return { installTeamRosterAvatars, setMemberConfig, avatarFor, BUREAUX, AVATARS };'),{
  window:{__ModuleLoader__:{load:({factory})=>{client=factory(()=>({createElement(){}}));}}},
  document:doc,MutationObserver:Observer,console,
  setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id),
});
function row(name) {
  const button=new Element('button'),dot=new Element('span'),text=new Element('span'),label=new Element('span');
  dot.className='_memberDot_hash';text.className='_memberText_hash';label.className='_memberNameText_hash';label.textContent=name;
  text.append(label);button.append(dot);button.append(text);body.append(button);return {button,label};
}
const names=[...new Set(client.BUREAUX.flatMap(b=>[b.label,...b.aliases])),
  'dalisi2','dalisi-pingshi','jiancha_yushi','jiancha.yushi','unknown-person'];
const rows=names.map(row);
const dispose=client.installTeamRosterAvatars();
assert.equal(observer.options.characterData,true);
assert.equal(observer.options.childList,true);
assert.ok(!observer.options.attributes,'injected attributes must not create observer loops');
for(const [i,r] of rows.entries()) {
  assert.equal(r.button.querySelector('img').src,client.avatarFor(names[i]),names[i]);
  assert.equal(r.label.textContent,names[i],'native identity must stay unchanged');
}
for (const bureau of client.BUREAUX) {
  client.setMemberConfig({['avatar'+bureau.key[0].toUpperCase()+bureau.key.slice(1)]:client.avatarFor('works')});
  for (const [i,r] of rows.entries()) assert.equal(r.button.querySelector('img').src,client.avatarFor(names[i]));
  client.setMemberConfig({});
}
const reused=rows[0],originalSlot=reused.button.querySelector('[data-cabinet-avatar-img]');
for(const [name,type] of [['dalisi-pingshi','characterData'],['jiancha-yushi','childList'],['unknown-person','characterData']]) {
  reused.label.textContent=name;observer.callback([{type}]);assert.equal(timers.size,1);flush();
  assert.equal(reused.button.querySelector('img').src,client.avatarFor(name));
  assert.equal(reused.button.querySelector('[data-cabinet-avatar-img]'),originalSlot);
  assert.equal(reused.button.querySelectorAll('img').length,1);
}
const img=reused.button.querySelector('img'),writes=img.srcWrites;
observer.callback([{type:'attributes'}]);assert.equal(timers.size,0);
observer.callback([{type:'childList'}]);flush();assert.equal(img.srcWrites,writes,'unchanged source must not be rewritten');
observer.callback([{type:'characterData'}]);dispose();
assert.equal(timers.size,0);assert.equal(observer.disconnected,true);
assert.equal(body.querySelectorAll('[data-cabinet-avatar-img]').length,0);
assert.equal(body.querySelectorAll('[data-cabinet-avatar]').length,0);
console.log('PASS: native roster aliases, reused rows, text mutations, idempotence and cleanup (mock DOM)');
