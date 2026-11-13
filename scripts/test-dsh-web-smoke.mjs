// Real official DSH host smoke, no model requests and no user profiles/credentials.
// Requires DSH_MODULE_ROOT pointing at official runtime node_modules and pnpm on PATH.
// Raw host output, launch tokens, cookies and authenticated HTML never leave memory.
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const modules=process.env.DSH_MODULE_ROOT;
if(!modules)throw Error('DSH_MODULE_ROOT is required');
if(process.platform==='win32')throw Error('This process-group smoke runner requires a POSIX runner');
const dsh=join(resolve(modules),'.bin','dsh');
const isolation=await mkdtemp(join(tmpdir(),'cabinet-web-smoke-'));
const env={PATH:dirname(process.execPath)+':'+join(resolve(modules),'.bin')+':'+(process.env.PATH||'/usr/bin:/bin'),HOME:join(isolation,'home'),DSH_HOME:join(isolation,'dsh'),XDG_CONFIG_HOME:join(isolation,'config'),XDG_DATA_HOME:join(isolation,'data'),XDG_CACHE_HOME:join(isolation,'cache'),XDG_STATE_HOME:join(isolation,'state'),TMPDIR:join(isolation,'tmp'),NPM_CONFIG_USERCONFIG:join(isolation,'empty-npmrc'),NPM_CONFIG_CACHE:join(isolation,'npm-cache'),CI:'true',NO_COLOR:'1',LANG:'C.UTF-8'};
for(const key of ['HOME','DSH_HOME','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_CACHE_HOME','XDG_STATE_HOME','TMPDIR'])await mkdir(env[key],{recursive:true});
const children=new Set();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function start(args){
 const child=spawn(dsh,args,{cwd:repo,env,detached:true,stdio:['ignore','pipe','pipe']});
 const state={child,output:'',done:false,code:null,spawnError:false};children.add(state);
 const capture=b=>{state.output=(state.output+b.toString()).slice(-16*1024*1024)};
 child.stdout.on('data',capture);child.stderr.on('data',capture);
 child.on('error',()=>{state.spawnError=true;state.done=true});
 child.on('close',code=>{state.done=true;state.code=code});return state;
}
async function stop(state){
 if(!state.child.pid)return;
 try{process.kill(-state.child.pid,'SIGTERM')}catch{}
 for(let i=0;i<30&&!state.done;i++)await pause(100);
 // Kill the group even if the launcher exited while a descendant survived.
 try{process.kill(-state.child.pid,'SIGKILL')}catch{}
 for(let i=0;i<20&&!state.done;i++)await pause(50);
 state.output='';children.delete(state);
}
function failure(label,state){
 // Never interpolate error messages, logs, URL or response bodies.
 const reason=state?.spawnError?'spawn failed':/EPERM|EACCES/.test(state?.output||'')?'permission denied':state?.done?'process exited':'timed out';
 return Error(label+': '+reason+' (raw diagnostics withheld to protect authentication material)');
}
async function run(args,label){const s=start(args);const deadline=Date.now()+180000;while(!s.done&&Date.now()<deadline)await pause(100);if(!s.done||s.code!==0){const e=failure(label,s);await stop(s);throw e}const output=s.output;await stop(s);return output}
let signalHandler;
try{
 signalHandler=()=>{for(const s of children){try{process.kill(-s.child.pid,'SIGKILL')}catch{}}process.exit(130)};
 process.once('SIGTERM',signalHandler);process.once('SIGINT',signalHandler);
 await run(['--profile','web','--dump-config'],'initialize isolated web profile');
 await run(['plugin','--profile','web','add',repo],'install checkout into isolated profile');
 const config=await run(['--profile','web','--dump-config'],'compose isolated web profile');
 if((config.match(/- id: cabinet-ui\b/g)||[]).length!==1||(config.match(/- id: preset-cabinet\b/g)||[]).length!==1)throw Error('composition must contain one cabinet-ui and one preset-cabinet');
 console.log('PASS isolated profile composition (configuration only, not UI execution)');
 const host=start(['--profile','web','--host','127.0.0.1','--port','0','--no-open']);
 const deadline=Date.now()+90000;let auth;
 while(Date.now()<deadline&&!host.done){const match=host.output.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/[^\s]*)/);if(match){try{auth=new URL(match[1])}catch{}if(auth)break}await pause(100)}
 if(!auth)throw failure('start isolated web host',host);
 if(auth.hostname!=='127.0.0.1'||auth.protocol!=='http:'||!auth.port||auth.username||auth.password||auth.pathname!=='/')throw Error('host announced an unexpected endpoint');
 const origin=auth.origin;
 const get=async(url,headers={})=>{const target=new URL(url,origin);if(target.origin!==origin)throw Error('refusing non-loopback asset destination');try{return await fetch(target,{headers,redirect:'manual',signal:AbortSignal.timeout(15000)})}catch{throw Error('loopback HTTP request failed; sensitive diagnostics withheld')}};
 const anonymous=await get('/');if(anonymous.status!==401)throw Error('anonymous root must require authentication');
 const login=await get(auth);if(login.status!==303||login.headers.get('location')!=='./')throw Error('launch authentication handoff failed');
 const cookies=login.headers.getSetCookie().map(c=>c.split(';',1)[0]).join('; ');if(!cookies)throw Error('host did not issue an authentication cookie');
 const response=await get('/',{cookie:cookies});if(response.status!==200||!response.headers.get('content-type')?.includes('text/html'))throw Error('authenticated host did not serve HTML');
 const html=await response.text();
 const match=html.match(/<script>globalThis\["__DSH_BOOT__"\]\s*=\s*(.*?)<\/script>/s);if(!match)throw Error('official boot graph absent from rendered HTML');
 let graph;try{graph=JSON.parse(match[1])}catch{throw Error('official boot graph is not valid JSON')}
 const batch=graph.batches?.find(b=>Array.isArray(b.entries)&&b.entries.includes('dsh-cabinet-mode'));
 if(!batch||typeof batch.url!=='string')throw Error('Cabinet client not present in official host boot batches');
 const asset=await get('/'+batch.url.replace(/^\//,''),{cookie:cookies});if(asset.status!==200||!asset.headers.get('content-type')?.includes('javascript'))throw Error('Cabinet boot batch not served as JavaScript');
 const javascript=await asset.text();const localClient=await readFile(join(repo,'client.js'),'utf8');
 if(!javascript.includes(localClient.trim()))throw Error('served boot batch does not contain this checkout client.js');
 console.log('PASS real host HTTP authentication, rendered boot graph and exact checkout client bytes served');
 console.log('BOUNDARY: browser execution, visual navigation and model inference are NOT tested by this HTTP smoke');
 await stop(host);
}catch(error){
 // Only our own static messages escape; never print underlying host/fetch exception stacks.
 console.error('FAIL DSH web smoke: '+(error instanceof Error?error.message:'internal failure'));
 process.exitCode=1;
}finally{
 for(const state of [...children])await stop(state);
 if(signalHandler){process.removeListener('SIGTERM',signalHandler);process.removeListener('SIGINT',signalHandler)}
 await rm(isolation,{recursive:true,force:true});
}
