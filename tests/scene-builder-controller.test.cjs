const test=require('node:test');
const assert=require('node:assert/strict');
const Model=require('../src/pages/maps/scene-builder/model.js');
const {Controller}=require('../src/pages/maps/scene-builder/controller.js');
const ID='a'.repeat(32), OBJECT='b'.repeat(32);
const copy=v=>JSON.parse(JSON.stringify(v));
function storage(){const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
function api(handler){return {authorized:true,deploymentConfirmed:true,key:'test-only',keyRevision:1,scope:'origin#deployment=one',request:handler};}
function draft(){return Model.addObstacle({...Model.fresh('  场地名称  '),site:{x:0,y:0,width:12,depth:8}},'equipment-box-v1',2,3,OBJECT);}
// Pydantic Scene/Obstacle inherits Position: actual server field order differs
// from addObstacle() insertion order. This is deliberately not an echo fixture.
function backend(scene){return {schemaVersion:scene.schemaVersion,name:scene.name.trim(),frame:scene.frame,unit:scene.unit,
 site:scene.site&&{x:scene.site.x,y:scene.site.y,width:scene.site.width,depth:scene.site.depth},
 walls:scene.walls.map(w=>({id:w.id,name:w.name.trim(),start:{x:w.start.x,y:w.start.y},end:{x:w.end.x,y:w.end.y},thickness:w.thickness,height:w.height})),
 obstacles:scene.obstacles.map(o=>({x:o.x,y:o.y,id:o.id,name:o.name.trim(),templateId:o.templateId,yaw:o.yaw,width:o.width,depth:o.depth,height:o.height}))};}
function response(id,revision,scene){return {id,revision,scene:backend(scene),warnings:[]};}

test('save accepts real backend key ordering and normalized names',async()=>{
 const calls=[],client=api(async(path,body)=>{calls.push({path,body:copy(body)});return response(body.id,body.expectedRevision+1,body.scene);});
 const c=new Controller(client,{storage:storage()});c.change(draft());await c.save();
 assert.equal(c.revision,1);assert.equal(c.scene.name,'场地名称');assert.equal(c.dirty,false);assert.equal(c.pending,null);
 assert.equal(calls.length,1);assert.equal(calls[0].path,'map-workspace/scenes');assert.match(c.id,/^[a-f0-9]{32}$/);
 assert.notDeepEqual(Object.keys(draft().obstacles[0]),Object.keys(c.scene.obstacles[0]));
});

test('CAS409 keeps local dirty geometry and revision without another POST',async()=>{
 let posts=0;const c=new Controller(api(async()=>{posts++;throw Object.assign(Error('conflict'),{status:409});}),{storage:storage()});
 c.adopt(response(ID,1,draft()));c.change({...c.scene,name:'本地未保存'});const before=copy(c.scene);
 await assert.rejects(c.save(),/conflict/);assert.deepEqual(c.scene,before);assert.equal(c.revision,1);
 assert.equal(c.dirty,true);assert.equal(c.conflict,true);assert.equal(c.pending,null);assert.equal(posts,1);
});

function uncertainClient(){
 const calls=[];let saved;
 const client=api(async(path,body)=>{calls.push({path,body:body&&copy(body)});
  if(body){saved=response(body.id,body.expectedRevision+1,body.scene);throw Object.assign(Error('lost response'),{code:'NETWORK_UNCERTAIN'});}
  return copy(saved);
 });
 return {client,calls,get saved(){return saved;}};
}
test('lost response reconciles the same immutable revision with GETs and no new POST',async()=>{
 const h=uncertainClient(),c=new Controller(h.client,{storage:storage()});c.change(draft());
 await assert.rejects(c.save(),/lost response/);const pending=copy(c.pending);assert.ok(pending);
 await c.reconcile();assert.equal(c.pending,null);assert.equal(c.id,pending.id);assert.equal(c.revision,1);
 assert.equal(h.calls.filter(x=>x.body!==undefined).length,1);
 assert.ok(h.calls.slice(1).some(x=>x.path===`map-workspace/scenes/${pending.id}/revisions/1`));
 assert.ok(h.calls.slice(1).every(x=>x.path.includes(pending.id)&&x.body===undefined));
});

test('reload restores a pending scene identity and only reads its original save',async()=>{
 const h=uncertainClient(),s=storage(),first=new Controller(h.client,{storage:s});first.change(draft());
 await assert.rejects(first.save());const identity=first.pending.id,second=new Controller(h.client,{storage:s});
 assert.equal(second.restorePending(),true);assert.equal(second.pending.id,identity);
 await second.reconcile();assert.equal(second.id,identity);assert.equal(second.pending,null);
 assert.equal(h.calls.filter(x=>x.body!==undefined).length,1);
});

for(const mutation of ['key','scope'])test(`late GET cannot overwrite geometry after ${mutation} changes`,async()=>{
 let finish;const client=api(()=>new Promise(resolve=>{finish=resolve;})),c=new Controller(client,{storage:storage()});
 c.change(draft());const before=copy(c.scene),loading=c.open(ID);
 assert.throws(()=>c.change({...c.scene,name:'读取中修改'}),/读取|核对/);
 if(mutation==='key'){client.keyRevision++;client.key='different';}else client.scope='origin#deployment=two';
 finish(response(ID,5,{...draft(),name:'迟到的服务器内容'}));await assert.rejects(loading,/连接已变化/);
 assert.deepEqual(c.scene,before);assert.equal(c.id,null);assert.equal(c.dirty,true);assert.equal(c.busy,false);
});

test('an acknowledged immutable save remains recoverable when another tab already wrote a newer head',async()=>{
 let original;const calls=[],client=api(async(path,body)=>{calls.push({path,body});
  if(body){original=response(body.id,body.expectedRevision+1,body.scene);throw Error('lost response');}
  return path.includes('/revisions/')?copy(original):response(original.id,original.revision+1,{...original.scene,name:'另一页的新版本'});
 });
 const c=new Controller(client,{storage:storage()});c.change(draft());await assert.rejects(c.save());
 await c.reconcile();assert.equal(c.pending,null);assert.equal(c.conflict,true);assert.equal(c.scene.name,'场地名称');
 assert.equal(c.revision,1);assert.equal(calls.filter(x=>x.body).length,1);
});

test('a pending old-scope save is never queried against a newly selected server scope',async()=>{
 const h=uncertainClient(),c=new Controller(h.client,{storage:storage()});c.change(draft());await assert.rejects(c.save());
 const count=h.calls.length;h.client.scope='other-origin#deployment=other';
 await assert.rejects(c.reconcile(),/连接|范围|原/);assert.ok(c.pending);assert.equal(h.calls.length,count);
});

test('404 reconciliation permits only an explicit retry with the identical original CAS payload',async()=>{
 const calls=[];let committed;
 const client=api(async(path,body)=>{calls.push({path,body:body&&copy(body)});
  if(body&&calls.filter(x=>x.body).length===1)throw Error('lost before commit');
  if(body){committed=response(body.id,body.expectedRevision+1,body.scene);return committed;}
  throw Object.assign(Error('not found yet'),{status:404});
 });
 const c=new Controller(client,{storage:storage()});c.change(draft());
 await assert.rejects(c.save());const original=copy(c.pending);
 await assert.rejects(c.reconcile(),/not found/);assert.equal(c.canRetry,true);assert.equal(calls.filter(x=>x.body).length,1);
 assert.throws(()=>c.change({...c.scene,name:'不能修改待核对信封'}),/核对/);
 await c.retryPending();assert.deepEqual(calls.filter(x=>x.body).map(x=>x.body),[original,original]);
 assert.equal(c.id,original.id);assert.equal(c.revision,1);assert.equal(c.pending,null);assert.equal(committed.revision,1);
});

test('a late original commit racing explicit retry causes CAS409 then GET recovery, never a second revision',async()=>{
 const calls=[];let committed;
 const client=api(async(path,body)=>{calls.push({path,body:body&&copy(body)});
  if(body&&calls.filter(x=>x.body).length===1)throw Error('first response uncertain');
  if(body)throw Object.assign(Error('original has committed'),{status:409});
  if(!committed)throw Object.assign(Error('not found yet'),{status:404});
  return copy(committed);
 });
 const c=new Controller(client,{storage:storage()});c.change(draft());await assert.rejects(c.save());const original=copy(c.pending);
 await assert.rejects(c.reconcile());committed=response(original.id,1,original.scene);
 await assert.rejects(c.retryPending(),/原保存|核对/);assert.ok(c.pending);
 await c.reconcile();assert.equal(c.pending,null);assert.equal(c.revision,1);
 assert.deepEqual(calls.filter(x=>x.body).map(x=>x.body),[original,original]);
});


test('undo to the saved baseline clears dirty while redo restores it',()=>{
 const c=new Controller(api(async()=>{throw Error('no requests')}),{storage:storage()});
 c.adopt(response(ID,3,draft()));const original=copy(c.scene);
 c.change({...c.scene,name:'临时编辑'});assert.equal(c.dirty,true);
 c.history('undo');assert.deepEqual(c.scene,original);assert.equal(c.dirty,false);
 c.history('redo');assert.equal(c.dirty,true);
 c.change(original);assert.equal(c.dirty,false);assert.equal(c.revision,3);
});
