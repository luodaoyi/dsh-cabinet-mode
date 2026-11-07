import assert from 'node:assert/strict';
import {attachMemberModel, apply} from '../index.js';
let preset='cabinet',member={role:'lead',name:'lead'},defaults={provider:'native',model:'default'};
const callbacks={};const agent={id:'test',ctx:{on:(name,fn)=>{callbacks[name]=fn;return()=>delete callbacks[name];}}};
const services={agentPresets:{composedPreset:()=>preset},agentTeams:{tryMembership:()=>member},agentDefaultModel:{currentSelection:()=>defaults}};
const config={members:[{key:'lead',model:'local/model+variant'},{key:'dali',model:'local/@org/model'}]};
const off=attachMemberModel({get:key=>services[key]},config,agent,new Map());
const route=async()=>{const signal=new AbortController().signal;const a=await callbacks['system-prompt/assemble']({}, {signal},async()=>({variables:{provider:'seed',model:'seed'}}));const r=await callbacks['agent/request']({signal},async()=>({provider:'seed',model:'seed',reasoningEffort:'high'}));return{a,r};};
assert.equal((await route()).r.model,'model+variant');
for(const name of ['dalisi-pingshi','dalisi.qing','大理寺评事','大理寺卿']){member={role:'teammate',name};assert.equal((await route()).r.model,'@org/model');}
for(const name of ['lead','dalisiX','x-dalisi']){member={role:'teammate',name};assert.equal((await route()).r.model,'seed');}
member={role:'lead',name:'lead'};preset='standard';assert.equal((await route()).r.model,'seed');
preset='cabinet';config.members=[];assert.deepEqual((await route()).r,defaults);
services.agentPresets=undefined;assert.equal((await route()).r.model,'seed');
off();assert.equal(Object.keys(callbacks).length,0);
const effects=[],events={};services.agents={list:()=>[agent]};
await apply({get:key=>services[key],effect:fn=>effects.push(fn()),on:(name,fn)=>{events[name]=fn;return()=>delete events[name];},systemPrompt:{getSectionOrder:()=>0,section:()=>()=>{}}},config);
assert.equal(typeof callbacks['agent/request'],'function','backfill existing agents');
events['agent/disposed']({agent});assert.equal(Object.keys(callbacks).length,0);
events['agent/created']({agent});assert.equal(typeof callbacks['agent/request'],'function','attach before membership is available');
for(const effect of effects)effect?.();assert.equal(Object.keys(callbacks).length,0);assert.equal(Object.keys(events).length,0);
console.log('PASS routing: aliases, real role/preset gate, default restoration, missing service and disposal');
