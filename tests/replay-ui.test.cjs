const test=require('node:test');const assert=require('node:assert/strict');
const {Controller,loadReplay,normalizePages,mapHTML,mount,eventLabel}=require('../replay-ui.js');
const point=(x,stamp=1)=>({frame:'map',x,y:0,stamp,fresh:true});
const frame=(seq,seconds,extra={})=>({sequence:seq,runId:'run-a',robotId:'LAB-01',recordedAt:new Date(Date.UTC(2026,10,9)+seconds*1000).toISOString(),sourceTime:'source-'+seq,status:'TRUSTED',gap:false,resources:{allocatedNames:['path-a'],source:{sourceAgeSeconds:null}},robots:{'LAB-01':{robotId:'LAB-01',sourceId:'robot-source',sourceTime:'robot-source-'+seq,estimatedPose:point(seconds,seq)}},...extra});
const page=(frames,events=[])=>({kind:'HISTORICAL_REPLAY',runId:'run-a',runIds:['run-a'],releaseId:'release',releaseHash:'hash',sourceId:'worker',deploymentId:'pair',mapId:'map',frame:'map',model:{points:[{id:'A',x:0,y:0},{id:'B',x:10,y:0}],paths:[{id:'path-a',source:'A',target:'B'}]},frames,events,cursor:{after:0,nextAfter:30,through:99,hasMore:false},coverage:{totalEvidence:100}});

test('replay loads complete normalized pages with one frozen global highwater and GET only',async()=>{
 const calls=[];const api={async request(path,body){calls.push({path,body});if(path.includes('/events?'))return {events:[],cursor:{after:0,nextAfter:0,through:7,hasMore:false}};if(path.startsWith('sim-scenarios'))return {executionId:'exec',recordedRunIds:['run-a','run-b'],eventsThrough:7,evidenceThrough:99,steps:[{runId:'run-a',runRecorded:true},{runId:'run-b',runRecorded:true}]};const id=path.includes('run-b')?'run-b':'run-a';const p=page([frame(id==='run-a'?1:2,id==='run-a'?0:1)]);p.runId=id;p.runIds=[id];return p;}};
 const replay=await loadReplay(api,{kind:'scenario',id:'exec'});
 assert.equal(replay.runIds.length,2);assert.match(calls.at(-1).path,/through=99/);assert.ok(calls.every(c=>c.body===undefined));
 assert.equal(replay.frames[0].sourceTime,'robot-source-1');assert.equal(replay.timelineBasis,'gateway recordedAt; source times shown separately');
});
test('gap resets original pose segments, missing source stays missing, and peer snapshots do not erase owner resources',()=>{
 const a=frame(1,0);const gap=frame(2,2,{gap:true,gapReasons:['SOURCE_GAP']});const b=frame(3,3);
 const peer=frame(4,4,{runId:'run-b',robotId:'LAB-02',resources:{allocatedNames:['peer-path']}});
 const data=normalizePages([page([a,gap,b,peer],[{sequence:4,runId:'run-b',kind:'CANCEL_REQUESTED',recordedAt:peer.recordedAt,sourceTime:null}])]);
 const c=new Controller();c.load(data);c.seek(3);assert.equal(c.snapshots()[0].estimatedTrajectory.samples.length,1);
 c.seek(4);assert.deepEqual(c.snapshots()[0].allocatedNames,['path-a']);assert.equal(data.events[0].sourceTime,null);
 c.duration=20;c.seek(12);assert.equal(c.snapshots()[0].displayGap,true);assert.doesNotMatch(mapHTML(c),/<circle/);
});
test('play seek speed pause and key events move only the historical cursor',()=>{
 const c=new Controller();c.load({frames:[{timeSeconds:0,robotId:'r'},{timeSeconds:10,robotId:'r'}],events:[{timeSeconds:3},{timeSeconds:8}]});
 c.toggle();c.speed=2;c.tick(1);assert.equal(c.time,2);c.event(1);assert.equal(c.time,3);c.seek(9);c.event(-1);assert.equal(c.time,8);c.toggle();c.tick(10);assert.equal(c.time,8);c.toggle();c.tick(5);assert.equal(c.time,10);assert.equal(c.playing,false);
});
test('mixed binding and changing highwater fail closed rather than merge histories',async()=>{
 const p=page([frame(1,0)]),q={...p,releaseHash:'other'};assert.throws(()=>normalizePages([p,q]),/不一致/);
 let count=0;const api={async request(){count++;return {...p,cursor:{through:count===1?9:10,nextAfter:count,hasMore:count===1}};}};
 await assert.rejects(loadReplay(api,{kind:'run',id:'run-a'}),/边界变化/);
});
test('a late cancelled load cannot overwrite a newer replay, and replay renders no command controls',async t=>{
 const pending=new Map(),nodes=new Map(),container={innerHTML:'',hidden:false,querySelector(k){if(!nodes.has(k))nodes.set(k,{addEventListener(){}});return nodes.get(k);},querySelectorAll(){return [];},replaceChildren(){}};
 const view=mount(container,{loadReplay:target=>new Promise(resolve=>pending.set(target.id,resolve))});t.after(()=>view.destroy());
 const first=view.open({id:'old'}),second=view.open({id:'new'});pending.get('new')({replayId:'new',frames:[{timeSeconds:0,robotId:'LAB-01',gap:true}],events:[]});await second;pending.get('old')({replayId:'old',frames:[],events:[]});await first;
 assert.equal(view.controller.data.replayId,'new');assert.match(container.innerHTML,/返回当前运行/);assert.match(nodes.get('[data-replay-sources]').innerHTML,/记录不完整/);assert.doesNotMatch(container.innerHTML,/data-run-action|data-scene-action|确认执行|申请正常撤单/);
});
test('business events preserve cancellation and recovery limits without raw protocol labels',()=>{
 assert.match(eventLabel({kind:'CANCEL_RECEIPT',robotId:'LAB-01',details:{status:'ACCEPTED'}}),/LAB-01.*停稳.*待核实/);assert.match(eventLabel({kind:'RECOVERY_FINISHED'}),/不代表恢复可执行/);assert.match(eventLabel({kind:'COMMAND_RECEIPT',details:{status:'ACCEPTED'}}),/已受理.*实际执行另行核对/);
});


