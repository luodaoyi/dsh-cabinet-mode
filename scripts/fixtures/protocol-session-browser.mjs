// Normal official New session UI + native composer, against the same isolated
// host. All API responses pass through unchanged. No synthetic session creation.
export async function createSessionInBrowser({page,context,origin,members,cwd,onCreated}){
 const marker='CABINET_UI_CREATE_V1';let sessionId,createCount=0,promptCount=0,failed=false,proof;
 const createRoute=async route=>{
  try{
   const envelope=route.request().postDataJSON(),request=envelope?.payload?.args?.request;
   if(envelope.type!=='client-request'||envelope.method!=='session/create'||!request||++createCount!==1||request.sessionId!==undefined||(request.cwd!==undefined&&request.cwd!==cwd))throw Error('unexpected creation');
   const response=await route.fetch({maxRetries:0,maxRedirects:0,timeout:30000}),ack=await response.json();
   sessionId=ack.result?.value?.sessionId;
   if(response.status()!==200||ack.type!=='server-response'||ack.rpcId!==envelope.rpcId||ack.result?.ok!==true||typeof sessionId!=='string'||!sessionId||members.some(m=>m.id===sessionId))throw Error('creation not acknowledged');
   onCreated(sessionId);await route.fulfill({response});
  }catch{failed=true;try{await route.abort('failed')}catch{}}
 };
 const promptRoute=async route=>{
  try{
   const envelope=route.request().postDataJSON(),request=envelope?.payload?.args?.request;
   if(request?.content?.length!==1||request.content[0].type!=='text'||request.content[0].text!==marker){await route.fallback();return}
   if(envelope.type!=='client-request'||envelope.method!=='session/prompt'||request.sessionId!==sessionId||!sessionId||request.mode!=='queue'||typeof request.requestId!=='string'||++promptCount!==1)throw Error('unexpected new-session prompt');
   const response=await route.fetch({maxRetries:0,maxRedirects:0,timeout:30000}),ack=await response.json();
   if(response.status()!==200||ack.type!=='server-response'||ack.rpcId!==envelope.rpcId||ack.result?.ok!==true||ack.result.value?.accepted!==true)throw Error('new-session prompt not accepted');
   proof={marker,requestId:request.requestId,sessionId};await route.fulfill({response});
  }catch{failed=true;try{await route.abort('failed')}catch{}}
 };
 await context.route(origin+'/api/session/create',createRoute);
 await context.route(origin+'/api/session/prompt',promptRoute);
 try{
  await page.getByRole('button',{name:/^(New session|新建会话)$/}).first().click();
  const composer=page.locator('[data-composer-input][contenteditable="true"]');
  await composer.waitFor({state:'visible'});
  await composer.fill(marker);await composer.press('Enter');
  await page.getByText(marker+'_REPLY',{exact:true}).waitFor({state:'visible'});
  if(failed||createCount!==1||promptCount!==1||!proof||(await composer.innerText()).trim()!=='')throw Error('UI creation proof failed');
  console.log('PASS real official New session UI and native composer: one created ordinary session, one accepted fixed prompt and actual reply');
  return proof;
 }catch{
  console.error('DIAGNOSTIC UI creation: '+JSON.stringify({createCount,promptCount,created:!!sessionId,accepted:!!proof,failed}));
  throw Error('official UI-created session failed (raw diagnostics withheld)');
 }finally{
  await context.unroute(origin+'/api/session/create',createRoute);
  await context.unroute(origin+'/api/session/prompt',promptRoute);
 }
}
