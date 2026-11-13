// Real official DSH headless/adapter/session-persistence integration with a local
// deterministic Messages-protocol fixture. NOT a real model or Cabinet UI test.
// Requires DSH_MODULE_ROOT; no credentials or user profiles are inherited.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
const modules=process.env.DSH_MODULE_ROOT;
if(!modules)throw Error('DSH_MODULE_ROOT is required');
if(process.platform==='win32')throw Error('POSIX process-group cleanup required');
const root=await mkdtemp(join(tmpdir(),'cabinet-protocol-fixture-'));
const prompt='CABINET_PROTOCOL_FIXTURE_TEXT_V1';
const answer='CABINET_PROTOCOL_FIXTURE_REPLY_V1';
const sentinel='local-protocol-fixture-not-a-real-credential';
let child,server,requests=0,violation=false;const rejected=new Set();
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
 const patch=join(root,'fixture.patch.yml');
 // Background title generation is outside the single conversation request under test.
 await writeFile(patch,'- id: session-title-llm\n  disabled: true\n- id: session-persistence-jsonl\n  config:\n    compression: none\n    root: '+JSON.stringify(join(env.DSH_HOME,'sessions'))+'\n');
 server=createServer(async(req,res)=>{
  try{
   requests++;
   assert(requests<=4,'request budget');
   assert(req.socket.remoteAddress==='127.0.0.1','loopback peer');
   assert(req.method==='POST'&&req.url==='/v1/messages','endpoint');
   assert(req.headers['x-api-key']===sentinel,'fixture authentication');
   let body='';for await(const chunk of req){body+=chunk;assert(Buffer.byteLength(body)<1024*1024,'body budget')}
   const request=JSON.parse(body);
   assert(request.stream===true&&request.model==='deepseek-flash','protocol');
   assert(Array.isArray(request.messages)&&request.messages.some(m=>m.role==='user'&&m.content?.some(c=>c.type==='text'&&c.text===prompt)),'fixed input');
   // No tool calls are emitted in phase one, regardless of supplied instructions/tools.
   const events=[
    {type:'message_start',message:{id:'fixture-message-1',type:'message',role:'assistant',model:'deepseek-flash',content:[],stop_reason:null,usage:{input_tokens:1,output_tokens:0}}},
    {type:'content_block_start',index:0,content_block:{type:'text',text:''}},
    {type:'content_block_delta',index:0,delta:{type:'text_delta',text:answer}},
    {type:'content_block_stop',index:0},
    {type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:1}},
    {type:'message_stop'}
   ];
   res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store'});
   for(const event of events)res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
   res.end();
  }catch(error){violation=true;rejected.add(['request budget','loopback peer','endpoint','fixture authentication','body budget','protocol','fixed input'].includes(error.message)?error.message:'parse');res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({type:'error',error:{type:'invalid_request_error',message:'fixture request rejected'}}))}
 });
 server.requestTimeout=10000;server.headersTimeout=10000;
 await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes)});
 env.DEEPSEEK_BASE_URL=`http://127.0.0.1:${server.address().port}`;
 child=spawn(join(resolve(modules),'.bin','dsh'),['--profile','headless','--patch',patch,'--json','--approval-policy','never',prompt],{cwd,env,detached:true,stdio:['ignore','pipe','pipe']});
 for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{output=(output+b.toString()).slice(-4*1024*1024)});
 child.on('error',()=>{done=true;exitCode=-1});child.on('close',code=>{done=true;exitCode=code});
 const deadline=Date.now()+90000;while(!done&&Date.now()<deadline)await pause(100);
 assert(done,'official headless run timed out');
 assert(exitCode===0,'official headless run failed (raw diagnostics withheld)');
 assert(!violation&&requests===1,'expected exactly one valid deterministic model request');
 assert(output.includes(answer),'official runner did not emit fixed response');
 const logs=await files(join(env.DSH_HOME,'sessions'));
 assert(logs.length===1,'expected one real persisted session log');
 const raw=await readFile(logs[0],'utf8');const rows=raw.trim().split('\n').map(line=>JSON.parse(line));
 assert(raw.includes(prompt)&&raw.includes(answer),'persisted log missing prompt or response');
 assert(rows.some(row=>row.type==='turn/end'),'persisted log missing turn/end');
 assert(!rows.some(row=>row.type==='tool/call'),'text fixture unexpectedly executed a tool');
 console.log('PASS real official headless + Messages SSE adapter: one fixed prompt/response, settled turn, real persisted session');
 console.log('BOUNDARY: deterministic protocol fixture only; no real model inference, Cabinet preset, team orchestration or browser interaction tested');
 if(process.env.CABINET_PROTOCOL_REPORT)await writeFile(process.env.CABINET_PROTOCOL_REPORT,JSON.stringify({fixture:'text-v1',requests,persistedRows:rows.length,turnEnded:true,modelInference:false},null,2)+'\n');
}catch(error){
 console.error('DIAGNOSTIC fixture: '+JSON.stringify({requests,rejections:[...rejected]}));
 console.error('FAIL protocol fixture: '+(error instanceof Error&&/^(official |expected |persisted |text fixture)/.test(error.message)?error.message:'fixture setup or validation failed (raw diagnostics withheld)'));
 process.exitCode=1;
}finally{
 await cleanup();
 process.removeListener('SIGTERM',interrupted);process.removeListener('SIGINT',interrupted);
}
