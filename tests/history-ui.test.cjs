const test=require('node:test');
const assert=require('node:assert/strict');
const {Controller,mount,normalizeFilters,localToISO,isoToLocal,itemHTML}=require('../src/pages/missions/history-ui.js');
const response=(items=[],extra={})=>({items,nextCursor:null,total:items.length,observedAt:'2026-11-10T10:00:00Z',scope:'deployment',coverage:['只含本部署保留的账本；缺失记录不补写。'],...extra});
const api=(request=async()=>response())=>({apiBase:'https://fleet.example/api/v1/',scope:'https://fleet.example/api/v1/#deployment=pair',deploymentId:'pair',deploymentConfirmed:true,key:'secret-key-must-not-persist',keyRevision:1,authorized:true,request});
const memory=()=>{const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {resolve,reject,promise};};

test('history uses GET-only queries and explicit filters; validation never sends a request',async()=>{
 const calls=[],client=api(async(...args)=>{calls.push(args);return response();}),c=new Controller(client,{visible:true,storage:null});
 await c.submit({q:' wafer ',robotId:'LAB-02',outcome:'ACCEPTED',since:'2026-11-10T01:00:00-05:00',until:'2026-11-10T07:00:00Z',limit:100});
 assert.equal(calls.length,1);assert.equal(calls[0].length,1);const params=new URL('https://fixture/'+calls[0][0]).searchParams;
 assert.equal(params.get('q'),'wafer');assert.equal(params.get('robotId'),'LAB-02');assert.equal(params.get('outcome'),'ACCEPTED');assert.equal(params.get('since'),'2026-11-10T06:00:00.000Z');assert.equal(params.get('limit'),'100');
 await c.submit({since:'2026-11-11T00:00:00Z',until:'2026-11-10T00:00:00Z'});assert.equal(calls.length,1);assert.match(c.state.error,/开始时间/);assert.deepEqual(c.state.items,[]);
 await c.submit({q:'run-a'});assert.equal(c.state.filters.robotId,'');assert.equal(c.state.filters.outcome,'');assert.equal(c.state.filters.limit,20);
 assert.ok(calls.every(args=>args.length===1 && args[0].startsWith('history/tasks?')));
});

test('out-of-order filter responses and errors cannot overwrite the current query',async()=>{
 const first=deferred(),second=deferred();let count=0;const c=new Controller(api(()=>++count===1?first.promise:second.promise),{visible:true,storage:null});
 const old=c.submit({q:'old'}),current=c.submit({q:'new'});second.resolve(response([{id:'new',label:'新任务'}]));await current;
 first.resolve(response([{id:'old',label:'旧任务'}]));await old;assert.equal(c.state.items[0].id,'new');assert.equal(c.state.filters.q,'new');
 const a=deferred(),b=deferred();count=0;c.api.request=()=>++count===1?a.promise:b.promise;
 const failed=c.submit({q:'older'}),good=c.submit({q:'latest'});b.resolve(response([{id:'latest'}]));await good;a.reject(Error('stale error'));await failed;assert.equal(c.state.items[0].id,'latest');assert.equal(c.state.error,null);
});

test('authorization loss clears data immediately and discards late replies including key changes',async()=>{
 let next=response([{id:'private'}]);const client=api(()=>Promise.resolve(next)),c=new Controller(client,{visible:true,storage:null});
 await c.query();assert.equal(c.state.items.length,1);const pending=deferred();client.request=()=>pending.promise;const waiting=c.query();
 client.authorized=false;c.authorizationChanged();assert.deepEqual(c.state.items,[]);assert.deepEqual(c.state.coverage,[]);assert.equal(c.state.authorized,false);assert.equal(c.state.total,null);
 pending.resolve(response([{id:'old-private'}]));await waiting;assert.deepEqual(c.state.items,[]);
 client.authorized=true;client.request=async()=>response([{id:'fresh'}]);c.authorizationChanged(false);await c.query();assert.equal(c.state.items[0].id,'fresh');
 client.key='another-key';client.keyRevision++;c.authorizationChanged(false);assert.deepEqual(c.state.items,[]);assert.equal(c.state.loaded,false);
});

