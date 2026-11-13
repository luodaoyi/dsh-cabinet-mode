// Real browser against the same official host and persisted deterministic Team.
// Real fixed prompt submissions; no synthetic host services or real model inference.
// ACK-loss injection forwards the real request before suppressing its accepted response.
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {createSessionInBrowser} from './protocol-session-browser.mjs';
export async function teamBrowser({auth,env,repo,members,onCreated}){
 let browser,page,stage='browser setup',pageErrors=0,consoleErrors=0,assetSeen=false;
 const origin=auth.origin,assetReads=[],proofs=[],promptCounts=new Map();let routeFailed=false;
 const stopBrowser=()=>{browser?.close().catch(()=>{})};
 process.once('SIGTERM',stopBrowser);process.once('SIGINT',stopBrowser);
 const screenshot=async()=>{if(!page||!process.env.CABINET_TEAM_SCREENSHOT)return false;const url=new URL(page.url());if(url.origin!==origin||url.search||url.hash)return false;await page.screenshot({path:process.env.CABINET_TEAM_SCREENSHOT,fullPage:true});return true};
 try{
  if(!process.env.DSH_BROWSER_TEST_ROOT||!process.env.CHROME_PATH)throw Error('browser configuration missing');
  const require=createRequire(join(resolve(process.env.DSH_BROWSER_TEST_ROOT),'package.json'));
  const localClient=(await readFile(join(repo,'client.js'),'utf8')).trim();
  stage='Chromium launch';
  browser=await require('playwright-core').chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox'],env,timeout:30000});
  const context=await browser.newContext({viewport:{width:1400,height:1000},serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  page=await context.newPage();page.setDefaultTimeout(30000);
  page.on('pageerror',()=>pageErrors++);page.on('console',message=>{if(message.type()==='error')consoleErrors++});
  page.on('response',response=>{if(response.url().startsWith(origin+'/')&&response.status()===200&&response.headers()['content-type']?.includes('javascript'))assetReads.push(response.text().then(text=>{if(text.includes(localClient))assetSeen=true}).catch(()=>{}))});
  stage='official authenticated host';
  await page.goto(auth.href,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForURL(url=>url.origin===origin&&!url.search&&!url.hash);
  stage='official preview notice';
  const preview=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:/^(Preview Notice|预览版说明)$/})});
  await preview.waitFor({state:'visible',timeout:45000});await preview.getByRole('button',{name:/^(Continue|继续)$/}).click();await preview.waitFor({state:'hidden'});
  const entry=page.getByRole('button',{name:/^(Cabinet|内阁)$/}).filter({has:page.locator('[data-cabinet-panel-icon]')});
  const later=page.getByRole('dialog').getByRole('button',{name:/^(Configure later|稍后配置)$/});
  const accountClose=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:/^(Get started|开始使用)$/})}).getByRole('button',{name:/^(Close|关闭)$/});
  const dismiss=later.or(accountClose);
  stage='ordinary optional model onboarding';
  // The sentinel-backed local model can already be configured. Do not require
  // a missing-key modal. Inert-root entries are excluded by accessible roles.
  await dismiss.or(entry).first().waitFor({state:'visible'});
  if(await dismiss.isVisible())await dismiss.click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.getElementById('root')?.inert===false);
  stage='actual Cabinet sidebar navigation';
  await entry.click();await page.locator('[data-cabinet-page]').waitFor({state:'visible'});
  await Promise.all(assetReads);if(!assetSeen)throw Error('exact client asset not loaded');
  const lead=members.find(m=>m.role==='lead'),member=members.find(m=>m.role==='teammate');
  if(!lead||!member)throw Error('validated team absent');
  stage='real lead listed and selected';
  // Official host may create a Workspace for the isolated cwd. Do not assume
  // the team belongs to Ungrouped: expand actual groups via their normal buttons.
  const groupTitles=page.locator('[data-cabinet-conversation-group-title]');
  await groupTitles.first().waitFor({state:'visible'});
  const collapsedTitles=page.locator('[data-cabinet-conversation-group-title][aria-expanded="false"]');
  const groupBudget=await groupTitles.count();
  for(let i=0;i<groupBudget&&await collapsedTitles.count()>0;i++)await collapsedTitles.first().click();
  const leadRow=page.locator(`[data-cabinet-conversation-item][data-cabinet-conversation-id=${JSON.stringify(lead.id)}]`);
  await leadRow.waitFor({state:'visible'});await leadRow.click();
  await page.waitForFunction(id=>document.querySelector('[data-cabinet-page-session]')?.value===id,lead.id);
  stage='real merged lead and member history';
  // CabinetPage pins activeTab=groupchat and hideTabs=true; unlike the right
  // sidebar panel there is intentionally no tab button to click here.
  await page.waitForFunction(ids=>{const group=document.querySelector('[data-cabinet-groupchat]');const state=group?.getAttribute('data-cabinet-groupchat-members')||'';return ids.every(id=>state.includes(id+':'))},[lead.id,member.id]);
  const group=page.locator('[data-cabinet-groupchat]');
  // Driver input has no user-rpc identity and is intentionally hidden as
  // context. Do not fabricate rpcId or claim this session was created in UI.
  await group.locator('[data-cabinet-groupchat-row="assistant"]').filter({has:page.locator(`[data-cabinet-open-session=${JSON.stringify(lead.id)}]`)}).filter({hasText:'CABINET_PROTOCOL_TEAM_REPLY_V1'}).first().waitFor({state:'visible'});
  await group.locator('[data-cabinet-groupchat-row="assistant"]').filter({has:page.locator(`[data-cabinet-open-session=${JSON.stringify(member.id)}]`)}).filter({hasText:'CABINET_PROTOCOL_MEMBER_REPLY_V1'}).first().waitFor({state:'visible'});
  if(await group.locator('[data-cabinet-groupchat-error]').count())throw Error('real history read failed');
  stage='real persisted spawn tool in history';
  const tool=group.locator('[data-cabinet-groupchat-tools]').first();await tool.click();
  await group.locator('[data-cabinet-groupchat-tool]').filter({hasText:'spawn_teammate'}).waitFor({state:'visible'});
  const promptRoute=async route=>{
   let marker;
   try{
    const envelope=route.request().postDataJSON();
    const request=envelope?.payload?.args?.request;
    marker=request?.content?.length===1&&request.content[0].type==='text'?request.content[0].text:undefined;
    if(!['CABINET_UI_SEND_V1','CABINET_UI_ACK_LOST_V1'].includes(marker)){await route.continue();return}
    promptCounts.set(marker,(promptCounts.get(marker)||0)+1);
    if(envelope.type!=='client-request'||envelope.method!=='session/prompt'||request.sessionId!==lead.id||request.mode!=='queue'||typeof request.requestId!=='string'||promptCounts.get(marker)!==1)throw Error('unexpected prompt');
    // Forward exactly once, then inspect the REAL Host acknowledgement BEFORE
    // suppressing it. No abort-before-admission, retries, synthetic ACK or replay.
    const response=await route.fetch({maxRetries:0,maxRedirects:0,timeout:30000});
    const ack=await response.json();
    if(response.status()!==200||ack.type!=='server-response'||ack.rpcId!==envelope.rpcId||ack.result?.ok!==true||ack.result.value?.accepted!==true)throw Error('host did not accept');
    proofs.push({marker,requestId:request.requestId,sessionId:lead.id});
    if(marker==='CABINET_UI_ACK_LOST_V1')await route.abort('failed');
    else await route.fulfill({response});
   }catch{routeFailed=true;try{await route.abort('failed')}catch{}}
  };
  await context.route(origin+'/api/session/prompt',promptRoute);
  const input=page.locator('[data-cabinet-groupchat-input]');
  for(const marker of ['CABINET_UI_SEND_V1','CABINET_UI_ACK_LOST_V1']){
   stage=marker==='CABINET_UI_SEND_V1'?'normal Cabinet prompt acknowledgement':'accepted Lead prompt with acknowledgement lost';
   await input.fill(marker);await page.locator('[data-cabinet-groupchat-send]').click();
   await page.waitForFunction(()=>document.querySelector('[data-cabinet-groupchat-send]')?.getAttribute('data-cabinet-groupchat-sending')==='0');
   await group.locator('[data-cabinet-groupchat-row="assistant"]').filter({has:page.locator(`[data-cabinet-open-session=${JSON.stringify(lead.id)}]`)}).filter({hasText:marker+'_REPLY'}).first().waitFor({state:'visible'});
   if(routeFailed||promptCounts.get(marker)!==1||proofs.filter(p=>p.marker===marker).length!==1)throw Error('prompt acceptance proof failed');
   if(marker==='CABINET_UI_SEND_V1'){
    if(await input.inputValue()!=='')throw Error('acknowledged draft not cleared');
   }else{
    if(await input.inputValue()!==marker)throw Error('uncertain draft not retained');
    const hint=page.locator('[data-cabinet-groupchat-composer-hint]');
    await hint.waitFor({state:'visible'});
    if(!/Delivery outcome unknown; not resent|发送结果未知，未自动重发/.test(await hint.innerText()))throw Error('missing explicit uncertain-delivery warning');
   }
  }
  stage='accepted mentioned member prompt with acknowledgement lost';
  const memberMarker='CABINET_UI_MEMBER_ACK_LOST_V1';
  // A member is addressed through the real subagents API, whose successful
  // value is an inbox messageId, NOT the session/prompt accepted boolean.
  await context.route(origin+'/api/subagents/prompt',async route=>{
   try{
    const envelope=route.request().postDataJSON(),request=envelope?.payload?.args?.request;
    const marker=request?.content?.length===1&&request.content[0].type==='text'?request.content[0].text:undefined;
    if(marker!==memberMarker){await route.continue();return}
    promptCounts.set(marker,(promptCounts.get(marker)||0)+1);
    if(envelope.type!=='client-request'||envelope.method!=='subagents/prompt'||request.parentSessionId!==lead.id||request.childSessionId!==member.id||request.mode!=='continuable'||request.delivery!=='queue'||typeof request.requestId!=='string'||promptCounts.get(marker)!==1)throw Error('unexpected routed prompt');
    const response=await route.fetch({maxRetries:0,maxRedirects:0,timeout:30000});
    const ack=await response.json();
    if(response.status()!==200||ack.type!=='server-response'||ack.rpcId!==envelope.rpcId||ack.result?.ok!==true||typeof ack.result.value?.messageId!=='string'||!ack.result.value.messageId)throw Error('host did not accept routed prompt');
    proofs.push({marker,requestId:request.requestId,sessionId:member.id,messageId:ack.result.value.messageId});
    await route.abort('failed');
   }catch{routeFailed=true;try{await route.abort('failed')}catch{}}
  });
  // Select an actual mention option. Merely typing an @label is not selection.
  await input.fill('@');
  await page.locator(`[data-cabinet-mention-option=${JSON.stringify(member.id)}]`).click();
  const mentionedDraft=(await input.inputValue())+memberMarker;
  await input.fill(mentionedDraft);
  await page.locator(`[data-cabinet-mention-chip=${JSON.stringify(member.id)}]`).waitFor({state:'visible'});
  await page.locator('[data-cabinet-groupchat-send]').click();
  await page.waitForFunction(()=>document.querySelector('[data-cabinet-groupchat-send]')?.getAttribute('data-cabinet-groupchat-sending')==='0');
  await group.locator('[data-cabinet-groupchat-row="assistant"]').filter({has:page.locator(`[data-cabinet-open-session=${JSON.stringify(member.id)}]`)}).filter({hasText:memberMarker+'_REPLY'}).first().waitFor({state:'visible'});
  // Completion legitimately wakes the Lead. Its independently-budgeted response
  // proves notification processing; it is not a fallback resend of member input.
  await group.locator('[data-cabinet-groupchat-row="assistant"]').filter({has:page.locator(`[data-cabinet-open-session=${JSON.stringify(lead.id)}]`)}).filter({hasText:'CABINET_UI_MEMBER_SETTLED_V1_REPLY'}).first().waitFor({state:'visible'});
  if(routeFailed||promptCounts.get(memberMarker)!==1||proofs.filter(p=>p.marker===memberMarker).length!==1||await input.inputValue()!==mentionedDraft)throw Error('routed acceptance or draft proof failed');
  if(await page.locator('[data-cabinet-mention-fallback]').count())throw Error('member prompt fell back to Lead');
  const memberHint=page.locator('[data-cabinet-groupchat-composer-hint]');
  await memberHint.waitFor({state:'visible'});
  if(!/Delivery outcome unknown; not resent|发送结果未知，未自动重发/.test(await memberHint.innerText()))throw Error('missing routed uncertain-delivery warning');
  if(pageErrors||routeFailed||[...promptCounts.values()].some(n=>n!==1))throw Error('browser prompt runtime or duplication failure');
  stage='real UI-created ordinary session and native composer';
  proofs.push(await createSessionInBrowser({page,context,origin,members,cwd:env.CABINET_FIXTURE_CWD,onCreated}));
  if(pageErrors)throw Error('browser runtime error during UI creation');
  await screenshot();
  console.log('PASS real Cabinet sends: normal ACK and accepted-then-lost Lead/member ACK, one request per fixed prompt');
  return proofs;


 }catch(error){
  const diagnostic={stage,pageErrors,consoleErrors,assetSeen,screenshotSaved:false,acceptedPromptCount:proofs.length,promptCounts:Object.fromEntries(promptCounts),routeFailed};
  if(page){try{Object.assign(diagnostic,await page.evaluate(()=>({dialogs:document.querySelectorAll('[role="dialog"]').length,conversations:document.querySelectorAll('[data-cabinet-conversation-item]').length,historyRows:document.querySelectorAll('[data-cabinet-groupchat-row]').length,historyErrors:document.querySelectorAll('[data-cabinet-groupchat-error]').length})));diagnostic.screenshotSaved=await screenshot()}catch{}}
  console.error('DIAGNOSTIC team browser: '+JSON.stringify(diagnostic));
  // Never expose Playwright messages, which may include launch tokens/URLs.
  throw Error('official team browser failed at '+stage+' (raw diagnostics withheld)');
 }finally{process.removeListener('SIGTERM',stopBrowser);process.removeListener('SIGINT',stopBrowser);try{await browser?.close()}catch{}}
}