test('playback patches observations without replacing slider speed controls or open details',async t=>{
 const nodes=new Map();let replacements=0,markup='';const container={get innerHTML(){return markup;},set innerHTML(v){markup=v;replacements++;},querySelector(k){if(!nodes.has(k))nodes.set(k,{value:'',innerHTML:'',textContent:'',addEventListener(){}});return nodes.get(k);},querySelectorAll(){return [];},replaceChildren(){}};
 const view=mount(container,{loadReplay:async()=>({frames:[{timeSeconds:0,robotId:'r'},{timeSeconds:10,robotId:'r'}],events:[]})});t.after(()=>view.destroy());await view.open({id:'one'});
 const seek=nodes.get('[data-replay-seek]'),speed=nodes.get('[data-replay-speed]'),count=replacements;
 view.controller.toggle();view.controller.tick(.2);view.controller.seek(3);
 assert.equal(replacements,count);assert.equal(nodes.get('[data-replay-seek]'),seek);assert.equal(nodes.get('[data-replay-speed]'),speed);assert.equal(seek.value,3);
});
test('plan points use their original container frame without inventing per-point frame fields',()=>{
 const c=new Controller();c.load({model:{points:[{id:'a',x:0,y:0}],paths:[]},frames:[{timeSeconds:0,robotId:'r',plan:{frame:'map',fresh:true,poses:[{x:0,y:0},{x:1,y:1}]}}],events:[]});
 assert.match(mapHTML(c),/polyline/);c.data.frames[0].plan.frame='world';assert.doesNotMatch(mapHTML(c),/polyline/);
});


