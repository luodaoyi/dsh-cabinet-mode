import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';let checks=0;
// Execute the actual headless runner with controlled browser failures. This
// verifies diagnostic cleanup only; it is not browser/layout acceptance.
const browserSource=fs.readFileSync(new URL('./test-groupchat-browser.mjs',import.meta.url),'utf8');
const headlessStart=browserSource.indexOf("if(process.argv.includes('--headless')){");
assert.notEqual(headlessStart,-1,'headless runner exists');
for(const scenario of [
 {name:'normal screenshot',screenshots:1},
 {name:'group assertion failure',fail:'group',screenshots:1},
 {name:'keyboard assertion failure',fail:'keyboard',screenshots:1},
 {name:'failed diagnostic screenshot preserves group error',fail:'group',badScreenshot:true,screenshots:1},
 {name:'failed diagnostic screenshot preserves keyboard error',fail:'keyboard',badScreenshot:true,screenshots:1},
 {name:'no screenshot configured',noScreenshot:true,screenshots:0},
 {name:'no screenshot configured on assertion failure',fail:'group',noScreenshot:true,screenshots:0},
 {name:'navigation failure before page load',fail:'goto',screenshots:0},
 {name:'browser close failure preserves assertion and closes server',fail:'group',badClose:true,screenshots:1},
 {name:'screenshot and browser close failures preserve assertion',fail:'keyboard',badScreenshot:true,badClose:true,screenshots:1},
 {name:'browser close failure is reported without a primary error',badClose:true,screenshots:1},
]){
 const original=Error(scenario.name),closeError=Error('browser close failed'),shots=[];let evaluated=0,closed=0,serverClosed=0;
 const page={on(){},async goto(){if(scenario.fail==='goto')throw original},
  async evaluate(){if(++evaluated===1){if(scenario.fail==='group')throw original;return{passed:['fixture']}}if(evaluated===2)return ['mate'];return{}},
  locator(){const node={first(){return node},last(){return node},async focus(){},async fill(){},async click(){},async press(){},async pressSequentially(){},async inputValue(){return 'fixture draft'}};return node},keyboard:{async press(){}},async waitForTimeout(){},
  async waitForFunction(){if(scenario.fail==='keyboard')throw original},
  async screenshot(options){shots.push(options);if(scenario.badScreenshot)throw Error('diagnostic screenshot failed')},
 };
 let caught;
 try{await vm.runInNewContext('(async()=>{'+browserSource.slice(headlessStart)+'})()',{
  process:{argv:['--headless'],env:{CHROME_PATH:'/fixture/chromium',...(!scenario.noScreenshot&&{CABINET_SCREENSHOT:'/fixture/evidence.png'})}},
  require(){return{chromium:{async launch(){return{async newPage(){return page},async close(){closed++;if(scenario.badClose)throw closeError}}}}}},
  server:{close(){serverClosed++}},url:'http://fixture.invalid',console:{log(){}},
 })}catch(error){caught=error}
 assert.equal(caught,scenario.fail?original:scenario.badClose?closeError:undefined,scenario.name+' preserves original outcome');
 assert.equal(shots.length,scenario.screenshots,scenario.name+' screenshot attempts');
 for(const shot of shots){assert.equal(shot.path,'/fixture/evidence.png');assert.equal(shot.fullPage,true)}
 assert.equal(closed,1);assert.equal(serverClosed,1);checks++;console.log('PASS runner cleanup: '+scenario.name);
}
console.log('PASS group-chat regressions: '+checks);
