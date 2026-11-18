const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../fleet-api.js'),'utf8');
const STORE='fleet-command-receipts.v1',order='fleet-'+'a'.repeat(32);
function storage(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),map};}
function locks(){let previous=Promise.resolve();return {request(name,fn){const work=previous.then(fn);previous=work.catch(()=>{});return work;}};}
const receipt=(id,status='UNKNOWN',extra={})=>({protocolVersion:'1.0',requestId:id,status,updatedAt:new Date().toISOString(),result:status==='ACCEPTED'?{id:order}:null,error:status==='REJECTED'?{code:'DENIED',category:'protocol',message:'Rejected',retry:'correct_request'}:null,resource:{type:'transport_order',id:order},confirmation:'not proof of physical completion',...extra});
const reply=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
function environment(handler,store=storage(),lock=locks(),origin='https://fleet.test'){
 const calls=[],listeners={};
 const scope={URL,location:{origin},localStorage:store,navigator:{locks:lock},crypto:require('node:crypto').webcrypto,Uint8Array,Date,setInterval:()=>0,
 addEventListener:(name,fn)=>listeners[name]=fn,
 fetch:async(url,options)=>{calls.push({url,options});if(url.includes('/commands/access-check-'))return reply({protocolVersion:'1.0',error:{code:'REQUEST_NOT_FOUND',category:'protocol',message:'Unknown requestId',retry:'correct_request'}},404);return handler(url,options);}};
 vm.runInNewContext(source,scope);return {scope,calls,listeners,api:()=>{const api=new scope.FleetAPI(()=>{},()=>{});api.configureDeployment({});return api;}};
}
async function authorize(api){api.key='secret-only-in-header';await api.verifyKey();}
const create={type:'create_order',robotId:'R1',destination:'A'};
test('confirmed deployment scopes preserve legacy history without querying or migrating it',async()=>{
 const store=storage(),old=environment((url,o)=>reply(receipt(JSON.parse(o.body).requestId)),store),legacy=old.api();await authorize(legacy);await assert.rejects(legacy.command(create,'fixture-old'));
 const original=JSON.parse(store.getItem(STORE)).scopes[legacy.scope];
 const fresh=environment((url,o)=>url.endsWith('/capabilities')?reply({environment:'SIM',targetId:'p0-sim',deploymentId:'deployment-real'}):reply(receipt(JSON.parse(o.body).requestId,'ACCEPTED')),store);
 const api=new fresh.scope.FleetAPI(()=>{},()=>{});assert.equal(api.receiptSnapshot().canWrite,false);
 await api.confirmDeployment();assert.equal(api.records.length,0);assert.equal(api.legacyRecords.length,1);assert.equal(api.hasUnresolvedCreate(),false);
 assert.match(api.scope,/#deployment=deployment-real$/);assert.equal(api.apiBase,'https://fleet.test/api/v1/');
 assert.deepEqual(JSON.parse(store.getItem(STORE)).scopes[legacy.scope],original);
 await authorize(api);await assert.rejects(api.queryReceipt('fixture-old'),e=>e.code==='HISTORICAL_DEPLOYMENT');
 assert.ok(!fresh.calls.some(c=>c.url.includes('fixture-old')));
 await api.command(create,'new-real');
 const written=JSON.parse(store.getItem(STORE));assert.deepEqual(written.scopes[legacy.scope],original);assert.equal(written.scopes[api.scope][0].envelope.requestId,'new-real');
 assert.ok(fresh.calls.every(c=>!c.url.includes('#deployment')));
});
test('deployment changes cannot move an in-flight request into another ledger',async()=>{
 let finish;const env=environment((url,o)=>new Promise(resolve=>finish=()=>resolve(reply(receipt('in-flight')))));
 const api=env.api();api.configureDeployment({deploymentId:'A'});await authorize(api);
 const operation=api.command(create,'in-flight');while(!finish)await new Promise(setImmediate);
 assert.throws(()=>api.configureDeployment({deploymentId:'B'}),e=>e.code==='DEPLOYMENT_BUSY');
 assert.match(api.scope,/#deployment=A$/);assert.equal(api.receiptSnapshot().canWrite,false);
 finish();await assert.rejects(operation);assert.equal(api.records[0].scope,api.scope);
 assert.equal(env.calls.filter(c=>c.options.method==='POST').length,1);
});
test('deployment must be confirmed and an isolated SIM without identity stays read-only',async()=>{
 const env=environment(()=>{throw Error('must not post');}),api=new env.scope.FleetAPI(()=>{},()=>{});api.key='key';api.authorized=true;
 await assert.rejects(api.command(create),e=>e.code==='DEPLOYMENT_UNCONFIRMED');
 assert.throws(()=>api.configureDeployment({environment:'SIM',targetId:'p0-sim'}),e=>e.code==='DEPLOYMENT_UNDECLARED');
 assert.equal(env.calls.length,0);assert.equal(api.receiptSnapshot().canWrite,false);
});
test('an old deployment authorization probe cannot authorize a newly declared deployment',async()=>{
 let finish;const env=environment(()=>reply({})),api=env.api();api.configureDeployment({deploymentId:'A'});api.key='key';
 env.scope.fetch=()=>new Promise(resolve=>{finish=()=>resolve(reply({protocolVersion:'1.0',error:{code:'REQUEST_NOT_FOUND',category:'protocol',message:'missing',retry:'correct_request'}},404));});
 const verifying=api.verifyKey();while(!finish)await new Promise(setImmediate);
 api.configureDeployment({deploymentId:'B'});finish();
 await assert.rejects(verifying,e=>e.code==='AUTH_CHANGED');assert.equal(api.authorized,false);
});
test('only an explicit retirement POST has a 45 second budget; ordinary requests remain 15 seconds',async()=>{
 const env=environment(()=>reply({ok:true})),api=env.api(),budgets=[],cleared=[];
 env.scope.AbortController=class {constructor(){this.signal={};}abort(){this.signal.aborted=true;}};
 env.scope.setTimeout=(_callback,ms)=>{budgets.push(ms);return budgets.length;};env.scope.clearTimeout=id=>cleared.push(id);
 await api.request('sim-publishing/publications/original/retire',{});
 await api.request('sim-publishing/publications/original/retire');
 await api.request('sim-publishing/publications/original/verify',{});
 await api.request('commands',{});await api.request('model');
 assert.deepEqual(budgets,[45000,15000,15000,15000,15000]);assert.equal(cleared.length,5);
 assert.equal(env.calls.filter(c=>c.url.endsWith('/retire')&&c.options.method==='POST').length,1);
});

test('refresh restores exact envelope; authorization then receipt/order GET only, never POST',async()=>{
 const store=storage();const first=environment((url,o)=>reply(receipt(JSON.parse(o.body).requestId)),store);const api=first.api();await authorize(api);
 await assert.rejects(api.command(create,'original'));const saved=JSON.stringify(api.records[0].envelope);
 const second=environment(url=>url.includes('/orders/')?reply({name:order,state:'FINISHED'}):reply(receipt('original','ACCEPTED')),store);
 const restored=second.api();assert.equal(second.calls.length,0);assert.equal(JSON.stringify(restored.records[0].envelope),saved);
 await assert.rejects(restored.queryReceipt('original'),e=>e.code==='AUTH_REQUIRED');await authorize(restored);const result=await restored.queryReceipt('original');
 assert.equal(result.status,'ACCEPTED');assert.equal(result.order.state,'FINISHED');assert.equal(result.physicallyStopped,undefined);
 assert.ok(second.calls.every(c=>c.options.method==='GET'));assert.ok(!store.map.get(STORE).includes('secret-only-in-header'));
});
test('network timeout preserves envelope and blocks same/new intent without repost or changed expiry',async()=>{
 const env=environment(()=>{throw Error('timeout');});const api=env.api();await authorize(api);await assert.rejects(api.command(create,'timeout'),e=>e.code==='NETWORK_UNCERTAIN'&&e.requestId==='timeout');
 const original=JSON.stringify(api.records[0].envelope);await assert.rejects(api.command(create,'timeout'),/Query receipt/);await assert.rejects(api.command(create,'different'),e=>e.code==='PENDING_INTENT');
 assert.equal(JSON.stringify(api.records[0].envelope),original);assert.equal(env.calls.filter(c=>c.options.method==='POST').length,1);
});
test('404 is not cancellation; 409 preserves original; both remain unresolved',async()=>{
 for(const status of [404,409]){
  let posting=true;const env=environment((url,o)=>o.method==='POST'?reply(receipt(JSON.parse(o.body).requestId)):reply({error:{code:status===404?'REQUEST_NOT_FOUND':'REQUEST_ID_CONFLICT',message:'Cannot resolve'}},status));
  const api=env.api();await authorize(api);await assert.rejects(api.command(create,'pending'));await assert.rejects(api.queryReceipt('pending'),e=>e.status===status&&e.requestId==='pending');assert.ok(api.hasUnresolvedCreate('R1'));await assert.rejects(api.command(create,'new'),e=>e.code==='PENDING_INTENT');
 }
});
test('HTTP 401/403 preserves status/code/request ID and revokes authorization',async()=>{
 for(const status of [401,403]){const env=environment(()=>reply({error:{code:status===401?'AUTH_REQUIRED':'OPERATION_DENIED',message:'Denied'}},status));const api=env.api();await authorize(api);await assert.rejects(api.command(create,'auth-error'),e=>e.status===status&&e.requestId==='auth-error'&&!e.definitive);assert.equal(api.authorized,false);assert.equal(api.records[0].status,'UNKNOWN');}
});
test('invalid accepted receipt cannot unlock a command',async()=>{
 for(const mutate of [r=>{delete r.requestId;},r=>{r.requestId='other';},r=>{r.updatedAt='bad';},r=>{delete r.resource;},r=>{r.protocolVersion='2';}]){
  const bad=receipt('bad','ACCEPTED');mutate(bad);const env=environment(()=>reply(bad));const api=env.api();await authorize(api);await assert.rejects(api.command(create,'bad'),e=>e.code==='RECEIPT_MISMATCH');assert.equal(api.records[0].status,'UNKNOWN');assert.ok(api.hasUnresolvedCreate());
 }
});
test('key probe refuses arbitrary 200 JSON and non-protocol 404',async()=>{
 for(const response of [reply({ok:true}),reply({detail:'Not found'},404)]){const env=environment(()=>response);env.scope.fetch=async()=>response;const api=env.api();api.key='not-verified';await assert.rejects(api.verifyKey());assert.equal(api.authorized,false);}
});
test('same ID different content concurrent is rejected instead of sharing success',async()=>{
 let finish;const env=environment((url,o)=>new Promise(resolve=>finish=()=>resolve(reply(receipt(JSON.parse(o.body).requestId,'ACCEPTED')))));const api=env.api();await authorize(api);const first=api.command(create,'same');const duplicate=api.command(create,'same');assert.equal(first,duplicate);
 await assert.rejects(api.command({...create,destination:'B'},'same'),e=>e.code==='REQUEST_ID_CONFLICT');while(!finish)await new Promise(r=>setImmediate(r));finish();await first;assert.equal(env.calls.filter(c=>c.options.method==='POST').length,1);
});
test('cross-tab lock rereads the durable unresolved record and blocks second ID',async()=>{
 const store=storage(),lock=locks();let finish;const a=environment((url,o)=>new Promise(resolve=>finish=()=>resolve(reply(receipt('tab-a')))),store,lock),b=environment(()=>{throw Error('must not send');},store,lock);const one=a.api(),two=b.api();await authorize(one);await authorize(two);const first=one.command(create,'tab-a');while(!finish)await new Promise(r=>setImmediate(r));const second=two.command(create,'tab-b');finish();await assert.rejects(first);await assert.rejects(second,e=>e.code==='PENDING_INTENT');assert.equal(b.calls.filter(c=>c.options.method==='POST').length,0);
});
test('storage failure before side effect rejects without POST',async()=>{
 const store=storage();store.setItem=()=>{throw Error('quota');};const env=environment(()=>{throw Error('must not send');},store);const api=env.api();await authorize(api);await assert.rejects(api.command(create),e=>e.code==='STORAGE_UNAVAILABLE');assert.equal(env.calls.filter(c=>c.options.method==='POST').length,0);assert.match(api.storageError,/Cannot guarantee/);
});
test('corrupt terminal record/status/schema blocks without clearing or posting',async()=>{
 for(const raw of ['not-json',JSON.stringify({version:1,scopes:{'https://fleet.test/api/v1/':[{scope:'https://fleet.test/api/v1/',status:'ACCEPTED',envelope:{requestId:'x',command:create},receipt:null}]}})]){
  const store=storage();store.setItem(STORE,raw);const env=environment(()=>{throw Error('must not send');},store);const api=env.api();await authorize(api);await assert.rejects(api.command(create),e=>e.code==='STORAGE_UNAVAILABLE');assert.equal(store.getItem(STORE),raw);assert.equal(env.calls.filter(c=>c.options.method==='POST').length,0);
 }
});
test('wrong scope records are not restored; transplanted record fails closed',async()=>{
 const store=storage();const env=environment((url,o)=>reply(receipt(JSON.parse(o.body).requestId)),store);const api=env.api();await authorize(api);await assert.rejects(api.command(create,'scope'));
 const other=environment(()=>reply({}),store,locks(),'https://other.test');assert.equal(other.api().records.length,0);
 const value=JSON.parse(store.getItem(STORE));value.scopes['https://other.test/api/v1/']=value.scopes['https://fleet.test/api/v1/'];store.setItem(STORE,JSON.stringify(value));const transplanted=other.api();await authorize(transplanted);await assert.rejects(transplanted.command(create),e=>e.code==='STORAGE_UNAVAILABLE');
});
test('valid external identifier punctuation queries encoded original ID',async()=>{
 const id='A.b:c-d_1';const env=environment(url=>reply(receipt(decodeURIComponent(url.split('/').pop()),'REJECTED')));const api=env.api();await authorize(api);const record=await api.queryReceipt(id);assert.equal(record.envelope.requestId,id);assert.equal(record.lookupOnly,true);assert.ok(env.calls.some(c=>c.url.includes('A.b%3Ac-d_1')));
});
test('REJECTED releases same-car new intent but invalid HTTP conflict does not',async()=>{
 const env=environment((url,o)=>reply(receipt(JSON.parse(o.body).requestId,'REJECTED')));const api=env.api();await authorize(api);await assert.rejects(api.command(create,'one'),e=>e.definitive);await assert.rejects(api.command(create,'two'),e=>e.definitive);assert.equal(env.calls.filter(c=>c.options.method==='POST').length,2);
});
test('robot receipt resource never triggers order query; order error remains independent',async()=>{
 const env=environment(url=>reply(receipt('pause-id','ACCEPTED',{resource:{type:'robot',id:'R1'},result:{id:'R1'}})));const api=env.api();await authorize(api);const record=await api.queryReceipt('pause-id');assert.equal(record.order,undefined);assert.ok(!env.calls.some(c=>c.url.includes('/orders/')));
});
test('missing Web Locks blocks new side effects rather than claiming cross-tab atomicity',async()=>{
 const env=environment(()=>reply({}),storage(),null);const api=env.api();await authorize(api);await assert.rejects(api.command(create),e=>e.code==='CROSS_TAB_LOCK_UNAVAILABLE');assert.ok(env.calls.every(c=>c.options.method==='GET'));
});

test('non-JSON 401/403 revokes authorization before parsing error',async()=>{
 for(const status of [401,403]){const env=environment(()=>({ok:false,status,json:async()=>{throw Error('HTML');}}));const api=env.api();await authorize(api);await assert.rejects(api.command(create,'html-auth'),e=>e.status===status&&e.code==='INVALID_RESPONSE');assert.equal(api.authorized,false);}
});
test('storage reload waits behind in-flight command so terminal receipt is durable',async()=>{
 let finish;const store=storage(),env=environment(()=>new Promise(resolve=>finish=()=>resolve(reply(receipt('late-event','ACCEPTED')))),store);const api=env.api();await authorize(api);const work=api.command(create,'late-event');while(!finish)await new Promise(r=>setImmediate(r));
 env.listeners.storage({key:STORE});finish();await work;await new Promise(r=>setImmediate(r));
 assert.equal(api.records[0].status,'ACCEPTED');assert.equal(JSON.parse(store.getItem(STORE)).scopes[api.scope][0].status,'ACCEPTED');
});
test('key changed during a successful probe is not authorized by the old response',async()=>{
 const env=environment(()=>reply({}));let finish;env.scope.fetch=async()=>new Promise(resolve=>finish=()=>resolve(reply({protocolVersion:'1.0',error:{code:'REQUEST_NOT_FOUND',category:'protocol',message:'Unknown',retry:'correct_request'}},404)));
 const api=env.api();api.key='old-key';const probe=api.verifyKey();api.key='replacement-key';finish();await assert.rejects(probe,e=>e.code==='AUTH_CHANGED');assert.equal(api.authorized,false);
});
test('no-lock read-only queries do not write or overwrite shared storage',async()=>{
 const store=storage(),initial=environment((url,o)=>reply(receipt(JSON.parse(o.body).requestId)),store),first=initial.api();await authorize(first);await assert.rejects(first.command(create,'readonly'));
 const before=store.getItem(STORE);store.setItem=()=>{throw Error('query must not write');};const env=environment(()=>reply(receipt('readonly','REJECTED')),store,null),api=env.api();await authorize(api);await api.queryReceipt('readonly');assert.equal(api.records[0].status,'REJECTED');assert.equal(api.receiptSnapshot().queryPersistence,false);assert.equal(api.receiptSnapshot().canWrite,false);assert.equal(store.getItem(STORE),before);
});
test('accepted new intents remain subject to server admission rather than a frontend completion claim',async()=>{
 const env=environment((url,o)=>reply(receipt(JSON.parse(o.body).requestId,'ACCEPTED'))),api=env.api();await authorize(api);await api.command(create,'accepted-one');await api.command(create,'accepted-two');assert.equal(env.calls.filter(c=>c.options.method==='POST').length,2);assert.equal(api.records[0].status,'ACCEPTED');assert.equal(api.records[0].order,undefined);
});
test('all existing command kinds retain durable receipts with no stored credential',async()=>{
 const env=environment((url,o)=>reply(receipt(JSON.parse(o.body).requestId,'ACCEPTED'))),api=env.api();await authorize(api);
 await api.command({type:'pause',robotId:'R1'},'pause');await api.command({type:'resume',robotId:'R1'},'resume');await api.cancel(order);
 assert.deepEqual(Array.from(api.records,r=>r.envelope.command.type),['cancel_order','resume','pause']);
});
test('invalid terminal status versus receipt status in storage fails closed',async()=>{
 const store=storage(),env=environment((url,o)=>reply(receipt(JSON.parse(o.body).requestId)),store),api=env.api();await authorize(api);await assert.rejects(api.command(create,'corrupt-terminal'));
 const data=JSON.parse(store.getItem(STORE));data.scopes[api.scope][0].status='ACCEPTED';store.setItem(STORE,JSON.stringify(data));const restored=env.api();await authorize(restored);await assert.rejects(restored.command(create,'new'),e=>e.code==='STORAGE_UNAVAILABLE');
});

test('no-lock consecutive queries and storage reload retain page-only results without writes',async()=>{
 const store=storage(),initial=environment((url,o)=>reply(receipt(JSON.parse(o.body).requestId)),store),first=initial.api();await authorize(first);
 await assert.rejects(first.command(create,'a'));await assert.rejects(first.command({...create,robotId:'R2'},'b'));
 const before=store.getItem(STORE);store.setItem=()=>{throw Error('must not write');};
 const env=environment(url=>reply(receipt(decodeURIComponent(url.split('/').pop()),'REJECTED')),store,null),api=env.api();await authorize(api);
 await api.queryReceipt('a');await api.queryReceipt('b');await api.queryReceipt('external');env.listeners.storage({key:STORE});
 for(const id of ['a','b','external'])assert.equal(api.records.find(r=>r.envelope.requestId===id).status,'REJECTED');
 assert.equal(store.getItem(STORE),before);
});