test('scenario replay retains skipped and unrecorded unknown tasks but reads only confirmed existing Runs',async()=>{
 const execution={executionId:'mixed',recordedRunIds:['run-a'],eventsThrough:3,evidenceThrough:99,steps:[{stepId:'one',robotId:'LAB-01',destination:'A',runId:'run-a',runRecorded:true,state:'SUCCEEDED'},{stepId:'two',robotId:'LAB-02',destination:'B',runId:'not-submitted',runRecorded:false,state:'SKIPPED'},{stepId:'three',robotId:'LAB-01',destination:'C',runId:'prepared-before-run',runRecorded:false,state:'UNKNOWN'}]};
 const calls=[],api={async request(path){calls.push(path);if(path.includes('/events?'))return {events:[{scope:'SCENARIO_GATEWAY_RECORD',executionId:'mixed',sequence:3,kind:'UNSUBMITTED_STEPS_STOPPED',at:'2026-11-09T00:00:02Z'}],cursor:{after:0,nextAfter:3,through:3,hasMore:false}};if(path.startsWith('sim-scenarios'))return execution;return page([frame(1,0)]);}};
 const result=await loadReplay(api,{kind:'scenario',id:'mixed'});
 assert.equal(result.displaySteps.length,3);assert.equal(result.displaySteps[1].state,'SKIPPED');assert.equal(result.displaySteps[2].state,'UNKNOWN');assert.equal(result.displaySteps[2].runRecorded,false);
 assert.equal(calls.filter(p=>p.startsWith('sim-replay/')).length,1);assert.ok(!calls.some(p=>p.includes('prepared-before-run')||p.includes('not-submitted')));assert.match(eventLabel(result.events.find(e=>e.eventNamespace==='scenario')),/任务 2 未执行/);
});
test('a scenario with zero recorded Runs still replays every orchestration page with no fabricated frames',async()=>{
 const original=Array.from({length:21},(_,i)=>({scope:'SCENARIO_GATEWAY_RECORD',executionId:'empty',sequence:i+1,kind:i===20?'UNSUBMITTED_STEPS_STOPPED':'PAUSED_REVIEW',at:new Date(Date.UTC(2026,10,9)+i*1000).toISOString()})),calls=[];
 const api={async request(path){calls.push(path);if(!path.includes('/events?'))return {executionId:'empty',recordedRunIds:[],eventsThrough:21,evidenceThrough:100,steps:[{runId:'unused',runRecorded:false,state:'SKIPPED'}]};assert.match(path,/through=21/);const after=Number(new URL('http://fixture/'+path).searchParams.get('after'));const events=original.filter(e=>e.sequence>after&&e.sequence<=21).slice(0,20);original.push({sequence:99});return {events,cursor:{after,nextAfter:events.at(-1).sequence,through:21,hasMore:after===0}};}};
 const result=await loadReplay(api,{kind:'scenario',id:'empty'});assert.equal(result.frames.length,0);assert.equal(result.events.length,21);assert.ok(result.events.every(e=>e.sourceTime===null&&e.eventNamespace==='scenario'));assert.ok(!calls.some(p=>p.startsWith('sim-replay/')));
});
test('listed recorded Run failures and invalid scene event boundaries are never silently skipped',async()=>{
 const e={executionId:'broken',recordedRunIds:['real-run'],eventsThrough:1,evidenceThrough:5,steps:[{runId:'real-run',runRecorded:true}]};
 const api={async request(path){if(path.includes('/events?'))return {events:[],cursor:{after:0,nextAfter:0,through:1,hasMore:false}};if(path.startsWith('sim-scenarios'))return e;throw Error('real recorded Run 404');}};
 await assert.rejects(loadReplay(api,{kind:'scenario',id:'broken'}),/404/);
 const bad={request:async path=>path.includes('/events?')?{events:[],cursor:{after:0,nextAfter:0,through:2,hasMore:false}}:e};await assert.rejects(loadReplay(bad,{kind:'scenario',id:'broken'}),/来源或读取边界/);
 const missing={request:async()=>({...e,evidenceThrough:undefined})};await assert.rejects(loadReplay(missing,{kind:'scenario',id:'broken'}),/固定读取边界/);
});
test('business key events explain the vehicle consequence and preserve first-observed limits',()=>{
 assert.match(eventLabel({kind:'RESOURCE_OBSERVATION',robotId:'LAB-02',details:{waiting:{state:'waiting',owners:['LAB-01']}}}),/LAB-02 等待通行.*LAB-01 占用/);
 assert.match(eventLabel({kind:'RUN_CLOSURE_OBSERVED',robotId:'LAB-02',details:{settled:true,confirmed:false}}),/LAB-02.*持续停稳已核实.*未成功.*已收尾/);
 const first=eventLabel({kind:'VDA_ACTION_STATE',robotId:'LAB-02',details:{actionType:'cancelOrder',actionStatus:'FINISHED',firstObserved:true}});assert.match(first,/首次记录到.*车载取消已确认完成/);assert.doesNotMatch(first,/先.*执行中|RUNNING/);
});


