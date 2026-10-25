const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function context(fetch) {
  class Events {
    constructor(url) {this.url=url;this.handlers={};}
    addEventListener(name,handler) {this.handlers[name]=handler;}
  }
  const scope={fetch,EventSource:Events,setInterval:()=>0,Date};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../fleet-api.js'),'utf8'),scope);
  return scope;
}
test('control key stays in header and request ID stays in body',async()=>{
  let observed;
  const scope=context(async(url,options)=>{observed={url,options};return {ok:true,json:async()=>({id:'order'})};});
  const api=new scope.FleetAPI(()=>{},()=>{});api.key='secret';
  await api.order({requestId:'same-intent',to:'A'});
  assert.equal(observed.url,'/api/orders');
  assert.equal(observed.options.headers['X-Fleet-Key'],'secret');
  assert.equal(JSON.parse(observed.options.body).requestId,'same-intent');
  assert.equal(observed.options.cache,'no-store');
});
test('server rejection is surfaced and a stream error invalidates connection',async()=>{
  let connected=true;
  const scope=context(async()=>({ok:false,status:409,json:async()=>({detail:'Vehicle offline'})}));
  const api=new scope.FleetAPI(()=>{},value=>{connected=value;});
  await assert.rejects(()=>api.order({to:'A'}),/Vehicle offline/);
  scope.fetch=async()=>({ok:true,json:async()=>({robots:[]})});
  await api.start();api.events.onerror();assert.equal(connected,false);
});
