// Real official Cabinet preset/Team runtime with a local deterministic Messages
// fixture and a test-only host driver. Optional --headless reads the real Team
// through the installed Cabinet client. Never a real-model inference test.
// Requires DSH_MODULE_ROOT; no credentials or user profiles are inherited.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {teamBrowser} from './fixtures/protocol-team-browser.mjs';
const headless=process.argv.includes('--headless');
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const modules=process.env.DSH_MODULE_ROOT;
if(!modules)throw Error('DSH_MODULE_ROOT is required');
if(process.platform==='win32')throw Error('POSIX process-group cleanup required');
const root=await mkdtemp(join(tmpdir(),'cabinet-protocol-fixture-'));
const prompt='CABINET_PROTOCOL_TEAM_V1';
const answer='CABINET_PROTOCOL_TEAM_REPLY_V1';
const sentinel='local-protocol-fixture-not-a-real-credential';
let child,server,requests=0,violation=false;const rejected=new Set();const calls=[];const uiCalls={};const memberMarker='CABINET_UI_MEMBER_ACK_LOST_V1';const completionMarker='CABINET_UI_MEMBER_SETTLED_V1';let memberSessionId,createdSessionId,seedSessionId;const seedMarker='CABINET_UI_CREATE_SEED_V1';const createMarker='CABINET_UI_CREATE_V1';const uiMarkers=['CABINET_UI_SEND_V1','CABINET_UI_ACK_LOST_V1',memberMarker,createMarker,seedMarker];let releaseCount=0,releaseMember;const memberGate=new Promise(resolve=>{releaseMember=resolve});
let output='',exitCode=null,done=false;
const env={PATH:dirname(process.execPath)+':'+join(resolve(modules),'.bin')+':'+(process.env.PATH||'/usr/bin:/bin'),HOME:join(root,'home'),DSH_HOME:join(root,'dsh'),XDG_CONFIG_HOME:join(root,'config'),XDG_DATA_HOME:join(root,'data'),XDG_CACHE_HOME:join(root,'cache'),XDG_STATE_HOME:join(root,'state'),TMPDIR:join(root,'tmp'),NPM_CONFIG_USERCONFIG:join(root,'empty-npmrc'),NPM_CONFIG_CACHE:join(root,'npm-cache'),CI:'true',NO_COLOR:'1',LANG:'C.UTF-8',DEEPSEEK_API_KEY:sentinel};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function assert(ok,message){if(!ok)throw Error(message)}
let cleaning;
function cleanup(){return cleaning??=(async()=>{
 if(child?.pid){try{process.kill(-child.pid,'SIGTERM')}catch{}for(let i=0;i<20&&!done;i++)await pause(100);try{process.kill(-child.pid,'SIGKILL')}catch{}}
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
 await rm(root,{recursive:true,force:true});output='';
})()}
const interrupted=()=>{cleanup().finally(()=>process.exit(130))};
process.once('SIGTERM',interrupted);process.once('SIGINT',interrupted);

