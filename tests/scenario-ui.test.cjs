const test=require('node:test');const assert=require('node:assert/strict');
const {Controller,mount,validateForm,blockerMessage}=require('../scenario-ui.js');
function harness(options={}){const values=options.values||new Map(),calls=[],executions=options.executions||new Map();let seq=0;const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const opts={enabled:true,targetId:'p0-pair',capabilities:['scenarios'],binding:{publicationId:'pub',releaseId:'release'},robots:[{robotId:'LAB-01'},{robotId:'LAB-02'}],destinations:[{id:'A'},{id:'B'}],limits:{maxSteps:8,maxDelaySeconds:60}};
 const api={key:'key',authorized:true,id:()=> 'id-'+(++seq),receiptSnapshot:()=>({scope:'pair-scope',canWrite:true}),async request(path,body,requestOptions){calls.push({path,body,requestOptions,persisted:[...values.values()]});if(path==='sim-scenarios/options')return opts;if(path==='sim-scenarios')return {scenarios:[],executions:[...executions.values()]};if(path.startsWith('sim-scenarios/executions/'))return {...{scenarioId:'scenario',scenarioRevision:1,snapshotHash:'snap',publicationId:'pub',releaseId:'release',releaseHash:'hash',mapId:'map',deploymentId:'dep'},...executions.get(path.split('/')[2])};if(path.endsWith('/executions')){const e={executionId:body.executionId,revision:1,state:'RUNNING',steps:[]};executions.set(e.executionId,e);if(options.lost)throw Error('lost response');return e;}if(!body&&path==='sim-scenarios/scenario')return {scenarioId:'scenario',revision:1,status:'FROZEN',snapshotHash:'snap',publicationId:'pub',releaseId:'release',releaseHash:'hash',mapId:'map',deploymentId:'dep',name:form.name,steps:form.steps};if(path.endsWith('/freeze'))return {scenarioId:'scenario',revision:1,status:'FROZEN'};return {scenarioId:'scenario',revision:1,status:'DRAFT',...body};}};
 const controller=new Controller(api,{storage,lock:fn=>fn()});return {controller,api,storage,values,calls,executions,opts};}
const form={name:'双车方案',steps:[{stepId:'one',robotId:'LAB-01',destination:'A',dependsOn:[],delaySeconds:0},{stepId:'two',robotId:'LAB-02',destination:'B',dependsOn:['one'],delaySeconds:2}]};
test('save and freeze use explicit revision while refresh never dispatches tasks',async()=>{const h=harness();await h.controller.refresh();assert.ok(h.calls.every(c=>!c.body));await h.controller.save(form);const put=h.calls.find(c=>c.requestOptions);assert.equal(put.requestOptions.method,'PUT');assert.equal(put.body.expectedRevision,0);await h.controller.freeze();assert.equal(h.controller.state.scene.status,'FROZEN');assert.ok(!h.calls.some(c=>c.path==='commands'||c.path==='sim-runs'));});
test('start durably saves execution identity before POST and reload restores an uncertain start with GET only',async()=>{const h=harness({lost:true});h.controller.state.scene={scenarioId:'scenario',revision:1,status:'FROZEN'};await assert.rejects(h.controller.start(),/lost/);const post=h.calls[0];assert.ok(post.persisted[0].includes(post.body.executionId));assert.throws(()=>h.controller.newScene(),/尚未收尾/);const restored=harness({values:h.values,executions:h.executions});await restored.controller.refresh();assert.equal(restored.controller.state.execution.executionId,post.body.executionId);assert.ok(restored.calls.every(c=>!c.body));await assert.rejects(restored.controller.start());assert.ok(restored.calls.every(c=>!c.body));});
test('another tab stored execution prevents a fresh start even with a stale local state',async()=>{const h=harness();h.controller.state.scene={scenarioId:'scenario',revision:1,status:'FROZEN'};h.values.set(h.controller.key,JSON.stringify({scope:'pair-scope',executionId:'existing'}));h.executions.set('existing',{executionId:'existing',state:'RUNNING'});await assert.rejects(h.controller.start(),/只恢复查询/);assert.ok(h.calls.every(c=>!c.body));});
test('task validation rejects cycles implicit same-car loops unknown destinations and incomplete pair',()=>{const h=harness();assert.doesNotThrow(()=>validateForm(form,h.opts));assert.throws(()=>validateForm({...form,steps:[form.steps[0]]},h.opts));assert.throws(()=>validateForm({...form,steps:[{...form.steps[0],dependsOn:['two']},form.steps[1]]},h.opts),/循环/);assert.throws(()=>validateForm({...form,steps:[{...form.steps[0],destination:'not-real'},form.steps[1]]},h.opts),/目的站/);});
test('blocked execution reasons are plain operating guidance rather than raw codes',()=>{assert.match(blockerMessage(['STEP_UNKNOWN']),/结果待核对/);assert.match(blockerMessage(['GATEWAY_RESTART_REVIEW_REQUIRED']),/服务重启/);assert.doesNotMatch(blockerMessage(['SCENARIO_ADMISSION']),/SCENARIO_ADMISSION/);});


