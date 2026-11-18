const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const {Controller,runHTML,resources,motionHTML,mapOverlay,terminal,pairMapOverlay,operationsHTML}=require('../simulation-run-ui.js');
test('newly published scene with no run renders an empty live overlay',()=>{
  const {liveRunsForRelease}=require('../simulation-run-ui.js');
  assert.deepEqual(liveRunsForRelease([null],'new-release'),[]);
});
test('missing Run distinguishes authorization, loading, read failures and confirmed empty records',()=>{
 const {runHTML,emptyRunText}=require('../simulation-run-ui.js');
 const cases=[
  [{authorized:false,fresh:true},/操作员登录/],
  [{authorized:true,refreshing:true},/正在核对版本与运行记录/],
  [{authorized:true,error:'timeout',fresh:true},/读取或核对失败/],
  [{authorized:true,fresh:false},/尚未读取，当前任务情况未知/]
 ];
 for(const [context,pattern] of cases){const html=runHTML(null,false,context);assert.match(html,pattern);assert.doesNotMatch(html,/当前没有记录|尚无正式调度运行|明确点击开始/);assert.doesNotMatch(emptyRunText(context,true),/当前没有记录/);}
 assert.match(runHTML(null),/尚未读取/);
 assert.match(runHTML(null,false,{authorized:true,fresh:true,robotId:'LAB-01'}),/已读取所选车辆的运行记录，当前没有记录/);
 assert.match(emptyRunText({authorized:true,fresh:true},true),/已读取服务端运行目录，当前没有记录/);
 assert.match(runHTML(null,false,{authorized:true,fresh:true}),/尚未选择可核对的车辆/);
 assert.match(operationsHTML({authorized:false}),/操作员登录后可查看任务详情/);
 assert.doesNotMatch(operationsHTML({authorized:false}),/没有.*任务|检查连接/);
});
function harness(options={}) {
  const map=options.map||new Map(),server=options.server||new Map(),calls=[],tails=new Map();
  const storage={getItem:k=>map.get(k)||null,setItem(k,v){if(options.storageFail)throw Error('quota');map.set(k,v);}};
  const locks={request(name,fn){const work=(tails.get(name)||Promise.resolve()).then(fn);tails.set(name,work.catch(()=>{}));return work;}};
  const status={enabled:true,targets:[{id:'p0-sim',environment:'SIM',isolation:true}],activePublication:{requestId:'publication-1',releaseId:'release-1',status:'READY'},currentAdmission:{ready:true,releaseId:'release-1'}};
  if(options.pair){status.targets=[{id:'p0-pair',environment:'SIM',isolation:true}];status.vehicles=[{robotId:'lab-01',vehicleName:'LAB-01',ready:true},{robotId:'lab-02',vehicleName:'LAB-02',ready:true}];}
  const context={URL,Date,Map,Set,Number,String,JSON,Error,Promise,Uint8Array,crypto:require('node:crypto').webcrypto,localStorage:storage,location:{origin:'https://fleet.test'},navigator:{locks},addEventListener(){},setInterval(){},fetch:async(url,request)=>{
    const path=new URL(url).pathname.replace('/api/v1/',''),body=request.body&&JSON.parse(request.body);calls.push({path,body,saved:[...map.values()]});
    let value;
    if(path==='sim-publishing/status')value=status;
    else if(path==='layout')value={points:[{id:'ST-A',name:'Stage A',destination:'ST-A'}]};
    else if(path==='sim-runs'&&!body)value={...(options.pair?{targetId:'p0-pair',robotIds:['lab-01','lab-02']}:{robotId:'lab-01'}),runs:[...server.values()].reverse(),occupancy:options.occupancy};
    else if(path==='sim-runs'&&body){
      value={...body,state:'ACCEPTED',receipt:receipt(body.command.requestId),orderId:'fleet-'+'a'.repeat(32),order:{state:'ACTIVE'},observation:{resources:{planned:null,allocated:null,claimed:null,executed:null},observedAt:new Date().toISOString()}};
      server.set(body.runId,value);if(options.lostResponse)throw Error('lost response');
    }else if(path.endsWith('/recovery-check')){const r=server.get(path.split('/')[1]);value={allowed:true,runId:r.runId,stops:{},resources:{},robotBlockers:['fault remains']};
    }else if(path.endsWith('/finish-stopped')&&body){value=server.get(path.split('/')[1]);value.recovery={command:body,receipt:receipt(body.requestId)};
    }else if(path.endsWith('/cancel')&&body){value=server.get(path.split('/')[1]);value.cancellation={command:body,receipt:receipt(body.requestId)};}
    else if(body&&(path.endsWith('/motion')||path.endsWith('/cancel-active'))){
      value=server.get(path.split('/')[1]);const field=path.endsWith('/motion')?'motionControl':'activeCancellation';
      value[field]={command:body,receipt:receipt(body.requestId),feedback:{status:'PENDING'}};
    }
    else if(path.startsWith('sim-runs/')){value=server.get(path.split('/')[1]);if(!value)return {ok:false,status:404,json:async()=>({error:{code:'NOT_FOUND',message:'Run not found'}})};}
    else if(path.startsWith('commands/')){const id=path.split('/')[1];value=receipt(id);}
    else if(path.startsWith('orders/'))value={state:'ACTIVE'};
    else throw Error('Unexpected '+path);
    return {ok:true,status:200,json:async()=>JSON.parse(JSON.stringify(value))};
  }};
  function receipt(requestId){return {protocolVersion:'1.0',requestId,status:'ACCEPTED',updatedAt:new Date().toISOString(),result:{id:'fleet-'+'a'.repeat(32)},resource:{type:'transport_order',id:'fleet-'+'a'.repeat(32)},confirmation:'request accepted only',error:null};}
  vm.runInNewContext(fs.readFileSync(require.resolve('../fleet-api.js'),'utf8'),context);
  const api=new context.FleetAPI(()=>{},()=>{});api.configureDeployment({environment:'SIM',targetId:'p0-sim',deploymentId:'deployment-1'});api.key='memory-only-key';api.authorized=true;
  const controller=new Controller(api,{storage,lock:fn=>locks.request('sim-run',fn)});
  return {controller,api,map,server,status,calls,storage,locks};
}
test('explicit start binds READY publication and destination through existing durable command ledger',async()=>{
  const h=harness();await h.controller.refresh();assert.equal(h.calls.filter(x=>x.body).length,0);
  await h.controller.start('ST-A');const post=h.calls.find(x=>x.body);
  assert.equal(post.path,'sim-runs');assert.equal(post.body.publicationId,'publication-1');assert.equal(post.body.releaseId,'release-1');
  assert.deepEqual(post.body.command.command,{type:'create_order',robotId:'lab-01',destination:'ST-A'});
  assert.ok(post.saved.some(x=>x.includes(post.body.runId)));assert.ok(post.saved.some(x=>x.includes('DISPATCHING')&&x.includes(post.body.command.requestId)));
  assert.equal(h.api.records[0].status,'ACCEPTED');assert.ok(![...h.map.values()].join('').includes('memory-only-key'));
});
test('incomplete catalog cannot be accepted as an empty run list and loading is emitted before reads',async()=>{
 const h=harness(),base=h.api.request.bind(h.api),states=[];
 h.api.request=async(path,...args)=>path==='sim-runs'?{}:base(path,...args);
 h.controller.onChange=state=>states.push({refreshing:state.refreshing,fresh:state.fresh,error:state.error});
 await assert.rejects(h.controller.readAct(()=>h.controller.refresh()),/运行目录响应不完整/);
 assert.equal(states[0].refreshing,true);assert.equal(h.controller.state.fresh,false);assert.match(h.controller.state.error,/尚不能确认没有记录/);assert.ok(h.calls.every(c=>!c.body));
});
test('lost response restores run and original receipt via GET only across refresh and second tab',async()=>{
  const h=harness({lostResponse:true});await assert.rejects(h.controller.start('ST-A'),/uncertain/i);
  assert.equal(h.api.records[0].status,'UNKNOWN');const id=h.controller.state.pending.runId;
  const restored=harness({map:h.map,server:h.server});await restored.controller.refresh();
  assert.equal(restored.controller.state.run.runId,id);assert.equal(restored.api.records[0].status,'ACCEPTED');
  await assert.rejects(restored.controller.start('ST-A'),/尚未结束/);
  assert.ok(restored.calls.every(c=>!c.body));assert.equal(h.calls.filter(c=>c.body).length,1);
});
test('missing saved run remains unresolved and never creates replacement identity',async()=>{
  const h=harness();h.controller.save({scope:h.api.scope,runId:'original-run',requestId:'original-command'});
  await assert.rejects(h.controller.start('ST-A'),/Run not found/);assert.equal(h.controller.state.pending.runId,'original-run');assert.ok(h.calls.every(c=>!c.body));
});
test('admission loss and stale READY mismatch block before navigation POST',async()=>{
  for(const mutate of [s=>s.currentAdmission.ready=false,s=>s.activePublication.releaseId='old-release',s=>s.targets[0].environment='REAL']){
    const h=harness();mutate(h.status);await assert.rejects(h.controller.start('ST-A'));assert.ok(h.calls.every(c=>!c.body));
  }
  const h=harness();await assert.rejects(h.controller.start('unconfigured'),/目的站/);assert.ok(h.calls.every(c=>!c.body));
});
test('same-controller concurrent starts and separate-tab starts cannot duplicate active run',async()=>{
  const h=harness();const results=await Promise.allSettled([h.controller.start('ST-A'),h.controller.start('ST-A')]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(h.calls.filter(c=>c.body).length,1);
  const second=harness({map:h.map,server:h.server});await assert.rejects(second.controller.start('ST-A'),/尚未结束/);assert.ok(second.calls.every(c=>!c.body));
});
test('storage failure and unavailable write capability never initiate side effects',async()=>{
  const h=harness();h.controller.storage.setItem=()=>{throw Error('quota');};await assert.rejects(h.controller.start('ST-A'),/无法保存/);assert.ok(h.calls.every(c=>!c.body));
  const queryOnly=harness();queryOnly.api.authorized=false;await assert.rejects(queryOnly.controller.start('ST-A'),/登录/);assert.equal(queryOnly.calls.length,0);
});
test('cancel uses unified receipt identity and accepted cancellation is not stop or completion',async()=>{
  const h=harness();await h.controller.start('ST-A');const run=h.controller.state.run;await h.controller.cancel();
  const post=h.calls.find(c=>c.path.endsWith('/cancel'));assert.equal(post.body.command.type,'cancel_order');assert.equal(post.body.command.orderId,run.orderId);
  assert.equal(h.api.records.length,2);assert.equal(h.controller.state.run.state,'ACCEPTED');assert.equal(terminal(h.controller.state.run),false);
  assert.match(runHTML(h.controller.state.run),/正常撤单，已下发动作可能继续，停稳另行核实/);assert.match(runHTML(h.controller.state.run),/取消受理不等于车辆停稳/);
});

test('a confirmed cancellation cannot switch to a task returned by an in-flight refresh',async()=>{
 const {runIdentity}=require('../simulation-run-ui.js');
 const h=harness({pair:true});await h.controller.start('ST-A','lab-01');const original=h.controller.state.run;
 await h.controller.start('ST-A','lab-02');const replacement=h.controller.state.run;
 h.controller.state.run=original;const reviewed=runIdentity(original),posts=h.calls.filter(c=>c.body).length;
 let finishRead;
 const reading=h.controller.readAct(()=>new Promise(resolve=>{finishRead=()=>{h.controller.state.run=replacement;resolve();};}));
 const cancellation=h.controller.act(()=>h.controller.cancel(reviewed));
 finishRead();await reading;await assert.rejects(cancellation,/当前任务已变化/);
 assert.equal(h.calls.filter(c=>c.body).length,posts);assert.equal(h.calls.filter(c=>c.path.endsWith('/cancel')).length,0);
});
test('kernel FINISHED alone is not settled and unavailable resource layers stay absent',()=>{
  const run={runId:'r',state:'FINISHED',completion:{orderFinished:true},observation:{resources:{planned:[{steps:[{path:'P-1',destinationPoint:'P-2'}]}],allocated:['P-1'],executed:null}}};
  assert.equal(terminal(run),false);assert.match(runHTML(run),/内核报告完成/);assert.doesNotMatch(runHTML(run),/到站与持续停稳已核实/);
  assert.match(runHTML(run),/已执行轨迹<\/strong><p>未提供/);assert.equal(resources(run.observation.resources.planned),'P-1 / P-2');
  run.completion={confirmed:true,settled:true};assert.equal(terminal(run),true);assert.match(runHTML(run),/到站与持续停稳已核实/);
});
test('closed diagnostics omit evidence DOM and opened diagnostics only render ten recent samples',()=>{
  const run={runId:'r',state:'EXECUTING',evidence:Array.from({length:80},(_,sequence)=>({sequence,marker:'sample-'+sequence})),evidenceWindow:{total:800}};
  assert.doesNotMatch(runHTML(run),/sample-/);assert.doesNotMatch(runHTML(run),/<pre>/);
  const opened=runHTML(run,true);assert.match(opened,/&quot;sequence&quot;: 79/);assert.doesNotMatch(opened,/&quot;sequence&quot;: 69/);assert.doesNotMatch(opened,/sample-/);assert.match(opened,/800/);
});
test('motion overlay separates actual AMCL samples, fresh same-frame Nav2 plan and truth',()=>{
  const sample={frame:'map',x:-4,y:0,stamp:10};
  const html=motionHTML({resources:{executed:{frame:'map',samples:[sample,{...sample,x:-3,stamp:11}],sampleCount:2}},motion:{estimatedPose:{...sample,fresh:true},navPath:{frame:'map',fresh:true,poses:[sample,{x:0,y:0}]},groundTruthPose:null}});
  assert.match(html,/<svg/);assert.match(html,/stroke-dasharray/);assert.match(html,/最近 2 点/);assert.match(html,/不是 ground truth/);assert.match(html,/仿真真值：未提供/);
  const mismatch=motionHTML({resources:{executed:{frame:'odom',samples:[sample]}},motion:{navPath:{frame:'odom',fresh:true,poses:[sample]}}});
  assert.doesNotMatch(mismatch,/<svg/);assert.match(mismatch,/尚无同一 map/);
  assert.equal(resources({source:'AMCL estimated trajectory (not ground truth)',samples:[sample],sampleCount:15}),'AMCL estimated trajectory (not ground truth) · 15 个采样 · 最近 1 点');
});
test('existing plant map overlay maps actual allocation names and scales same-frame observations',()=>{
  const model={points:[{id:'A',x:-4,y:1},{id:'B',x:0,y:1}],paths:[{id:'A-B',source:'A',target:'B'}]};
  const layer=mapOverlay({resources:{allocated:[['A-B']],executed:{frame:'map',samples:[{frame:'map',x:-4,y:1}]}},motion:{navPath:{frame:'map',fresh:true,poses:[{x:-4,y:1},{x:0,y:1}]}}},model);
  assert.match(layer,/后端分配资源 A-B/);assert.match(layer,/M-240,-60 L0,-60/);assert.match(layer,/AMCL 估计轨迹，不是真值/);assert.match(layer,/Nav2 计划读回，不是已执行轨迹/);
  assert.doesNotMatch(mapOverlay({resources:{allocated:['missing-path']}},model),/<path/);
});


test('sealed run labels stationary proof as historical and exposes original source timestamp',()=>{
  const html=runHTML({state:'FINISHED',completion:{confirmed:true,settled:true,stationary:true,sustainedStationary:true},observation:{worker:{observedAt:'2026-11-09T00:42:09.635Z'}}});
  assert.match(html,/完成时的停稳证据（已封存）/);assert.match(html,/2026-11-09T00:42:09.635Z/);assert.doesNotMatch(html,/新鲜反馈报告停稳/);assert.match(html,/收尾证据已封存/);
});


test('settled failed run uses closure evidence without claiming successful completion',()=>{
  const html=runHTML({state:'FAILED',completion:{confirmed:false,settled:true,stationary:true,sustainedStationary:true},observation:{}});
  assert.match(html,/收尾时的停稳证据（已封存）/);assert.match(html,/任务失败/);assert.doesNotMatch(html,/完成时的停稳证据/);assert.doesNotMatch(html,/到站与持续停稳已核实/);
});


test('pair per vehicle starts share ledger and recovery without duplicating same vehicle',async()=>{
  const h=harness({pair:true});await h.controller.start('ST-A','lab-01');
  await h.controller.start('ST-A','lab-02');assert.equal(h.calls.filter(c=>c.body).length,2);
  assert.deepEqual(h.calls.filter(c=>c.body).map(c=>c.body.command.command.robotId),['lab-01','lab-02']);
  assert.equal(Object.keys(h.controller.state.pending.vehicles).length,2);
  const restored=harness({pair:true,map:h.map,server:h.server});await restored.controller.refresh();
  assert.equal(restored.controller.state.observedRuns.length,2);assert.ok(restored.calls.every(c=>!c.body));
  await assert.rejects(restored.controller.start('ST-A','lab-01'),/尚未结束/);
  await assert.rejects(restored.controller.start('ST-A','lab-02'),/尚未结束/);
  assert.ok(restored.calls.every(c=>!c.body));
});

test('pair source layers preserve identity and unknown shared ownership semantics',()=>{
  const {pairMapOverlay,sharedHTML}=require('../simulation-run-ui.js');
  const sample={frame:'map',x:1,y:2,fresh:true};
  const runs=['LAB-01','LAB-02'].map(robotId=>({robotId,observation:{worker:{observedAt:'2026-11-08T10:00:00Z'},motion:{estimatedPose:sample},resources:{blocks:[{id:'crossing',members:['C'],owners:['LAB-01']}],waiting:{state:'not_observed'}}}}));
  const svg=pairMapOverlay(runs,{});assert.match(svg,/LAB-01/);assert.match(svg,/LAB-02/);assert.match(svg,/#cd6322/);assert.match(svg,/#346bc2/);
  assert.match(sharedHTML(runs),/不等于无冲突/);assert.match(sharedHTML(runs),/owners LAB-01/);
  assert.match(sharedHTML([{observation:{resources:{blocks:[]}}}]),/不推断释放/);
});


test('pair unresolved vehicle one identity never blocks vehicle two or reposts vehicle one',async()=>{
  const h=harness({pair:true,lostResponse:true});await assert.rejects(h.controller.start('ST-A','lab-01'));
  const original=h.controller.state.pending.runId;h.server.delete(original);
  await assert.rejects(h.controller.start('ST-A','lab-02'));
  assert.equal(h.calls.filter(c=>c.body).length,2);
  assert.equal(h.calls.filter(c=>c.body)[1].body.command.command.robotId,'lab-02');
  await assert.rejects(h.controller.start('ST-A','lab-01'),/Run not found/);
  assert.equal(h.calls.filter(c=>c.body).length,2);
});


test('RTS defaults to compact parallel vehicle cards with shared block once and deferred evidence',()=>{
  const {operationsHTML}=require('../simulation-run-ui.js');
  const observedRuns=['LAB-01','LAB-02'].map((robotId,i)=>({robotId,state:'EXECUTING',command:{command:{destination:'EXIT'}},observation:{vehicle:{currentPosition:'ENTRY'},resources:{blocks:[{id:'shared-crossing',members:['long-member-evidence'],owners:['LAB-01']}],waiting:{state:i?'waiting':'not_observed',owners:['LAB-01'],requestedResources:['long-request-evidence']},source:{sourceAgeSeconds:2}}}}));
  const state={observedRuns};const html=operationsHTML(state);
  assert.equal(html.split('shared-crossing').length-1,1);assert.match(html,/等待路权 · 占用车辆 LAB-01/);assert.match(html,/资源观察 2 秒前/);assert.match(html,/run-vehicle-grid/);
  assert.doesNotMatch(html,/long-member-evidence|long-request-evidence|<pre>|run-motion|运行 ID|owners/);
  const opened=operationsHTML(state,true);assert.match(opened,/long-member-evidence/);assert.match(opened,/long-request-evidence/);assert.match(opened,/<pre>/);
});


test('background read keeps selection usable while a write waits and retains its busy guard',async()=>{
  const h=harness({pair:true});await h.controller.refresh();let releaseRead;
  const pendingRead=h.controller.readAct(()=>new Promise(resolve=>{releaseRead=resolve;}));
  assert.equal(h.controller.state.busy,false);assert.equal(h.controller.state.refreshing,true);
  h.controller.state.robotId='lab-02';assert.equal(h.controller.state.robotId,'lab-02');
  let writeEntered=false;const write=h.controller.act(async()=>{writeEntered=true;assert.equal(h.controller.state.busy,true);});
  assert.equal(h.controller.state.busy,true);assert.equal(writeEntered,false);
  releaseRead();await pendingRead;await write;
  assert.equal(writeEntered,true);assert.equal(h.controller.state.busy,false);assert.equal(h.controller.state.robotId,'lab-02');assert.ok(h.calls.every(c=>!c.body));
});


test('RTS shared block chooses newest source including empty over old sealed owner regardless vehicle order',()=>{
  const {operationsHTML,pairMapOverlay}=require('../simulation-run-ui.js');
  const snapshot=(robotId,observedAt,owners)=>({robotId,state:'FINISHED',completion:{settled:true,confirmed:true},observation:{observedAt,resources:{source:{observedAt},blocks:[{id:'crossing-latest',members:['C'],owners}]}}});
  const old=snapshot('LAB-01','2026-11-09T01:46:32Z',['LAB-02']),latest=snapshot('LAB-02','2026-11-09T01:50:16Z',[]);
  for(const observedRuns of [[old,latest],[latest,old]]){
    const html=operationsHTML({observedRuns});assert.match(html,/最后观察 \/ 历史封存/);assert.match(html,/该次占用报告为空/);assert.doesNotMatch(html,/占用车辆 LAB-02/);
    const svg=pairMapOverlay(observedRuns,{points:[{id:'C',x:0,y:0}]});assert.match(svg,/该次占用报告为空/);assert.doesNotMatch(svg,/占用车辆 LAB-02/);
  }
  const missing=snapshot('LAB-02','invalid-time',[]);const html=operationsHTML({observedRuns:[old,missing]});assert.match(html,/归属待核（观察中断或源时间未提供 \/ 无效）/);assert.doesNotMatch(html,/该次占用报告为空|占用车辆 LAB-02/);
});


test('known vehicle colors remain stable when catalog vehicle order reverses',()=>{
  const {operationsHTML,pairMapOverlay}=require('../simulation-run-ui.js');
  const runs=['LAB-02','LAB-01'].map(robotId=>({robotId,state:'FINISHED',observation:{motion:{estimatedPose:{frame:'map',fresh:true,x:1,y:2}}}}));
  for(const observedRuns of [runs,[...runs].reverse()]){
    const html=operationsHTML({observedRuns});assert.match(html,/--vehicle-color:#cd6322"><h3>LAB-02/);assert.match(html,/--vehicle-color:#346bc2"><h3>LAB-01/);
    const svg=pairMapOverlay(observedRuns,{});assert.match(svg,/<g data-vehicle="LAB-02">[\s\S]*?fill="#cd6322"/);assert.match(svg,/<g data-vehicle="LAB-01">[\s\S]*?fill="#346bc2"/);
  }
});


test('explicit history inspection follows its vehicle and survives polling without changing pending recovery',async()=>{
  const h=harness({pair:true});
  await h.controller.start('ST-A','lab-01');const one=h.controller.state.run.runId;
  await h.controller.start('ST-A','lab-02');const two=h.controller.state.run.runId;
  const old={...h.server.get(two),runId:'older-lab-02',state:'FINISHED'};h.server.set(old.runId,old);
  const pending=JSON.stringify(h.controller.state.pending),posts=h.calls.filter(c=>c.body).length;
  h.controller.selectRobot('lab-01');await h.controller.refresh();assert.equal(h.controller.state.run.runId,one);
  await h.controller.inspect(two);assert.equal(h.controller.state.robotId,'lab-02');
  await h.controller.refresh();await h.controller.refresh();assert.equal(h.controller.state.run.runId,two);
  await h.controller.inspect(old.runId);await h.controller.refresh();assert.equal(h.controller.state.run.runId,old.runId);
  assert.equal(JSON.stringify(h.controller.state.pending),pending);
  h.controller.selectRobot('lab-01');await h.controller.refresh();assert.equal(h.controller.state.run.runId,one);assert.equal(h.controller.viewRunId,null);
  assert.equal(h.calls.filter(c=>c.body).length,posts);
  const reloaded=harness({pair:true,map:h.map,server:h.server});await reloaded.controller.refresh();
  assert.equal(reloaded.controller.viewRunId,null);assert.equal(reloaded.controller.state.run.runId,one);assert.ok(reloaded.calls.every(c=>!c.body));
  await h.controller.inspect(old.runId);
  for(const run of h.server.values()){run.state='FINISHED';run.completion={settled:true};}
  await h.controller.start('ST-A','lab-02');const fresh=h.controller.state.run.runId;
  assert.notEqual(fresh,old.runId);assert.equal(h.controller.viewRunId,null);
  await h.controller.refresh();assert.equal(h.controller.state.run.runId,fresh);
  assert.equal(h.calls.filter(c=>c.body).length,posts+1);
});


test('explicit history intent waits for an in-flight background read rather than being dropped',async()=>{
  const h=harness({pair:true});await h.controller.start('ST-A','lab-01');await h.controller.start('ST-A','lab-02');
  const two=h.controller.state.run.runId;h.controller.selectRobot('lab-01');
  let release,entered;const started=new Promise(resolve=>entered=resolve),original=h.api.request.bind(h.api);
  h.api.request=async(path,...args)=>{if(path==='sim-publishing/status'){entered();await new Promise(resolve=>release=resolve);}return original(path,...args);};
  const posts=h.calls.filter(c=>c.body).length,pending=JSON.stringify(h.controller.state.pending);
  const polling=h.controller.readAct(()=>h.controller.refresh());await started;
  let inspected=false;const history=h.controller.act(async()=>{await h.controller.inspect(two);inspected=true;});
  assert.equal(h.controller.state.busy,true);assert.equal(inspected,false);
  release();await polling;await history;
  assert.equal(inspected,true);assert.equal(h.controller.state.robotId,'lab-02');assert.equal(h.controller.state.run.runId,two);
  h.api.request=original;await h.controller.readAct(()=>h.controller.refresh());
  assert.equal(h.controller.state.run.runId,two);assert.equal(h.calls.filter(c=>c.body).length,posts);assert.equal(JSON.stringify(h.controller.state.pending),pending);
  assert.match(fs.readFileSync(require.resolve('../simulation-run-ui.js'),'utf8'),/reviewCancel=false;act\(\(\)=>controller.inspect/);
});


test('unknown observation keeps last trusted resources explicitly historical without promoting them to the live map',()=>{
  const run={runId:'retained-run',robotId:'LAB-01',state:'EXECUTING',observation:{status:'UNKNOWN',errors:['RUN_BRIDGE_SOURCE_STALE_OR_UNAVAILABLE'],resources:{}},
    lastTrustedObservation:{observedAt:'2026-11-09T03:00:00Z',resources:{allocated:['<old-owner>']}}};
  const html=runHTML(run);
  assert.match(html,/观察中断 \/ UNKNOWN/);assert.match(html,/历史，不证明当前归属或释放/);assert.match(html,/&lt;old-owner&gt;/);assert.match(html,/retained-run/);
  assert.ok(!pairMapOverlay([run],{points:[],paths:[]}).includes('old-owner'));
  const state={observedRuns:[run],runs:[run]};assert.match(operationsHTML(state),/观察中断 \/ UNKNOWN/);
});


test('refresh reuses its selected run response for RTS instead of reading the same run twice',async()=>{
  const h=harness({pair:true});await h.controller.start('ST-A','lab-01');
  const id=h.controller.state.run.runId;h.calls.length=0;
  await h.controller.refresh();
  assert.equal(h.calls.filter(c=>c.path==='sim-runs/'+id).length,1);
  assert.ok(h.calls.every(c=>!c.body));assert.equal(h.controller.state.observedRuns[0],h.controller.state.run);
});


test('stopped fault recovery is explicit, uses a fresh durable command and never replays on reload',async()=>{
  const h=harness({pair:true});await h.controller.start('ST-A','lab-01');
  const run=h.controller.state.run;run.robotId='lab-01';run.sourceId='same-worker';run.releaseId='a'.repeat(32);
  Object.assign(h.server.get(run.runId),{robotId:run.robotId,sourceId:run.sourceId,releaseId:run.releaseId});
  const posts=h.calls.filter(c=>c.body).length;
  await h.controller.reviewRecovery();assert.equal(h.calls.filter(c=>c.body).length,posts);
  await h.controller.finishStopped();
  const request=h.calls.find(c=>c.path.endsWith('/finish-stopped'));
  assert.equal(request.body.command.type,'finish_stopped_run');assert.equal(request.body.command.runId,run.runId);
  assert.ok(request.saved.some(v=>v.includes('finish_stopped_run')));
  const count=h.calls.filter(c=>c.path.endsWith('/finish-stopped')).length;
  await h.controller.reviewRecovery();await h.controller.finishStopped();
  assert.equal(h.calls.filter(c=>c.path.endsWith('/finish-stopped')).length,count);
  assert.notEqual(request.body.requestId,run.command.requestId);
});

test('authored-route recovery is replaced with the reviewed SIM reset workflow using persisted profile identity',t=>{
 const {mount}=require('../simulation-run-ui.js'),h=harness({pair:true}),container={innerHTML:'',querySelector(){return null;},querySelectorAll(){return [];},replaceChildren(){}};
 const original=global.setInterval;global.setInterval=()=>0;let view;try{view=mount(container,h.api,{storage:h.storage});}finally{global.setInterval=original;}t.after(()=>view.destroy());
 const run={runId:'authored-original',orderId:'fleet-original',robotId:'lab-01',releaseId:'original-release',sourceId:'original-worker',profileId:'scene-routes-pair-v1',vehicleName:'LAB-01',state:'ACCEPTED',order:{state:'FAILED'},completion:{settled:false}};
 Object.assign(view.controller.state,{run,targetId:'p0-pair'});view.render();
 assert.doesNotMatch(container.innerHTML,/data-run-action="recovery-review"|data-run-action="finish-stopped"/);
 assert.match(container.innerHTML,/强制复位仿真.*审阅涉及的车辆和任务.*停止整个隔离仿真.*重新准备服务并发布原场景/);
 assert.match(container.innerHTML,/任务与失败记录会保留/);
 run.profileId='empty-crossing-pair-v1';view.render();assert.match(container.innerHTML,/data-run-action="recovery-review"/);assert.doesNotMatch(container.innerHTML,/任务未结案时/);
 run.profileId='scene-routes-pair-v1';run.order.state='BEING_PROCESSED';view.render();assert.doesNotMatch(container.innerHTML,/data-run-action="recovery-review"|任务未结案时/);
 run.cancellation={receipt:{status:'ACCEPTED'}};view.render();assert.match(container.innerHTML,/任务未结案时/);
 run.sessionClosure={status:'COMPLETED'};view.render();assert.doesNotMatch(container.innerHTML,/任务未结案时/);assert.ok(h.calls.every(c=>!c.body));
});

test('recovery guard resolves only the original release profile and never calls unsupported authored recovery APIs',async()=>{
 const h=harness({pair:true});h.controller.state.run={runId:'original',orderId:'fleet-original',releaseId:'release-original',sourceId:'worker-original',state:'FAILED',vehicleName:'canonical-looking-name'};
 h.controller.state.status={profileId:'empty-crossing-pair-v1',releases:[{releaseId:'release-original',profileId:'scene-routes-pair-v1'}]};
 await assert.rejects(h.controller.reviewRecovery(),/任务未结案时/);
 h.controller.state.recoveryCheck={runId:'original',allowed:true};await assert.rejects(h.controller.finishStopped(),/重新准备服务并发布原场景/);
 assert.equal(h.controller.state.recoveryCheck,null);assert.equal(h.calls.length,0);
 h.controller.state.status.releases[0].releaseId='unrelated-release';h.server.set('original',h.controller.state.run);
 await h.controller.reviewRecovery();assert.equal(h.calls.length,1);assert.ok(h.calls[0].path.endsWith('/recovery-check'));assert.ok(!h.calls[0].body);
});

test('current pair task remains selectable from history and uses its original identity for explicit controls',async t=>{
  const {mount,runIdentity}=require('../simulation-run-ui.js'),h=harness({pair:true});
  const container={innerHTML:'',querySelector(){return null;},querySelectorAll(){return [];},replaceChildren(){}};
  const interval=global.setInterval;global.setInterval=()=>0;
  let view;
  try{view=mount(container,h.api,{storage:h.storage});}finally{global.setInterval=interval;}
  t.after(()=>view.destroy());
  const old={runId:'old',releaseId:'previous',robotId:'lab-01',state:'FINISHED',completion:{settled:true}};
  const current={runId:'active',releaseId:'release-1',sourceId:'actual-worker',robotId:'lab-02',vehicleName:'LAB-02',
    state:'EXECUTING',orderId:'fleet-'+'a'.repeat(32),order:{state:'BEING_PROCESSED'},command:{command:{destination:'ST-A'}}};
  current.observation={vehicle:{transportOrder:current.orderId}};
  h.server.set(old.runId,old);h.server.set(current.runId,current);
  await view.controller.inspect(old.runId);await view.controller.refresh();
  assert.match(container.innerHTML,/data-run-current="active"/);
  assert.doesNotMatch(container.innerHTML,/data-run-action="pause"/);
  await view.controller.inspect(current.runId);
  assert.match(container.innerHTML,/data-run-action="pause"/);
  await view.controller.control('pause',runIdentity(current));
  assert.match(container.innerHTML,/暂停原任务 · 调度已受理 · 等待车载确认/);
  assert.doesNotMatch(container.innerHTML,/data-run-action="resume"/);
  current.motionControl.feedback={status:'CONFIRMED',paused:true,sustainedStationary:true};
  await view.controller.refresh();
  assert.match(container.innerHTML,/data-run-action="resume"/);
  await view.controller.control('resume',runIdentity(current));
  await view.controller.control('cancel_order',runIdentity(current));
  assert.deepEqual(h.calls.filter(c=>c.body).map(c=>[c.path,c.body.command]),[
    ['sim-runs/active/motion',{type:'pause',robotId:'lab-02'}],
    ['sim-runs/active/motion',{type:'resume',robotId:'lab-02'}],
    ['sim-runs/active/cancel-active',{type:'cancel_order',orderId:current.orderId}]
  ]);
  assert.match(container.innerHTML,/持续停稳 · 待核实/);
  assert.match(container.innerHTML,/查看强制复位仿真/);
});

test('selected pair station explains the peer reservation and creates no order',async()=>{
  const h=harness({pair:true,occupancy:{releaseId:'release-1',owners:{'ST-A':['LAB-02']}}});
  await h.controller.refresh();
  assert.match(h.controller.occupiedDestination('ST-A'),/LAB-02.*占用或预留/);
  await assert.rejects(h.controller.start('ST-A'),/LAB-02.*占用或预留/);
  assert.ok(h.calls.every(c=>!c.body));
});


test('opened diagnostics remain bounded summaries with huge trajectories workers and evidence payloads',()=>{
  const payload='FULL-RAW-PAYLOAD-'+ 'x'.repeat(100000);
  const points=Array.from({length:10000},(_,i)=>({frame:'map',x:i,y:0,stamp:i,raw:payload}));
  const run={runId:'bounded',state:'FAILED',completion:{settled:true,confirmed:false,closurePhysicalEvidence:{bridgeState:{actionStates:Array.from({length:1000},(_,i)=>({actionId:'action-'+i,actionType:'cancelOrder',actionStatus:'FINISHED',raw:payload}))}}},
    observation:{resources:{executed:{frame:'map',sampleCount:50000,samples:points},allocated:[['held-resource']],planned:[]},worker:{robots:{'LAB-01':{sourceId:'source',telemetry:{navPath:{poses:points}},odom:{vx:0,wz:0,wallAge:.01,simAge:.01},raw:payload}}}},
    evidenceWindow:{total:100000},evidence:Array.from({length:300},(_,i)=>({sequence:i,kind:'OBSERVATION',sourceTimestamp:'source-'+i,payload:{state:'FAILED',worker:{raw:payload},resources:{executed:{samples:points}}}}))};
  const html=runHTML(run,true),pre=html.match(/<pre>([\s\S]*?)<\/pre>/)[1];
  assert.ok(pre.length<30000,pre.length);assert.doesNotMatch(pre,/FULL-RAW-PAYLOAD/);assert.match(pre,/50000/);assert.match(pre,/trajectoryWindowCount/);assert.match(pre,/100000/);
  assert.match(pre,/source-299/);assert.doesNotMatch(pre,/source-289/);assert.match(html,/有界诊断摘要/);assert.match(html,/完整证据仍在服务端分页保留/);
  const rts=operationsHTML({observedRuns:[run,run]},true);assert.ok(rts.length<70000,rts.length);assert.doesNotMatch(rts,/FULL-RAW-PAYLOAD/);
});


test('historical replay suspension blocks live Run polling and leaving replay explicitly refreshes current observation',async t=>{
 const {mount}=require('../simulation-run-ui.js'),h=harness(),nodes=new Map(),container={innerHTML:'',querySelector(k){if(!nodes.has(k))nodes.set(k,{dataset:{},addEventListener(){}});return nodes.get(k);},querySelectorAll(){return [];},replaceChildren(){}};
 const original=global.setInterval;let tick;global.setInterval=fn=>(tick=fn,0);
 const view=mount(container,h.api,{storage:h.storage,lock:fn=>fn()});global.setInterval=original;t.after(()=>view.destroy());
 view.setReadPaused(true);tick();assert.equal(h.calls.length,0);
 view.setReadPaused(false);await view.controller.reading;assert.ok(h.calls.length>0);assert.ok(h.calls.every(c=>!c.body));
});


test('live overlays exclude other releases and sealed poses and plans while retaining a current active Run',()=>{
 const {liveRunsForRelease}=require('../simulation-run-ui.js'),motion=x=>({estimatedPose:{frame:'map',fresh:true,x,y:0},navPath:{frame:'map',fresh:true,poses:[{x,y:0},{x:x+1,y:0}]}});
 const old={runId:'old',robotId:'LAB-01',releaseId:'release-old',observation:{motion:motion(90)}},sealed={runId:'sealed',robotId:'LAB-02',releaseId:'release-current',completion:{settled:true,confirmed:true},observation:{motion:motion(80)}},active={runId:'active',robotId:'LAB-01',releaseId:'release-current',observation:{motion:motion(1)}};
 assert.deepEqual(liveRunsForRelease([old,sealed,active],'release-current'),[active]);assert.deepEqual(liveRunsForRelease([old,sealed,active],null),[]);
 const svg=pairMapOverlay(liveRunsForRelease([old,sealed,active],'release-current'),{});assert.match(svg,/data-vehicle="LAB-01"/);assert.doesNotMatch(svg,/LAB-02|cx="4800"|cx="5400"/);assert.match(svg,/cx="60"/);assert.match(svg,/polyline/);
 const cards=operationsHTML({observedRuns:[sealed],status:{currentAdmission:{releaseId:'release-current'}}});assert.match(cards,/历史封存 · 非实时/);
});
test('single task heading preserves original origin and distinguishes fresh current and sealed positions',()=>{
 const {runHTML}=require('../simulation-run-ui.js');
 const run={runId:'historical',robotId:'LAB-01',startPoint:'L-STAGE',command:{command:{destination:'L-EXIT'}},observation:{status:'TRUSTED',observedAt:new Date().toISOString(),vehicle:{currentPosition:'L-WAIT'}}};
 let html=runHTML(run);assert.match(html,/L-STAGE → L-EXIT/);assert.match(html,/当前位置 L-WAIT/);assert.doesNotMatch(html,/L-WAIT → L-EXIT/);
 run.observation.observedAt='2000-01-01T00:00:00Z';html=runHTML(run);assert.match(html,/当前位置待核对/);assert.doesNotMatch(html,/当前位置 L-WAIT/);
 run.completion={settled:true};html=runHTML(run);assert.match(html,/收尾时位置 L-WAIT/);assert.match(html,/L-STAGE → L-EXIT/);
 delete run.startPoint;assert.match(runHTML(run),/起点未记录 → L-EXIT/);
});
test('unsuccessful terminal Run without physical closure never says it is executing',()=>{
 const {runHTML}=require('../simulation-run-ui.js');
 for(const state of ['FAILED','WITHDRAWN','CANCELLED']){
  const run={state,observation:{status:'TRUSTED'},completion:{settled:false}};
  const html=runHTML(run);assert.match(html,/任务未成功，停稳与收尾待核对/);assert.doesNotMatch(html,/正在执行 \/ 观察中/);
  run.observation.status='UNKNOWN';assert.match(runHTML(run),/反馈中断，暂不确认车辆状态/);
  run.observation={status:'TRUSTED',admission:{ready:false}};assert.match(runHTML(run),/运行准入受阻，请核对车辆反馈/);
 }
});

test('Run headings and RTS destinations use only persisted route context labels while credentials retain original IDs',()=>{const run={runId:'new-authored',robotId:'LAB-01',startPoint:'P-1',command:{command:{destination:'S-1'}},routeContext:{originPointId:'P-1',originLabel:'出发停车位',destinationId:'S-1',destinationLabel:'下料工位'},observation:{vehicle:{currentPosition:'P-2'}}};const before=JSON.stringify(run),html=runHTML(run),main=html.split('<details class="run-reference">')[0];assert.match(main,/出发停车位 → 下料工位/);assert.doesNotMatch(main,/P-1 → S-1/);assert.match(html,/<dt>目的站<\/dt><dd>S-1<\/dd>/);const rts=operationsHTML({observedRuns:[run],layout:{points:[{id:'P-1',name:'另一版本起点',destination:'S-1'}]}});assert.match(rts,/位置 P-2 → 下料工位/);assert.doesNotMatch(rts,/另一版本起点/);assert.equal(JSON.stringify(run),before);});

test('old history and absent observed origin retain existing fallback and hostile route labels are escaped',()=>{const old={runId:'old',robotId:'LAB-01',startPoint:'L-STAGE',command:{command:{destination:'S-1'}},observation:{vehicle:{currentPosition:'L-WAIT'}}};const state={observedRuns:[old],layout:{points:[{id:'L-STAGE',name:'当前地图新标签',destination:'S-1'}]}};assert.match(runHTML(old),/L-STAGE → S-1/);assert.match(operationsHTML(state),/位置 L-WAIT → S-1/);assert.doesNotMatch(operationsHTML(state),/当前地图新标签/);old.routeContext={originPointId:null,originLabel:null,destinationId:'S-1',destinationLabel:'下料工位'};delete old.startPoint;assert.match(runHTML(old),/起点未记录 → 下料工位/);old.routeContext.originLabel='<img src=x onerror=alert(1)>';old.routeContext.destinationLabel='工位<script>alert(1)</script>&"';for(const html of [runHTML(old),operationsHTML(state)]){assert.doesNotMatch(html,/<img src=x|<script>/);assert.match(html,/工位&lt;script&gt;alert\(1\)&lt;\/script&gt;&amp;&quot;/);}assert.match(runHTML(old),/&lt;img src=x onerror=alert\(1\)&gt;/);old.routeContext={originLabel:'  ',destinationLabel:5};assert.match(runHTML(old),/起点未记录 → S-1/);});

test('without a current admitted version last observations are collapsed rather than promoted into current work',()=>{const html=operationsHTML({observedRuns:[{robotId:'LAB-01',state:'FINISHED',completion:{settled:true},observation:{}}]});const head=html.split('<details')[0];assert.match(head,/当前没有可核验的活动任务/);assert.doesNotMatch(head,/run-vehicle-card/);assert.match(html,/<details class="run-history-details"><summary>查看最后运行记录/);assert.match(html,/LAB-01/);});

test('update guard resolves original Run handles using sealed closure even with raw ACCEPTED state',()=>{
 const h=harness(),s=h.controller.state;s.pending={runId:'original',vehicles:{'LAB-02':{runId:'other'}}};
 s.run={runId:'original',state:'ACCEPTED',sessionClosure:{status:'COMPLETED'}};
 s.observedRuns=[{runId:'other',state:'FAILED',completion:{settled:true}}];
 assert.equal(h.controller.updateBlocker(),'');assert.equal(s.pending.runId,'original');
 s.observedRuns=[{runId:'other',state:'ACCEPTED'}];assert.match(h.controller.updateBlocker(),/运行历史与恢复/);
 s.run={runId:'different',state:'REJECTED'};s.observedRuns=[];
 assert.match(h.controller.updateBlocker(),/原单次任务/);
 s.runs=[{runId:'original',state:'REJECTED'},{runId:'other',state:'REJECTED'}];
 assert.equal(h.controller.updateBlocker(),'');
});
