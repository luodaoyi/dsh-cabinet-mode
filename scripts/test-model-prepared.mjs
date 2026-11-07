import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {attachMemberModel,prepareModelSessionApi,apply,inject} from '../index.js';
const base=path.join(process.env.DSH_MODULE_ROOT,'@deepseek-ai');
const load=name=>import(pathToFileURL(path.join(base,name,'lib/index.js')));
const {Context}=await load('cordis'),{SystemPrompt}=await load('dsh-system-prompt');
const {createScope}=await load('dsh-scope');
const {AgentModel,agentEvents,installModelSelection,modelSelectionProjectionDefinition}=await load('dsh-agent');
const {Loader}=await load('cordis-plugin-loader');
const loaderCtx=new Context();loaderCtx.baseUrl=pathToFileURL(path.join(process.env.DSH_MODULE_ROOT,'../cordis.yml')).href;new Loader(loaderCtx);
const {SessionProjectionRegistry}=await load('dsh-session-projection');new SessionProjectionRegistry(loaderCtx);
const sessionApi=await prepareModelSessionApi(loaderCtx);
assert.equal(sessionApi.Session,(await load('dsh-session')).Session);
// Expose the official implementation without changing any method or guard.
// This additional module lives only in the isolated test runtime and is removed.
const loopPath=path.join(base,'dsh-agent-loop/lib/index.js');
const exposed=path.join(path.dirname(loopPath),'cabinet-test-'+randomUUID()+'.mjs');
fs.writeFileSync(exposed,fs.readFileSync(loopPath,'utf8')+'\nexport { ReactLoopAgent, ReactLoopInbox, inboxProjectionDefinition };\n');
let Loop,Inbox,inboxProjection;try{const official=await import(pathToFileURL(exposed));Loop=official.ReactLoopAgent;Inbox=official.ReactLoopInbox;inboxProjection=official.inboxProjectionDefinition;}finally{fs.unlinkSync(exposed);}
// Mount the exported declaration through real Cordis; direct apply() tests cannot
// detect an invalid injection schema that silently leaves the entry pending.
new SystemPrompt(loaderCtx,{});let mounted=false;
const entry=loaderCtx.plugin({name:'cabinet-test-entry',inject,apply:async(ctx,cfg)=>{await apply(ctx,cfg);mounted=true;}},{members:[]});
await entry;assert.ok(mounted,'Cabinet entry activates through actual Cordis inject');
let passed=1;
for(const role of ['lead','teammate']){
 const ctx=new Context();new SystemPrompt(ctx,{});
 // The two variable providers registered by the official AgentLoop constructor.
 ctx.systemPrompt.variable('provider',context=>context.modelSelection?.provider ?? context.agent?.options.provider);
 ctx.systemPrompt.variable('model',context=>context.modelSelection?.model ?? context.agent?.options.model);
 let preset='cabinet',member={role,name:role==='lead'?'lead':'hanlin'},defaults={provider:'default',model:'model'};
 ctx.provide('agentPresets',{composedPreset:()=>preset});ctx.provide('agentTeams',{tryMembership:()=>member});ctx.provide('agentDefaultModel',{currentSelection:()=>defaults});
 let header={config:{provider:'native',model:'initial',reasoningEffort:'high'}},calls=0,toolSelection;
 const agent={id:role,options:{...header.config},requestHeaderLogged:true,phase:{kind:'idle'}};
 Object.defineProperty(agent,'status',Object.getOwnPropertyDescriptor(Loop.prototype,'status'));
 const scope=createScope(ctx,agent);agent.ctx=scope.ctx;agent.dispatch=agentEvents(ctx,agent);
 function reopen(seed){agent.session=sessionApi.Session.create(role,seed);if(!seed)agent.session.append('request/header',{header,reason:'initial'});agent.model=new AgentModel(()=>agent.session.snapshotEvents().reduce(modelSelectionProjectionDefinition.apply,modelSelectionProjectionDefinition.init()),agent.session,agent.options);agent.inbox=new Inbox(()=>agent.session.snapshotEvents().reduce(inboxProjection.apply,inboxProjection.init()),agent.session,agent.dispatch);}
 reopen();assert.ok(agent.session instanceof sessionApi.Session);
 agent.loopCtx={systemPrompt:ctx.systemPrompt,tools:{resolve:async({modelSelection})=>{toolSelection=modelSelection;return{dispose(){},tools:[]}}},llm:{prepareCall:async(config)=>{calls++;return{config}}}};
 agent.runtimeContext={project:()=>undefined};
 const cfg={members:[{key:role==='lead'?'lead':'hanlin',model:'p/override'}]};
 installModelSelection(agent.ctx);
 const memory=new Map(),off=attachMemberModel(ctx,cfg,agent,new Map(),memory,sessionApi);
 const cancellations=[];agent.cancel=(cause,options)=>{cancellations.push({cause,options});agent.phase?.abort.abort(cause)};
 async function step(expected,newTurn=true){if(newTurn){Loop.prototype.setPhase.call(agent,{kind:'idle'});Loop.prototype.setPhase.call(agent,{kind:'running',abort:new AbortController()});}const d=await Loop.prototype.preStep.call(agent,'next-turn',{turn:1,step:1});assert.equal(d.kind,'enter');const request=await Loop.prototype.prepareRequest.call(agent,1,1,d.selection,agent.phase.abort.signal);assert.deepEqual(request.config,expected);assert.deepEqual(toolSelection,d.selection);assert.equal(d.assembly.variables.provider,expected.provider);assert.equal(d.assembly.variables.model,expected.model);passed++;return d;}
 await step({provider:'p',model:'override'});
 cfg.members=[];await step(defaults);
 cfg.members=[{key:role==='lead'?'lead':'hanlin',model:'native/initial'}];await step({provider:'native',model:'initial'});
 agent.model.select({...agent.model.current(),reasoningEffort:'high'});await step({provider:'native',model:'initial',reasoningEffort:'high'});
 cfg.members=[{key:'lead',model:'p/lead'}];await step({provider:'p',model:'lead'});
 preset='standard';await step(header.config);
 if(role==='teammate'){preset='cabinet';member={role:'teammate',name:'lead'};await step(header.config);member={role:'teammate',name:'hanlin'};}
 preset='cabinet';await step({provider:'p',model:'lead'});
 // A real prepared step retains its own route across later configuration changes.
 agent.phase={kind:'running',abort:new AbortController()};
 const a=await Loop.prototype.preStep.call(agent,'next-turn',{turn:2,step:1});
 const aSignal=agent.phase.abort.signal;
 cfg.members=[{key:'lead',model:'p/next'}];agent.dispatch.emit('agent/status',{status:'running'});
 const b=await Loop.prototype.preStep.call(agent,'next-turn',{turn:2,step:2});
 assert.equal((await Loop.prototype.prepareRequest.call(agent,2,1,a.selection,aSignal)).config.model,'lead');
 assert.equal((await Loop.prototype.prepareRequest.call(agent,2,2,b.selection,aSignal)).config.model,'next');passed++;
 // Signal-free preview cannot change either prepared selection or unload tracking.
 await ctx.systemPrompt.assemble({agent,scope:agent});
 assert.equal(agent.model.current().model,'next');passed++;
 preset='standard';await assert.rejects(Loop.prototype.prepareRequest.call(agent,2,2,b.selection,aSignal),/policy changed/);passed++;
 preset='cabinet';
 off();assert.deepEqual(agent.model.current(),header.config);passed++;
 assert.equal(cancellations.length,1);assert.equal(cancellations[0].options.keepInbox,true);assert.ok(aSignal.aborted);passed++;
 // Native mode with configured Cabinet overrides remains entirely untouched.
 preset='standard';reopen();
 const offNative=attachMemberModel(ctx,cfg,agent,new Map(),new Map(),sessionApi);
 await step(header.config);offNative();passed++;
 // Actual teammate role, not a lead-like name, controls access to Lead policy.
 preset='cabinet';member={role:'teammate',name:'lead'};reopen();
 const offImpostor=attachMemberModel(ctx,cfg,agent,new Map(),new Map(),sessionApi);await step(header.config);offImpostor();passed++;
 // Created before membership: the first running notification selects before preStep.
 member=undefined;const offLate=attachMemberModel(ctx,cfg,agent,new Map(),new Map(),sessionApi);
 member={role:'lead',name:'lead'};agent.dispatch.emit('agent/status',{status:'running'});await step({provider:'p',model:'next'});passed++;
 const disk=path.join(path.dirname(exposed),'cabinet-session-'+randomUUID()+'.json');
 fs.writeFileSync(disk,JSON.stringify(agent.session.snapshotEvents()));offLate();
 const crashLog=JSON.parse(fs.readFileSync(disk,'utf8'));fs.unlinkSync(disk);reopen(crashLog);cfg.members=[];
 const offRestored=attachMemberModel(ctx,cfg,agent,new Map(),new Map(),sessionApi);await step(defaults);offRestored();passed++;

 // Recover real Session logs across each side of the two-write transaction.
 const native={...header.config};member={role:'lead',name:'lead'};preset='cabinet';
 const persist=()=>{const file=path.join(path.dirname(exposed),'cabinet-crash-'+randomUUID()+'.json');fs.writeFileSync(file,JSON.stringify(agent.session.snapshotEvents()));const result=JSON.parse(fs.readFileSync(file,'utf8'));fs.unlinkSync(file);return result;};
 const attach=(api=sessionApi)=>attachMemberModel(ctx,cfg,agent,new Map(),new Map(),api);
 const notify=()=>agent.dispatch.emit('agent/status',{status:'running'});
 // Initial intent durable, selection failed: a never-applied policy must not claim native state.
 reopen();cfg.members=[{key:'lead',model:'p/first'}];
 let select=agent.model.select.bind(agent.model);agent.model.select=()=>{throw Error('injected select failure')};
 let cleanup=attach();await assert.rejects(step({}),/injected select failure/);passed++;
 let seed=persist();agent.model.select=select;cleanup();reopen(seed);cfg.members=[];cleanup=attach();await step(native);cleanup();
 // Changing an owned override: failure after new intent must retain the old override's provenance.
 reopen();cfg.members=[{key:'lead',model:'p/first'}];cleanup=attach();await step({provider:'p',model:'first'});
 select=agent.model.select.bind(agent.model);agent.model.select=()=>{throw Error('between intent and select')};
 cfg.members=[{key:'lead',model:'p/second'}];notify();await assert.rejects(step({}),/between intent and select/);passed++;
 seed=persist();agent.model.select=select;cleanup();reopen(seed);cfg.members=[];cleanup=attach();await step(defaults);cleanup();
 // Restoration succeeds, clearing ownership fails: replay must keep the restored native choice.
 reopen();cfg.members=[{key:'lead',model:'p/first'}];let failClear=false;
 const interruptedApi={...sessionApi,appendPluginRecord:(session,type,data)=>{if(failClear&&!data.baseline)throw Error('between restore and clear');return sessionApi.appendPluginRecord(session,type,data);}};
 cleanup=attach(interruptedApi);await step({provider:'p',model:'first'});cfg.members=[];failClear=true;notify();
 assert.deepEqual(agent.model.current(),defaults);await assert.rejects(ctx.systemPrompt.assemble({agent,scope:agent}),/between restore and clear/);passed++;
 seed=persist();failClear=false;cleanup();reopen(seed);cleanup=attach();await step(defaults);cleanup();
 // A manual native change, even away and back to the same override, revokes ownership.
 for(const action of ['clear','unload','restart','standard']){
  reopen();cfg.members=[{key:'lead',model:'p/first'}];cleanup=attach();await step({provider:'p',model:'first'});
  agent.model.select({provider:'manual',model:'other',reasoningEffort:'low'});agent.model.select({provider:'p',model:'first'});
  if(action==='restart'){seed=persist();cleanup();reopen(seed);cfg.members=[];cleanup=attach();}
  else if(action==='unload'){cleanup();cleanup=()=>{};}
  else if(action==='standard')preset='standard';else cfg.members=[];
  assert.deepEqual(agent.model.current(),{provider:'p',model:'first'});
  if(action!=='unload')await step({provider:'p',model:'first'});else passed++;
  cleanup();preset='cabinet';
 }
 // Restoring Standard reinstates baseline effort even if its route equals the latest override.
 reopen();cfg.members=[{key:'lead',model:'p/first'}];cleanup=attach();await step({provider:'p',model:'first'});
 cfg.members=[{key:'lead',model:'native/initial'}];await step({provider:'native',model:'initial'});
 preset='standard';await step(native);cleanup();preset='cabinet';
 // Empty real inbox: neither claim nor running-to-running publishes a new boundary.
 reopen();cfg.members=[{key:'lead',model:'p/first'}];cleanup=attach();await step({provider:'p',model:'first'});
 cfg.members=[{key:'lead',model:'p/second'}];Loop.prototype.setPhase.call(agent,{...agent.phase});
 await step({provider:'p',model:'first'},false);
 // A real claimed message, unlike an empty queue, synchronizes before selection freezes.
 agent.inbox.append('next-step',{id:'fixture-'+role,role:'user',content:[{type:'text',text:'fixture'}]});
 await step({provider:'p',model:'second'},false);
 cfg.members=[];defaults={provider:'changed-default',model:'new'};
 await step({provider:'p',model:'second'},false);await step(defaults);cleanup();
 defaults={provider:'default',model:'model'};
 // Changing preset with no phase/inbox notification cannot send the old owned route.
 reopen();cfg.members=[{key:'lead',model:'p/first'}];cleanup=attach();await step({provider:'p',model:'first'});
 preset='standard';const beforeMode=calls;await assert.rejects(step({},false),/policy changed before step/);assert.equal(calls,beforeMode);passed++;
 await step(native);cleanup();preset='cabinet';
 // Membership arriving after a running transition must not silently use native fallback.
 reopen();member=undefined;cfg.members=[{key:'lead',model:'p/late'}];cleanup=attach();await step(native);
 member={role:'lead',name:'lead'};const beforeLate=calls;await assert.rejects(step({},false),/policy changed before step/);assert.equal(calls,beforeLate);passed++;
 await step({provider:'p',model:'late'});cleanup();
 // Corrupt records do not acquire ownership, and missing host APIs fail before any adapter call.
 reopen();cfg.members=[];sessionApi.appendPluginRecord(agent.session,'plugin:dsh-cabinet-mode/model-policy',{agentId:agent.id,baseline:'bad',override:native});
 cleanup=attach();await step(native);cleanup();
 reopen();cfg.members=[{key:'lead',model:'p/first'}];const before=calls;cleanup=attach({});await assert.rejects(step({}),/API unavailable/);assert.equal(calls,before);passed++;
 cfg.members=[];notify();await step(native);cleanup();

 // Exercise real Loader volatile reconciliation, not a synthetic save notification.
 reopen();member={role:'lead',name:'lead'};preset='cabinet';
 ctx.baseUrl=loaderCtx.baseUrl;await ctx.plugin(Loader);new SessionProjectionRegistry(ctx);
 ctx.provide('agents',{list:()=>[agent]});const loader=ctx.get('loader');
 const entryId=await loader.create({name:new URL('../index.js',import.meta.url).href,config:{members:[{key:'lead',model:'p/saved-a'}]}});
 await loader.await();const loaded=loader.resolve(entryId);assert.equal(loaded.fiber.state,2);const originalFiber=loaded.fiber;
 await step({provider:'p',model:'saved-a'});
 const oldPrepared=await Loop.prototype.preStep.call(agent,'next-step',{turn:3,step:1});const oldSignal=agent.phase.abort.signal;
 await loader.update(entryId,{config:{members:[{key:'lead',model:'p/saved-b'}]}});await loader.await();
 assert.equal(loaded.fiber,originalFiber,'volatile save does not remount');
 assert.equal((await Loop.prototype.prepareRequest.call(agent,3,1,oldPrepared.selection,oldSignal)).config.model,'saved-a');passed++;
 await step({provider:'p',model:'saved-b'},false);
 // Another entry changing a field also called members cannot synchronize this policy.
 const otherFile=path.join(path.dirname(exposed),'cabinet-unrelated-'+randomUUID()+'.mjs');
 fs.writeFileSync(otherFile,'export {Config} from '+JSON.stringify(new URL('../index.js',import.meta.url).href)+'; export function apply(){}');
 let otherId;try{otherId=await loader.create({name:pathToFileURL(otherFile).href,config:{members:[]}});await loader.await();
 agent.model.select({provider:'manual',model:'keep'});
 await loader.update(otherId,{config:{members:[{key:'lead',model:'p/unrelated'}]}});await loader.await();
 assert.deepEqual(agent.model.current(),{provider:'manual',model:'keep'});passed++;
 }finally{if(otherId)loader.remove(otherId);await loader.await();fs.unlinkSync(otherFile);}
 // Restore a controlled route via a real save, then clear it with an empty inbox.
 await loader.update(entryId,{config:{members:[{key:'lead',model:'p/saved-c'}]}});await loader.await();await step({provider:'p',model:'saved-c'},false);
 await loader.update(entryId,{config:{members:[]}});await loader.await();await step(defaults,false);
 loader.remove(entryId);await loader.await();
 assert.ok(calls>=7);
}
console.log(`PASS ${passed} official rc.1 preStep -> prepareRequest cases; real AgentModel/Cordis/SystemPrompt; real inbox; identity and adapter fixtures; no model calls`);