async function files(dir){const result=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())result.push(...await files(p));else if(e.isFile()&&e.name.endsWith('.jsonl'))result.push(p)}return result}
try{
 for(const key of ['HOME','DSH_HOME','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_CACHE_HOME','XDG_STATE_HOME','TMPDIR'])await mkdir(env[key],{recursive:true});
 const cwd=join(root,'empty-project');await mkdir(cwd);
 env.DSH_MODULE_ROOT=resolve(modules);env.CABINET_FIXTURE_CWD=cwd;env.CABINET_FIXTURE_RESULT=join(root,'result.json');
 const patch=join(root,'fixture.patch.yml');
 // Background title generation is outside the single conversation request under test.
 await writeFile(patch,'- id: session-title-llm\n  disabled: true\n- id: session-persistence-jsonl\n  config:\n    compression: none\n    root: '+JSON.stringify(join(env.DSH_HOME,'sessions'))+'\n'+(headless?'':'- id: cabinet-ui\n  name: '+JSON.stringify(join(repo,'index.js'))+'\n')+'- insert:\n    - id: protocol-team-driver\n      name: '+JSON.stringify(join(repo,'scripts/fixtures/protocol-team-driver.mjs'))+'\n');
 if(headless){
  // Install the real bundle normally so the host discovers package client metadata.
  // Do not apply its patch twice and do not replace cabinet-ui with a host-only file.
  for(const args of [['--profile','web','--dump-config'],['plugin','--profile','web','add',repo]]){
   output='';done=false;exitCode=null;
   child=spawn(join(resolve(modules),'.bin','dsh'),args,{cwd,env,detached:true,stdio:['ignore','pipe','pipe']});
   for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{output=(output+b.toString()).slice(-4*1024*1024)});
   child.on('error',()=>{done=true;exitCode=-1});child.on('close',code=>{done=true;exitCode=code});
   const deadline=Date.now()+180000;while(!done&&Date.now()<deadline)await pause(100);
   assert(done&&exitCode===0,'official Cabinet bundle installation failed');
   try{process.kill(-child.pid,'SIGKILL')}catch{}
  }
 }
 output='';done=false;exitCode=null;
 server=createServer(async(req,res)=>{
  try{
   if(req.method==='POST'&&req.url==='/fixture/release-member'){
    assert(req.socket.remoteAddress==='127.0.0.1'&&req.headers['x-fixture-key']===sentinel&&releaseCount===0,'release control');
    releaseCount++;releaseMember();res.writeHead(204);res.end();return;
   }

   assert(req.socket.remoteAddress==='127.0.0.1','loopback peer');
   assert(req.method==='POST'&&req.url==='/v1/messages','endpoint');
   assert(req.headers['x-api-key']===sentinel,'fixture authentication');
   let body='';for await(const chunk of req){body+=chunk;assert(Buffer.byteLength(body)<1024*1024,'body budget')}
   const request=JSON.parse(body);
   assert(request.stream===true&&request.model==='deepseek-flash','protocol');
   const sessionId=req.headers['x-deepseek-harness-session-id'];
   const lead=sessionId==='session-cabinet-protocol-lead';
   assert(Array.isArray(request.messages),'fixed input');
   const lastUser=[...request.messages].reverse().find(m=>m.role==='user');
   const directMarker=uiMarkers.find(marker=>lastUser?.content?.some(c=>c.type==='text'&&c.text===marker));
   const settlement=lead&&lastUser?.content?.some(c=>c.type==='text'&&c.text===memberMarker+'_REPLY')&&lastUser.content.some(c=>c.type==='text'&&c.text===`Background subagent ${memberSessionId} finished and will do no further work unless you send it more.`);
   const uiMarker=settlement?completionMarker:directMarker;
   if(uiMarker){
    assert(headless&&(uiCalls[uiMarker]??0)===0&&(uiMarker===seedMarker?!!seedSessionId&&sessionId===seedSessionId:uiMarker===createMarker?!!createdSessionId&&sessionId===createdSessionId:uiMarker===memberMarker?sessionId===memberSessionId:lead),'UI request budget');
    if(settlement)assert(uiCalls[memberMarker]===1,'UI request budget');
    uiCalls[uiMarker]=1;
    const events=[{type:'message_start',message:{id:'fixture-ui-'+uiMarker,type:'message',role:'assistant',model:'deepseek-flash',content:[],usage:{input_tokens:1,output_tokens:0}}},{type:'content_block_start',index:0,content_block:{type:'text',text:uiMarker+'_REPLY'}},{type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:1}},{type:'message_stop'}];
    res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store'});
    for(const event of events)res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    res.end();return;
   }
   requests++;assert(requests<=4,'request budget');
   const results=request.messages.flatMap(m=>m.content||[]).filter(c=>c.type==='tool_result');
   const spawning=lead&&results.length===0;
   assert(request.messages.some(m=>m.role==='user'&&m.content?.some(c=>c.type==='text'&&c.text===(lead?prompt:'CABINET_PROTOCOL_MEMBER_V1'))),'fixed input');
   assert(!spawning||!calls.some(c=>c.role==='lead'),'single spawn');
   assert(lead||!calls.some(c=>c.role==='teammate'),'single teammate request');
   if(!lead){assert(typeof sessionId==='string'&&sessionId.length>0,'fixed input');memberSessionId=sessionId;}
   if(spawning)assert(request.tools?.some(t=>t.name==='spawn_teammate'),'fixed tool availability');
   if(lead&&!spawning)assert(results.length===1&&results[0].tool_use_id==='fixture-spawn-1'&&!results[0].is_error,'fixed tool result');
   const text=lead?answer:'CABINET_PROTOCOL_MEMBER_REPLY_V1';
   calls.push({role:lead?'lead':'teammate',toolResults:results.length,priorLeadAnswer:JSON.stringify(request.messages).includes(answer),memberReply:JSON.stringify(request.messages).includes('CABINET_PROTOCOL_MEMBER_REPLY_V1')});
   // A bounded fixed protocol state machine, never instruction following.
   // The sole emitted tool is a known Team spawn with fixed safe arguments.
   const content=spawning?{type:'tool_use',id:'fixture-spawn-1',name:'spawn_teammate',input:{name:'fixture-member',description:'Deterministic protocol test only',prompt:'CABINET_PROTOCOL_MEMBER_V1',context:'fresh'}}:{type:'text',text};
   const events=[
    {type:'message_start',message:{id:'fixture-message-'+requests,type:'message',role:'assistant',model:'deepseek-flash',content:[],stop_reason:null,usage:{input_tokens:1,output_tokens:0}}},
    {type:'content_block_start',index:0,content_block:content},
    {type:'content_block_stop',index:0},
    {type:'message_delta',delta:{stop_reason:spawning?'tool_use':'end_turn',stop_sequence:null},usage:{output_tokens:1}},
    {type:'message_stop'}
   ];
   if(!lead)await memberGate;
   res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store'});
   for(const event of events)res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
   res.end();
  }catch(error){violation=true;rejected.add(['request budget','loopback peer','endpoint','fixture authentication','body budget','protocol','fixed input','fixed tool availability','fixed tool result','release control','single spawn','single teammate request','UI request budget'].includes(error.message)?error.message:'parse');res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({type:'error',error:{type:'invalid_request_error',message:'fixture request rejected'}}))}
 });
 server.requestTimeout=10000;server.headersTimeout=10000;
 await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes)});
 env.DEEPSEEK_BASE_URL=`http://127.0.0.1:${server.address().port}`;env.CABINET_FIXTURE_ENDPOINT=env.DEEPSEEK_BASE_URL;
 child=spawn(join(resolve(modules),'.bin','dsh'),['--profile','web',...(headless?[]:['--patch',join(repo,'cordis.patch.yml')]),'--patch',join(resolve(modules),'@deepseek-ai/dsh-experimental-agent-team-profile/cordis.patch.yml'),'--patch',patch,'--host','127.0.0.1','--port','0','--no-open'],{cwd,env,detached:true,stdio:['ignore','pipe','pipe']});
 for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{output=(output+b.toString()).slice(-4*1024*1024)});
 child.on('error',()=>{done=true;exitCode=-1});child.on('close',code=>{done=true;exitCode=code});
 const deadline=Date.now()+90000;let report;
 while(!done&&Date.now()<deadline){try{report=JSON.parse(await readFile(env.CABINET_FIXTURE_RESULT,'utf8'));break}catch{}await pause(100)}
 assert(report,'official team driver timed out or exited');
 if(!report.ok)console.log('DIAGNOSTIC team facts: '+JSON.stringify({facts:report.facts,errorCategory:report.errorCategory}));
 assert(report.ok,'official team driver failed at '+report.stage);
 assert(!violation&&releaseCount===1&&requests===4,'expected exactly four valid deterministic model requests');
 const logs=await files(join(env.DSH_HOME,'sessions'));
 assert(logs.length===2,'expected two real persisted team session logs');
 const rows=[];for(const log of logs){const data=(await readFile(log,'utf8')).trim().split('\n').map(line=>JSON.parse(line));assert(data[0].cwd===cwd&&data[0].agentPreset==='cabinet'&&report.members.some(m=>m.id===data[0].id),'persisted team header mismatch');assert(data.filter(r=>r.type==='turn/end').length===(data[0].id==='session-cabinet-protocol-lead'?2:1),'persisted log turn count mismatch');
 if(data[0].id!=='session-cabinet-protocol-lead')assert(data[0].parentSession==='session-cabinet-protocol-lead','persisted teammate parent mismatch');rows.push(...data)}
 const raw=JSON.stringify(rows);
 assert(calls.filter(c=>c.role==='teammate').length===1&&calls.filter(c=>c.role==='lead').length===3,'expected one teammate and three lead requests');
 assert(raw.includes(prompt)&&raw.includes(answer)&&raw.includes('CABINET_PROTOCOL_MEMBER_REPLY_V1'),'persisted logs missing team messages');
 const toolCalls=rows.filter(r=>r.type==='tool/call'),toolResults=rows.filter(r=>r.type==='tool/result');
 assert(toolCalls.length===1&&toolCalls[0].data.name==='spawn_teammate'&&toolCalls[0].data.callId==='fixture-spawn-1','persisted unexpected tool call');
 assert(toolResults.length===1&&toolResults[0].data.message.toolCallId==='fixture-spawn-1'&&!toolResults[0].data.message.isError,'persisted spawn result unsuccessful');
 const leadCalls=calls.filter(c=>c.role==='lead');
 assert(!leadCalls[0].priorLeadAnswer&&leadCalls[0].toolResults===0&&!leadCalls[1].priorLeadAnswer&&leadCalls[1].toolResults===1&&leadCalls[2].priorLeadAnswer&&leadCalls[2].memberReply,'expected fixed spawn/result/completion-notification sequence');
 console.log('PASS real official Cabinet preset + Team runtime + Messages fixture: spawn tool loop, one member reply, both settled turns and real persisted sessions');
 if(headless){
  const match=output.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/[^\s]*)/);
  assert(match,'official host authentication URL absent');
  const auth=new URL(match[1]);
  assert(auth.hostname==='127.0.0.1'&&auth.protocol==='http:'&&auth.port&&!auth.username&&!auth.password&&auth.pathname==='/','official host endpoint unexpected');
  const proofs=await teamBrowser({auth,env,repo,members:report.members,onCreated:(id,kind)=>{assert(!report.members.some(m=>m.id===id),'expected ordinary UI session');if(kind==='seed'){assert(!seedSessionId&&!createdSessionId,'expected one initialized blank');seedSessionId=id}else{assert(!createdSessionId&&id!==seedSessionId,'expected fresh UI-created session');createdSessionId=id}}});
  assert(!violation&&requests===4&&[...uiMarkers,completionMarker].every(marker=>uiCalls[marker]===(marker===seedMarker&&!seedSessionId?undefined:1)),'expected independent UI model budgets');
  // Graceful official Host shutdown drains its own persistence. Never write or
  // fabricate log entries, and read the new evidence only after browser sends.
  process.kill(-child.pid,'SIGTERM');
  const flushDeadline=Date.now()+15000;while(!done&&Date.now()<flushDeadline)await pause(100);
  assert(done,'official host did not shut down for persistence verification');
  const persisted=[];for(const log of await files(join(env.DSH_HOME,'sessions'))){const data=(await readFile(log,'utf8')).trim().split('\n').map(line=>JSON.parse(line));persisted.push(...data.map(row=>({...row,fixtureSessionId:data[0].id})));}
  assert(proofs.length===(seedSessionId?5:4),'expected real browser acceptance proofs');
  if(seedSessionId){const seedRows=persisted.filter(row=>row.fixtureSessionId===seedSessionId);assert(seedRows.length>0&&seedRows[0].cwd===cwd&&!seedRows[0].parentSession&&seedRows.filter(row=>row.type==='turn/end').length===1,'persisted initialized blank header or turn mismatch');}
  const createdRows=persisted.filter(row=>row.fixtureSessionId===createdSessionId);
  assert(createdRows.length>0&&createdRows[0].cwd===cwd&&!createdRows[0].parentSession&&createdRows.filter(row=>row.type==='turn/end').length===1,'persisted UI-created ordinary session header or turn mismatch');
  for(const proof of proofs){
   const accepted=persisted.filter(row=>row.type==='user/message'&&row.data?.source?.kind==='user'&&row.data.source.rpcId===proof.requestId);
   assert(accepted.length===1&&accepted[0].fixtureSessionId===proof.sessionId&&(!proof.messageId||accepted[0].data.id===proof.messageId)&&accepted[0].data.content.some(c=>c.type==='text'&&c.text===proof.marker),'persisted UI prompt must appear exactly once with real request identity');
  }
  const memberInputs=persisted.filter(row=>row.type==='user/message'&&row.data?.content?.some(c=>c.type==='text'&&c.text===memberMarker));
  assert(memberInputs.length===1&&memberInputs[0].fixtureSessionId===memberSessionId,'persisted member prompt must not be resent or forwarded to Lead');
  assert(persisted.filter(r=>r.type==='tool/call').length===1,'persisted unexpected tool during UI sends');
  console.log('PASS browser-send persistence: normal and ACK-lost Lead/member prompts each accepted exactly once with real RPC identity');
 }
 console.log('BOUNDARY: deterministic protocol fixture, not real model inference'+(headless?'; real browser read/navigation, normal send, accepted-ACK-loss and ordinary UI session creation tested':'; browser and UI creation not tested'));

 if(process.env.CABINET_PROTOCOL_REPORT)await writeFile(process.env.CABINET_PROTOCOL_REPORT,JSON.stringify({fixture:'team-v1',requests,persistedRows:rows.length,members:report.members.map(({id,role})=>({id,role,preset:'cabinet',turnEnded:true})),modelInference:false},null,2)+'\n');
}catch(error){
 console.error('DIAGNOSTIC fixture: '+JSON.stringify({requests,uiCalls,calls,rejections:[...rejected],hostAnnounced:/dsh web:/.test(output),driverMentioned:/protocol-team-driver/.test(output),stages:['driver applied','resolve cabinet preset','create real cabinet agent','real lead tool loop','real teammate completion','flush real session persistence'].filter(s=>output.includes('FIXTURE_STAGE '+s))}));
 console.error('FAIL protocol fixture: '+(error instanceof Error&&/^(official |expected |persisted |text fixture)/.test(error.message)?error.message:'fixture setup or validation failed (raw diagnostics withheld)'));
 process.exitCode=1;
}finally{
 await cleanup();
 process.removeListener('SIGTERM',interrupted);process.removeListener('SIGINT',interrupted);
}
