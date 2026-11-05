const fs=require('node:fs'),assert=require('node:assert/strict');
const path=require('node:path');
if(!process.env.DSH_MODULE_ROOT)throw Error('Set DSH_MODULE_ROOT to the installed official DSH node_modules directory');
const base=path.join(process.env.DSH_MODULE_ROOT,'@deepseek-ai')+'/';
const {Context}=require(base+'cordis');const {SystemPrompt,renderPrompt}=require(base+'dsh-system-prompt');
const {createScope}=require(base+'dsh-scope');const persona=require(base+'dsh-persona');
const cabinet=require('../index.js');
const patch=fs.readFileSync(path.join(__dirname,'../cordis.patch.yml'),'utf8').replaceAll('\r\n','\n');
const lines=patch.split('prefix: |-\n')[1].split('\n');const kept=[];
for(const line of lines){if(line.trim()&&!line.startsWith('                '))break;kept.push(line.slice(16));}
const prefix=kept.join('\n').trimEnd();assert.ok(prefix.includes('≤100'));
(async()=>{
 const ctx=new Context();new SystemPrompt(ctx,{});
 const presets=new WeakMap();ctx.provide('agentPresets',{composedPreset:c=>presets.get(c)});
 ctx.provide('agentTeams',{tryMembership:a=>a.testMember});
 const config={members:[]};cabinet.apply(ctx,config);
 const results=[];
 for(const preset of ['standard','cabinet'])for(const role of ['lead','teammate'])for(const mode of ['','custom','off']){
   const key={};const scope=createScope(ctx,key);presets.set(scope.ctx,preset);
   persona.apply(scope.ctx,{prefix:preset==='cabinet'?prefix:'Standard test persona'});
   const name=role==='lead'?'lead':'dalisi-pingshi';config.members=[{key:role==='lead'?'lead':'dali',mode,prompt:'CUSTOM {{literal}}'}];
   const agent={ctx:scope.ctx,testMember:{role,name}};
   const assembly=await ctx.systemPrompt.assemble({scope:key,agent});const rendered=renderPrompt(assembly);
   assert.equal(rendered.includes('分派预算约定'),preset==='cabinet');
   assert.equal(rendered.includes('CUSTOM {{literal}}'),preset==='cabinet'&&mode==='custom');
   assert.equal(rendered.includes('【御下术'),preset==='cabinet'&&role==='lead'&&mode==='');
   const extra=assembly.sections.find(s=>s.name==='cabinet:member')?.text||'';
   if(preset!=='cabinet'||mode==='off')assert.equal(extra,'');
   results.push({preset,role,mode:mode||'default',budgetInStaticPersona:rendered.includes('分派预算约定'),memberBlock:extra.length});
   await scope.dispose();
 }
 console.log(JSON.stringify({dshVersion:require(base+'dsh/package.json').version,components:'real Cordis/SystemPrompt/Persona/scope',identity:'stub preset and membership services; no Agent/model/team execution',results},null,2));
 console.log('PASS: 12 real registry/persona assemblies; Cabinet Lead/teammate share static policy, standard excludes it; custom/off only alter dynamic member block. Identity services stubbed; no model calls.');
})().catch(e=>{console.error(e);process.exitCode=1;});
