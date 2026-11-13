// Test-only ordinary Cordis driver. Creates real Agents with the actual cabinet
// preset and flushes their real session stores. Never imported by product code.
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const modules=process.env.DSH_MODULE_ROOT;
const {installModelSelection}=await import(pathToFileURL(join(modules,'@deepseek-ai/dsh-agent/lib/index.js')));
const {createUserMessage}=await import(pathToFileURL(join(modules,'@deepseek-ai/dsh-llm/lib/index.js')));
export const name='cabinet-protocol-team-driver';
export const inject=['agents','agentPresets','sessions','agentTeams'];
export function apply(ctx){
 let stage='driver applied';
 const mark=value=>{stage=value;console.log('FIXTURE_STAGE '+value)};
 mark(stage);
 const run=async()=>{
  mark('resolve cabinet preset');await ctx.agentPresets.resolve('cabinet');
  mark('create real cabinet agent');
  const {agent}=await ctx.agents.create({sessionId:'session-cabinet-protocol-lead',meta:{cwd:process.env.CABINET_FIXTURE_CWD,agentPreset:'cabinet'},agentOptions:{provider:'deepseek-official',model:'deepseek-flash'},setup:async scope=>{installModelSelection(scope);await ctx.agentPresets.mount(scope,'cabinet')}});
  mark('real lead tool loop');
  agent.followup(createUserMessage({content:[{type:'text',text:'CABINET_PROTOCOL_TEAM_V1'}],source:{kind:'user'}}));
  await agent.whenIdle();
  // Release the deterministic member response only after the first Lead turn
  // actually settles. This makes the completion-notification wake a distinct turn.
  const release=await fetch(process.env.CABINET_FIXTURE_ENDPOINT+'/fixture/release-member',{method:'POST',headers:{'x-fixture-key':'local-protocol-fixture-not-a-real-credential'},signal:AbortSignal.timeout(5000)});
  if(release.status!==204)throw Error('member response release failed');
  mark('real teammate completion');
  const deadline=Date.now()+30000;let roster;
  do{roster=ctx.agentTeams.listMembers(agent);if(roster.length===2&&roster.every(m=>m.status==='inactive'))break;await new Promise(r=>setTimeout(r,50))}while(Date.now()<deadline);
  if(roster.length!==2||roster.some(m=>m.status!=='inactive'))throw Error('team did not settle');
  mark('flush real session persistence');
  const summaries=[];
  for(const member of roster){const live=ctx.agents.get(member.id);if(live)await ctx.sessions.flush(live.session);summaries.push({id:member.id,role:member.role,live:!!live})}
  // Completed teammates may already be unloaded. Their normal disposal flushes
  // persistence; the runner validates each real on-disk header and turn end.
  await writeFile(process.env.CABINET_FIXTURE_RESULT,JSON.stringify({ok:true,members:summaries}));
 };
 // Do not await preset resolution inside row activation: registry audits wait
 // for the host Loader tree to settle. Kick off after this apply returns.
 setTimeout(()=>{run().catch(async(error)=>{await writeFile(process.env.CABINET_FIXTURE_RESULT,JSON.stringify({ok:false,stage,errorCategory:error?.code==='ENOENT'?'ENOENT':error?.name==='TypeError'?'TypeError':'other'}));})},0);
}