test('failed or unknown steps cannot continue and stopped active work must still be reconciled',async()=>{
 const h=harness();h.controller.state.execution={executionId:'e',revision:3,state:'PAUSED_REVIEW',steps:[{state:'FAILED'}]};
 await assert.rejects(h.controller.continueExecution(),/任务失败/);assert.equal(h.calls.length,0);
 h.controller.state.pending={executionId:'e'};h.controller.state.execution={executionId:'e',state:'STOPPED',steps:[{state:'SUBMITTED'}]};assert.throws(()=>h.controller.newScene(),/尚未收尾/);
 h.controller.state.execution.steps[0].state='FAILED';assert.doesNotThrow(()=>h.controller.newScene());
});
test('only freshly confirmed durable rejection permits an explicit return without losing server history',async()=>{
 const h=harness();h.controller.state.pending={scope:'pair-scope',executionId:'rejected'};h.values.set(h.controller.key,JSON.stringify(h.controller.state.pending));
 h.executions.set('rejected',{executionId:'rejected',scenarioId:'scenario',state:'REJECTED',steps:[]});h.controller.state.execution=h.executions.get('rejected');
 await h.controller.returnRejected();assert.equal(h.controller.state.pending,null);assert.equal(h.controller.state.execution,null);assert.ok(h.controller.state.executions.some(e=>e.executionId==='rejected'));assert.equal(h.controller.state.scene.scenarioId,'scenario');assert.ok(h.executions.has('rejected'));assert.ok(h.calls.every(c=>!c.body));
 h.controller.state.execution={executionId:'unknown',state:'UNKNOWN'};await assert.rejects(h.controller.returnRejected(),/未知结果/);
});


test('historical replay suspension skips scenario background reads and resumes only after leaving replay',async t=>{
 const h=harness(),nodes=new Map(),container={innerHTML:'',querySelector(k){if(!nodes.has(k))nodes.set(k,{dataset:{},addEventListener(){}});return nodes.get(k);},querySelectorAll(){return [];},replaceChildren(){}};
 const original=global.setInterval;let tick;global.setInterval=fn=>(tick=fn,0);
 const view=mount(container,h.api,{storage:h.storage,lock:fn=>fn()});global.setInterval=original;t.after(()=>view.destroy());
 h.executions.set('active',{executionId:'active',state:'RUNNING',steps:[]});view.controller.state.execution=h.executions.get('active');
 view.setReadPaused(true);tick();assert.equal(h.calls.length,0);
 view.setReadPaused(false);tick();await view.controller.reading;assert.ok(h.calls.length>=1);assert.ok(h.calls.every(c=>c.body===undefined));
});


test('reload and history selection restore the bound immutable plan rather than an editable empty form',async()=>{
 const h=harness();h.values.set(h.controller.key,JSON.stringify({scope:'pair-scope',executionId:'restored',scenarioId:'scenario'}));
 h.executions.set('restored',{executionId:'restored',state:'RUNNING',steps:[{runId:'old-run',state:'SUBMITTED'}]});
 const fresh=new Controller(h.api,{storage:h.storage,lock:fn=>fn()});await fresh.refresh();
 assert.equal(fresh.state.scene.status,'FROZEN');assert.equal(fresh.state.scene.snapshotHash,'snap');assert.equal(fresh.state.scene.steps.length,2);assert.equal(fresh.state.scene.steps[1].destination,'B');
 assert.ok(h.calls.every(c=>!c.body));
 const request=h.api.request.bind(h.api);h.api.request=async(path,...args)=>{const value=await request(path,...args);return path==='sim-scenarios/scenario'?{...value,snapshotHash:'wrong'}:value;};fresh.state.scene=null;
 await assert.rejects(fresh.queryExecution('restored'),/版本不一致/);assert.equal(fresh.state.scene,null);
});