test('scope changes isolate filter contexts and reject late responses even without an auth notification',async()=>{
 const store=memory(),pending=deferred();const client=api(()=>pending.promise),c=new Controller(client,{visible:true,storage:store});const old=c.submit({q:'pair-only'});
 client.scope='https://fleet.example/api/v1/#deployment=other';client.deploymentId='other';pending.resolve(response([{id:'pair-private'}]));await old;
 assert.equal(c.state.filters.q,'');assert.deepEqual(c.state.items,[]);assert.equal(c.state.loaded,false);
 client.request=async()=>response([{id:'other'}]);await c.submit({robotId:'OTHER-01'});
 client.scope='https://fleet.example/api/v1/#deployment=pair';client.deploymentId='pair';c.authorizationChanged(false);assert.equal(c.state.filters.q,'pair-only');assert.equal(c.state.filters.robotId,'');assert.deepEqual(c.state.items,[]);
 client.apiBase='https://different.example/api/v1/';client.scope=client.apiBase+'#deployment=pair';c.authorizationChanged(false);assert.equal(c.state.filters.q,'');assert.deepEqual(c.state.items,[]);
});

test('pagination and filters survive refresh scoped to target without storing keys or evidence',async()=>{
 const store=memory(),calls=[],client=api(async path=>{calls.push(path);return path.includes('cursor=')?response([{id:'raw-evidence-secret',details:{token:'raw-evidence-secret'}}],{total:21}):response([{id:'one'}],{nextCursor:'signed-cursor-page-2',total:21});});
 const c=new Controller(client,{visible:true,storage:store});await c.submit({robotId:'LAB-01',outcome:'FAILED'});await c.next();assert.equal(c.state.page,1);assert.match(calls.at(-1),/cursor=signed-cursor-page-2/);
 const persisted=Array.from(store.values.values()).join('');assert.doesNotMatch(persisted,/secret-key|raw-evidence|observedAt|items/);
 const refreshed=new Controller(client,{visible:true,storage:store});assert.equal(refreshed.state.filters.robotId,'LAB-01');assert.equal(refreshed.state.page,1);assert.deepEqual(refreshed.state.items,[]);await refreshed.query();assert.match(calls.at(-1),/cursor=signed-cursor-page-2/);
 await refreshed.previous();assert.equal(refreshed.state.page,0);assert.doesNotMatch(calls.at(-1),/cursor=/);
 await refreshed.next();await refreshed.submit({q:'different'});assert.equal(refreshed.state.page,0);assert.deepEqual(refreshed.state.cursors,[null]);assert.doesNotMatch(calls.at(-1),/cursor=/);
});

test('expired cursors fail visibly with no automatic retry; explicit query restarts at page one',async()=>{
 const calls=[],client=api(async path=>{calls.push(path);if(path.includes('cursor='))throw Object.assign(Error('历史分页已失效'),{status:400});return response([],{nextCursor:'expired',total:21});}),c=new Controller(client,{visible:true,storage:null});
 await c.submit({q:'retained'});await c.next();assert.equal(calls.length,2);assert.match(c.state.error,/查询记录.*第一页/);assert.equal(c.state.filters.q,'retained');assert.deepEqual(c.state.items,[]);
 await c.submit(c.state.filters);assert.equal(calls.length,3);assert.equal(c.state.page,0);assert.doesNotMatch(calls.at(-1),/cursor=/);
});

test('hidden and destroyed views never accept late query data and authorization is required',async()=>{
 const client=api(),pending=deferred();client.authorized=false;let calls=0;client.request=()=>{calls++;return pending.promise;};const c=new Controller(client,{visible:true,storage:null});await c.submit();assert.equal(calls,0);
 client.authorized=true;c.authorizationChanged(false);const query=c.query();c.setVisible(false);pending.resolve(response([{id:'hidden'}]));await query;assert.deepEqual(c.state.items,[]);
 const second=deferred();client.request=()=>second.promise;c.visible=true;const query2=c.query();c.destroy();second.resolve(response([{id:'destroyed'}]));await query2;assert.deepEqual(c.state.items,[]);
});

test('event filters and dates preserve semantic source gaps and escape original evidence',()=>{
 assert.equal(normalizeFilters({kind:'command',outcome:'FAILED'},'events').kind,'command');assert.equal(normalizeFilters({limit:500}).limit,20);
 const local='2026-11-10 08:30';assert.equal(localToISO(local),new Date(local).toISOString());assert.equal(isoToLocal(localToISO(local)),local);
 const html=itemHTML({label:'<script>bad</script>',kind:'run',recordedAt:'2026-11-10T10:00:00Z',at:'2026-11-10T09:00:00Z',sourceTime:null,runId:'run-a',summary:'等待通行',details:{unsafe:'<img onerror=x>'}},0,'events',{onReplay(){},onTask(){}});
 assert.match(html,/无来源时间/);assert.match(html,/记录时间/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<img|<script>/);assert.match(html,/<details class="history-evidence eng-only">/);assert.doesNotMatch(html,/<details[^>]*open/);assert.match(html,/复盘此任务/);assert.match(html,/查看关联任务/);
 const task=itemHTML({kind:'command',outcome:'ACCEPTED'},0,'tasks',{onReplay(){}});assert.match(task,/已受理/);assert.doesNotMatch(task,/data-history-replay/);
 const known=itemHTML({status:'EXECUTION_COMPLETED',vehicleName:'记录时的车名',robotId:'technical-id',destinationLabel:'记录时的终点',destination:'technical-station'},0,'events',{});const main=known.split('<details')[0];assert.match(main,/方案已完成/);assert.match(main,/记录时的车名 → 记录时的终点/);assert.doesNotMatch(main,/EXECUTION_COMPLETED|technical-id|technical-station/);
 assert.match(itemHTML({status:'NEW_INTERNAL_STATE'},0,'events',{}).split('<details')[0],/已记录/);
});

