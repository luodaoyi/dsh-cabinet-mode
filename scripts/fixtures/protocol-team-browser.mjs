// Real browser against the same official host and persisted deterministic Team.
// No host API mocking, synthetic services, prompt submission or model inference.
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
export async function teamBrowser({auth,env,repo,members}){
 let browser,page,stage='browser setup',pageErrors=0,consoleErrors=0,assetSeen=false;
 const origin=auth.origin,assetReads=[];
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
  // The fixture has an isolated cwd but no Workspace membership. The native
  // Cabinet ungrouped section starts collapsed; expand via its real button.
  const ungrouped=page.locator('[data-cabinet-conversation-group-title="ungrouped"]');
  await ungrouped.waitFor({state:'visible'});
  if(await ungrouped.getAttribute('aria-expanded')==='false')await ungrouped.click();
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
  if(pageErrors)throw Error('browser runtime error');
  await screenshot();
  console.log('PASS real official host Chromium: installed exact Cabinet client, real lead selection, persisted lead/member output and spawn tool history');
 }catch(error){
  const diagnostic={stage,pageErrors,consoleErrors,assetSeen,screenshotSaved:false};
  if(page){try{Object.assign(diagnostic,await page.evaluate(()=>({dialogs:document.querySelectorAll('[role="dialog"]').length,conversations:document.querySelectorAll('[data-cabinet-conversation-item]').length,historyRows:document.querySelectorAll('[data-cabinet-groupchat-row]').length,historyErrors:document.querySelectorAll('[data-cabinet-groupchat-error]').length})));diagnostic.screenshotSaved=await screenshot()}catch{}}
  console.error('DIAGNOSTIC team browser: '+JSON.stringify(diagnostic));
  // Never expose Playwright messages, which may include launch tokens/URLs.
  throw Error('official team browser failed at '+stage+' (raw diagnostics withheld)');
 }finally{process.removeListener('SIGTERM',stopBrowser);process.removeListener('SIGINT',stopBrowser);try{await browser?.close()}catch{}}
}