test('number input is retained before blur when adding a task and controls use portal styling',async t=>{
 const h=harness();let html='',nodes=[];
 const parse=markup=>[...markup.matchAll(/<(input|select|button)\b([^>]*)>/g)].map(match=>{const attrs=Object.fromEntries([...match[2].matchAll(/([a-z-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]]));const dataset=Object.fromEntries(Object.entries(attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v]));return {tagName:match[1].toUpperCase(),attrs,dataset,value:attrs.value||'',className:attrs.class||'',handlers:{},addEventListener(name,fn){this.handlers[name]=fn;}};});
 const matches=(node,selector)=>[...selector.matchAll(/\[([a-z-]+)(?:="([^"]*)")?\]/g)].every(m=>node.attrs[m[1]]!==undefined&&(m[2]===undefined||node.attrs[m[1]]===m[2]));
 const container={get innerHTML(){return html;},set innerHTML(v){html=v;nodes=parse(v);},querySelector(selector){return selector.startsWith('[')?nodes.find(n=>matches(n,selector))||null:null;},querySelectorAll(selector){return selector.startsWith('[')?nodes.filter(n=>matches(n,selector)):[];},replaceChildren(){}};
 const view=mount(container,h.api,{storage:h.storage,lock:fn=>fn()});t.after(()=>view.destroy());await view.controller.refresh();
 const delay=container.querySelector('[data-scene-step="1"][data-field="delaySeconds"]');assert.equal(typeof delay.handlers.input,'function');
 delay.handlers.input({target:{value:'10'}});container.querySelector('[data-scene-action="add"]').handlers.click();
 assert.equal(container.querySelector('[data-scene-step="1"][data-field="delaySeconds"]').value,'10');
 assert.ok(nodes.filter(n=>n.tagName==='BUTTON').every(n=>n.className.split(' ').includes('button')));
 assert.match(html,/class="scenario-dependency"/);assert.match(html,/任务 1 完成后/);
 assert.equal(nodes.filter(n=>n.className.includes('button-primary')).length,1);
 const css=require('node:fs').readFileSync(require.resolve('../styles.css'),'utf8');assert.match(css,/#scenarioView \.scenario-dependency\{display:flex/);assert.match(css,/width:16px;height:16px/);
});


test('preallocated Run IDs do not expose task handling or replay until the server confirms a recorded Run',t=>{
 const h=harness(),nodes=new Map(),container={innerHTML:'',querySelector(k){if(!nodes.has(k))nodes.set(k,{dataset:{},addEventListener(){}});return nodes.get(k);},querySelectorAll(){return [];},replaceChildren(){}};
 const view=mount(container,h.api,{storage:h.storage,lock:fn=>fn()});t.after(()=>view.destroy());view.controller.state.options=h.opts;
 view.controller.state.execution={executionId:'e',state:'RUNNING',steps:[{stepId:'a',robotId:'LAB-01',destination:'A',runId:'actual',runRecorded:true,state:'SUBMITTED'},{stepId:'b',robotId:'LAB-02',destination:'B',runId:'reserved-only',runRecorded:false,state:'NOT_SUBMITTED'},{stepId:'c',robotId:'LAB-01',destination:'A',runId:'unconfirmed-post-response',state:'SUBMITTED'}]};view.render();
 assert.match(container.innerHTML,/data-scene-run="actual"/);assert.match(container.innerHTML,/尚未开始，无运行记录/);assert.ok(!container.innerHTML.includes('data-scene-run="reserved-only"'));assert.ok(!container.innerHTML.includes('data-run-replay="reserved-only"'));assert.ok(!container.innerHTML.includes('data-scene-run="unconfirmed-post-response"'));
 view.controller.state.execution.steps[2].runRecorded=true;view.render();assert.match(container.innerHTML,/data-scene-run="unconfirmed-post-response"/);
});


test('mutation responses hydrate recorded task metadata once and synchronize the same execution history status',async()=>{
 const h=harness();const meta={scenarioId:'scenario',scenarioRevision:1,snapshotHash:'snap',publicationId:'pub',releaseId:'release',releaseHash:'hash',mapId:'map',deploymentId:'dep'};
 const before={...meta,executionId:'current',revision:2,state:'PAUSED_REVIEW',steps:[{stepId:'a',runId:'original-run',state:'SUCCEEDED',runRecorded:true}]};h.controller.state.execution=before;h.controller.state.executions=[before];h.controller.state.scene={...meta,revision:1,status:'FROZEN'};
 const request=h.api.request.bind(h.api);let reads=0,posts=0;
 h.api.request=async(path,body,opts)=>{if(path.endsWith('/stop')&&body){posts++;return {...before,revision:3,state:'STOPPED',steps:[{stepId:'a',runId:'original-run',state:'SUCCEEDED'}]};}if(path==='sim-scenarios/executions/current'){reads++;assert.equal(h.controller.state.execution.steps[0].runRecorded,true);return {...before,revision:3,state:'STOPPED'};}return request(path,body,opts);};
 await h.controller.stopExecution();assert.equal(posts,1);assert.equal(reads,1);assert.equal(h.controller.state.execution.state,'STOPPED');assert.equal(h.controller.state.execution.steps[0].runRecorded,true);assert.equal(h.controller.state.executions.find(e=>e.executionId==='current').state,'STOPPED');
});


test('a successful store-only read clears only stale read errors and preserves a write-unknown warning',async()=>{
 const h=harness();await h.controller.readAct(async()=>{throw Error('temporary read disconnect');});assert.match(h.controller.state.error,/读取未完成/);
 await h.controller.readAct(()=>h.controller.refresh());assert.equal(h.controller.state.error,'');assert.equal(h.controller.state.readError,'');
 await assert.rejects(h.controller.act(async()=>{throw Error('write response uncertain');}));const warning=h.controller.state.writeError;
 await h.controller.readAct(async()=>{throw Error('temporary read disconnect');});await h.controller.readAct(()=>h.controller.refresh());
 assert.equal(h.controller.state.readError,'');assert.equal(h.controller.state.writeError,warning);assert.equal(h.controller.state.error,warning);assert.match(h.controller.state.errorDetail,/write response uncertain/);
});
test('failed metadata hydration after a confirmed mutation is a read error and never retries that mutation',async()=>{
 const h=harness(),original=h.api.request.bind(h.api);let posts=0;
 h.controller.state.execution={executionId:'known',revision:2,state:'PAUSED_REVIEW',steps:[]};
 h.api.request=async(path,body,...args)=>{if(path.endsWith('/stop')){posts++;return {executionId:'known',revision:3,state:'STOPPED',steps:[]};}if(path==='sim-scenarios/executions/known')throw Error('read temporarily unavailable');return original(path,body,...args);};
 await h.controller.act(()=>h.controller.stopExecution());assert.equal(posts,1);assert.equal(h.controller.state.execution.state,'STOPPED');assert.match(h.controller.state.readError,/读取未完成/);assert.ok(!h.controller.state.writeError);
});
test('historical task origin uses original recorded start only and never follows a newer world position',()=>{
 const {taskOrigin}=require('../scenario-ui.js'),step={runId:'old-run',startPoint:'R-EXIT'};
 const run={runId:'old-run',observation:{status:'TRUSTED',vehicle:{currentPosition:'L-STAGE'}}};
 assert.equal(taskOrigin(step,run),'R-EXIT');run.observation.status='UNKNOWN';run.observation.vehicle.currentPosition=null;
 assert.equal(taskOrigin(step,run),'R-EXIT');
 assert.equal(taskOrigin({runId:'old-run'},{...run,startPoint:'R-EXIT'}),'R-EXIT');
 assert.equal(taskOrigin({runId:'old-run'},run),'起点未记录');
 assert.equal(taskOrigin({runId:'old-run'},{...run,runId:'new-run',startPoint:'L-STAGE'}),'起点未记录');
});

test('update guard permits retained terminal scenario history but not another identity or unfinished control',()=>{
 const h=harness(),s=h.controller.state;s.pending={executionId:'original'};
 for(const state of ['COMPLETED','STOPPED','REJECTED','FAILED','CANCELLED']){
  s.execution={executionId:'original',state,steps:[]};assert.equal(h.controller.updateBlocker(),'');
 }
 s.execution={executionId:'different',state:'COMPLETED'};assert.match(h.controller.updateBlocker(),/刷新方案与运行/);
 s.execution={executionId:'original',state:'STOPPED',steps:[{state:'FAILED',controlPending:'TERMINAL_AWAITING_PHYSICAL_CLOSURE'}]};
 assert.match(h.controller.updateBlocker(),/原方案/);
 s.execution={executionId:'original',state:'COMPLETED',steps:[]};s.busy=true;s.operationKind='read';assert.equal(h.controller.updateBlocker(),'');
 s.operationKind='mutation';assert.match(h.controller.updateBlocker(),/正在处理/);
});

function mountedForm(t,options={}){
 const h=harness(options);let html='',nodes=[];
 const parse=markup=>[...markup.matchAll(/<(input|select|button|section|p)\b([^>]*)>/g)].map(match=>{
  const attrs=Object.fromEntries([...match[2].matchAll(/([a-z-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]]));
  for(const attr of match[2].matchAll(/\b(data-[a-z-]+)(?=\s|$|=)/g))if(attrs[attr[1]]===undefined)attrs[attr[1]]='';
  const dataset=Object.fromEntries(Object.entries(attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v]));
  return {tagName:match[1].toUpperCase(),attrs,dataset,value:attrs.value||'',checked:false,hidden:/(?:^|\s)hidden(?:\s|$)/.test(match[2]),disabled:/(?:^|\s)disabled(?:\s|$)/.test(match[2]),className:attrs.class||'',handlers:{},addEventListener(name,fn){this.handlers[name]=fn;}};
 });
 const matches=(node,selector)=>[...selector.matchAll(/\[([a-z-]+)(?:="([^"]*)")?\]/g)].every(m=>node.attrs[m[1]]!==undefined&&(m[2]===undefined||node.attrs[m[1]]===m[2]));
 const container={get innerHTML(){return html;},set innerHTML(value){html=value;nodes=parse(value);},contains:node=>nodes.includes(node),querySelector:selector=>selector.startsWith('[')?nodes.find(n=>matches(n,selector))||null:null,querySelectorAll:selector=>selector.startsWith('[')?nodes.filter(n=>matches(n,selector)):[],replaceChildren(){}};
 const view=mount(container,h.api,{storage:h.storage,lock:fn=>fn()});t.after(()=>view.destroy());
 const settle=async()=>{await new Promise(setImmediate);await new Promise(setImmediate);};
 const event=async(selector,type,value,checked)=>{const node=container.querySelector(selector);assert(node,'mounted control '+selector);if(checked!==undefined)node.checked=checked;if(value!==undefined)node.value=value;node.handlers[type]({target:node});await settle();};
 return {...h,view,container,event,settle,controller:view.controller};
}
test('real mount default and automatic rows are clean for updates while unsaved plan cannot freeze',async t=>{
 const h=mountedForm(t);assert.equal(h.view.updateBlocker(),'');
 h.view.authorizationChanged();await h.settle();assert.equal(h.view.updateBlocker(),'');
 assert.equal(h.container.querySelectorAll('[data-scene-step][data-field="robotId"]').length,2);
 assert.equal(h.container.querySelector('[data-scene-action="freeze"]').disabled,true);
 await h.event('[data-scene-action="new"]','click');assert.equal(h.view.updateBlocker(),'');
 assert(h.calls.every(call=>call.body===undefined));
});
test('mounted input change dependency and add events protect actual edits and reverting restores cleanliness',async t=>{
 const h=mountedForm(t);await h.controller.refresh();
 for(const [selector,type,changed,original] of [
  ['[data-scene-name]','input','临时安排','固定双车导航场景'],
  ['[data-scene-step="0"][data-field="destination"]','change','A',''],
  ['[data-scene-step="0"][data-field="delaySeconds"]','input','5','0']
 ]){
  await h.event(selector,type,changed);assert.match(h.view.updateBlocker(),/未保存修改/);
  await h.event(selector,type,original);assert.equal(h.view.updateBlocker(),'');
 }
 const dependency='[data-scene-dependency="1"]';
 await h.event(dependency,'change',undefined,true);assert.match(h.view.updateBlocker(),/未保存修改/);
 await h.event(dependency,'change',undefined,false);assert.equal(h.view.updateBlocker(),'');
 await h.event('[data-scene-action="add"]','click');assert.match(h.view.updateBlocker(),/未保存修改/);
 await h.event('[data-scene-action="refresh"]','click');assert.match(h.view.updateBlocker(),/未保存修改/);
 await h.event('[data-scene-action="new"]','click');assert.match(h.view.updateBlocker(),/未保存修改/);
 assert.equal(h.container.querySelectorAll('[data-scene-step][data-field="robotId"]').length,3);
 assert(h.calls.every(call=>call.body===undefined));
});
test('name edited before options arrival survives automatic defaults and can be reverted',async t=>{
 const h=mountedForm(t);await h.event('[data-scene-name]','input','提前输入');
 await h.controller.refresh();assert.match(h.view.updateBlocker(),/未保存修改/);
 assert.equal(h.container.querySelector('[data-scene-name]').value,'提前输入');
 assert.equal(h.container.querySelectorAll('[data-scene-step][data-field="robotId"]').length,2);
 await h.event('[data-scene-name]','input','固定双车导航场景');assert.equal(h.view.updateBlocker(),'');
});
test('pending execution disables an unbound default form until its original saved plan is restored',async t=>{
 const values=new Map([['fleet-scenario.v1:pair-scope',JSON.stringify({scope:'pair-scope',executionId:'saved-run'})]]);
 const executions=new Map([['saved-run',{executionId:'saved-run',state:'COMPLETED',steps:[]}]]);
 const h=mountedForm(t,{values,executions});assert.equal(h.container.querySelector('[data-scene-name]').disabled,true);
 assert.equal(h.container.querySelector('[data-scene-action="add"]').disabled,true);assert.match(h.container.innerHTML,/读入其保存内容前不能编辑/);
 await h.controller.refresh();assert.equal(h.container.querySelector('[data-scene-name]').value,form.name);
 assert.equal(h.view.updateBlocker(),'');assert.equal(h.controller.state.pending.executionId,'saved-run');
 assert(h.calls.every(call=>call.body===undefined));
});
test('explicit saved selection establishes baseline and dirty selection is rejected without losing edits',async t=>{
 const h=mountedForm(t);await h.controller.refresh();h.controller.state.scenarios=[{scenarioId:'scenario',name:'已保存'}];h.view.render();
 await h.event('[data-scene-select="scenario"]','click');assert.equal(h.view.updateBlocker(),'');
 assert.equal(h.container.querySelector('[data-scene-name]').value,form.name);
 // Simulate the same input handler on an editable stored draft.
 h.controller.state.scene.status='DRAFT';h.view.render();await h.event('[data-scene-name]','input','保留修改');
 const count=h.calls.length;await h.event('[data-scene-select="scenario"]','click');
 assert.match(h.view.updateBlocker(),/未保存修改/);assert.equal(h.container.querySelector('[data-scene-name]').value,'保留修改');assert.equal(h.calls.length,count);
});
test('save failure preserves edits; confirmed PUT establishes baseline even when follow-up GET fails',async t=>{
 const h=mountedForm(t);await h.controller.refresh();
 await h.event('[data-scene-step="0"][data-field="destination"]','change','A');await h.event('[data-scene-step="1"][data-field="destination"]','change','B');
 const original=h.api.request;let failWrite=true,putConfirmed=false;
 h.api.request=async(path,body,options)=>{
  if(options?.method==='PUT'){if(failWrite)throw Error('lost write');const value=await original(path,body,options);putConfirmed=true;return value;}
  if(putConfirmed&&path==='sim-scenarios/options')throw Error('read unavailable');
  return original(path,body,options);
 };
 await h.event('[data-scene-action="save"]','click');assert.match(h.view.updateBlocker(),/未保存修改/);
 failWrite=false;await h.event('[data-scene-action="save"]','click');assert.equal(h.view.updateBlocker(),'');
 assert.match(h.container.innerHTML,/read unavailable/);assert.equal(h.calls.filter(call=>call.requestOptions?.method==='PUT').length,1);
});

test('mounted discard is absent for default contents, appears on real input, and cancel preserves the draft',async t=>{
 const h=mountedForm(t);await h.controller.refresh();
 assert.equal(h.container.querySelector('[data-scene-action="discard-review"]').hidden,true);
 const count=h.calls.length;await h.event('[data-scene-name]','input','未保存输入');
 assert.equal(h.container.querySelector('[data-scene-action="discard-review"]').hidden,false);
 await h.event('[data-scene-action="discard-review"]','click');assert.match(h.container.innerHTML,/恢复默认新方案内容/);
 await h.event('[data-scene-action="discard-cancel"]','click');assert.equal(h.container.querySelector('[data-scene-name]').value,'未保存输入');assert.match(h.view.updateBlocker(),/未保存/);
 await h.event('[data-scene-action="discard-review"]','click');await h.event('[data-scene-action="discard-confirm"]','click');
 assert.equal(h.container.querySelector('[data-scene-name]').value,'固定双车导航场景');assert.equal(h.view.updateBlocker(),'');
 assert.equal(h.container.querySelector('[data-scene-action="freeze"]').disabled,true);assert.equal(h.calls.length,count);
});
test('discard restores a deep copy of saved contents without touching original execution or persistent handles',async t=>{
 const h=mountedForm(t);await h.controller.refresh();
 h.controller.state.scene={scenarioId:'saved',revision:4,status:'DRAFT',name:'原保存方案',steps:form.steps.map(step=>({...step,dependsOn:[...step.dependsOn]}))};h.view.render();
 h.controller.state.pending={scope:'pair-scope',executionId:'original-execution'};h.controller.state.execution={executionId:'original-execution',state:'COMPLETED',steps:[]};
 h.values.set(h.controller.key,JSON.stringify(h.controller.state.pending));const savedIndex=h.values.get(h.controller.key),count=h.calls.length;
 await h.event('[data-scene-name]','input','临时修改');await h.event('[data-scene-action="add"]','click');
 await h.event('[data-scene-action="discard-review"]','click');assert.match(h.container.innerHTML,/最近确认的已保存方案内容/);
 await h.event('[data-scene-action="discard-confirm"]','click');
 assert.equal(h.container.querySelector('[data-scene-name]').value,'原保存方案');assert.equal(h.container.querySelectorAll('[data-scene-step][data-field="robotId"]').length,2);
 assert.equal(h.view.updateBlocker(),'');assert.equal(h.controller.state.pending.executionId,'original-execution');assert.equal(h.values.get(h.controller.key),savedIndex);assert.equal(h.calls.length,count);
 await h.event('[data-scene-step="0"][data-field="destination"]','change','B');assert.equal(h.controller.state.scene.steps[0].destination,'A');
 await h.event('[data-scene-action="discard-review"]','click');await h.event('[data-scene-action="discard-confirm"]','click');assert.equal(h.view.updateBlocker(),'');
});
test('editing after discard review invalidates its old confirmation and preserves the newer input',async t=>{
 const h=mountedForm(t);await h.controller.refresh();await h.event('[data-scene-name]','input','第一次修改');
 await h.event('[data-scene-action="discard-review"]','click');const oldConfirm=h.container.querySelector('[data-scene-action="discard-confirm"]').handlers.click;
 await h.event('[data-scene-name]','input','第二次修改');const count=h.calls.length;oldConfirm();await h.settle();
 assert.equal(h.container.querySelector('[data-scene-name]').value,'第二次修改');assert.match(h.view.updateBlocker(),/未保存/);
 assert.match(h.container.innerHTML,/原放弃审阅已失效/);assert.equal(h.calls.length,count);
});
test('late actual scene identity or scope changes invalidate discard even when local form binding has not changed',async t=>{
 for(const change of ['scene','scope']){
  const h=mountedForm(t);await h.controller.refresh();await h.event('[data-scene-name]','input','保留输入');
  await h.event('[data-scene-action="discard-review"]','click');const oldConfirm=h.container.querySelector('[data-scene-action="discard-confirm"]').handlers.click;
  if(change==='scene')h.controller.state.scene={scenarioId:'late',revision:2,status:'DRAFT',name:'晚到读取',steps:form.steps};else h.api.scope='another-deployment';
  const count=h.calls.length;oldConfirm();await h.settle();
  assert.equal(h.container.querySelector('[data-scene-name]').value,'保留输入');assert.match(h.view.updateBlocker(),/未保存/);assert.match(h.container.innerHTML,/原放弃审阅已失效/);assert.equal(h.calls.length,count);
 }
});
test('same-identity read refresh keeps discard review while a busy business operation cannot confirm it',async t=>{
 const h=mountedForm(t);await h.controller.refresh();await h.event('[data-scene-name]','input','待放弃');
 await h.event('[data-scene-action="discard-review"]','click');await h.controller.refresh();
 assert(h.container.querySelector('[data-scene-action="discard-confirm"]'));
 h.controller.state.busy=true;const oldConfirm=h.container.querySelector('[data-scene-action="discard-confirm"]').handlers.click;oldConfirm();await h.settle();
 assert.equal(h.container.querySelector('[data-scene-name]').value,'待放弃');
 h.controller.state.busy=false;oldConfirm();await h.settle();assert.equal(h.view.updateBlocker(),'');
});
test('confirmed save changes the baseline and an old discard confirmation cannot undo the saved content',async t=>{
 const h=mountedForm(t);await h.controller.refresh();
 await h.event('[data-scene-name]','input','已确认保存内容');await h.event('[data-scene-step="0"][data-field="destination"]','change','A');await h.event('[data-scene-step="1"][data-field="destination"]','change','B');
 await h.event('[data-scene-action="discard-review"]','click');const oldConfirm=h.container.querySelector('[data-scene-action="discard-confirm"]').handlers.click;
 await h.event('[data-scene-action="save"]','click');assert.equal(h.view.updateBlocker(),'');
 const count=h.calls.length;oldConfirm();await h.settle();
 assert.equal(h.container.querySelector('[data-scene-name]').value,'已确认保存内容');assert.equal(h.controller.state.scene.name,'已确认保存内容');assert.equal(h.view.updateBlocker(),'');assert.equal(h.calls.length,count);
 assert.equal(h.calls.filter(call=>call.requestOptions?.method==='PUT').length,1);
});
test('late identity response visibly withdraws discard review while preserving a focused input',async t=>{
 const h=mountedForm(t);await h.controller.refresh();await h.event('[data-scene-name]','input','聚焦中的未保存内容');
 await h.event('[data-scene-action="discard-review"]','click');
 const input=h.container.querySelector('[data-scene-name]'),oldDocument=global.document;
 global.document={activeElement:input};t.after(()=>{global.document=oldDocument;});
 h.controller.state.scene={scenarioId:'late-saved',revision:3,status:'DRAFT',name:'晚到读取',steps:form.steps};h.controller.emit();
 assert.equal(h.container.querySelector('[data-scene-name]'),input);assert.equal(input.value,'聚焦中的未保存内容');
 assert.equal(h.container.querySelector('[data-scene-discard-panel]').hidden,true);
 const notice=h.container.querySelector('[data-scene-discard-notice]');assert.equal(notice.hidden,false);assert.match(notice.textContent,/原放弃审阅已失效/);
 assert.match(h.view.updateBlocker(),/未保存/);
});
test('a drawn scene scenario may give tasks to only some of its robots',()=>{
 const opts={robots:[{robotId:'a'},{robotId:'b'},{robotId:'c'}],destinations:[{id:'S-1'}],limits:{maxSteps:8,maxDelaySeconds:60},binding:{profileId:'scene-routes-pair-v1'}};
 const one={name:'单车',steps:[{stepId:'one',robotId:'c',destination:'S-1',dependsOn:[],delaySeconds:0}]};
 assert.doesNotThrow(()=>validateForm(one,opts));
 assert.throws(()=>validateForm({...one,steps:[]},opts),/至少一个任务/);
 assert.throws(()=>validateForm(one,{...opts,binding:{profileId:'empty-crossing-pair-v1'}}),/两车/);
});