function fakeContainer(){
 const nodes=new Map();let html='',replacements=0;
 const container={hidden:false,get innerHTML(){return html;},set innerHTML(value){html=value;replacements++;},querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{value:'',textContent:'',innerHTML:'',disabled:false,handlers:{},addEventListener(name,fn){this.handlers[name]=fn;},setAttribute(){},contains(){return true;}});return nodes.get(selector);},replaceChildren(){html='';}};
 return {container,nodes,replacements:()=>replacements};
}

test('mount is hidden by default and reads only when its route becomes visible',async()=>{
 const fixture=fakeContainer();let calls=0;const view=mount(fixture.container,api(async()=>{calls++;return response();}),{storage:null});
 await new Promise(setImmediate);assert.equal(calls,0);assert.equal(fixture.container.hidden,true);
 view.authorizationChanged();assert.equal(calls,0);view.setVisible(true);await new Promise(setImmediate);assert.equal(calls,1);assert.equal(fixture.container.hidden,false);
 view.setVisible(false);view.setVisible(true);await new Promise(setImmediate);assert.equal(calls,1);view.destroy();
});

test('mount keeps form nodes and in-progress typing while querying; callbacks only open historical records',async()=>{
 const fixture=fakeContainer(),calls=[],pending=deferred(),replays=[],tasks=[];let first=true;const client=api(async(...args)=>{calls.push(args);return first?(first=false,response([{runId:'run-a',requestId:'req-a',sourceTime:null}])):pending.promise;});
 const view=mount(fixture.container,client,{kind:'events',visible:true,storage:null,onReplay:target=>replays.push(target),onTask:target=>tasks.push(target)});await new Promise(setImmediate);
 const input=fixture.nodes.get('[data-history-field="q"]'),count=fixture.replacements();input.value='still typing';
 const query=view.controller.query();pending.resolve(response([{runId:'run-a',requestId:'req-a',sourceTime:null}]));await query;
 assert.equal(input.value,'still typing');assert.equal(fixture.replacements(),count);assert.equal(calls.length,2);assert.ok(calls.every(args=>args.length===1));
 const click=fixture.nodes.get('[data-history-list]').handlers.click;
 click({target:{closest:()=>({dataset:{historyReplay:'0'}})}});assert.deepEqual(replays,[{kind:'run',id:'run-a'}]);
 click({target:{closest:()=>({dataset:{historyTask:'0'}})}});assert.equal(tasks[0].q,'run-a');
 client.authorized=false;view.authorizationChanged();click({target:{closest:()=>({dataset:{historyReplay:'0'}})}});assert.equal(replays.length,1);assert.deepEqual(view.controller.state.items,[]);
 assert.match(fixture.container.innerHTML,/查询/);assert.match(fixture.container.innerHTML,/全部车辆/);assert.doesNotMatch(fixture.container.innerHTML,/取消任务|重试|恢复任务|data-run-action/);view.destroy();
});

test('submitting an associated task while hidden clears the old page and queries the new filter on entry',async()=>{const calls=[];const c=new Controller(api(async path=>{calls.push(path);return response([{id:path.includes('new-run')?'new-run':'old'}]);}),{visible:true,storage:null});await c.submit();c.setVisible(false);await c.submit({q:'new-run'});assert.equal(c.state.loaded,false);assert.deepEqual(c.state.items,[]);c.setVisible(true);await new Promise(setImmediate);assert.equal(c.state.items[0].id,'new-run');assert.equal(calls.length,2);});


test('closed unsuccessful session is filterable and never labelled active or successful',()=>{
 assert.equal(normalizeFilters({outcome:'CLOSED'}).outcome,'CLOSED');
 const html=itemHTML({id:'run:closed',kind:'run',label:'历史任务',outcome:'CLOSED',state:'ACCEPTED'},0,'tasks',{});
 assert.match(html,/已结束，未到站/);assert.doesNotMatch(html,/进行中（历史记录）/);
});
