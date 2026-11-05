const assert=require('node:assert/strict'),path=require('node:path');
const base=path.join(process.env.DSH_MODULE_ROOT,'@deepseek-ai')+'/';
const {Context}=require(base+'cordis'),{SystemPrompt}=require(base+'dsh-system-prompt');
const {createScope}=require(base+'dsh-scope'),{installModelSelection,agentEvents,assembleContextFor}=require(base+'dsh-agent');
const {attachMemberModel}=require('../index.js');
(async()=>{
 let passed=0;
 const {buildModelCatalog}=require(base+'dsh-api-session-controller');
 const catalog=await buildModelCatalog({agentDefaultModel:{currentSelection:()=>({provider:'local',model:'model+variant'})},llm:{
  listProviders:()=>[{id:'local',name:'Local'},{id:'broken',name:'Broken'}],
  listModels:async id=>{if(id==='broken')throw Error('offline fixture');return ['model+variant','@org/model','model normal','org/model'].map(id=>({id,name:id}));},
  resolveModelInfo:async(provider,id)=>({provider,id,name:id})
 }});
 assert.equal(catalog.groups.length,1);assert.equal(catalog.groups[0].models.length,4);assert.equal(catalog.failures.length,1);passed++;

 for(const order of ['official-first','cabinet-first','no-official']){
  const ctx=new Context();new SystemPrompt(ctx,{});
  let preset='cabinet',member={role:'lead',name:'lead'},defaults={provider:'default',model:'model',reasoningEffort:'low'};
  ctx.provide('agentPresets',{composedPreset:()=>preset});ctx.provide('agentTeams',{tryMembership:()=>member});ctx.provide('agentDefaultModel',{currentSelection:()=>defaults});
  const cancellations=[];const agent={id:order,cancel:(cause,options)=>cancellations.push({cause,options}),session:{requestHeader:()=>({config:{provider:'old',model:'old'}})}};
  const scope=createScope(ctx,agent);agent.ctx=scope.ctx;
  const config={members:[{key:'lead',model:'cabinet/lead'},{key:'hanlin',model:'cabinet/member'}]};
  const native={current:{provider:'official',model:'native',reasoningEffort:'high'}};
  let off;const install=()=>installModelSelection(agent.ctx,native);
  if(order==='official-first')install();off=attachMemberModel(ctx,config,agent,new Map());if(order==='cabinet-first')install();
  const events=agentEvents(ctx,agent);
  async function check(expected){const signal=new AbortController().signal;const assembly=await ctx.systemPrompt.assemble(assembleContextFor(agent,signal));const request=await events.waterfall('agent/request',{signal,turn:1,step:1},async()=>({provider:'seed',model:'seed',reasoningEffort:'high'}));assert.equal(assembly.variables.provider,expected.provider);assert.equal(assembly.variables.model,expected.model);assert.deepEqual(request,expected);passed++;return{signal,assembly};}
  const initial=await check({provider:'cabinet',model:'lead'});
  {
   const decision=await events.waterfall('agent/pre-step',{signal:initial.signal,step:2,messages:[]},async()=>({kind:'enter',messages:[]}));
   assert.equal(decision.messages.length,1);assert.match(decision.messages[0].content[0].text,/cabinet\/lead/);assert.doesNotMatch(decision.messages[0].content[0].text,/official\/native/);passed++;
  }
  if(order!=='no-official') {
   const saved=native.current;native.current={provider:'cabinet',model:'lead'};preset='standard';
   await check(saved);native.current=saved; preset='cabinet';await check({provider:'cabinet',model:'lead'});
  }
  preset='standard';if(order==='no-official'){const signal=new AbortController().signal;const assembly=await ctx.systemPrompt.assemble(assembleContextFor(agent,signal));assert.notEqual(assembly.variables.model,'lead');assert.deepEqual(await events.waterfall('agent/request',{signal},async()=>({provider:'seed',model:'seed'})),{provider:'seed',model:'seed'});passed++;}else await check(native.current);
  preset='cabinet';member={role:'teammate',name:'lead'};if(order!=='no-official')await check(native.current);
  member={role:'teammate',name:'hanlin-bianxiu'};await check({provider:'cabinet',model:'member'});
  config.members=[{key:'lead',model:'cabinet/lead'}];await check({provider:'cabinet',model:'lead'});
  config.members=[];await check(defaults);
  defaults={provider:'new-default',model:'next'};await check(defaults);
  config.members=[{key:'hanlin',model:'official/native'}];if(order!=='no-official')await check(native.current);
  // Different turns and signal-free previews never overwrite each other's snapshot.
  config.members=[{key:'hanlin',model:'p/A'}];let release,entered;const ready=new Promise(r=>entered=r);
  const a=new AbortController().signal,b=new AbortController().signal;
  const unblock=agent.ctx.on('system-prompt/assemble',async(_,c,next)=>{if(c.signal===a){entered();await new Promise(r=>release=r);}return next();});
  const first=ctx.systemPrompt.assemble(assembleContextFor(agent,a));await ready;
  config.members=[{key:'hanlin',model:'p/B'}];await ctx.systemPrompt.assemble(assembleContextFor(agent,b));
  config.members=[{key:'hanlin',model:'p/preview'}];await ctx.systemPrompt.assemble(assembleContextFor(agent));release();
  assert.equal((await first).variables.model,'A');
  for(const [signal,model]of [[a,'A'],[b,'B']])assert.equal((await events.waterfall('agent/request',{signal},async()=>({provider:'x',model:'x'}))).model,model);
  unblock();passed++;
  preset='standard';await assert.rejects(events.waterfall('agent/request',{signal:a},async()=>({provider:'x',model:'x'})),/mode changed/);passed++;
  preset='cabinet';off();assert.equal(cancellations.length,1);assert.equal(cancellations[0].cause.kind,'hook');assert.equal(cancellations[0].options.keepInbox,true);assert.deepEqual(await events.waterfall('agent/request',{signal:a},async()=>({provider:'seed',model:'seed'})),order==='no-official'?{provider:'seed',model:'seed'}:native.current);passed++;
  await scope.dispose();
 }
 console.log('PASS '+passed+' official Cordis/SystemPrompt/installModelSelection combinations; identity/default services stubbed, no model calls');
})().catch(e=>{console.error(e);process.exitCode=1;});