test('fractional final replay endpoint is selectable without range-step truncation and includes the final closure',async t=>{
 const nodes=new Map(),container={innerHTML:'',querySelector(k){if(!nodes.has(k))nodes.set(k,{value:'',innerHTML:'',handlers:{},addEventListener(name,fn){this.handlers[name]=fn;}});return nodes.get(k);},querySelectorAll(){return [];},replaceChildren(){}};
 const end=1661.289,view=mount(container,{loadReplay:async()=>({frames:[{timeSeconds:0,robotId:'LAB-02'},{timeSeconds:end,robotId:'LAB-02'}],events:[{timeSeconds:end,kind:'RUN_CLOSURE_OBSERVED',robotId:'LAB-02',details:{settled:true,confirmed:false,sustainedStationary:true}}]})});t.after(()=>view.destroy());await view.open({id:'last'});
 assert.match(container.innerHTML,/step="any"/);assert.match(container.innerHTML,/max="1661.289"/);
 nodes.get('[data-replay-seek]').handlers.input({target:{value:String(end)}});
 assert.equal(view.controller.time,end);assert.equal(nodes.get('[data-replay-seek]').value,end);assert.match(nodes.get('[data-replay-events]').innerHTML,/持续停稳已核实/);
});


test('a recorded run vehicle and destination replace a generic entry label without inventing missing metadata',()=>{
 const p={...page([]),vehicleName:'LAB-02',destination:'LAB-02-STATION'};
 assert.equal(normalizePages([p],{kind:'run',label:'LAB-02 · 历史作业'}).label,'LAB-02 → LAB-02-STATION');
 assert.equal(normalizePages([page([])],{kind:'run',label:'原历史记录'}).label,'车辆未知 → 目的站未知');
 assert.equal(normalizePages([p],{kind:'scenario',label:'轮班方案'}).label,'轮班方案');
});


test('key event locator groups original significant events and selecting one only pauses and seeks',async t=>{
 const {keyEventGroup}=require('../replay-ui.js'),nodes=new Map(),container={innerHTML:'',querySelector(k){if(!nodes.has(k))nodes.set(k,{value:'',innerHTML:'',handlers:{},addEventListener(name,fn){this.handlers[name]=fn;}});return nodes.get(k);},querySelectorAll(){return [];},replaceChildren(){}};
 const events=[{timeSeconds:1,kind:'RESOURCE_OBSERVATION',details:{baseline:true}},{timeSeconds:5,kind:'CANCEL_REQUESTED',robotId:'LAB-01'},{timeSeconds:10,kind:'RUN_CLOSURE_OBSERVED',robotId:'LAB-01',details:{settled:true,confirmed:false}},{timeSeconds:15,kind:'EXPLICITLY_CONTINUED',eventNamespace:'scenario'},{timeSeconds:19,kind:'SIM_SESSION_CLOSED',robotId:'LAB-01',label:'仿真故障会话已结案，未成功到站'}];
 const view=mount(container,{loadReplay:async()=>({frames:[{timeSeconds:0,robotId:'LAB-01'},{timeSeconds:20,robotId:'LAB-01'}],events})});t.after(()=>view.destroy());await view.open({id:'key'});
 assert.match(container.innerHTML,/定位关键事件/);assert.match(container.innerHTML,/optgroup label="撤单与故障任务处理"/);assert.equal(keyEventGroup(events[0]),null);
 view.controller.playing=true;nodes.get('[data-replay-key-event]').handlers.change({target:{value:'2'}});assert.equal(view.controller.time,10);assert.equal(view.controller.playing,false);assert.equal(view.controller.data.events.length,5);
 assert.equal(keyEventGroup(events[4]),'停稳与任务收尾');assert.match(container.innerHTML,/19.0 秒 · 仿真故障会话已结案，未成功到站/);
 view.controller.playing=true;nodes.get('[data-replay-key-event]').handlers.change({target:{value:'4'}});assert.equal(view.controller.time,19);assert.equal(view.controller.playing,false);assert.equal(view.controller.data.events[4].kind,'SIM_SESSION_CLOSED');
});


