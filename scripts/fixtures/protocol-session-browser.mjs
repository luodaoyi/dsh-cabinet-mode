// Normal official New session UI + native composer, against the same isolated
// host. All API responses pass through unchanged. No synthetic session creation.
export async function createSessionInBrowser({page,context,origin,members,cwd,onCreated}){
 const marker='CABINET_UI_CREATE_V1',seedMarker='CABINET_UI_CREATE_SEED_V1';let namedBlank=false,expectedMarker=marker,seedSessionId;let sessionId,createCount=0,promptCount=0,failed=false,proof;const proofs=[];const facts={stage:'before creation'};
 const createRoute=async route=>{
  try{
   const envelope=route.request().postDataJSON(),request=envelope?.payload?.args?.request;
   Object.assign(facts,{stage:'creation request',validEnvelope:envelope.type==='client-request'&&envelope.method==='session/create',hasRequest:!!request,namedSession:request?.sessionId!==undefined,namedTeamSession:members.some(m=>m.id===request?.sessionId),hasCwd:request?.cwd!==undefined,cwdMatches:request?.cwd===undefined||request.cwd===cwd,hasWorkspace:request?.workspaceId!==undefined});
   if(envelope.type!=='client-request'||envelope.method!=='session/create'||!request||++createCount>2||(createCount===2&&request.sessionId!==undefined)||(request.cwd!==undefined&&request.cwd!==cwd))throw Error('unexpected creation');
   // A cached blank candidate can be stale, even a now-active team. The Host
   // owns reuse admission and may mint a different identity. Never send into
   // an existing team: the returned identity below must differ from all members.
   namedBlank=request.sessionId!==undefined;
   if(namedBlank&&typeof request.sessionId!=='string')throw Error('invalid blank reuse');
   expectedMarker=namedBlank?seedMarker:marker;
   facts.stage='creation fetch';
   const response=await route.fetch({maxRetries:0,maxRedirects:0,timeout:30000}),ack=await response.json();
   Object.assign(facts,{stage:'creation response',httpOK:response.status()===200,responseEnvelope:ack.type==='server-response',rpcMatches:ack.rpcId===envelope.rpcId,resultOK:ack.result?.ok===true,hasSessionId:typeof ack.result?.value?.sessionId==='string'});
   sessionId=ack.result?.value?.sessionId;
   if(response.status()!==200||ack.type!=='server-response'||ack.rpcId!==envelope.rpcId||ack.result?.ok!==true||typeof sessionId!=='string'||!sessionId||members.some(m=>m.id===sessionId)||sessionId===seedSessionId)throw Error('creation not acknowledged');
   onCreated(sessionId,namedBlank?'seed':'created');await route.fulfill({response});
  }catch{failed=true;try{await route.abort('failed')}catch{}}
 };
 const promptRoute=async route=>{
  try{
   const envelope=route.request().postDataJSON(),request=envelope?.payload?.args?.request;
   if(request?.content?.length!==1||request.content[0].type!=='text'||request.content[0].text!==expectedMarker){await route.fallback();return}
   if(envelope.type!=='client-request'||envelope.method!=='session/prompt'||request.sessionId!==sessionId||!sessionId||request.mode!=='queue'||typeof request.requestId!=='string'||++promptCount!==createCount)throw Error('unexpected new-session prompt');
   const response=await route.fetch({maxRetries:0,maxRedirects:0,timeout:30000}),ack=await response.json();
   if(response.status()!==200||ack.type!=='server-response'||ack.rpcId!==envelope.rpcId||ack.result?.ok!==true||ack.result.value?.accepted!==true)throw Error('new-session prompt not accepted');
   proof={marker:expectedMarker,requestId:request.requestId,sessionId};proofs.push(proof);await route.fulfill({response});
  }catch{failed=true;try{await route.abort('failed')}catch{}}
 };
 await context.route(origin+'/api/session/create',createRoute);
 await context.route(origin+'/api/session/prompt',promptRoute);
 try{
  // The official Workspace may offer a pre-created empty Session. Populate it
  // through the native composer, then ask New session again; never relabel reuse
  // as fresh creation. Only the second unnamed create qualifies in that case.
  for(let attempt=0;attempt<2;attempt++){
   const acknowledged=page.waitForResponse(response=>response.url()===origin+'/api/session/create'&&response.status()===200);
   await page.getByRole('button',{name:/^(New session|新建会话)$/}).first().click();
   await acknowledged;
   const composer=page.locator('[data-composer-input][contenteditable="true"]');
   await composer.waitFor({state:'visible'});
   await composer.fill(expectedMarker);await composer.press('Enter');
   await page.getByText(expectedMarker+'_REPLY',{exact:true}).waitFor({state:'visible'});
   if(failed||promptCount!==createCount||!proof||(await composer.innerText()).trim()!=='')throw Error('UI creation proof failed');
   if(!namedBlank){
    console.log('PASS real official New session UI and native composer: unnamed creation, accepted fixed prompt and actual reply'+(seedSessionId?'; pre-existing blank first populated, not counted as creation':''));
    return proofs;
   }
   seedSessionId=sessionId;
  }
  throw Error('UI only reused blank sessions');
 }catch{
  console.error('DIAGNOSTIC UI creation: '+JSON.stringify({createCount,promptCount,created:!!sessionId,accepted:!!proof,failed,facts}));
  throw Error('official UI-created session failed (raw diagnostics withheld)');
 }finally{
  await context.unroute(origin+'/api/session/create',createRoute);
  await context.unroute(origin+'/api/session/prompt',promptRoute);
 }
}
