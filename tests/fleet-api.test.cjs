const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function context(fetch) {
  class Events {
    constructor(url) {this.url=url;this.handlers={};}
    addEventListener(name,handler) {this.handlers[name]=handler;}
  }
  const scope={fetch,EventSource:Events,setInterval:()=>0,Date,crypto:require('node:crypto').webcrypto,Uint8Array};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../fleet-api.js'),'utf8'),scope);
  return scope;
}
test('UI uses versioned management envelope and credentials only in header',async()=>{
  let observed;
  const scope=context(async(url,options)=>{observed={url,options};return {ok:true,json:async()=>({status:'ACCEPTED',result:{id:'order'}})};});
  const api=new scope.FleetAPI(()=>{},()=>{});api.key='secret';
  const result=await api.order({requestId:'same-intent',robotId:'R1',to:'A'});
  assert.equal(result.id,'order');assert.equal(observed.url,'/api/v1/commands');
  assert.equal(observed.options.headers['X-Fleet-Key'],'secret');
  const message=JSON.parse(observed.options.body);
  assert.equal(message.requestId,'same-intent');assert.equal(message.protocolVersion,'1.0');
  assert.deepEqual(message.command,{type:'create_order',robotId:'R1',destination:'A'});
  assert.equal(observed.options.cache,'no-store');
});
test('unknown outcomes reuse the exact envelope including expiry',async()=>{
  const sent=[];
  const scope=context(async(url,options)=>{sent.push(options.body);return {ok:true,json:async()=>({status:'UNKNOWN'})};});
  const api=new scope.FleetAPI(()=>{},()=>{});
  await assert.rejects(()=>api.order({requestId:'pending',robotId:'R1',to:'A'}),/Query receipt/);
  await assert.rejects(()=>api.order({requestId:'pending',robotId:'R1',to:'A'}),/Query receipt/);
  assert.equal(sent[0],sent[1]);
  await assert.rejects(()=>api.order({requestId:'pending',robotId:'R1',to:'B'}),/cannot change/);
  assert.equal(sent.length,2);
});
test('rejection is surfaced and broken or malformed streams invalidate connection',async()=>{
  let connected=true;
  const scope=context(async()=>({ok:false,status:409,json:async()=>({error:{message:'Vehicle offline'}})}));
  const api=new scope.FleetAPI(()=>{},value=>{connected=value;});
  await assert.rejects(()=>api.order({to:'A'}),/Vehicle offline/);
  scope.fetch=async()=>({ok:true,json:async()=>({robots:[]})});
  await api.start();assert.equal(api.events.url,'/api/v1/events');
  api.events.onerror();assert.equal(connected,false);
  connected=true;api.events.handlers.fleet({data:'invalid'});assert.equal(connected,false);
});
test('fleet actions preserve per-robot partial failure',async()=>{
  const scope=context(async(url,options)=>({ok:true,json:async()=>url.endsWith('capabilities')?{robotIds:['A','B']}:
    JSON.parse(options.body).command.robotId==='A'?{status:'ACCEPTED',result:{}}:{status:'UNKNOWN'}}));
  const api=new scope.FleetAPI(()=>{},()=>{});const result=await api.fleet('pause');
  assert.equal(result.allAccepted,false);assert.equal(result.results[0].accepted,true);assert.equal(result.results[1].accepted,false);
});