test('a later scenario stop event holds sealed primary history without inventing a source outage or letting peers replace lifecycle',()=>{
 const a=frame(1,2,{completion:{settled:true,confirmed:true},robots:{'LAB-01':{robotId:'LAB-01',sourceId:'one',estimatedPose:{...point(2),fresh:false}},'LAB-02':{robotId:'LAB-02',sourceId:'two',estimatedPose:point(999)}}});
 const b=frame(2,3,{runId:'run-b',robotId:'LAB-02',completion:{settled:true,confirmed:false},robots:{'LAB-01':{robotId:'LAB-01',sourceId:'one',estimatedPose:point(999)},'LAB-02':{robotId:'LAB-02',sourceId:'two',estimatedPose:{...point(3),fresh:false}}}});
 const data=normalizePages([page([a]),{...page([b]),runId:'run-b',runIds:['run-b']}],{kind:'scenario',scenarioEvents:[{eventNamespace:'scenario',executionId:'exec',sequence:1,kind:'UNSUBMITTED_STEPS_STOPPED',recordedAt:'2026-11-09T00:00:20Z',sourceTime:null}]});
 const c=new Controller();c.load(data);c.seek(c.duration);const frames=c.snapshots();assert.equal(frames.length,2);assert.ok(frames.every(f=>f.sealedTail&&!f.displayGap));assert.equal(frames.find(f=>f.robotId==='LAB-01').estimatedPose.x,2);assert.equal(frames.find(f=>f.robotId==='LAB-02').estimatedPose.x,3);assert.equal(frames[0].estimatedPose.fresh,false);assert.match(mapHTML(c),/最后记录的历史估计位置/);
});
test('an active unsealed Run or an actual final UNKNOWN gap still stays unknown after a long orchestration tail',()=>{
 for(const final of [{completion:{settled:false},status:'TRUSTED',gap:false},{completion:{settled:true},status:'UNKNOWN',gap:true}]){
  const data=normalizePages([page([frame(1,0,final)],[{runId:'run-a',sequence:2,kind:'STOP',recordedAt:'2026-11-09T00:00:20Z',sourceTime:null}])]);const c=new Controller();c.load(data);c.seek(c.duration);assert.equal(c.snapshots()[0].sealedTail,false);assert.equal(c.snapshots()[0].displayGap,true);
 }
});


test('PM replay layout keeps task inventory collapsed and places map with events before technical evidence',async t=>{
 const nodes=new Map(),container={innerHTML:'',querySelector(k){if(!nodes.has(k))nodes.set(k,{value:'',innerHTML:'',addEventListener(){}});return nodes.get(k);},querySelectorAll(){return [];},replaceChildren(){}};
 const view=mount(container,{loadReplay:async()=>({label:'双车方案',frames:[],events:[],displaySteps:[{taskNumber:1,state:'SUCCEEDED',runRecorded:true,robotId:'LAB-01',destination:'A'},{taskNumber:2,state:'FAILED',runRecorded:true,robotId:'LAB-02',destination:'B'},{taskNumber:3,state:'SKIPPED',runRecorded:false,robotId:'LAB-01',destination:'C'}]})});t.after(()=>view.destroy());await view.open({id:'layout'});
 assert.match(container.innerHTML,/<details class="replay-task-details"><summary>任务 3 项 · 已运行 2 · 未执行 1/);assert.match(container.innerHTML,/<p class="replay-step-note">任务 3 未执行/);
 assert.match(container.innerHTML,/class="replay-stage"/);assert.ok(container.innerHTML.indexOf('data-replay-map')<container.innerHTML.indexOf('记录时间与来源完整性'));assert.match(container.innerHTML,/计划路线/);assert.match(container.innerHTML,/已分配路段/);assert.match(container.innerHTML,/定位轨迹/);assert.doesNotMatch(container.innerHTML,/不会发布、发单、撤单/);
});
