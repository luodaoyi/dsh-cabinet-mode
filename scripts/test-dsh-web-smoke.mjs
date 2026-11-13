// Real official DSH host smoke, no model requests and no user profiles/credentials.
// Requires DSH_MODULE_ROOT pointing at official runtime node_modules and pnpm on PATH.
// Optional --headless requires DSH_BROWSER_TEST_ROOT/playwright-core and CHROME_PATH.
// Raw host output, launch tokens, cookies and authenticated HTML never leave memory.
// No traces, storage state or raw browser diagnostics are saved. Optional failure PNG
// requires CABINET_HOST_SCREENSHOT and a clean same-origin URL without query/fragment.
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
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
async function browserSmoke(auth,origin,batchUrl){
 let browser,page,stage='dependency setup',assetSeen=false,pageErrors=0,consoleErrors=0,failedRequests=0,httpFailures=0;
 const categories=new Set();
 const categorize=value=>{const message=String(value||'');for(const [name,pattern] of [['module-resolution',/module.*(?:not found|resolve)|cannot find|unknown module/i],['service-injection',/inject|unresolved.*service|missing.*service/i],['javascript-reference',/ReferenceError|not defined|before initialization/i],['react-render',/React|hook|render|element type/i],['authentication',/unauthorized|forbidden|\b401\b|\b403\b/i],['connection',/websocket|connection|network|fetch/i],['bootstrap',/bootstrap|boot|loader|registration/i]])if(pattern.test(message))categories.add(name)};
 try{
  const testRoot=process.env.DSH_BROWSER_TEST_ROOT;
  if(!testRoot||!process.env.CHROME_PATH)throw Error('missing browser configuration');
  const require=createRequire(join(resolve(testRoot),'package.json'));
  stage='Chromium launch';
  browser=await require('playwright-core').chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox'],env,timeout:30000});
  const context=await browser.newContext({viewport:{width:1400,height:900},serviceWorkers:'block'});
  // Real official services only. Block third-party HTTP requests, never stub host APIs.
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   return url.origin===origin?route.continue():route.abort();
  });
  page=await context.newPage();page.setDefaultTimeout(30000);
  page.on('pageerror',error=>{pageErrors++;categorize(error.message)});
  page.on('console',message=>{if(message.type()==='error'){consoleErrors++;categorize(message.text())}});
  page.on('requestfailed',()=>failedRequests++);
  const expected=new URL('/'+batchUrl.replace(/^\//,''),origin).href;
  page.on('response',response=>{if(response.url()===expected&&response.status()===200)assetSeen=true;if(response.status()>=400)httpFailures++});
  stage='authenticated official page navigation';
  await page.goto(auth.href,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForURL(url=>url.origin===origin&&url.search==='',{timeout:15000});
  stage='Cabinet client bootstrap and sidebar entry';
  const icon=page.locator('[data-cabinet-panel-icon]').first();await icon.waitFor({state:'visible',timeout:45000});
  if(!assetSeen)throw Error('official client asset not requested');
  await icon.click();
  stage='Cabinet page rendered by real host';
  await page.locator('[data-cabinet-page]').waitFor({state:'visible'});
  await page.locator('[data-cabinet-page-note]').waitFor({state:'visible'});
  if(await page.locator('[data-cabinet-page-session] option').count()!==0)throw Error('fresh profile unexpectedly has visible sessions');
  stage='Cabinet native sidebar interactions';
  const toggle=page.locator('[data-cabinet-split-toggle]');
  await toggle.click();await page.waitForFunction(()=>document.querySelector('[data-cabinet-cabinet-rail]')?.getAttribute('data-cabinet-rail-open')==='0');
  await toggle.click();await page.waitForFunction(()=>document.querySelector('[data-cabinet-cabinet-rail]')?.getAttribute('data-cabinet-rail-open')==='1');
  await page.locator('[data-cabinet-conversation-settings]').click();
  await page.locator('[data-cabinet-page-settings][data-cabinet-page-settings-open="1"]').waitFor({state:'visible'});
  await page.locator('[data-cabinet-settings-close]').click();
  await page.locator('[data-cabinet-page-list][data-cabinet-page-list-open="1"]').waitFor({state:'visible'});
  if(pageErrors!==0)throw Error('browser runtime error');
  console.log('PASS real official host Chromium: client batch requested, Cabinet entry/page, empty profile, rail toggles and settings navigation');
 }catch(error){
  // Emit only fixed schema booleans/counts and allowlisted categories, never text/URLs.
  const safe={assetSeen,pageErrors,consoleErrors,failedRequests,httpFailures,errorCategories:[...categories].sort()};
  if(page){try{
   Object.assign(safe,await page.evaluate(()=>({
    cabinetIconCount:document.querySelectorAll('[data-cabinet-panel-icon]').length,
    cabinetPageCount:document.querySelectorAll('[data-cabinet-page]').length,
    buttonCount:document.querySelectorAll('button').length,
    dialogCount:document.querySelectorAll('[role="dialog"],dialog').length,
    bootGraphPresent:!!globalThis.__DSH_BOOT__,
    bootGraphHasCabinet:!!globalThis.__DSH_BOOT__?.batches?.some(b=>b.entries?.includes('dsh-cabinet-mode')),
    loaderPresent:!!globalThis.__ModuleLoader__,
    loaderStillQueued:globalThis.__ModuleLoader__?.mode==='queue',
    onboardingText:/welcome|onboarding|欢迎|开始使用|配置模型|configure.*model/i.test(document.body?.innerText||''),
    connectionText:/connecting|disconnected|reconnect|连接中|未连接|重新连接/i.test(document.body?.innerText||''),
    errorText:/failed|error|失败|错误/i.test(document.body?.innerText||'')
   })));
  }catch{safe.domProbeFailed=true}
  try{
   const current=new URL(page.url());
   safe.cleanHostUrl=current.origin===origin&&current.search===''&&current.hash==='';
   if(safe.cleanHostUrl&&process.env.CABINET_HOST_SCREENSHOT){
    // This empty-profile page has no user data; screenshot excludes browser chrome.
    await page.screenshot({path:process.env.CABINET_HOST_SCREENSHOT,fullPage:true});safe.screenshotSaved=true;
   }
  }catch{safe.screenshotSaved=false}}
  console.log('DIAGNOSTIC real-host browser: '+JSON.stringify(safe));
  const reason=/EPERM|Operation not permitted|Permission denied/.test(String(error?.message||''))?' (permission denied)':/executable.*doesn.t exist|ENOENT/i.test(String(error?.message||''))?' (browser executable missing)':'';
  // Playwright exceptions can embed the authenticated navigation URL. Never forward them.
  throw Error('real-host browser smoke failed at '+stage+reason+'; raw browser diagnostics withheld');
 }finally{try{await browser?.close()}catch{}}
}
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
 if(process.argv.includes('--headless')){
  await browserSmoke(auth,origin,batch.url);
  console.log('BOUNDARY: real empty-profile UI boot/navigation tested; populated workspaces, model inference and live agent runs are NOT tested');
 }else console.log('BOUNDARY: browser execution, visual navigation and model inference are NOT tested by this HTTP smoke');
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
